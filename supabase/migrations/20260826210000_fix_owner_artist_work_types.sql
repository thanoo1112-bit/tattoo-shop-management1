-- Migration: Fix get_public_artist_work_types to support Owner-as-Artist
-- Redefines the function to query role IN ('artist', 'owner') instead of only 'artist'.

CREATE OR REPLACE FUNCTION public.get_public_artist_work_types(
    p_shop_slug text,
    p_artist_id uuid
)
RETURNS TABLE (
    value text,
    label text
) 
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
    v_shop_id uuid;
    v_new_work boolean;
    v_extension boolean;
    v_touch_up boolean;
    v_cover_up boolean;
    v_scar_cover boolean;
    v_success boolean;
BEGIN
    -- Get shop ID
    SELECT id INTO v_shop_id
    FROM public.shops
    WHERE slug = p_shop_slug;

    IF v_shop_id IS NULL THEN
        RETURN;
    END IF;

    -- Get settings for the active artist (artist or owner role) in this shop
    SELECT accepts_new_work, accepts_extension, accepts_touch_up, accepts_cover_up, accepts_scar_cover
    INTO v_new_work, v_extension, v_touch_up, v_cover_up, v_scar_cover
    FROM public.shop_members
    WHERE shop_id = v_shop_id 
      AND user_id = p_artist_id 
      AND role IN ('artist', 'owner')
      AND status = 'active';

    -- Return options based on settings
    IF v_new_work THEN
        value := 'new_work';
        label := 'งานใหม่';
        RETURN NEXT;
    END IF;

    IF v_extension THEN
        value := 'extension';
        label := 'ต่อเติมลายเดิม';
        RETURN NEXT;
    END IF;

    IF v_touch_up THEN
        value := 'touch_up';
        label := 'เก็บงาน/เติมสี';
        RETURN NEXT;
    END IF;

    IF v_cover_up THEN
        value := 'cover_up';
        label := 'แก้/ทับลายเดิม';
        RETURN NEXT;
    END IF;

    IF v_scar_cover THEN
        value := 'scar_cover';
        label := 'สักทับรอยแผลเป็น';
        RETURN NEXT;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_artist_work_types(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_artist_work_types(text, uuid) TO anon, authenticated;
