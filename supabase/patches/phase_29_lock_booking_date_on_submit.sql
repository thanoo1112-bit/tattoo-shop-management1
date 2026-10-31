-- ============================================================================
-- 157 TATTOO — PHASE 29 MIGRATION
-- LOCK BOOKING DATE ON SUCCESSFUL REQUEST SUBMISSION & ATOMIC CONCURRENCY RPC
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Create RPC: public.create_customer_estimate_request
-- Creates estimate_request with status 'PENDING' and locks the date atomically.
-- Checks active shop bookings (capacity 1/day across all artists) + STUDIO/ARTIST blocks.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_estimate_request(
  p_artist_id UUID,
  p_style TEXT,
  p_placement TEXT,
  p_width_cm NUMERIC,
  p_height_cm NUMERIC,
  p_preferred_date DATE,
  p_preferred_time TIME DEFAULT NULL,
  p_reference_images TEXT[] DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_has_medical_condition BOOLEAN DEFAULT NULL,
  p_medical_condition_note TEXT DEFAULT NULL,
  p_has_allergy BOOLEAN DEFAULT NULL,
  p_allergy_note TEXT DEFAULT NULL,
  p_work_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_id UUID;
  v_count INT;
  v_est_id UUID;
  v_flash_reservations_exists BOOLEAN;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_artist_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาเลือกช่างสักที่ต้องการ' USING ERRCODE = '22004';
  END IF;

  IF p_preferred_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาเลือกวันที่ต้องการจองคิว' USING ERRCODE = '22004';
  END IF;

  IF p_preferred_date < (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกวันที่ย้อนหลังได้' USING ERRCODE = '22023';
  END IF;

  -- 1. Atomic Advisory Lock on target date string
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lock_date:' || p_preferred_date::TEXT));

  -- 2. Check active shop bookings/requests on p_preferred_date (capacity max 1/day across all artists)
  -- Active estimate_requests
  SELECT COUNT(*) INTO v_count
  FROM public.estimate_requests
  WHERE preferred_date = p_preferred_date
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
  END IF;

  -- Active bookings
  SELECT COUNT(*) INTO v_count
  FROM public.bookings
  WHERE requested_date = p_preferred_date
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
  END IF;

  -- Active booking_sessions
  SELECT COUNT(*) INTO v_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON s.booking_id = b.id
  WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_preferred_date
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
  END IF;

  -- Check flash_reservations if table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'flash_reservations'
  ) INTO v_flash_reservations_exists;

  IF v_flash_reservations_exists THEN
    SELECT COUNT(*) INTO v_count
    FROM public.flash_reservations
    WHERE requested_date = p_preferred_date
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

    IF v_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
    END IF;
  END IF;

  -- 3. Check blocked dates: STUDIO block (all artists) OR ARTIST block (p_artist_id)
  SELECT COUNT(*) INTO v_count
  FROM public.artist_blocked_dates
  WHERE blocked_date = p_preferred_date
    AND (
      scope = 'STUDIO'
      OR (scope = 'ARTIST' AND artist_id = p_artist_id)
      OR (artist_id IS NULL AND scope IS NULL)
    );

  IF v_count > 0 THEN
    RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
  END IF;

  -- 4. Create estimate_requests with status PENDING
  INSERT INTO public.estimate_requests (
    customer_user_id,
    artist_id,
    placement,
    width_cm,
    height_cm,
    style,
    description,
    preferred_date,
    preferred_time,
    reference_images,
    has_medical_condition,
    medical_condition_note,
    has_allergy,
    allergy_note,
    request_type,
    work_type,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_customer_id,
    p_artist_id,
    COALESCE(p_placement, 'ไม่ระบุ'),
    COALESCE(p_width_cm, 10),
    COALESCE(p_height_cm, 10),
    p_style,
    COALESCE(p_description, ''),
    p_preferred_date,
    p_preferred_time,
    COALESCE(p_reference_images, ARRAY[]::TEXT[]),
    COALESCE(p_has_medical_condition, false),
    CASE WHEN p_has_medical_condition IS TRUE THEN p_medical_condition_note ELSE NULL END,
    COALESCE(p_has_allergy, false),
    CASE WHEN p_has_allergy IS TRUE THEN p_allergy_note ELSE NULL END,
    'ESTIMATE',
    p_work_type,
    'PENDING',
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_est_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_est_id,
    'status', 'PENDING'
  );
END;
$$;

-- Secure RPC Permissions
REVOKE ALL ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 2. Update RPC: public.customer_edit_booking_or_estimate
-- Adds atomic advisory lock and self-exclusion checks on edited dates.
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
  p_description TEXT DEFAULT NULL,
  p_has_medical_condition BOOLEAN DEFAULT NULL,
  p_medical_condition_note TEXT DEFAULT NULL,
  p_has_allergy BOOLEAN DEFAULT NULL,
  p_allergy_note TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_customer_id UUID;
  v_est_id UUID;
  v_booking_id UUID;
  v_est_status TEXT;
  v_book_status TEXT;
  v_has_slip BOOLEAN := false;
  v_busy_count INT;
  v_flash_reservations_exists BOOLEAN;
  v_target_artist_id UUID;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Lock estimate_request if target is estimate_requests.id
  SELECT id, status, customer_user_id, artist_id
  INTO v_est_id, v_est_status, v_customer_id, v_target_artist_id
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
    SELECT id, estimate_request_id, status, customer_user_id, artist_id
    INTO v_booking_id, v_est_id, v_book_status, v_customer_id, v_target_artist_id
    FROM public.bookings
    WHERE id = p_target_id FOR UPDATE;

    IF v_booking_id IS NULL THEN
      RAISE EXCEPTION 'ไม่พบรายการที่ต้องการแก้ไข';
    END IF;

    IF v_customer_id != auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized ownership';
    END IF;

    IF v_est_id IS NOT NULL THEN
      SELECT status, artist_id
      INTO v_est_status, v_target_artist_id
      FROM public.estimate_requests
      WHERE id = v_est_id FOR UPDATE;
    END IF;
  END IF;

  -- Use p_artist_id if provided, else existing artist_id
  v_target_artist_id := COALESCE(p_artist_id, v_target_artist_id);

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

  -- 4. Server-side Availability Check with Atomic Lock & Self-Exclusion
  IF p_preferred_date IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lock_date:' || p_preferred_date::TEXT));

    -- Check active estimate_requests excluding current v_est_id
    SELECT COUNT(*) INTO v_busy_count
    FROM public.estimate_requests
    WHERE preferred_date = p_preferred_date
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (v_est_id IS NULL OR id != v_est_id);

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
    END IF;

    -- Check active bookings excluding current v_booking_id and v_est_id
    SELECT COUNT(*) INTO v_busy_count
    FROM public.bookings
    WHERE requested_date = p_preferred_date
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (v_booking_id IS NULL OR id != v_booking_id)
      AND (v_est_id IS NULL OR estimate_request_id != v_est_id);

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
    END IF;

    -- Check active booking_sessions excluding current v_booking_id and v_est_id
    SELECT COUNT(*) INTO v_busy_count
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_preferred_date
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (v_booking_id IS NULL OR s.booking_id != v_booking_id)
      AND (v_est_id IS NULL OR b.estimate_request_id != v_est_id);

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
    END IF;

    -- Check flash_reservations if table exists
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'flash_reservations'
    ) INTO v_flash_reservations_exists;

    IF v_flash_reservations_exists THEN
      SELECT COUNT(*) INTO v_busy_count
      FROM public.flash_reservations
      WHERE requested_date = p_preferred_date
        AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

      IF v_busy_count > 0 THEN
        RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
      END IF;
    END IF;

    -- Check artist_blocked_dates (STUDIO block or ARTIST block for v_target_artist_id)
    SELECT COUNT(*) INTO v_busy_count
    FROM public.artist_blocked_dates
    WHERE blocked_date = p_preferred_date
      AND (
        scope = 'STUDIO'
        OR (v_target_artist_id IS NOT NULL AND scope = 'ARTIST' AND artist_id = v_target_artist_id)
        OR (artist_id IS NULL AND scope IS NULL)
      );

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
    END IF;
  END IF;

  -- 5. Perform updates on estimate_requests including health disclosure fields
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
      has_medical_condition = COALESCE(p_has_medical_condition, has_medical_condition),
      medical_condition_note = CASE 
        WHEN p_has_medical_condition IS FALSE THEN NULL 
        ELSE COALESCE(p_medical_condition_note, medical_condition_note) 
      END,
      has_allergy = COALESCE(p_has_allergy, has_allergy),
      allergy_note = CASE 
        WHEN p_has_allergy IS FALSE THEN NULL 
        ELSE COALESCE(p_allergy_note, allergy_note) 
      END,
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
-- 3. Update RPC: public.get_artist_busy_ranges
-- Returns busy date ranges for calendar UI.
-- Combines: active shop bookings (capacity 1/day), STUDIO blocks, and chosen ARTIST blocks.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_artist_busy_ranges(
  p_artist_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_flash_reservations_exists BOOLEAN;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date are required' USING ERRCODE = '22004';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'p_end_date cannot be earlier than p_start_date' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'flash_reservations'
  ) INTO v_flash_reservations_exists;

  RETURN QUERY
  WITH busy_dates AS (
    -- 1. Active estimate_requests across ALL artists
    SELECT preferred_date AS d
    FROM public.estimate_requests
    WHERE preferred_date BETWEEN p_start_date AND p_end_date
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION

    -- 2. Active bookings across ALL artists
    SELECT requested_date AS d
    FROM public.bookings
    WHERE requested_date BETWEEN p_start_date AND p_end_date
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION

    -- 3. Active booking_sessions across ALL artists
    SELECT (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE AS d
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE BETWEEN p_start_date AND p_end_date
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION

    -- 4. Active flash_reservations across ALL artists (if table exists)
    SELECT requested_date AS d
    FROM public.flash_reservations
    WHERE v_flash_reservations_exists IS TRUE
      AND requested_date BETWEEN p_start_date AND p_end_date
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION

    -- 5. Studio blocked dates (ALL artists) OR Artist blocked dates for p_artist_id
    SELECT blocked_date AS d
    FROM public.artist_blocked_dates
    WHERE blocked_date BETWEEN p_start_date AND p_end_date
      AND (
        scope = 'STUDIO'
        OR (p_artist_id IS NOT NULL AND scope = 'ARTIST' AND artist_id = p_artist_id)
        OR (artist_id IS NULL AND scope IS NULL)
      )
  )
  SELECT
    (bd.d::TEXT || ' 00:00:00+07')::TIMESTAMPTZ AS start_at,
    (bd.d::TEXT || ' 23:59:59+07')::TIMESTAMPTZ AS end_at
  FROM busy_dates bd
  WHERE bd.d IS NOT NULL
  ORDER BY start_at ASC;
END;
$$;

-- Secure RPC Permissions
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
