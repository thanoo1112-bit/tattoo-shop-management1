-- ============================================================================
-- 157 TATTOO — PHASE 100 FORWARD MAINTENANCE SCRIPT
-- TARGETED TEST DATA PURGE SCRIPT (TONKLA TEST REQUESTS ONLY)
-- STRICT SAFETY SCOPE: Customer ID 07cab141-a788-47aa-926a-1cbf7988fbf9
-- ============================================================================
-- STATUS: SCRIPT ONLY / DO NOT AUTO-EXECUTE
-- LOCAL ONLY / NO COMMIT / NO PUSH / NO DEPLOY
-- ============================================================================
--
-- IMPORTANT SAFETY NOTICE:
-- This script permanently purges ONLY 8 designated test requests (7 custom
-- estimate requests and 1 flash reservation) and their associated test bookings,
-- sessions, and payment records for customer "ต้นกล้า อามอ".
--
-- BEFORE EXECUTION:
-- Please export/backup the following tables (CSV or JSON dump):
--   1. estimate_requests
--   2. estimate_request_date_options
--   3. flash_reservations
--   4. bookings
--   5. booking_sessions
--   6. booking_payment_submissions
--   7. booking_payments
--
-- STORAGE ASSETS NOTICE:
-- Physical storage files (payment slips in bucket 'payment-slips' and reference
-- images in bucket 'estimate-references') are NOT deleted by this SQL script.
-- They will become orphan files and must be manually reviewed and deleted via
-- Supabase Storage Dashboard / storage management scripts if needed.
--
-- PROTECTED TABLES (MUST NOT BE DELETED):
--   • auth.users
--   • public.profiles
--   • public.customers
--   • public.artists
--   • public.flash_designs
-- ============================================================================

BEGIN;

DO $$
DECLARE
  -- Target Customer
  v_customer_id CONSTANT UUID := '07cab141-a788-47aa-926a-1cbf7988fbf9'::uuid;

  -- 7 Target Estimate Request IDs
  v_estimate_ids CONSTANT UUID[] := ARRAY[
    '99ba4550-3e72-4c52-aa08-47167f9702a2'::uuid,
    '87b3deac-8e2b-4d21-ab97-bbb39b079aca'::uuid,
    '3ac86f1f-3071-4f85-8339-31ae17c7edd8'::uuid,
    '3b7723ed-622f-4264-ba03-a689aed3bdf6'::uuid,
    'f2bc9f43-66cd-473c-8291-8efced30b8f7'::uuid,
    'e00d833e-f8bb-432b-abb5-f6e246df4799'::uuid,
    'f0bf6f69-3bb3-44dc-9bc2-2d047822909b'::uuid
  ];

  -- 1 Target Flash Reservation ID
  v_flash_res_id CONSTANT UUID := 'ddb0253d-7117-4a67-96df-90c7189201b8'::uuid;

  -- 5 Target Booking IDs
  v_booking_ids CONSTANT UUID[] := ARRAY[
    '71e7ff8d-72ba-48bb-a60b-9e3880de6823'::uuid,
    '8901374b-026a-4d6b-a0a4-421cd2796453'::uuid,
    'd022b96e-611c-404c-9b93-078cd16f5863'::uuid,
    'baa0e710-643a-4712-a28f-c0e4fbb12d63'::uuid,
    '93b4adab-b805-45b0-9721-b04740e555bc'::uuid
  ];

  -- Validation counters & flash design tracking
  v_foreign_customer_count INT;
  v_foreign_booking_count INT;
  v_unmapped_booking_count INT;
  v_target_flash_design_id UUID;
  v_flash_design_count INT;
  v_pre_flash_design_status TEXT;
  v_post_flash_design_status TEXT;

  -- Pre-delete audit counts
  v_count_submissions INT;
  v_count_payments INT;
  v_count_sessions INT;
  v_count_bookings INT;
  v_count_date_options INT;
  v_count_estimates INT;
  v_count_flash_res INT;

  -- Master baseline counts (for exact equality validation)
  v_pre_artists_count INT;
  v_pre_flash_designs_count INT;

  -- Post-delete verification counts
  v_post_estimates INT;
  v_post_flash_res INT;
  v_post_bookings INT;
  v_post_sessions INT;
  v_post_payments INT;
  v_post_submissions INT;
  v_post_date_options INT;

  -- Protected table verification counts
  v_post_customer_exists INT;
  v_post_profile_exists INT;
  v_post_artists_count INT;
  v_post_flash_designs_count INT;

