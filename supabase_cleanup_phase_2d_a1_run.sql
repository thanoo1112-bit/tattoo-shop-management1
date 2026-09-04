-- ====================================================================
-- 157 TATTOO — PHASE 2D-A.1 TARGETED RUNTIME CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================

BEGIN;

-- 1. Delete test payments
DELETE FROM public.booking_payments
WHERE id IN (
  '98444dff-3a72-4bca-9db9-b2001f786e4f',
  'f35d92c4-dcaa-48c4-bea3-90ef7c1b4a35',
  '90f06e58-467d-4ad1-bbfe-9b6e408d6d5c'
)
OR booking_id IN (
  'af378052-cbee-48f6-aca2-3e70bd626b53',
  '018e39b9-7ee0-49ca-9e12-d258c507e58f',
  '1103ea1a-cbb7-4e8c-ac8c-408600f97b6f'
);

-- 2. Delete test sessions
DELETE FROM public.booking_sessions
WHERE id IN (
  '84a408f2-9d6c-4a97-a287-8a09193f018f',
  'b17f150f-01e3-4d6a-b344-66e7f12246c3',
  '909e831e-693e-4f82-b576-d8c3d8f3a4a7',
  '9d83c671-e4ba-4150-838b-4abf5fc8b4ef',
  'ae558d69-1d5a-4c7e-86fb-6d3f44cde780'
)
OR booking_id IN (
  'af378052-cbee-48f6-aca2-3e70bd626b53',
  '018e39b9-7ee0-49ca-9e12-d258c507e58f',
  '1103ea1a-cbb7-4e8c-ac8c-408600f97b6f'
);

-- 3. Delete test bookings
DELETE FROM public.bookings
WHERE id IN (
  'af378052-cbee-48f6-aca2-3e70bd626b53',
  '018e39b9-7ee0-49ca-9e12-d258c507e58f',
  '1103ea1a-cbb7-4e8c-ac8c-408600f97b6f'
);

-- 4. Delete test estimate requests
DELETE FROM public.estimate_requests
WHERE id IN (
  '91cd4717-bfb8-4e02-8112-d1eef16e5e80',
  'f5550806-2fb9-4391-baeb-42dd04bad332',
  '1ed23efd-ab8d-4cd6-b8f5-8f0f7851d001'
);

-- 5. Delete temporary test customers
DELETE FROM public.customers WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2da1_%@157tattoo.com' OR email LIKE 'test_check_%@157tattoo.com'
);
DELETE FROM public.profiles WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2da1_%@157tattoo.com' OR email LIKE 'test_check_%@157tattoo.com'
);
DELETE FROM auth.users WHERE email LIKE 'cust_2da1_%@157tattoo.com' OR email LIKE 'test_check_%@157tattoo.com';

COMMIT;

-- Verify Clean Baseline
SELECT 'artists' AS entity, COUNT(*) AS count FROM public.artists
UNION ALL
SELECT 'estimate_requests', COUNT(*) FROM public.estimate_requests
UNION ALL
SELECT 'bookings', COUNT(*) FROM public.bookings
UNION ALL
SELECT 'booking_sessions', COUNT(*) FROM public.booking_sessions
UNION ALL
SELECT 'booking_payments', COUNT(*) FROM public.booking_payments;
