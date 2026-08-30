-- =============================================================================
-- Fix get_public_payment_details crashing for Custom (non-Flash) Bookings
-- Root cause: v_flash record is only assigned when flash_design_id IS NOT NULL,
-- but COALESCE(v_flash.flash_code, NULL) unconditionally dereferences v_flash,
-- causing PostgreSQL to raise "record v_flash is not assigned yet" for Custom Bookings.
-- Fix: Extract flash fields into text variables before json_build_object call.
-- =============================================================================

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
        'can_upload_proof',      (v_status = 'pending_payment' AND v_payment_status = 'pending' AND v_deadline > now()),
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