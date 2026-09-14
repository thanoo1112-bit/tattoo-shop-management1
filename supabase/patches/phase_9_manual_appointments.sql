-- ============================================================================
-- 157 TATTOO - PHASE 9: MANUAL / OFFLINE APPOINTMENTS ARCHITECTURE
-- ============================================================================
-- Purpose:
--   Support Admin-created manual/offline appointments (from FB, LINE, Phone, Walk-in)
--   without creating fake Supabase Auth accounts or fake booking sessions.
--
-- Schema Modifications:
--   1. Allow customer_user_id to be NULL in estimate_requests & bookings
--   2. Add manual_customer_name & manual_customer_phone columns to estimate_requests
--   3. Create RPC public.admin_create_manual_appointment(...)
-- ============================================================================

BEGIN;

-- 1. Relax NOT NULL constraints for manual/offline bookings
ALTER TABLE public.estimate_requests ALTER COLUMN customer_user_id DROP NOT NULL;
ALTER TABLE public.bookings ALTER COLUMN customer_user_id DROP NOT NULL;

-- 2. Add manual customer snapshot columns to estimate_requests
ALTER TABLE public.estimate_requests ADD COLUMN IF NOT EXISTS manual_customer_name TEXT;
ALTER TABLE public.estimate_requests ADD COLUMN IF NOT EXISTS manual_customer_phone TEXT;

-- 3. Create Canonical RPC: admin_create_manual_appointment
-- Drop any legacy overloads (e.g. 12-parameter signature without p_style)
DROP FUNCTION IF EXISTS public.admin_create_manual_appointment(TEXT, TEXT, UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], TEXT);
DROP FUNCTION IF EXISTS public.admin_create_manual_appointment(TEXT, TEXT, UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], TEXT);

CREATE OR REPLACE FUNCTION public.admin_create_manual_appointment(
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_artist_id UUID,
  p_requested_date DATE,
  p_requested_start_time TIME WITHOUT TIME ZONE,
  p_work_type TEXT,
  p_placement TEXT,
  p_style TEXT,
  p_width_cm NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_reference_images TEXT[] DEFAULT '{}'::TEXT[],
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_today_bkk DATE;
  v_estimate_id UUID;
  v_booking_id UUID;
  v_artist_specialties TEXT[];
  v_effective_style TEXT;
BEGIN
  -- 1. Authorization: Require Admin Role
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin can create manual appointments' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Inputs
  IF p_customer_name IS NULL OR pg_catalog.btrim(p_customer_name) = '' THEN
    RAISE EXCEPTION 'customer_name is required' USING ERRCODE = '22004';
  END IF;

  IF p_customer_phone IS NULL OR pg_catalog.btrim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'customer_phone is required' USING ERRCODE = '22004';
  END IF;

  IF p_artist_id IS NULL THEN
    RAISE EXCEPTION 'artist_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_requested_date IS NULL THEN
    RAISE EXCEPTION 'requested_date is required' USING ERRCODE = '22004';
  END IF;

  IF p_requested_start_time IS NULL THEN
    RAISE EXCEPTION 'requested_start_time is required' USING ERRCODE = '22004';
  END IF;

  IF p_work_type IS NULL OR p_work_type NOT IN ('NEW_TATTOO', 'REWORK', 'COVER_UP', 'SCAR_COVER') THEN
    RAISE EXCEPTION 'INVALID_WORK_TYPE: work_type must be NEW_TATTOO, REWORK, COVER_UP, or SCAR_COVER' USING ERRCODE = '22023';
  END IF;

  IF p_placement IS NULL OR pg_catalog.btrim(p_placement) = '' THEN
    RAISE EXCEPTION 'placement is required' USING ERRCODE = '22004';
  END IF;

  IF p_style IS NULL OR pg_catalog.btrim(p_style) = '' THEN
    RAISE EXCEPTION 'กรุณาเลือกสไตล์งานสัก' USING ERRCODE = '22004';
  END IF;

  -- 3. Verify Active Artist and Fetch Specialties
  SELECT specialties INTO v_artist_specialties
  FROM public.artists
  WHERE id = p_artist_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Artist with ID % not found or inactive', p_artist_id USING ERRCODE = 'P0002';
  END IF;

  v_effective_style := pg_catalog.btrim(p_style);

  -- 4. Date & Availability Validation (1 Artist / 1 Customer / Day)
  v_today_bkk := (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE;
  IF p_requested_date < v_today_bkk THEN
    RAISE EXCEPTION 'Cannot create appointment for a past date (requested: %, today: %)', p_requested_date, v_today_bkk USING ERRCODE = '22023';
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

  -- 5. Insert Into estimate_requests (customer_user_id = NULL)
  INSERT INTO public.estimate_requests (
    customer_user_id,
    manual_customer_name,
    manual_customer_phone,
    artist_id,
    request_type,
    work_type,
    placement,
    style,
    width_cm,
    height_cm,
    description,
    reference_images,
    preferred_date,
    status,
    deposit_required,
    quoted_price,
    quote_note,
    created_at,
    updated_at
  ) VALUES (
    NULL,
    p_customer_name,
    p_customer_phone,
    p_artist_id,
    'DIRECT_BOOKING',
    p_work_type,
    p_placement,
    v_effective_style,
    p_width_cm,
    p_height_cm,
    p_description,
    COALESCE(p_reference_images, '{}'),
    p_requested_date,
    'ACCEPTED',
    0.00,
    NULL,
    p_admin_note,
    pg_catalog.now(),
    pg_catalog.now()
  ) RETURNING id INTO v_estimate_id;

  -- 6. Insert Into bookings (status = CONFIRMED)
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
  ) VALUES (
    v_estimate_id,
    NULL,
    p_artist_id,
    p_requested_date,
    p_requested_start_time,
    p_description,
    p_admin_note,
    'CONFIRMED',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  ) RETURNING id INTO v_booking_id;

  -- 7. Return Structured Success Payload
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'estimate_request_id', v_estimate_id,
    'status', 'CONFIRMED'
  );
END;
$function$;

-- 4. Permissions
REVOKE ALL ON FUNCTION public.admin_create_manual_appointment(TEXT, TEXT, UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_manual_appointment(TEXT, TEXT, UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_create_manual_appointment(TEXT, TEXT, UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_appointment(TEXT, TEXT, UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
