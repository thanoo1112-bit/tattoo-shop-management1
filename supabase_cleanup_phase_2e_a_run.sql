-- ====================================================================
-- 157 TATTOO — PHASE 2E-A TARGETED RUNTIME CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================
BEGIN;

-- 1. Delete test payments
DELETE FROM public.booking_payments
WHERE id IN ('973e6bd6-6064-4e14-96f9-dd150e9fc2ae', '14350cc7-7c2a-465f-a38d-14aed04d5ab6', 'ca8ffdd5-359a-4345-8628-db4b4b01bd52');

-- 2. Delete test sessions
DELETE FROM public.booking_sessions
WHERE id IN ('0765940b-6445-4af4-b04b-ce304db4a5dd', 'e44f02a4-1b59-4cb9-9bdb-8c170ae83654');

-- 3. Delete test bookings
DELETE FROM public.bookings
WHERE id IN ('613537b9-c3ea-4947-a491-4fdf504a250e', 'c59418d4-4a6f-4099-b77f-bd666806e616');

-- 4. Delete test estimate requests
DELETE FROM public.estimate_requests
WHERE id IN ('7e730f5a-0fa6-4b94-9866-25b822780073', '33f36d24-f8f7-4945-8b04-4b68107ee75a', '3a10b997-a600-4afc-a911-b3d6a9a106ab');

-- 5. Delete temporary test customers
DELETE FROM public.customers WHERE user_id IN ('ff252d42-3b4b-4b4f-a2f8-c15a63c132c3', 'fb91e152-2d83-471e-8407-932508329579');
DELETE FROM public.profiles WHERE user_id IN ('ff252d42-3b4b-4b4f-a2f8-c15a63c132c3', 'fb91e152-2d83-471e-8407-932508329579');
DELETE FROM auth.users WHERE id IN ('ff252d42-3b4b-4b4f-a2f8-c15a63c132c3', 'fb91e152-2d83-471e-8407-932508329579');

-- Clean any residual 2ea test fixtures
DELETE FROM public.booking_payments WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com'));
DELETE FROM public.booking_sessions WHERE booking_id IN (SELECT id FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com'));
DELETE FROM public.bookings WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com');
DELETE FROM public.estimate_requests WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com');
DELETE FROM public.customers WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com');
DELETE FROM public.profiles WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com');
DELETE FROM auth.users WHERE email LIKE 'cust_2ea_%@157tattoo.com';

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
