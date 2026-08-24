-- Migration: Add private booking reference read access for assigned artists and shop owners
-- Create helper function to authorize reading reference images associated with finalized projects.
-- This replaces the original overly restrictive "Staff reads tattoo references" policy that crashed on temp/ paths.

CREATE OR REPLACE FUNCTION private.can_read_booking_reference(
    p_bucket_id text,
    p_object_name text,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_project_id uuid;
    v_shop_id uuid;
    v_artist_id uuid;
    v_is_authorized boolean;
BEGIN
    -- Validate bucket ID
    IF p_bucket_id != 'tattoo-references' THEN
        RETURN false;
    END IF;

    -- Validate user ID
    IF p_user_id IS NULL THEN
        RETURN false;
    END IF;

    -- Verify the reference exists in finalized projects
    SELECT project_id, shop_id
    INTO v_project_id, v_shop_id
    FROM public.tattoo_project_references
    WHERE storage_path = p_object_name
    LIMIT 1;

    -- If no reference is linked, deny access (no access to orphan temp uploads)
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- Look up the project details
    SELECT artist_id
    INTO v_artist_id
    FROM public.tattoo_projects
    WHERE id = v_project_id;

    -- If project does not exist, deny access
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    -- 1. Assigned Artist Check
    IF v_artist_id = p_user_id THEN
        RETURN true;
    END IF;

    -- 2. Shop Owner Check
    SELECT EXISTS (
        SELECT 1
        FROM public.shop_members
        WHERE shop_id = v_shop_id
          AND user_id = p_user_id
          AND role = 'owner'
          AND status = 'active'
    ) INTO v_is_authorized;

    RETURN v_is_authorized;
END;
$$;

-- Secure the helper function
REVOKE EXECUTE ON FUNCTION private.can_read_booking_reference(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_booking_reference(text, text, uuid) TO authenticated;

-- Remove old restrictive / crashing SELECT policy
DROP POLICY IF EXISTS "Staff reads tattoo references" ON storage.objects;

-- Remove any previous iteration of the new policy
DROP POLICY IF EXISTS "Authorized staff can read finalized booking references" ON storage.objects;

-- Create Unified SELECT policy on storage.objects for authenticated staff
CREATE POLICY "Authorized staff can read finalized booking references"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'tattoo-references'
  AND private.can_read_booking_reference(
    bucket_id,
    name,
    auth.uid()
  )
);
