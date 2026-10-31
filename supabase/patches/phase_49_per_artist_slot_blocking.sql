-- ============================================================================
-- 157 TATTOO — PHASE 49 FORWARD MIGRATION
-- PER-ARTIST SLOT BLOCKING FOR CUSTOM BOOKING (ESTIMATE FLOW)
-- ============================================================================
-- Change: Slot blocking scope changed from shop-wide → per-artist
-- Before: Any PENDING request on date X blocks ALL artists on date X
-- After:  A PENDING request for Artist A on date X only blocks Artist A
--         Artist B is still free to accept requests on date X
--
-- Functions updated:
--   1. create_customer_estimate_request        — advisory lock + conflict checks
--   2. customer_edit_booking_or_estimate       — advisory lock + conflict checks
--   3. get_artist_busy_ranges                  — calendar display filter
--   4. artist_propose_alternate_booking_date   — proposal conflict checks
--
-- NOT changed (intentionally):
--   • Flash Flow logic (create_flash_reservation etc.)
--   • artist_blocked_dates STUDIO scope (still blocks all artists)
--   • artist_blocked_dates ARTIST scope (already per-artist)
--   • Phase 47 calculate_tattoo_session_end_time (do not touch)
--   • booking deposit / payment logic
--   • any booking_sessions status transitions
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC: public.create_customer_estimate_request
-- Advisory lock key now scoped to artist_id + date (per-artist).
-- Conflict checks filter by p_artist_id on all tables.
-- flash_reservations conflict filtered per-artist via JOIN flash_designs.
-- artist_blocked_dates: STUDIO (all artists) or ARTIST (p_artist_id only).
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

  -- 1. Atomic Advisory Lock scoped to artist + date (per-artist, not shop-wide)
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('lock_artist_date:' || p_artist_id::TEXT || ':' || p_preferred_date::TEXT)
  );

  -- 2a. Check active estimate_requests for same ARTIST on same date
  --     (uses is_date_proposed logic from Phase 31)
  SELECT COUNT(*) INTO v_count
  FROM public.estimate_requests
  WHERE (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) = p_preferred_date
    AND artist_id = p_artist_id
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'วันที่เลือกไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันใหม่';
  END IF;

  -- 2b. Check active bookings for same ARTIST on same date
  SELECT COUNT(*) INTO v_count
  FROM public.bookings
  WHERE requested_date = p_preferred_date
    AND artist_id = p_artist_id
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'วันที่เลือกไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันใหม่';
  END IF;

  -- 2c. Check active booking_sessions for same ARTIST on same date
  SELECT COUNT(*) INTO v_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON s.booking_id = b.id
  WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_preferred_date
    AND b.artist_id = p_artist_id
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'วันที่เลือกไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันใหม่';
  END IF;

  -- 2d. Check flash_reservations for same ARTIST on same date
  --     flash_reservations has no direct artist_id; resolved via flash_design_id → flash_designs.artist_id
  SELECT COUNT(*) INTO v_count
  FROM public.flash_reservations fr
  JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
  WHERE fr.requested_date = p_preferred_date
    AND fd.artist_id = p_artist_id
    AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

  IF v_count > 0 THEN
    RAISE EXCEPTION 'วันที่เลือกไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันใหม่';
  END IF;

  -- 2e. Check blocked dates:
  --     scope = 'STUDIO' → artist_id IS NULL → blocks ALL artists (shop closed)
  --     scope = 'ARTIST' → artist_id IS NOT NULL → blocks only that specific artist
  SELECT COUNT(*) INTO v_count
  FROM public.artist_blocked_dates
  WHERE blocked_date = p_preferred_date
    AND (
      scope = 'STUDIO'
      OR (scope = 'ARTIST' AND artist_id = p_artist_id)
    );

  IF v_count > 0 THEN
    RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
  END IF;

  -- 3. Create estimate_requests with status PENDING
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

