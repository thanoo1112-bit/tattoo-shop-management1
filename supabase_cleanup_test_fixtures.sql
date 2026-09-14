-- ============================================================
-- 157 TATTOO — TARGETED TEST FIXTURES CLEANUP SCRIPT
-- Supabase SQL Editor — Safe Execution
-- ============================================================
-- GOAL:
--   Remove disposable test data created during test runs:
--   - Profiles/Customers matching disp_cust_%, test_cust_%, cust_4d%, cust_ec_%, test_art_%
--   - Test estimate_requests, bookings, booking_sessions, booking_payments, booking_payment_submissions
--   - Associated auth.users
-- ============================================================
-- PROTECTED ACCOUNTS — NEVER MUTATED:
--   - admin@157tattoo.com (Owner Account)
--   - artist1@157tattoo.com (Bas Auth Account)
--   - ช่างบอม (9aee0ce8-2c11-4b22-a52d-296807070d12)
--   - ช่างบาส (d5af5064-d973-4bbb-b205-1ab6b2929abb)
--   - Real Customer Accounts & Real Bookings
-- ============================================================

DO $$
DECLARE
  v_count INT;

  -- Arrays for exact target IDs
  v_test_user_ids     UUID[];
  v_test_booking_ids  UUID[];
  v_test_estimate_ids UUID[];

