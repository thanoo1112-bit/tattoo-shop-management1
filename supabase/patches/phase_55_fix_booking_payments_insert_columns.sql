-- ============================================================================
-- 157 TATTOO — PHASE 55 FORWARD MIGRATION
-- FIX BOOKING PAYMENTS INSERT COLUMNS (REMOVE NON-EXISTENT customer_user_id)
-- ============================================================================
-- Problem:
-- Phase 53 & 54 RPC `record_final_payment_and_complete_booking` attempted to insert
-- `customer_user_id` into `public.booking_payments`.
-- Since `public.booking_payments` on the production schema does not have a `customer_user_id` column,
-- PostgreSQL threw runtime error: column "customer_user_id" of relation "booking_payments" does not exist.
--
-- Solution:
-- CREATE OR REPLACE `record_final_payment_and_complete_booking` and
-- `admin_record_final_payment_and_complete_booking` to insert into `public.booking_payments`
-- using ONLY existing verified schema columns:
-- (booking_id, customer_id, payment_type, amount, payment_method, status, paid_at, note, created_by).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Core Atomic RPC: record_final_payment_and_complete_booking
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
  IF p_actual_price IS NULL OR p_actual_price <= 0 THEN
    RAISE EXCEPTION 'ราคางานจริงต้องระบุและมากกว่า 0' USING ERRCODE = '22023';
  END IF;

  IF p_received_today IS NULL OR p_received_today < 0 THEN
    RAISE EXCEPTION 'ยอดที่รับวันนี้ต้องไม่ติดลบ' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'QR', 'CARD', 'CREDIT_CARD', 'OTHER') THEN
    RAISE EXCEPTION 'วิธีชำระเงินไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;

  -- 2. Lock Parent Booking FOR UPDATE (Prevents Concurrent Submissions / Duplicate Payments)
  SELECT id, estimate_request_id, status, customer_user_id, customer_id, artist_id
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

  -- Guard: Linked Estimate Request Required
  IF v_booking.estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลใบประเมินราคาที่เชื่อมโยงกับคิวงานนี้ (estimate_request_id IS NULL) กรุณาตรวจสอบข้อมูลคิวงาน' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency Guard (If already COMPLETED, return clean success without creating payments)
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

  -- 3. Calculate All Recorded Payments under Row Lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)::NUMERIC(12,2)
  INTO v_recorded_paid
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- 4. Over-Payment Guard: If recorded paid > actual price
  IF v_recorded_paid > p_actual_price THEN
    RAISE EXCEPTION 'ยอดรับเงินสะสม (฿%) เกินราคางานรวม (฿%) กรุณาตรวจสอบประวัติการชำระเงิน',
      v_recorded_paid, p_actual_price USING ERRCODE = '22023';
  END IF;

  v_remaining_balance := p_actual_price - v_recorded_paid;

  -- Validate Received Today Equals Remaining Balance
  IF p_received_today <> v_remaining_balance THEN
    RAISE EXCEPTION 'ยอดที่รับวันนี้ (฿%) ต้องเท่ากับยอดคงเหลือที่ต้องรับ (฿%)',
      p_received_today, v_remaining_balance USING ERRCODE = '22023';
  END IF;

  -- 5. Session Validation & Completion Rules
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
    -- Total sessions > 1 -> Do NOT auto-complete any session. Check if any additional session is active.
    SELECT COUNT(*) INTO v_active_additional_sessions
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
      AND session_number > 1
      AND status IN ('SCHEDULED', 'IN_PROGRESS');

    IF v_active_additional_sessions > 0 THEN
      RAISE EXCEPTION 'กรุณาปิดรอบสักเพิ่มเติมให้ครบก่อนเสร็จสิ้นงาน' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 6. Update Actual Price (quoted_price) on linked estimate_requests
  UPDATE public.estimate_requests
  SET quoted_price = p_actual_price,
      updated_at = pg_catalog.now()
  WHERE id = v_booking.estimate_request_id;

  -- 7. Record Final Payment if received_today > 0 (Using verified schema columns ONLY)
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
    'actual_price', p_actual_price,
    'recorded_paid', v_recorded_paid,
    'received_today', p_received_today,
    'total_paid', v_recorded_paid + p_received_today,
    'payment_id', v_payment_id
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Core RPC: admin_record_final_payment_and_complete_booking (Alias Wrapper)
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

-- Permissions Lockdown
REVOKE ALL ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
