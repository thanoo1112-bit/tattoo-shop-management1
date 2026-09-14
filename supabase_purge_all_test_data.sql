-- ============================================================
-- 157 TATTOO — PURGE ALL TEST DATA (UUID TYPE HOTFIXED)
-- TRANSACTION-SAFE — STRICT UUID = UUID COMPARISONS
-- Supabase SQL Editor — Safe to execute
-- ============================================================
-- HOTFIX:
--   Fixed ERROR 42883 (operator does not exist: uuid = text).
--   All profile checks use user_id = v_auth_id (UUID = UUID) directly
--   without string casting.
-- ============================================================
-- PROTECTED IDENTITIES — HARDENED GUARDS:
--   Chang Bom Artist: 9aee0ce8-2c11-4b22-a52d-296807070d12
--   Chang Bas Artist: d5af5064-d973-4bbb-b205-1ab6b2929abb
--   Owner Auth UUID:  2d01322e-5eb4-4157-b7db-93ba25cc5c65 (admin@157tattoo.com)
--   Bas Auth UUID:    b8477802-715b-44e2-86c4-4c2828dbfb3c (artist1@157tattoo.com)
-- ============================================================

DO $$
DECLARE
  -- Protected IDs
  v_bom_id        uuid := '9aee0ce8-2c11-4b22-a52d-296807070d12';
  v_bas_id        uuid := 'd5af5064-d973-4bbb-b205-1ab6b2929abb';
  v_owner_auth_id uuid := '2d01322e-5eb4-4157-b7db-93ba25cc5c65';
  v_bas_auth_id   uuid := 'b8477802-715b-44e2-86c4-4c2828dbfb3c';

  -- Counts for logging
  v_count   int;

  -- Test collections
  v_test_artist_ids   uuid[];
  v_test_booking_ids  uuid[];

  -- Explicit verified test user IDs (Empty by default — no broad deletions)
  v_proven_test_user_ids uuid[] := ARRAY[]::uuid[];

