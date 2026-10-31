-- ============================================================================
-- 157 TATTOO — FINAL DAILY CAPACITY SYSTEM (MAX 3 BOOKINGS PER ARTIST PER DAY)
-- RESTORE DUAL TIME PICKER (10:00 - 23:00) & REMOVE FIXED 3-SLOT RESTRICTIONS
-- ============================================================================
-- Rules:
--   1. 1 Artist can accept at most 3 bookings/jobs per day (Daily Capacity <= 3).
--   2. 0 jobs -> Selectable
--   3. 1 job  -> Selectable
--   4. 2 jobs -> Selectable
--   5. 3 jobs -> Full / Disabled
--   6. Original time selection: 10:00 - 23:00 with 10-minute intervals.
--   7. No fixed 3 slots (10:00 / 14:30 / 19:00 removed from backend enforcement).
--   8. No hard time overlap checking based on end time (end times vary across flows).
--   9. Single-Job Deduplication Rule:
--      • 1 customer job/booking counts as 1 job per date, regardless of whether it exists
--        simultaneously across estimate_requests, bookings, flash_reservations, or sessions.
--      • A booking confirmed from an estimate/flash request replaces that request.
--      • Additional round sessions on the SAME date as main booking do NOT double-count.
--        Sessions on a DIFFERENT date count on that session date.
--  10. No new tables or columns.
--
-- Functions updated:
--   1. public.get_artist_busy_ranges
--   2. public.create_customer_estimate_request
--   3. public.customer_edit_booking_or_estimate
--   4. public.artist_propose_alternate_booking_date
--   5. public.create_flash_reservation
--   6. public.update_flash_reservation
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC: public.get_artist_busy_ranges
-- Returns distinct busy ranges for calendar and availability display.
-- Deduplicates:
--   - Active estimate_requests without a booking
--   - Active bookings (main appointment on requested_date)
--   - Active booking_sessions on a different date from their booking's requested_date
--   - Active flash_reservations without a booking
--   - Full-day blocked dates (studio or artist scope)
-- Preserves actual booked times without normalizing to fixed slots.
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
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date are required' USING ERRCODE = '22004';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'p_end_date cannot be earlier than p_start_date' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH raw_busy_items AS (
    -- 1. Active estimate_requests that DO NOT yet have a booking
    SELECT
      (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) AS d,
      COALESCE((CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_time ELSE e.preferred_time END), '10:00:00'::TIME) AS t,
      NULL::TIMESTAMPTZ AS direct_start_at,
      NULL::TIMESTAMPTZ AS direct_end_at,
      FALSE AS is_full_day
    FROM public.estimate_requests e
    WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) BETWEEN p_start_date AND p_end_date
      AND (p_artist_id IS NULL OR e.artist_id = p_artist_id)
      AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.estimate_request_id = e.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )

    UNION ALL

    -- 2. Active bookings (canonical main appointment)
    SELECT
      b.requested_date AS d,
      COALESCE(b.requested_start_time, '10:00:00'::TIME) AS t,
      NULL::TIMESTAMPTZ AS direct_start_at,
      NULL::TIMESTAMPTZ AS direct_end_at,
      FALSE AS is_full_day
    FROM public.bookings b
    WHERE b.requested_date BETWEEN p_start_date AND p_end_date
      AND (p_artist_id IS NULL OR b.artist_id = p_artist_id)
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION ALL

    -- 3. Active booking_sessions for rounds on a DIFFERENT date from the booking's main requested_date
    SELECT
      (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE AS d,
      (s.start_at AT TIME ZONE 'Asia/Bangkok')::TIME AS t,
      s.start_at AS direct_start_at,
      s.end_at AS direct_end_at,
      FALSE AS is_full_day
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE BETWEEN p_start_date AND p_end_date
      AND (p_artist_id IS NULL OR b.artist_id = p_artist_id)
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

    UNION ALL

    -- 4. Active flash_reservations that DO NOT yet have a booking
    SELECT
      fr.requested_date AS d,
      COALESCE(fr.requested_start_time, '10:00:00'::TIME) AS t,
      NULL::TIMESTAMPTZ AS direct_start_at,
      NULL::TIMESTAMPTZ AS direct_end_at,
      FALSE AS is_full_day
    FROM public.flash_reservations fr
    JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
    WHERE fr.requested_date BETWEEN p_start_date AND p_end_date
      AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (p_artist_id IS NULL OR fd.artist_id = p_artist_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.flash_reservation_id = fr.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )

    UNION ALL

    -- 5. Blocked dates (studio or artist scope: full day block)
    SELECT
      blocked_date AS d,
      '00:00:00'::TIME AS t,
      NULL::TIMESTAMPTZ AS direct_start_at,
      NULL::TIMESTAMPTZ AS direct_end_at,
      TRUE AS is_full_day
    FROM public.artist_blocked_dates
    WHERE blocked_date BETWEEN p_start_date AND p_end_date
      AND (
        scope = 'STUDIO'
        OR (scope = 'ARTIST' AND (p_artist_id IS NULL OR artist_id = p_artist_id))
      )
  )
  SELECT DISTINCT
    CASE
      WHEN r.direct_start_at IS NOT NULL THEN r.direct_start_at
      WHEN r.is_full_day IS TRUE THEN (r.d::TEXT || ' 00:00:00+07')::TIMESTAMPTZ
      ELSE (r.d::TEXT || ' ' || r.t::TEXT || '+07')::TIMESTAMPTZ
    END AS start_at,

    CASE
      WHEN r.direct_end_at IS NOT NULL THEN r.direct_end_at
      WHEN r.is_full_day IS TRUE THEN (r.d::TEXT || ' 23:59:59+07')::TIMESTAMPTZ
      ELSE ((r.d::TEXT || ' ' || r.t::TEXT || '+07')::TIMESTAMPTZ + INTERVAL '2 hours')
    END AS end_at
  FROM raw_busy_items r
  WHERE r.d IS NOT NULL
  ORDER BY start_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO service_role;


