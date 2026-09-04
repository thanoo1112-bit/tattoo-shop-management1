-- ====================================================================
-- 157 TATTOO — PHASE 2C-D RUNTIME CLEANUP
-- ====================================================================
BEGIN;

-- 1. Delete test payments
DELETE FROM public.booking_payments
WHERE id IN ('89a67134-7960-4e5a-bd96-eed0761374aa', 'c13fb6e8-f8c5-47ea-bc07-2f822f8e934e', '8d06d762-2d84-48a9-b9d9-17196e1b484f', 'b3a87e54-157f-4e86-b36d-3366587051e3', 'aa7a8ae3-5f8b-44c0-9f79-b2918bd3e8ae');

-- 2. Delete test bookings
DELETE FROM public.bookings
WHERE id IN ('294a1b8d-53e0-4b98-8333-ca7b055d9927', 'c1b52b60-d264-4b1a-8ed8-ab594460960e', 'f5aec2ce-9d77-4c78-8a3a-90c1634f4354');

-- 3. Delete test estimate requests
DELETE FROM public.estimate_requests
WHERE id IN ('af9478fe-4dc6-4e1f-9dfc-160de7ad4f0a', 'c4480a09-eecd-4c34-b18d-db23d3cfd82d', '3638efbc-ec85-4053-8c82-387afb6cc00f');

-- 4. Delete test customer
DELETE FROM public.customers WHERE user_id IN ('bb8c4493-0ec8-43f3-9444-4a7038c79c05');
DELETE FROM public.profiles WHERE user_id IN ('bb8c4493-0ec8-43f3-9444-4a7038c79c05');
DELETE FROM auth.users WHERE id IN ('bb8c4493-0ec8-43f3-9444-4a7038c79c05');

COMMIT;

-- Verify Baseline Counts
SELECT 'artists' AS entity, COUNT(*) AS count FROM public.artists
UNION ALL
SELECT 'estimate_requests', COUNT(*) FROM public.estimate_requests
UNION ALL
SELECT 'bookings', COUNT(*) FROM public.bookings
UNION ALL
SELECT 'booking_sessions', COUNT(*) FROM public.booking_sessions
UNION ALL
SELECT 'booking_payments', COUNT(*) FROM public.booking_payments;
