-- ============================================================================
-- 157 TATTOO — PHASE 57 FORWARD MIGRATION
-- DECOUPLED MULTI-SESSION & INDEPENDENT PAYMENT MANAGEMENT RPCs
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. View: public.booking_payment_summary
--    Maintains exact 10 original columns & appends 2 breakdown columns at the end
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
  END AS is_fully_paid,
  COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED' AND bp.payment_type = 'DEPOSIT'), 0.00)::NUMERIC(12,2) AS deposit_paid_total,
  COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED' AND bp.payment_type != 'DEPOSIT'), 0.00)::NUMERIC(12,2) AS additional_paid_total
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
-- 2. Core RPC: add_booking_session
--    Creates a new SCHEDULED session ONLY. NO payment, NO completing active sessions!
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_booking_session(
  p_booking_id UUID,
  p_session_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_end_time TIME WITHOUT TIME ZONE,
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
  v_booking RECORD;
  v_next_session_num INT;
  v_artist_session_count INT;
  v_new_session_id UUID;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- Input Validation
  IF p_session_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุวันที่นัดหมายรอบสัก' USING ERRCODE = '22023';
  END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด' USING ERRCODE = '22023';
  END IF;
  IF p_start_time >= p_end_time THEN
    RAISE EXCEPTION 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มรอบสัก' USING ERRCODE = '22023';
  END IF;

  -- Lock Parent Booking FOR UPDATE
  SELECT id, status, artist_id
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

  -- Check Artist Availability
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

  -- Determine Next Session Number
  SELECT COALESCE(MAX(session_number), 0) + 1 INTO v_next_session_num
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  -- Create Next Session (SCHEDULED)
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
    'new_session_id', v_new_session_id,
    'session_number', v_next_session_num
  );
END;
$$;

-- Wrapper RPC: admin_add_booking_session
CREATE OR REPLACE FUNCTION public.admin_add_booking_session(
  p_booking_id UUID,
  p_session_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_end_time TIME WITHOUT TIME ZONE,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.add_booking_session(p_booking_id, p_session_date, p_start_time, p_end_time, p_note);
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. Core RPC: complete_booking_session
--    Completes ONLY target p_session_id. NO payment, NO next session creation!
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_booking_session(
  p_booking_id UUID,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_session RECORD;
  v_booking RECORD;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรอบสักที่ต้องการทำรายการเสร็จสิ้น' USING ERRCODE = '22023';
  END IF;

  -- Lock Parent Booking FOR UPDATE
  SELECT id, status, artist_id
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

  -- Lock Target Session FOR UPDATE
  SELECT id, booking_id, session_number, status
  INTO v_session
  FROM public.booking_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL OR v_session.booking_id != p_booking_id THEN
    RAISE EXCEPTION 'ไม่พบรอบสักที่ระบุ หรือรอบสักไม่ตรงกับคิวงานนี้' USING ERRCODE = '22023';
  END IF;

  IF v_session.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'รอบสักนี้ถูกยกเลิกแล้ว ไม่สามารถปิดรอบได้' USING ERRCODE = '22023';
  END IF;

  IF v_session.status != 'COMPLETED' THEN
    UPDATE public.booking_sessions
    SET status = 'COMPLETED',
        updated_at = pg_catalog.now()
    WHERE id = p_session_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'completed_session_id', p_session_id,
    'session_number', v_session.session_number,
    'status', 'COMPLETED'
  );
END;
$$;

-- Wrapper RPC: admin_complete_booking_session
CREATE OR REPLACE FUNCTION public.admin_complete_booking_session(
  p_booking_id UUID,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.complete_booking_session(p_booking_id, p_session_id);
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. Core RPC: record_booking_payment
--    Independent Payment Recording RPC with Strict Overpayment Guard
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_booking_payment(
  p_booking_id UUID,
  p_amount NUMERIC,
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
  v_total_recorded NUMERIC(12,2);
  v_payment_id UUID;
BEGIN
  v_auth_uid := auth.uid();
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'ยอดเงินที่รับต้องมากกว่า 0 บาท' USING ERRCODE = '22023';
  END IF;

  -- Lock Parent Booking FOR UPDATE
  SELECT id, estimate_request_id, customer_id, artist_id, quoted_price
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

  -- Fetch established quoted_price if set
  IF v_booking.estimate_request_id IS NOT NULL THEN
    SELECT quoted_price INTO v_current_quoted_price
    FROM public.estimate_requests
    WHERE id = v_booking.estimate_request_id
    FOR UPDATE;
  ELSE
    v_current_quoted_price := v_booking.quoted_price;
  END IF;

  -- Calculate All Recorded Payments under Lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)::NUMERIC(12,2)
  INTO v_total_recorded
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- OVERPAYMENT GUARD: If quoted_price > 0, total_recorded + p_amount MUST NOT exceed quoted_price
  IF v_current_quoted_price IS NOT NULL AND v_current_quoted_price > 0 THEN
    IF (v_total_recorded + p_amount) > v_current_quoted_price THEN
      RAISE EXCEPTION 'ยอดรับเงินเกินราคางานที่ตกลง' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Insert Recorded Payment (booking_session_id IS NULL)
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
    NULL,
    'OTHER',
    p_amount,
    'OTHER',
    'RECORDED',
    pg_catalog.now(),
    COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), 'บันทึกรับเงิน'),
    v_auth_uid
  )
  RETURNING id INTO v_payment_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'payment_id', v_payment_id,
    'amount', p_amount,
    'total_paid', v_total_recorded + p_amount,
    'quoted_price', v_current_quoted_price
  );