-- ----------------------------------------------------------------------------
-- 2. RPC: public.create_customer_estimate_request
-- Checks:
--   1. Valid preferred date >= today
--   2. Atomic advisory lock on artist + date
--   3. Studio / artist blocked dates
--   4. Daily capacity: active distinct jobs for artist on that date < 3
--   5. Preferred time between 10:00 and 23:00 (no fixed 3 slots)
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
  v_saved_time TIME;
  v_daily_count INT := 0;
  v_est_id UUID;
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

  -- Validate time range (10:00 - 23:00)
  v_saved_time := COALESCE(p_preferred_time, '10:00:00'::TIME);
  IF v_saved_time < '10:00:00'::TIME OR v_saved_time > '23:00:00'::TIME THEN
    RAISE EXCEPTION 'เวลาเริ่มนัดหมายต้องอยู่ระหว่างช่วงเวลา 10:00 - 23:00 น.' USING ERRCODE = '22023';
  END IF;

  -- 1. Atomic Advisory Lock scoped to artist + date
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('lock_artist_date:' || p_artist_id::TEXT || ':' || p_preferred_date::TEXT)
  );

  -- 2. Check artist_blocked_dates
  IF EXISTS (
    SELECT 1 FROM public.artist_blocked_dates
    WHERE blocked_date = p_preferred_date
      AND (
        scope = 'STUDIO'
        OR (scope = 'ARTIST' AND artist_id = p_artist_id)
      )
  ) THEN
    RAISE EXCEPTION 'วันที่เลือกช่างไม่พร้อมให้บริการ กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- 3. Daily Capacity Check (Deduplicated active jobs)
  WITH active_distinct_jobs AS (
    -- Estimate requests without booking
    SELECT
      ('est:' || e.id::TEXT) AS job_id
    FROM public.estimate_requests e
    WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) = p_preferred_date
      AND e.artist_id = p_artist_id
      AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.estimate_request_id = e.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )

    UNION ALL

    -- Bookings (canonical main appointment)
    SELECT
      ('bk:' || b.id::TEXT) AS job_id
    FROM public.bookings b
    WHERE b.requested_date = p_preferred_date
      AND b.artist_id = p_artist_id
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION ALL

    -- Booking sessions on a DIFFERENT date
    SELECT
      ('sess:' || s.id::TEXT) AS job_id
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_preferred_date
      AND b.artist_id = p_artist_id
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

    UNION ALL

    -- Flash reservations without booking
    SELECT
      ('flash:' || fr.id::TEXT) AS job_id
    FROM public.flash_reservations fr
    JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
    WHERE fr.requested_date = p_preferred_date
      AND fd.artist_id = p_artist_id
      AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.flash_reservation_id = fr.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )
  )
  SELECT COUNT(DISTINCT job_id)
  INTO v_daily_count
  FROM active_distinct_jobs;

  -- 4. Enforce Daily Capacity <= 3
  IF v_daily_count >= 3 THEN
    RAISE EXCEPTION 'วันนี้คิวของช่างเต็มแล้ว (ครบ 3 คิวต่อวัน) กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- 5. Insert new estimate_request
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
    v_saved_time,
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

