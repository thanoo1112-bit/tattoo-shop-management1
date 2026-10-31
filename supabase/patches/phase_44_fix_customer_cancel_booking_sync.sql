-- ============================================================================
-- 157 TATTOO — PHASE 44 MIGRATION
-- FIX CUSTOMER CANCEL REQUEST SYNC BETWEEN ESTIMATE & LINKED BOOKINGS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper / RPC: public.customer_cancel_request
-- Cancel estimate_request or booking owned by authenticated customer in same transaction.
-- Strict Lifecycle Guards:
--   - If standalone estimate request (v_booking_id IS NULL): STRICTLY ONLY ALLOW status = 'PENDING'.
--   - If linked booking exists (v_booking_id IS NOT NULL): STRICTLY ONLY ALLOW booking status = 'WAITING_DEPOSIT', estimate status IN ('PENDING', 'ACCEPTED'), ZERO payment submissions (any status), and ZERO IN_PROGRESS/COMPLETED sessions.
--   - Disallowed statuses raise clear Thai exception messages BEFORE any UPDATE or trigger invocation.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_cancel_request(
  p_target_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_user_id UUID;
  v_target_owner_id UUID;
  v_est_id UUID;
  v_booking_id UUID;
  v_est_status TEXT;
  v_book_status TEXT;
  v_has_slip BOOLEAN := false;
  v_has_active_or_completed_session BOOLEAN := false;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_target_id IS NULL THEN
    RAISE EXCEPTION 'p_target_id is required' USING ERRCODE = '22004';
  END IF;

  -- 1. Lock estimate_request if p_target_id matches estimate_requests.id
  SELECT id, status, customer_user_id
  INTO v_est_id, v_est_status, v_target_owner_id
  FROM public.estimate_requests
  WHERE id = p_target_id FOR UPDATE;

  IF v_est_id IS NOT NULL THEN
    IF v_target_owner_id IS NULL OR v_target_owner_id != v_customer_user_id THEN
      RAISE EXCEPTION 'คุณไม่มีสิทธิ์ยกเลิกคำขอนี้' USING ERRCODE = '42501';
    END IF;

    -- Look for associated active booking
    SELECT id, status INTO v_booking_id, v_book_status
    FROM public.bookings
    WHERE estimate_request_id = v_est_id
      AND status NOT IN ('CANCELLED', 'REJECTED')
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  ELSE
    -- p_target_id matches bookings.id
    SELECT id, estimate_request_id, status, customer_user_id
    INTO v_booking_id, v_est_id, v_book_status, v_target_owner_id
    FROM public.bookings
    WHERE id = p_target_id FOR UPDATE;

    IF v_booking_id IS NULL THEN
      RAISE EXCEPTION 'ไม่พบรายการที่ต้องการยกเลิก' USING ERRCODE = 'P0002';
    END IF;

    IF v_target_owner_id IS NULL OR v_target_owner_id != v_customer_user_id THEN
      RAISE EXCEPTION 'คุณไม่มีสิทธิ์ยกเลิกคำขอนี้' USING ERRCODE = '42501';
    END IF;

    IF v_est_id IS NOT NULL THEN
      SELECT status INTO v_est_status
      FROM public.estimate_requests
      WHERE id = v_est_id FOR UPDATE;
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- 2. Strict Lifecycle & Pre-Check Guard
  -- MUST block disallowed statuses BEFORE any UPDATE or trigger invocation.
  -- --------------------------------------------------------------------------

  -- Case A: Linked Booking exists
  IF v_booking_id IS NOT NULL THEN
    -- STRICTLY ONLY ALLOW v_book_status = 'WAITING_DEPOSIT' (Prohibit CANCELLED, CONFIRMED, IN_PROGRESS, COMPLETED, REJECTED)
    IF v_book_status IS NULL OR v_book_status != 'WAITING_DEPOSIT' THEN
      RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
    END IF;

    -- Guard: Ensure estimate request is in allowable status (PENDING or ACCEPTED)
    IF v_est_status NOT IN ('PENDING', 'ACCEPTED') THEN
      RAISE EXCEPTION
        'คำขอนี้มีการดำเนินการแล้ว หรือถูกยกเลิกไปแล้ว กรุณาติดต่อร้าน'
        USING ERRCODE = '22000';
    END IF;

    -- Prohibit if ANY session is IN_PROGRESS or COMPLETED
    SELECT EXISTS (
      SELECT 1 FROM public.booking_sessions
      WHERE booking_id = v_booking_id
        AND status IN ('IN_PROGRESS', 'COMPLETED')
    ) INTO v_has_active_or_completed_session;

    IF v_has_active_or_completed_session THEN
      RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
    END IF;

    -- Prohibit if ANY payment submission exists (regardless of status)
    SELECT EXISTS (
      SELECT 1 FROM public.booking_payment_submissions
      WHERE booking_id = v_booking_id
    ) INTO v_has_slip;

    IF v_has_slip THEN
      RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
    END IF;

  -- Case B: Standalone Estimate Request (No booking linked)
  ELSE
    -- STRICTLY ONLY ALLOW v_est_status = 'PENDING' (Prohibit QUOTED, ACCEPTED, REJECTED, EXPIRED, CANCELLED)
    IF v_est_id IS NULL OR v_est_status IS NULL OR v_est_status != 'PENDING' THEN
      RAISE EXCEPTION 'คำขอนี้มีการดำเนินการแล้ว หรือถูกยกเลิกไปแล้ว กรุณาติดต่อร้าน' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- 3. Soft cancel estimate_requests and date options in same transaction
  -- --------------------------------------------------------------------------
  IF v_est_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET
      status = 'CANCELLED',
      is_date_proposed = FALSE,
      updated_at = pg_catalog.now()
    WHERE id = v_est_id;

    UPDATE public.estimate_request_date_options
    SET status = 'CANCELLED'
    WHERE estimate_request_id = v_est_id
      AND status = 'PENDING';
  END IF;

  -- --------------------------------------------------------------------------
  -- 4. Soft cancel ONLY the locked & verified booking v_booking_id
  -- Trigger trig_04_booking_cancel_session_cascade automatically sets SCHEDULED booking_sessions to CANCELLED and unlocks date slots
  -- --------------------------------------------------------------------------
  IF v_booking_id IS NOT NULL THEN
    UPDATE public.bookings
    SET
      status = 'CANCELLED',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    WHERE id = v_booking_id
      AND status = 'WAITING_DEPOSIT';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', v_est_id,
    'booking_id', v_booking_id,
    'status', 'CANCELLED'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. One-Time Safe Repair
-- Fixes desynced records where estimate_requests.status = 'CANCELLED'
-- BUT linked bookings.status = 'WAITING_DEPOSIT' with ZERO submissions (any status)
-- AND ZERO active/completed sessions (IN_PROGRESS/COMPLETED)
-- ----------------------------------------------------------------------------
UPDATE public.bookings b
SET
  status = 'CANCELLED',
  cancelled_at = pg_catalog.now(),
  updated_at = pg_catalog.now()
FROM public.estimate_requests e
WHERE b.estimate_request_id = e.id
  AND e.status = 'CANCELLED'
  AND b.status = 'WAITING_DEPOSIT'
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_payment_submissions bps
    WHERE bps.booking_id = b.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.booking_sessions bs
    WHERE bs.booking_id = b.id
      AND bs.status IN ('IN_PROGRESS', 'COMPLETED')
  );

-- ----------------------------------------------------------------------------
-- 3. Permissions & PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.customer_cancel_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_cancel_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_cancel_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_cancel_request(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
