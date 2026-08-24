-- Migration: Artist Specialties (Tattoo Styles)
-- Description: Adds tattoo_styles and artist_tattoo_styles for selecting artist specialties.

-- 1. CREATE tattoo_styles
CREATE TABLE public.tattoo_styles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop_id, name)
);

ALTER TABLE public.tattoo_styles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tattoo_styles FROM PUBLIC, anon, authenticated;
-- Owner management RPC will use SECURITY DEFINER, so we don't need direct table grants for now.

-- 2. CREATE artist_tattoo_styles
CREATE TABLE public.artist_tattoo_styles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    style_id uuid NOT NULL REFERENCES public.tattoo_styles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (artist_id, style_id)
);

ALTER TABLE public.artist_tattoo_styles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artist_tattoo_styles FROM PUBLIC, anon, authenticated;

-- 3. PUBLIC RPC TO GET ARTIST STYLES
CREATE OR REPLACE FUNCTION public.get_public_artist_tattoo_styles(
    p_shop_id uuid,
    p_artist_id uuid
) RETURNS TABLE (
    style_id uuid,
    style_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name
    FROM public.artist_tattoo_styles ats
    JOIN public.tattoo_styles s ON ats.style_id = s.id
    WHERE ats.shop_id = p_shop_id
      AND ats.artist_id = p_artist_id
      AND s.is_active = true
    ORDER BY s.sort_order ASC, s.name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_artist_tattoo_styles FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artist_tattoo_styles TO anon, authenticated;
