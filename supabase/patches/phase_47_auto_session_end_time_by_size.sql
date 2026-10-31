-- ============================================================================
-- 157 TATTOO — PHASE 47 FORWARD MIGRATION
-- DATABASE-ENFORCED AUTOMATIC SESSION END TIME & QUEUE BLOCKING BY TATTOO SIZE
-- ============================================================================
-- Business Rules (Studio Operating Hours 10:00 — 23:00):
-- Size S (5x5 cm): 1 Hour Duration
-- Size M (5x10 cm): 2 Hours Duration
-- Size L (10x15 cm): 4 Hours Duration
-- Size XL (15x25 cm): 6 Hours Duration
-- Size XXL (>A4 / 21x30 cm): Starts at 10:00 AM ONLY, ends at 23:00 PM (Closing)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper Function: calculate_tattoo_session_end_time
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.calculate_tattoo_session_end_time(
  p_start_time TIME,
  p_size_tier TEXT DEFAULT NULL,
  p_width NUMERIC DEFAULT NULL,
  p_height NUMERIC DEFAULT NULL,
  p_raw_text TEXT DEFAULT NULL
)
RETURNS TIME
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_tier TEXT;
  v_mins INT;
  v_start_mins INT;
  v_end_mins INT;
  v_end_h INT;
  v_end_m INT;
BEGIN
  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'p_start_time is required' USING ERRCODE = '22004';
  END IF;

  -- 1. Determine Size Tier (Hierarchy: 1. p_size_tier, 2. width/height, 3. p_raw_text)
  v_tier := COALESCE(UPPER(TRIM(p_size_tier)), '');

  IF v_tier = 'XXL' OR v_tier = 'FULL_PROJECT' OR v_tier LIKE '%XXL%' OR v_tier LIKE '%A4%' THEN
    v_tier := 'XXL';
  ELSIF (p_width IS NOT NULL AND p_height IS NOT NULL AND p_width > 0 AND p_height > 0) THEN
    IF (LEAST(p_width, p_height) >= 20 AND GREATEST(p_width, p_height) >= 28) OR GREATEST(p_width, p_height) > 25 THEN
      v_tier := 'XXL';
    ELSIF (LEAST(p_width, p_height) = 15 AND GREATEST(p_width, p_height) = 25) OR GREATEST(p_width, p_height) > 15 THEN
      v_tier := 'XL';
    ELSIF (LEAST(p_width, p_height) = 10 AND GREATEST(p_width, p_height) = 15) OR GREATEST(p_width, p_height) > 10 THEN
      v_tier := 'L';
    ELSIF (LEAST(p_width, p_height) = 5 AND GREATEST(p_width, p_height) = 10) OR GREATEST(p_width, p_height) > 5 THEN
      v_tier := 'M';
    ELSE
      v_tier := 'S';
    END IF;
  ELSIF v_tier = 'XL' THEN
    v_tier := 'XL';
  ELSIF v_tier = 'L' OR v_tier = 'LARGE' THEN
    v_tier := 'L';
  ELSIF v_tier = 'M' OR v_tier = 'SMALL_MED' THEN
    v_tier := 'M';
  ELSIF v_tier = 'S' OR v_tier = 'MICRO' THEN
    v_tier := 'S';
  ELSIF p_raw_text IS NOT NULL AND p_raw_text <> '' THEN
    IF LOWER(p_raw_text) LIKE '%xxl%' OR LOWER(p_raw_text) LIKE '%a4%' OR (LOWER(p_raw_text) LIKE '%21%' AND LOWER(p_raw_text) LIKE '%30%') THEN
      v_tier := 'XXL';
    ELSIF LOWER(p_raw_text) LIKE '%xl%' THEN
      v_tier := 'XL';
    ELSIF LOWER(p_raw_text) LIKE '%size l%' OR (LOWER(p_raw_text) LIKE '%10%' AND LOWER(p_raw_text) LIKE '%15%') THEN
      v_tier := 'L';
    ELSIF LOWER(p_raw_text) LIKE '%size m%' OR (LOWER(p_raw_text) LIKE '%5%' AND LOWER(p_raw_text) LIKE '%10%') THEN
      v_tier := 'M';
    ELSIF LOWER(p_raw_text) LIKE '%size s%' OR LOWER(p_raw_text) LIKE '%5x5%' OR LOWER(p_raw_text) LIKE '%5 × 5%' THEN
      v_tier := 'S';
    ELSE
      v_tier := 'M';
    END IF;
  ELSE
    v_tier := 'M';
  END IF;

  -- 2. Determine blocking duration in minutes
  IF v_tier = 'XXL' OR v_tier = 'XL' THEN
    v_mins := 360; -- 6 hours
  ELSIF v_tier = 'L' THEN
    v_mins := 240; -- 4 hours
  ELSIF v_tier = 'M' THEN
    v_mins := 120; -- 2 hours
  ELSE
    v_mins := 60;  -- 1 hour (Size S)
  END IF;

  -- 3. Calculate start minutes and end minutes
  v_start_mins := EXTRACT(HOUR FROM p_start_time)::INT * 60 + EXTRACT(MINUTE FROM p_start_time)::INT;

  IF v_start_mins < (10 * 60) OR v_start_mins >= (23 * 60) THEN
    RAISE EXCEPTION 'Start time % must be between 10:00 and 23:00', p_start_time USING ERRCODE = '22023';
  END IF;

  v_end_mins := LEAST(23 * 60, v_start_mins + v_mins);

  v_end_h := v_end_mins / 60;
  v_end_m := v_end_mins % 60;

  RETURN (LPAD(v_end_h::TEXT, 2, '0') || ':' || LPAD(v_end_m::TEXT, 2, '0') || ':00')::TIME;
