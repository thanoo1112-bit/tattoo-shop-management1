-- ============================================================================
-- 157 TATTOO — PHASE 72 MIGRATION
-- ALLOW BOTH ADMIN AND ASSIGNED ARTIST TO REJECT PAYMENT SUBMISSIONS
-- ============================================================================

BEGIN;

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
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ปฏิเสธหลักฐานการชำระเงิน' USING ERRCODE = '42501';
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

  -- 3. Lock associated booking
  SELECT id, artist_id, status INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  -- Security Check: Admin OR assigned Artist only
  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
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

-- Alias admin_reject_payment_submission to artist_reject_payment_submission
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

REVOKE ALL ON FUNCTION public.artist_reject_payment_submission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_reject_payment_submission(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_reject_payment_submission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_submission(UUID, TEXT) TO authenticated, service_role;

COMMIT;