BEGIN

  -- ============================================================
  -- STEP 0: COLLECT TEST ARTIST IDs
  -- ============================================================
  SELECT ARRAY(
    SELECT id FROM public.artists
    WHERE id NOT IN (v_bom_id, v_bas_id)
  ) INTO v_test_artist_ids;

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  157 TATTOO — PURGE ALL TEST DATA (HOTFIXED)';
  RAISE NOTICE '====================================================';
  RAISE NOTICE 'Test artists identified: %', COALESCE(array_length(v_test_artist_ids, 1), 0);

  -- ============================================================
  -- STEP 1: SAFETY ASSERTIONS — MANDATORY HARD GUARDS
  -- ============================================================

  IF v_bom_id = ANY(v_test_artist_ids) THEN
    RAISE EXCEPTION 'SAFETY ABORT: Chang Bom (%) found in test artist set!', v_bom_id;
  END IF;

  IF v_bas_id = ANY(v_test_artist_ids) THEN
    RAISE EXCEPTION 'SAFETY ABORT: Chang Bas (%) found in test artist set!', v_bas_id;
  END IF;

  -- Verify Protected Owner Account (Strict UUID = UUID comparison)
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = v_owner_auth_id
      AND role = 'admin'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION
      'SAFETY FAILED: Owner/Admin profile not found or inactive'
      USING ERRCODE = 'P0001';
  END IF;

  -- Verify Protected Bas Account (Strict UUID = UUID comparison)
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = v_bas_auth_id
      AND role = 'artist'
      AND is_active = true
  ) THEN
    RAISE EXCEPTION
      'SAFETY FAILED: Bas artist profile not found or inactive'
      USING ERRCODE = 'P0001';
  END IF;

  -- Verify Chang Bom real bookings intact
  SELECT COUNT(*) INTO v_count
  FROM public.bookings WHERE artist_id = v_bom_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'SAFETY ABORT: Chang Bom has 0 bookings — real data protection abort!';
  END IF;

  RAISE NOTICE 'Safety assertions PASSED ✓ (Bom real bookings: %)', v_count;

  -- ============================================================
  -- COLLECT DEPENDENT TEST BOOKING IDs
  -- ============================================================
  SELECT ARRAY(
    SELECT id FROM public.bookings
    WHERE artist_id = ANY(v_test_artist_ids)
  ) INTO v_test_booking_ids;

  RAISE NOTICE 'Test bookings identified: %', COALESCE(array_length(v_test_booking_ids, 1), 0);

  -- ============================================================
  -- STEP 2: DELETE booking_payment_submissions (via test booking_id)
  -- ============================================================
  IF array_length(v_test_booking_ids, 1) > 0 THEN
    DELETE FROM public.booking_payment_submissions
    WHERE booking_id = ANY(v_test_booking_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted booking_payment_submissions: %', v_count;
  ELSE
    RAISE NOTICE 'Skipped booking_payment_submissions (0 test bookings)';
  END IF;

  -- ============================================================
  -- STEP 3: DELETE booking_payments (via test booking_id)
  -- ============================================================
  IF array_length(v_test_booking_ids, 1) > 0 THEN
    DELETE FROM public.booking_payments
    WHERE booking_id = ANY(v_test_booking_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted booking_payments: %', v_count;
  ELSE
    RAISE NOTICE 'Skipped booking_payments (0 test bookings)';
  END IF;

  -- ============================================================
  -- STEP 4: DELETE flash_reservations (via test flash_design_id FK)
  -- ============================================================
  DELETE FROM public.flash_reservations fr
  WHERE fr.flash_design_id IN (
    SELECT fd.id FROM public.flash_designs fd
    WHERE fd.artist_id = ANY(v_test_artist_ids)
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted flash_reservations: %', v_count;

  -- ============================================================
  -- STEP 5: DELETE booking_sessions (via test artist_id)
  -- ============================================================
  DELETE FROM public.booking_sessions
  WHERE artist_id = ANY(v_test_artist_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted booking_sessions: %', v_count;

  -- ============================================================
  -- STEP 6: DELETE bookings (via test artist_id)
  -- ============================================================
  DELETE FROM public.bookings
  WHERE artist_id = ANY(v_test_artist_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted bookings: %', v_count;

  -- ============================================================
  -- STEP 7: DELETE estimate_requests (via test artist_id)
  -- ============================================================
  DELETE FROM public.estimate_requests
  WHERE artist_id = ANY(v_test_artist_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted estimate_requests: %', v_count;

  -- ============================================================
  -- STEP 8: DELETE portfolio_artworks (via test artist_id)
  -- ============================================================
  DELETE FROM public.portfolio_artworks
  WHERE artist_id = ANY(v_test_artist_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted portfolio_artworks: %', v_count;

  -- ============================================================
  -- STEP 9: DELETE flash_designs (via test artist_id)
  -- ============================================================
  DELETE FROM public.flash_designs
  WHERE artist_id = ANY(v_test_artist_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted flash_designs: %', v_count;

  -- ============================================================
  -- STEP 10: CUSTOMERS / PROFILES / AUTH.USERS (HARDENED SAFEGUARD)
  --   Only purges if v_proven_test_user_ids has explicit UUIDs.
  --   No broad "NOT IN" deletions are executed!
  -- ============================================================
  IF array_length(v_proven_test_user_ids, 1) > 0 THEN
    DELETE FROM public.customers WHERE user_id = ANY(v_proven_test_user_ids);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted customers (explicit list): %', v_count;

    DELETE FROM public.profiles 
    WHERE user_id = ANY(v_proven_test_user_ids)
      AND email NOT IN ('admin@157tattoo.com','artist1@157tattoo.com');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted profiles (explicit list): %', v_count;

    DELETE FROM auth.users 
    WHERE id = ANY(v_proven_test_user_ids)
      AND email NOT IN ('admin@157tattoo.com','artist1@157tattoo.com');
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Deleted auth.users (explicit list): %', v_count;
  ELSE
    RAISE NOTICE 'Safeguard Active: Broad user deletions REMOVED. 0 customer/profile accounts modified.';
  END IF;

  -- ============================================================
  -- STEP 11: DELETE TEST ARTISTS — LAST
  -- ============================================================
  DELETE FROM public.artists
  WHERE id = ANY(v_test_artist_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Deleted test artists: %', v_count;

  -- ============================================================
  -- STEP 12: POST-PURGE VERIFICATION
  -- ============================================================
  RAISE NOTICE '====================================================';
  RAISE NOTICE '  POST-PURGE VERIFICATION';
  RAISE NOTICE '====================================================';

  SELECT COUNT(*) INTO v_count FROM public.artists;
  RAISE NOTICE 'artists remaining:       % (expected: 2)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.artists WHERE is_active = true;
  RAISE NOTICE 'active artists:          % (expected: 2)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.bookings WHERE artist_id = v_bom_id;
  RAISE NOTICE 'Bom bookings:            % (expected: 36)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.booking_sessions WHERE artist_id = v_bom_id;
  RAISE NOTICE 'Bom sessions:            % (expected: 42)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.bookings WHERE artist_id = v_bas_id;
  RAISE NOTICE 'Bas bookings:            % (expected: 0)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.booking_sessions WHERE artist_id = v_bas_id;
  RAISE NOTICE 'Bas sessions:            % (expected: 0)', v_count;

  SELECT COUNT(*) INTO v_count FROM public.bookings;
  RAISE NOTICE 'bookings total:          %', v_count;

  SELECT COUNT(*) INTO v_count FROM public.booking_sessions;
  RAISE NOTICE 'booking_sessions total:  %', v_count;

  -- Hard assertions for protected accounts (Strict UUID comparisons)
  IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = v_bom_id) THEN
    RAISE EXCEPTION 'CRITICAL: Chang Bom missing after purge!';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = v_bas_id) THEN
    RAISE EXCEPTION 'CRITICAL: Chang Bas missing after purge!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = v_owner_auth_id
  ) THEN
    RAISE EXCEPTION 'CRITICAL: Owner admin profile missing after purge!';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = v_bas_auth_id
  ) THEN
    RAISE EXCEPTION 'CRITICAL: Bas artist profile missing after purge!';
  END IF;

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  PURGE COMPLETED SUCCESSFULLY — ALL USER ACCOUNTS PROTECTED ✓';
  RAISE NOTICE '====================================================';

END $$;
