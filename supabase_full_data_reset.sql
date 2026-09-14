-- ============================================================
-- 157 TATTOO — FULL DATA RESET (FINAL SAFETY PATCHED)
-- Supabase SQL Editor — Transaction-Safe Execution
-- ============================================================
-- CANONICAL IDENTITY:
--   admin@157tattoo.com (v_admin_user_id) is the SOLE protected auth identity.
-- ============================================================
-- ACTIONS:
--   1. Delete all transactional data:
--      - booking_payment_submissions
--      - booking_payments
--      - booking_sessions
--      - bookings
--      - estimate_requests
--      - flash_reservations
--      - customers
--   2. Delete profiles WHERE user_id IS DISTINCT FROM v_admin_user_id
--   3. Delete auth.users WHERE id IS DISTINCT FROM v_admin_user_id
--   4. Update Chang Bom artist.user_id = v_admin_user_id
--   5. Update Bas artist.user_id = NULL
--   6. Hard post-reset assertions (RAISE EXCEPTION on any mismatch)
-- ============================================================

DO $$
DECLARE
  v_count INT;
  v_admin_user_id UUID;
  v_deleted_auth_users INT := 0;
  v_deleted_profiles INT := 0;
  v_deleted_customers INT := 0;
  v_deleted_estimates INT := 0;
  v_deleted_bookings INT := 0;
  v_deleted_sessions INT := 0;
  v_deleted_payments INT := 0;
  v_deleted_submissions INT := 0;
  v_deleted_reservations INT := 0;

  v_bom_id UUID := '9aee0ce8-2c11-4b22-a52d-296807070d12'::uuid;
  v_bas_id UUID := 'd5af5064-d973-4bbb-b205-1ab6b2929abb'::uuid;

