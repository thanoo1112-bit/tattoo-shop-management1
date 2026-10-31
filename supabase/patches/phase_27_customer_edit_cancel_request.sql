-- ============================================================================
-- 157 TATTOO — PHASE 27 MIGRATION
-- CUSTOMER EDIT & CANCEL BOOKING / ESTIMATE REQUEST ATOMIC RPCs
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC: public.customer_cancel_request
-- Cancel estimate_request or booking owned by authenticated customer.
-- Disallowed if slip is submitted (PENDING/APPROVED) or status is SLIP_REVIEW, CONFIRMED, IN_PROGRESS.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_cancel_request(
  p_target_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_customer_id UUID;
  v_est_id UUID;
  v_booking_id UUID;
  v_est_status TEXT;
  v_book_status TEXT;
  v_has_slip BOOLEAN := false;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Lock estimate_request if target is estimate_requests.id
  SELECT id, status, customer_user_id
  INTO v_est_id, v_est_status, v_customer_id
  FROM public.estimate_requests
  WHERE id = p_target_id FOR UPDATE;

  IF v_est_id IS NOT NULL THEN
    IF v_customer_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized ownership';
    END IF;

    -- Look for associated active booking
    SELECT id, status INTO v_booking_id, v_book_status
    FROM public.bookings
    WHERE estimate_request_id = v_est_id
      AND status NOT IN ('CANCELLED', 'REJECTED')
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  ELSE
    -- Target is booking.id
    SELECT id, estimate_request_id, status, customer_user_id
    INTO v_booking_id, v_est_id, v_book_status, v_customer_id
    FROM public.bookings
    WHERE id = p_target_id FOR UPDATE;

    IF v_booking_id IS NULL THEN
      RAISE EXCEPTION 'ไม่พบรายการที่ต้องการยกเลิก';
    END IF;

    IF v_customer_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized ownership';
    END IF;

    IF v_est_id IS NOT NULL THEN
      SELECT status INTO v_est_status
      FROM public.estimate_requests
      WHERE id = v_est_id FOR UPDATE;
    END IF;
  END IF;

  -- 2. Verify slip status & lifecycle state
  IF v_booking_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.booking_payment_submissions
      WHERE booking_id = v_booking_id
        AND status IN ('PENDING', 'APPROVED')
    ) INTO v_has_slip;

    IF v_has_slip OR v_book_status IN ('SLIP_REVIEW', 'CONFIRMED', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว';
    END IF;
  END IF;

  -- 3. Cancel estimate_requests if active
  IF v_est_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET
      status = 'CANCELLED',
      updated_at = pg_catalog.now()
    WHERE id = v_est_id;
  END IF;

  -- 4. Cancel bookings if active
  IF v_booking_id IS NOT NULL THEN
    UPDATE public.bookings
    SET
      status = 'CANCELLED',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    WHERE id = v_booking_id;

    UPDATE public.booking_sessions
    SET status = 'CANCELLED'
    WHERE booking_id = v_booking_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', v_est_id,
    'booking_id', v_booking_id,
    'status', 'CANCELLED'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ----------------------------------------------------------------------------
-- 2. RPC: public.customer_edit_booking_or_estimate
-- Edit estimate_request or booking owned by authenticated customer.
-- Updates fields, checks date validity and artist availability on server.
-- Returns estimate_request to PENDING status, and marks existing WAITING_DEPOSIT booking CANCELLED.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_edit_booking_or_estimate(
  p_target_id UUID,
  p_artist_id UUID DEFAULT NULL,
  p_style TEXT DEFAULT NULL,
  p_placement TEXT DEFAULT NULL,
  p_width_cm NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL,
  p_preferred_date DATE DEFAULT NULL,
  p_preferred_time TIME DEFAULT NULL,
  p_reference_images TEXT[] DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_customer_id UUID;
  v_est_id UUID;
  v_booking_id UUID;
  v_est_status TEXT;
  v_book_status TEXT;
  v_has_slip BOOLEAN := false;
  v_duration INT := 120;
  v_start_ts TIMESTAMPTZ;
  v_end_ts TIMESTAMPTZ;
  v_busy_count INT;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Lock estimate_request if target is estimate_requests.id
  SELECT id, status, customer_user_id, COALESCE(estimated_duration_minutes, 120)
  INTO v_est_id, v_est_status, v_customer_id, v_duration
  FROM public.estimate_requests
  WHERE id = p_target_id FOR UPDATE;

  IF v_est_id IS NOT NULL THEN
    IF v_customer_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized ownership';
    END IF;

    SELECT id, status INTO v_booking_id, v_book_status
    FROM public.bookings
    WHERE estimate_request_id = v_est_id
      AND status NOT IN ('CANCELLED', 'REJECTED')
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  ELSE
    -- Target is booking.id
    SELECT id, estimate_request_id, status, customer_user_id
    INTO v_booking_id, v_est_id, v_book_status, v_customer_id
    FROM public.bookings
    WHERE id = p_target_id FOR UPDATE;

    IF v_booking_id IS NULL THEN
      RAISE EXCEPTION 'ไม่พบรายการที่ต้องการแก้ไข';
    END IF;

    IF v_customer_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized ownership';
    END IF;

    IF v_est_id IS NOT NULL THEN
      SELECT status, COALESCE(estimated_duration_minutes, 120)
      INTO v_est_status, v_duration
      FROM public.estimate_requests
      WHERE id = v_est_id FOR UPDATE;
    END IF;
  END IF;

  -- 2. Verify slip status & lifecycle state
  IF v_booking_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.booking_payment_submissions
      WHERE booking_id = v_booking_id
        AND status IN ('PENDING', 'APPROVED')
    ) INTO v_has_slip;

    IF v_has_slip OR v_book_status IN ('SLIP_REVIEW', 'CONFIRMED', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว';
    END IF;
  END IF;

  -- 3. Check Date validity (no past dates)
  IF p_preferred_date IS NOT NULL AND p_preferred_date < (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกวันที่ย้อนหลังได้';
  END IF;

  -- 4. Server-side Availability Check
  IF p_artist_id IS NOT NULL AND p_preferred_date IS NOT NULL THEN
    v_start_ts := (p_preferred_date::TEXT || ' ' || COALESCE(p_preferred_time::TEXT, '11:00:00') || '+07')::TIMESTAMPTZ;
    v_end_ts := v_start_ts + (COALESCE(v_duration, 120) || ' minutes')::INTERVAL;

    SELECT COUNT(*) INTO v_busy_count
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE s.artist_id = p_artist_id
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED')
      AND (v_booking_id IS NULL OR s.booking_id != v_booking_id)
      AND s.start_at < v_end_ts
      AND s.end_at > v_start_ts;

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
    END IF;
  END IF;

  -- 5. Perform updates on estimate_requests
  IF v_est_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET
      artist_id = COALESCE(p_artist_id, artist_id),
      style = COALESCE(p_style, style),
      placement = COALESCE(p_placement, placement),
      width_cm = COALESCE(p_width_cm, width_cm),
      height_cm = COALESCE(p_height_cm, height_cm),
      preferred_date = COALESCE(p_preferred_date, preferred_date),
      preferred_time = COALESCE(p_preferred_time, preferred_time),
      reference_images = COALESCE(p_reference_images, reference_images),
      description = COALESCE(p_description, description),
      status = 'PENDING',
      updated_at = pg_catalog.now()
    WHERE id = v_est_id;
  END IF;

  -- 6. Cancel existing booking if customer is editing a WAITING_DEPOSIT booking
  IF v_booking_id IS NOT NULL THEN
    UPDATE public.bookings
    SET
      status = 'CANCELLED',
      admin_note = 'ลูกค้าแก้ไขคำขอก่อนชำระมัดจำ',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    WHERE id = v_booking_id;

    UPDATE public.booking_sessions
    SET status = 'CANCELLED'
    WHERE booking_id = v_booking_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', v_est_id,
    'cancelled_booking_id', v_booking_id,
    'status', 'PENDING'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ----------------------------------------------------------------------------
-- 3. Backward Compatibility Wrapper: cancel_booking_request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_request(p_booking_id UUID)
RETURNS JSONB AS $$
BEGIN
  RETURN public.customer_cancel_request(p_booking_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- ----------------------------------------------------------------------------
-- 4. Secure RPC Permissions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.customer_cancel_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_cancel_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_cancel_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_cancel_request(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_booking_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_booking_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_request(UUID) TO service_role;

-- Notify Supabase PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
