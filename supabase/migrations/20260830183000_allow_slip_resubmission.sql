-- Migration: Support resubmission of rejected/failed deposit slips
-- Enforce proper permissions for Owner and Artist roles in verify_manual_payment.

-- 1. Redefine verify_manual_payment
CREATE OR REPLACE FUNCTION public.verify_manual_payment(
    p_payment_id uuid,
    p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_payment record;
    v_booking record;
    v_is_authorized boolean := false;
    v_flash_status text;
BEGIN
    -- 1. Authentication check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Explicit NULL check
    IF p_status IS NULL THEN
        RAISE EXCEPTION 'Status must be specified';
    END IF;

    -- 3. Fetch and lock payment row
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found';
    END IF;

    -- 4. Active Membership / Authorization check
    -- Owner: active member with role = 'owner' -> can verify everything in the shop
    IF EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_payment.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'owner'
    ) THEN
        v_is_authorized := true;
    -- Artist: active member with role = 'artist' -> can verify ONLY their assigned bookings/projects/appointments
    ELSIF EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = v_payment.shop_id
          AND user_id = v_user_id
          AND status = 'active'
          AND role = 'artist'
    ) AND (
        EXISTS (
            SELECT 1 FROM public.booking_requests 
            WHERE id = v_payment.booking_request_id 
              AND artist_id = v_user_id
        ) OR 
        EXISTS (
            SELECT 1 FROM public.tattoo_projects 
            WHERE id = v_payment.project_id 
              AND artist_id = v_user_id
        ) OR 
        EXISTS (
            SELECT 1 FROM public.appointments 
            WHERE id = v_payment.appointment_id 
              AND artist_id = v_user_id
        )
    ) THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'คุณไม่มีสิทธิ์ตรวจสอบการชำระเงินของงานนี้';
    END IF;

    -- 5. Check status transition
    IF v_payment.status != 'verification_pending' THEN
        RAISE EXCEPTION 'Payment is not pending verification';
    END IF;

    IF p_status NOT IN ('paid', 'failed') THEN
        RAISE EXCEPTION 'Invalid status transition';
    END IF;

    -- Load booking record
    SELECT * INTO v_booking FROM public.booking_requests WHERE id = v_payment.booking_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking request not found';
    END IF;

    -- Pre-sold verification check for Flash Designs
    IF p_status = 'paid' AND v_booking.flash_design_id IS NOT NULL THEN
        SELECT status INTO v_flash_status FROM public.flash_designs WHERE id = v_booking.flash_design_id FOR UPDATE;
        IF v_flash_status = 'sold' THEN
            RAISE EXCEPTION 'งาน Flash นี้ได้รับการยืนยันการจองจากลูกค้ารายอื่นแล้ว';
        END IF;
    END IF;

    -- 6. Update payment status
    UPDATE public.payments 
    SET status = p_status, 
        verified_by = v_user_id, 
        verified_at = now(), 
        updated_at = now() 
    WHERE id = p_payment_id;

    -- 7. Conditional updates for booking requests on successful payment
    -- (Deposit-Only Finalization: only runs for payment_type = 'deposit')
    IF p_status = 'paid' AND v_payment.booking_request_id IS NOT NULL AND v_payment.payment_type = 'deposit' THEN
        IF v_booking.status = 'pending_payment' THEN
            -- Check if a valid (non-expired) hold exists
            IF EXISTS (
                SELECT 1 FROM public.booking_schedule_holds
                WHERE booking_request_id = v_booking.id
                  AND expires_at > now()
            ) THEN
                -- Lock artist profile row for serialization
                PERFORM 1 FROM public.profiles WHERE id = v_booking.artist_id FOR UPDATE;

                -- Delete/consume hold row
                DELETE FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id;

                -- Create Appointment
                INSERT INTO public.appointments (
                    shop_id,
                    project_id,
                    booking_request_id,
                    customer_id,
                    artist_id,
                    session_number,
                    start_at,
                    end_at,
                    status,
                    created_by
                )
                VALUES (
                    v_booking.shop_id,
                    v_booking.project_id,
                    v_booking.id,
                    v_booking.customer_id,
                    v_booking.artist_id,
                    1,
                    COALESCE(v_booking.confirmed_start_at, v_booking.requested_start_at),
                    COALESCE(v_booking.confirmed_end_at, v_booking.requested_end_at),
                    'scheduled',
                    v_user_id
                );

                -- Update project
                UPDATE public.tattoo_projects
                SET status = 'active',
                    updated_at = now()
                WHERE id = v_booking.project_id;

                -- Approve request
                UPDATE public.booking_requests
                SET status = 'approved',
                    confirmed_start_at = COALESCE(confirmed_start_at, requested_start_at),
                    confirmed_end_at = COALESCE(confirmed_end_at, requested_end_at),
                    approved_by = v_user_id,
                    approved_at = now(),
                    updated_at = now()
                WHERE id = v_booking.id;

            ELSE
                -- Expired hold flow
                UPDATE public.booking_requests
                SET status = 'pending_review',
                    confirmed_start_at = NULL,
                    confirmed_end_at = NULL,
                    updated_at = now()
                WHERE id = v_booking.id;
                
                DELETE FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id;
            END IF;
        END IF;
    END IF;

    -- NOTE: If p_status = 'failed', we do NOT cancel/expire the booking request or project.
    -- This keeps the booking pending so the customer can upload a new slip.
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_manual_payment(uuid, text) TO authenticated;