REVOKE ALL ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 3. RPC: public.customer_edit_booking_or_estimate
-- Allows editing PENDING requests while validating capacity <= 3.
-- Automatically excludes the current estimate request itself from conflict count.
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
  p_allergy_note TEXT DEFAULT NULL,
  p_work_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_est_id UUID;
  v_est_status TEXT;
  v_est_owner UUID;
  v_current_artist_id UUID;
  v_target_artist_id UUID;
  v_saved_time TIME;
  v_daily_count INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 1. Locate estimate_request
  SELECT id, status, customer_user_id, artist_id
  INTO v_est_id, v_est_status, v_est_owner, v_current_artist_id
  FROM public.estimate_requests
  WHERE id = p_target_id;

  IF v_est_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการคำขอจองคิว' USING ERRCODE = 'P0002';
  END IF;

  IF v_est_owner != v_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์แก้ไขคำขอนี้' USING ERRCODE = '42501';
  END IF;

  IF v_est_status != 'PENDING' THEN
    RAISE EXCEPTION 'สามารถแก้ไขได้เฉพาะคำขอที่อยู่ในสถานะรอตรวจสอบ (PENDING) เท่านั้น' USING ERRCODE = '22023';
  END IF;

  v_target_artist_id := COALESCE(p_artist_id, v_current_artist_id);

  IF p_preferred_date IS NOT NULL AND p_preferred_date < (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกวันที่ย้อนหลังได้' USING ERRCODE = '22023';
  END IF;

  -- 2. Validate time and capacity if date and artist are provided
  IF p_preferred_date IS NOT NULL AND v_target_artist_id IS NOT NULL THEN
    v_saved_time := COALESCE(p_preferred_time, '10:00:00'::TIME);
    IF v_saved_time < '10:00:00'::TIME OR v_saved_time > '23:00:00'::TIME THEN
      RAISE EXCEPTION 'เวลาเริ่มนัดหมายต้องอยู่ระหว่างช่วงเวลา 10:00 - 23:00 น.' USING ERRCODE = '22023';
    END IF;

    -- Advisory lock
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('lock_artist_date:' || v_target_artist_id::TEXT || ':' || p_preferred_date::TEXT)
    );

    -- Check blocked dates
    IF EXISTS (
      SELECT 1 FROM public.artist_blocked_dates
      WHERE blocked_date = p_preferred_date
        AND (
          scope = 'STUDIO'
          OR (scope = 'ARTIST' AND artist_id = v_target_artist_id)
        )
    ) THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่' USING ERRCODE = '23505';
    END IF;

    -- Check Capacity (Deduplicated, EXCLUDING current estimate request v_est_id)
    WITH active_distinct_jobs AS (
      SELECT
        ('est:' || e.id::TEXT) AS job_id
      FROM public.estimate_requests e
      WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) = p_preferred_date
        AND e.artist_id = v_target_artist_id
        AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND e.id != v_est_id
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.estimate_request_id = e.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )

      UNION ALL

      SELECT
        ('bk:' || b.id::TEXT) AS job_id
      FROM public.bookings b
      WHERE b.requested_date = p_preferred_date
        AND b.artist_id = v_target_artist_id
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.estimate_request_id IS NULL OR b.estimate_request_id != v_est_id)

      UNION ALL

      SELECT
        ('sess:' || s.id::TEXT) AS job_id
      FROM public.booking_sessions s
      JOIN public.bookings b ON s.booking_id = b.id
      WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_preferred_date
        AND b.artist_id = v_target_artist_id
        AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.estimate_request_id IS NULL OR b.estimate_request_id != v_est_id)
        AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

      UNION ALL

      SELECT
        ('flash:' || fr.id::TEXT) AS job_id
      FROM public.flash_reservations fr
      JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
      WHERE fr.requested_date = p_preferred_date
        AND fd.artist_id = v_target_artist_id
        AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.flash_reservation_id = fr.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )
    )
    SELECT COUNT(DISTINCT job_id)
    INTO v_daily_count
    FROM active_distinct_jobs;

    IF v_daily_count >= 3 THEN
      RAISE EXCEPTION 'วันนี้คิวของช่างเต็มแล้ว (ครบ 3 คิวต่อวัน) กรุณาเลือกวันใหม่' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_saved_time := p_preferred_time;
  END IF;

  -- 3. Update estimate request
  UPDATE public.estimate_requests
  SET
    artist_id = COALESCE(p_artist_id, artist_id),
    style = COALESCE(p_style, style),
    placement = COALESCE(p_placement, placement),
    width_cm = COALESCE(p_width_cm, width_cm),
    height_cm = COALESCE(p_height_cm, height_cm),
    preferred_date = COALESCE(p_preferred_date, preferred_date),
    preferred_time = COALESCE(v_saved_time, preferred_time),
    reference_images = COALESCE(p_reference_images, reference_images),
    description = COALESCE(p_description, description),
    has_medical_condition = COALESCE(p_has_medical_condition, has_medical_condition),
    medical_condition_note = CASE WHEN p_has_medical_condition IS TRUE THEN p_medical_condition_note ELSE medical_condition_note END,
    has_allergy = COALESCE(p_has_allergy, has_allergy),
    allergy_note = CASE WHEN p_has_allergy IS TRUE THEN p_allergy_note ELSE allergy_note END,
    work_type = COALESCE(p_work_type, work_type),
    updated_at = pg_catalog.now()
  WHERE id = v_est_id;

  -- 4. Update customer master profile
  IF p_has_medical_condition IS NOT NULL OR p_has_allergy IS NOT NULL THEN
    UPDATE public.customers
    SET
      has_medical_condition = COALESCE(p_has_medical_condition, has_medical_condition),
      medical_condition_note = CASE WHEN p_has_medical_condition IS TRUE THEN p_medical_condition_note ELSE medical_condition_note END,
      has_allergy = COALESCE(p_has_allergy, has_allergy),
      allergy_note = CASE WHEN p_has_allergy IS TRUE THEN p_allergy_note ELSE allergy_note END,
      health_updated_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    WHERE user_id = v_user_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_est_id,
    'message', 'อัปเดตคำขอเรียบร้อยแล้ว'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 4. RPC: public.artist_propose_alternate_booking_date
