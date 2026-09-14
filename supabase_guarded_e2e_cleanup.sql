-- ============================================================================
-- 157 TATTOO — SAFE GUARDED PRODUCTION CLEANUP SCRIPT
-- POST END-TO-END VERIFICATION FIXTURE REMOVAL
-- ============================================================================
-- Safety:
-- 1. All target IDs are explicitly verified.
-- 2. profiles cleanup uses verified profiles.id and profiles.user_id.
-- 3. Owner (2d01322e-...) and Bas (b8477802-...) accounts are strictly guarded.
-- 4. Post-cleanup count assertions guarantee baseline integrity.
-- ============================================================================

DO $$
DECLARE
  v_owner_user_id UUID := '2d01322e-5eb4-4157-b7db-93ba25cc5c65';
  v_bas_user_id UUID := 'b8477802-715b-44e2-86c4-4c2828dbfb3c';
  v_bom_artist_id UUID := '9aee0ce8-2c11-4b22-a52d-296807070d12';
  v_bas_artist_id UUID := 'd5af5064-d973-4bbb-b205-1ab6b2929abb';

  v_total_bookings INT;
  v_total_sessions INT;
  v_bom_bookings INT;
  v_bom_sessions INT;
  v_bas_bookings INT;
  v_bas_sessions INT;
