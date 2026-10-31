-- ============================================================================
-- Phase 46 Forward Migration: Fix Approved Deposit Booking & Estimate Confirmation Sync
-- File: supabase/patches/phase_46_fix_approved_deposit_booking_confirmation_sync.sql
-- ============================================================================
-- Description:
-- Fixes an issue where approving a deposit slip (APPROVED) did not transition
-- the associated booking status and estimate request status to 'CONFIRMED'.
-- 
-- Rules & Guards:
-- 1. artist_approve_payment_submission / admin_approve_payment_submission:
--    - Inserts official booking_payments record with status 'RECORDED'.
--    - Updates booking_payment_submissions status to 'APPROVED'.
--    - Invokes public.reconcile_booking_deposit_status(v_submission.booking_id)
--      as the SINGLE SOURCE OF TRUTH for confirming booking & estimate request.
--    - Uses pg_catalog.btrim(p_reference_no) for string trimming.
-- 2. reconcile_booking_deposit_status:
--    - Validates SUM(booking_payments.amount WHERE status = 'RECORDED') >= deposit_required
--      BEFORE transitioning bookings.status = 'CONFIRMED' and estimate_requests.status = 'CONFIRMED'.
--    - Does NOT modify CANCELLED, REJECTED, EXPIRED, IN_PROGRESS, or COMPLETED records.
-- 3. One-time safe repair:
--    - Reconciles all bookings that have APPROVED payment submissions.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper Function: Deposit Reconciliation (Single Source of Truth)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_booking_deposit_status(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_booking_status TEXT;
  v_estimate_request_id UUID;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
BEGIN
  -- Row lock booking to serialize concurrent reconciliations
  SELECT b.status, b.estimate_request_id, COALESCE(e.deposit_required, 500.00)
  INTO v_booking_status, v_estimate_request_id, v_deposit_required
  FROM public.bookings b
  LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF v_booking_status IS NULL THEN
    RETURN;
  END IF;

  -- Terminal or in-flight bookings cannot be altered by payment reconciliation
  IF v_booking_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RETURN;
  END IF;

  -- Calculate paid_total strictly from RECORDED payments under row lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)
  INTO v_paid_total
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- CASE A: Deposit satisfied -> WAITING_DEPOSIT / APPROVED -> CONFIRMED
  IF v_booking_status IN ('WAITING_DEPOSIT', 'APPROVED') THEN
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
          AND status IN ('ACCEPTED', 'WAITING_DEPOSIT');
      END IF;
    END IF;

  -- CASE B: Deposit lost (due to VOID) -> CONFIRMED -> WAITING_DEPOSIT
  ELSIF v_booking_status = 'CONFIRMED' THEN
    IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
      -- Safeguard: Do not downgrade if sessions have already started or completed
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


-- ----------------------------------------------------------------------------
-- 2. Core RPC: artist_approve_payment_submission
-- ----------------------------------------------------------------------------
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
SET search_path = ''
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

  -- Atomic Lock & PENDING Status Check
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

  -- 3. Trigger Deposit Reconciliation Helper (Single source of truth for confirming booking & estimate request)
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


-- ----------------------------------------------------------------------------
-- 3. Core RPC: admin_approve_payment_submission (Alias / Wrapper)
-- ----------------------------------------------------------------------------
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
SET search_path = ''
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


-- ----------------------------------------------------------------------------
-- 4. One-Time Safe Repair for Existing Stale Data
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT DISTINCT booking_id 
    FROM public.booking_payment_submissions 
    WHERE status = 'APPROVED'
  LOOP
    PERFORM public.reconcile_booking_deposit_status(r.booking_id);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Reload PostgREST Schema Cache
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
