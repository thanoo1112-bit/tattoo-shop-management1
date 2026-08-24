CREATE OR REPLACE FUNCTION public.get_public_payment_details(p_public_token uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_booking record;
    v_shop record;
    v_artist record;
    v_payment record;
    v_hold record;
    v_settings record;
    v_can_upload_proof boolean := false;
    v_payment_deadline timestamptz := null;
BEGIN
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
    
    SELECT * INTO v_shop FROM public.shops WHERE id = v_booking.shop_id;
    SELECT * INTO v_artist FROM public.profiles WHERE id = v_booking.artist_id;
    
    SELECT * INTO v_payment FROM public.payments WHERE booking_request_id = v_booking.id AND payment_type = 'deposit' ORDER BY created_at DESC LIMIT 1;
    SELECT * INTO v_hold FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id;
    SELECT * INTO v_settings FROM public.shop_payment_settings WHERE shop_id = v_booking.shop_id;

    IF v_hold IS NOT NULL THEN
        v_payment_deadline := v_hold.expires_at;
    END IF;

    IF v_booking.status = 'pending_payment' AND v_payment IS NOT NULL AND v_payment.status = 'pending' AND v_payment_deadline IS NOT NULL AND v_payment_deadline > now() THEN
        v_can_upload_proof := true;
    END IF;

    RETURN json_build_object(
        'shop_name', v_shop.name,
        'artist_display_name', v_artist.full_name,
        'booking_status', v_booking.status,
        'payment_status', COALESCE(v_payment.status, 'none'),
        'deposit_amount', COALESCE(v_payment.amount, 0),
        'currency', COALESCE(v_payment.currency, 'THB'),
        'confirmed_start_at', v_booking.confirmed_start_at,
        'confirmed_end_at', v_booking.confirmed_end_at,
        'payment_deadline', v_payment_deadline,
        'can_upload_proof', v_can_upload_proof,
        'bank_name', v_settings.bank_name,
        'account_name', v_settings.account_name,
        'account_number', v_settings.account_number,
        'promptpay_id', v_settings.promptpay_id,
        'payment_instructions', v_settings.payment_instructions
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_payment_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_payment_details(uuid) TO anon, authenticated;
