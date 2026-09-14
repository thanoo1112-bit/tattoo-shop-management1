-- ============================================================================
-- 157 TATTOO — PHASE 13 PATCH (HARDENED): AUTO-REJECT EXPIRED DEPOSIT BOOKINGS
-- Production-hardened 24-hour deposit deadline auto-rejection.
-- Scheduled via pg_cron every 5 minutes.
-- Least privilege security model: Executable strictly by service_role & postgres.
-- ============================================================================

-- 1. Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create Hardened RPC: auto_reject_expired_deposit_bookings
CREATE OR REPLACE FUNCTION public.auto_reject_expired_deposit_bookings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
  v_reason TEXT := 'ไม่ได้ชำระมัดจำภายในเวลาที่กำหนด';
  v_current_status TEXT;
  v_has_timely_submission BOOLEAN;
BEGIN
  -- Row-level locking with FOR UPDATE OF b to prevent race conditions with concurrent payment submissions.
  FOR v_rec IN
    SELECT b.id, b.estimate_request_id, b.approved_at
    FROM public.bookings b
    WHERE b.status = 'WAITING_DEPOSIT'
      AND b.approved_at IS NOT NULL
      AND pg_catalog.now() >= (b.approved_at + INTERVAL '24 hours')
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_payment_submissions s
        WHERE s.booking_id = b.id
          AND s.status IN ('PENDING', 'APPROVED')
          AND COALESCE(s.submitted_at, s.created_at) < (b.approved_at + INTERVAL '24 hours')
      )
    FOR UPDATE OF b
  LOOP
    -- Post-lock re-check to guarantee safety against concurrent transactions
    SELECT status INTO v_current_status
    FROM public.bookings
    WHERE id = v_rec.id;

    SELECT EXISTS (
      SELECT 1 FROM public.booking_payment_submissions s
      WHERE s.booking_id = v_rec.id
        AND s.status IN ('PENDING', 'APPROVED')
        AND COALESCE(s.submitted_at, s.created_at) < (v_rec.approved_at + INTERVAL '24 hours')
    ) INTO v_has_timely_submission;

    IF v_current_status != 'WAITING_DEPOSIT' OR v_has_timely_submission THEN
      CONTINUE;
    END IF;

    -- 1. Update Booking status to REJECTED
    UPDATE public.bookings
    SET
      status = 'REJECTED',
      rejected_at = pg_catalog.now(),
      admin_note = v_reason,
      updated_at = pg_catalog.now()
    WHERE id = v_rec.id;

    -- 2. Update linked Estimate Request to REJECTED
    IF v_rec.estimate_request_id IS NOT NULL THEN
      UPDATE public.estimate_requests
      SET
        status = 'REJECTED',
        rejected_at = pg_catalog.now(),
        quote_note = v_reason,
        updated_at = pg_catalog.now()
      WHERE id = v_rec.estimate_request_id;
    END IF;

    -- 3. Cancel scheduled sessions to release artist slots
    UPDATE public.booking_sessions
    SET
      status = 'CANCELLED',
      note = v_reason,
      updated_at = pg_catalog.now()
    WHERE booking_id = v_rec.id
      AND status = 'SCHEDULED';

    v_count := v_count + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'auto_rejected_count', v_count
  );
END;
$$;

-- 3. Strict Least Privilege Permissions Lockdown
REVOKE ALL ON FUNCTION public.auto_reject_expired_deposit_bookings() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_reject_expired_deposit_bookings() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_reject_expired_deposit_bookings() TO service_role, postgres;

-- 4. Register 5-minute recurring pg_cron schedule
SELECT cron.unschedule('auto_reject_expired_deposit_bookings_job') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_reject_expired_deposit_bookings_job');
SELECT cron.schedule('auto_reject_expired_deposit_bookings_job', '*/5 * * * *', 'SELECT public.auto_reject_expired_deposit_bookings()');
