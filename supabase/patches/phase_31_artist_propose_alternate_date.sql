-- ============================================================================
-- 157 TATTOO — PHASE 31 MIGRATION
-- ARTIST PROPOSE ALTERNATE BOOKING DATE & ATOMIC CUSTOMER ACCEPTANCE
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Add proposal columns to public.estimate_requests
-- ----------------------------------------------------------------------------
ALTER TABLE public.estimate_requests
ADD COLUMN IF NOT EXISTS proposed_date DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS proposed_time TIME DEFAULT NULL,
ADD COLUMN IF NOT EXISTS proposed_price NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS proposed_artist_note TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_date_proposed BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.estimate_requests.proposed_date IS 'Alternate appointment date proposed by artist';
COMMENT ON COLUMN public.estimate_requests.proposed_time IS 'Alternate appointment time proposed by artist';
COMMENT ON COLUMN public.estimate_requests.proposed_price IS 'Actual tattoo price quoted by artist for proposed date';
COMMENT ON COLUMN public.estimate_requests.proposed_artist_note IS 'Note or explanation to customer for proposed date';
COMMENT ON COLUMN public.estimate_requests.is_date_proposed IS 'Flag indicating artist has proposed an alternate date awaiting customer response';

-- ----------------------------------------------------------------------------
-- 2. Create RPC: public.artist_propose_alternate_booking_date
-- Allows artist (or Admin) to propose an alternate appointment date/time/price for a PENDING request.
-- Atomically releases lock on preferred_date and locks proposed_date (capacity 1/day across studio).
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
  v_flash_reservations_exists BOOLEAN;
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

  IF p_artist_note IS NULL OR pg_catalog.trim(p_artist_note) = '' THEN
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

  -- 2. Atomic Advisory Lock on target proposed date
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lock_date:' || p_proposed_date::TEXT));

  -- 3. Check shop capacity on p_proposed_date (capacity max 1/day across all artists)
  -- Active estimate_requests (excluding current estimate)
  SELECT COUNT(*) INTO v_busy_count
  FROM public.estimate_requests
  WHERE (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) = p_proposed_date
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND id != v_estimate.id;

  IF v_busy_count > 0 THEN
    RAISE EXCEPTION 'วันที่เสนอไม่ว่าง กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- Active bookings
  SELECT COUNT(*) INTO v_busy_count
  FROM public.bookings
  WHERE requested_date = p_proposed_date
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND (estimate_request_id IS NULL OR estimate_request_id != v_estimate.id);

  IF v_busy_count > 0 THEN
    RAISE EXCEPTION 'วันที่เสนอไม่ว่าง กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- Active booking_sessions
  SELECT COUNT(*) INTO v_busy_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON s.booking_id = b.id
  WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_proposed_date
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND (b.estimate_request_id IS NULL OR b.estimate_request_id != v_estimate.id);

  IF v_busy_count > 0 THEN
    RAISE EXCEPTION 'วันที่เสนอไม่ว่าง กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- Active flash_reservations if table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'flash_reservations'
  ) INTO v_flash_reservations_exists;

  IF v_flash_reservations_exists THEN
    SELECT COUNT(*) INTO v_busy_count
    FROM public.flash_reservations
    WHERE requested_date = p_proposed_date
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

    IF v_busy_count > 0 THEN
      RAISE EXCEPTION 'วันที่เสนอไม่ว่าง กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Check artist_blocked_dates (STUDIO block or ARTIST block for v_estimate.artist_id)
  SELECT COUNT(*) INTO v_busy_count
  FROM public.artist_blocked_dates
  WHERE blocked_date = p_proposed_date
    AND (
      scope = 'STUDIO'
      OR (v_estimate.artist_id IS NOT NULL AND scope = 'ARTIST' AND artist_id = v_estimate.artist_id)
      OR (artist_id IS NULL AND scope IS NULL)
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

-- Secure RPC Permissions for artist_propose_alternate_booking_date
REVOKE ALL ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_propose_alternate_booking_date(UUID, DATE, TIME, NUMERIC, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 3. Create RPC: public.customer_accept_artist_date_proposal
-- Allows customer to accept proposed date/time/price from artist.
-- Transitions request to ACCEPTED and creates booking in WAITING_DEPOSIT status.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_accept_artist_date_proposal(
  p_estimate_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_user_id UUID;
  v_estimate RECORD;
  v_booking_id UUID;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  -- Select and lock target estimate request
  SELECT id, customer_user_id, artist_id, status, description, proposed_date, proposed_time, proposed_price, proposed_artist_note, is_date_proposed
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการคำขอจองคิว' USING ERRCODE = 'P0002';
  END IF;

  -- Ownership Check
  IF v_estimate.customer_user_id != v_customer_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ตอบรับคำขอนี้' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' OR v_estimate.is_date_proposed IS NOT TRUE OR v_estimate.proposed_date IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อเสนอวันนัดหมายใหม่ที่สามารถตอบรับได้' USING ERRCODE = '22023';
  END IF;

  -- 1. Update estimate_requests to ACCEPTED with proposed price & deposit 500
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    quoted_price = v_estimate.proposed_price,
    deposit_required = 500,
    quote_note = v_estimate.proposed_artist_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  -- 2. Insert into public.bookings with status WAITING_DEPOSIT
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
    created_at,
    updated_at
  )
  VALUES (
    v_estimate.id,
    v_estimate.customer_user_id,
    v_estimate.artist_id,
    v_estimate.proposed_date,
    COALESCE(v_estimate.proposed_time, '10:00:00'::TIME),
    v_estimate.description,
    v_estimate.proposed_artist_note,
    'WAITING_DEPOSIT',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_status', 'WAITING_DEPOSIT'
  );
END;
$$;

-- Secure RPC Permissions for customer_accept_artist_date_proposal
REVOKE ALL ON FUNCTION public.customer_accept_artist_date_proposal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_accept_artist_date_proposal(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_accept_artist_date_proposal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_accept_artist_date_proposal(UUID) TO service_role;


-- ----------------------------------------------------------------------------
-- 4. Update RPC: public.create_customer_estimate_request
-- Evaluates active dates considering is_date_proposed.
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
  SELECT COUNT(*) INTO v_count
  FROM public.estimate_requests
  WHERE (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) = p_preferred_date
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

  -- Check blocked dates
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


-- ----------------------------------------------------------------------------
-- 5. Update RPC: public.customer_edit_booking_or_estimate
-- Resets proposal fields on edit and checks active dates considering is_date_proposed.
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
    WHERE (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) = p_preferred_date
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

    -- Check artist_blocked_dates
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

  -- 5. Perform updates on estimate_requests including resetting proposal fields
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
      work_type = COALESCE(p_work_type, work_type),
      -- Reset proposed date state on edit
      is_date_proposed = FALSE,
      proposed_date = NULL,
      proposed_time = NULL,
      proposed_price = NULL,
      proposed_artist_note = NULL,
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
-- 6. Update RPC: public.get_artist_busy_ranges
-- Evaluates active dates considering is_date_proposed.
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
    -- 1. Active estimate_requests across ALL artists (evaluating proposed_date when is_date_proposed is TRUE)
    SELECT (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) AS d
    FROM public.estimate_requests
    WHERE (CASE WHEN is_date_proposed IS TRUE THEN proposed_date ELSE preferred_date END) BETWEEN p_start_date AND p_end_date
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

-- Secure RPC Permissions for get_artist_busy_ranges
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