-- Validates capacity <= 3 (excluding current estimate) and saves proposed time directly.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.artist_propose_alternate_booking_date(
  p_estimate_request_id UUID,
  p_proposed_date DATE,
  p_proposed_time TIME,
  p_quoted_price NUMERIC,
  p_artist_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_artist_id UUID;
  v_is_admin BOOLEAN := FALSE;
  v_estimate RECORD;
  v_saved_time TIME;
  v_daily_count INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Admin check
  SELECT (role = 'ADMIN') INTO v_is_admin
  FROM public.admin_users
  WHERE id = v_user_id;
  v_is_admin := COALESCE(v_is_admin, FALSE);

  -- Artist check
  IF NOT v_is_admin THEN
    SELECT id INTO v_artist_id
    FROM public.artists
    WHERE user_id = v_user_id;
  END IF;

  -- 1. Fetch estimate request
  SELECT id, artist_id, status, preferred_date, customer_user_id
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการคำขอจองคิว' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_is_admin OR (v_estimate.artist_id IS NOT NULL AND v_estimate.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'คำขอจองคิวไม่อยู่ในสถานะที่สามารถเสนอวันใหม่ได้' USING ERRCODE = '22023';
  END IF;

  -- Validate proposed time (10:00 - 23:00)
  v_saved_time := COALESCE(p_proposed_time, '10:00:00'::TIME);
  IF v_saved_time < '10:00:00'::TIME OR v_saved_time > '23:00:00'::TIME THEN
    RAISE EXCEPTION 'เวลาที่เสนอต้องอยู่ระหว่างช่วงเวลา 10:00 - 23:00 น.' USING ERRCODE = '22023';
  END IF;

  -- 2. Advisory lock on artist + proposed_date
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('lock_artist_date:' || v_estimate.artist_id::TEXT || ':' || p_proposed_date::TEXT)
  );

  -- 3. Check blocked dates
  IF EXISTS (
    SELECT 1 FROM public.artist_blocked_dates
    WHERE blocked_date = p_proposed_date
      AND (
        scope = 'STUDIO'
        OR (scope = 'ARTIST' AND artist_id = v_estimate.artist_id)
      )
  ) THEN
    RAISE EXCEPTION 'วันที่เสนอไม่ว่าง กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- 4. Check Capacity on proposed_date (Deduplicated, EXCLUDING current estimate)
  WITH active_distinct_jobs AS (
    SELECT
      ('est:' || e.id::TEXT) AS job_id
    FROM public.estimate_requests e
    WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) = p_proposed_date
      AND e.artist_id = v_estimate.artist_id
      AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND e.id != p_estimate_request_id
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.estimate_request_id = e.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )

    UNION ALL

    SELECT
      ('bk:' || b.id::TEXT) AS job_id
    FROM public.bookings b
    WHERE b.requested_date = p_proposed_date
      AND b.artist_id = v_estimate.artist_id
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (b.estimate_request_id IS NULL OR b.estimate_request_id != p_estimate_request_id)

    UNION ALL

    SELECT
      ('sess:' || s.id::TEXT) AS job_id
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_proposed_date
      AND b.artist_id = v_estimate.artist_id
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (b.estimate_request_id IS NULL OR b.estimate_request_id != p_estimate_request_id)
      AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

    UNION ALL

    SELECT
      ('flash:' || fr.id::TEXT) AS job_id
    FROM public.flash_reservations fr
    JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
    WHERE fr.requested_date = p_proposed_date
      AND fd.artist_id = v_estimate.artist_id
      AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.flash_reservation_id = fr.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )
  )
  SELECT COUNT(DISTINCT job_id)
  INTO v_daily_count
  FROM active_distinct_jobs;

  IF v_daily_count >= 3 THEN
    RAISE EXCEPTION 'วันที่เสนอคิวเต็มแล้ว (ครบ 3 คิวต่อวัน) กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- 5. Update estimate request with proposed date/time
  UPDATE public.estimate_requests
  SET
    is_date_proposed = TRUE,
    proposed_date = p_proposed_date,
    proposed_time = v_saved_time,
    proposed_price = p_quoted_price,
    proposal_note = p_artist_note,
    estimated_price_min = p_quoted_price,
    estimated_price_max = p_quoted_price,
    price_quoted_at = pg_catalog.now(),
    date_proposed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'proposed_date', p_proposed_date,
    'proposed_time', v_saved_time,
    'proposed_price', p_quoted_price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 5. RPC: public.create_flash_reservation
