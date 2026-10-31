-- ============================================================================
-- 157 TATTOO — PHASE 56 FORWARD MIGRATION
-- MULTI-SESSION ADD SESSION WITH PAYMENT AND ENHANCED COMPLETION RPCs
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Schema Migration: Add quoted_price to public.bookings (Flash Bookings support)
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS quoted_price NUMERIC(12,2);

-- ----------------------------------------------------------------------------
-- 2. View: public.booking_payment_summary
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.booking_payment_summary
WITH (security_invoker = true)
AS
SELECT
  b.id AS booking_id,
  b.estimate_request_id,
  b.customer_user_id,
  b.artist_id,
  COALESCE(e.quoted_price, b.quoted_price) AS quoted_price,
  e.deposit_required AS deposit_required,
  COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00)::NUMERIC(12,2) AS paid_total,
  CASE
    WHEN COALESCE(e.quoted_price, b.quoted_price) IS NULL THEN NULL::NUMERIC(12,2)
    ELSE GREATEST(COALESCE(e.quoted_price, b.quoted_price) - COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00), 0.00)::NUMERIC(12,2)
  END AS remaining_balance,
  CASE
    WHEN e.deposit_required IS NULL OR e.deposit_required <= 0 THEN true
    ELSE COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) >= e.deposit_required
  END AS deposit_paid,
  CASE
    WHEN COALESCE(e.quoted_price, b.quoted_price) IS NULL OR COALESCE(e.quoted_price, b.quoted_price) <= 0 THEN false
    ELSE COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) >= COALESCE(e.quoted_price, b.quoted_price)
  END AS is_fully_paid
FROM public.bookings b
LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
LEFT JOIN public.booking_payments bp ON bp.booking_id = b.id
GROUP BY
  b.id,
  b.estimate_request_id,
  b.customer_user_id,
  b.artist_id,
  b.quoted_price,
  e.quoted_price,
  e.deposit_required;

