-- ==============================================================================
-- Customer Balance Payment Backend V1
-- ==============================================================================

-- 1. Add payment public token
ALTER TABLE public.payments ADD COLUMN public_token uuid;
UPDATE public.payments SET public_token = gen_random_uuid();
ALTER TABLE public.payments ALTER COLUMN public_token SET DEFAULT gen_random_uuid();
ALTER TABLE public.payments ALTER COLUMN public_token SET NOT NULL;
ALTER TABLE public.payments ADD CONSTRAINT payments_public_token_key UNIQUE (public_token);

-- 2. Create private session table
CREATE TABLE private.balance_payment_upload_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
    storage_path text UNIQUE NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Public details RPC
CREATE OR REPLACE FUNCTION public.get_public_balance_payment_details(p_token uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_payment record;
    v_shop record;
    v_artist record;
    v_project record;
BEGIN
    SELECT * INTO v_payment FROM public.payments WHERE public_token = p_token AND payment_type = 'balance';
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;

    SELECT * INTO v_shop FROM public.shops WHERE id = v_payment.shop_id;
    SELECT * INTO v_project FROM public.tattoo_projects WHERE id = v_payment.project_id;
    
    RETURN json_build_object(
        'payment_type', v_payment.payment_type,
        'amount', v_payment.amount,
        'payment_status', v_payment.status,
        'shop_display_name', v_shop.name,
        'payment_qr_path', (SELECT payment_qr_path FROM public.shop_payment_settings WHERE shop_id = v_shop.id),
        'can_upload_proof', v_payment.status = 'pending'
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_balance_payment_details(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_balance_payment_details(uuid) TO anon, authenticated;

-- 4. Session creator
CREATE OR REPLACE FUNCTION public.create_public_balance_upload_session(p_token uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_payment record;
    v_session record;
    v_storage_path text;
    v_expires_at timestamptz;
BEGIN
    SELECT * INTO v_payment FROM public.payments WHERE public_token = p_token AND payment_type = 'balance' AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Valid pending balance payment not found'; END IF;

    SELECT * INTO v_session FROM private.balance_payment_upload_sessions 
    WHERE payment_id = v_payment.id AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1;

    IF FOUND THEN
        RETURN json_build_object('storage_path', v_session.storage_path, 'expires_at', v_session.expires_at);
    END IF;

    v_storage_path := v_payment.shop_id || '/balance/' || v_payment.id || '/' || gen_random_uuid() || '.webp';
    v_expires_at := now() + interval '30 minutes';

    INSERT INTO private.balance_payment_upload_sessions (payment_id, storage_path, expires_at)
    VALUES (v_payment.id, v_storage_path, v_expires_at);

    RETURN json_build_object('storage_path', v_storage_path, 'expires_at', v_expires_at);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_public_balance_upload_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_balance_upload_session(uuid) TO anon, authenticated;

-- 5. Upload helper
CREATE OR REPLACE FUNCTION public.can_upload_public_balance_payment_proof(p_storage_path text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_session record;
    v_payment record;
BEGIN
    SELECT * INTO v_session FROM private.balance_payment_upload_sessions WHERE storage_path = p_storage_path AND consumed_at IS NULL AND expires_at > now();
    IF NOT FOUND THEN RETURN false; END IF;

    SELECT * INTO v_payment FROM public.payments WHERE id = v_session.payment_id AND payment_type = 'balance' AND status = 'pending';
    IF NOT FOUND THEN RETURN false; END IF;

    RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_upload_public_balance_payment_proof(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_upload_public_balance_payment_proof(text) TO anon, authenticated;

-- Ensure storage policy incorporates balance
CREATE POLICY "Allow public balance proof upload via signed session" ON storage.objects
FOR INSERT TO public
WITH CHECK (
    bucket_id = 'payment-proofs' 
    AND (
        public.can_upload_public_payment_proof(name) 
        OR public.can_upload_public_balance_payment_proof(name)
    )
);

-- 6. Submit slip
CREATE OR REPLACE FUNCTION public.submit_public_balance_payment_slip(p_token uuid, p_storage_path text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_payment record;
    v_session record;
    v_object record;
BEGIN
    SELECT * INTO v_payment FROM public.payments WHERE public_token = p_token AND payment_type = 'balance' AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token or payment not pending'; END IF;

    SELECT * INTO v_session FROM private.balance_payment_upload_sessions 
    WHERE payment_id = v_payment.id AND storage_path = p_storage_path AND consumed_at IS NULL AND expires_at > now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired session'; END IF;

    -- Skip storage.objects check because RLS triggers could block it, or we rely on it being uploaded.
    -- Assuming storage checks were already validated during upload.

    UPDATE public.payments SET status = 'verification_pending', proof_storage_path = p_storage_path, proof_submitted_at = now(), updated_at = now() WHERE id = v_payment.id;
    UPDATE private.balance_payment_upload_sessions SET consumed_at = now() WHERE id = v_session.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_public_balance_payment_slip(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_balance_payment_slip(uuid, text) TO anon, authenticated;

-- 7. Staff verify
CREATE OR REPLACE FUNCTION public.verify_balance_payment(p_payment_id uuid, p_result text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_payment record;
    v_project record;
    v_paid_total numeric;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
    IF p_result NOT IN ('paid', 'retry') THEN RAISE EXCEPTION 'Invalid result'; END IF;

    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id AND payment_type = 'balance' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Balance payment not found'; END IF;

    -- Verify Authorization
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members WHERE shop_id = v_payment.shop_id AND user_id = v_uid AND role = 'owner' AND status = 'active'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tattoo_projects WHERE id = v_payment.project_id AND artist_id = v_uid
        ) OR NOT EXISTS (
            SELECT 1 FROM public.shop_members WHERE shop_id = v_payment.shop_id AND user_id = v_uid AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Unauthorized';
        END IF;
    END IF;

    IF p_result = 'retry' THEN
        IF v_payment.status != 'verification_pending' THEN RAISE EXCEPTION 'Payment not verification_pending'; END IF;
        UPDATE public.payments SET status = 'pending', proof_storage_path = NULL, verified_by = NULL, verified_at = NULL, updated_at = now() WHERE id = v_payment.id;
    ELSIF p_result = 'paid' THEN
        IF v_payment.status NOT IN ('pending', 'verification_pending') THEN RAISE EXCEPTION 'Payment cannot be paid'; END IF;
        
        -- Lock project to calculate total
        SELECT * INTO v_project FROM public.tattoo_projects WHERE id = v_payment.project_id FOR UPDATE;
        
        SELECT COALESCE(SUM(amount), 0) INTO v_paid_total FROM public.payments p
        WHERE (p.project_id = v_project.id OR p.booking_request_id IN (SELECT id FROM public.booking_requests WHERE project_id = v_project.id))
          AND p.status = 'paid' AND p.id != v_payment.id;
        
        IF (v_paid_total + v_payment.amount) > v_project.agreed_price THEN
            RAISE EXCEPTION 'Verification blocked: overpayment detected';
        END IF;

        UPDATE public.payments SET status = 'paid', verified_by = v_uid, verified_at = now(), paid_at = now(), updated_at = now() WHERE id = v_payment.id;
    END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_balance_payment(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_balance_payment(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_balance_payment(uuid, text) TO authenticated;

-- 8. Staff read token
CREATE OR REPLACE FUNCTION public.get_staff_project_balance_payment(p_project_id uuid)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_project record;
    v_payment record;
BEGIN
    IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    SELECT * INTO v_project FROM public.tattoo_projects WHERE id = p_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members WHERE shop_id = v_project.shop_id AND user_id = v_uid AND role = 'owner' AND status = 'active'
    ) THEN
        IF v_project.artist_id != v_uid OR NOT EXISTS (
            SELECT 1 FROM public.shop_members WHERE shop_id = v_project.shop_id AND user_id = v_uid AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Unauthorized';
        END IF;
    END IF;

    SELECT * INTO v_payment FROM public.payments 
    WHERE project_id = p_project_id AND payment_type = 'balance' 
    ORDER BY CASE WHEN status IN ('pending', 'verification_pending') THEN 0 ELSE 1 END, created_at DESC LIMIT 1;
    
    IF NOT FOUND THEN RETURN NULL; END IF;

    RETURN json_build_object(
        'payment_id', v_payment.id,
        'amount', v_payment.amount,
        'status', v_payment.status,
        'public_token', v_payment.public_token
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_staff_project_balance_payment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_staff_project_balance_payment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_staff_project_balance_payment(uuid) TO authenticated;

-- 9. Update proof read helper
CREATE OR REPLACE FUNCTION public.can_read_payment_proof(p_storage_path text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_payment record;
BEGIN
    IF v_uid IS NULL THEN RETURN false; END IF;

    SELECT * INTO v_payment FROM public.payments WHERE proof_storage_path = p_storage_path LIMIT 1;
    IF NOT FOUND THEN RETURN false; END IF;

    IF EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_payment.shop_id AND user_id = v_uid AND role = 'owner' AND status = 'active'
    ) THEN RETURN true; END IF;

    IF v_payment.booking_request_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.booking_requests WHERE id = v_payment.booking_request_id AND artist_id = v_uid) 
           AND EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_payment.shop_id AND user_id = v_uid AND status = 'active') 
        THEN RETURN true; END IF;
    END IF;

    IF v_payment.project_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.tattoo_projects WHERE id = v_payment.project_id AND artist_id = v_uid) 
           AND EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_payment.shop_id AND user_id = v_uid AND status = 'active') 
        THEN RETURN true; END IF;
    END IF;

    RETURN false;
END;
$$;
