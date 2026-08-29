-- Migration: Fix Owner-as-Artist Profile Settings Capabilities
-- Redefines profile settings update functions to accept role IN ('artist', 'owner') instead of 'artist' only.

-- 1. Redefine update_my_artist_color_settings
CREATE OR REPLACE FUNCTION public.update_my_artist_color_settings(
    p_shop_id uuid,
    p_accepts_black_grey boolean,
    p_accepts_color boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
BEGIN
    -- Check if user is an active artist or owner in this shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role NOT IN ('artist', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Only active artists can update their color settings';
    END IF;

    -- Update the color settings
    UPDATE public.shop_members
    SET accepts_black_grey = p_accepts_black_grey,
        accepts_color = p_accepts_color
    WHERE shop_id = p_shop_id
      AND user_id = auth.uid();
END;
$$;

-- 2. Redefine update_my_artist_work_type_settings
CREATE OR REPLACE FUNCTION public.update_my_artist_work_type_settings(
    p_shop_id uuid,
    p_accepts_new_work boolean,
    p_accepts_extension boolean,
    p_accepts_touch_up boolean,
    p_accepts_cover_up boolean,
    p_accepts_scar_cover boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
BEGIN
    -- Check if user is an active artist or owner in this shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role NOT IN ('artist', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Only active artists can update their work type settings';
    END IF;

    -- Enforce constraint logically before DB error
    IF NOT (p_accepts_new_work OR p_accepts_extension OR p_accepts_touch_up OR p_accepts_cover_up OR p_accepts_scar_cover) THEN
        RAISE EXCEPTION 'Must accept at least one work type';
    END IF;

    -- Update the work type settings
    UPDATE public.shop_members
    SET accepts_new_work = p_accepts_new_work,
        accepts_extension = p_accepts_extension,
        accepts_touch_up = p_accepts_touch_up,
        accepts_cover_up = p_accepts_cover_up,
        accepts_scar_cover = p_accepts_scar_cover
    WHERE shop_id = p_shop_id
      AND user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_my_artist_work_type_settings(uuid, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_artist_work_type_settings(uuid, boolean, boolean, boolean, boolean, boolean) TO authenticated;

-- 3. Redefine add_my_artist_specialty
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
        AND role IN ('artist', 'owner')
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