BEGIN
  RAISE NOTICE '====================================================================';
  RAISE NOTICE '157 TATTOO — PHASE 100: STARTING PRE-DELETION SAFETY VALIDATION';
  RAISE NOTICE '====================================================================';

  -- --------------------------------------------------------------------------
  -- STEP 1: SAFETY VALIDATIONS (ABORT IMMEDIATELY IF ANY CHECK FAILS)
  -- --------------------------------------------------------------------------

  -- 1.1 Verify Target Customer exists
  SELECT COUNT(*) INTO v_post_customer_exists
  FROM public.customers
  WHERE user_id = v_customer_id;

  IF v_post_customer_exists = 0 THEN
    RAISE EXCEPTION '[SAFETY ABORT] Target customer % does not exist in public.customers', v_customer_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 1.2 Verify that NO targeted estimate requests belong to any other customer
  SELECT COUNT(*) INTO v_foreign_customer_count
  FROM public.estimate_requests
  WHERE id = ANY(v_estimate_ids)
    AND customer_user_id != v_customer_id;

  IF v_foreign_customer_count > 0 THEN
    RAISE EXCEPTION '[SAFETY ABORT] Found % estimate request(s) belonging to another customer!', v_foreign_customer_count
      USING ERRCODE = '42501';
  END IF;

  -- 1.3 Verify that the targeted flash reservation belongs strictly to target customer
  SELECT COUNT(*) INTO v_foreign_customer_count
  FROM public.flash_reservations
  WHERE id = v_flash_res_id
    AND customer_user_id != v_customer_id;

  IF v_foreign_customer_count > 0 THEN
    RAISE EXCEPTION '[SAFETY ABORT] Flash reservation % belongs to another customer!', v_flash_res_id
      USING ERRCODE = '42501';
  END IF;

  -- 1.4 Verify that ALL targeted bookings belong strictly to target customer
  SELECT COUNT(*) INTO v_foreign_booking_count
  FROM public.bookings
  WHERE id = ANY(v_booking_ids)
    AND customer_user_id != v_customer_id;

  IF v_foreign_booking_count > 0 THEN
    RAISE EXCEPTION '[SAFETY ABORT] Found % booking(s) belonging to another customer!', v_foreign_booking_count
      USING ERRCODE = '42501';
  END IF;

  -- 1.5 Verify that all targeted bookings are actually linked to targeted estimate requests
  SELECT COUNT(*) INTO v_unmapped_booking_count
  FROM public.bookings
  WHERE id = ANY(v_booking_ids)
    AND (estimate_request_id IS NULL OR estimate_request_id != ALL(v_estimate_ids));

  IF v_unmapped_booking_count > 0 THEN
    RAISE EXCEPTION '[SAFETY ABORT] Found % booking(s) not linked to the targeted estimate request list!', v_unmapped_booking_count
      USING ERRCODE = '22000';
  END IF;

  -- 1.6 Verify that NO OTHER bookings in the database reference these estimate requests
  SELECT COUNT(*) INTO v_unmapped_booking_count
  FROM public.bookings
  WHERE estimate_request_id = ANY(v_estimate_ids)
    AND id != ALL(v_booking_ids);

  IF v_unmapped_booking_count > 0 THEN
    RAISE EXCEPTION '[SAFETY ABORT] Found % unmapped booking(s) referencing targeted estimates!', v_unmapped_booking_count
      USING ERRCODE = '22000';
  END IF;

  -- 1.7 Record and verify target flash design ID and status before delete
  SELECT flash_design_id INTO v_target_flash_design_id
  FROM public.flash_reservations
  WHERE id = v_flash_res_id;

  IF v_target_flash_design_id IS NULL THEN
    RAISE EXCEPTION '[SAFETY ABORT] Flash reservation % has no linked flash_design_id!', v_flash_res_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT status INTO v_pre_flash_design_status
  FROM public.flash_designs
  WHERE id = v_target_flash_design_id;

  IF v_pre_flash_design_status IS NULL THEN
    RAISE EXCEPTION '[SAFETY ABORT] Flash design % referenced by reservation was not found in public.flash_designs!', v_target_flash_design_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 1.8 Record baseline counts for master tables (artists & flash_designs)
  SELECT COUNT(*) INTO v_pre_artists_count FROM public.artists;
  SELECT COUNT(*) INTO v_pre_flash_designs_count FROM public.flash_designs;

  IF v_pre_artists_count = 0 THEN
    RAISE EXCEPTION '[SAFETY ABORT] artists table is empty before purge!'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_pre_flash_designs_count = 0 THEN
    RAISE EXCEPTION '[SAFETY ABORT] flash_designs table is empty before purge!'
      USING ERRCODE = 'P0002';
  END IF;

  RAISE NOTICE '✅ ALL PRE-DELETION SAFETY CHECKS PASSED.';

  -- --------------------------------------------------------------------------
  -- STEP 2: PRE-DELETION AUDIT REPORT & STRICT EXACT COUNT GUARDS
  -- --------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_count_submissions
  FROM public.booking_payment_submissions
  WHERE booking_id = ANY(v_booking_ids)
    AND customer_user_id = v_customer_id;

  SELECT COUNT(*) INTO v_count_payments
  FROM public.booking_payments
  WHERE booking_id = ANY(v_booking_ids);

  SELECT COUNT(*) INTO v_count_sessions
  FROM public.booking_sessions
  WHERE booking_id = ANY(v_booking_ids);

  SELECT COUNT(*) INTO v_count_bookings
  FROM public.bookings
  WHERE id = ANY(v_booking_ids)
    AND customer_user_id = v_customer_id;

  SELECT COUNT(*) INTO v_count_date_options
  FROM public.estimate_request_date_options
  WHERE estimate_request_id = ANY(v_estimate_ids);

  SELECT COUNT(*) INTO v_count_estimates
  FROM public.estimate_requests
  WHERE id = ANY(v_estimate_ids)
    AND customer_user_id = v_customer_id;

  SELECT COUNT(*) INTO v_count_flash_res
  FROM public.flash_reservations
  WHERE id = v_flash_res_id
    AND customer_user_id = v_customer_id;

  RAISE NOTICE '--------------------------------------------------------------------';
  RAISE NOTICE 'RECORDS SCOPED FOR SAFE PURGE:';
  RAISE NOTICE '  1. estimate_requests           : % (expected 7)', v_count_estimates;
  RAISE NOTICE '  2. flash_reservations          : % (expected 1)', v_count_flash_res;
  RAISE NOTICE '  3. bookings                    : % (expected 5)', v_count_bookings;
  RAISE NOTICE '  4. booking_sessions            : % (expected 7)', v_count_sessions;
  RAISE NOTICE '  5. booking_payments            : % (expected 3)', v_count_payments;
  RAISE NOTICE '  6. booking_payment_submissions : % (expected 4)', v_count_submissions;
  RAISE NOTICE '  7. estimate_request_date_opts  : % (expected 6)', v_count_date_options;
  RAISE NOTICE '--------------------------------------------------------------------';

  -- 2.1 STRICT EXACT COUNT ENFORCEMENT (FAIL-SAFE TRANSACTION GUARDS)
  IF v_count_estimates != 7 THEN
    RAISE EXCEPTION '[COUNT MISMATCH ABORT] Expected 7 estimate_requests, found %', v_count_estimates
      USING ERRCODE = '22000';
  END IF;

  IF v_count_flash_res != 1 THEN
    RAISE EXCEPTION '[COUNT MISMATCH ABORT] Expected 1 flash_reservation, found %', v_count_flash_res
      USING ERRCODE = '22000';
  END IF;

  IF v_count_bookings != 5 THEN
    RAISE EXCEPTION '[COUNT MISMATCH ABORT] Expected 5 bookings, found %', v_count_bookings
      USING ERRCODE = '22000';
  END IF;

  IF v_count_sessions != 7 THEN
    RAISE EXCEPTION '[COUNT MISMATCH ABORT] Expected 7 booking_sessions, found %', v_count_sessions
      USING ERRCODE = '22000';
  END IF;

  IF v_count_payments != 3 THEN
    RAISE EXCEPTION '[COUNT MISMATCH ABORT] Expected 3 booking_payments, found %', v_count_payments
      USING ERRCODE = '22000';
  END IF;

  IF v_count_submissions != 4 THEN
    RAISE EXCEPTION '[COUNT MISMATCH ABORT] Expected 4 booking_payment_submissions, found %', v_count_submissions
      USING ERRCODE = '22000';
  END IF;

  IF v_count_date_options != 6 THEN
    RAISE EXCEPTION '[COUNT MISMATCH ABORT] Expected 6 estimate_request_date_options, found %', v_count_date_options
      USING ERRCODE = '22000';
  END IF;

  RAISE NOTICE '✅ ALL 7 EXACT COUNT AUDIT GUARDS VERIFIED.';

  -- --------------------------------------------------------------------------
  -- STEP 3: STRICT ORDERED DELETION (CHILD -> PARENT VIA EXPLICIT IDS ONLY)
  -- --------------------------------------------------------------------------

  -- 3.1 Delete booking_payment_submissions
  DELETE FROM public.booking_payment_submissions
  WHERE booking_id = ANY(v_booking_ids)
    AND customer_user_id = v_customer_id;

  -- 3.2 Delete booking_payments
  DELETE FROM public.booking_payments
  WHERE booking_id = ANY(v_booking_ids);

  -- 3.3 Delete booking_sessions
  DELETE FROM public.booking_sessions
  WHERE booking_id = ANY(v_booking_ids);

  -- 3.4 Delete bookings
  DELETE FROM public.bookings
  WHERE id = ANY(v_booking_ids)
    AND customer_user_id = v_customer_id;

  -- 3.5 Delete estimate_request_date_options
  DELETE FROM public.estimate_request_date_options
  WHERE estimate_request_id = ANY(v_estimate_ids);

  -- 3.6 Delete estimate_requests
  DELETE FROM public.estimate_requests
  WHERE id = ANY(v_estimate_ids)
    AND customer_user_id = v_customer_id;

  -- 3.7 Delete flash_reservations
  DELETE FROM public.flash_reservations
  WHERE id = v_flash_res_id
    AND customer_user_id = v_customer_id;

  RAISE NOTICE '✅ DELETION STEP COMPLETED.';

  -- --------------------------------------------------------------------------
  -- STEP 4: POST-DELETION VERIFICATION & MASTER INTEGRITY GUARDS
  -- --------------------------------------------------------------------------

  -- 4.1 Verify targeted transaction records are completely gone (Must be 0)
  SELECT COUNT(*) INTO v_post_submissions
  FROM public.booking_payment_submissions
  WHERE booking_id = ANY(v_booking_ids);

  SELECT COUNT(*) INTO v_post_payments
  FROM public.booking_payments
  WHERE booking_id = ANY(v_booking_ids);

  SELECT COUNT(*) INTO v_post_sessions
  FROM public.booking_sessions
  WHERE booking_id = ANY(v_booking_ids);

  SELECT COUNT(*) INTO v_post_bookings
  FROM public.bookings
  WHERE id = ANY(v_booking_ids);

  SELECT COUNT(*) INTO v_post_date_options
  FROM public.estimate_request_date_options
  WHERE estimate_request_id = ANY(v_estimate_ids);

  SELECT COUNT(*) INTO v_post_estimates
  FROM public.estimate_requests
  WHERE id = ANY(v_estimate_ids);

  SELECT COUNT(*) INTO v_post_flash_res
  FROM public.flash_reservations
  WHERE id = v_flash_res_id;

  IF v_post_submissions > 0 OR v_post_payments > 0 OR v_post_sessions > 0 OR
     v_post_bookings > 0 OR v_post_date_options > 0 OR v_post_estimates > 0 OR v_post_flash_res > 0 THEN
    RAISE EXCEPTION '[POST-CHECK ABORT] Verification failed: target records still present in database!'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4.2 Verify target flash design still exists and status is 100% UNCHANGED
  SELECT status INTO v_post_flash_design_status
  FROM public.flash_designs
  WHERE id = v_target_flash_design_id;

  IF v_post_flash_design_status IS NULL THEN
    RAISE EXCEPTION '[POST-CHECK ABORT] CRITICAL ERROR: Target flash design % was removed!', v_target_flash_design_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_post_flash_design_status != v_pre_flash_design_status THEN
    RAISE EXCEPTION '[POST-CHECK ABORT] CRITICAL ERROR: Flash design % status changed from % to %!',
      v_target_flash_design_id, v_pre_flash_design_status, v_post_flash_design_status
      USING ERRCODE = 'P0001';
  END IF;

  -- 4.3 Verify target customer account remains 100% INTACT
  SELECT COUNT(*) INTO v_post_customer_exists
  FROM public.customers
  WHERE user_id = v_customer_id;

  SELECT COUNT(*) INTO v_post_profile_exists
  FROM public.profiles
  WHERE user_id = v_customer_id;

  IF v_post_customer_exists = 0 OR v_post_profile_exists = 0 THEN
    RAISE EXCEPTION '[POST-CHECK ABORT] CRITICAL ERROR: Target customer account was affected!'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4.4 Verify protected master tables match PRE-DELETE counts EXACTLY
  SELECT COUNT(*) INTO v_post_artists_count
  FROM public.artists;

  SELECT COUNT(*) INTO v_post_flash_designs_count
  FROM public.flash_designs;

  IF v_post_artists_count != v_pre_artists_count THEN
    RAISE EXCEPTION '[POST-CHECK ABORT] CRITICAL ERROR: Artists table count changed! Pre: %, Post: %',
      v_pre_artists_count, v_post_artists_count
      USING ERRCODE = 'P0001';
  END IF;

  IF v_post_flash_designs_count != v_pre_flash_designs_count THEN
    RAISE EXCEPTION '[POST-CHECK ABORT] CRITICAL ERROR: Flash designs table count changed! Pre: %, Post: %',
      v_pre_flash_designs_count, v_post_flash_designs_count
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '====================================================================';
  RAISE NOTICE '✅ ALL HARDENED PURGE GUARDS CONFIRMED:';
  RAISE NOTICE '  - Targeted 8 requests (7 estimates, 1 flash) : 0 remaining';
  RAISE NOTICE '  - Targeted 5 bookings                        : 0 remaining';
  RAISE NOTICE '  - Linked date options (6 rows)               : 0 remaining';
  RAISE NOTICE '  - Linked sessions, payments, submissions     : 0 remaining';
  RAISE NOTICE '  - Customer account (user_id: %)  : INTACT', v_customer_id;
  RAISE NOTICE '  - Target Flash Design status (%)           : UNCHANGED (%)', v_target_flash_design_id, v_post_flash_design_status;
  RAISE NOTICE '  - Artists count (exact match: %)             : INTACT', v_post_artists_count;
  RAISE NOTICE '  - Flash Designs count (exact match: %)       : INTACT', v_post_flash_designs_count;
  RAISE NOTICE '====================================================================';

END;
$$;

COMMIT;
