-- =============================================================================
-- 157 TATTOO — PHASE 90: FIX RPC BOOKING PAYMENTS INSERT SCHEMA COLUMNS
-- 
-- Fixes SQLSTATE 42703 (column "customer_user_id" does not exist) by correcting
-- INSERT INTO public.booking_payments to use only valid schema columns:
-- (booking_id, customer_id, payment_type, amount, payment_method, status, paid_at, note, created_by).
-- 
-- Preserves Financial Completion Integrity:
-- 1. FOR UPDATE row lock & Idempotency Guard (returns clean success if already COMPLETED).
-- 2. Calculates remaining balance: GREATEST(0, p_actual_price - v_recorded_paid).
-- 3. INSERT remaining payment to public.booking_payments FIRST (if remaining balance > 0).
-- 4. Updates linked estimate_requests quoted_price.
-- 5. UPDATE public.bookings status = 'COMPLETED' SECOND (triggers handle_booking_status_transition).
-- 6. Atomic PL/pgSQL Transaction (all steps succeed together or roll back completely).
-- 
-- FOR REVIEW ONLY — DO NOT APPLY TO LIVE DATABASE UNTIL APPROVED.
-- =============================================================================

BEGIN;

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
  -- Columns matched 100% with public.booking_payments database schema
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
  RETURN public.record_final_payment_and_complete_booking(
    p_booking_id => p_booking_id,
    p_actual_price => p_actual_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
