-- ====================================================================
-- 157 TATTOO — PHASE 2E-B TARGETED RUNTIME CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================
BEGIN;

-- 1. Delete Test Payments (if any)
DELETE FROM public.booking_payments
WHERE booking_id IN ('9d3ab86a-b19f-40ee-9f6d-8890d0584b3c', 'ba958226-3707-4ecd-a661-adcd86c77e44');

-- 2. Delete Test Sessions
DELETE FROM public.booking_sessions
WHERE id IN ('')
   OR booking_id IN ('9d3ab86a-b19f-40ee-9f6d-8890d0584b3c', 'ba958226-3707-4ecd-a661-adcd86c77e44');

-- 3. Delete Test Bookings
DELETE FROM public.bookings
WHERE id IN ('9d3ab86a-b19f-40ee-9f6d-8890d0584b3c', 'ba958226-3707-4ecd-a661-adcd86c77e44');

-- 4. Delete Test Estimate Requests
DELETE FROM public.estimate_requests
WHERE id IN ('81e193d2-824e-4563-b7fa-904a34e8f2f1', 'bc48dbd9-fd75-4c8d-a9e2-d11a58e5d79a');

-- 5. Delete Temporary Test Customer Profiles and Auth Users
DELETE FROM public.customers WHERE user_id IN ('5fe0bd84-3c6e-4b04-881d-90ff4dcb8534', '68e7d1f6-7e69-4337-96f2-afd12a0163fc');
DELETE FROM public.profiles WHERE user_id IN ('5fe0bd84-3c6e-4b04-881d-90ff4dcb8534', '68e7d1f6-7e69-4337-96f2-afd12a0163fc');
DELETE FROM auth.users WHERE id IN ('5fe0bd84-3c6e-4b04-881d-90ff4dcb8534', '68e7d1f6-7e69-4337-96f2-afd12a0163fc');

-- Clean any residual 2eb test fixtures
DELETE FROM public.booking_payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com'));
DELETE FROM public.booking_sessions WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com'));
DELETE FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com');
DELETE FROM public.estimate_requests WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com');
DELETE FROM public.customers WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com');
DELETE FROM public.profiles WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com');
DELETE FROM auth.users WHERE email LIKE 'cust_2eb_%@157tattoo.com' OR email LIKE 'cust_debug_%@157tattoo.com' OR email LIKE 'cust_diag_%@157tattoo.com';

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
