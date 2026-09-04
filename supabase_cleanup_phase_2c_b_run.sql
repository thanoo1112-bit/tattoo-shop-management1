-- PHASE 2C-B RUNTIME TEST CLEANUP
BEGIN;

-- 1. Delete payments
DELETE FROM public.booking_payments
WHERE id IN ('b48a29b7-9892-411d-930f-4dc242abf404', '66843fd8-0d06-440a-b6bc-fc0a2c16790d', '62e20218-e28a-45e0-a8b9-e83536c6f1c2', 'ce5533c2-3ebd-4159-a3da-7b050cf9bc08', '98d1c659-97ce-412a-a15e-b5b27b094948', 'ec5c7390-81db-4470-a4f0-022db30cbc80', '539a4621-733e-4eb3-bf17-2aaeaf21e957', '268238f2-f575-46fb-9a91-ed88f41b2060', '071c6712-51d0-42a5-84db-233db2d77a66', '62a8d8fc-e075-4d8c-9771-1d0385ac7a7b', '5bc0106a-7b21-4047-adca-070de0382dd7', 'aa43f8cf-a94f-45ef-81a4-03f087791b55');

-- 2. Delete sessions
DELETE FROM public.booking_sessions WHERE id IN ('c9d18416-4e54-4736-a060-ec7a213a8b4b');

-- 3. Delete bookings
DELETE FROM public.bookings
WHERE id IN ('f4011e73-27d9-4a29-a327-0fcacdf87073', 'd7eb098f-970b-468c-9827-22e8db9c6690', 'bd68c5d5-2373-4f67-a959-61105049b295', '4fb03559-46c5-49c8-830a-42b6f3d8fea7', 'de12aaad-4a73-4c94-bcf6-a5c8d81ad62b', '9fd396d3-0e80-42de-bb0a-a62d29aea118');

-- 4. Delete estimates
DELETE FROM public.estimate_requests
WHERE id IN ('071c0d44-913b-4f11-907c-7ba1b1bd66e6', 'aa7f7895-3467-4a93-a4f0-1ce9c9ac6f3e', '3b25ead4-bcd8-49a6-aff7-622cb644cea9', '0c8e5f93-24b1-4c9f-8fc6-a44f7609fa34', '055b6452-bbfb-48e1-9923-5e04687d8195', '5fda5ca1-25c3-4205-9974-384885945b38');

-- 5. Delete test customers
DELETE FROM public.customers WHERE user_id IN ('70fdf50a-62f9-4e5b-8973-b7b1b55bcc5c', '232090da-e46e-4cd3-8ea1-6285e2d2a5fa');
DELETE FROM public.profiles WHERE user_id IN ('70fdf50a-62f9-4e5b-8973-b7b1b55bcc5c', '232090da-e46e-4cd3-8ea1-6285e2d2a5fa');
DELETE FROM auth.users WHERE id IN ('70fdf50a-62f9-4e5b-8973-b7b1b55bcc5c', '232090da-e46e-4cd3-8ea1-6285e2d2a5fa');

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
