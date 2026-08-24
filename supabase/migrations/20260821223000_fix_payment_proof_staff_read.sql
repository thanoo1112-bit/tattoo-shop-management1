-- Fix Payment Proof Staff Read

-- 1. Helper Function
CREATE OR REPLACE FUNCTION public.can_read_payment_proof(p_storage_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_booking_id uuid;
    v_shop_id uuid;
    v_artist_id uuid;
    v_payment_proof_path text;
    v_is_authorized boolean := false;
BEGIN
    -- Require authentication
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;

    -- Look up the payment and booking using the actual proof path
    SELECT b.id, b.shop_id, b.artist_id, p.proof_storage_path
    INTO v_booking_id, v_shop_id, v_artist_id, v_payment_proof_path
    FROM public.payments p
    JOIN public.booking_requests b ON b.id = p.booking_request_id
    WHERE p.proof_storage_path = p_storage_path
    LIMIT 1;

    -- If no matching payment is found, or path doesn't match
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- A. Check if user is an active Owner of the shop
    IF EXISTS (
        SELECT 1 
        FROM public.shop_members sm
        WHERE sm.shop_id = v_shop_id 
          AND sm.user_id = v_uid 
          AND sm.role = 'owner'
          AND sm.status = 'active'
    ) THEN
        RETURN true;
    END IF;

    -- B. Check if user is the assigned Artist for this booking
    IF v_artist_id = v_uid THEN
        -- Verify the artist actually belongs to the shop and is active
        IF EXISTS (
            SELECT 1 
            FROM public.shop_members sm
            WHERE sm.shop_id = v_shop_id 
              AND sm.user_id = v_uid 
              AND sm.status = 'active'
        ) THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_payment_proof(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_payment_proof(text) TO authenticated;

-- 2. Drop the broken policy
DROP POLICY IF EXISTS "Staff reads payment proofs" ON storage.objects;

-- 3. Create the new policy using the helper
CREATE POLICY "Staff reads payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'payment-proofs' 
    AND public.can_read_payment_proof(name)
);
