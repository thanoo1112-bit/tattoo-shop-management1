-- ====================================================================
-- 157 TATTOO — PHASE 2E-A TARGETED RUNTIME CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1. Delete all Phase 2E-A Test Payments
-- --------------------------------------------------------------------
DELETE FROM public.booking_payments
WHERE customer_user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com' OR email LIKE 'test_%@157tattoo.com'
)
OR booking_id IN (
  SELECT id FROM public.bookings WHERE customer_user_id IN (
    SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com' OR email LIKE 'test_%@157tattoo.com'
  )
);

-- --------------------------------------------------------------------
-- 2. Delete all Phase 2E-A Test Sessions
-- --------------------------------------------------------------------
DELETE FROM public.booking_sessions
WHERE booking_id IN (
  SELECT id FROM public.bookings WHERE customer_user_id IN (
    SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com' OR email LIKE 'test_%@157tattoo.com'
  )
);

-- --------------------------------------------------------------------
-- 3. Delete all Phase 2E-A Test Bookings
-- --------------------------------------------------------------------
DELETE FROM public.bookings
WHERE customer_user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com' OR email LIKE 'test_%@157tattoo.com'
);

-- --------------------------------------------------------------------
-- 4. Delete all Phase 2E-A Test Estimate Requests
-- --------------------------------------------------------------------
DELETE FROM public.estimate_requests
WHERE customer_user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com' OR email LIKE 'test_%@157tattoo.com'
);

-- --------------------------------------------------------------------
-- 5. Delete Phase 2E-A Test Customer Records and Profiles
-- --------------------------------------------------------------------
DELETE FROM public.customers
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com' OR email LIKE 'test_%@157tattoo.com'
);

DELETE FROM public.profiles
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com' OR email LIKE 'test_%@157tattoo.com'
);

-- --------------------------------------------------------------------
-- 6. Delete Phase 2E-A Test Users from auth.users
-- --------------------------------------------------------------------
DELETE FROM auth.users
WHERE email LIKE 'cust_2ea_%@157tattoo.com'
   OR email LIKE 'test_%@157tattoo.com';

COMMIT;

-- --------------------------------------------------------------------
-- 7. Verify Clean Baseline: Must be 2 / 0 / 0 / 0 / 0
-- --------------------------------------------------------------------
SELECT 'artists' AS entity, COUNT(*) AS count FROM public.artists
UNION ALL
SELECT 'estimate_requests', COUNT(*) FROM public.estimate_requests
UNION ALL
SELECT 'bookings', COUNT(*) FROM public.bookings
UNION ALL
SELECT 'booking_sessions', COUNT(*) FROM public.booking_sessions
UNION ALL
SELECT 'booking_payments', COUNT(*) FROM public.booking_payments;