END;
$$;

-- Grant permissions for calculate_tattoo_session_end_time
REVOKE ALL ON FUNCTION public.calculate_tattoo_session_end_time(TIME, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_tattoo_session_end_time(TIME, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. RPC: admin_confirm_booking_request (UPDATED WITH DB-ENFORCED END TIME)
-- ----------------------------------------------------------------------------

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
  v_booking_status TEXT;
  v_deposit NUMERIC;
  v_calc_end_time TIME;
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

  -- 5. Calculate Datetime Timestamps (+07:00) using Database-calculated v_calc_end_time
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

  -- 10. Return Structured Success Payload
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_session_id', NULL,
    'booking_status', v_booking_status,
    'deposit_required', v_deposit,
    'start_at', v_start_at,
    'end_at', v_end_at
  );
END;
$$;

-- Permissions for admin_confirm_booking_request
REVOKE ALL ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. RPC: artist_confirm_booking_request (UPDATED WITH DB-ENFORCED END TIME)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.artist_confirm_booking_request(
  p_estimate_request_id UUID,
  p_appointment_date DATE,
  p_start_time TIME,
  p_end_time TIME DEFAULT NULL,
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
  v_calc_end_time TIME;
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

  -- 3. Lock and Verify Target Estimate Request & Ownership
  SELECT id, customer_user_id, artist_id, status, description, quoted_price, width_cm, height_cm, estimated_size_tier
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

  -- 4. Calculate v_calc_end_time inside Database based on Tattoo Size
  v_calc_end_time := public.calculate_tattoo_session_end_time(
    p_start_time,
    v_estimate.estimated_size_tier,
    v_estimate.width_cm,
    v_estimate.height_cm,
    v_estimate.description
  );

  -- 5. Calculate Datetime Timestamps (+07:00) using Database-calculated v_calc_end_time
  v_start_at := (p_appointment_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_appointment_date::TEXT || ' ' || v_calc_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be greater than start_at' USING ERRCODE = '22023';
  END IF;

  -- 6. Validate Price & Deposit
  v_quoted := COALESCE(p_quoted_price, v_estimate.quoted_price);
  IF v_quoted IS NOT NULL AND v_quoted < 0 THEN
    RAISE EXCEPTION 'quoted_price cannot be negative' USING ERRCODE = '22023';
  END IF;

  v_deposit := COALESCE(p_deposit_required, 500);
  IF v_deposit < 0 THEN
    RAISE EXCEPTION 'deposit_required cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_quoted IS NOT NULL AND v_quoted > 0 AND v_deposit > v_quoted THEN
    RAISE EXCEPTION 'deposit_required cannot exceed quoted_price' USING ERRCODE = '22023';
  END IF;

  -- 7. Verify Single Booking Per Estimate Rule
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE estimate_request_id = p_estimate_request_id
  ) THEN
    RAISE EXCEPTION 'A booking already exists for estimate request %', p_estimate_request_id USING ERRCODE = '23505';
  END IF;

  -- 8. Determine Booking Status based on Deposit
  IF v_deposit > 0 THEN
    v_booking_status := 'WAITING_DEPOSIT';
  ELSE
    v_booking_status := 'CONFIRMED';
  END IF;

  -- 9. Update Estimate Request to ACCEPTED
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    quoted_price = COALESCE(p_quoted_price, v_estimate.quoted_price),
    deposit_required = v_deposit,
    quote_note = p_artist_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  -- 10. Create Booking Record
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

  -- 11. Return Structured Success Payload
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_session_id', NULL,
    'booking_status', v_booking_status,
    'start_at', v_start_at,
    'end_at', v_end_at
  );
END;
$$;

-- Permissions for artist_confirm_booking_request
REVOKE ALL ON FUNCTION public.artist_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. RPC: artist_add_session (UPDATED WITH DB-ENFORCED END TIME)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.artist_add_session(
  p_booking_id UUID,
  p_appointment_date DATE,
  p_start_time TIME,
  p_end_time TIME DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_booking RECORD;
  v_estimate RECORD;
  v_next_session_number INT;
  v_calc_end_time TIME;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_session_id UUID;
BEGIN
  -- 1. Authorization: Require Active Authenticated Artist
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can add sessions' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Inputs
  IF p_booking_id IS NULL OR p_appointment_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'p_booking_id, p_appointment_date, and p_start_time are required' USING ERRCODE = '22004';
  END IF;

  -- 3. Lock Target Booking
  SELECT id, artist_id, status, estimate_request_id, width_cm, height_cm, style
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only add sessions to bookings assigned to you' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('CANCELLED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Cannot add session to booking % in % status', p_booking_id, v_booking.status USING ERRCODE = '22023';
  END IF;

  -- 4. Get Size Info from Linked Estimate Request (if exists)
  IF v_booking.estimate_request_id IS NOT NULL THEN
    SELECT estimated_size_tier, width_cm, height_cm, description
    INTO v_estimate
    FROM public.estimate_requests
    WHERE id = v_booking.estimate_request_id;
  END IF;

  -- 5. Calculate End Time inside Database based on Size
  v_calc_end_time := public.calculate_tattoo_session_end_time(
    p_start_time,
    COALESCE(v_estimate.estimated_size_tier, NULL),
    COALESCE(v_booking.width_cm, v_estimate.width_cm, NULL),
    COALESCE(v_booking.height_cm, v_estimate.height_cm, NULL),
    COALESCE(v_booking.style, v_estimate.description, NULL)
  );

  -- 6. Calculate Timestamps (+07:00)
  v_start_at := (p_appointment_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_appointment_date::TEXT || ' ' || v_calc_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be greater than start_at' USING ERRCODE = '22023';
  END IF;

  -- 7. Calculate Next Session Number
  SELECT COALESCE(MAX(session_number), 0) + 1 INTO v_next_session_number
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  -- 8. Insert New Booking Session
  INSERT INTO public.booking_sessions (
    booking_id,
    artist_id,
    session_number,
    start_at,
    end_at,
    status,
    note,
    created_at,
    updated_at
  )
  VALUES (
    p_booking_id,
    v_artist_id,
    v_next_session_number,
    v_start_at,
    v_end_at,
    'SCHEDULED',
    p_note,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_session_id', v_session_id,
    'session_number', v_next_session_number,
    'start_at', v_start_at,
    'end_at', v_end_at
  );
END;
$$;

-- Permissions for artist_add_session
REVOKE ALL ON FUNCTION public.artist_add_session(UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_add_session(UUID, DATE, TIME, TIME, TEXT) TO authenticated, service_role;


-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

COMMIT;