BEGIN

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  157 TATTOO — TARGETED TEST FIXTURES CLEANUP';
  RAISE NOTICE '====================================================';

  -- 1. Identify Test User IDs
  SELECT ARRAY(
    SELECT DISTINCT p.user_id
    FROM public.profiles p
    WHERE p.email NOT IN ('admin@157tattoo.com', 'artist1@157tattoo.com')
      AND p.role NOT IN ('admin', 'artist')
      AND (
        p.display_name = 'Disposable Customer'
        OR p.email LIKE 'disp_cust_%'
        OR p.email LIKE 'test_cust_%'
        OR p.email LIKE 'cust_4d%'
        OR p.email LIKE 'cust_ec_%'
        OR p.email LIKE 'test_art_%'
        OR p.display_name LIKE 'Disposable Customer%'
        OR p.display_name LIKE 'Test Customer%'
        OR p.display_name LIKE 'Customer Test%'
        OR p.display_name LIKE 'Customer EC%'
        OR p.display_name LIKE 'Test Cust%'
        OR p.display_name LIKE 'Test Artist%'
      )
  ) INTO v_test_user_ids;

  RAISE NOTICE 'Identified test customer user_ids: %', COALESCE(array_length(v_test_user_ids, 1), 0);

  -- 2. Identify Test Booking IDs
  SELECT ARRAY(
    SELECT DISTINCT b.id
    FROM public.bookings b
    WHERE b.customer_user_id = ANY(v_test_user_ids)
       OR (b.admin_note IS NOT NULL AND (b.admin_note LIKE '%Test%' OR b.admin_note LIKE '%Phase%' OR b.admin_note LIKE '%Duplicate%'))
  ) INTO v_test_booking_ids;

  RAISE NOTICE 'Identified test booking_ids: %', COALESCE(array_length(v_test_booking_ids, 1), 0);

  -- 3. Identify Test Estimate Request IDs
  SELECT ARRAY(
    SELECT DISTINCT er.id
    FROM public.estimate_requests er
    WHERE er.customer_user_id = ANY(v_test_user_ids)
       OR (er.description IS NOT NULL AND (er.description LIKE '%Test%' OR er.description LIKE '%Phase%' OR er.description LIKE '%Isolation%' OR er.description LIKE '%Operation%'))
  ) INTO v_test_estimate_ids;

  RAISE NOTICE 'Identified test estimate_request_ids: %', COALESCE(array_length(v_test_estimate_ids, 1), 0);

  -- SAFETY ASSERTIONS
  IF '2d01322e-5eb4-4157-b7db-93ba25cc5c65'::uuid = ANY(v_test_user_ids) THEN
    RAISE EXCEPTION 'SAFETY ABORT: Owner user_id found in test delete set!';
  END IF;

  IF 'b8477802-715b-44e2-86c4-4c2828dbfb3c'::uuid = ANY(v_test_user_ids) THEN
    RAISE EXCEPTION 'SAFETY ABORT: Bas user_id found in test delete set!';
  END IF;

  RAISE NOTICE 'Safety assertions PASSED ✓';

  -- STEP 4: DELETE booking_payment_submissions
  IF COALESCE(array_length(v_test_booking_ids, 1), 0) > 0 THEN
    DELETE FROM public.booking_payment_submissions
    WHERE booking_id = ANY(v_test_booking_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted booking_payment_submissions: %', v_count;
  END IF;

  -- STEP 5: DELETE booking_payments
  IF COALESCE(array_length(v_test_booking_ids, 1), 0) > 0 THEN
    DELETE FROM public.booking_payments
    WHERE booking_id = ANY(v_test_booking_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted booking_payments: %', v_count;
  END IF;

  -- STEP 6: DELETE booking_sessions
  IF COALESCE(array_length(v_test_booking_ids, 1), 0) > 0 THEN
    DELETE FROM public.booking_sessions
    WHERE booking_id = ANY(v_test_booking_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted booking_sessions: %', v_count;
  END IF;

  -- STEP 7: DELETE bookings
  IF COALESCE(array_length(v_test_booking_ids, 1), 0) > 0 THEN
    DELETE FROM public.bookings
    WHERE id = ANY(v_test_booking_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted bookings: %', v_count;
  END IF;

  -- STEP 8: DELETE estimate_requests
  IF COALESCE(array_length(v_test_estimate_ids, 1), 0) > 0 THEN
    DELETE FROM public.estimate_requests
    WHERE id = ANY(v_test_estimate_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted estimate_requests: %', v_count;
  END IF;

  -- STEP 9: DELETE customers
  IF COALESCE(array_length(v_test_user_ids, 1), 0) > 0 THEN
    DELETE FROM public.customers
    WHERE user_id = ANY(v_test_user_ids)
       OR display_name = 'Disposable Customer'
       OR email LIKE 'disp_cust_%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted customers: %', v_count;
  END IF;

  -- STEP 10: DELETE profiles
  IF COALESCE(array_length(v_test_user_ids, 1), 0) > 0 THEN
    DELETE FROM public.profiles
    WHERE user_id = ANY(v_test_user_ids)
      AND email NOT IN ('admin@157tattoo.com', 'artist1@157tattoo.com');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted profiles: %', v_count;
  END IF;

  -- STEP 11: DELETE auth.users
  IF COALESCE(array_length(v_test_user_ids, 1), 0) > 0 THEN
    DELETE FROM auth.users
    WHERE id = ANY(v_test_user_ids)
      AND email NOT IN ('admin@157tattoo.com', 'artist1@157tattoo.com');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted auth.users: %', v_count;
  END IF;

  -- POST-CLEANUP VERIFICATION
  RAISE NOTICE '====================================================';
  RAISE NOTICE '  POST-CLEANUP VERIFICATION';
  RAISE NOTICE '====================================================';

  SELECT COUNT(*) INTO v_count FROM public.artists WHERE is_active = true;
  RAISE NOTICE 'Active artists remaining: % (expected: 2)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.bookings;
  RAISE NOTICE 'Real bookings remaining: %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.booking_sessions;
  RAISE NOTICE 'Real booking_sessions remaining: %', v_count;

  -- Verify Protected Accounts
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'admin@157tattoo.com') THEN
    RAISE EXCEPTION 'CRITICAL: admin@157tattoo.com profile missing after cleanup!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'artist1@157tattoo.com') THEN
    RAISE EXCEPTION 'CRITICAL: artist1@157tattoo.com profile missing after cleanup!';
  END IF;

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  CLEANUP COMPLETED SUCCESSFULLY — ALL PROTECTED DATA SAFE ✓';
  RAISE NOTICE '====================================================';

END $$;
