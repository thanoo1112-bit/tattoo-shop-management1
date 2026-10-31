-- =============================================================================
-- 157 TATTOO — PHASE 100: FLASH REPEATABLE BACKEND SAFETY HARDENING
--
-- Fixes and hardens backend support for:
--   - Single-use Flash designs (is_repeatable = false)
--   - Repeatable Flash designs (is_repeatable = true)
--
-- Scope of Patches:
-- 1. customer_confirm_flash_proposed_date:
--    Prevents locking repeatable flash designs to 'RESERVED' when customer confirms
--    a shop-proposed date/time. Only single-use designs are set to 'RESERVED'.
--
-- 2. record_final_payment_and_complete_booking (& admin wrapper):
--    When completing a booking linked to a flash reservation:
--    a) Updates public.flash_reservations status = 'COMPLETED'
--    b) If is_repeatable = false: sets public.flash_designs status = 'SOLD'
--    c) If is_repeatable = true: preserves public.flash_designs status = 'AVAILABLE'
--    Leaves custom bookings (flash_reservation_id IS NULL) 100% untouched.
--
-- 3. create_flash_reservation:
--    Adds row-level locking (SELECT ... FROM public.flash_designs FOR UPDATE)
--    to prevent concurrent double-booking race conditions for single-use designs.
--    Maintains atomic transaction safety, daily capacity check, and advisory locks.
--
-- FOR REVIEW ONLY — DO NOT APPLY TO LIVE DATABASE UNTIL APPROVED.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC: public.customer_confirm_flash_proposed_date
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_confirm_flash_proposed_date(
  p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_res RECORD;
  v_design RECORD;
  v_booking_id UUID;
  v_daily_count INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 1. Fetch reservation with row lock
  SELECT fr.*
  INTO v_res
  FROM public.flash_reservations fr
  WHERE fr.id = p_reservation_id
  FOR UPDATE;

  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอจองลาย Flash' USING ERRCODE = '22004';
  END IF;

  -- 2. Verify customer ownership
  IF v_res.customer_user_id != v_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ยืนยันคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- 3. Verify status and proposal existence
  IF v_res.status != 'PENDING' THEN
    RAISE EXCEPTION 'คำขอนี้ไม่อยู่ในสถานะที่สามารถยืนยันได้' USING ERRCODE = '22023';
  END IF;

  IF v_res.proposed_date IS NULL OR v_res.proposed_time IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลวันนัดหมายใหม่ที่ร้านเสนอ' USING ERRCODE = '22023';
  END IF;

  -- 4. Fetch design with row lock to prevent race condition
  SELECT fd.*
  INTO v_design
  FROM public.flash_designs fd
  WHERE fd.id = v_res.flash_design_id
  FOR UPDATE;

  -- 5. Atomic advisory lock & daily capacity check on proposed_date
  IF v_design.artist_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('lock_artist_date:' || v_design.artist_id::TEXT || ':' || v_res.proposed_date::TEXT)
    );

    IF EXISTS (
      SELECT 1 FROM public.artist_blocked_dates
      WHERE blocked_date = v_res.proposed_date
        AND (
          scope = 'STUDIO'
          OR (scope = 'ARTIST' AND artist_id = v_design.artist_id)
        )
    ) THEN
      RAISE EXCEPTION 'วันที่เลือกช่างไม่พร้อมให้บริการ กรุณาติดต่อร้าน' USING ERRCODE = '23505';
    END IF;

    WITH active_distinct_jobs AS (
      SELECT
        ('est:' || e.id::TEXT) AS job_id
      FROM public.estimate_requests e
      WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) = v_res.proposed_date
        AND e.artist_id = v_design.artist_id
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
      WHERE b.requested_date = v_res.proposed_date
        AND b.artist_id = v_design.artist_id
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.flash_reservation_id IS NULL OR b.flash_reservation_id != p_reservation_id)

      UNION ALL

      SELECT
        ('sess:' || s.id::TEXT) AS job_id
      FROM public.booking_sessions s
      JOIN public.bookings b ON s.booking_id = b.id
      WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = v_res.proposed_date
        AND b.artist_id = v_design.artist_id
        AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.flash_reservation_id IS NULL OR b.flash_reservation_id != p_reservation_id)
        AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

      UNION ALL

      SELECT
        ('flash:' || fr.id::TEXT) AS job_id
      FROM public.flash_reservations fr
      JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
      WHERE (CASE WHEN fr.proposed_date IS NOT NULL THEN fr.proposed_date ELSE fr.requested_date END) = v_res.proposed_date
        AND fd.artist_id = v_design.artist_id
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
      RAISE EXCEPTION 'วันที่เลือกคิวเต็มแล้ว (ครบ 3 คิวต่อวัน) กรุณาติดต่อร้านเพื่อเสนอวันอื่น' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 6. Apply proposed date/time to requested_date, clear proposal fields, set WAITING_DEPOSIT
  UPDATE public.flash_reservations
  SET
    requested_date = v_res.proposed_date,
    requested_start_time = v_res.proposed_time,
    proposed_date = NULL,
    proposed_time = NULL,
    proposal_note = NULL,
    date_proposed_at = NULL,
    status = 'WAITING_DEPOSIT',
    approved_at = COALESCE(approved_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE id = p_reservation_id;

  -- 7. Duplicate Booking Protection: Insert or Update single booking linked to flash_reservation
  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE flash_reservation_id = p_reservation_id;

  IF v_booking_id IS NULL THEN
    INSERT INTO public.bookings (
      flash_reservation_id,
      customer_user_id,
      artist_id,
      requested_date,
      requested_start_time,
      customer_note,
      admin_note,
      status,
      quoted_price,
      approved_at,
      created_at,
      updated_at
    ) VALUES (
      p_reservation_id,
      v_res.customer_user_id,
      v_design.artist_id,
      v_res.proposed_date,
      v_res.proposed_time,
      v_res.customer_note,
      COALESCE(v_res.proposal_note, 'ยืนยันวันนัดหมายใหม่ตามที่ร้านเสนอ'),
      'WAITING_DEPOSIT',
      v_design.price,
      pg_catalog.now(),
      pg_catalog.now(),
      pg_catalog.now()
    )
    RETURNING id INTO v_booking_id;
  ELSE
    UPDATE public.bookings
    SET
      requested_date = v_res.proposed_date,
      requested_start_time = v_res.proposed_time,
      status = 'WAITING_DEPOSIT',
      admin_note = COALESCE(v_res.proposal_note, admin_note),
      updated_at = pg_catalog.now()
    WHERE id = v_booking_id;
  END IF;

  -- 8. Lock flash design to RESERVED only if single-use (is_repeatable = false)
  IF COALESCE(v_design.is_repeatable, FALSE) IS FALSE THEN
    UPDATE public.flash_designs
    SET status = 'RESERVED',
        updated_at = pg_catalog.now()
    WHERE id = v_design.id;
  ELSE
    -- If repeatable, ensure status remains AVAILABLE
    UPDATE public.flash_designs
    SET status = 'AVAILABLE',
        updated_at = pg_catalog.now()
    WHERE id = v_design.id AND status != 'AVAILABLE';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'booking_id', v_booking_id,
    'status', 'WAITING_DEPOSIT',
    'confirmed_date', v_res.proposed_date,
    'confirmed_time', v_res.proposed_time
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_confirm_flash_proposed_date(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_confirm_flash_proposed_date(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_confirm_flash_proposed_date(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_confirm_flash_proposed_date(UUID) TO service_role;


-- ----------------------------------------------------------------------------
-- 2. RPC: public.record_final_payment_and_complete_booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_final_payment_and_complete_booking(
  p_booking_id UUID,
  p_actual_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_auth_uid UUID;
  v_booking RECORD;
  v_total_sessions INT;
  v_active_additional_sessions INT;
  v_initial_session_id UUID;
  v_initial_session_status TEXT;
  v_recorded_paid NUMERIC(12,2);
  v_remaining_balance NUMERIC(12,2);
  v_payment_type TEXT;
  v_payment_id UUID := NULL;
  v_flash_design_id UUID;
  v_is_repeatable BOOLEAN;
BEGIN
  v_auth_uid := auth.uid();
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 1. Validate Input Parameters
  IF p_actual_price IS NULL OR p_actual_price <= 0 THEN
    RAISE EXCEPTION 'กรุณาระบุราคางานสักที่ตกลงทั้งหมด' USING ERRCODE = '22023';
  END IF;

  -- 2. Lock Parent Booking FOR UPDATE (Prevents Concurrent Double-Completion)
  SELECT id, estimate_request_id, flash_reservation_id, status, customer_user_id, customer_id, artist_id
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  -- Validate Ownership (Admin OR assigned active Artist)
  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 3. Idempotency Guard (If already COMPLETED, return clean success without duplicate payment)
  IF v_booking.status = 'COMPLETED' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'already_completed', true,
      'booking_id', p_booking_id,
      'status', 'COMPLETED'
    );
  END IF;

  -- Status Eligibility Guard
  IF v_booking.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'ไม่สามารถปิดงานได้จากสถานะปัจจุบัน (%)', v_booking.status USING ERRCODE = '22023';
  END IF;

  -- 4. Calculate All Recorded Payments under Row Lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)::NUMERIC(12,2)
  INTO v_recorded_paid
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- Over-Payment Guard: If recorded paid > actual price
  IF v_recorded_paid > p_actual_price THEN
    RAISE EXCEPTION 'ยอดรับเงินสะสม (฿%) เกินราคางานรวม (฿%) กรุณาตรวจสอบประวัติการชำระเงิน',
      v_recorded_paid, p_actual_price USING ERRCODE = '22023';
  END IF;

  -- 5. Auto-Calculate Remaining Balance
  v_remaining_balance := GREATEST(0.00, p_actual_price - v_recorded_paid);

  -- 6. Session Validation & Completion Rules
  SELECT COUNT(*) INTO v_total_sessions
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  IF v_total_sessions > 1 THEN
    SELECT COUNT(*) INTO v_active_additional_sessions
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
      AND session_number > 1
      AND status IN ('SCHEDULED', 'IN_PROGRESS');

    IF v_active_additional_sessions > 0 THEN
      RAISE EXCEPTION 'กรุณาเสร็จสิ้นรอบสักให้ครบทุกรอบก่อนปิดงาน' USING ERRCODE = '22023';
    END IF;
  ELSIF v_total_sessions = 1 THEN
    SELECT id, status INTO v_initial_session_id, v_initial_session_status
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
    ORDER BY session_number ASC, created_at ASC
    LIMIT 1;

    IF v_initial_session_status != 'COMPLETED' AND v_initial_session_status != 'CANCELLED' THEN
      UPDATE public.booking_sessions
      SET status = 'COMPLETED',
          updated_at = pg_catalog.now()
      WHERE id = v_initial_session_id;
    END IF;
  END IF;

  -- 7. REORDERED FINANCIAL INTEGRITY STEP 1: Insert Final Balance Payment FIRST
  IF v_remaining_balance > 0 THEN
    IF v_recorded_paid > 0 THEN
      v_payment_type := 'BALANCE';
    ELSE
      v_payment_type := 'FULL_PAYMENT';
    END IF;

    INSERT INTO public.booking_payments (
      booking_id,
      customer_id,
      payment_type,
      amount,
      payment_method,
      status,
      paid_at,
      note,
      created_by
    ) VALUES (
      p_booking_id,
      v_booking.customer_id,
      v_payment_type,
      v_remaining_balance,
      'CASH',
      'RECORDED',
      pg_catalog.now(),
      'บันทึกรับเงินและปิดงาน',
      v_auth_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- 8. Synchronize Linked Estimate Request quoted_price
  IF v_booking.estimate_request_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET quoted_price = p_actual_price,
        updated_at = pg_catalog.now()
    WHERE id = v_booking.estimate_request_id;
  END IF;

  -- 9. REORDERED FINANCIAL INTEGRITY STEP 2: Update Booking Status SECOND
  -- (Triggers handle_booking_status_transition, which verifies v_paid_total >= NEW.quoted_price)
  UPDATE public.bookings
  SET quoted_price = p_actual_price,
      status = 'COMPLETED',
      updated_at = pg_catalog.now()
  WHERE id = p_booking_id;

  -- 10. Synchronize Linked Flash Reservation and Flash Design
  IF v_booking.flash_reservation_id IS NOT NULL THEN
    -- A. Update flash_reservations status to COMPLETED
    UPDATE public.flash_reservations
    SET status = 'COMPLETED',
        completed_at = COALESCE(completed_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    WHERE id = v_booking.flash_reservation_id;

    -- B. Update flash_designs status based on is_repeatable
    SELECT fd.id, COALESCE(fd.is_repeatable, FALSE)
    INTO v_flash_design_id, v_is_repeatable
    FROM public.flash_reservations fr
    JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
    WHERE fr.id = v_booking.flash_reservation_id
    FOR UPDATE;

    IF v_flash_design_id IS NOT NULL THEN
      IF v_is_repeatable IS FALSE THEN
        UPDATE public.flash_designs
        SET status = 'SOLD',
            updated_at = pg_catalog.now()
        WHERE id = v_flash_design_id;
      ELSE
        -- Repeatable flash designs stay AVAILABLE
        UPDATE public.flash_designs
        SET status = 'AVAILABLE',
            updated_at = pg_catalog.now()
        WHERE id = v_flash_design_id AND status != 'AVAILABLE';
      END IF;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'actual_price', p_actual_price,
    'recorded_paid', v_recorded_paid,
    'final_payment_amount', v_remaining_balance,
    'payment_created', (v_remaining_balance > 0),
    'payment_id', v_payment_id,
    'status', 'COMPLETED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC) TO service_role;


-- Single Wrapper Alias RPC
CREATE OR REPLACE FUNCTION public.admin_record_final_payment_and_complete_booking(
  p_booking_id UUID,
  p_actual_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.record_final_payment_and_complete_booking(p_booking_id, p_actual_price);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC) TO service_role;


-- ----------------------------------------------------------------------------
-- 3. RPC: public.create_flash_reservation
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

  -- 1. Row-level lock on flash_designs to prevent race conditions and concurrent double-booking
  SELECT status, COALESCE(is_repeatable, FALSE), artist_id
  INTO v_flash_status, v_is_repeatable, v_artist_id
  FROM public.flash_designs
  WHERE id = p_flash_design_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบแบบลายสัก Flash ที่ระบุ' USING ERRCODE = '22004';
  END IF;

  -- 2. For single-use designs (is_repeatable = false), must be AVAILABLE
  IF v_is_repeatable IS FALSE AND v_flash_status != 'AVAILABLE' THEN
    RAISE EXCEPTION 'แบบลายสัก Flash นี้มีผู้จองหรือถูกจำหน่ายแล้ว' USING ERRCODE = '22023';
  END IF;

  -- 3. If date and artist are provided, validate availability and daily capacity
  IF p_requested_date IS NOT NULL AND v_artist_id IS NOT NULL THEN
    IF p_requested_date < (NOW() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
      RAISE EXCEPTION 'ไม่สามารถเลือกวันที่ย้อนหลังได้' USING ERRCODE = '22023';
    END IF;

    v_saved_time := COALESCE(p_requested_start_time, '10:00:00'::TIME);
    IF v_saved_time < '10:00:00'::TIME OR v_saved_time > '23:00:00'::TIME THEN
      RAISE EXCEPTION 'เวลาเริ่มนัดหมายต้องอยู่ระหว่างช่วงเวลา 10:00 - 23:00 น.' USING ERRCODE = '22023';
    END IF;

    -- Advisory lock for artist + requested_date
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

  -- 4. Create reservation
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

  -- 5. Update flash design status ONLY if single-use (is_repeatable = false)
  IF v_is_repeatable IS FALSE THEN
    UPDATE public.flash_designs
    SET status = 'RESERVED',
        updated_at = pg_catalog.now()
    WHERE id = p_flash_design_id;
  END IF;

  -- 6. Update customer health info if provided
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

COMMIT;
