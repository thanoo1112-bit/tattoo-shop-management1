-- Migration: Public artist RPC and fix flash design variants RLS policies for anon role
-- File: supabase/migrations/20260830020000_public_rpc_and_policies.sql

-- 1. Create secure public artist RPC to fetch artist info safely for anon users (includes shop_members settings)
CREATE OR REPLACE FUNCTION public.get_public_artist_by_id(p_shop_id uuid, p_artist_id uuid)
RETURNS TABLE (
    id uuid,
    full_name text,
    avatar_url text,
    accepts_color boolean,
    accepts_black_grey boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.full_name, p.avatar_url, sm.accepts_color, sm.accepts_black_grey
    FROM public.profiles p
    JOIN public.shop_members sm ON p.id = sm.user_id
    WHERE sm.shop_id = p_shop_id AND p.id = p_artist_id;
END;
$$;

-- Grant execute to anon and authenticated roles
REVOKE ALL ON FUNCTION public.get_public_artist_by_id(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artist_by_id(uuid, uuid) TO anon, authenticated;


-- 2. Split flash_design_variants SELECT policy to avoid 'permission denied' for anon on shop_members table
DROP POLICY IF EXISTS "Select Flash Design Variants" ON public.flash_design_variants;
DROP POLICY IF EXISTS "Select Flash Design Variants Anon" ON public.flash_design_variants;
DROP POLICY IF EXISTS "Select Flash Design Variants Auth" ON public.flash_design_variants;

-- Anon policy: only queries flash_designs (which is public)
CREATE POLICY "Select Flash Design Variants Anon" ON public.flash_design_variants 
    FOR SELECT TO anon
    USING (
        is_enabled = true AND EXISTS (
            SELECT 1 FROM public.flash_designs WHERE id = flash_design_variants.flash_design_id
        )
    );

-- Authenticated policy: queries both public flash_designs and joins shop_members (which authenticated role has SELECT grant on)
CREATE POLICY "Select Flash Design Variants Auth" ON public.flash_design_variants 
    FOR SELECT TO authenticated
    USING (
        (is_enabled = true AND EXISTS (
            SELECT 1 FROM public.flash_designs WHERE id = flash_design_variants.flash_design_id
        ))
        OR EXISTS (
            SELECT 1 FROM public.flash_designs fd
            JOIN public.shop_members sm ON sm.shop_id = fd.shop_id
            WHERE fd.id = flash_design_variants.flash_design_id
              AND sm.user_id = auth.uid()
              AND sm.role = 'owner'
              AND sm.status = 'active'
        )
    );

-- 3. Grant select and define public read policy for shop_booking_settings
GRANT SELECT ON TABLE public.shop_booking_settings TO anon, authenticated;
DROP POLICY IF EXISTS "Public read for shop booking settings" ON public.shop_booking_settings;
CREATE POLICY "Public read for shop booking settings" ON public.shop_booking_settings
    FOR SELECT TO anon, authenticated
    USING (true);
