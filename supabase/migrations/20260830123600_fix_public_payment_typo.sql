-- 1. Redefine get_public_payment_details with correct full_name field lookup
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
