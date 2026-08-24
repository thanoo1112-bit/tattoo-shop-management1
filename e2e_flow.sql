DO $$
DECLARE
    v_session_id uuid;
    v_public_token text;
    v_booking_id uuid;
    v_payment_id uuid;
    v_storage_path text;
    v_payment_status text;
    v_booking_status text;
    v_appointment_count int;
    v_hold_count int;
    v_res json;
    v_owner_id uuid := '4c4518da-502f-498f-b616-8dd98eb1c730';
    v_artist_id uuid := '465f46dc-bdec-4102-9b91-267f5edf864b';
    v_style_id uuid := 'b45d9f73-1f9f-4474-9e7e-a6e7bc05ce86';
BEGIN
    RAISE NOTICE '--- STARTING DATABASE E2E FLOW TEST ---';

    -- 1. Create public booking upload session
    INSERT INTO private.public_booking_upload_sessions (
        shop_id, artist_id, style_id, color_mode, work_type, status, expires_at
    ) VALUES (
        'f6a103ca-0fea-4c94-a57a-39ec85c14589',
        v_artist_id,
        v_style_id,
        'black_grey',
        'new_work',
        'active',
        now() + interval '30 minutes'
    ) RETURNING id INTO v_session_id;

    RAISE NOTICE 'Created upload session: %', v_session_id;

    -- 2. Finalize public booking
    v_public_token := public.finalize_public_booking(
        p_session_id => v_session_id,
        p_width_cm => 10.0,
        p_height_cm => 10.0,
        p_placement => 'แขน',
        p_description => 'FINAL E2E BOOKING FLOW',
        p_full_name => 'FINAL E2E TEST',
        p_phone => '0812345678',
        p_email => 'e2e@example.com',
        p_health_note => 'ไม่มีโรคประจำตัว',
        p_requested_date => '2026-08-30',
        p_requested_time => '13:00',
        p_real_area_paths => '{}',
        p_design_ref_paths => '{}',
        p_terms_accepted => true,
        p_is_first_tattoo => true,
        p_safety_notice_acknowledged => true
    );

    RAISE NOTICE 'Finalized booking. Public Token: %', v_public_token;

    -- Retrieve booking ID and status
    SELECT id, status INTO v_booking_id, v_booking_status
    FROM public.booking_requests
    WHERE public_token = v_public_token::uuid;

    RAISE NOTICE 'Booking ID: %, Status: %', v_booking_id, v_booking_status;
    IF v_booking_status != 'pending_review' THEN
        RAISE EXCEPTION 'Initial status is not pending_review';
    END IF;

    -- Simulate authentication for RPC calls requiring auth
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id)::text, true);

    -- 3. Approve booking request (Artist/Staff)
    PERFORM public.approve_booking_request_v2(
        p_booking_id => v_booking_id,
        p_agreed_price => 5000,
        p_deposit_amount => 1000,
        p_confirmed_start_at => '2026-08-30 06:00:00+00', -- 13:00 BKK is 06:00 UTC
        p_confirmed_end_at => '2026-08-30 08:00:00+00'
    );

    SELECT status INTO v_booking_status FROM public.booking_requests WHERE id = v_booking_id;
    RAISE NOTICE 'Booking status after approve: %', v_booking_status;
    IF v_booking_status != 'pending_payment' THEN
        RAISE EXCEPTION 'Status after approve is not pending_payment';
    END IF;

    -- Check if payment row created
    SELECT id, status INTO v_payment_id, v_payment_status
    FROM public.payments
    WHERE booking_request_id = v_booking_id AND payment_type = 'deposit';

    RAISE NOTICE 'Created payment ID: %, Status: %', v_payment_id, v_payment_status;
    IF v_payment_status != 'pending' THEN
        RAISE EXCEPTION 'Payment status is not pending';
    END IF;

    -- 4. Customer uploads slip
    -- Create public payment upload session
    v_res := public.create_public_payment_upload_session(
        p_public_token => v_public_token::uuid
    );
    v_storage_path := v_res->>'storage_path';

    RAISE NOTICE 'Payment upload session storage path: %', v_storage_path;

    -- Insert dummy storage object to satisfy file existence check
    INSERT INTO storage.objects (
        id, bucket_id, name, metadata, is_delete_marker, is_versioned
    ) VALUES (
        gen_random_uuid(),
        'payment-proofs',
        v_storage_path,
        '{"mimetype": "image/webp"}'::jsonb,
        false,
        false
    );

    RAISE NOTICE 'Inserted dummy payment proof object into storage.objects table';

    -- Submit public payment slip
    PERFORM public.submit_public_payment_slip(
        p_public_token => v_public_token::uuid,
        p_storage_path => v_storage_path
    );

    SELECT status INTO v_payment_status FROM public.payments WHERE id = v_payment_id;
    SELECT status INTO v_booking_status FROM public.booking_requests WHERE id = v_booking_id;
    RAISE NOTICE 'After slip submission - Booking Status: %, Payment Status: %', v_booking_status, v_payment_status;
    IF v_payment_status != 'verification_pending' THEN
        RAISE EXCEPTION 'Payment status is not verification_pending after slip submission';
    END IF;

    -- 5. Staff verifies payment
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner_id)::text, true);

    PERFORM public.verify_manual_payment(
        p_payment_id => v_payment_id,
        p_status => 'paid'
    );

    SELECT status INTO v_payment_status FROM public.payments WHERE id = v_payment_id;
    SELECT status INTO v_booking_status FROM public.booking_requests WHERE id = v_booking_id;
    RAISE NOTICE 'After payment verification - Booking Status: %, Payment Status: %', v_booking_status, v_payment_status;
    
    IF v_payment_status != 'paid' OR v_booking_status != 'approved' THEN
        RAISE EXCEPTION 'Status mismatch after verification';
    END IF;

    -- Verify Appointment created
    SELECT count(*) INTO v_appointment_count FROM public.appointments WHERE booking_request_id = v_booking_id;
    RAISE NOTICE 'Appointments created: %', v_appointment_count;
    IF v_appointment_count != 1 THEN
        RAISE EXCEPTION 'Appointment was not created';
    END IF;

    -- Verify schedule hold deleted
    SELECT count(*) INTO v_hold_count FROM public.booking_schedule_holds WHERE booking_request_id = v_booking_id;
    RAISE NOTICE 'Remaining schedule holds: %', v_hold_count;
    IF v_hold_count != 0 THEN
        RAISE EXCEPTION 'Schedule hold was not cleaned up';
    END IF;

    RAISE NOTICE '--- DATABASE E2E FLOW TEST PASSED ---';
END $$;