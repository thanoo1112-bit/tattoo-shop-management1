-- ============================================================================
-- 157 TATTOO — PHASE 51 MIGRATION
-- ALLOW 'CONFIRMED' STATUS IN ESTIMATE REQUESTS STATUS CHECK CONSTRAINT
-- ============================================================================

BEGIN;

ALTER TABLE public.estimate_requests
  DROP CONSTRAINT IF EXISTS estimate_requests_status_check;

ALTER TABLE public.estimate_requests
  ADD CONSTRAINT estimate_requests_status_check
  CHECK (
    status IN (
      'PENDING',
      'QUOTED',
      'ACCEPTED',
      'WAITING_DEPOSIT',
      'CONFIRMED',
      'REJECTED',
      'CANCELLED',
      'EXPIRED',
      'COMPLETED'
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
