-- Migration: Fix Portfolio Storage Policy Roles
-- Limits portfolio-images write/edit/delete policies to the 'authenticated' role
-- to prevent anonymous users from crashing when uploading booking references.

-- 1. Recreate "Owner Upload Portfolio Images" TO authenticated
DROP POLICY IF EXISTS "Owner Upload Portfolio Images" ON storage.objects;
CREATE POLICY "Owner Upload Portfolio Images" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'portfolio-images'
        AND (EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = (pg_catalog.string_to_array(name, '/'))[1]::uuid
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        ))
    );

-- 2. Recreate "Owner Update Portfolio Images" TO authenticated
DROP POLICY IF EXISTS "Owner Update Portfolio Images" ON storage.objects;
CREATE POLICY "Owner Update Portfolio Images" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'portfolio-images'
        AND (EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = (pg_catalog.string_to_array(name, '/'))[1]::uuid
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        ))
    )
    WITH CHECK (
        bucket_id = 'portfolio-images'
        AND (EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = (pg_catalog.string_to_array(name, '/'))[1]::uuid
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        ))
    );

-- 3. Recreate "Owner Delete Portfolio Images" TO authenticated
DROP POLICY IF EXISTS "Owner Delete Portfolio Images" ON storage.objects;
CREATE POLICY "Owner Delete Portfolio Images" ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'portfolio-images'
        AND (EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = (pg_catalog.string_to_array(name, '/'))[1]::uuid
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        ))
    );