BEGIN

  -- --------------------------------------------------------------------------
  -- SAFETY ASSERTION 1: Verify Protected Accounts Are Not Targeted
  -- --------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id IN ('d7971991-2d13-4757-a9cf-a1ee897231a0', '3d3969aa-cf19-4aad-b133-6b0c2bc572c8', 'fb6a369b-31ea-449d-9b97-926ef0ef96e8')
      AND user_id IN (v_owner_user_id, v_bas_user_id)
  ) THEN
    RAISE EXCEPTION 'CRITICAL: Protected admin/artist account detected in cleanup list! Aborting.' USING ERRCODE = 'P0001';
  END IF;

  -- --------------------------------------------------------------------------
  -- STEP 1: Delete Disposable Booking Payments
  -- --------------------------------------------------------------------------
  DELETE FROM public.booking_payments
  WHERE id IN (
    'fa19bf83-89f3-40c5-84c6-865da251179f'
  );

  -- --------------------------------------------------------------------------
  -- STEP 2: Delete Disposable Payment Submissions
  -- --------------------------------------------------------------------------
  DELETE FROM public.booking_payment_submissions
  WHERE id IN (
    'c5d41cc1-940a-481f-8aa3-a1c63c7cdb60'
  );

  -- --------------------------------------------------------------------------
  -- STEP 3: Delete Disposable Booking Sessions
  -- --------------------------------------------------------------------------
  DELETE FROM public.booking_sessions
  WHERE id IN (
    'd921747e-4c58-40b8-a815-306e2832ed62',
    '1f49543b-a08b-4224-90f5-5d835df334a0',
    '3534502d-4cea-4da4-a3ee-276ea8cf2a13',
    'aa28327b-0aa9-4c8b-8651-05ab7d0199ec',
    'ec669a37-f174-418a-919b-100f31d19535',
    '7d4fc300-602b-41b8-b6b5-c72333510ea9',
    '8568f6cc-2a03-4730-a505-758c88e018c7',
    'a22cafee-98c7-487c-8958-21466e8bd83a',
    '7f007faf-facc-4396-9b05-eabf8c181fad',
    'eba9173c-f898-40ab-895d-8f17241a000f'
  );

  -- --------------------------------------------------------------------------
  -- STEP 4: Delete Disposable Bookings
  -- --------------------------------------------------------------------------
  DELETE FROM public.bookings
  WHERE id IN (
    '5c3853f3-ed07-4df3-9f16-cff6c699ecc6',
    'bdb0b60e-4c0a-4d1a-84aa-a8e86a362b62',
    'fa357f8a-334e-4b45-973e-b797b1af7730',
    '60bb0d4f-544a-466a-865a-71820c8189dc',
    '94da14ae-c4b5-42e2-b19c-2908f99634ad',
    'b704d0eb-27cf-4206-9c2e-ea203d153fa7',
    'b030460d-59a6-4ced-a014-1d74b4945658',
    '72c34d9d-8f3a-45f9-a1e8-170d28d235ed',
    '0b04feaa-7709-4f65-86c2-3e5fa2116388',
    'bbf8133c-8a20-4437-8466-a2660c42e199'
  );

  -- --------------------------------------------------------------------------
  -- STEP 5: Delete Disposable Estimate Requests
  -- --------------------------------------------------------------------------
  DELETE FROM public.estimate_requests
  WHERE id IN (
    'b3e4ff58-d845-4dd3-8ad2-3e9b67354d6a',
    '0990f789-3d93-4567-8950-19d21ea2b53a',
    '67724e60-bf47-497d-9dfd-a28e7d604dab',
    '11fd113e-6622-4cbc-9fab-a9d91579d6e4',
    '7f051000-0e73-4664-9b17-eeae91d1ffc8',
    '5c03bb82-0869-4f8e-af48-adabb7452430',
    '26f0be49-3cfe-43f9-8821-daeab4a60186',
    '231c5530-df01-4910-8f42-b989522ee0c3',
    '10884b83-4d9d-4634-ae4c-ec2906b6a6b9',
    '6f556ecb-a4f0-4882-a901-72645c35234d',
    '4742847e-dc4a-43c2-aede-00ff4ce1c765',
    '14d1b57a-43a2-48b0-a4b5-98c20bf2b286',
    '18fdf884-47c3-4024-84cd-c942d5b229c6',
    'b3a07cc3-0617-422c-8e72-4c719dfa887c'
  );

  -- --------------------------------------------------------------------------
  -- STEP 6: Delete Disposable Customers
  -- --------------------------------------------------------------------------
  DELETE FROM public.customers
  WHERE user_id IN (
    '11818cce-69d4-4ccd-a021-2361fdf66e88',
    '77046c8e-2d09-452d-bbb9-dffbe52f2d6f',
    '1366eed2-8111-462f-8625-c964898c2da9'
  );

  -- --------------------------------------------------------------------------
  -- STEP 7: Delete Disposable Profiles (using explicit verified profile IDs)
  -- --------------------------------------------------------------------------
  DELETE FROM public.profiles
  WHERE id IN (
    'd7971991-2d13-4757-a9cf-a1ee897231a0',
    '3d3969aa-cf19-4aad-b133-6b0c2bc572c8',
    'fb6a369b-31ea-449d-9b97-926ef0ef96e8'
  )
  AND user_id NOT IN (v_owner_user_id, v_bas_user_id);

  -- --------------------------------------------------------------------------
  -- STEP 8: Delete Disposable Auth Users
  -- --------------------------------------------------------------------------
  DELETE FROM auth.users
  WHERE id IN (
    '11818cce-69d4-4ccd-a021-2361fdf66e88',
    '77046c8e-2d09-452d-bbb9-dffbe52f2d6f',
    '1366eed2-8111-462f-8625-c964898c2da9'
  )
  AND id NOT IN (v_owner_user_id, v_bas_user_id);

  -- --------------------------------------------------------------------------
  -- STEP 9: POST-CLEANUP PRODUCTION BASELINE ASSERTIONS
  -- --------------------------------------------------------------------------
  SELECT COUNT(*) INTO v_total_bookings FROM public.bookings;
  SELECT COUNT(*) INTO v_total_sessions FROM public.booking_sessions;
  SELECT COUNT(*) INTO v_bom_bookings FROM public.bookings WHERE artist_id = v_bom_artist_id;
  SELECT COUNT(*) INTO v_bom_sessions FROM public.booking_sessions WHERE artist_id = v_bom_artist_id;
  SELECT COUNT(*) INTO v_bas_bookings FROM public.bookings WHERE artist_id = v_bas_artist_id;
  SELECT COUNT(*) INTO v_bas_sessions FROM public.booking_sessions WHERE artist_id = v_bas_artist_id;

  IF v_total_bookings != 73 THEN
    RAISE EXCEPTION 'POST-CLEANUP FAILED: Expected 73 global bookings, found %', v_total_bookings USING ERRCODE = 'P0001';
  END IF;

  IF v_total_sessions != 90 THEN
    RAISE EXCEPTION 'POST-CLEANUP FAILED: Expected 90 global sessions, found %', v_total_sessions USING ERRCODE = 'P0001';
  END IF;

  IF v_bom_bookings != 36 OR v_bom_sessions != 42 THEN
    RAISE EXCEPTION 'POST-CLEANUP FAILED: Chang Bom counts mutated! Expected 36/42, found %/%', v_bom_bookings, v_bom_sessions USING ERRCODE = 'P0001';
  END IF;

  IF v_bas_bookings != 0 OR v_bas_sessions != 0 THEN
    RAISE EXCEPTION 'POST-CLEANUP FAILED: Chang Bas has residual records! Expected 0/0, found %/%', v_bas_bookings, v_bas_sessions USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE 'SUCCESS: All assertions passed. Production database restored to exact baseline (73 bookings, 90 sessions).';
END $$;
