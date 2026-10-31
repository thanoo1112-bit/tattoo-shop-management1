-- ============================================================================
-- 157 TATTOO — PHASE 38 MIGRATION
-- FIX ESTIMATE REQUESTS STATUS CHECK CONSTRAINT FOR CANCELLED STATUS
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Safely find and drop existing CHECK constraints on public.estimate_requests.status
-- Targets ONLY constraints referencing status column, leaving work_type, request_type, etc. intact.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Drop known explicit status check constraint names if present
  ALTER TABLE public.estimate_requests DROP CONSTRAINT IF EXISTS estimate_requests_status_check;
  ALTER TABLE public.estimate_requests DROP CONSTRAINT IF EXISTS chk_estimate_requests_status;
  ALTER TABLE public.estimate_requests DROP CONSTRAINT IF EXISTS check_estimate_requests_status;

  -- Dynamically find any remaining CHECK constraint specifically referencing status (excluding work_type / request_type)
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.estimate_requests'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%'
      AND pg_get_constraintdef(oid) NOT LIKE '%work_type%'
      AND pg_get_constraintdef(oid) NOT LIKE '%request_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.estimate_requests DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Add estimate_requests_status_check constraint with 'CANCELLED' status
-- ----------------------------------------------------------------------------
ALTER TABLE public.estimate_requests
  ADD CONSTRAINT estimate_requests_status_check
  CHECK (status IN ('PENDING', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'));

-- ----------------------------------------------------------------------------
-- 3. PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
