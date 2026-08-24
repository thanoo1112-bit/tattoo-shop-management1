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
    -- Check if user is an active artist in this shop
    SELECT role INTO v_role
    FROM public.shop_members
    WHERE shop_id = p_shop_id 
      AND user_id = auth.uid() 
      AND status = 'active';

    IF v_role != 'artist' THEN
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
