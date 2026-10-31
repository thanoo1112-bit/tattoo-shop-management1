-- ============================================================================
-- 157 TATTOO — PHASE 35 MIGRATION
-- FIX CUSTOMER CANCEL REQUEST RPC, STATUS CHECK CONSTRAINT & SCHEMA CACHE
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Explicitly update CHECK constraint on public.estimate_requests.status
-- Allows status 'CANCELLED' in addition to PENDING, QUOTED, ACCEPTED, REJECTED, EXPIRED.
-- ----------------------------------------------------------------------------
ALTER TABLE public.estimate_requests DROP CONSTRAINT IF EXISTS estimate_requests_status_check;
ALTER TABLE public.estimate_requests DROP CONSTRAINT IF EXISTS chk_estimate_requests_status;
ALTER TABLE public.estimate_requests DROP CONSTRAINT IF EXISTS check_estimate_requests_status;

ALTER TABLE public.estimate_requests
  ADD CONSTRAINT estimate_requests_status_check
  CHECK (status IN ('PENDING', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'));

-- ----------------------------------------------------------------------------
-- 2. RPC: public.customer_cancel_request
-- Cancel estimate_request or booking owned by authenticated customer.
-- Allowed ONLY for:
--   - Standalone estimate_request in PENDING status (including is_date_proposed = true)
--   - Booking in WAITING_DEPOSIT status with NO pending/approved payment slip & NO in-progress/completed session
-- Cancellation of booking relies on existing trigger trig_04_booking_cancel_session_cascade to auto-cancel SCHEDULED sessions.
-- Marks pending date options as CANCELLED. Never performs hard deletion.
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

  -- 2. Strict Lifecycle & Payment Submission Checks
  -- A. If there is a booking: Customer can ONLY cancel WAITING_DEPOSIT booking without submitted slip or in-progress/completed session
  IF v_booking_id IS NOT NULL THEN
    IF v_book_status != 'WAITING_DEPOSIT' THEN
      RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.booking_sessions
      WHERE booking_id = v_booking_id
        AND status IN ('IN_PROGRESS', 'COMPLETED')
    ) INTO v_has_active_or_completed_session;

    IF v_has_active_or_completed_session THEN
      RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.booking_payment_submissions
      WHERE booking_id = v_booking_id
        AND status IN ('PENDING', 'APPROVED')
    ) INTO v_has_slip;

    IF v_has_slip THEN
      RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- B. If standalone estimate request (without booking): must be PENDING
  IF v_booking_id IS NULL AND v_est_id IS NOT NULL THEN
    IF v_est_status != 'PENDING' THEN
      RAISE EXCEPTION 'คำขอนี้ถูกยกเลิกหรือดำเนินการเสร็จสิ้นไปแล้ว' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 3. Soft cancel estimate_requests and date options
  IF v_est_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET
      status = 'CANCELLED',
      is_date_proposed = FALSE,
      updated_at = pg_catalog.now()
    WHERE id = v_est_id;

    -- Cancel all pending date options for this estimate_request
    UPDATE public.estimate_request_date_options
    SET status = 'CANCELLED'
    WHERE estimate_request_id = v_est_id
      AND status = 'PENDING';
  END IF;

  -- 4. Soft cancel booking ONLY
  -- Trigger trig_04_booking_cancel_session_cascade automatically sets SCHEDULED booking_sessions to CANCELLED and unlocks date slots
  IF v_booking_id IS NOT NULL THEN
    UPDATE public.bookings
    SET
      status = 'CANCELLED',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    WHERE id = v_booking_id;
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
-- 3. Backward Compatibility Wrapper
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_request(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.customer_cancel_request(p_booking_id);
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Permissions & PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.customer_cancel_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_cancel_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_cancel_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_cancel_request(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_booking_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_booking_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_request(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
