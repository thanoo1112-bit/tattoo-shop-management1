-- ============================================================================
-- 157 TATTOO — PHASE 62 FORWARD MIGRATION
-- RESET ALL TEST BOOKING & REQUEST DATA FOR FRESH TESTING
-- ============================================================================
-- Scope:
-- Deletes ALL rows (across ALL statuses) from:
--   1. booking_payment_submissions (child of booking_payments & bookings)
--   2. booking_payments (child of bookings)
--   3. booking_sessions (child of bookings)
--   4. bookings
--   5. estimate_request_date_options (child of estimate_requests)
--   6. estimate_requests
--   7. flash_reservations
--
-- Resets:
--   • flash_designs: status = 'AVAILABLE' for all rows (is_repeatable untouched)
--
-- Preserves (MUST NOT MODIFY):
--   • auth.users, customers, artists, profiles
--   • flash_designs master rows & images
--   • portfolio, shop settings, artist blocked dates / working hours
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_pre_submissions INT;
  v_pre_payments INT;
  v_pre_sessions INT;
  v_pre_bookings INT;
  v_pre_date_options INT;
  v_pre_estimates INT;
  v_pre_flash_res INT;

  v_post_submissions INT;
  v_post_payments INT;
  v_post_sessions INT;
  v_post_bookings INT;
  v_post_date_options INT;
  v_post_estimates INT;
  v_post_flash_res INT;
  v_reset_flash_designs INT;
BEGIN
  -- 1. PRE-DELETION COUNTS & REPORT
  SELECT COUNT(*) INTO v_pre_submissions FROM public.booking_payment_submissions;
  SELECT COUNT(*) INTO v_pre_payments FROM public.booking_payments;
  SELECT COUNT(*) INTO v_pre_sessions FROM public.booking_sessions;
  SELECT COUNT(*) INTO v_pre_bookings FROM public.bookings;
  SELECT COUNT(*) INTO v_pre_date_options FROM public.estimate_request_date_options;
  SELECT COUNT(*) INTO v_pre_estimates FROM public.estimate_requests;
  SELECT COUNT(*) INTO v_pre_flash_res FROM public.flash_reservations;

  RAISE NOTICE '--- PRE-DELETION DATA COUNTS ---';
  RAISE NOTICE 'booking_payment_submissions: %', v_pre_submissions;
  RAISE NOTICE 'booking_payments:            %', v_pre_payments;
  RAISE NOTICE 'booking_sessions:            %', v_pre_sessions;
  RAISE NOTICE 'bookings:                    %', v_pre_bookings;
  RAISE NOTICE 'estimate_request_date_opts:  %', v_pre_date_options;
  RAISE NOTICE 'estimate_requests:           %', v_pre_estimates;
  RAISE NOTICE 'flash_reservations:          %', v_pre_flash_res;

  -- 2. CHILD TO PARENT DELETION
  DELETE FROM public.booking_payment_submissions;
  DELETE FROM public.booking_payments;
  DELETE FROM public.booking_sessions;
  DELETE FROM public.bookings;
  DELETE FROM public.estimate_request_date_options;
  DELETE FROM public.estimate_requests;
  DELETE FROM public.flash_reservations;

  -- 3. RESET FLASH DESIGNS STATUS TO AVAILABLE
  UPDATE public.flash_designs
  SET status = 'AVAILABLE';

  GET DIAGNOSTICS v_reset_flash_designs = ROW_COUNT;

  -- 4. POST-DELETION VERIFICATION
  SELECT COUNT(*) INTO v_post_submissions FROM public.booking_payment_submissions;
  SELECT COUNT(*) INTO v_post_payments FROM public.booking_payments;
  SELECT COUNT(*) INTO v_post_sessions FROM public.booking_sessions;
  SELECT COUNT(*) INTO v_post_bookings FROM public.bookings;
  SELECT COUNT(*) INTO v_post_date_options FROM public.estimate_request_date_options;
  SELECT COUNT(*) INTO v_post_estimates FROM public.estimate_requests;
  SELECT COUNT(*) INTO v_post_flash_res FROM public.flash_reservations;

  RAISE NOTICE '--- POST-DELETION DATA COUNTS ---';
  RAISE NOTICE 'booking_payment_submissions: % (expected 0)', v_post_submissions;
  RAISE NOTICE 'booking_payments:            % (expected 0)', v_post_payments;
  RAISE NOTICE 'booking_sessions:            % (expected 0)', v_post_sessions;
  RAISE NOTICE 'bookings:                    % (expected 0)', v_post_bookings;
  RAISE NOTICE 'estimate_request_date_opts:  % (expected 0)', v_post_date_options;
  RAISE NOTICE 'estimate_requests:           % (expected 0)', v_post_estimates;
  RAISE NOTICE 'flash_reservations:          % (expected 0)', v_post_flash_res;
  RAISE NOTICE 'flash_designs reset:         %', v_reset_flash_designs;

  IF v_post_submissions > 0 OR v_post_payments > 0 OR v_post_sessions > 0 OR
     v_post_bookings > 0 OR v_post_date_options > 0 OR v_post_estimates > 0 OR v_post_flash_res > 0 THEN
    RAISE EXCEPTION '[ABORT] Reset failed: one or more tables still contain data' USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '✅ ALL TEST BOOKING AND REQUEST DATA SUCCESSFULLY RESET TO 0';
END;
$$;

COMMIT;