END;
$$;

-- Wrapper RPC: admin_record_booking_payment
CREATE OR REPLACE FUNCTION public.admin_record_booking_payment(
  p_booking_id UUID,
  p_amount NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.record_booking_payment(p_booking_id, p_amount, p_note);
END;
$$;


-- ----------------------------------------------------------------------------
-- 5. Core RPC: cancel_booking_session
--    Cancels a specific SCHEDULED/IN_PROGRESS session. DOES NOT touch payments!
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_session(
  p_session_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_session RECORD;
  v_booking RECORD;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุรอบสักที่ต้องการยกเลิก' USING ERRCODE = '22023';
  END IF;

  -- Lock target session FOR UPDATE
  SELECT id, booking_id, session_number, status, artist_id, note
  INTO v_session
  FROM public.booking_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรอบสักที่ระบุ' USING ERRCODE = 'P0002';
  END IF;

  -- Lock parent booking FOR UPDATE
  SELECT id, artist_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = v_session.booking_id
  FOR UPDATE;

  -- Auth Check
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND (v_session.artist_id = v_artist_id OR v_booking.artist_id = v_artist_id))) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ยกเลิกรอบสักนี้' USING ERRCODE = '42501';
  END IF;

  -- Prohibit cancelling COMPLETED sessions
  IF v_session.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'ไม่สามารถยกเลิกรอบสักที่เสร็จสิ้นแล้วได้' USING ERRCODE = '22023';
  END IF;

  IF v_session.status = 'CANCELLED' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'already_cancelled', true,
      'session_id', p_session_id,
      'booking_id', v_session.booking_id
    );
  END IF;

  -- Update status to CANCELLED (Preserves payments and session row)
  UPDATE public.booking_sessions
  SET status = 'CANCELLED',
      note = CASE WHEN p_reason IS NOT NULL AND pg_catalog.btrim(p_reason) != '' THEN pg_catalog.btrim(p_reason) ELSE note END,
      updated_at = pg_catalog.now()
  WHERE id = p_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'booking_id', v_session.booking_id,
    'session_number', v_session.session_number,
    'status', 'CANCELLED'
  );
END;
$$;

