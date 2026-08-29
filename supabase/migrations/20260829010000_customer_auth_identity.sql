-- =============================================================================
-- Customer Auth Identity Migration
-- Adds auth_user_id to customers, ensure_customer_account RPC,
-- and customer-facing RLS policies.
-- =============================================================================

ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customers_shop_auth_user_unique
ON public.customers (shop_id, auth_user_id)
WHERE auth_user_id IS NOT NULL;

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

    v_phone_norm := regexp_replace(p_phone, '\D', '', 'g');
    IF length(v_phone_norm) < 9 THEN
        RAISE EXCEPTION 'Invalid phone number';
    END IF;

    SELECT id INTO v_customer_id
    FROM public.customers
    WHERE shop_id = p_shop_id AND auth_user_id = v_uid
    LIMIT 1;

    IF v_customer_id IS NOT NULL THEN
        RETURN v_customer_id;
    END IF;

    SELECT id, auth_user_id INTO v_existing
    FROM public.customers
    WHERE shop_id = p_shop_id AND phone_normalized = v_phone_norm
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
        IF v_existing.auth_user_id IS NOT NULL AND v_existing.auth_user_id <> v_uid THEN
            RAISE EXCEPTION 'Phone number is already associated with a different account';
        END IF;

        UPDATE public.customers
        SET auth_user_id = v_uid,
            full_name    = COALESCE(btrim(p_full_name), full_name),
            email        = COALESCE(NULLIF(btrim(p_email), ''), email),
            updated_at   = now()
        WHERE id = v_existing.id;

        RETURN v_existing.id;
    END IF;

    INSERT INTO public.customers (shop_id, auth_user_id, full_name, phone_normalized, email, source)
    VALUES (p_shop_id, v_uid, btrim(p_full_name), v_phone_norm, NULLIF(btrim(p_email), ''), 'online')
    RETURNING id INTO v_customer_id;

    RETURN v_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_customer_account(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_customer_account(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_customer_id(p_shop_id uuid)
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = ''
AS $$
    SELECT id FROM public.customers
    WHERE shop_id = p_shop_id AND auth_user_id = auth.uid()
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_customer_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_customer_id(uuid) TO authenticated;

DROP POLICY IF EXISTS "Customer reads own record" ON public.customers;
CREATE POLICY "Customer reads own record"
ON public.customers FOR SELECT
TO authenticated
USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Customer updates own record" ON public.customers;
CREATE POLICY "Customer updates own record"
ON public.customers FOR UPDATE
TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Customer sees own booking requests" ON public.booking_requests;
CREATE POLICY "Customer sees own booking requests"
ON public.booking_requests FOR SELECT
TO authenticated
USING (
    customer_id IN (
        SELECT id FROM public.customers WHERE auth_user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Customer sees own tattoo projects" ON public.tattoo_projects;
CREATE POLICY "Customer sees own tattoo projects"
ON public.tattoo_projects FOR SELECT
TO authenticated
USING (
    customer_id IN (
        SELECT id FROM public.customers WHERE auth_user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Customer sees own payments" ON public.payments;
CREATE POLICY "Customer sees own payments"
ON public.payments FOR SELECT
TO authenticated
USING (
    booking_request_id IN (
        SELECT br.id FROM public.booking_requests br
        JOIN public.customers c ON c.id = br.customer_id
        WHERE c.auth_user_id = auth.uid()
    )
    OR
    project_id IN (
        SELECT tp.id FROM public.tattoo_projects tp
        JOIN public.customers c ON c.id = tp.customer_id
        WHERE c.auth_user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Customer sees own appointments" ON public.appointments;
CREATE POLICY "Customer sees own appointments"
ON public.appointments FOR SELECT
TO authenticated
USING (
    customer_id IN (
        SELECT id FROM public.customers WHERE auth_user_id = auth.uid()
    )
);
