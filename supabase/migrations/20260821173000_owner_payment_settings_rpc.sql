-- 1. Owner Read RPC
CREATE OR REPLACE FUNCTION public.get_shop_payment_settings(p_shop_id uuid)
RETURNS TABLE (
    bank_name text,
    account_name text,
    account_number text,
    promptpay_id text,
    payment_instructions text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_is_owner boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Verify ownership explicitly for the requested shop
    SELECT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id AND user_id = v_user_id AND role = 'owner' AND status = 'active'
    ) INTO v_is_owner;
    
    IF NOT v_is_owner THEN
        RAISE EXCEPTION 'Unauthorized: User is not an active shop owner for this shop';
    END IF;

    -- Return exactly one row, nulls if missing
    RETURN QUERY
    SELECT 
        s.bank_name, 
        s.account_name, 
        s.account_number, 
        s.promptpay_id, 
        s.payment_instructions
    FROM (SELECT p_shop_id AS id) AS target
    LEFT JOIN public.shop_payment_settings s ON s.shop_id = target.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shop_payment_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shop_payment_settings(uuid) TO authenticated;


-- 2. Owner Update RPC
CREATE OR REPLACE FUNCTION public.update_shop_payment_settings(
    p_shop_id uuid,
    p_bank_name text DEFAULT NULL,
    p_account_name text DEFAULT NULL,
    p_account_number text DEFAULT NULL,
    p_promptpay_id text DEFAULT NULL,
    p_payment_instructions text DEFAULT NULL
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
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Verify ownership explicitly for the requested shop
    SELECT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id AND user_id = v_user_id AND role = 'owner' AND status = 'active'
    ) INTO v_is_owner;
    
    IF NOT v_is_owner THEN
        RAISE EXCEPTION 'Unauthorized: User is not an active shop owner for this shop';
    END IF;

    -- Upsert the shop_payment_settings
    INSERT INTO public.shop_payment_settings (
        shop_id, bank_name, account_name, account_number, promptpay_id, payment_instructions, created_at, updated_at
    ) VALUES (
        p_shop_id, v_bank, v_acc_name, v_acc_num, v_promptpay, v_instr, now(), now()
    )
    ON CONFLICT (shop_id) DO UPDATE SET
        bank_name = EXCLUDED.bank_name,
        account_name = EXCLUDED.account_name,
        account_number = EXCLUDED.account_number,
        promptpay_id = EXCLUDED.promptpay_id,
        payment_instructions = EXCLUDED.payment_instructions,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.update_shop_payment_settings(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_shop_payment_settings(uuid, text, text, text, text, text) TO authenticated;
