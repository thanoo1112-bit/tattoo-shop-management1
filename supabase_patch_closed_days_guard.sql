-- ============================================================================
-- 157 TATTOO — SERVER-SIDE GUARD FOR STUDIO & ARTIST BLOCKED DATES IN BOOKING RPC
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_direct_booking(
  p_artist_id UUID,
  p_requested_date DATE,
  p_placement TEXT,
  p_width_cm NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL,
  p_color_technique TEXT DEFAULT NULL,
  p_work_type TEXT DEFAULT 'NEW_TATTOO',
  p_customer_note TEXT DEFAULT NULL,
  p_requested_start_time TIME DEFAULT '11:00:00'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_user_id UUID;
  v_customer_id UUID;
  v_base_price NUMERIC(10,2);
  v_booking_id UUID;
  v_today_bkk DATE;
  v_calc JSONB := NULL;
  
  -- Price Estimate Snapshot local variables
  v_estimated_min NUMERIC(10,2) := NULL;
  v_estimated_max NUMERIC(10,2) := NULL;
  v_base_snapshot NUMERIC(10,2) := NULL;
  v_size_tier TEXT := NULL;
  v_size_mult NUMERIC(8,3) := NULL;
  v_color_mult NUMERIC(8,3) := NULL;
  v_work_mult NUMERIC(8,3) := NULL;
  v_range_factor NUMERIC(6,3) := NULL;
  v_rounding_inc NUMERIC(10,2) := NULL;
  v_estimated_at TIMESTAMPTZ := NULL;
BEGIN
  -- 1. Authentication Check
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Required Input Validation
  IF p_artist_id IS NULL THEN
    RAISE EXCEPTION 'p_artist_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_requested_date IS NULL THEN
    RAISE EXCEPTION 'p_requested_date is required' USING ERRCODE = '22004';
  END IF;

  IF p_placement IS NULL OR pg_catalog.btrim(p_placement) = '' THEN
    RAISE EXCEPTION 'placement is required' USING ERRCODE = '22004';
  END IF;

  IF p_work_type IS NOT NULL AND p_work_type NOT IN ('NEW_TATTOO', 'REWORK', 'COVER_UP', 'SCAR_COVER') THEN
    RAISE EXCEPTION 'INVALID_WORK_TYPE: work_type must be NEW_TATTOO, REWORK, COVER_UP, SCAR_COVER, or NULL' USING ERRCODE = '22023';
  END IF;

  -- 3. Artist Existence & Base Price Check
  SELECT base_price INTO v_base_price
  FROM public.artists
  WHERE id = p_artist_id AND is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artist with ID % not found or inactive', p_artist_id USING ERRCODE = 'P0002';
  END IF;

  -- 4. Date & Availability Validation
  v_today_bkk := (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE;
  IF p_requested_date < v_today_bkk THEN
    RAISE EXCEPTION 'Cannot request booking for a past date (requested: %, today: %)', p_requested_date, v_today_bkk USING ERRCODE = '22023';
  END IF;

  -- Check Studio-wide Blocked Date
  IF EXISTS (
    SELECT 1 FROM public.artist_blocked_dates
    WHERE scope = 'STUDIO' AND blocked_date = p_requested_date
  ) THEN
    RAISE EXCEPTION 'STUDIO_DATE_BLOCKED: The studio is closed on the selected date' USING ERRCODE = '22023';
  END IF;

  -- Check Artist-specific Blocked Date
  IF EXISTS (
    SELECT 1 FROM public.artist_blocked_dates
    WHERE (scope IS NULL OR scope = 'ARTIST') AND artist_id = p_artist_id AND blocked_date = p_requested_date
  ) THEN
    RAISE EXCEPTION 'ARTIST_DATE_BLOCKED: Selected date is blocked by the artist' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE artist_id = p_artist_id AND requested_date = p_requested_date
      AND status IN ('PENDING', 'APPROVED', 'WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')
  ) OR EXISTS (
    SELECT 1 FROM public.booking_sessions s
    WHERE s.artist_id = p_artist_id
      AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_requested_date
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
  ) THEN
    RAISE EXCEPTION 'ARTIST_DAY_ALREADY_BOOKED: Artist already has an active customer or booking on this date' USING ERRCODE = '22023';
  END IF;

  -- 5. Customer Profile / Master Resolution
  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE user_id = v_customer_user_id
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (user_id, first_name)
    VALUES (v_customer_user_id, 'Customer')
    RETURNING id INTO v_customer_id;
  END IF;

  -- 6. Price Engine Snapshot (if color technique provided)
  IF p_color_technique IS NOT NULL THEN
    IF p_color_technique NOT IN ('LINEWORK', 'BLACK_AND_GREY', 'FULL_COLOR') THEN
      RAISE EXCEPTION 'INVALID_COLOR_TECHNIQUE: color_technique must be LINEWORK, BLACK_AND_GREY, or FULL_COLOR' USING ERRCODE = '22023';
    END IF;

    IF v_base_price IS NULL OR v_base_price <= 0 THEN
      RAISE EXCEPTION 'ARTIST_BASE_PRICE_NOT_CONFIGURED' USING ERRCODE = '22023';
    END IF;

    v_calc := public.calculate_tattoo_price_estimate(
      p_artist_id,
      p_width_cm,
      p_height_cm,
      p_color_technique,
      COALESCE(p_work_type, 'NEW_TATTOO')
    );

    v_estimated_min := (v_calc->>'estimated_min_price')::NUMERIC(10,2);
    v_estimated_max := (v_calc->>'estimated_max_price')::NUMERIC(10,2);
    v_base_snapshot := v_base_price;
    v_size_tier := v_calc->>'size_tier';
    v_size_mult := (v_calc->>'size_multiplier')::NUMERIC(8,3);
    v_color_mult := (v_calc->>'color_multiplier')::NUMERIC(8,3);
    v_work_mult := (v_calc->>'work_type_multiplier')::NUMERIC(8,3);
    v_range_factor := (v_calc->>'range_factor')::NUMERIC(6,3);
    v_rounding_inc := (v_calc->>'rounding_increment')::NUMERIC(10,2);
    v_estimated_at := pg_catalog.now();
  END IF;

  -- 7. Insert Booking Record
  INSERT INTO public.bookings (
    customer_user_id,
    customer_id,
    artist_id,
    requested_date,
    requested_start_time,
    placement,
    width_cm,
    height_cm,
    color_technique,
    work_type,
    customer_note,
    status,
    estimated_min_price,
    estimated_max_price,
    base_price_snapshot,
    size_tier_snapshot,
    size_multiplier_snapshot,
    color_multiplier_snapshot,
    work_type_multiplier_snapshot,
    range_factor_snapshot,
    rounding_increment_snapshot,
    price_estimated_at
  ) VALUES (
    v_customer_user_id,
    v_customer_id,
    p_artist_id,
    p_requested_date,
    COALESCE(p_requested_start_time, '11:00:00'::TIME),
    p_placement,
    p_width_cm,
    p_height_cm,
    p_color_technique,
    COALESCE(p_work_type, 'NEW_TATTOO'),
    p_customer_note,
    'PENDING',
    v_estimated_min,
    v_estimated_max,
    v_base_snapshot,
    v_size_tier,
    v_size_mult,
    v_color_mult,
    v_work_mult,
    v_range_factor,
    v_rounding_inc,
    v_estimated_at
  ) RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'status', 'PENDING',
    'requested_date', p_requested_date,
    'message', 'Direct booking request submitted successfully'
  );
END;
$$;

COMMIT;
