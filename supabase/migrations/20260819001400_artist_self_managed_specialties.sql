-- Migration: Artist Self-Managed Specialties V1
-- Description: Foundation for artists to self-manage their tattoo styles.

-- 1. CREATE tattoo_styles
CREATE TABLE public.tattoo_styles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 100),
    created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive unique index to prevent duplicates like 'Blackwork' and 'blackwork' in the same shop
CREATE UNIQUE INDEX tattoo_styles_shop_id_lower_name_idx ON public.tattoo_styles (shop_id, lower(trim(name)));

ALTER TABLE public.tattoo_styles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tattoo_styles FROM PUBLIC, anon, authenticated;
-- Owner and Artist can read
CREATE POLICY "Shop members can read tattoo styles" 
ON public.tattoo_styles FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = tattoo_styles.shop_id 
        AND user_id = auth.uid() 
        AND status = 'active'
    )
);

-- 2. CREATE artist_tattoo_styles
CREATE TABLE public.artist_tattoo_styles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    style_id uuid NOT NULL REFERENCES public.tattoo_styles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop_id, artist_id, style_id)
);

ALTER TABLE public.artist_tattoo_styles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.artist_tattoo_styles FROM PUBLIC, anon, authenticated;
-- Owner and Artist can read assignments in their shop
CREATE POLICY "Shop members can read artist styles" 
ON public.artist_tattoo_styles FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = artist_tattoo_styles.shop_id 
        AND user_id = auth.uid() 
        AND status = 'active'
    )
);

-- 3. MUTATION: add_my_artist_specialty
CREATE OR REPLACE FUNCTION public.add_my_artist_specialty(
    p_shop_id uuid,
    p_style_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := (select auth.uid());
    v_style_id uuid;
    v_clean_name text;
BEGIN
    -- Validate auth
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- Validate membership
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id 
        AND user_id = v_uid 
        AND role = 'artist' 
        AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Not an active artist in this shop';
    END IF;

    -- Clean input
    v_clean_name := trim(p_style_name);
    IF length(v_clean_name) = 0 THEN
        RAISE EXCEPTION 'Style name cannot be empty';
    END IF;
    IF length(v_clean_name) > 100 THEN
        RAISE EXCEPTION 'Style name is too long';
    END IF;

    -- Find existing style (case-insensitive) or insert new
    SELECT id INTO v_style_id 
    FROM public.tattoo_styles 
    WHERE shop_id = p_shop_id AND lower(name) = lower(v_clean_name);

    IF v_style_id IS NULL THEN
        INSERT INTO public.tattoo_styles (shop_id, name, created_by)
        VALUES (p_shop_id, v_clean_name, v_uid)
        RETURNING id INTO v_style_id;
    END IF;

    -- Insert relationship if not exists
    INSERT INTO public.artist_tattoo_styles (shop_id, artist_id, style_id)
    VALUES (p_shop_id, v_uid, v_style_id)
    ON CONFLICT DO NOTHING;

END;
$$;
REVOKE ALL ON FUNCTION public.add_my_artist_specialty(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_my_artist_specialty(uuid, text) TO authenticated;

-- 4. MUTATION: remove_my_artist_specialty
CREATE OR REPLACE FUNCTION public.remove_my_artist_specialty(
    p_shop_id uuid,
    p_style_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := (select auth.uid());
BEGIN
    -- Validate auth
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    -- DELETE only junction row
    DELETE FROM public.artist_tattoo_styles
    WHERE shop_id = p_shop_id 
      AND artist_id = v_uid 
      AND style_id = p_style_id;

END;
$$;
REVOKE ALL ON FUNCTION public.remove_my_artist_specialty(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_my_artist_specialty(uuid, uuid) TO authenticated;


-- 5. READ: get_my_artist_specialties
CREATE OR REPLACE FUNCTION public.get_my_artist_specialties(
    p_shop_id uuid
) RETURNS TABLE (
    style_id uuid,
    name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := (select auth.uid());
BEGIN
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT s.id, s.name
    FROM public.artist_tattoo_styles ats
    JOIN public.tattoo_styles s ON ats.style_id = s.id
    WHERE ats.shop_id = p_shop_id
      AND ats.artist_id = v_uid
    ORDER BY s.name ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_artist_specialties(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_artist_specialties(uuid) TO authenticated;


-- 6. READ: get_artist_specialty_catalog
CREATE OR REPLACE FUNCTION public.get_artist_specialty_catalog(
    p_shop_id uuid
) RETURNS TABLE (
    style_id uuid,
    name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := (select auth.uid());
BEGIN
    -- Validate membership
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id 
        AND user_id = v_uid 
        AND status = 'active'
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT id, name
    FROM public.tattoo_styles
    WHERE shop_id = p_shop_id
    ORDER BY name ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_artist_specialty_catalog(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_specialty_catalog(uuid) TO authenticated;


-- 7. READ: get_public_artist_tattoo_styles
CREATE OR REPLACE FUNCTION public.get_public_artist_tattoo_styles(
    p_shop_slug text,
    p_artist_id uuid
) RETURNS TABLE (
    style_id uuid,
    name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_shop_id uuid;
BEGIN
    -- Find shop
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug;

    IF v_shop_id IS NULL THEN
        RETURN;
    END IF;

    -- Ensure artist is active in this shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_shop_id 
        AND user_id = p_artist_id 
        AND role = 'artist' 
        AND status = 'active'
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT s.id, s.name
    FROM public.artist_tattoo_styles ats
    JOIN public.tattoo_styles s ON ats.style_id = s.id
    WHERE ats.shop_id = v_shop_id
      AND ats.artist_id = p_artist_id
    ORDER BY s.name ASC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_public_artist_tattoo_styles(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artist_tattoo_styles(text, uuid) TO anon, authenticated;
