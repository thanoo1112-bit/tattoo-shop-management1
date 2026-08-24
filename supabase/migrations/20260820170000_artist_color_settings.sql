-- Add color settings to shop_members
ALTER TABLE public.shop_members
ADD COLUMN accepts_black_grey BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN accepts_color BOOLEAN NOT NULL DEFAULT false;

-- Add check constraint to ensure at least one is true
ALTER TABLE public.shop_members
ADD CONSTRAINT check_at_least_one_color_setting 
CHECK (accepts_black_grey = true OR accepts_color = true);

-- Create RPC for public booking to get color options
CREATE OR REPLACE FUNCTION public.get_public_artist_color_options(
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
    v_accepts_black_grey boolean;
    v_accepts_color boolean;
BEGIN
    -- Get shop ID and ensure it's active
    SELECT id INTO v_shop_id
    FROM public.shops
    WHERE slug = p_shop_slug AND status = 'active';

    IF v_shop_id IS NULL THEN
        RETURN;
    END IF;

    -- Get settings for the active artist in this shop
    SELECT accepts_black_grey, accepts_color 
    INTO v_accepts_black_grey, v_accepts_color
    FROM public.shop_members
    WHERE shop_id = v_shop_id 
      AND user_id = p_artist_id 
      AND role = 'artist'
      AND status = 'active';

    -- Return options based on settings
    IF v_accepts_black_grey THEN
        value := 'black_grey';
        label := 'Black & Grey / ขาวดำ';
        RETURN NEXT;
    END IF;

    IF v_accepts_color THEN
        value := 'color';
        label := 'Color / งานสี';
        RETURN NEXT;
    END IF;
END;
$$;
