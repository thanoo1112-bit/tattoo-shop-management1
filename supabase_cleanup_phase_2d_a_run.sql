-- ====================================================================
-- 157 TATTOO — PHASE 2D-A COMPLETE TARGETED CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR AS POSTGRES / SERVICE ROLE
-- ====================================================================
BEGIN;

-- 1. Delete test payments
DELETE FROM public.booking_payments
WHERE id IN (
  'c4f867a7-d5ca-405f-8510-8cc9a0d1c18e',
  '02cd340f-c1f4-4449-aa2a-15c1939a6995',
  '7454f1de-0f51-4de0-957d-4eb6dfe697dc'
)
OR booking_id IN (
  '2728a3f1-5785-4b64-8132-6bdab3bad100',
  '328436c7-164e-4b4a-bbea-4491549d0b9e',
  '5cdc1a3f-40e6-4d15-9a1b-e50d39f5488a',
  'bf973ade-8f1c-49ff-8195-bbaa00069a63'
);

-- 2. Delete test sessions
DELETE FROM public.booking_sessions
WHERE id IN (
  '8ac5fe67-53a7-439c-951a-17d0bef48210',
  'cc7bd98f-471a-46df-b98c-cf1444cb6146'
)
OR booking_id IN (
  '2728a3f1-5785-4b64-8132-6bdab3bad100',
  '328436c7-164e-4b4a-bbea-4491549d0b9e',
  '5cdc1a3f-40e6-4d15-9a1b-e50d39f5488a',
  'bf973ade-8f1c-49ff-8195-bbaa00069a63'
);

-- 3. Delete test bookings
DELETE FROM public.bookings
WHERE id IN (
  '2728a3f1-5785-4b64-8132-6bdab3bad100',
  '328436c7-164e-4b4a-bbea-4491549d0b9e',
  '5cdc1a3f-40e6-4d15-9a1b-e50d39f5488a',
  'bf973ade-8f1c-49ff-8195-bbaa00069a63'
);

-- 4. Delete test estimate requests
DELETE FROM public.estimate_requests
WHERE id IN (
  '66531f64-e5b1-481e-a26f-9ab337bc6a42',
  'fdc6ca61-d058-465f-9d5d-34f43ce65f52',
  'a2ac4b1b-4a28-420e-987a-07fa3a7ec5ba',
  '473d02c3-ff68-4cb9-9f8b-41eb92d47d80',
  'f69ff34e-e8e2-4f1a-b903-17554309a0f0'
);

-- 5. Delete temporary test customer accounts
DELETE FROM public.customers WHERE user_id IN ('d95f231f-a5cb-45c6-a520-f9093c9008f9', '05c0e7cd-1d82-4a92-a6b8-8d9953d9849a', '1f21deb5-a58e-4b4a-9347-beed8328aa32', '0ada336d-6d0e-419d-8b46-93ec15fcb4be', '7fb0cbab-623f-4a93-b412-e4086fbaef8c');
DELETE FROM public.profiles WHERE user_id IN ('d95f231f-a5cb-45c6-a520-f9093c9008f9', '05c0e7cd-1d82-4a92-a6b8-8d9953d9849a', '1f21deb5-a58e-4b4a-9347-beed8328aa32', '0ada336d-6d0e-419d-8b46-93ec15fcb4be', '7fb0cbab-623f-4a93-b412-e4086fbaef8c');
DELETE FROM auth.users WHERE user_id IN ('d95f231f-a5cb-45c6-a520-f9093c9008f9', '05c0e7cd-1d82-4a92-a6b8-8d9953d9849a', '1f21deb5-a58e-4b4a-9347-beed8328aa32', '0ada336d-6d0e-419d-8b46-93ec15fcb4be', '7fb0cbab-623f-4a93-b412-e4086fbaef8c') OR id IN ('d95f231f-a5cb-45c6-a520-f9093c9008f9', '05c0e7cd-1d82-4a92-a6b8-8d9953d9849a', '1f21deb5-a58e-4b4a-9347-beed8328aa32', '0ada336d-6d0e-419d-8b46-93ec15fcb4be', '7fb0cbab-623f-4a93-b412-e4086fbaef8c');

COMMIT;

-- ====================================================================
-- VERIFY CLEAN BASELINE
-- artists = 2
-- estimate_requests = 0
-- bookings = 0
-- booking_sessions = 0
-- booking_payments = 0
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
