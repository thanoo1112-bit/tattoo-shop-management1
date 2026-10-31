-- ============================================================================
-- 157 TATTOO — PHASE 92 MIGRATION PATCH
-- FIX ADMIN CONFIRM BOOKING REQUEST 23505 DUPLICATE SESSION INSERT ERROR
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_confirm_booking_request(
  p_estimate_request_id UUID,
  p_appointment_date DATE,
  p_start_time TIME,
  p_end_time TIME DEFAULT NULL,
  p_deposit_required NUMERIC DEFAULT 0,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estimate RECORD;
  v_booking_id UUID;
  v_session_id UUID;
  v_booking_status TEXT;
  v_deposit NUMERIC;
  v_calc_end_time TIME;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_session_start_at TIMESTAMPTZ;
  v_session_end_at TIMESTAMPTZ;
BEGIN
  -- 1. Authorization: Require Authenticated Admin
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin can confirm booking requests' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Inputs
  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'p_appointment_date is required' USING ERRCODE = '22004';
  END IF;

  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'p_start_time is required' USING ERRCODE = '22004';
  END IF;

  v_deposit := COALESCE(p_deposit_required, 0);
  IF v_deposit < 0 THEN
    RAISE EXCEPTION 'deposit_required cannot be negative' USING ERRCODE = '22023';
  END IF;

  -- 3. Lock and Verify Target Estimate Request
  SELECT id, customer_user_id, artist_id, status, description, width_cm, height_cm, estimated_size_tier
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'Estimate request % not found', p_estimate_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'Estimate request % is in status % (must be PENDING to confirm)', p_estimate_request_id, v_estimate.status
      USING ERRCODE = '22023';
  END IF;

  IF v_estimate.artist_id IS NULL THEN
    RAISE EXCEPTION 'Estimate request % has no assigned artist', p_estimate_request_id USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.artists
    WHERE id = v_estimate.artist_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', v_estimate.artist_id USING ERRCODE = '22023';
  END IF;

  -- 4. Calculate v_calc_end_time inside Database based on Tattoo Size
  v_calc_end_time := public.calculate_tattoo_session_end_time(
    p_start_time,
    v_estimate.estimated_size_tier,
    v_estimate.width_cm,
    v_estimate.height_cm,
    v_estimate.description
  );

  -- 5. Calculate Datetime Timestamps (+07:00)
  v_start_at := (p_appointment_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_appointment_date::TEXT || ' ' || v_calc_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be greater than start_at' USING ERRCODE = '22023';
  END IF;

  -- 6. Verify Single Booking Per Estimate Rule
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE estimate_request_id = p_estimate_request_id
  ) THEN
    RAISE EXCEPTION 'A booking already exists for estimate request %', p_estimate_request_id USING ERRCODE = '23505';
  END IF;

  -- 7. Determine Booking Status based on Deposit
  IF v_deposit > 0 THEN
    v_booking_status := 'WAITING_DEPOSIT';
  ELSE
    v_booking_status := 'CONFIRMED';
  END IF;

  -- 8. Update Estimate Request to Internal ACCEPTED Status
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    deposit_required = v_deposit,
    quote_note = p_admin_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  -- 9. Create Canonical Booking Record
  -- (Trigger trig_auto_create_session_1 automatically creates Session #1 upon INSERT into public.bookings)
  INSERT INTO public.bookings (
    estimate_request_id,
    customer_user_id,
    artist_id,
    requested_date,
    requested_start_time,
    customer_note,
    admin_note,
    status,
    approved_at,
    confirmed_at,
    created_at,
    updated_at
  )
  VALUES (
    v_estimate.id,
    v_estimate.customer_user_id,
    v_estimate.artist_id,
    p_appointment_date,
    p_start_time,
    v_estimate.description,
    p_admin_note,
    v_booking_status,
    pg_catalog.now(),
    CASE WHEN v_booking_status = 'CONFIRMED' THEN pg_catalog.now() ELSE NULL END,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  -- 10. Fetch Auto-Created Session #1 and sync note if provided
  SELECT id, start_at, end_at
  INTO v_session_id, v_session_start_at, v_session_end_at
  FROM public.booking_sessions
  WHERE booking_id = v_booking_id AND session_number = 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Failed to auto-create booking session #1 for booking %', v_booking_id USING ERRCODE = 'P0001';
  END IF;

  IF p_admin_note IS NOT NULL THEN
    UPDATE public.booking_sessions
    SET note = p_admin_note,
        updated_at = pg_catalog.now()
    WHERE id = v_session_id;
  END IF;

  -- 11. Return Structured Success Payload
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_session_id', v_session_id,
    'booking_status', v_booking_status,
    'deposit_required', v_deposit,
    'start_at', COALESCE(v_session_start_at, v_start_at),
    'end_at', COALESCE(v_session_end_at, v_end_at)
  );
END;
$$;

-- Permissions for admin_confirm_booking_request
REVOKE ALL ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) TO authenticated, service_role;

COMMIT;
