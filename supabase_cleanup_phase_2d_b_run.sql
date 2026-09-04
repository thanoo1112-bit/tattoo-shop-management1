-- ====================================================================
-- 157 TATTOO — PHASE 2D-B COMPLETE CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================
BEGIN;

-- 1. Delete all booking payments for test customers
DELETE FROM public.booking_payments
WHERE booking_id IN (
  SELECT id FROM public.bookings
  WHERE customer_user_id IN (
    SELECT id FROM auth.users WHERE email LIKE 'cust_2db_%@157tattoo.com'
  )
);

-- 2. Delete all booking sessions for test customers
DELETE FROM public.booking_sessions
WHERE booking_id IN (
  SELECT id FROM public.bookings
  WHERE customer_user_id IN (
    SELECT id FROM auth.users WHERE email LIKE 'cust_2db_%@157tattoo.com'
  )
);

-- 3. Delete all bookings for test customers
DELETE FROM public.bookings
WHERE customer_user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2db_%@157tattoo.com'
);

-- 4. Delete all estimate requests for test customers
DELETE FROM public.estimate_requests
WHERE customer_user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2db_%@157tattoo.com'
);

-- 5. Delete all test customers, profiles, and auth users
DELETE FROM public.customers
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2db_%@157tattoo.com'
);

DELETE FROM public.profiles
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'cust_2db_%@157tattoo.com'
);

DELETE FROM auth.users
WHERE email LIKE 'cust_2db_%@157tattoo.com';

COMMIT;

-- ====================================================================
-- VERIFY CLEAN BASELINE (TARGET: 2 / 0 / 0 / 0 / 0)
-- ====================================================================
SELECT 'artists' AS entity, COUNT(*) AS count FROM public.artists
UNION ALL
SELECT 'estimate_requests', COUNT(*) FROM public.estimate_requests
UNION ALL
SELECT 'bookings', COUNT(*) FROM public.bookings
UNION ALL
SELECT 'booking_sessions', COUNT(*) FROM public.booking_sessions
UNION ALL
SELECT 'booking_payments', COUNT(*) FROM public.booking_payments;
