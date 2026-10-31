-- ============================================================================
-- 157 TATTOO — PHASE 86 MIGRATION
-- FIX ARTIST PAYMENT RPC OWNERSHIP LOOKUP (REMOVE NON-EXISTENT staff_artist_id COLUMN)
-- ============================================================================

BEGIN;

-- 1. Core RPC: artist_approve_payment_submission
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
  v_effective_artist_id UUID;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  -- Security Check 1: User must be either Admin or active Artist
  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ตรวจสอบการชำระเงินของคิวนี้' USING ERRCODE = '42501';
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

  -- Lock associated booking (query only valid columns: id, artist_id, status, estimate_request_id)
  SELECT id, artist_id, status, estimate_request_id INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงานที่เกี่ยวข้อง' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve effective booking_artist_id (bookings.artist_id -> estimate_requests.artist_id fallback)
  v_effective_artist_id := v_booking.artist_id;

  IF v_effective_artist_id IS NULL AND v_booking.estimate_request_id IS NOT NULL THEN
    SELECT artist_id INTO v_effective_artist_id
    FROM public.estimate_requests
    WHERE id = v_booking.estimate_request_id;
  END IF;

  -- Security Check 2: Admin OR assigned Artist only
  IF NOT (v_is_admin OR (v_effective_artist_id IS NOT NULL AND v_effective_artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ตรวจสอบการชำระเงินของคิวนี้' USING ERRCODE = '42501';
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

-- 2. Core RPC: artist_reject_payment_submission
CREATE OR REPLACE FUNCTION public.artist_reject_payment_submission(
  p_submission_id UUID,
  p_rejection_reason TEXT
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
  v_effective_artist_id UUID;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ตรวจสอบการชำระเงินของคิวนี้' USING ERRCODE = '42501';
  END IF;

  v_reviewer_uid := auth.uid();

  -- 1. Validate rejection_reason
  IF p_rejection_reason IS NULL OR pg_catalog.btrim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'กรุณาระบุเหตุผลในการปฏิเสธสลิป' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Lock and Fetch Submission FOR UPDATE
  SELECT id, booking_id, status
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

  -- 3. Lock associated booking (query only valid columns: id, artist_id, status, estimate_request_id)
  SELECT id, artist_id, status, estimate_request_id INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงานที่เกี่ยวข้อง' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve effective booking_artist_id (bookings.artist_id -> estimate_requests.artist_id fallback)
  v_effective_artist_id := v_booking.artist_id;

  IF v_effective_artist_id IS NULL AND v_booking.estimate_request_id IS NOT NULL THEN
    SELECT artist_id INTO v_effective_artist_id
    FROM public.estimate_requests
    WHERE id = v_booking.estimate_request_id;
  END IF;

  -- Security Check: Admin OR assigned Artist only
  IF NOT (v_is_admin OR (v_effective_artist_id IS NOT NULL AND v_effective_artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ตรวจสอบการชำระเงินของคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 4. Transition submission to REJECTED
  UPDATE public.booking_payment_submissions
  SET
    status = 'REJECTED',
    rejection_reason = pg_catalog.btrim(p_rejection_reason),
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_reviewer_uid,
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'booking_id', v_submission.booking_id,
    'status', 'REJECTED',
    'rejection_reason', pg_catalog.btrim(p_rejection_reason)
  );
END;
$$;

-- 3. Alias wrappers
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

CREATE OR REPLACE FUNCTION public.admin_reject_payment_submission(
  p_submission_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  RETURN public.artist_reject_payment_submission(
    p_submission_id,
    p_rejection_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.artist_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.artist_reject_payment_submission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_reject_payment_submission(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_reject_payment_submission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_submission(UUID, TEXT) TO authenticated, service_role;

COMMIT;
