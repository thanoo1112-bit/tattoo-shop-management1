-- Fix get_public_artist_color_options by removing invalid shops.status condition
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
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug;
    IF v_shop_id IS NULL THEN
        RETURN;
    END IF;

    SELECT accepts_black_grey, accepts_color 
    INTO v_accepts_black_grey, v_accepts_color
    FROM public.shop_members
    WHERE shop_id = v_shop_id 
      AND user_id = p_artist_id 
      AND role IN ('artist', 'owner')
      AND status = 'active';

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

-- Fix create_public_booking_upload_session by removing invalid shops.status condition
CREATE OR REPLACE FUNCTION public.create_public_booking_upload_session(
    p_shop_slug text,
    p_artist_id uuid,
    p_style_id uuid,
    p_color_mode text,
    p_work_type text
) RETURNS TABLE (
    session_id uuid,
    expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_shop_id uuid;
    v_session_id uuid;
    v_expires_at timestamptz;
    v_acc_bg boolean; v_acc_col boolean;
    v_acc_nw boolean; v_acc_ext boolean; v_acc_tu boolean; v_acc_cu boolean; v_acc_sc boolean;
BEGIN
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'Shop not found or inactive'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_shop_id AND user_id = p_artist_id AND role IN ('artist', 'owner') AND status = 'active') THEN
        RAISE EXCEPTION 'Artist not found or inactive in this shop';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.artist_tattoo_styles ats WHERE ats.shop_id = v_shop_id AND ats.artist_id = p_artist_id AND ats.style_id = p_style_id) THEN
        RAISE EXCEPTION 'Style not supported by artist';
    END IF;

    SELECT accepts_black_grey, accepts_color, accepts_new_work, accepts_extension, accepts_touch_up, accepts_cover_up, accepts_scar_cover
    INTO v_acc_bg, v_acc_col, v_acc_nw, v_acc_ext, v_acc_tu, v_acc_cu, v_acc_sc
    FROM public.shop_members 
    WHERE shop_id = v_shop_id AND user_id = p_artist_id AND role IN ('artist', 'owner') AND status = 'active';

    IF p_color_mode = 'black_grey' AND NOT v_acc_bg THEN RAISE EXCEPTION 'Artist rejects black_grey'; END IF;
    IF p_color_mode = 'color' AND NOT v_acc_col THEN RAISE EXCEPTION 'Artist rejects color'; END IF;
    
    IF p_work_type = 'new_work' AND NOT v_acc_nw THEN RAISE EXCEPTION 'Artist rejects new_work'; END IF;
    IF p_work_type = 'extension' AND NOT v_acc_ext THEN RAISE EXCEPTION 'Artist rejects extension'; END IF;
    IF p_work_type = 'touch_up' AND NOT v_acc_tu THEN RAISE EXCEPTION 'Artist rejects touch_up'; END IF;
    IF p_work_type = 'cover_up' AND NOT v_acc_cu THEN RAISE EXCEPTION 'Artist rejects cover_up'; END IF;
    IF p_work_type = 'scar_cover' AND NOT v_acc_sc THEN RAISE EXCEPTION 'Artist rejects scar_cover'; END IF;

    v_session_id := gen_random_uuid();
    v_expires_at := now() + interval '30 minutes';

    INSERT INTO private.public_booking_upload_sessions (id, shop_id, artist_id, style_id, color_mode, work_type, expires_at, status)
    VALUES (v_session_id, v_shop_id, p_artist_id, p_style_id, p_color_mode, p_work_type, v_expires_at, 'active');

    RETURN QUERY SELECT v_session_id, v_expires_at;
END;
$$;

-- Preserve Grants
REVOKE ALL ON FUNCTION public.get_public_artist_color_options(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artist_color_options(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text) TO anon;