-- Permissions for create_customer_estimate_request
REVOKE ALL ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_customer_estimate_request(UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 2. RPC: public.customer_edit_booking_or_estimate
-- Advisory lock key scoped to artist + date (per-artist).
-- Conflict checks filter by v_target_artist_id on all tables.
-- flash_reservations conflict filtered per-artist via JOIN flash_designs.
-- artist_blocked_dates: STUDIO or ARTIST scope for v_target_artist_id.
-- Editing allowed ONLY when estimate_request status = PENDING.
-- If estimate has a booking already created, editing is blocked.
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
RETURNS JSONB AS $$
DECLARE
  v_customer_id UUID;
  v_est_id UUID;
  v_est_status TEXT;
  v_busy_count INT;
  v_target_artist_id UUID;
BEGIN
  v_customer_id := auth.uid();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 1. Lock estimate_request — target must be estimate_requests.id
  SELECT id, status, customer_user_id, artist_id
  INTO v_est_id, v_est_status, v_customer_id, v_target_artist_id
  FROM public.estimate_requests
  WHERE id = p_target_id FOR UPDATE;

  IF v_est_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการที่ต้องการแก้ไข';
  END IF;

  IF v_customer_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized ownership';
  END IF;

  -- 2. Enforce PENDING-only rule:
  --    Editing is allowed ONLY when estimate_request is still PENDING.
  --    If estimate has progressed (shop has accepted) → block edit.
  IF v_est_status != 'PENDING' THEN
    RAISE EXCEPTION 'ไม่สามารถแก้ไขคำขอได้หลังจากทางร้านรับคำขอแล้ว';
  END IF;

  -- Also block if a booking has already been created from this estimate
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE estimate_request_id = v_est_id
      AND status NOT IN ('CANCELLED', 'REJECTED')
  ) THEN
    RAISE EXCEPTION 'ไม่สามารถแก้ไขคำขอได้หลังจากทางร้านรับคำขอแล้ว';
  END IF;

  -- 3. Resolve target artist
  v_target_artist_id := COALESCE(p_artist_id, v_target_artist_id);

  IF v_target_artist_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลช่างสักของคำขอนี้' USING ERRCODE = '22004';
  END IF;

  -- 4. Check Date validity (no past dates)
  IF p_preferred_date IS NOT NULL AND p_preferred_date < (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกวันที่ย้อนหลังได้';
  END IF;

  -- 5. Server-side Availability Check — per-artist advisory lock + self-exclusion
  IF p_preferred_date IS NOT NULL THEN
    -- Advisory lock scoped to artist + date
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(
        'lock_artist_date:' || v_target_artist_id::TEXT || ':' || p_preferred_date::TEXT
      )
    );

    -- Check active estimate_requests for same ARTIST, excluding current v_est_id
    SELECT COUNT(*) INTO v_busy_count
    FROM public.estimate_requests
    WHERE (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) = p_preferred_date
      AND artist_id = v_target_artist_id
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND id != v_est_id;

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันใหม่';
    END IF;

    -- Check active bookings for same ARTIST, excluding booking linked to v_est_id
    SELECT COUNT(*) INTO v_busy_count
    FROM public.bookings
    WHERE requested_date = p_preferred_date
      AND artist_id = v_target_artist_id
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (estimate_request_id IS NULL OR estimate_request_id != v_est_id);

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันใหม่';
    END IF;

    -- Check active booking_sessions for same ARTIST, excluding sessions linked to v_est_id
    SELECT COUNT(*) INTO v_busy_count
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_preferred_date
      AND b.artist_id = v_target_artist_id
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (b.estimate_request_id IS NULL OR b.estimate_request_id != v_est_id);

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันใหม่';
    END IF;

    -- Check flash_reservations for same ARTIST on same date
    --   flash_reservations has no direct artist_id; resolved via flash_design_id → flash_designs.artist_id
    SELECT COUNT(*) INTO v_busy_count
    FROM public.flash_reservations fr
    JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
    WHERE fr.requested_date = p_preferred_date
      AND fd.artist_id = v_target_artist_id
      AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันใหม่';
    END IF;

    -- Check artist_blocked_dates:
    --   scope = 'STUDIO' → artist_id IS NULL → blocks ALL artists (shop closed)
    --   scope = 'ARTIST' → artist_id IS NOT NULL → blocks only that specific artist
    SELECT COUNT(*) INTO v_busy_count
    FROM public.artist_blocked_dates
    WHERE blocked_date = p_preferred_date
      AND (
        scope = 'STUDIO'
        OR (scope = 'ARTIST' AND artist_id = v_target_artist_id)
      );

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เลือกไม่ว่าง กรุณาเลือกวันใหม่';
    END IF;
  END IF;

  -- 6. Perform updates on estimate_requests including resetting proposal fields
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
    work_type = COALESCE(p_work_type, work_type),
    -- Reset proposed date state on edit (Phase 31)
    is_date_proposed = FALSE,
    proposed_date = NULL,
    proposed_time = NULL,
    proposed_price = NULL,
    proposed_artist_note = NULL,
    status = 'PENDING',
    updated_at = pg_catalog.now()
  WHERE id = v_est_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', v_est_id,
    'status', 'PENDING'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Permissions for customer_edit_booking_or_estimate