-- Wrapper RPC: admin_cancel_booking_session
CREATE OR REPLACE FUNCTION public.admin_cancel_booking_session(
  p_session_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.cancel_booking_session(p_session_id, p_reason);
END;
$$;


-- ----------------------------------------------------------------------------
-- 6. Core RPC: record_final_payment_and_complete_booking
--    Final Booking Completion with Strict Price Validation
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
  v_completed_sessions INT;
  v_active_sessions INT;
  v_recorded_paid NUMERIC(12,2);
  v_remaining_balance NUMERIC(12,2);
  v_payment_type TEXT;
  v_payment_id UUID := NULL;
BEGIN
  v_auth_uid := auth.uid();
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_received_today IS NULL OR p_received_today < 0 THEN
    RAISE EXCEPTION 'ยอดที่รับวันนี้ต้องไม่ติดลบ' USING ERRCODE = '22023';
  END IF;

  -- Lock Parent Booking FOR UPDATE
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

  -- Calculate All Recorded Payments under Lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)::NUMERIC(12,2)
  INTO v_recorded_paid
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- Price Immutability & First-Time Price Setting Validation
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

    -- PRICE VALIDATION: First-time entered price MUST NOT be less than total recorded paid!
    IF p_actual_price < v_recorded_paid THEN
      RAISE EXCEPTION 'ราคางานต้องไม่น้อยกว่ายอดที่รับชำระแล้ว' USING ERRCODE = '22023';
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

  v_remaining_balance := GREATEST(v_effective_quoted_price - v_recorded_paid, 0.00);

  -- Validate Received Today Equals Remaining Balance
  IF p_received_today <> v_remaining_balance THEN
    RAISE EXCEPTION 'ยอดที่รับวันนี้ (฿%) ต้องเท่ากับยอดคงเหลือที่ต้องรับ (฿%)',
      p_received_today, v_remaining_balance USING ERRCODE = '22023';
  END IF;

  -- Session Completion Rules
  SELECT COUNT(*) FILTER (WHERE status = 'COMPLETED'),
         COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS'))
  INTO v_completed_sessions, v_active_sessions
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  -- Must have at least 1 COMPLETED session. If ALL sessions are CANCELLED or 0 completed sessions, reject!
  IF v_completed_sessions = 0 THEN
    RAISE EXCEPTION 'ไม่สามารถปิดงานได้: ต้องมีอย่างน้อย 1 รอบสักที่เสร็จสมบูรณ์ (หากยกเลิกรอบทั้งหมด กรุณาใช้เมนูยกเลิกคิวงานแทน)' USING ERRCODE = '22023';
  END IF;

  -- All remaining sessions must be COMPLETED or CANCELLED (no SCHEDULED/IN_PROGRESS)
  IF v_active_sessions > 0 THEN
    RAISE EXCEPTION 'กรุณาปิดหรือยกเลิกรอบสักที่เหลือให้ครบก่อนเสร็จสิ้นงาน' USING ERRCODE = '22023';
  END IF;

  -- Record Final Payment if received_today > 0 (Never insert 0-baht payment!)
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
      COALESCE(p_payment_method, 'OTHER'),
      'RECORDED',
      pg_catalog.now(),
      COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), 'บันทึกรับเงินและปิดงาน'),
      v_auth_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- Transition Parent Booking to COMPLETED
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

-- Wrapper RPC: admin_record_final_payment_and_complete_booking
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
REVOKE ALL ON FUNCTION public.add_booking_session(UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_booking_session(UUID, DATE, TIME, TIME, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_add_booking_session(UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_booking_session(UUID, DATE, TIME, TIME, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_booking_session(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_booking_session(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_complete_booking_session(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_complete_booking_session(UUID, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_booking_payment(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_booking_payment(UUID, NUMERIC, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_record_booking_payment(UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_booking_payment(UUID, NUMERIC, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_booking_session(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_session(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_cancel_booking_session(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_booking_session(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

-- Notify PostgREST schema reload
NOTIFY pgrst, 'reload schema';

COMMIT;
