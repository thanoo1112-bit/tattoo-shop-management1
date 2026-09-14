-- ============================================================
-- 157 TATTOO — FINAL TEST DATA PURGE SCRIPT
-- Supabase SQL Editor — Transaction-Safe Execution
-- ============================================================
-- PRESERVED REAL/DEMO REQUESTS (6/6):
--   1. 9f6986f6-6af6-4ec0-a8b2-233329aa3b9f (tnklaxamx@gmail.com)
--   2. 127c51af-3388-44b8-be13-57c25b75dcb1 (confirmed_customer@157tattoo.com)
--   3. f0563440-6925-43ee-92bd-d32e523ad884 (confirmed_customer@157tattoo.com)
--   4. a83bb845-6e39-408b-91ab-b0b84575659d (confirmed_customer@157tattoo.com)
--   5. 6d62c201-c0f8-4182-a593-c06cf158a8d5 (confirmed_customer@157tattoo.com)
--   6. ff25ef99-e9ce-4b19-a8d4-750607dca232 (confirmed_customer@157tattoo.com)
-- ============================================================
-- PROTECTED ACCOUNTS — NEVER MUTATED:
--   - admin@157tattoo.com
--   - artist1@157tattoo.com
--   - tnklaxamx@gmail.com
--   - confirmed_customer@157tattoo.com
--   - ช่างบอม (9aee0ce8-2c11-4b22-a52d-296807070d12)
--   - ช่างบาส (d5af5064-d973-4bbb-b205-1ab6b2929abb)
-- ============================================================

DO $$
DECLARE
  v_count INT;

  -- 6 Protected Estimate Request IDs
  v_protected_estimate_ids UUID[] := ARRAY[
    '9f6986f6-6af6-4ec0-a8b2-233329aa3b9f'::uuid,
    '127c51af-3388-44b8-be13-57c25b75dcb1'::uuid,
    'f0563440-6925-43ee-92bd-d32e523ad884'::uuid,
    'a83bb845-6e39-408b-91ab-b0b84575659d'::uuid,
    '6d62c201-c0f8-4182-a593-c06cf158a8d5'::uuid,
    'ff25ef99-e9ce-4b19-a8d4-750607dca232'::uuid
  ];

  -- Candidate collections
  v_test_booking_ids  UUID[];
  v_test_estimate_ids UUID[];
  v_test_user_ids     UUID[];

BEGIN

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  157 TATTOO — FINAL TEST DATA PURGE';
  RAISE NOTICE '====================================================';

  -- PRE-FLIGHT VERIFICATION
  SELECT COUNT(*) INTO v_count FROM public.bookings;
  IF v_count <> 36 THEN
    RAISE EXCEPTION 'PRE-FLIGHT ABORT: Expected 36 bookings, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.booking_sessions;
  IF v_count <> 42 THEN
    RAISE EXCEPTION 'PRE-FLIGHT ABORT: Expected 42 booking_sessions, found %', v_count;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.estimate_requests;
  IF v_count <> 70 THEN
    RAISE EXCEPTION 'PRE-FLIGHT ABORT: Expected 70 estimate_requests, found %', v_count;
  END IF;

  -- Collect 36 Test Booking IDs
  SELECT ARRAY(SELECT id FROM public.bookings) INTO v_test_booking_ids;
  RAISE NOTICE 'Bookings to purge: %', array_length(v_test_booking_ids, 1);

  -- Collect 64 Test Estimate Request IDs (Excluding 6 protected IDs)
  SELECT ARRAY(
    SELECT id FROM public.estimate_requests
    WHERE id NOT IN (SELECT UNNEST(v_protected_estimate_ids))
  ) INTO v_test_estimate_ids;
  RAISE NOTICE 'Estimate requests to purge: %', array_length(v_test_estimate_ids, 1);

  -- Collect Test User IDs (Excluding protected staff and customers)
  SELECT ARRAY(
    SELECT DISTINCT p.user_id
    FROM public.profiles p
    WHERE p.email NOT IN (
      'admin@157tattoo.com',
      'artist1@157tattoo.com',
      'tnklaxamx@gmail.com',
      'confirmed_customer@157tattoo.com'
    )
    AND p.role NOT IN ('admin', 'artist')
  ) INTO v_test_user_ids;
  RAISE NOTICE 'Test user accounts to purge: %', COALESCE(array_length(v_test_user_ids, 1), 0);

  -- STEP 1: DELETE booking_payment_submissions
  DELETE FROM public.booking_payment_submissions
  WHERE booking_id = ANY(v_test_booking_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted booking_payment_submissions: %', v_count;

  -- STEP 2: DELETE booking_payments
  DELETE FROM public.booking_payments
  WHERE booking_id = ANY(v_test_booking_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted booking_payments: %', v_count;

  -- STEP 3: DELETE booking_sessions
  DELETE FROM public.booking_sessions
  WHERE booking_id = ANY(v_test_booking_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted booking_sessions: %', v_count;

  -- STEP 4: DELETE bookings
  DELETE FROM public.bookings
  WHERE id = ANY(v_test_booking_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted bookings: %', v_count;

  -- STEP 5: DELETE 64 test estimate_requests
  DELETE FROM public.estimate_requests
  WHERE id = ANY(v_test_estimate_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted estimate_requests: %', v_count;

  -- STEP 6: DELETE test customers
  IF COALESCE(array_length(v_test_user_ids, 1), 0) > 0 THEN
    DELETE FROM public.customers
    WHERE user_id = ANY(v_test_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted customers: %', v_count;
  END IF;

  -- STEP 7: DELETE test profiles
  IF COALESCE(array_length(v_test_user_ids, 1), 0) > 0 THEN
    DELETE FROM public.profiles
    WHERE user_id = ANY(v_test_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted profiles: %', v_count;
  END IF;

  -- STEP 8: DELETE auth.users
  IF COALESCE(array_length(v_test_user_ids, 1), 0) > 0 THEN
    DELETE FROM auth.users
    WHERE id = ANY(v_test_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted auth.users: %', v_count;
  END IF;

  -- POST-CLEANUP VERIFICATION
  RAISE NOTICE '====================================================';
  RAISE NOTICE '  POST-CLEANUP VERIFICATION';
  RAISE NOTICE '====================================================';

  SELECT COUNT(*) INTO v_count FROM public.bookings;
  RAISE NOTICE 'Bookings remaining: % (expected: 0)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.booking_sessions;
  RAISE NOTICE 'Booking sessions remaining: % (expected: 0)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.estimate_requests;
  RAISE NOTICE 'Estimate requests remaining: % (expected: 6)', v_count;

  -- ASSERTIONS
  IF (SELECT COUNT(*) FROM public.estimate_requests WHERE id = ANY(v_protected_estimate_ids)) <> 6 THEN
    RAISE EXCEPTION 'CRITICAL: Protected estimate requests modified or lost!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'admin@157tattoo.com') THEN
    RAISE EXCEPTION 'CRITICAL: admin@157tattoo.com missing!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE email = 'artist1@157tattoo.com') THEN
    RAISE EXCEPTION 'CRITICAL: artist1@157tattoo.com missing!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = '9aee0ce8-2c11-4b22-a52d-296807070d12'::uuid) THEN
    RAISE EXCEPTION 'CRITICAL: Chang Bom missing!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = 'd5af5064-d973-4bbb-b205-1ab6b2929abb'::uuid) THEN
    RAISE EXCEPTION 'CRITICAL: Chang Bas missing!';
  END IF;

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  PURGE COMPLETED SUCCESSFULLY — 6/6 REAL REQUESTS PRESERVED ✓';
  RAISE NOTICE '====================================================';

END $$;