-- Enforces daily capacity <= 3 for flash flow (deduplicated).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_flash_reservation(
  p_flash_design_id UUID,
  p_requested_date DATE DEFAULT NULL,
  p_requested_start_time TIME DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL,
  p_placement TEXT DEFAULT NULL,
  p_width_cm NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL,
  p_has_medical_condition BOOLEAN DEFAULT NULL,
  p_medical_condition_note TEXT DEFAULT NULL,
  p_has_allergy BOOLEAN DEFAULT NULL,
  p_allergy_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_flash_status TEXT;
  v_is_repeatable BOOLEAN;
  v_artist_id UUID;
  v_reservation_id UUID;
  v_saved_time TIME;
  v_daily_count INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาล็อกอินก่อนทำการจองลาย Flash' USING ERRCODE = '42501';
  END IF;

  SELECT status, COALESCE(is_repeatable, FALSE), artist_id
  INTO v_flash_status, v_is_repeatable, v_artist_id
  FROM public.flash_designs
  WHERE id = p_flash_design_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบแบบลายสัก Flash ที่ระบุ' USING ERRCODE = '22004';
  END IF;

  IF v_is_repeatable IS FALSE AND v_flash_status != 'AVAILABLE' THEN
    RAISE EXCEPTION 'แบบลายสัก Flash นี้มีผู้จองหรือถูกจำหน่ายแล้ว' USING ERRCODE = '22023';
  END IF;

  -- If date and artist are provided, validate availability
  IF p_requested_date IS NOT NULL AND v_artist_id IS NOT NULL THEN
    IF p_requested_date < (NOW() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
      RAISE EXCEPTION 'ไม่สามารถเลือกวันที่ย้อนหลังได้' USING ERRCODE = '22023';
    END IF;

    v_saved_time := COALESCE(p_requested_start_time, '10:00:00'::TIME);
    IF v_saved_time < '10:00:00'::TIME OR v_saved_time > '23:00:00'::TIME THEN
      RAISE EXCEPTION 'เวลาเริ่มนัดหมายต้องอยู่ระหว่างช่วงเวลา 10:00 - 23:00 น.' USING ERRCODE = '22023';
    END IF;

    -- Advisory lock
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('lock_artist_date:' || v_artist_id::TEXT || ':' || p_requested_date::TEXT)
    );

    -- Check blocked dates
    IF EXISTS (
      SELECT 1 FROM public.artist_blocked_dates
      WHERE blocked_date = p_requested_date
        AND (
          scope = 'STUDIO'
          OR (scope = 'ARTIST' AND artist_id = v_artist_id)
        )
    ) THEN
      RAISE EXCEPTION 'วันที่เลือกช่างไม่พร้อมให้บริการ กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
    END IF;

    -- Check Daily Capacity <= 3 (Deduplicated active jobs)
    WITH active_distinct_jobs AS (
      SELECT
        ('est:' || e.id::TEXT) AS job_id
      FROM public.estimate_requests e
      WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) = p_requested_date
        AND e.artist_id = v_artist_id
        AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.estimate_request_id = e.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )

      UNION ALL

      SELECT
        ('bk:' || b.id::TEXT) AS job_id
      FROM public.bookings b
      WHERE b.requested_date = p_requested_date
      AND b.artist_id = v_artist_id
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

      UNION ALL

      SELECT
        ('sess:' || s.id::TEXT) AS job_id
      FROM public.booking_sessions s
      JOIN public.bookings b ON s.booking_id = b.id
      WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_requested_date
        AND b.artist_id = v_artist_id
        AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

      UNION ALL

      SELECT
        ('flash:' || fr.id::TEXT) AS job_id
      FROM public.flash_reservations fr
      JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
      WHERE fr.requested_date = p_requested_date
        AND fd.artist_id = v_artist_id
        AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.flash_reservation_id = fr.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )
    )
    SELECT COUNT(DISTINCT job_id)
    INTO v_daily_count
    FROM active_distinct_jobs;

    IF v_daily_count >= 3 THEN
      RAISE EXCEPTION 'วันนี้คิวของช่างเต็มแล้ว (ครบ 3 คิวต่อวัน) กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_saved_time := p_requested_start_time;
  END IF;

  -- Create reservation
  INSERT INTO public.flash_reservations (
    flash_design_id,
    customer_user_id,
    requested_date,
    requested_start_time,
    customer_note,
    placement,
    width_cm,
    height_cm,
    status
  )
  VALUES (
    p_flash_design_id,
    v_user_id,
    p_requested_date,
    v_saved_time,
    p_customer_note,
    p_placement,
    p_width_cm,
    p_height_cm,
    'PENDING'
  )
  RETURNING id INTO v_reservation_id;

  -- Update flash design status if unique
  IF v_is_repeatable IS FALSE THEN
    UPDATE public.flash_designs
    SET status = 'RESERVED'
    WHERE id = p_flash_design_id;
  END IF;

  -- Update customer health info if provided
  IF p_has_medical_condition IS NOT NULL OR p_has_allergy IS NOT NULL THEN
    UPDATE public.customers
    SET
      has_medical_condition = COALESCE(p_has_medical_condition, has_medical_condition),
      medical_condition_note = CASE WHEN p_has_medical_condition IS TRUE THEN p_medical_condition_note ELSE NULL END,
      has_allergy = COALESCE(p_has_allergy, has_allergy),
      allergy_note = CASE WHEN p_has_allergy IS TRUE THEN p_allergy_note ELSE NULL END,
      health_updated_at = NOW(),
      updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 6. RPC: public.update_flash_reservation
