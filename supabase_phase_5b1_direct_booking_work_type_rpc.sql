-- ============================================================================
-- 157 TATTOO — PHASE 5B1 MIGRATION: DIRECT BOOKING WORK TYPE RPC SUPPORT
-- Update public.create_direct_booking_request RPC to accept p_work_type
-- ============================================================================

BEGIN;

-- Drop old 14-parameter function signature if present
DROP FUNCTION IF EXISTS public.create_direct_booking_request(
  UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT
);

-- Re-create canonical RPC with p_work_type TEXT DEFAULT NULL parameter
CREATE OR REPLACE FUNCTION public.create_direct_booking_request(
  p_artist_id UUID,
  p_requested_date DATE,
  p_requested_start_time TIME DEFAULT NULL,
  p_placement TEXT DEFAULT NULL,
  p_style TEXT DEFAULT NULL,
  p_width_cm NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_reference_images TEXT[] DEFAULT '{}',
  p_has_medical_condition BOOLEAN DEFAULT FALSE,
  p_medical_condition_note TEXT DEFAULT NULL,
  p_has_allergy BOOLEAN DEFAULT FALSE,
  p_allergy_note TEXT DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL,
  p_work_type TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_today_bkk DATE;
  v_estimate_id UUID;
  v_booking_id UUID;
BEGIN
  -- 1. Require Authenticated Session
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Required Parameters
  IF p_artist_id IS NULL THEN
    RAISE EXCEPTION 'p_artist_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_requested_date IS NULL THEN
    RAISE EXCEPTION 'p_requested_date is required' USING ERRCODE = '22004';
  END IF;

  IF p_placement IS NULL OR pg_catalog.btrim(p_placement) = '' THEN
    RAISE EXCEPTION 'placement is required' USING ERRCODE = '22004';
  END IF;

  -- 2b. Validate Work Type Parameter if provided
  IF p_work_type IS NOT NULL AND p_work_type NOT IN ('NEW_TATTOO', 'REWORK', 'COVER_UP', 'SCAR_COVER') THEN
    RAISE EXCEPTION 'INVALID_WORK_TYPE: work_type must be NEW_TATTOO, REWORK, COVER_UP, SCAR_COVER, or NULL'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Verify Active Artist Existence
  IF NOT EXISTS (
    SELECT 1 FROM public.artists
    WHERE id = p_artist_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Artist with ID % not found or inactive', p_artist_id USING ERRCODE = 'P0002';
  END IF;

  -- 4. Date Validation (Bangkok Timezone Past Date Protection)
  v_today_bkk := (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE;
  IF p_requested_date < v_today_bkk THEN
    RAISE EXCEPTION 'Cannot request booking for a past date (requested: %, today: %)', p_requested_date, v_today_bkk
      USING ERRCODE = '22023';
  END IF;

  -- 5. Artist Blocked Date Check
  IF EXISTS (
    SELECT 1 FROM public.artist_blocked_dates
    WHERE artist_id = p_artist_id AND blocked_date = p_requested_date
  ) THEN
    RAISE EXCEPTION 'ARTIST_DATE_BLOCKED: Selected date is blocked by the artist' USING ERRCODE = '22023';
  END IF;

  -- 6. Artist 1 Customer / Day Availability Check
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE artist_id = p_artist_id
      AND requested_date = p_requested_date
      AND status IN ('PENDING', 'APPROVED', 'WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')
  ) OR EXISTS (
    SELECT 1 FROM public.booking_sessions s
    WHERE s.artist_id = p_artist_id
      AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_requested_date
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
  ) THEN
    RAISE EXCEPTION 'ARTIST_DAY_ALREADY_BOOKED: Artist already has an active customer or booking on this date' USING ERRCODE = '22023';
  END IF;

  -- 7. Insert Intake Record into public.estimate_requests with work_type
  INSERT INTO public.estimate_requests (
    customer_user_id,
    artist_id,
    request_type,
    work_type,
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
    created_at,
    updated_at
  ) VALUES (
    auth.uid(),
    p_artist_id,
    'DIRECT_BOOKING',
    p_work_type,
    'PENDING',
    500.00,
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
    pg_catalog.now(),
    pg_catalog.now()
  ) RETURNING id INTO v_estimate_id;

  -- 8. Insert Booking Record into public.bookings
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

  -- 9. Return Structured Result
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'request_type', 'DIRECT_BOOKING',
    'deposit_required', 500,
    'booking_status', 'WAITING_DEPOSIT',
    'estimate_request_id', v_estimate_id,
    'booking_id', v_booking_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Hardened Function Permissions
REVOKE ALL ON FUNCTION public.create_direct_booking_request(
  UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_direct_booking_request(
  UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_direct_booking_request(
  UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT, TEXT
) TO authenticated;

COMMIT;
