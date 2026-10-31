-- ============================================================================
-- 157 TATTOO — PHASE 32 MIGRATION
-- MULTI-OPTION APPOINTMENT PROPOSAL SYSTEM
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Create table public.estimate_request_date_options
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estimate_request_date_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_request_id UUID NOT NULL REFERENCES public.estimate_requests(id) ON DELETE CASCADE,
  proposed_date DATE NOT NULL,
  proposed_time TIME NOT NULL,
  option_order INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SELECTED', 'UNAVAILABLE', 'CANCELLED')),
  created_by_user_id UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT uq_estimate_request_date_option UNIQUE (estimate_request_id, proposed_date, proposed_time)
);

COMMENT ON TABLE public.estimate_request_date_options IS 'Stores multiple alternate appointment date/time options proposed by artist/admin for a customer estimate request';
COMMENT ON COLUMN public.estimate_request_date_options.option_order IS 'Sequence number of the proposed option (1, 2, or 3)';
COMMENT ON COLUMN public.estimate_request_date_options.status IS 'Status of proposed option: PENDING, SELECTED, UNAVAILABLE, CANCELLED';

-- Enable RLS on estimate_request_date_options
ALTER TABLE public.estimate_request_date_options ENABLE ROW LEVEL SECURITY;

-- RLS Policies for estimate_request_date_options
CREATE POLICY "authenticated_select_date_options"
  ON public.estimate_request_date_options
  FOR SELECT
  TO authenticated
  USING (true);

-- ----------------------------------------------------------------------------
-- 2. Create RPC: public.artist_propose_multi_booking_dates
-- Allows artist (assigned) or Admin to propose 2 to 3 appointment options.
-- Does NOT lock any dates on the studio calendar yet.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_propose_multi_booking_dates(
  p_estimate_request_id UUID,
  p_date_options JSONB,
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
  v_option_count INT;
  v_item JSONB;
  v_date DATE;
  v_time TIME;
  v_idx INT := 0;
  v_today DATE;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_artist_note IS NULL OR pg_catalog.trim(p_artist_note) = '' THEN
    RAISE EXCEPTION 'กรุณาระบุหมายเหตุถึงลูกค้า (เช่น เหตุผลที่เสนอวันใหม่)' USING ERRCODE = '22004';
  END IF;

  -- Validate json array of options
  IF p_date_options IS NULL OR jsonb_typeof(p_date_options) != 'array' THEN
    RAISE EXCEPTION 'กรุณาระบุตัวเลือกวันนัดหมายที่ถูกต้อง' USING ERRCODE = '22023';
  END IF;

  v_option_count := jsonb_array_length(p_date_options);
  IF v_option_count < 1 OR v_option_count > 3 THEN
    RAISE EXCEPTION 'กรุณาระบุตัวเลือกวันนัดหมายอย่างน้อย 1 ตัวเลือก และไม่เกิน 3 ตัวเลือก' USING ERRCODE = '22023';
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE;

  -- 1. Select and lock target estimate request
  SELECT id, artist_id, status, customer_user_id
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

  -- 2. Mark any prior PENDING options as CANCELLED (Do NOT DELETE to preserve history)
  UPDATE public.estimate_request_date_options
  SET status = 'CANCELLED'
  WHERE estimate_request_id = p_estimate_request_id
    AND status = 'PENDING';

  -- 3. Insert new proposed options
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_date_options)
  LOOP
    v_idx := v_idx + 1;
    v_date := (v_item->>'date')::DATE;
    v_time := (v_item->>'time')::TIME;

    IF v_date IS NULL OR v_time IS NULL THEN
      RAISE EXCEPTION 'ข้อมูลวันหรือเวลาในตัวเลือกที่ % ไม่ถูกต้อง', v_idx USING ERRCODE = '22023';
    END IF;

    IF v_date < v_today THEN
      RAISE EXCEPTION 'ตัวเลือกที่ %: ไม่สามารถเลือกวันที่ย้อนหลังได้', v_idx USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.estimate_request_date_options (
      estimate_request_id,
      proposed_date,
      proposed_time,
      option_order,
      status,
      created_by_user_id,
      created_at
    )
    VALUES (
      p_estimate_request_id,
      v_date,
      v_time,
      v_idx,
      'PENDING',
      auth.uid(),
      pg_catalog.now()
    )
    ON CONFLICT (estimate_request_id, proposed_date, proposed_time)
    DO UPDATE SET
      option_order = EXCLUDED.option_order,
      status = 'PENDING',
      created_at = pg_catalog.now();
  END LOOP;

  -- 4. Update estimate_requests flag
  UPDATE public.estimate_requests
  SET
    is_date_proposed = TRUE,
    proposed_artist_note = p_artist_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', p_estimate_request_id,
    'options_count', v_option_count
  );
