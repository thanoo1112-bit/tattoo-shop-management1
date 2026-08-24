-- 1. Create public bucket for shop payment QR
INSERT INTO storage.buckets (id, name, public) 
VALUES ('shop-payment-qr', 'shop-payment-qr', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies for shop-payment-qr
CREATE POLICY "Public read for shop payment QR" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'shop-payment-qr' );

CREATE POLICY "Owner upload shop payment QR" 
ON storage.objects FOR INSERT 
TO authenticated
WITH CHECK (
    bucket_id = 'shop-payment-qr' AND
    EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_members.shop_id = (string_to_array(name, '/'))[1]::uuid
          AND shop_members.user_id = auth.uid() 
          AND shop_members.role = 'owner' 
          AND shop_members.status = 'active'
    )
);

CREATE POLICY "Owner update shop payment QR" 
ON storage.objects FOR UPDATE 
TO authenticated
USING (
    bucket_id = 'shop-payment-qr' AND
    EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_members.shop_id = (string_to_array(name, '/'))[1]::uuid
          AND shop_members.user_id = auth.uid() 
          AND shop_members.role = 'owner' 
          AND shop_members.status = 'active'
    )
)
WITH CHECK (
    bucket_id = 'shop-payment-qr' AND
    EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_members.shop_id = (string_to_array(name, '/'))[1]::uuid
          AND shop_members.user_id = auth.uid() 
          AND shop_members.role = 'owner' 
          AND shop_members.status = 'active'
    )
);

CREATE POLICY "Owner delete shop payment QR" 
ON storage.objects FOR DELETE 
TO authenticated
USING (
    bucket_id = 'shop-payment-qr' AND
    EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_members.shop_id = (string_to_array(name, '/'))[1]::uuid
          AND shop_members.user_id = auth.uid() 
          AND shop_members.role = 'owner' 
          AND shop_members.status = 'active'
    )
);


-- 2. Add column to shop_payment_settings
ALTER TABLE public.shop_payment_settings ADD COLUMN IF NOT EXISTS payment_qr_path text;


-- 3. Update Owner Read RPC
DROP FUNCTION IF EXISTS public.get_shop_payment_settings(uuid);

CREATE OR REPLACE FUNCTION public.get_shop_payment_settings(p_shop_id uuid)
RETURNS TABLE (
    bank_name text,
    account_name text,
    account_number text,
    promptpay_id text,
    payment_instructions text,
    payment_qr_path text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_owner boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id AND user_id = v_user_id AND role = 'owner' AND status = 'active'
    ) INTO v_is_owner;
    
    IF NOT v_is_owner THEN
        RAISE EXCEPTION 'Unauthorized: User is not an active shop owner for this shop';
    END IF;

    RETURN QUERY
    SELECT 
        s.bank_name, 
        s.account_name, 
        s.account_number, 
        s.promptpay_id, 
        s.payment_instructions,
        s.payment_qr_path
    FROM (SELECT p_shop_id AS id) AS target
    LEFT JOIN public.shop_payment_settings s ON s.shop_id = target.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shop_payment_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_payment_settings(uuid) TO authenticated;


-- 4. Update Owner Update RPC
DROP FUNCTION IF EXISTS public.update_shop_payment_settings(uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.update_shop_payment_settings(
    p_shop_id uuid,
    p_bank_name text DEFAULT NULL,
    p_account_name text DEFAULT NULL,
    p_account_number text DEFAULT NULL,
    p_promptpay_id text DEFAULT NULL,
    p_payment_instructions text DEFAULT NULL,
    p_payment_qr_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_owner boolean;
    v_bank text := NULLIF(TRIM(p_bank_name), '');
    v_acc_name text := NULLIF(TRIM(p_account_name), '');
    v_acc_num text := NULLIF(TRIM(p_account_number), '');
    v_promptpay text := NULLIF(TRIM(p_promptpay_id), '');
    v_instr text := NULLIF(TRIM(p_payment_instructions), '');
    v_qr text := NULLIF(TRIM(p_payment_qr_path), '');
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id AND user_id = v_user_id AND role = 'owner' AND status = 'active'
    ) INTO v_is_owner;
    
    IF NOT v_is_owner THEN
        RAISE EXCEPTION 'Unauthorized: User is not an active shop owner for this shop';
    END IF;

    INSERT INTO public.shop_payment_settings (
        shop_id, bank_name, account_name, account_number, promptpay_id, payment_instructions, payment_qr_path, created_at, updated_at
    ) VALUES (
        p_shop_id, v_bank, v_acc_name, v_acc_num, v_promptpay, v_instr, v_qr, now(), now()
    )
    ON CONFLICT (shop_id) DO UPDATE SET
        bank_name = EXCLUDED.bank_name,
        account_name = EXCLUDED.account_name,
        account_number = EXCLUDED.account_number,
        promptpay_id = EXCLUDED.promptpay_id,
        payment_instructions = EXCLUDED.payment_instructions,
        payment_qr_path = EXCLUDED.payment_qr_path,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.update_shop_payment_settings(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_shop_payment_settings(uuid, text, text, text, text, text, text) TO authenticated;


-- 5. Update Public Customer Payment RPC
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
    v_payment_found boolean := false;
    v_hold_found boolean := false;
BEGIN
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
    
    SELECT * INTO v_shop FROM public.shops WHERE id = v_booking.shop_id;
    SELECT * INTO v_artist FROM public.profiles WHERE id = v_booking.artist_id;
    
    SELECT * INTO v_payment FROM public.payments WHERE booking_request_id = v_booking.id AND payment_type = 'deposit' ORDER BY created_at DESC LIMIT 1;
    v_payment_found := FOUND;
    
    SELECT * INTO v_hold FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id;
    v_hold_found := FOUND;
    
    SELECT * INTO v_settings FROM public.shop_payment_settings WHERE shop_id = v_booking.shop_id;

    IF v_hold_found THEN
        v_payment_deadline := v_hold.expires_at;
    END IF;

    IF v_booking.status = 'pending_payment' AND v_payment_found AND v_payment.status = 'pending' AND v_payment_deadline IS NOT NULL AND v_payment_deadline > now() THEN
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
        'payment_instructions', v_settings.payment_instructions,
        'payment_qr_path', v_settings.payment_qr_path
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_payment_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_payment_details(uuid) TO anon, authenticated;
