-- =============================================================================
-- Prevent Account Takeover Migration
-- Re-defines ensure_customer_account to throw an error if the phone number
-- is already in use by any customer record in the shop, preventing a new user
-- from taking over an existing guest/walk-in customer record without permission.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ensure_customer_account(
    p_shop_id   uuid,
    p_full_name text,
    p_phone     text,
    p_email     text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_uid         uuid;
    v_phone_norm  text;
    v_customer_id uuid;
    v_existing    record;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required to create or link customer account';
    END IF;

    -- Normalise phone: strip non-digits
    v_phone_norm := regexp_replace(p_phone, '\D', '', 'g');
    IF length(v_phone_norm) < 9 THEN
        RAISE EXCEPTION 'Invalid phone number';
    END IF;

    -- (a) Already linked to this auth user in this shop
    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE shop_id = p_shop_id AND auth_user_id = v_uid
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
        RETURN v_customer_id;
    END IF;

    -- (b/c) Check if phone exists in this shop
    SELECT id, auth_user_id INTO v_existing
    FROM public.customers
    WHERE shop_id = p_shop_id AND phone_normalized = v_phone_norm
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        -- Strictly block takeover even if auth_user_id is NULL.
        -- Legacy walk-in/guest data must not be claimed blindly by entering the phone.
        RAISE EXCEPTION 'Phone number is already associated with an existing profile. Please contact the studio for assistance.';
    END IF;

    -- (d) No existing record → create new
    INSERT INTO public.customers (shop_id, auth_user_id, full_name, phone_normalized, email, source)
    VALUES (p_shop_id, v_uid, btrim(p_full_name), v_phone_norm, NULLIF(btrim(p_email), ''), 'online')
    RETURNING id INTO v_customer_id;

    RETURN v_customer_id;
END;
$$;