BEGIN

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  157 TATTOO — EXECUTE FULL DATA RESET (SAFETY PATCHED)';
  RAISE NOTICE '====================================================';

  -- STEP 0: LOCATE CANONICAL ADMIN USER ID
  SELECT id INTO v_admin_user_id
  FROM auth.users
  WHERE email = 'admin@157tattoo.com';

  IF v_admin_user_id IS NULL THEN
    SELECT user_id INTO v_admin_user_id
    FROM public.profiles
    WHERE email = 'admin@157tattoo.com' AND role = 'admin';
  END IF;

  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'CRITICAL ABORT: Canonical admin@157tattoo.com user ID not found!' USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE 'Located Owner Admin User ID: %', v_admin_user_id;

  -- STEP 1: DELETE booking_payment_submissions
  DELETE FROM public.booking_payment_submissions;
  GET DIAGNOSTICS v_deleted_submissions = ROW_COUNT;
  RAISE NOTICE 'Deleted booking_payment_submissions: %', v_deleted_submissions;

  -- STEP 2: DELETE booking_payments
  DELETE FROM public.booking_payments;
  GET DIAGNOSTICS v_deleted_payments = ROW_COUNT;
  RAISE NOTICE 'Deleted booking_payments: %', v_deleted_payments;

  -- STEP 3: DELETE booking_sessions
  DELETE FROM public.booking_sessions;
  GET DIAGNOSTICS v_deleted_sessions = ROW_COUNT;
  RAISE NOTICE 'Deleted booking_sessions: %', v_deleted_sessions;

  -- STEP 4: DELETE bookings
  DELETE FROM public.bookings;
  GET DIAGNOSTICS v_deleted_bookings = ROW_COUNT;
  RAISE NOTICE 'Deleted bookings: %', v_deleted_bookings;

  -- STEP 5: DELETE estimate_requests
  DELETE FROM public.estimate_requests;
  GET DIAGNOSTICS v_deleted_estimates = ROW_COUNT;
  RAISE NOTICE 'Deleted estimate_requests: %', v_deleted_estimates;

  -- STEP 6: DELETE flash_reservations
  DELETE FROM public.flash_reservations;
  GET DIAGNOSTICS v_deleted_reservations = ROW_COUNT;
  RAISE NOTICE 'Deleted flash_reservations: %', v_deleted_reservations;

  -- STEP 7: DELETE customers
  DELETE FROM public.customers;
  GET DIAGNOSTICS v_deleted_customers = ROW_COUNT;
  RAISE NOTICE 'Deleted customers: %', v_deleted_customers;

  -- STEP 8: DELETE PROFILES (IS DISTINCT FROM CANONICAL ADMIN UUID)
  DELETE FROM public.profiles
  WHERE user_id IS DISTINCT FROM v_admin_user_id;
  GET DIAGNOSTICS v_deleted_profiles = ROW_COUNT;
  RAISE NOTICE 'Deleted profiles (distinct from admin): %', v_deleted_profiles;

  -- STEP 9: DELETE AUTH USERS (IS DISTINCT FROM CANONICAL ADMIN UUID)
  DELETE FROM auth.users
  WHERE id IS DISTINCT FROM v_admin_user_id;
  GET DIAGNOSTICS v_deleted_auth_users = ROW_COUNT;
  RAISE NOTICE 'Deleted auth.users (distinct from admin): %', v_deleted_auth_users;

  -- STEP 10: UPDATE CHANG BOM ARTIST USER_ID = v_admin_user_id
  -- Verify no other artist uses v_admin_user_id
  IF EXISTS (
    SELECT 1 FROM public.artists
    WHERE user_id = v_admin_user_id AND id <> v_bom_id
  ) THEN
    RAISE EXCEPTION 'SAFETY FAILED: Another artist row already uses admin user ID' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.artists
  SET user_id = v_admin_user_id
  WHERE id = v_bom_id;
  RAISE NOTICE 'Updated Chang Bom artist user_id = admin UUID ✓';

  -- STEP 11: UPDATE BAS ARTIST USER_ID = NULL
  UPDATE public.artists
  SET user_id = NULL
  WHERE id = v_bas_id;
  RAISE NOTICE 'Updated Bas artist user_id = NULL ✓';

  -- STEP 12: STRONG POST-RESET ASSERTIONS
  RAISE NOTICE '====================================================';
  RAISE NOTICE '  POST-RESET STRICT ASSERTIONS';
  RAISE NOTICE '====================================================';

  -- 1. Auth Application Users Count
  SELECT COUNT(*) INTO v_count FROM auth.users;
  RAISE NOTICE 'Auth application users remaining: % (expected: 1)', v_count;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected 1 auth user, found %', v_count USING ERRCODE = 'P0001';
  END IF;

  -- 2. Remaining Auth User Email
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_admin_user_id AND email = 'admin@157tattoo.com') THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Remaining auth user is not admin@157tattoo.com!' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Profiles Count
  SELECT COUNT(*) INTO v_count FROM public.profiles;
  RAISE NOTICE 'Profiles remaining: % (expected: 1)', v_count;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected 1 profile, found %', v_count USING ERRCODE = 'P0001';
  END IF;

  -- 4. Remaining Profile Properties
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_admin_user_id
      AND role = 'admin'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Owner admin profile properties corrupted or missing!' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Transactional Data Counts
  SELECT COUNT(*) INTO v_count FROM public.customers;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: customers count = % (expected 0)', v_count USING ERRCODE = 'P0001'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.estimate_requests;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: estimate_requests count = % (expected 0)', v_count USING ERRCODE = 'P0001'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.bookings;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: bookings count = % (expected 0)', v_count USING ERRCODE = 'P0001'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.booking_sessions;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: booking_sessions count = % (expected 0)', v_count USING ERRCODE = 'P0001'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.booking_payments;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: booking_payments count = % (expected 0)', v_count USING ERRCODE = 'P0001'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.booking_payment_submissions;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: booking_payment_submissions count = % (expected 0)', v_count USING ERRCODE = 'P0001'; END IF;

  SELECT COUNT(*) INTO v_count FROM public.flash_reservations;
  IF v_count <> 0 THEN RAISE EXCEPTION 'ASSERTION FAILED: flash_reservations count = % (expected 0)', v_count USING ERRCODE = 'P0001'; END IF;

  -- 6. Master Artists Verification
  IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = v_bom_id AND user_id = v_admin_user_id) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Chang Bom artist record missing or user_id mismatch!' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = v_bas_id AND user_id IS NULL) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Bas artist record missing or user_id is not NULL!' USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  FULL DATA RESET COMPLETE — ALL ASSERTIONS PASSED ✓';
  RAISE NOTICE '====================================================';

END $$;