END;
$$;

-- Secure RPC Permissions for artist_propose_multi_booking_dates
REVOKE ALL ON FUNCTION public.artist_propose_multi_booking_dates(UUID, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_propose_multi_booking_dates(UUID, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_propose_multi_booking_dates(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_propose_multi_booking_dates(UUID, JSONB, TEXT) TO service_role;


-- ----------------------------------------------------------------------------
-- 3. Create RPC: public.customer_select_booking_date_option
-- Allows customer to select 1 option from proposed options.
-- Verifies request is PENDING, is_date_proposed = TRUE, option status = PENDING.
-- Atomically locks date and checks Phase 29 availability rules.
-- Creates booking in WAITING_DEPOSIT with 500 THB deposit and quoted_price = NULL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_select_booking_date_option(
  p_option_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_user_id UUID;
  v_option RECORD;
  v_estimate RECORD;
  v_booking_id UUID;
  v_busy_count INT;
  v_flash_reservations_exists BOOLEAN;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_option_id IS NULL THEN
    RAISE EXCEPTION 'p_option_id is required' USING ERRCODE = '22004';
  END IF;

  -- 1. Select and lock target option
  SELECT id, estimate_request_id, proposed_date, proposed_time, status
  INTO v_option
  FROM public.estimate_request_date_options
  WHERE id = p_option_id
  FOR UPDATE;

  IF v_option.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบตัวเลือกวันนัดหมายที่ระบุ' USING ERRCODE = 'P0002';
  END IF;

  IF v_option.status != 'PENDING' THEN
    RAISE EXCEPTION 'ตัวเลือกนี้ไม่สามารถเลือกได้แล้ว' USING ERRCODE = '22023';
  END IF;

  -- 2. Select and lock target estimate request
  SELECT id, customer_user_id, artist_id, status, description, proposed_artist_note, is_date_proposed
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = v_option.estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการคำขอจองคิว' USING ERRCODE = 'P0002';
  END IF;

  -- Ownership Check
  IF v_estimate.customer_user_id != v_customer_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์เลือกตัวเลือกคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- Requirement Check: request status MUST be PENDING and is_date_proposed MUST be TRUE
  IF v_estimate.status != 'PENDING' OR v_estimate.is_date_proposed IS NOT TRUE THEN
    RAISE EXCEPTION 'คำขอนี้ไม่อยู่ในสถานะรอลูกค้าเลือกวันนัดหมาย' USING ERRCODE = '22023';
  END IF;

  -- 3. Atomic Advisory Lock on target proposed_date
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('lock_date:' || v_option.proposed_date::TEXT));

  -- 4. Phase 29 Full Availability Check on v_option.proposed_date (capacity max 1/day across studio)
  -- Check active estimate_requests (excluding current estimate)
  SELECT COUNT(*) INTO v_busy_count
  FROM public.estimate_requests
  WHERE (CASE WHEN is_date_proposed IS TRUE THEN NULL ELSE preferred_date END) = v_option.proposed_date
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND id != v_estimate.id;

  IF v_busy_count > 0 THEN
    UPDATE public.estimate_request_date_options SET status = 'UNAVAILABLE' WHERE id = v_option.id;
    RAISE EXCEPTION 'ตัวเลือกนี้ไม่ว่างแล้ว กรุณาเลือกตัวเลือกอื่น' USING ERRCODE = '23505';
  END IF;

  -- Check active bookings
  SELECT COUNT(*) INTO v_busy_count
  FROM public.bookings
  WHERE requested_date = v_option.proposed_date
    AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND (estimate_request_id IS NULL OR estimate_request_id != v_estimate.id);

  IF v_busy_count > 0 THEN
    UPDATE public.estimate_request_date_options SET status = 'UNAVAILABLE' WHERE id = v_option.id;
    RAISE EXCEPTION 'ตัวเลือกนี้ไม่ว่างแล้ว กรุณาเลือกตัวเลือกอื่น' USING ERRCODE = '23505';
  END IF;

  -- Check active booking_sessions
  SELECT COUNT(*) INTO v_busy_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON s.booking_id = b.id
  WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = v_option.proposed_date
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND (b.estimate_request_id IS NULL OR b.estimate_request_id != v_estimate.id);

  IF v_busy_count > 0 THEN
    UPDATE public.estimate_request_date_options SET status = 'UNAVAILABLE' WHERE id = v_option.id;
    RAISE EXCEPTION 'ตัวเลือกนี้ไม่ว่างแล้ว กรุณาเลือกตัวเลือกอื่น' USING ERRCODE = '23505';
  END IF;

  -- Check flash_reservations if table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'flash_reservations'
  ) INTO v_flash_reservations_exists;

  IF v_flash_reservations_exists THEN
    SELECT COUNT(*) INTO v_busy_count
    FROM public.flash_reservations
    WHERE requested_date = v_option.proposed_date
      AND status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED');

    IF v_busy_count > 0 THEN
      UPDATE public.estimate_request_date_options SET status = 'UNAVAILABLE' WHERE id = v_option.id;
      RAISE EXCEPTION 'ตัวเลือกนี้ไม่ว่างแล้ว กรุณาเลือกตัวเลือกอื่น' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Check artist_blocked_dates
  SELECT COUNT(*) INTO v_busy_count
  FROM public.artist_blocked_dates
  WHERE blocked_date = v_option.proposed_date
    AND (
      scope = 'STUDIO'
      OR (v_estimate.artist_id IS NOT NULL AND scope = 'ARTIST' AND artist_id = v_estimate.artist_id)
      OR (artist_id IS NULL AND scope IS NULL)
    );

  IF v_busy_count > 0 THEN
    UPDATE public.estimate_request_date_options SET status = 'UNAVAILABLE' WHERE id = v_option.id;
    RAISE EXCEPTION 'ตัวเลือกนี้ไม่ว่างแล้ว กรุณาเลือกตัวเลือกอื่น' USING ERRCODE = '23505';
  END IF;

  -- 5. Mark option SELECTED & others CANCELLED
  UPDATE public.estimate_request_date_options
  SET status = 'SELECTED'
  WHERE id = v_option.id;

  UPDATE public.estimate_request_date_options
  SET status = 'CANCELLED'
  WHERE estimate_request_id = v_estimate.id
    AND id != v_option.id
    AND status = 'PENDING';

  -- 6. Update estimate_requests to ACCEPTED status, preferred_date/time set to chosen option
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    preferred_date = v_option.proposed_date,
    preferred_time = v_option.proposed_time,
    is_date_proposed = FALSE,
    quoted_price = NULL,
    deposit_required = 500,
    quote_note = v_estimate.proposed_artist_note,
    updated_at = pg_catalog.now()
  WHERE id = v_estimate.id;

  -- 7. Insert into public.bookings with status WAITING_DEPOSIT and 500 THB deposit
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
    v_option.proposed_date,
    v_option.proposed_time,
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
    'estimate_request_id', v_estimate.id,
    'booking_id', v_booking_id,
    'booking_status', 'WAITING_DEPOSIT',
    'selected_date', v_option.proposed_date,
    'selected_time', v_option.proposed_time
  );
END;
$$;

-- Secure RPC Permissions for customer_select_booking_date_option
REVOKE ALL ON FUNCTION public.customer_select_booking_date_option(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_select_booking_date_option(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_select_booking_date_option(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_select_booking_date_option(UUID) TO service_role;


-- ----------------------------------------------------------------------------
-- 4. Update RPC: public.customer_edit_booking_or_estimate
-- Resets proposed options to CANCELLED on customer edit.
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
    WHERE (CASE WHEN is_date_proposed IS TRUE THEN NULL ELSE preferred_date END) = p_preferred_date
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

  -- 5. Perform updates on estimate_requests including resetting proposal options
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
      proposed_artist_note = NULL,
      status = 'PENDING',
      updated_at = pg_catalog.now()
    WHERE id = v_est_id;

    -- Cancel all pending date options for this estimate_request
    UPDATE public.estimate_request_date_options
    SET status = 'CANCELLED'
    WHERE estimate_request_id = v_est_id
      AND status = 'PENDING';
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
-- 5. Update RPC: public.get_artist_busy_ranges
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
    -- 1. Active estimate_requests (evaluating preferred_date ONLY when is_date_proposed IS NOT TRUE)
    SELECT preferred_date AS d
    FROM public.estimate_requests
    WHERE is_date_proposed IS NOT TRUE
      AND preferred_date BETWEEN p_start_date AND p_end_date
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
