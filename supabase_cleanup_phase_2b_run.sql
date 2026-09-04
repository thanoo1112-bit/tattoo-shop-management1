-- ============================================================================
-- 157 TATTOO — PHASE 2B COMPLETE CLEANUP SCRIPT
-- 
-- Execute in Supabase SQL Editor as postgres / service_role
-- Dependency Order: booking_sessions -> bookings -> estimate_requests -> customers -> profiles -> auth.users
-- 
-- Preserves:
-- - Admin account (admin@157tattoo.com)
-- - Real Artists: ช่างบาส, ช่างบอม (2 rows)
-- - Baseline Estimates: 75dbd960 & 7e01c4b9 (2 rows)
-- - Real Customers: tnklaxamx@gmail.com, ai3885228@gmail.com
-- ============================================================================

BEGIN;

-- 1. Delete test booking sessions (2 rows)
DELETE FROM public.booking_sessions
WHERE id IN (
  'b79fc31a-9197-4255-938b-a1e91d578682',
  '2e038727-c216-46c7-a883-e43557b1eb04'
);

-- 2. Delete test bookings (4 rows)
DELETE FROM public.bookings
WHERE id IN (
  '7233a58f-158e-4f61-9358-cb9049dd61c4',
  '70262810-f0d6-4ee6-a0f1-c369e8793176',
  '16f1a5ff-116e-4c9b-9970-74f9ccb30c7b',
  'ab0b5bea-aa41-4122-88c9-e9cd5c4af7e7'
);

-- 3. Delete test estimate requests (4 rows)
DELETE FROM public.estimate_requests
WHERE id IN (
  '44a82448-4574-49c0-9463-63bc7b4c599c',
  '16f4808f-0ed7-49f6-94f7-a49d995f6f17',
  '5fae47ff-4467-4fa0-8a4f-cc34ff3035ff',
  'c778a09e-8f98-4f7c-8f42-7298fdcf54fa'
);

-- 4. Delete test customer master records (3 test accounts)
DELETE FROM public.customers
WHERE user_id IN (
  '5b77e57e-4db7-4063-8d35-350ed5036524',
  'f952e394-8205-44b6-8885-a16c503f6eed',
  'e8297ddc-dc00-46a1-83ac-0a376cd9269b'
);

-- 5. Delete test user profiles (3 test accounts)
DELETE FROM public.profiles
WHERE user_id IN (
  '5b77e57e-4db7-4063-8d35-350ed5036524',
  'f952e394-8205-44b6-8885-a16c503f6eed',
  'e8297ddc-dc00-46a1-83ac-0a376cd9269b'
);

-- 6. Delete test auth accounts (3 test accounts)
DELETE FROM auth.users
WHERE id IN (
  '5b77e57e-4db7-4063-8d35-350ed5036524',
  'f952e394-8205-44b6-8885-a16c503f6eed',
  'e8297ddc-dc00-46a1-83ac-0a376cd9269b'
);

COMMIT;

-- 7. Verification Query (Run to confirm exact baseline)
SELECT 'artists' AS entity, COUNT(*) AS count FROM public.artists
UNION ALL
SELECT 'estimate_requests', COUNT(*) FROM public.estimate_requests
UNION ALL
SELECT 'bookings', COUNT(*) FROM public.bookings
UNION ALL
SELECT 'booking_sessions', COUNT(*) FROM public.booking_sessions;
