-- Migration: Owner Artist Management RPCs
-- Provides security definer helper functions for shop owners to manage operational artist settings.

-- 1. owner_update_artist_profile
CREATE OR REPLACE FUNCTION public.owner_update_artist_profile(
    p_shop_id uuid,
    p_artist_id uuid,
    p_display_name text,
    p_avatar_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
BEGIN
    -- Check if auth user is active owner of shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role IS NULL OR v_role != 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only active shop owners can update profiles';
    END IF;

    -- Verify target is a member of the shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = p_shop_id AND user_id = p_artist_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this shop';
    END IF;

    -- Input validation
    IF p_display_name IS NULL OR trim(p_display_name) = '' THEN
        RAISE EXCEPTION 'Display name cannot be empty';
    END IF;

    -- Update the profile
    UPDATE public.profiles
    SET full_name = trim(p_display_name),
        avatar_url = p_avatar_url,
        updated_at = now()
    WHERE id = p_artist_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_update_artist_profile(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_update_artist_profile(uuid, uuid, text, text) TO authenticated;

-- 2. owner_update_artist_color_settings
CREATE OR REPLACE FUNCTION public.owner_update_artist_color_settings(
    p_shop_id uuid,
    p_artist_id uuid,
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
    -- Check if auth user is active owner of shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role IS NULL OR v_role != 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only active shop owners can update color settings';
    END IF;

    -- Verify target is a member of the shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = p_shop_id AND user_id = p_artist_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this shop';
    END IF;

    -- Validate input
    IF NOT (p_accepts_black_grey OR p_accepts_color) THEN
        RAISE EXCEPTION 'Must accept at least one color setting';
    END IF;

    -- Update
    UPDATE public.shop_members
    SET accepts_black_grey = p_accepts_black_grey,
        accepts_color = p_accepts_color,
        updated_at = now()
    WHERE shop_id = p_shop_id AND user_id = p_artist_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_update_artist_color_settings(uuid, uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_update_artist_color_settings(uuid, uuid, boolean, boolean) TO authenticated;

-- 3. owner_update_artist_work_type_settings
CREATE OR REPLACE FUNCTION public.owner_update_artist_work_type_settings(
    p_shop_id uuid,
    p_artist_id uuid,
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
    -- Check if auth user is active owner of shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role IS NULL OR v_role != 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only active shop owners can update work type settings';
    END IF;

    -- Verify target is a member of the shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = p_shop_id AND user_id = p_artist_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this shop';
    END IF;

    -- Validate input
    IF NOT (p_accepts_new_work OR p_accepts_extension OR p_accepts_touch_up OR p_accepts_cover_up OR p_accepts_scar_cover) THEN
        RAISE EXCEPTION 'Must accept at least one work type';
    END IF;

    -- Update
    UPDATE public.shop_members
    SET accepts_new_work = p_accepts_new_work,
        accepts_extension = p_accepts_extension,
        accepts_touch_up = p_accepts_touch_up,
        accepts_cover_up = p_accepts_cover_up,
        accepts_scar_cover = p_accepts_scar_cover,
        updated_at = now()
    WHERE shop_id = p_shop_id AND user_id = p_artist_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_update_artist_work_type_settings(uuid, uuid, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_update_artist_work_type_settings(uuid, uuid, boolean, boolean, boolean, boolean, boolean) TO authenticated;

-- 4. owner_add_artist_specialty
CREATE OR REPLACE FUNCTION public.owner_add_artist_specialty(
    p_shop_id uuid,
    p_artist_id uuid,
    p_style_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_style_id uuid;
    v_clean_name text;
BEGIN
    -- Check if auth user is active owner of shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role IS NULL OR v_role != 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only active shop owners can manage specialties';
    END IF;

    -- Verify target is a member of the shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = p_shop_id AND user_id = p_artist_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this shop';
    END IF;

    v_clean_name := trim(p_style_name);
    IF length(v_clean_name) = 0 THEN
        RAISE EXCEPTION 'Style name cannot be empty';
    END IF;

    -- Find existing style or insert new
    SELECT id INTO v_style_id 
    FROM public.tattoo_styles 
    WHERE shop_id = p_shop_id AND lower(name) = lower(v_clean_name);

    IF v_style_id IS NULL THEN
        INSERT INTO public.tattoo_styles (shop_id, name, created_by)
        VALUES (p_shop_id, v_clean_name, auth.uid())
        RETURNING id INTO v_style_id;
    END IF;

    -- Insert relationship if not exists
    INSERT INTO public.artist_tattoo_styles (shop_id, artist_id, style_id)
    VALUES (p_shop_id, p_artist_id, v_style_id)
    ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_add_artist_specialty(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_add_artist_specialty(uuid, uuid, text) TO authenticated;

-- 5. owner_remove_artist_specialty
CREATE OR REPLACE FUNCTION public.owner_remove_artist_specialty(
    p_shop_id uuid,
    p_artist_id uuid,
    p_style_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
BEGIN
    -- Check if auth user is active owner of shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role IS NULL OR v_role != 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only active shop owners can manage specialties';
    END IF;

    -- Verify target is a member of the shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = p_shop_id AND user_id = p_artist_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this shop';
    END IF;

    -- Delete
    DELETE FROM public.artist_tattoo_styles
    WHERE shop_id = p_shop_id AND artist_id = p_artist_id AND style_id = p_style_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_remove_artist_specialty(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_remove_artist_specialty(uuid, uuid, uuid) TO authenticated;

-- 6. owner_update_artist_booking_settings (Availability default capacity)
CREATE OR REPLACE FUNCTION public.owner_update_artist_booking_settings(
    p_shop_id uuid,
    p_artist_id uuid,
    p_capacity integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
BEGIN
    -- Check if auth user is active owner of shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role IS NULL OR v_role != 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only active shop owners can manage booking settings';
    END IF;

    -- Verify target is a member of the shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = p_shop_id AND user_id = p_artist_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this shop';
    END IF;

    IF p_capacity < 0 THEN
        RAISE EXCEPTION 'Capacity cannot be negative';
    END IF;

    -- Upsert
    INSERT INTO public.artist_booking_settings (shop_id, artist_id, daily_capacity, updated_at)
    VALUES (p_shop_id, p_artist_id, p_capacity, now())
    ON CONFLICT (shop_id, artist_id)
    DO UPDATE SET daily_capacity = p_capacity, updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_update_artist_booking_settings(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_update_artist_booking_settings(uuid, uuid, integer) TO authenticated;

-- 7. owner_update_artist_daily_override (Availability daily overrides)
CREATE OR REPLACE FUNCTION public.owner_update_artist_daily_override(
    p_shop_id uuid,
    p_artist_id uuid,
    p_date date,
    p_capacity integer,
    p_is_closed boolean,
    p_remove boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
BEGIN
    -- Check if auth user is active owner of shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role IS NULL OR v_role != 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only active shop owners can manage daily overrides';
    END IF;

    -- Verify target is a member of the shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = p_shop_id AND user_id = p_artist_id
    ) THEN
        RAISE EXCEPTION 'Target user is not a member of this shop';
    END IF;

    IF p_remove THEN
        DELETE FROM public.artist_daily_overrides
        WHERE shop_id = p_shop_id AND artist_id = p_artist_id AND override_date = p_date;
    ELSE
        IF p_capacity < 0 THEN
            RAISE EXCEPTION 'Capacity cannot be negative';
        END IF;

        INSERT INTO public.artist_daily_overrides (shop_id, artist_id, override_date, capacity, is_closed, created_by, updated_at)
        VALUES (p_shop_id, p_artist_id, p_date, p_capacity, p_is_closed, auth.uid(), now())
        ON CONFLICT (shop_id, artist_id, override_date)
        DO UPDATE SET capacity = p_capacity, is_closed = p_is_closed, updated_at = now();
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.owner_update_artist_daily_override(uuid, uuid, date, integer, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_update_artist_daily_override(uuid, uuid, date, integer, boolean, boolean) TO authenticated;
