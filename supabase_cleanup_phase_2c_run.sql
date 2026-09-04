-- PHASE 2C-A RUNTIME TEST CLEANUP
BEGIN;

-- 1. Delete payments
DELETE FROM public.booking_payments
WHERE id IN ('963b5a77-eb52-43f2-b180-861c14f6c3bc', 'df8b3afb-59a8-4486-ae8c-0eaf31c5f895', '5b7d080d-31b2-40e8-91b4-b294f5082583');

-- 2. Delete booking
DELETE FROM public.bookings
WHERE id = 'df03e551-94d3-419e-a7fe-9666ef20b010';

-- 3. Delete estimate
DELETE FROM public.estimate_requests
WHERE id = 'fd15b1ec-8f33-4b81-97ea-ca9748404ded';

-- 4. Delete test customers
DELETE FROM public.customers WHERE user_id IN ('f39d63e5-76f0-4e56-99dd-0bd2141e4c8f', '33eaf6b2-a158-49a4-9031-092684602b78');
DELETE FROM public.profiles WHERE user_id IN ('f39d63e5-76f0-4e56-99dd-0bd2141e4c8f', '33eaf6b2-a158-49a4-9031-092684602b78');
DELETE FROM auth.users WHERE id IN ('f39d63e5-76f0-4e56-99dd-0bd2141e4c8f', '33eaf6b2-a158-49a4-9031-092684602b78');

COMMIT;

-- Verify Baseline
SELECT 'artists' AS entity, COUNT(*) AS count FROM public.artists
UNION ALL
SELECT 'estimate_requests', COUNT(*) FROM public.estimate_requests
UNION ALL
SELECT 'bookings', COUNT(*) FROM public.bookings
UNION ALL
SELECT 'booking_sessions', COUNT(*) FROM public.booking_sessions
UNION ALL
SELECT 'booking_payments', COUNT(*) FROM public.booking_payments;
