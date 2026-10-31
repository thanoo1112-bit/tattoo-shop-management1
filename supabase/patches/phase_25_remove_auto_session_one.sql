-- ============================================================================
-- 157 TATTOO — PHASE 25 MIGRATION
-- STOP AUTO-CREATING SESSION 1 FOR NEW BOOKINGS
-- ============================================================================
-- Bookings use requested_date & requested_start_time as main appointment (Round 1).
-- booking_sessions table is used EXCLUSIVELY for additional sessions (Round 2+).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC: admin_confirm_booking_request (UPDATED: No Session 1 Auto-Insert)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_confirm_booking_request(
  p_estimate_request_id UUID,
  p_appointment_date DATE,
  p_start_time TIME,
  p_end_time TIME,
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
  v_booking_status TEXT;
  v_deposit NUMERIC;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
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

  IF p_end_time IS NULL THEN
    RAISE EXCEPTION 'p_end_time is required' USING ERRCODE = '22004';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'end_time must be later than start_time' USING ERRCODE = '22023';
  END IF;

  v_deposit := COALESCE(p_deposit_required, 0);
  IF v_deposit < 0 THEN
    RAISE EXCEPTION 'deposit_required cannot be negative' USING ERRCODE = '22023';
  END IF;

  -- 3. Lock and Verify Target Estimate Request
  SELECT id, customer_user_id, artist_id, status, description
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

  -- 4. Verify Single Booking Per Estimate Rule
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE estimate_request_id = p_estimate_request_id
  ) THEN
    RAISE EXCEPTION 'A booking already exists for estimate request %', p_estimate_request_id USING ERRCODE = '23505';
  END IF;

  -- 5. Calculate Datetime Timestamps in Asia/Bangkok (+07:00) Timezone
  v_start_at := (p_appointment_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_appointment_date::TEXT || ' ' || p_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be greater than start_at' USING ERRCODE = '22023';
  END IF;

  -- 6. Determine Booking Status based on Deposit
  IF v_deposit > 0 THEN
    v_booking_status := 'WAITING_DEPOSIT';
  ELSE
    v_booking_status := 'CONFIRMED';
  END IF;

  -- 7. Update Estimate Request to Internal ACCEPTED Status
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    deposit_required = v_deposit,
    quote_note = p_admin_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  -- 8. Create Canonical Booking Record (Main Appointment Date/Time)
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

  -- 9. Return Structured Success Payload (No automatic session 1 created)
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_session_id', NULL,
    'booking_status', v_booking_status,
    'session_status', NULL,
    'deposit_required', v_deposit,
    'start_at', v_start_at,
    'end_at', v_end_at
  );
END;
$$;

-- Permissions for admin_confirm_booking_request
REVOKE ALL ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 2. RPC: artist_confirm_booking_request (UPDATED: No Session 1 Auto-Insert)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.artist_confirm_booking_request(
  p_estimate_request_id UUID,
  p_appointment_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_quoted_price NUMERIC DEFAULT NULL,
  p_deposit_required NUMERIC DEFAULT 0,
  p_artist_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_estimate RECORD;
  v_booking_id UUID;
  v_booking_status TEXT;
  v_quoted NUMERIC;
  v_deposit NUMERIC;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
BEGIN
  -- 1. Authorization: Require Authenticated Active Artist
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can confirm booking requests' USING ERRCODE = '42501';
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

  IF p_end_time IS NULL THEN
    RAISE EXCEPTION 'p_end_time is required' USING ERRCODE = '22004';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'end_time must be later than start_time' USING ERRCODE = '22023';
  END IF;

  -- 3. Lock and Verify Target Estimate Request & Ownership
  SELECT id, customer_user_id, artist_id, status, description, quoted_price
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'Estimate request % not found', p_estimate_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_estimate.artist_id IS NULL OR v_estimate.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only confirm requests assigned to you' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'Estimate request % is in status % (must be PENDING to confirm)', p_estimate_request_id, v_estimate.status
      USING ERRCODE = '22023';
  END IF;

  -- 4. Validate Price & Deposit
  v_quoted := COALESCE(p_quoted_price, v_estimate.quoted_price, 0);
  IF v_quoted < 0 THEN
    RAISE EXCEPTION 'quoted_price cannot be negative' USING ERRCODE = '22023';
  END IF;

  v_deposit := COALESCE(p_deposit_required, 0);
  IF v_deposit < 0 THEN
    RAISE EXCEPTION 'deposit_required cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_deposit > v_quoted THEN
    RAISE EXCEPTION 'deposit_required cannot exceed quoted_price' USING ERRCODE = '22023';
  END IF;

  -- 5. Verify Single Booking Per Estimate Rule
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE estimate_request_id = p_estimate_request_id
  ) THEN
    RAISE EXCEPTION 'A booking already exists for estimate request %', p_estimate_request_id USING ERRCODE = '23505';
  END IF;

  -- 6. Calculate Datetime Timestamps (+07:00)
  v_start_at := (p_appointment_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_appointment_date::TEXT || ' ' || p_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be greater than start_at' USING ERRCODE = '22023';
  END IF;

  -- 7. Determine Booking Status based on Deposit
  IF v_deposit > 0 THEN
    v_booking_status := 'WAITING_DEPOSIT';
  ELSE
    v_booking_status := 'CONFIRMED';
  END IF;

  -- 8. Update Estimate Request to ACCEPTED
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    quoted_price = v_quoted,
    deposit_required = v_deposit,
    quote_note = p_artist_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  -- 9. Create Booking Record
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
    v_artist_id,
    p_appointment_date,
    p_start_time,
    v_estimate.description,
    p_artist_note,
    v_booking_status,
    pg_catalog.now(),
    CASE WHEN v_booking_status = 'CONFIRMED' THEN pg_catalog.now() ELSE NULL END,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  -- 10. Return Structured Success Payload (No automatic session 1 created)
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_session_id', NULL,
    'booking_status', v_booking_status
  );
END;
$$;

-- Permissions for artist_confirm_booking_request
REVOKE ALL ON FUNCTION public.artist_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