-- 2. Redefine create_public_payment_upload_session to support pending or failed status
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

    -- 2. Deposit payment and lock (allow 'failed' so they can resubmit)
    SELECT * INTO v_payment FROM public.payments 
    WHERE booking_request_id = v_booking.id 
      AND payment_type = 'deposit' 
      AND status IN ('pending', 'failed') FOR UPDATE;
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


-- 3. Redefine submit_public_payment_slip to support pending or failed status
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

    -- 3. Lock pending payment (allow 'failed' so they can resubmit)
    SELECT * INTO v_payment FROM public.payments 
    WHERE booking_request_id = v_booking.id 
      AND payment_type = 'deposit' 
      AND status IN ('pending', 'failed') FOR UPDATE;
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


-- 4. Redefine get_public_payment_details to support can_upload_proof when status is 'failed'
CREATE OR REPLACE FUNCTION public.get_public_payment_details(p_public_token uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_booking   record;
    v_project   record;
    v_flash     record;
    v_shop      record;
    v_artist    record;
    v_payment   record;
    v_hold      record;
    v_settings  record;
    v_status    text;
    v_payment_status text;
    v_deadline  timestamptz;
    v_flash_code       text := NULL;
    v_flash_image_path text := NULL;
BEGIN
    -- Resolve booking using public token
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token;
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT * INTO v_project FROM public.tattoo_projects WHERE id = v_booking.project_id;

    -- Only fetch and dereference v_flash if this is a Flash booking
    IF v_booking.flash_design_id IS NOT NULL THEN
        SELECT * INTO v_flash FROM public.flash_designs WHERE id = v_booking.flash_design_id;
        IF FOUND THEN
            v_flash_code       := v_flash.flash_code;
            v_flash_image_path := v_flash.image_path;
        END IF;
    END IF;

    SELECT * INTO v_shop     FROM public.shops                WHERE id = v_booking.shop_id;
    SELECT * INTO v_artist   FROM public.profiles             WHERE id = v_booking.artist_id;
    SELECT * INTO v_payment  FROM public.payments
        WHERE booking_request_id = v_booking.id AND payment_type = 'deposit'
        ORDER BY created_at DESC LIMIT 1;
    SELECT * INTO v_hold     FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id;
    SELECT * INTO v_settings FROM public.shop_payment_settings  WHERE shop_id = v_booking.shop_id;

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

    RETURN json_build_object(
        'shop_name',             v_shop.name,
        'artist_display_name',   v_artist.full_name,
        'booking_status',        v_status,
        'payment_status',        v_payment_status,
        'deposit_amount',        COALESCE(v_payment.amount, 0),
        'currency',              'THB',
        'confirmed_start_at',    v_booking.confirmed_start_at,
        'confirmed_end_at',      v_booking.confirmed_end_at,
        'payment_deadline',      v_deadline,
        'can_upload_proof',      (v_status = 'pending_payment' AND v_payment_status IN ('pending', 'failed') AND v_deadline > now()),
        'payment_qr_path',       COALESCE(v_settings.payment_qr_path, NULL),
        'customer_name',         v_booking.submitted_full_name,
        'customer_phone',        v_booking.submitted_phone,
        'placement',             v_project.body_placement,
        'width_cm',              v_project.width_cm,
        'height_cm',             v_project.height_cm,
        'tattoo_price',          COALESCE(v_project.agreed_price, 0),
        'style',                 v_project.tattoo_style,
        'flash_code',            v_flash_code,
        'flash_image_path',      v_flash_image_path
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_payment_details(uuid) TO anon, authenticated;