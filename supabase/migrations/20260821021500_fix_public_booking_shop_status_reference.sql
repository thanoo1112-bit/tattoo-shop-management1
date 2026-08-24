-- Migration: Fix invalid public.shops.status reference in public booking RPC
-- Root cause: create_public_booking_upload_session queried
--   WHERE slug = p_shop_slug AND status = 'active'
-- but public.shops has no status column (column never existed in any migration).
-- Fix: remove AND status = 'active' predicate; shop validity is proven by slug existence alone.
-- Artist activity is enforced separately via shop_members.status = 'active'.
--
-- Affected function: public.create_public_booking_upload_session
-- NOT affected:      public.finalize_public_booking (uses v_session.shop_id UUID directly, never queries public.shops by slug)
-- NOT affected:      any other currently callable RPC (none reference public.shops.status)
--
-- DO NOT add public.shops.status column -- no shop status lifecycle exists in this schema.

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
    v_acc_bg boolean;
    v_acc_col boolean;
    v_acc_nw boolean;
    v_acc_ext boolean;
    v_acc_tu boolean;
    v_acc_cu boolean;
    v_acc_sc boolean;
BEGIN
    -- Shop lookup: slug existence only.
    -- public.shops has no status column; shop validity = slug exists.
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'Shop not found'; END IF;

    -- Artist must be an active member of this shop.
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = v_shop_id
          AND user_id = p_artist_id
          AND role = 'artist'
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Artist not found or inactive in this shop';
    END IF;

    -- Style must be accepted by this artist in this shop.
    IF NOT EXISTS (
        SELECT 1 FROM public.artist_tattoo_styles ats
        WHERE ats.shop_id = v_shop_id
          AND ats.artist_id = p_artist_id
          AND ats.style_id = p_style_id
    ) THEN
        RAISE EXCEPTION 'Style not supported by artist';
    END IF;

    -- Load artist colour and work-type settings.
    SELECT
        accepts_black_grey,
        accepts_color,
        accepts_new_work,
        accepts_extension,
        accepts_touch_up,
        accepts_cover_up,
        accepts_scar_cover
    INTO
        v_acc_bg, v_acc_col,
        v_acc_nw, v_acc_ext, v_acc_tu, v_acc_cu, v_acc_sc
    FROM public.shop_members
    WHERE shop_id = v_shop_id
      AND user_id = p_artist_id
      AND role = 'artist'
      AND status = 'active';

    -- Colour mode validation.
    IF p_color_mode = 'black_grey' AND NOT v_acc_bg THEN RAISE EXCEPTION 'Artist rejects black_grey'; END IF;
    IF p_color_mode = 'color'      AND NOT v_acc_col THEN RAISE EXCEPTION 'Artist rejects color';     END IF;

    -- Work type validation.
    IF p_work_type = 'new_work'   AND NOT v_acc_nw  THEN RAISE EXCEPTION 'Artist rejects new_work';  END IF;
    IF p_work_type = 'extension'  AND NOT v_acc_ext THEN RAISE EXCEPTION 'Artist rejects extension'; END IF;
    IF p_work_type = 'touch_up'   AND NOT v_acc_tu  THEN RAISE EXCEPTION 'Artist rejects touch_up';  END IF;
    IF p_work_type = 'cover_up'   AND NOT v_acc_cu  THEN RAISE EXCEPTION 'Artist rejects cover_up';  END IF;
    IF p_work_type = 'scar_cover' AND NOT v_acc_sc  THEN RAISE EXCEPTION 'Artist rejects scar_cover'; END IF;

    -- Create session (30-minute expiry).
    v_session_id := gen_random_uuid();
    v_expires_at := now() + interval '30 minutes';

    INSERT INTO private.public_booking_upload_sessions
        (id, shop_id, artist_id, style_id, color_mode, work_type, expires_at, status)
    VALUES
        (v_session_id, v_shop_id, p_artist_id, p_style_id, p_color_mode, p_work_type, v_expires_at, 'active');

    RETURN QUERY SELECT v_session_id, v_expires_at;
END;
$$;

-- Preserve exact privilege model from original migration.
REVOKE ALL ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text) TO anon;
