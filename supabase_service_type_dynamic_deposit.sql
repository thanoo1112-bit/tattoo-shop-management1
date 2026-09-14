-- ============================================================================
-- 157 TATTOO — SERVICE TYPE + DYNAMIC DEPOSIT MIGRATION
-- ============================================================================

-- 1. Add service_type column to estimate_requests
ALTER TABLE public.estimate_requests 
ADD COLUMN IF NOT EXISTS service_type text NULL;

-- 2. Add CHECK constraint for allowed service types (ignoring NULL for legacy records)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_estimate_requests_service_type'
    ) THEN
        ALTER TABLE public.estimate_requests
        ADD CONSTRAINT check_estimate_requests_service_type
        CHECK (
            service_type IS NULL 
            OR service_type IN (
                'NEW_SMALL',
                'NEW_MEDIUM',
                'NEW_LARGE',
                'COVER_UP',
                'CUSTOM',
                'CONSULTATION'
            )
        );
    END IF;
END $$;

-- 3. Drop old RPC signatures to prevent overload collisions
DROP FUNCTION IF EXISTS public.create_direct_booking_request(
  uuid, date, time without time zone, text, text, numeric, numeric, text, text[], boolean, text, boolean, text, text, text, text
);
DROP FUNCTION IF EXISTS public.create_direct_booking_request(
  uuid, date, time without time zone, text, text, numeric, numeric, text, text[], boolean, text, boolean, text, text, text, text, text
);

-- 4. Recreate create_direct_booking_request with p_service_type & server-side dynamic deposit mapping
CREATE OR REPLACE FUNCTION public.create_direct_booking_request(
  p_artist_id uuid,
  p_requested_date date,
  p_requested_start_time time without time zone DEFAULT NULL::time without time zone,
  p_placement text DEFAULT NULL::text,
  p_style text DEFAULT NULL::text,
  p_width_cm numeric DEFAULT NULL::numeric,
  p_height_cm numeric DEFAULT NULL::numeric,
  p_description text DEFAULT NULL::text,
  p_reference_images text[] DEFAULT '{}'::text[],
  p_has_medical_condition boolean DEFAULT false,
  p_medical_condition_note text DEFAULT NULL::text,
  p_has_allergy boolean DEFAULT false,
  p_allergy_note text DEFAULT NULL::text,
  p_customer_note text DEFAULT NULL::text,
  p_work_type text DEFAULT NULL::text,
  p_color_technique text DEFAULT NULL::text,
  p_service_type text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_today_bkk DATE;
  v_estimate_id UUID;
  v_booking_id UUID;
  v_deposit_required NUMERIC(10,2);
  v_base_price NUMERIC(10,2);
  v_calc JSONB;

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
  IF auth.uid() IS NULL THEN
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

  -- Validate Service Type (Strict Business Rule)
  IF p_service_type IS NULL OR p_service_type NOT IN (
    'NEW_SMALL', 'NEW_MEDIUM', 'NEW_LARGE', 'COVER_UP', 'CUSTOM', 'CONSULTATION'
  ) THEN
    RAISE EXCEPTION 'INVALID_SERVICE_TYPE: p_service_type is required and must be one of NEW_SMALL, NEW_MEDIUM, NEW_LARGE, COVER_UP, CUSTOM, CONSULTATION' USING ERRCODE = '22023';
  END IF;

  -- Derive Server-Side Trusted Deposit Amount based on Service Type
  v_deposit_required := CASE p_service_type
    WHEN 'NEW_SMALL' THEN 300.00
    WHEN 'NEW_MEDIUM' THEN 500.00
    WHEN 'NEW_LARGE' THEN 1000.00
    WHEN 'COVER_UP' THEN 500.00
    WHEN 'CUSTOM' THEN 500.00
    WHEN 'CONSULTATION' THEN 500.00
    ELSE 500.00
  END;

  IF p_work_type IS NOT NULL AND p_work_type NOT IN ('NEW_TATTOO', 'REWORK', 'COVER_UP', 'SCAR_COVER') THEN
    RAISE EXCEPTION 'INVALID_WORK_TYPE: work_type must be NEW_TATTOO, REWORK, COVER_UP, SCAR_COVER, or NULL' USING ERRCODE = '22023';
  END IF;

  -- 3. Artist Existence Check
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

  IF EXISTS (
    SELECT 1 FROM public.artist_blocked_dates
    WHERE artist_id = p_artist_id AND blocked_date = p_requested_date
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

  -- 5. Price Estimate Snapshot if color_technique provided
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

  -- 6. Insert Into estimate_requests (Storing service_type & derived deposit_required)
  INSERT INTO public.estimate_requests (
    customer_user_id,
    artist_id,
    request_type,
    service_type,
    work_type,
    color_technique,
    status,
    deposit_required,
    quoted_price,
    placement,
    style,
    width_cm,
    height_cm,
    description,
    reference_images,
    preferred_date,
    has_medical_condition,
    medical_condition_note,
    has_allergy,
    allergy_note,
    estimated_min_price,
    estimated_max_price,
    estimated_base_price_snapshot,
    estimated_size_tier,
    estimated_size_multiplier,
    estimated_color_multiplier,
    estimated_work_type_multiplier,
    estimated_range_factor,
    estimated_rounding_increment,
    price_estimated_at,
    created_at,
    updated_at
  ) VALUES (
    auth.uid(),
    p_artist_id,
    'DIRECT_BOOKING',
    p_service_type,
    p_work_type,
    p_color_technique,
    'PENDING',
    v_deposit_required,
    NULL,
    p_placement,
    p_style,
    p_width_cm,
    p_height_cm,
    p_description,
    COALESCE(p_reference_images, '{}'),
    p_requested_date,
    COALESCE(p_has_medical_condition, false),
    CASE WHEN p_has_medical_condition IS TRUE THEN p_medical_condition_note ELSE NULL END,
    COALESCE(p_has_allergy, false),
    CASE WHEN p_has_allergy IS TRUE THEN p_allergy_note ELSE NULL END,
    v_estimated_min,
    v_estimated_max,
    v_base_snapshot,
    v_size_tier,
    v_size_mult,
    v_color_mult,
    v_work_mult,
    v_range_factor,
    v_rounding_inc,
    v_estimated_at,
    pg_catalog.now(),
    pg_catalog.now()
  ) RETURNING id INTO v_estimate_id;

  -- 7. Insert Into bookings
  INSERT INTO public.bookings (
    estimate_request_id,
    customer_user_id,
    artist_id,
    requested_date,
    requested_start_time,
    customer_note,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_estimate_id,
    auth.uid(),
    p_artist_id,
    p_requested_date,
    p_requested_start_time,
    p_customer_note,
    'WAITING_DEPOSIT',
    pg_catalog.now(),
    pg_catalog.now()
  ) RETURNING id INTO v_booking_id;

  -- 8. Return Response
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'request_type', 'DIRECT_BOOKING',
    'service_type', p_service_type,
    'deposit_required', v_deposit_required,
    'booking_status', 'WAITING_DEPOSIT',
    'estimate_request_id', v_estimate_id,
    'booking_id', v_booking_id
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_direct_booking_request(
  uuid, date, time without time zone, text, text, numeric, numeric, text, text[], boolean, text, boolean, text, text, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_direct_booking_request(
  uuid, date, time without time zone, text, text, numeric, numeric, text, text[], boolean, text, boolean, text, text, text, text, text
) TO authenticated;
