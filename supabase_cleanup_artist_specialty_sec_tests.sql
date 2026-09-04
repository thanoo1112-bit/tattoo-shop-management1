-- ====================================================================
-- 157 TATTOO — ARTIST SPECIALTY SECURITY SUITE TARGETED CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================
BEGIN;

-- 1. Delete Test Estimate Requests
DELETE FROM public.estimate_requests
WHERE id IN (
  '3d4ca647-aef1-42d3-be71-9149a1485c01',
  '7b5c46c5-c221-40b7-8160-3f8fc174cc70'
);

-- 2. Delete Temporary Test Customer Profiles and Auth Users
DELETE FROM public.customers WHERE user_id IN (
  'd9d6ed7f-fa71-49fd-b97b-e1c5a78928a7',
  '3a7a0eaa-27b0-4cbc-9b82-b69005d3b5ac',
  '718c7a87-6dfa-490e-ace5-caa44f6b489c',
  '7059a67e-4d19-4226-867e-d582b6151a24'
);

DELETE FROM public.profiles WHERE user_id IN (
  'd9d6ed7f-fa71-49fd-b97b-e1c5a78928a7',
  '3a7a0eaa-27b0-4cbc-9b82-b69005d3b5ac',
  '718c7a87-6dfa-490e-ace5-caa44f6b489c',
  '7059a67e-4d19-4226-867e-d582b6151a24'
);

DELETE FROM auth.users WHERE id IN (
  'd9d6ed7f-fa71-49fd-b97b-e1c5a78928a7',
  '3a7a0eaa-27b0-4cbc-9b82-b69005d3b5ac',
  '718c7a87-6dfa-490e-ace5-caa44f6b489c',
  '7059a67e-4d19-4226-867e-d582b6151a24'
);

COMMIT;
