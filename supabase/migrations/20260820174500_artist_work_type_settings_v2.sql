-- Add work type settings to shop_members
ALTER TABLE public.shop_members
ADD COLUMN accepts_new_work BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN accepts_extension BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN accepts_correction BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN accepts_cover_up BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN accepts_scar_cover BOOLEAN NOT NULL DEFAULT false;

-- Add check constraint to ensure at least one work type is true
ALTER TABLE public.shop_members
ADD CONSTRAINT check_at_least_one_work_type 
CHECK (accepts_new_work = true OR accepts_extension = true OR accepts_correction = true OR accepts_cover_up = true OR accepts_scar_cover = true);

-- Create secure RPC for artist to update their own work type settings
CREATE OR REPLACE FUNCTION public.update_my_artist_work_type_settings(
    p_shop_id uuid,
    p_accepts_new_work boolean,
    p_accepts_extension boolean,
    p_accepts_correction boolean,
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
    IF NOT (p_accepts_new_work OR p_accepts_extension OR p_accepts_correction OR p_accepts_cover_up OR p_accepts_scar_cover) THEN
        RAISE EXCEPTION 'Must accept at least one work type';
    END IF;

    -- Update the work type settings
    UPDATE public.shop_members
    SET accepts_new_work = p_accepts_new_work,
        accepts_extension = p_accepts_extension,
        accepts_correction = p_accepts_correction,
        accepts_cover_up = p_accepts_cover_up,
        accepts_scar_cover = p_accepts_scar_cover
    WHERE shop_id = p_shop_id
      AND user_id = auth.uid();
END;
$$;

-- Revoke default public execution and grant to authenticated
REVOKE EXECUTE ON FUNCTION public.update_my_artist_work_type_settings(uuid, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_artist_work_type_settings(uuid, boolean, boolean, boolean, boolean, boolean) TO authenticated;


-- Create secure RPC for public booking to get artist work types
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
    v_correction boolean;
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
    SELECT accepts_new_work, accepts_extension, accepts_correction, accepts_cover_up, accepts_scar_cover
    INTO v_new_work, v_extension, v_correction, v_cover_up, v_scar_cover
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
    
    IF v_correction THEN
        value := 'correction';
        label := 'แก้ไขลายเดิม';
        RETURN NEXT;
    END IF;
    
    IF v_cover_up THEN
        value := 'cover_up';
        label := 'ทับลายเดิม';
        RETURN NEXT;
    END IF;
    
    IF v_scar_cover THEN
        value := 'scar_cover';
        label := 'งานทับรอยแผลเป็น';
        RETURN NEXT;
    END IF;
END;
$$;

-- Revoke default public execution
REVOKE EXECUTE ON FUNCTION public.get_public_artist_work_types(text, uuid) FROM PUBLIC;

-- Explicitly grant execution to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_public_artist_work_types(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_artist_work_types(text, uuid) TO authenticated;
