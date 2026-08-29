-- Migration: Fix create_public_booking_upload_session to handle nullable p_style_id properly
-- File: supabase/migrations/20260830040000_fix_public_booking_upload_session_null_style.sql

CREATE OR REPLACE FUNCTION public.create_public_booking_upload_session(
    p_shop_slug         text,
    p_artist_id         uuid,
    p_style_id          uuid,
    p_color_mode        text,
    p_work_type         text,
    p_flash_design_id   uuid DEFAULT NULL,
    p_hold_session_id   uuid DEFAULT NULL
) RETURNS TABLE (
    session_id  uuid,
    expires_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_shop_id       uuid;
    v_session_id    uuid;
    v_expires_at    timestamptz;
    v_acc_bg boolean; v_acc_col boolean;
    v_acc_nw boolean; v_acc_ext boolean; v_acc_tu boolean; v_acc_cu boolean; v_acc_sc boolean;
BEGIN
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'Shop not found'; END IF;

    -- FLASH SESSION CHECK (use IS NOT DISTINCT FROM for nullable style_id)
    IF p_flash_design_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.flash_designs
            WHERE id             = p_flash_design_id
              AND shop_id        = v_shop_id
              AND artist_id      = p_artist_id
              AND style_id       IS NOT DISTINCT FROM p_style_id
              AND status         != 'sold'
        ) THEN
            RAISE EXCEPTION 'แบบสัก Flash นี้ไม่สามารถจองได้ หรือจำหน่ายไปแล้ว';
        END IF;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = v_shop_id
          AND user_id = p_artist_id
          AND role IN ('artist', 'owner')
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Artist not found or inactive in this shop';
    END IF;

    -- Style support check (bypass if style is null / not specified)
    IF p_style_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.artist_tattoo_styles ats
        WHERE ats.shop_id   = v_shop_id
          AND ats.artist_id = p_artist_id
          AND ats.style_id  = p_style_id
    ) THEN
        RAISE EXCEPTION 'Style not supported by artist';
    END IF;

    SELECT accepts_black_grey, accepts_color, accepts_new_work, accepts_extension,
           accepts_touch_up, accepts_cover_up, accepts_scar_cover
    INTO v_acc_bg, v_acc_col, v_acc_nw, v_acc_ext, v_acc_tu, v_acc_cu, v_acc_sc
    FROM public.shop_members
    WHERE shop_id = v_shop_id
      AND user_id = p_artist_id
      AND role IN ('artist', 'owner')
      AND status = 'active';

    IF p_color_mode = 'black_grey' AND NOT v_acc_bg  THEN RAISE EXCEPTION 'Artist rejects black_grey'; END IF;
    IF p_color_mode = 'color'      AND NOT v_acc_col THEN RAISE EXCEPTION 'Artist rejects color'; END IF;
    IF p_work_type  = 'new_work'   AND NOT v_acc_nw  THEN RAISE EXCEPTION 'Artist rejects new_work'; END IF;
    IF p_work_type  = 'extension'  AND NOT v_acc_ext THEN RAISE EXCEPTION 'Artist rejects extension'; END IF;
    IF p_work_type  = 'touch_up'   AND NOT v_acc_tu  THEN RAISE EXCEPTION 'Artist rejects touch_up'; END IF;
    IF p_work_type  = 'cover_up'   AND NOT v_acc_cu  THEN RAISE EXCEPTION 'Artist rejects cover_up'; END IF;
    IF p_work_type  = 'scar_cover' AND NOT v_acc_sc  THEN RAISE EXCEPTION 'Artist rejects scar_cover'; END IF;

    v_session_id := gen_random_uuid();
    v_expires_at := now() + interval '30 minutes';

    INSERT INTO private.public_booking_upload_sessions
        (id, shop_id, artist_id, style_id, color_mode, work_type, expires_at, status, flash_design_id)
    VALUES
        (v_session_id, v_shop_id, p_artist_id, p_style_id, p_color_mode, p_work_type, v_expires_at, 'active', p_flash_design_id);

    RETURN QUERY SELECT v_session_id, v_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text, uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text, uuid, uuid)
    TO anon, authenticated;
