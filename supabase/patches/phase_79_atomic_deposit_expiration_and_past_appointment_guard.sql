-- ============================================================================
-- 157 TATTOO — PHASE 79 MIGRATION
-- ATOMIC DEPOSIT EXPIRATION FLOW & PAST APPOINTMENT DATE GUARD
-- ============================================================================

BEGIN;

-- 1. Hardened RPC: process_expired_deposit_bookings
CREATE OR REPLACE FUNCTION public.process_expired_deposit_bookings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
  v_current_status TEXT;
  v_has_timely_submission BOOLEAN;
  v_flash_design_id UUID;
  v_is_repeatable BOOLEAN;
  v_deadline TIMESTAMPTZ;
  v_appt_time TIMESTAMPTZ;
  v_expired_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  FOR v_rec IN
    SELECT 
      b.id, 
      b.estimate_request_id,
      b.flash_reservation_id,
      b.approved_at,
      b.created_at,
      b.requested_date,
      b.requested_start_time
    FROM public.bookings b
    WHERE b.status = 'WAITING_DEPOSIT'
    FOR UPDATE OF b
  LOOP
    -- Compute base deposit deadline (24h if approved, 1h if new flow)
    IF v_rec.approved_at IS NOT NULL THEN
      v_deadline := v_rec.approved_at + INTERVAL '24 hours';
    ELSE
      v_deadline := v_rec.created_at + INTERVAL '1 hour';
    END IF;

    -- Cap deadline by requested appointment start time if set
    IF v_rec.requested_date IS NOT NULL THEN
      BEGIN
        v_appt_time := (v_rec.requested_date::text || ' ' || COALESCE(v_rec.requested_start_time, '10:00:00')::text || '+07')::TIMESTAMPTZ;
        IF v_appt_time < v_deadline THEN
          v_deadline := v_appt_time;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- Check if deadline has actually passed
    IF pg_catalog.now() < v_deadline THEN
      CONTINUE;
    END IF;

    -- RACE CONDITION GUARD: Check if customer submitted slip before deadline
    SELECT EXISTS (
      SELECT 1 FROM public.booking_payment_submissions s
      WHERE s.booking_id = v_rec.id
        AND s.status IN ('PENDING', 'APPROVED')
        AND COALESCE(s.submitted_at, s.created_at) < v_deadline
    ) INTO v_has_timely_submission;

    IF v_has_timely_submission THEN
      CONTINUE;
    END IF;

    -- Re-verify current booking status under row lock
    SELECT status INTO v_current_status
    FROM public.bookings
    WHERE id = v_rec.id;

    IF v_current_status != 'WAITING_DEPOSIT' THEN
      CONTINUE;
    END IF;

    -- A. Update Booking status to EXPIRED
    UPDATE public.bookings
    SET
      status = 'EXPIRED',
      updated_at = pg_catalog.now()
    WHERE id = v_rec.id;

    -- B. Update linked Estimate Request to EXPIRED
    IF v_rec.estimate_request_id IS NOT NULL THEN
      UPDATE public.estimate_requests
      SET
        status = 'EXPIRED',
        updated_at = pg_catalog.now()
      WHERE id = v_rec.estimate_request_id;
    END IF;

    -- C. Update linked Flash Reservation to EXPIRED
    UPDATE public.flash_reservations
    SET
      status = 'EXPIRED',
      updated_at = pg_catalog.now()
    WHERE booking_id = v_rec.id OR (v_rec.flash_reservation_id IS NOT NULL AND id = v_rec.flash_reservation_id);

    -- D. Restore Flash Design status to AVAILABLE if single-use (is_repeatable = false)
    v_flash_design_id := NULL;
    SELECT flash_design_id INTO v_flash_design_id
    FROM public.flash_reservations
    WHERE booking_id = v_rec.id OR (v_rec.flash_reservation_id IS NOT NULL AND id = v_rec.flash_reservation_id)
    LIMIT 1;

    IF v_flash_design_id IS NOT NULL THEN
      SELECT COALESCE(is_repeatable, FALSE) INTO v_is_repeatable
      FROM public.flash_designs
      WHERE id = v_flash_design_id;

      IF v_is_repeatable IS FALSE THEN
        -- Only restore to AVAILABLE if no other active reservation/booking holds this flash_design
        IF NOT EXISTS (
          SELECT 1 FROM public.flash_reservations fr
          WHERE fr.flash_design_id = v_flash_design_id
            AND fr.status NOT IN ('CANCELLED', 'EXPIRED', 'REJECTED')
            AND fr.id != COALESCE(v_rec.flash_reservation_id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) AND NOT EXISTS (
          SELECT 1 FROM public.bookings bk
          JOIN public.flash_reservations fr2 ON bk.flash_reservation_id = fr2.id
          WHERE fr2.flash_design_id = v_flash_design_id
            AND bk.status NOT IN ('CANCELLED', 'EXPIRED', 'REJECTED')
            AND bk.id != v_rec.id
        ) THEN
          UPDATE public.flash_designs
          SET status = 'AVAILABLE', updated_at = pg_catalog.now()
          WHERE id = v_flash_design_id;
        END IF;
      END IF;
    END IF;

    -- E. Cancel scheduled booking sessions
    UPDATE public.booking_sessions
    SET status = 'CANCELLED', updated_at = pg_catalog.now()
    WHERE booking_id = v_rec.id AND status NOT IN ('COMPLETED', 'CANCELLED');

    v_count := v_count + 1;
    v_expired_ids := array_append(v_expired_ids, v_rec.id);
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'expired_count', v_count,
    'expired_booking_ids', v_expired_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_expired_deposit_bookings() TO authenticated, service_role, postgres;

-- 2. Update auto_reject_expired_deposit_bookings wrapper
CREATE OR REPLACE FUNCTION public.auto_reject_expired_deposit_bookings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
BEGIN
  RETURN public.process_expired_deposit_bookings();
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_reject_expired_deposit_bookings() TO authenticated, service_role, postgres;


-- 3. Update artist_confirm_booking_request with past appointment guard
CREATE OR REPLACE FUNCTION public.artist_confirm_booking_request(
  p_estimate_request_id UUID,
  p_appointment_date DATE,
  p_start_time TIME,
  p_end_time TIME DEFAULT NULL,
  p_quoted_price NUMERIC DEFAULT NULL,
  p_deposit_required NUMERIC DEFAULT 500,
  p_artist_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_estimate RECORD;
  v_booking_id UUID;
  v_booking_status TEXT;
  v_quoted NUMERIC;
  v_deposit NUMERIC;
  v_calc_end_time TIME;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
BEGIN
  -- 1. Authorization: Require Authenticated Active Artist
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can confirm booking requests' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Inputs
  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'p_appointment_date is required' USING ERRCODE = '22004';
  END IF;

  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'p_start_time is required' USING ERRCODE = '22004';
  END IF;

  -- 3. Lock and Verify Target Estimate Request & Ownership
  SELECT id, customer_user_id, artist_id, status, description, quoted_price, width_cm, height_cm, estimated_size_tier
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'Estimate request % not found', p_estimate_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_estimate.artist_id IS NULL OR v_estimate.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only confirm requests assigned to you' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'Estimate request % is in status % (must be PENDING to confirm)', p_estimate_request_id, v_estimate.status
      USING ERRCODE = '22023';
  END IF;

  -- 4. Calculate v_calc_end_time inside Database based on Tattoo Size
  v_calc_end_time := public.calculate_tattoo_session_end_time(
    p_start_time,
    v_estimate.estimated_size_tier,
    v_estimate.width_cm,
    v_estimate.height_cm,
    v_estimate.description
  );

  -- 5. Calculate Datetime Timestamps (+07:00) using Database-calculated v_calc_end_time
  v_start_at := (p_appointment_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_appointment_date::TEXT || ' ' || v_calc_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be greater than start_at' USING ERRCODE = '22023';
  END IF;

  -- 5b. PAST APPOINTMENT DATE GUARD: Block confirmation of past dates/times
  IF v_start_at < pg_catalog.now() THEN
    RAISE EXCEPTION 'PAST_APPOINTMENT_TIME: เวลานัดหมายผ่านไปแล้ว ไม่สามารถยืนยันคิวสำหรับวันนัดเก่าได้ กรุณาเลือกวันและเวลานัดใหม่'
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Validate Price & Deposit
  v_quoted := COALESCE(p_quoted_price, v_estimate.quoted_price);
  IF v_quoted IS NOT NULL AND v_quoted < 0 THEN
    RAISE EXCEPTION 'quoted_price cannot be negative' USING ERRCODE = '22023';
  END IF;

  v_deposit := COALESCE(p_deposit_required, 500);
  IF v_deposit < 0 THEN
    RAISE EXCEPTION 'deposit_required cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_quoted IS NOT NULL AND v_quoted > 0 AND v_deposit > v_quoted THEN
    RAISE EXCEPTION 'deposit_required cannot exceed quoted_price' USING ERRCODE = '22023';
  END IF;

  -- 7. Verify Single Booking Per Estimate Rule
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE estimate_request_id = p_estimate_request_id
  ) THEN
    RAISE EXCEPTION 'A booking already exists for estimate request %', p_estimate_request_id USING ERRCODE = '23505';
  END IF;

  -- 8. Determine Booking Status based on Deposit
  IF v_deposit > 0 THEN
    v_booking_status := 'WAITING_DEPOSIT';
  ELSE
    v_booking_status := 'CONFIRMED';
  END IF;

  -- 9. Update Estimate Request to ACCEPTED
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    quoted_price = COALESCE(p_quoted_price, v_estimate.quoted_price),
    deposit_required = v_deposit,
    quote_note = p_artist_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  -- 10. Create Booking Record
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
  )
  VALUES (
    v_estimate.id,
    v_estimate.customer_user_id,
    v_artist_id,
    p_appointment_date,
    p_start_time,
    v_estimate.description,
    p_artist_note,
    v_booking_status,
    pg_catalog.now(),
    CASE WHEN v_booking_status = 'CONFIRMED' THEN pg_catalog.now() ELSE NULL END,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  -- 11. Return Structured Success Payload
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_session_id', NULL,
    'booking_status', v_booking_status,
    'start_at', v_start_at,
    'end_at', v_end_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.artist_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;


-- 4. Update artist_confirm_flash_reservation with past appointment guard
CREATE OR REPLACE FUNCTION public.artist_confirm_flash_reservation(
  p_reservation_id UUID,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res RECORD;
  v_design RECORD;
  v_booking_id UUID;
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_start_at TIMESTAMPTZ;
BEGIN
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  SELECT * INTO v_res
  FROM public.flash_reservations
  WHERE id = p_reservation_id;

  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอจอง Flash' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_design
  FROM public.flash_designs
  WHERE id = v_res.flash_design_id;

  -- Security Check: Admin OR assigned Artist only
  IF NOT (v_is_admin OR (v_design.artist_id IS NOT NULL AND v_design.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์อนุมัติคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- PAST APPOINTMENT DATE GUARD: Block approval if requested appointment time has passed
  IF v_res.requested_date IS NOT NULL THEN
    BEGIN
      v_start_at := (v_res.requested_date::text || ' ' || COALESCE(v_res.requested_start_time, '10:00:00')::text || '+07')::TIMESTAMPTZ;
      IF v_start_at < pg_catalog.now() THEN
        RAISE EXCEPTION 'PAST_APPOINTMENT_TIME: เวลานัดหมายผ่านไปแล้ว ไม่สามารถยืนยันคิวสำหรับวันนัดเก่าได้ กรุณาเลือกวันและเวลานัดใหม่'
          USING ERRCODE = 'P0001';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%PAST_APPOINTMENT_TIME%' THEN
        RAISE;
      END IF;
    END;
  END IF;

  -- 1. Check if booking already exists for this flash reservation
  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE flash_reservation_id = p_reservation_id;

  IF v_booking_id IS NULL THEN
    -- Insert new booking record in status WAITING_DEPOSIT
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
      v_res.requested_date,
      v_res.requested_start_time,
      v_res.customer_note,
      COALESCE(p_admin_note, 'อนุมัติโดยช่าง'),
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
      status = 'WAITING_DEPOSIT',
      admin_note = COALESCE(p_admin_note, admin_note),
      updated_at = pg_catalog.now()
    WHERE id = v_booking_id;
  END IF;

  -- 2. Update flash_reservations status to WAITING_DEPOSIT
  UPDATE public.flash_reservations
  SET
    status = 'WAITING_DEPOSIT',
    admin_note = COALESCE(p_admin_note, admin_note),
    approved_at = COALESCE(approved_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE id = p_reservation_id;

  -- 3. Lock flash design if single-use (is_repeatable = false)
  IF COALESCE(v_design.is_repeatable, FALSE) IS FALSE THEN
    UPDATE public.flash_designs
    SET status = 'RESERVED', updated_at = pg_catalog.now()
    WHERE id = v_design.id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'reservation_id', p_reservation_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.artist_confirm_flash_reservation(UUID, TEXT) TO authenticated, service_role;

COMMIT;
