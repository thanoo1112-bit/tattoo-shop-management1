-- 1. Add accepts_touch_up column
ALTER TABLE public.shop_members
ADD COLUMN accepts_touch_up BOOLEAN NOT NULL DEFAULT false;

-- 2. Migrate existing data: merge correction into cover_up
UPDATE public.shop_members
SET accepts_cover_up = (accepts_cover_up OR accepts_correction);

-- 3. Drop old constraint and column
ALTER TABLE public.shop_members
DROP CONSTRAINT check_at_least_one_work_type;

ALTER TABLE public.shop_members
DROP COLUMN accepts_correction;

-- 4. Add new constraint with touch_up instead of correction
ALTER TABLE public.shop_members
ADD CONSTRAINT check_at_least_one_work_type 
CHECK (accepts_new_work = true OR accepts_extension = true OR accepts_touch_up = true OR accepts_cover_up = true OR accepts_scar_cover = true);

-- 5. Drop old RPC because function signature changes
DROP FUNCTION IF EXISTS public.update_my_artist_work_type_settings(uuid, boolean, boolean, boolean, boolean, boolean);

-- 6. Create new secure RPC for update
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
    -- Check if user is an active artist in this shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role != 'artist' THEN
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

-- 7. Grant execution
REVOKE EXECUTE ON FUNCTION public.update_my_artist_work_type_settings(uuid, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_artist_work_type_settings(uuid, boolean, boolean, boolean, boolean, boolean) TO authenticated;


-- 8. Update read RPC
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
BEGIN
    -- Get shop ID
    SELECT id INTO v_shop_id
    FROM public.shops
    WHERE slug = p_shop_slug;

    IF v_shop_id IS NULL THEN
        RETURN;
    END IF;

    -- Get settings for the active artist in this shop
    SELECT accepts_new_work, accepts_extension, accepts_touch_up, accepts_cover_up, accepts_scar_cover
    INTO v_new_work, v_extension, v_touch_up, v_cover_up, v_scar_cover
    FROM public.shop_members
    WHERE shop_id = v_shop_id 
      AND user_id = p_artist_id 
      AND role = 'artist'
      AND status = 'active';

    -- Return options based on settings
    IF v_new_work THEN
        value := 'new_work';
        label := 'งานใหม่';
        RETURN NEXT;
    END IF;

    IF v_extension THEN
        value := 'extension';
        label := 'ต่อเติมงานเดิม';
        RETURN NEXT;
    END IF;
    
    IF v_touch_up THEN
        value := 'touch_up';
        label := 'เก็บงาน / เติมสี';
        RETURN NEXT;
    END IF;
    
    IF v_cover_up THEN
        value := 'cover_up';
        label := 'แก้ / ทับลายเดิม';
        RETURN NEXT;
    END IF;
    
    IF v_scar_cover THEN
        value := 'scar_cover';
        label := 'ทับรอยแผลเป็น';
        RETURN NEXT;
    END IF;
END;
$$;
