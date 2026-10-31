-- ============================================================================
-- 157 TATTOO — PHASE 70 MIGRATION
-- FIX ARTIST DEPOSIT SLIP APPROVAL & SESSION SCHEDULING RECONCILIATION
-- ============================================================================

BEGIN;

-- 1. Single Source of Truth: reconcile_booking_deposit_status
CREATE OR REPLACE FUNCTION public.reconcile_booking_deposit_status(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_booking_status TEXT;
  v_estimate_request_id UUID;
  v_artist_id UUID;
  v_requested_date DATE;
  v_requested_start_time TIME;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
BEGIN
  -- Row lock booking to serialize concurrent reconciliations
  SELECT b.status, b.estimate_request_id, b.artist_id, b.requested_date, b.requested_start_time, COALESCE(e.deposit_required, 500.00)
  INTO v_booking_status, v_estimate_request_id, v_artist_id, v_requested_date, v_requested_start_time, v_deposit_required
  FROM public.bookings b
  LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF v_booking_status IS NULL THEN
    RETURN;
  END IF;

  -- Terminal or in-flight bookings cannot be altered by payment reconciliation
  IF v_booking_status IN ('IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RETURN;
  END IF;

  -- Calculate paid_total strictly from RECORDED payments under row lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)
  INTO v_paid_total
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- CASE A: Deposit satisfied -> WAITING_DEPOSIT / APPROVED / ACCEPTED -> CONFIRMED
  IF v_booking_status IN ('WAITING_DEPOSIT', 'APPROVED', 'ACCEPTED') THEN
    IF v_deposit_required <= 0 OR v_paid_total >= v_deposit_required THEN
      UPDATE public.bookings
      SET status = 'CONFIRMED',
          confirmed_at = COALESCE(confirmed_at, pg_catalog.now()),
          updated_at = pg_catalog.now()
      WHERE id = p_booking_id;

      IF v_estimate_request_id IS NOT NULL THEN
        UPDATE public.estimate_requests
        SET status = 'CONFIRMED',
            updated_at = pg_catalog.now()
        WHERE id = v_estimate_request_id
          AND status IN ('ACCEPTED', 'WAITING_DEPOSIT', 'PENDING');
      END IF;

      -- Ensure booking_session exists & is SCHEDULED for the artist's calendar
      IF NOT EXISTS (
        SELECT 1 FROM public.booking_sessions WHERE booking_id = p_booking_id
      ) THEN
        INSERT INTO public.booking_sessions (
          booking_id,
          artist_id,
          session_number,
          start_at,
          end_at,
          status,
          created_at,
          updated_at
        )
        VALUES (
          p_booking_id,
          v_artist_id,
          1,
          (COALESCE(v_requested_date, CURRENT_DATE)::TEXT || ' ' || COALESCE(v_requested_start_time, '10:00:00')::TEXT || '+07')::TIMESTAMPTZ,
          (COALESCE(v_requested_date, CURRENT_DATE)::TEXT || ' ' || COALESCE(v_requested_start_time, '10:00:00')::TEXT || '+07')::TIMESTAMPTZ + INTERVAL '2 hours',
          'SCHEDULED',
          pg_catalog.now(),
          pg_catalog.now()
        );
      ELSE
        UPDATE public.booking_sessions
        SET status = 'SCHEDULED',
            updated_at = pg_catalog.now()
        WHERE booking_id = p_booking_id
          AND status NOT IN ('COMPLETED', 'CANCELLED', 'IN_PROGRESS');
      END IF;

    END IF;

  -- CASE B: Deposit lost (due to VOID) -> CONFIRMED -> WAITING_DEPOSIT
  ELSIF v_booking_status = 'CONFIRMED' THEN
    IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.booking_sessions
        WHERE booking_id = p_booking_id
          AND status IN ('IN_PROGRESS', 'COMPLETED')
      ) THEN
        UPDATE public.bookings
        SET status = 'WAITING_DEPOSIT',
            confirmed_at = NULL,
            updated_at = pg_catalog.now()
        WHERE id = p_booking_id;
      END IF;
    END IF;
  END IF;
END;
$$;

-- 2. Core RPC: artist_approve_payment_submission
CREATE OR REPLACE FUNCTION public.artist_approve_payment_submission(
  p_submission_id UUID,
  p_verified_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'BANK_TRANSFER',
  p_reference_no TEXT DEFAULT NULL,
  p_artist_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_reviewer_uid UUID;
  v_submission RECORD;
  v_booking RECORD;
  v_payment_id UUID;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์อนุมัติหลักฐานการชำระเงิน' USING ERRCODE = '42501';
  END IF;

  v_reviewer_uid := auth.uid();

  IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'จำนวนเงินต้องมากกว่า 0' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic Lock & PENDING Status Check (Idempotency safeguard)
  SELECT id, booking_id, customer_user_id, claimed_amount, status, reference_no
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการส่งสลิปชำระเงิน' USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'รายการสลิปนี้ถูกตรวจสอบไปแล้ว (สถานะปัจจุบัน: %)', v_submission.status USING ERRCODE = 'P0001';
  END IF;

  -- Lock associated booking
  SELECT id, artist_id, status, estimate_request_id INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงานที่เกี่ยวข้อง' USING ERRCODE = 'P0001';
  END IF;

  -- Security Check: Admin OR assigned Artist only
  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 1. Insert official payment record with status RECORDED
  INSERT INTO public.booking_payments (
    booking_id,
    payment_type,
    amount,
    payment_method,
    reference_no,
    note,
    status,
    paid_at,
    created_at,
    updated_at
  )
  VALUES (
    v_submission.booking_id,
    'DEPOSIT',
    p_verified_amount,
    COALESCE(p_payment_method, 'BANK_TRANSFER'),
    COALESCE(NULLIF(pg_catalog.btrim(p_reference_no), ''), v_submission.reference_no),
    p_artist_note,
    'RECORDED',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_payment_id;

  -- 2. Update submission status to APPROVED
  UPDATE public.booking_payment_submissions
  SET
    status = 'APPROVED',
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_reviewer_uid,
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  -- 3. Trigger Deposit Reconciliation Helper
  PERFORM public.reconcile_booking_deposit_status(v_submission.booking_id);

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'payment_id', v_payment_id,
    'booking_id', v_submission.booking_id,
    'verified_amount', p_verified_amount,
    'status', 'APPROVED'
  );
END;
$$;

-- 3. Canonical RPC Alias: admin_approve_payment_submission
CREATE OR REPLACE FUNCTION public.admin_approve_payment_submission(
  p_submission_id UUID,
  p_verified_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'BANK_TRANSFER',
  p_reference_no TEXT DEFAULT NULL,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN public.artist_approve_payment_submission(
    p_submission_id,
    p_verified_amount,
    p_payment_method,
    p_reference_no,
    p_admin_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.artist_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
