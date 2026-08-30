-- Capture and restore public.get_public_artists_by_shop_slug definition matching Production hotfix state
DROP FUNCTION IF EXISTS public.get_public_artists_by_shop_slug(text);

CREATE OR REPLACE FUNCTION public.get_public_artists_by_shop_slug(p_slug text)
 RETURNS TABLE(artist_id uuid, display_name text, avatar_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    RETURN QUERY
    SELECT p.id, p.full_name AS display_name, p.avatar_url
    FROM public.profiles p
    JOIN public.shop_members sm ON p.id = sm.user_id
    JOIN public.shops s ON sm.shop_id = s.id
    WHERE s.slug = p_slug AND sm.status = 'active' AND sm.role IN ('artist', 'owner');
END;
$function$;

-- Regrant permissions
REVOKE ALL ON FUNCTION public.get_public_artists_by_shop_slug(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artists_by_shop_slug(text) TO anon, authenticated;
