-- =============================================================================
-- Allow Anonymous Access to Payment RPCs
-- Restores anonymous guest checkout capability-based access to payment details,
-- upload sessions, and slip submission for public storefront bookings.
-- =============================================================================

-- 1. Redefine get_public_payment_details to allow anonymous capability-based access
CREATE OR REPLACE FUNCTION public.get_public_payment_details(p_public_token uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_booking record;
    v_shop record;
    v_artist record;
    v_payment record;
    v_hold record;
    v_status text;
    v_payment_status text;
    v_deadline timestamptz;
    v_style_name text;
BEGIN
    -- Resolve booking using public token
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT * INTO v_shop FROM public.shops WHERE id = v_booking.shop_id;
    SELECT * INTO v_artist FROM public.profiles WHERE id = v_booking.artist_id;
    SELECT * INTO v_payment FROM public.payments WHERE booking_request_id = v_booking.id AND payment_type = 'deposit' ORDER BY created_at DESC LIMIT 1;
    SELECT * INTO v_hold FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id;

    v_status := v_booking.status;
    IF v_payment.id IS NOT NULL THEN
        v_payment_status := v_payment.status;
    ELSE
        v_payment_status := 'pending';
    END IF;

    IF v_hold.id IS NOT NULL THEN
        v_deadline := v_hold.expires_at;
    ELSE
        v_deadline := NULL;
    END IF;

    SELECT ts.name INTO v_style_name 
    FROM public.tattoo_projects tp
    JOIN public.tattoo_styles ts ON tp.style_id = ts.id
    WHERE tp.id = v_booking.project_id;

    RETURN json_build_object(
        'shop_name', v_shop.name,
        'artist_display_name', v_artist.full_name,
        'booking_status', v_status,
        'payment_status', v_payment_status,
        'deposit_amount', COALESCE(v_payment.amount, 0),
        'currency', 'THB',
        'confirmed_start_at', v_booking.confirmed_start_at,
        'confirmed_end_at', v_booking.confirmed_end_at,
        'payment_deadline', v_deadline,
        'can_upload_proof', (v_status = 'pending_payment' AND v_payment_status = 'pending' AND v_deadline > now()),
        'payment_qr_path', v_shop.payment_qr_path
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_payment_details(uuid) TO anon, authenticated;


-- 2. Redefine create_public_payment_upload_session to allow anonymous capability-based access
CREATE OR REPLACE FUNCTION public.create_public_payment_upload_session(p_public_token uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_booking record;
    v_payment record;
    v_hold record;
    v_session record;
    v_storage_path text;
    v_expires_at timestamptz;
BEGIN
    -- 1. Resolve booking and lock
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
    IF v_booking.status != 'pending_payment' THEN RAISE EXCEPTION 'Booking not awaiting payment'; END IF;

    -- 2. Deposit payment and lock
    SELECT * INTO v_payment FROM public.payments WHERE booking_request_id = v_booking.id AND payment_type = 'deposit' AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No pending deposit found'; END IF;

    -- 3. Active hold
    SELECT * INTO v_hold FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id FOR UPDATE;
    IF NOT FOUND OR v_hold.expires_at <= now() THEN RAISE EXCEPTION 'Reservation hold is missing or expired'; END IF;

    -- 4. Check for existing active session
    SELECT * INTO v_session FROM private.public_payment_upload_sessions 
    WHERE booking_request_id = v_booking.id 
      AND payment_id = v_payment.id 
      AND consumed_at IS NULL 
      AND expires_at > now() 
    ORDER BY created_at DESC LIMIT 1;
    
    IF FOUND THEN
        RETURN json_build_object(
            'upload_session_id', v_session.id,
            'storage_path', v_session.storage_path,
            'expires_at', v_session.expires_at
        );
    END IF;

    -- 5. Generate new path & expiration
    v_storage_path := v_booking.shop_id::text || '/' || v_booking.id::text || '/' || gen_random_uuid()::text || '.webp';
    v_expires_at := now() + interval '30 minutes';

    -- 6. Insert new session
    INSERT INTO private.public_payment_upload_sessions (booking_request_id, payment_id, storage_path, expires_at)
    VALUES (v_booking.id, v_payment.id, v_storage_path, v_expires_at)
    RETURNING * INTO v_session;

    RETURN json_build_object(
        'upload_session_id', v_session.id,
        'storage_path', v_session.storage_path,
        'expires_at', v_session.expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_payment_upload_session(uuid) TO anon, authenticated;


-- 3. Redefine submit_public_payment_slip to allow anonymous capability-based access
CREATE OR REPLACE FUNCTION public.submit_public_payment_slip(p_public_token uuid, p_storage_path text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_booking record;
    v_payment record;
    v_hold record;
    v_session record;
    v_object record;
    v_mimetype text;
BEGIN
    -- 1. Lock booking request
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
    IF v_booking.status != 'pending_payment' THEN RAISE EXCEPTION 'Booking not awaiting payment'; END IF;

    -- 2. Lock and check hold explicitly
    SELECT * INTO v_hold FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id FOR UPDATE;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Reservation hold is missing'; 
    END IF;
    IF v_hold.expires_at <= now() THEN
        RAISE EXCEPTION 'Reservation hold has expired. Please contact support to reschedule.';
    END IF;

    -- 3. Lock pending payment
    SELECT * INTO v_payment FROM public.payments WHERE booking_request_id = v_booking.id AND payment_type = 'deposit' AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No pending deposit found'; END IF;

    -- 4. Verify upload session
    SELECT * INTO v_session FROM private.public_payment_upload_sessions 
    WHERE storage_path = p_storage_path 
      AND booking_request_id = v_booking.id 
      AND payment_id = v_payment.id 
    FOR UPDATE;
    
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or unauthorized storage path for this payment'; END IF;
    IF v_session.consumed_at IS NOT NULL THEN RAISE EXCEPTION 'Upload session already consumed'; END IF;
    IF v_session.expires_at <= now() THEN RAISE EXCEPTION 'Upload session expired'; END IF;

    -- 5. Verify storage object exists and MIME type
    SELECT * INTO v_object FROM storage.objects WHERE bucket_id = 'payment-proofs' AND name = p_storage_path;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment proof file not found in storage'; END IF;
    
    v_mimetype := v_object.metadata->>'mimetype';
    IF v_mimetype NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
        RAISE EXCEPTION 'Invalid file type. Only JPEG, PNG, and WebP are allowed.';
    END IF;

    -- 6. Mark session consumed
    UPDATE private.public_payment_upload_sessions SET consumed_at = now() WHERE id = v_session.id;

    -- 7. Extend hold
    UPDATE public.booking_schedule_holds
    SET expires_at = now() + interval '24 hours', updated_at = now()
    WHERE booking_request_id = v_booking.id;

    -- 8. Advance payment status
    UPDATE public.payments 
    SET status = 'verification_pending', 
        proof_storage_path = p_storage_path, 
        proof_submitted_at = now(), 
        updated_at = now() 
    WHERE id = v_payment.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_public_payment_slip(uuid, text) TO anon, authenticated;