REVOKE ALL ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_edit_booking_or_estimate(UUID, UUID, TEXT, TEXT, NUMERIC, NUMERIC, DATE, TIME, TEXT[], TEXT, BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 3. RPC: public.get_artist_busy_ranges
-- Filters estimate_requests, bookings, and booking_sessions by p_artist_id.
-- Falls back to shop-wide when p_artist_id IS NULL (admin calendar, etc.).
-- flash_reservations: no direct artist_id — JOIN flash_designs to resolve artist.
-- artist_blocked_dates: scope='STUDIO' (artist_id IS NULL) blocks all artists;
--                       scope='ARTIST' (artist_id IS NOT NULL) blocks only that artist.
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
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date are required' USING ERRCODE = '22004';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'p_end_date cannot be earlier than p_start_date' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH busy_dates AS (
    -- 1. Active estimate_requests — filtered by p_artist_id (per-artist)
    --    Uses is_date_proposed logic from Phase 31
    --    Falls back to shop-wide when p_artist_id IS NULL
    SELECT (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) AS d
    FROM public.estimate_requests
    WHERE (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) BETWEEN p_start_date AND p_end_date
      AND (p_artist_id IS NULL OR artist_id = p_artist_id)
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION

    -- 2. Active bookings — filtered by p_artist_id (per-artist)
    SELECT requested_date AS d
    FROM public.bookings
    WHERE requested_date BETWEEN p_start_date AND p_end_date
      AND (p_artist_id IS NULL OR artist_id = p_artist_id)
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION

    -- 3. Active booking_sessions — filtered by booking artist (per-artist)
    SELECT (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE AS d
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE BETWEEN p_start_date AND p_end_date
      AND (p_artist_id IS NULL OR b.artist_id = p_artist_id)
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION

    -- 4. Active flash_reservations — per-artist via JOIN to flash_designs
    --    flash_reservations has no direct artist_id column.
    --    Artist is resolved through: flash_reservations.flash_design_id → flash_designs.artist_id
    --    When p_artist_id IS NULL → include all flash reservations (admin/shop-wide calendar)
    --    When p_artist_id IS NOT NULL → only reservations belonging to that artist's designs
    SELECT fr.requested_date AS d
    FROM public.flash_reservations fr
    JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
    WHERE fr.requested_date BETWEEN p_start_date AND p_end_date
      AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (p_artist_id IS NULL OR fd.artist_id = p_artist_id)

    UNION

    -- 5. artist_blocked_dates — per schema (supabase_booking_closed_days_system.sql):
    --    scope = 'STUDIO' → artist_id IS NULL → shop closed, blocks ALL artists
    --    scope = 'ARTIST' → artist_id IS NOT NULL → blocks only that specific artist
    --    Constraint chk_availability_block_scope guarantees:
    --      - scope is always 'STUDIO' or 'ARTIST' (never NULL)
    --      - STUDIO rows always have artist_id IS NULL
    --      - ARTIST rows always have artist_id IS NOT NULL
    --    When p_artist_id IS NULL → return all blocked dates (admin/shop-wide calendar)
    SELECT blocked_date AS d
    FROM public.artist_blocked_dates
    WHERE blocked_date BETWEEN p_start_date AND p_end_date
      AND (
        scope = 'STUDIO'
        OR (scope = 'ARTIST' AND (p_artist_id IS NULL OR artist_id = p_artist_id))
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

-- Permissions for get_artist_busy_ranges
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO service_role;


-- ----------------------------------------------------------------------------
-- 4. RPC: public.artist_propose_alternate_booking_date
-- Conflict checks now scoped to v_estimate.artist_id (per-artist).
-- Advisory lock key now includes artist_id.
-- flash_reservations conflict filtered per-artist via JOIN flash_designs.
-- artist_blocked_dates: STUDIO or ARTIST scope for v_estimate.artist_id.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_propose_alternate_booking_date(
  p_estimate_request_id UUID,
  p_proposed_date DATE,
  p_proposed_time TIME,
  p_quoted_price NUMERIC,
  p_artist_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_estimate RECORD;
  v_busy_count INT;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL OR p_proposed_date IS NULL OR p_proposed_time IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุวันและเวลานัดหมายใหม่' USING ERRCODE = '22004';
  END IF;

  IF p_quoted_price IS NULL OR p_quoted_price <= 0 THEN
    RAISE EXCEPTION 'กรุณากำหนดราคางานสักที่ถูกต้อง (ต้องมากกว่า 0 บาท)' USING ERRCODE = '22023';
  END IF;

  IF p_artist_note IS NULL OR pg_catalog.btrim(p_artist_note) = '' THEN
    RAISE EXCEPTION 'กรุณาระบุหมายเหตุถึงลูกค้า (เช่น เหตุผลที่เสนอวันใหม่)' USING ERRCODE = '22004';
  END IF;

  IF p_proposed_date < (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกวันที่ย้อนหลังได้' USING ERRCODE = '22023';
  END IF;

  -- 1. Select and lock target estimate request
  SELECT id, artist_id, status, preferred_date, customer_user_id
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการคำขอจองคิว' USING ERRCODE = 'P0002';
  END IF;

  -- Scope Check: Admin or Assigned Artist Only
  IF NOT (v_is_admin OR (v_estimate.artist_id IS NOT NULL AND v_estimate.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'คำขอจองคิวไม่อยู่ในสถานะที่สามารถเสนอวันใหม่ได้' USING ERRCODE = '22023';
  END IF;

  IF v_estimate.artist_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลช่างสักของคำขอนี้' USING ERRCODE = '22004';
  END IF;

  -- 2. Atomic Advisory Lock scoped to artist + proposed_date (per-artist)
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(
      'lock_artist_date:' || v_estimate.artist_id::TEXT || ':' || p_proposed_date::TEXT
    )
  );

  -- 3a. Check estimate_requests for same ARTIST on proposed_date (excluding current)
  SELECT COUNT(*) INTO v_busy_count
  FROM public.estimate_requests
  WHERE (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) = p_proposed_date
    AND artist_id = v_estimate.artist_id
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND id != v_estimate.id;

  IF v_busy_count > 0 THEN
    RAISE EXCEPTION 'วันที่เสนอไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- 3b. Check bookings for same ARTIST on proposed_date (excluding this estimate's booking)
  SELECT COUNT(*) INTO v_busy_count
  FROM public.bookings
  WHERE requested_date = p_proposed_date
    AND artist_id = v_estimate.artist_id
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND (estimate_request_id IS NULL OR estimate_request_id != v_estimate.id);

  IF v_busy_count > 0 THEN
    RAISE EXCEPTION 'วันที่เสนอไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- 3c. Check booking_sessions for same ARTIST on proposed_date (excluding this estimate's booking)
  SELECT COUNT(*) INTO v_busy_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON s.booking_id = b.id
  WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_proposed_date
    AND b.artist_id = v_estimate.artist_id
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND (b.estimate_request_id IS NULL OR b.estimate_request_id != v_estimate.id);

  IF v_busy_count > 0 THEN
    RAISE EXCEPTION 'วันที่เสนอไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- 3d. Check flash_reservations for same ARTIST on proposed_date
  --     flash_reservations has no direct artist_id; resolved via flash_design_id → flash_designs.artist_id
  SELECT COUNT(*) INTO v_busy_count
  FROM public.flash_reservations fr
  JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
  WHERE fr.requested_date = p_proposed_date
    AND fd.artist_id = v_estimate.artist_id
    AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

  IF v_busy_count > 0 THEN
    RAISE EXCEPTION 'วันที่เสนอไม่ว่างสำหรับช่างท่านนี้ กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- 3e. Check artist_blocked_dates:
  --     scope = 'STUDIO' → artist_id IS NULL → blocks ALL artists (shop closed)
  --     scope = 'ARTIST' → artist_id IS NOT NULL → blocks only that specific artist
  SELECT COUNT(*) INTO v_busy_count
  FROM public.artist_blocked_dates
  WHERE blocked_date = p_proposed_date
    AND (
      scope = 'STUDIO'
      OR (scope = 'ARTIST' AND artist_id = v_estimate.artist_id)
    );

  IF v_busy_count > 0 THEN
    RAISE EXCEPTION 'วันที่เสนอไม่ว่าง กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- 4. Update estimate_requests with proposal
  UPDATE public.estimate_requests
  SET
    proposed_date = p_proposed_date,
    proposed_time = p_proposed_time,
    proposed_price = p_quoted_price,
    proposed_artist_note = p_artist_note,
    is_date_proposed = TRUE,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', p_estimate_request_id,
    'proposed_date', p_proposed_date,
    'proposed_time', p_proposed_time,
    'proposed_price', p_quoted_price
  );
END;
$$;

-- Permissions for artist_propose_alternate_booking_date
REVOKE ALL ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) TO service_role;


NOTIFY pgrst, 'reload schema';

COMMIT;
