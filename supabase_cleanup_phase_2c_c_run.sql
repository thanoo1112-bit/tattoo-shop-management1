-- ====================================================================
-- 157 TATTOO — PHASE 2C-C TARGETED CLEANUP SCRIPT
-- RUN THIS IN SUPABASE SQL EDITOR
-- ====================================================================

BEGIN;

-- 1. Delete all Phase 2C-C test payments (2 items)
DELETE FROM public.booking_payments
WHERE id IN (
  '055153e8-3566-4185-9164-ecfd9b96fb93',
  '53d33eca-10ae-435b-bd52-685b0d6822cb'
);

-- 2. Delete test session (1 item)
DELETE FROM public.booking_sessions
WHERE id IN ('3618b98e-b76a-4d75-8b33-d8ddb6dbfa73')
   OR booking_id IN (
     '57d8febd-6f67-47a3-b4ec-d75a44dd5e5d',
     '8627264a-6252-49c3-808d-147e2785fc56',
     '20d0c1f3-1d22-4d9a-9d35-d775101bb796',
     'b2ecc7a3-3a5c-4c32-988a-4c54a9a308d6',
     '21b3d235-73d7-4ebf-ba93-ea2573511747'
   );

-- 3. Delete test bookings (5 items)
DELETE FROM public.bookings
WHERE id IN (
  '57d8febd-6f67-47a3-b4ec-d75a44dd5e5d',
  '8627264a-6252-49c3-808d-147e2785fc56',
  '20d0c1f3-1d22-4d9a-9d35-d775101bb796',
  'b2ecc7a3-3a5c-4c32-988a-4c54a9a308d6',
  '21b3d235-73d7-4ebf-ba93-ea2573511747'
);

-- 4. Delete test estimate requests (preserving 2 baseline estimates)
DELETE FROM public.estimate_requests
WHERE id IN (
  '12b77735-d11c-4f5d-9adb-0138f866cfc4',
  '2abe9a7b-645f-4c7d-a6c8-e9ffe350ce66',
  'e9a59067-e8c0-4001-8296-f8397ac0496d',
  'be12479b-2621-45a6-a214-1958f439107a',
  '75dbd960-a92a-4ccd-a735-3a915f1cb838',
  '734b10f3-4bc6-42c0-921a-aaba18d1b16f',
  '7e01c4b9-32bf-4e24-9b7b-ce8d7ebebbed'
);

-- 5. Delete test customers from UI testing runs
DELETE FROM public.customers
WHERE user_id IN (
  '807a69b9-9d6a-49b2-8433-5e5a39ce43f6',
  'd9481fd0-4d4d-440c-9310-3d61f62357dd',
  '2e029511-a512-4d55-870d-58bd8f2d5cc4',
  '5ae5c8c2-39b5-4c27-aa9e-4f7d7c87923e',
  'b3c6a3ea-dd67-4dd6-881d-ae1ddfe8b4a6'
);

DELETE FROM public.profiles
WHERE user_id IN (
  '807a69b9-9d6a-49b2-8433-5e5a39ce43f6',
  'd9481fd0-4d4d-440c-9310-3d61f62357dd',
  '2e029511-a512-4d55-870d-58bd8f2d5cc4',
  '5ae5c8c2-39b5-4c27-aa9e-4f7d7c87923e',
  'b3c6a3ea-dd67-4dd6-881d-ae1ddfe8b4a6'
);

DELETE FROM auth.users
WHERE id IN (
  '807a69b9-9d6a-49b2-8433-5e5a39ce43f6',
  'd9481fd0-4d4d-440c-9310-3d61f62357dd',
  '2e029511-a512-4d55-870d-58bd8f2d5cc4',
  '5ae5c8c2-39b5-4c27-aa9e-4f7d7c87923e',
  'b3c6a3ea-dd67-4dd6-881d-ae1ddfe8b4a6'
);

COMMIT;

-- ====================================================================
-- VERIFY BASELINE TARGET:
-- artists = 2
-- estimate_requests = 2
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
