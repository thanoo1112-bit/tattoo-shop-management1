-- =============================================================================
-- Restore Artist Customer Scope Migration
-- Creates a SECURITY DEFINER helper function to verify staff access permission
-- and replaces the broad staff policy with a strict artist-isolation check.
-- =============================================================================

-- 1. Create SECURITY DEFINER helper function to check staff access
CREATE OR REPLACE FUNCTION public.can_staff_view_customer(
    p_shop_id uuid,
    p_customer_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid;
    v_role text;
    v_status text;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;

    -- Check active shop membership
    SELECT role, status INTO v_role, v_status
    FROM public.shop_members
    WHERE shop_id = p_shop_id AND user_id = v_uid
    LIMIT 1;

    -- If no active membership, deny access
    IF v_status IS NULL OR v_status <> 'active' THEN
        RETURN false;
    END IF;

    -- Owners can view all customers in their shop
    IF v_role = 'owner' THEN
        RETURN true;
    END IF;

    -- Artists can only view customers they have a relation with
    IF v_role = 'artist' THEN
        IF EXISTS (
            SELECT 1 FROM public.tattoo_projects
            WHERE shop_id = p_shop_id AND customer_id = p_customer_id AND artist_id = v_uid
        ) OR EXISTS (
            SELECT 1 FROM public.booking_requests
            WHERE shop_id = p_shop_id AND customer_id = p_customer_id AND artist_id = v_uid
        ) OR EXISTS (
            SELECT 1 FROM public.appointments
            WHERE shop_id = p_shop_id AND customer_id = p_customer_id AND artist_id = v_uid
        ) THEN
            RETURN true;
        END IF;
    END IF;

    RETURN false;
END;
$$;

-- Secure execution privileges
REVOKE ALL ON FUNCTION public.can_staff_view_customer(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_staff_view_customer(uuid, uuid) TO authenticated;

-- 2. Drop the temporary broad staff policy
DROP POLICY IF EXISTS "Staff sees all customers in their shop" ON public.customers;

-- 3. Create the strict staff select policy using the SECURITY DEFINER helper
CREATE POLICY "Staff select customers with scope check"
ON public.customers FOR SELECT
TO authenticated
USING (
    public.can_staff_view_customer(shop_id, id)
);