-- Validates daily capacity <= 3 (deduplicated, self-excluded) for flash reservation edits.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_flash_reservation(
  p_reservation_id UUID,
  p_requested_date DATE DEFAULT NULL,
  p_requested_start_time TIME DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL,
  p_placement TEXT DEFAULT NULL,
  p_width_cm NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_status TEXT;
  v_flash_design_id UUID;
  v_artist_id UUID;
  v_saved_time TIME;
  v_daily_count INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาล็อกอินก่อนทำการแก้ไขคำขอ' USING ERRCODE = '42501';
  END IF;

  SELECT fr.customer_user_id, fr.status, fr.flash_design_id, fd.artist_id
  INTO v_owner_id, v_status, v_flash_design_id, v_artist_id
  FROM public.flash_reservations fr
  JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
  WHERE fr.id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำขอจองลาย Flash ที่ระบุ' USING ERRCODE = '22004';
  END IF;

  IF v_owner_id != v_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์แก้ไขคำขอนี้' USING ERRCODE = '42501';
  END IF;

  IF v_status != 'PENDING' THEN
    RAISE EXCEPTION 'สามารถแก้ไขได้เฉพาะคำขอที่อยู่ในสถานะรอตรวจสอบ (PENDING) เท่านั้น' USING ERRCODE = '22023';
  END IF;

  IF p_requested_date IS NOT NULL AND p_requested_date < (NOW() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกวันนัดหมายย้อนหลังได้' USING ERRCODE = '22023';
  END IF;

  IF p_requested_date IS NOT NULL AND v_artist_id IS NOT NULL THEN
    v_saved_time := COALESCE(p_requested_start_time, '10:00:00'::TIME);
    IF v_saved_time < '10:00:00'::TIME OR v_saved_time > '23:00:00'::TIME THEN
      RAISE EXCEPTION 'เวลาเริ่มนัดหมายต้องอยู่ระหว่างช่วงเวลา 10:00 - 23:00 น.' USING ERRCODE = '22023';
    END IF;

    -- Advisory lock
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('lock_artist_date:' || v_artist_id::TEXT || ':' || p_requested_date::TEXT)
    );

    -- Check blocked dates
    IF EXISTS (
      SELECT 1 FROM public.artist_blocked_dates
      WHERE blocked_date = p_requested_date
        AND (
          scope = 'STUDIO'
          OR (scope = 'ARTIST' AND artist_id = v_artist_id)
        )
    ) THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
    END IF;

    -- Check Daily Capacity <= 3 (Deduplicated active jobs, EXCLUDING p_reservation_id)
    WITH active_distinct_jobs AS (
      SELECT
        ('est:' || e.id::TEXT) AS job_id
      FROM public.estimate_requests e
      WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) = p_requested_date
        AND e.artist_id = v_artist_id
        AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.estimate_request_id = e.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )

      UNION ALL

      SELECT
        ('bk:' || b.id::TEXT) AS job_id
      FROM public.bookings b
      WHERE b.requested_date = p_requested_date
        AND b.artist_id = v_artist_id
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.flash_reservation_id IS NULL OR b.flash_reservation_id != p_reservation_id)

      UNION ALL

      SELECT
        ('sess:' || s.id::TEXT) AS job_id
      FROM public.booking_sessions s
      JOIN public.bookings b ON s.booking_id = b.id
      WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_requested_date
        AND b.artist_id = v_artist_id
        AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.flash_reservation_id IS NULL OR b.flash_reservation_id != p_reservation_id)
        AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

      UNION ALL

      SELECT
        ('flash:' || fr.id::TEXT) AS job_id
      FROM public.flash_reservations fr
      JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
      WHERE fr.requested_date = p_requested_date
        AND fd.artist_id = v_artist_id
        AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND fr.id != p_reservation_id
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.flash_reservation_id = fr.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )
    )
    SELECT COUNT(DISTINCT job_id)
    INTO v_daily_count
    FROM active_distinct_jobs;

    IF v_daily_count >= 3 THEN
      RAISE EXCEPTION 'วันนี้คิวของช่างเต็มแล้ว (ครบ 3 คิวต่อวัน) กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
    END IF;
  ELSE
    v_saved_time := p_requested_start_time;
  END IF;

  -- Update flash reservation
  UPDATE public.flash_reservations
  SET
    requested_date = COALESCE(p_requested_date, requested_date),
    requested_start_time = COALESCE(v_saved_time, requested_start_time),
    customer_note = COALESCE(p_customer_note, customer_note),
    placement = COALESCE(p_placement, placement),
    width_cm = COALESCE(p_width_cm, width_cm),
    height_cm = COALESCE(p_height_cm, height_cm),
    updated_at = NOW()
  WHERE id = p_reservation_id AND customer_user_id = v_user_id AND status = 'PENDING';

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC) TO service_role;


NOTIFY pgrst, 'reload schema';

COMMIT;
