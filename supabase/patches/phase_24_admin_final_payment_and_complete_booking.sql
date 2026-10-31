-- ============================================================================
-- 157 TATTOO — PHASE 24: ADMIN RECORD FINAL PAYMENT AND COMPLETE BOOKING
--
-- RPC: public.admin_record_final_payment_and_complete_booking
-- 
-- Functionality:
-- 1. Updates chk_booking_payments_method constraint to allow CARD and CREDIT_CARD
-- 2. Validates admin authority, booking state (CONFIRMED or IN_PROGRESS only)
-- 3. Ensures no unfinished sessions remain (all scheduled/in-progress sessions completed/cancelled)
-- 4. Calculates approved deposit/payments from public.booking_payments (status != 'VOIDED')
-- 5. Validates actual price >= approved deposit and received today == remaining balance
-- 6. Atomically updates estimate_requests.quoted_price = p_actual_price
-- 7. Inserts final payment into public.booking_payments if p_received_today > 0
-- 8. Transitions public.bookings.status to 'COMPLETED'
-- ============================================================================

BEGIN;

-- 1. Update payment_method constraint on public.booking_payments
ALTER TABLE public.booking_payments DROP CONSTRAINT IF EXISTS chk_booking_payments_method;
ALTER TABLE public.booking_payments ADD CONSTRAINT chk_booking_payments_method CHECK (
  payment_method IN ('CASH', 'BANK_TRANSFER', 'QR', 'CARD', 'CREDIT_CARD', 'OTHER')
);

-- 2. Atomic RPC Function
CREATE OR REPLACE FUNCTION public.admin_record_final_payment_and_complete_booking(
  p_booking_id UUID,
  p_actual_price NUMERIC,
  p_received_today NUMERIC,
  p_payment_method TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_auth_uid UUID;
  v_booking RECORD;
  v_total_sessions INT;
  v_completed_sessions INT;
  v_active_sessions INT;
  v_approved_deposit NUMERIC(12,2);
  v_remaining_balance NUMERIC(12,2);
  v_payment_type TEXT;
  v_payment_id UUID;
BEGIN
  -- 1. Admin Authority Check
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL OR NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only active Admin can record final payment and complete booking'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Parameters
  IF p_actual_price IS NULL OR p_actual_price < 0 THEN
    RAISE EXCEPTION 'ราคางานจริงต้องระบุและไม่ติดลบ' USING ERRCODE = '22023';
  END IF;

  IF p_received_today IS NULL OR p_received_today < 0 THEN
    RAISE EXCEPTION 'ยอดที่รับวันนี้ต้องไม่ติดลบ' USING ERRCODE = '22023';
  END IF;

  IF p_payment_method IS NULL OR p_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'QR', 'CARD', 'CREDIT_CARD', 'OTHER') THEN
    RAISE EXCEPTION 'วิธีชำระเงินไม่ถูกต้อง' USING ERRCODE = '22023';
  END IF;

  -- 3. Lock and Fetch Booking Row
  SELECT id, estimate_request_id, status, customer_user_id, customer_id, artist_id
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  -- 4. Idempotency Guard & Allowed Status Check
  IF v_booking.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'คิวงานนี้ปิดงานเสร็จสิ้นแล้ว ไม่สามารถบันทึกงวดสุดท้ายซ้ำได้' USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'ไม่สามารถปิดงานได้จากสถานะปัจจุบัน (ต้องเป็น CONFIRMED หรือ IN_PROGRESS)' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Session Validation Check
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'COMPLETED'),
    COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS'))
  INTO v_total_sessions, v_completed_sessions, v_active_sessions
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  -- If sessions exist, all active sessions must be finished or cancelled first
  IF v_total_sessions > 0 THEN
    IF v_completed_sessions = 0 THEN
      RAISE EXCEPTION 'ยังไม่มีรอบสักที่เสร็จสิ้นสำหรับงานนี้' USING ERRCODE = 'P0001';
    END IF;
    IF v_active_sessions > 0 THEN
      RAISE EXCEPTION 'ยังมีรอบสักที่ไม่เสร็จ กรุณาจบรอบหรือยกเลิกรอบที่ไม่ใช้ก่อนปิดงานทั้งงาน' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 6. Fetch Approved Payments / Deposit from booking_payments (status != 'VOIDED')
  SELECT COALESCE(SUM(amount), 0.00)::NUMERIC(12,2)
  INTO v_approved_deposit
  FROM public.booking_payments
  WHERE booking_id = p_booking_id AND status != 'VOIDED';

  -- 7. Validate Actual Price vs Approved Payments
  IF p_actual_price < v_approved_deposit THEN
    RAISE EXCEPTION 'ราคางานจริง (฿%) ต้องไม่น้อยกว่ายอดเงินที่อนุมัติแล้ว (฿%)', p_actual_price, v_approved_deposit USING ERRCODE = 'P0001';
  END IF;

  v_remaining_balance := p_actual_price - v_approved_deposit;

  -- 8. Validate Received Today Equals Remaining Balance
  IF p_received_today <> v_remaining_balance THEN
    RAISE EXCEPTION 'ยอดที่รับวันนี้ (฿%) ต้องเท่ากับยอดคงเหลือที่ต้องรับ (฿%)', p_received_today, v_remaining_balance USING ERRCODE = 'P0001';
  END IF;

  -- 9. Update Actual Price (quoted_price) on linked estimate_requests
  IF v_booking.estimate_request_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET quoted_price = p_actual_price,
        updated_at = pg_catalog.now()
    WHERE id = v_booking.estimate_request_id;
  END IF;

  -- 10. Record Final Payment if received_today > 0
  IF p_received_today > 0 THEN
    IF v_approved_deposit > 0 THEN
      v_payment_type := 'BALANCE';
    ELSE
      v_payment_type := 'FULL_PAYMENT';
    END IF;

    INSERT INTO public.booking_payments (
      booking_id,
      customer_id,
      customer_user_id,
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
      v_booking.customer_user_id,
      v_payment_type,
      p_received_today,
      p_payment_method,
      'RECORDED',
      pg_catalog.now(),
      COALESCE(NULLIF(TRIM(p_note), ''), 'บันทึกรับเงินและปิดงาน'),
      v_auth_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- 11. Transition Booking to COMPLETED
  UPDATE public.bookings
  SET status = 'COMPLETED',
      updated_at = pg_catalog.now()
  WHERE id = p_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'COMPLETED',
    'actual_price', p_actual_price,
    'approved_deposit', v_approved_deposit,
    'received_today', p_received_today,
    'total_paid', v_approved_deposit + p_received_today,
    'payment_id', v_payment_id
  );
END;
$$;

-- Security Grants
REVOKE EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
