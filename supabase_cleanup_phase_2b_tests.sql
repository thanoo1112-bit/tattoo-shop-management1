-- ====================================================================
-- 157 TATTOO — PHASE 2B RUNTIME TEST DATA CLEANUP SCRIPT
-- Execute in Supabase SQL Editor as postgres superuser / service_role
-- Deletes ONLY the temporary test rows created during Phase 2B verification.
-- Preserves the 2 baseline pre-existing estimate requests (75dbd960 & 7e01c4b9).
-- ====================================================================

BEGIN;

-- 1. Clean up temporary test sessions (2 rows)
DELETE FROM public.booking_sessions
WHERE id IN (
  '7be881af-d5f7-435a-9d8b-b47d086adf6d',
  '543875b7-01b7-4948-ab73-043147ae1521'
);

-- 2. Clean up temporary test bookings (4 rows)
DELETE FROM public.bookings
WHERE id IN (
  '10615f92-78e1-4052-a7f7-bd718b42a14b',
  '4337c8a4-9edb-4649-a14d-1896e1f204b5',
  '8fec8c09-d74f-4cd6-a756-19b84d9ddbc5',
  'bb895cad-fa10-4717-befc-f54296d4e9f6'
);

-- 3. Clean up temporary test estimate requests (ONLY the 4 created in Phase 2B test)
DELETE FROM public.estimate_requests
WHERE id IN (
  'b498272d-9e43-49a4-9f36-6dca5046c890',
  '7de26422-ad82-469d-81fe-5b57c08989c8',
  '3922ed40-40b3-4e30-b085-fa0a497d0a3d',
  '2fcbf9fe-2ff3-437b-98c6-c0d718cdee88'
);

COMMIT;
