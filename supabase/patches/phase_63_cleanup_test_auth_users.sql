-- ====================================================================
-- PHASE 63: CLEANUP PUBLIC SCHEMA TEST USER DATA (FORWARD-ONLY PATCH)
-- ====================================================================
-- Target: ONLY users with email starting with 'test_%'
-- Goal: Safely remove child records in public schema referencing test UIDs
--       so that Supabase Auth users can be deleted via Admin API.
-- ====================================================================

BEGIN;

-- 1. Enable purge bypass flag for trigger compatibility
SELECT set_config('app.customer_purge', 'on', true);

-- 2. Delete test customer data from public schema in order of dependency

-- 2a. Delete estimate_requests by test customer_user_id
DELETE FROM public.estimate_requests
WHERE customer_user_id IN (
  SELECT id FROM auth.users WHERE email ILIKE 'test_%'
  UNION
  SELECT user_id FROM public.profiles WHERE email ILIKE 'test_%'
);

-- 2b. Delete flash_reservations by test customer_user_id
DELETE FROM public.flash_reservations
WHERE customer_user_id IN (
  SELECT id FROM auth.users WHERE email ILIKE 'test_%'
  UNION
  SELECT user_id FROM public.profiles WHERE email ILIKE 'test_%'
);

-- 2c. Delete bookings by test customer_user_id
DELETE FROM public.bookings
WHERE customer_user_id IN (
  SELECT id FROM auth.users WHERE email ILIKE 'test_%'
  UNION
  SELECT user_id FROM public.profiles WHERE email ILIKE 'test_%'
);

-- 2d. Delete customer health disclosures / medical snapshots / uploads if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_health_disclosures') THEN
    EXECUTE 'DELETE FROM public.customer_health_disclosures WHERE user_id IN (SELECT id FROM auth.users WHERE email ILIKE ''test_%'' UNION SELECT user_id FROM public.profiles WHERE email ILIKE ''test_%'')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_medical_snapshots') THEN
    EXECUTE 'DELETE FROM public.customer_medical_snapshots WHERE customer_user_id IN (SELECT id FROM auth.users WHERE email ILIKE ''test_%'' UNION SELECT user_id FROM public.profiles WHERE email ILIKE ''test_%'')';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_uploads') THEN
    EXECUTE 'DELETE FROM public.customer_uploads WHERE user_id IN (SELECT id FROM auth.users WHERE email ILIKE ''test_%'' UNION SELECT user_id FROM public.profiles WHERE email ILIKE ''test_%'')';
  END IF;
END $$;

-- 2e. Delete public.customers for test users
DELETE FROM public.customers
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email ILIKE 'test_%'
  UNION
  SELECT user_id FROM public.profiles WHERE email ILIKE 'test_%'
) OR email ILIKE 'test_%';

-- 2f. Delete public.profiles for test users
DELETE FROM public.profiles
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email ILIKE 'test_%'
) OR email ILIKE 'test_%';

-- Reset purge bypass flag
SELECT set_config('app.customer_purge', 'off', true);

COMMIT;