GRANT SELECT ON public.booking_payment_summary TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Core Atomic RPC: add_booking_session_with_payment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_booking_session_with_payment(
  p_booking_id UUID,
  p_session_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_end_time TIME WITHOUT TIME ZONE,
  p_note TEXT DEFAULT NULL,
  p_quoted_price NUMERIC DEFAULT NULL,
  p_payment_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'CASH',
  p_current_session_id UUID DEFAULT NULL
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
  v_current_quoted_price NUMERIC(12,2);
  v_effective_quoted_price NUMERIC(12,2);
  v_target_session RECORD;
  v_current_session_num INT;
  v_next_session_num INT;
  v_closed_session_id UUID;
  v_current_session_date DATE;
  v_artist_session_count INT;
  v_total_recorded NUMERIC(12,2);
  v_payment_type TEXT;
  v_payment_id UUID;
  v_new_session_id UUID;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
BEGIN
  v_auth_uid := auth.uid();
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 1. Validate Basic Inputs
  IF p_session_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุวันที่นัดหมายรอบสัก' USING ERRCODE = '22023';
  END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด' USING ERRCODE = '22023';
  END IF;
  IF p_start_time >= p_end_time THEN
    RAISE EXCEPTION 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มรอบสัก' USING ERRCODE = '22023';
  END IF;
  IF p_payment_amount IS NULL OR p_payment_amount < 0 THEN
    RAISE EXCEPTION 'ยอดรับเงินประจำรอบต้องไม่ติดลบ' USING ERRCODE = '22023';
  END IF;

  -- 2. Lock Parent Booking Row FOR UPDATE
  SELECT id, estimate_request_id, status, customer_user_id, customer_id, artist_id, quoted_price
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('CANCELLED', 'REJECTED', 'EXPIRED') THEN
    RAISE EXCEPTION 'ไม่สามารถเพิ่มรอบสักในคิวงานที่ยกเลิกหรือถูกปฏิเสธแล้ว' USING ERRCODE = '22023';
  END IF;

  -- 3. Strict Server Enforcement: Price can be set ONCE. Never overwrite established price!
  IF v_booking.estimate_request_id IS NOT NULL THEN
    SELECT quoted_price INTO v_current_quoted_price
    FROM public.estimate_requests
    WHERE id = v_booking.estimate_request_id
    FOR UPDATE;
  ELSE
    v_current_quoted_price := v_booking.quoted_price;
  END IF;

  IF v_current_quoted_price IS NOT NULL AND v_current_quoted_price > 0 THEN
    -- Server already has an established price -> STRICTLY USE IT, NEVER OVERWRITE
    v_effective_quoted_price := v_current_quoted_price;
  ELSE
    -- Price not set yet -> Require valid p_quoted_price and write ONCE
    IF p_quoted_price IS NULL OR p_quoted_price <= 0 THEN
      RAISE EXCEPTION 'กรุณาระบุราคางานสักที่ตกลงทั้งหมด' USING ERRCODE = '22023';
    END IF;

    v_effective_quoted_price := p_quoted_price;

    IF v_booking.estimate_request_id IS NOT NULL THEN
      UPDATE public.estimate_requests
      SET quoted_price = p_quoted_price,
          updated_at = pg_catalog.now()
      WHERE id = v_booking.estimate_request_id;
    ELSE
      UPDATE public.bookings
      SET quoted_price = p_quoted_price,
          updated_at = pg_catalog.now()
      WHERE id = p_booking_id;
    END IF;
  END IF;

  -- 4. Lock & Complete Current Session (Session being finished)
  IF p_current_session_id IS NOT NULL THEN
    SELECT id, booking_id, session_number, status, start_at
    INTO v_target_session
    FROM public.booking_sessions
    WHERE id = p_current_session_id
    FOR UPDATE;

    IF v_target_session.id IS NULL OR v_target_session.booking_id != p_booking_id THEN
      RAISE EXCEPTION 'รอบสักที่ระบุไม่ถูกต้องหรือไม่ตรงกับคิวงานนี้' USING ERRCODE = '22023';
    END IF;

    v_current_session_date := (v_target_session.start_at AT TIME ZONE 'Asia/Bangkok')::DATE;

    IF v_target_session.status != 'COMPLETED' THEN
      UPDATE public.booking_sessions
      SET status = 'COMPLETED',
          updated_at = pg_catalog.now()
      WHERE id = p_current_session_id;
    END IF;

    v_closed_session_id := p_current_session_id;
    v_current_session_num := v_target_session.session_number;
    v_next_session_num := v_current_session_num + 1;
  ELSE
    SELECT id, session_number, status, start_at
    INTO v_target_session
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
      AND status IN ('SCHEDULED', 'IN_PROGRESS')
    ORDER BY session_number ASC
    LIMIT 1
    FOR UPDATE;

    IF v_target_session.id IS NOT NULL THEN
      v_current_session_date := (v_target_session.start_at AT TIME ZONE 'Asia/Bangkok')::DATE;

      UPDATE public.booking_sessions
      SET status = 'COMPLETED',
          updated_at = pg_catalog.now()
      WHERE id = v_target_session.id;

      v_closed_session_id := v_target_session.id;
      v_current_session_num := v_target_session.session_number;
      v_next_session_num := v_current_session_num + 1;
    ELSE
      SELECT COALESCE(MAX(session_number), 0), MAX((start_at AT TIME ZONE 'Asia/Bangkok')::DATE)
      INTO v_current_session_num, v_current_session_date
      FROM public.booking_sessions
      WHERE booking_id = p_booking_id;

      v_closed_session_id := NULL;
      v_next_session_num := v_current_session_num + 1;
    END IF;
  END IF;

  -- 4.1 Validate Next Session Date Must Be strictly AFTER Current Session Date
  IF v_current_session_date IS NOT NULL AND p_session_date <= v_current_session_date THEN
    RAISE EXCEPTION 'รอบถัดไปต้องเป็นวันหลังจากรอบปัจจุบัน' USING ERRCODE = '22023';
  END IF;

  -- 4.2 Validate Artist Availability on Requested Next Session Date
  IF v_booking.artist_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_artist_session_count
    FROM public.booking_sessions
    WHERE artist_id = v_booking.artist_id
      AND status IN ('SCHEDULED', 'IN_PROGRESS')
      AND (start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_session_date;

    IF v_artist_session_count > 0 THEN
      RAISE EXCEPTION 'ช่างมีคิวในวันที่เลือกแล้ว กรุณาเลือกวันอื่น' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 5. Calculate Total Recorded Payments & Validate New Payment
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)::NUMERIC(12,2)
  INTO v_total_recorded
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  IF p_payment_amount > 0 THEN
    IF (v_total_recorded + p_payment_amount) > v_effective_quoted_price THEN
      RAISE EXCEPTION 'ยอดรับเงินสะสม (฿%) รวมกับยอดวันนี้ (฿%) เกินราคางานรวมที่ตกลง (฿%)',
        v_total_recorded, p_payment_amount, v_effective_quoted_price USING ERRCODE = '22023';
    END IF;

    v_payment_type := 'BALANCE';

    -- Insert payment bound to v_closed_session_id (the session just completed)
    INSERT INTO public.booking_payments (
      booking_id,
      customer_id,
      booking_session_id,
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
      v_closed_session_id,
      v_payment_type,
      p_payment_amount,
      COALESCE(p_payment_method, 'CASH'),
      'RECORDED',
      pg_catalog.now(),
      COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), 'รับชำระประจำรอบสัก'),
      v_auth_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- 6. Create Next Session (SCHEDULED)
  v_start_at := (p_session_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_session_date::TEXT || ' ' || p_end_time::TEXT || '+07')::TIMESTAMPTZ;

  INSERT INTO public.booking_sessions (
    booking_id,
    artist_id,
    session_number,
    start_at,
    end_at,
    status,
    note,
    created_at,
    updated_at
  ) VALUES (
    p_booking_id,
    v_booking.artist_id,
    v_next_session_num,
    v_start_at,
    v_end_at,
    'SCHEDULED',
    COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), NULL),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_new_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'closed_session_id', v_closed_session_id,
    'new_session_id', v_new_session_id,
    'next_session_number', v_next_session_num,
    'quoted_price', v_effective_quoted_price,
    'payment_id', v_payment_id,
    'payment_amount', p_payment_amount
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. Wrapper RPC: admin_add_booking_session_with_payment
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_add_booking_session_with_payment(
  p_booking_id UUID,
  p_session_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_end_time TIME WITHOUT TIME ZONE,
  p_note TEXT DEFAULT NULL,
  p_quoted_price NUMERIC DEFAULT NULL,
  p_payment_amount NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'CASH',
  p_current_session_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.add_booking_session_with_payment(
    p_booking_id,
    p_session_date,
    p_start_time,
    p_end_time,
    p_note,
    p_quoted_price,
    p_payment_amount,
    p_payment_method,
    p_current_session_id
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 5. Core RPC: record_final_payment_and_complete_booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_final_payment_and_complete_booking(
  p_booking_id UUID,
  p_actual_price NUMERIC,
  p_received_today NUMERIC,
  p_payment_method TEXT DEFAULT 'CASH',
  p_note TEXT DEFAULT NULL
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
  v_current_quoted_price NUMERIC(12,2);
  v_effective_quoted_price NUMERIC(12,2);
  v_total_sessions INT;
  v_active_additional_sessions INT;
  v_initial_session_id UUID;
  v_initial_session_status TEXT;
  v_recorded_paid NUMERIC(12,2);
  v_remaining_balance NUMERIC(12,2);
  v_payment_type TEXT;
  v_payment_id UUID;
BEGIN
  v_auth_uid := auth.uid();
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 1. Validate Input Parameters
  IF p_received_today IS NULL OR p_received_today < 0 THEN
    RAISE EXCEPTION 'ยอดที่รับวันนี้ต้องไม่ติดลบ' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'QR', 'CARD', 'CREDIT_CARD', 'OTHER') THEN
    RAISE EXCEPTION 'วิธีชำระเงินไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;

  -- 2. Lock Parent Booking FOR UPDATE
  SELECT id, estimate_request_id, status, customer_user_id, customer_id, artist_id, quoted_price
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- Idempotency Guard
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

  -- 3. Strict Server Enforcement: Price can be set ONCE. Never overwrite established price!
  IF v_booking.estimate_request_id IS NOT NULL THEN
    SELECT quoted_price INTO v_current_quoted_price
    FROM public.estimate_requests
    WHERE id = v_booking.estimate_request_id
    FOR UPDATE;
  ELSE
    v_current_quoted_price := v_booking.quoted_price;
  END IF;

  IF v_current_quoted_price IS NOT NULL AND v_current_quoted_price > 0 THEN
    v_effective_quoted_price := v_current_quoted_price;
  ELSE
    IF p_actual_price IS NULL OR p_actual_price <= 0 THEN
      RAISE EXCEPTION 'ราคางานจริงต้องระบุและมากกว่า 0' USING ERRCODE = '22023';
    END IF;
    v_effective_quoted_price := p_actual_price;

    IF v_booking.estimate_request_id IS NOT NULL THEN
      UPDATE public.estimate_requests
      SET quoted_price = p_actual_price,
          updated_at = pg_catalog.now()
      WHERE id = v_booking.estimate_request_id;
    ELSE
      UPDATE public.bookings
      SET quoted_price = p_actual_price,
          updated_at = pg_catalog.now()
      WHERE id = p_booking_id;
    END IF;
  END IF;

  -- 4. Calculate All Recorded Payments under Row Lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)::NUMERIC(12,2)
  INTO v_recorded_paid
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- 5. Over-Payment Guard
  IF v_recorded_paid > v_effective_quoted_price THEN
    RAISE EXCEPTION 'ยอดรับเงินสะสม (฿%) เกินราคางานรวม (฿%) กรุณาตรวจสอบประวัติการชำระเงิน',
      v_recorded_paid, v_effective_quoted_price USING ERRCODE = '22023';
  END IF;

  v_remaining_balance := v_effective_quoted_price - v_recorded_paid;

  -- Validate Received Today Equals Remaining Balance
  IF p_received_today <> v_remaining_balance THEN
    RAISE EXCEPTION 'ยอดที่รับวันนี้ (฿%) ต้องเท่ากับยอดคงเหลือที่ต้องรับ (฿%)',
      p_received_today, v_remaining_balance USING ERRCODE = '22023';
  END IF;

  -- 6. Session Validation & Completion Rules
  SELECT COUNT(*) INTO v_total_sessions
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  IF v_total_sessions = 0 THEN
    RAISE EXCEPTION 'ไม่พบรอบสักในคิวงานนี้' USING ERRCODE = 'P0001';
  END IF;

  IF v_total_sessions = 1 THEN
    SELECT id, status INTO v_initial_session_id, v_initial_session_status
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
    ORDER BY session_number ASC, created_at ASC
    LIMIT 1;

    IF v_initial_session_status = 'CANCELLED' THEN
      RAISE EXCEPTION 'ไม่สามารถปิดงานได้: รอบสักถูกยกเลิกแล้ว' USING ERRCODE = '22023';
    END IF;

    IF v_initial_session_status != 'COMPLETED' THEN
      UPDATE public.booking_sessions
      SET status = 'COMPLETED',
          updated_at = pg_catalog.now()
      WHERE id = v_initial_session_id;
    END IF;

  ELSE
    -- Total sessions > 1 -> Check if ANY active session is SCHEDULED or IN_PROGRESS
    SELECT COUNT(*) INTO v_active_additional_sessions
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
      AND status IN ('SCHEDULED', 'IN_PROGRESS');

    IF v_active_additional_sessions > 0 THEN
      RAISE EXCEPTION 'กรุณาปิดรอบสักเพิ่มเติมให้ครบก่อนเสร็จสิ้นงาน' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 7. Record Final Payment if received_today > 0
  IF p_received_today > 0 THEN
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
      p_received_today,
      COALESCE(p_payment_method, 'CASH'),
      'RECORDED',
      pg_catalog.now(),
      COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), 'บันทึกรับเงินและปิดงาน'),
      v_auth_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- 8. Transition Parent Booking to COMPLETED
  UPDATE public.bookings
  SET status = 'COMPLETED',
      updated_at = pg_catalog.now()
  WHERE id = p_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'COMPLETED',
    'actual_price', v_effective_quoted_price,
    'recorded_paid', v_recorded_paid,
    'received_today', p_received_today,
    'total_paid', v_recorded_paid + p_received_today,
    'payment_id', v_payment_id
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 6. Wrapper RPC: admin_record_final_payment_and_complete_booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_record_final_payment_and_complete_booking(
  p_booking_id UUID,
  p_actual_price NUMERIC,
  p_received_today NUMERIC,
  p_payment_method TEXT DEFAULT 'CASH',
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.record_final_payment_and_complete_booking(
    p_booking_id,
    p_actual_price,
    p_received_today,
    p_payment_method,
    p_note
  );
END;
$$;

-- Permissions Grants
REVOKE ALL ON FUNCTION public.add_booking_session_with_payment(UUID, DATE, TIME, TIME, TEXT, NUMERIC, NUMERIC, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_booking_session_with_payment(UUID, DATE, TIME, TIME, TEXT, NUMERIC, NUMERIC, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_booking_session_with_payment(UUID, DATE, TIME, TIME, TEXT, NUMERIC, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_booking_session_with_payment(UUID, DATE, TIME, TIME, TEXT, NUMERIC, NUMERIC, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.admin_add_booking_session_with_payment(UUID, DATE, TIME, TIME, TEXT, NUMERIC, NUMERIC, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_add_booking_session_with_payment(UUID, DATE, TIME, TIME, TEXT, NUMERIC, NUMERIC, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_add_booking_session_with_payment(UUID, DATE, TIME, TIME, TEXT, NUMERIC, NUMERIC, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_booking_session_with_payment(UUID, DATE, TIME, TIME, TEXT, NUMERIC, NUMERIC, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;

-- Notify PostgREST schema reload
NOTIFY pgrst, 'reload schema';

COMMIT;

