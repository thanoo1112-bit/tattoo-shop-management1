-- Migration: Promotion System V1
-- Creates public.promotions table and alters public.tattoo_projects and RPCs.

-- 1. Create Promotions Table
CREATE TABLE public.promotions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 100),
    description text,
    discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value numeric NOT NULL CHECK (
        (discount_type = 'percentage' AND discount_value > 0 AND discount_value <= 100) OR
        (discount_type = 'fixed' AND discount_value > 0)
    ),
    applies_to text NOT NULL CHECK (applies_to IN ('all', 'custom', 'flash')),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (starts_at < ends_at)
);

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policies for promotions
CREATE POLICY "Public Read Active Promotions" ON public.promotions
    FOR SELECT TO anon, authenticated
    USING (is_active = true AND starts_at <= now() AND ends_at >= now());

CREATE POLICY "Owner CRUD promotions" ON public.promotions
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = promotions.shop_id
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = promotions.shop_id
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        )
    );

-- 3. Overlap Protection Trigger
CREATE OR REPLACE FUNCTION public.trg_promotions_overlap_check()
RETURNS trigger AS $$
BEGIN
    IF NEW.is_active = true THEN
        IF EXISTS (
            SELECT 1 FROM public.promotions
            WHERE id != NEW.id
              AND shop_id = NEW.shop_id
              AND is_active = true
              AND tsrange(starts_at, ends_at) && tsrange(NEW.starts_at, NEW.ends_at)
              AND (
                  applies_to = NEW.applies_to
                  OR NEW.applies_to = 'all'
                  OR applies_to = 'all'
              )
        ) THEN
            RAISE EXCEPTION 'Overlapping active promotions are not allowed for the same scope.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER promotions_overlap_check_trigger
BEFORE INSERT OR UPDATE ON public.promotions
FOR EACH ROW
EXECUTE FUNCTION public.trg_promotions_overlap_check();

-- 4. Alter tattoo_projects table with snapshot columns
ALTER TABLE public.tattoo_projects
    ADD COLUMN original_price numeric CHECK (original_price >= 0),
    ADD COLUMN promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL,
    ADD COLUMN promotion_name_snapshot text,
    ADD COLUMN discount_type_snapshot text,
    ADD COLUMN discount_value_snapshot numeric,
    ADD COLUMN discount_amount numeric CHECK (discount_amount >= 0);

-- 5. Alter booking_requests and upload_sessions tables
ALTER TABLE public.booking_requests
    ADD COLUMN eligible_promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL;

ALTER TABLE private.public_booking_upload_sessions
    ADD COLUMN promotion_id uuid REFERENCES public.promotions(id) ON DELETE SET NULL;

-- 6. Helper RPC to resolve public promotions
CREATE OR REPLACE FUNCTION public.get_public_promotions_by_shop_slug(p_slug text)
RETURNS TABLE (
    id uuid,
    name text,
    description text,
    discount_type text,
    discount_value numeric,
    applies_to text,
    starts_at timestamptz,
    ends_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, p.description, p.discount_type, p.discount_value, p.applies_to, p.starts_at, p.ends_at
    FROM public.promotions p
    JOIN public.shops s ON p.shop_id = s.id
    WHERE s.slug = p_slug
      AND p.is_active = true
      AND p.starts_at <= now()
      AND p.ends_at >= now();
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_promotions_by_shop_slug(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_promotions_by_shop_slug(text) TO anon, authenticated;

-- 7. Update create_public_booking_upload_session to capture promotion
CREATE OR REPLACE FUNCTION public.create_public_booking_upload_session(
    p_shop_slug         text,
    p_artist_id         uuid,
    p_color_mode        text,
    p_work_type         text,
    p_style_id          uuid DEFAULT NULL,
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
    v_style_id      uuid := p_style_id;
    v_promo_id      uuid;
    v_applies_to    text;
BEGIN
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'Shop not found'; END IF;

    -- FLASH SESSION OWNERSHIP CHECK
    IF p_flash_design_id IS NOT NULL THEN
        IF p_hold_session_id IS NULL THEN
            RAISE EXCEPTION 'Flash booking requires p_hold_session_id';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.flash_designs
            WHERE id             = p_flash_design_id
              AND shop_id        = v_shop_id
              AND artist_id      = p_artist_id
              AND status         = 'held'
              AND held_by_session_id = p_hold_session_id
              AND held_expires_at > now()
        ) THEN
            RAISE EXCEPTION 'Flash design is not held by this session or hold has expired';
        END IF;
        
        SELECT style_id INTO v_style_id FROM public.flash_designs WHERE id = p_flash_design_id;
        v_applies_to := 'flash';
    ELSE
        IF v_style_id IS NULL THEN
            RAISE EXCEPTION 'Style is required for custom booking';
        END IF;
        v_applies_to := 'custom';
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

    IF p_flash_design_id IS NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.artist_tattoo_styles ats
            WHERE ats.shop_id   = v_shop_id
              AND ats.artist_id = p_artist_id
              AND ats.style_id  = v_style_id
        ) THEN
            RAISE EXCEPTION 'Style not supported by artist';
        END IF;
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

    -- Resolve qualifying active promotion (highest discount first)
    SELECT id INTO v_promo_id
    FROM public.promotions
    WHERE shop_id = v_shop_id
      AND is_active = true
      AND starts_at <= now()
      AND ends_at >= now()
      AND (applies_to = v_applies_to OR applies_to = 'all')
    ORDER BY (CASE WHEN discount_type = 'percentage' THEN discount_value * 50 ELSE discount_value END) DESC
    LIMIT 1;

    v_session_id := gen_random_uuid();
    v_expires_at := now() + interval '30 minutes';

    INSERT INTO private.public_booking_upload_sessions
        (id, shop_id, artist_id, style_id, color_mode, work_type, expires_at, status, flash_design_id, promotion_id)
    VALUES
        (v_session_id, v_shop_id, p_artist_id, v_style_id, p_color_mode, p_work_type, v_expires_at, 'active', p_flash_design_id, v_promo_id);

    -- Extend hold duration to 30 min to match upload session
    IF p_flash_design_id IS NOT NULL THEN
        UPDATE public.flash_designs
        SET held_expires_at = v_expires_at,
            updated_at      = now()
        WHERE id                   = p_flash_design_id
          AND held_by_session_id   = p_hold_session_id;
    END IF;

    RETURN QUERY SELECT v_session_id, v_expires_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_public_booking_upload_session(text, uuid, text, text, uuid, uuid, uuid) TO anon, authenticated;

-- 8. Update finalize_public_booking to handle Flash and Custom promotion snapshots
CREATE OR REPLACE FUNCTION public.finalize_public_booking(
    p_session_id                    uuid,
    p_width_cm                      numeric,
    p_height_cm                     numeric,
    p_placement                     text,
    p_description                   text,
    p_full_name                     text,
    p_phone                         text,
    p_email                         text,
    p_health_note                   text,
    p_requested_date                text,
    p_requested_time                text,
    p_real_area_paths               text[],
    p_design_ref_paths              text[],
    p_terms_accepted                boolean,
    p_is_first_tattoo               boolean DEFAULT NULL,
    p_safety_notice_acknowledged    boolean DEFAULT NULL,
    p_flash_design_id               uuid    DEFAULT NULL,
    p_hold_session_id               uuid    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_session           record;
    v_customer_id       uuid;
    v_project_id        uuid;
    v_booking_id        uuid;
    v_public_token      uuid;
    v_style_name        text;
    v_width_val         numeric := p_width_cm;
    v_height_val        numeric := p_height_cm;
    v_acc_bg boolean; v_acc_col boolean; v_acc_nw boolean; v_acc_ext boolean;
    v_acc_tu boolean; v_acc_cu boolean; v_acc_sc boolean;
    v_effective_cap     int;
    v_occupied_cap      int;
    v_is_closed         boolean;
    v_area              numeric;
    v_max_dim           numeric;
    v_buffer_hours      int;
    v_time_decimal      numeric;
    v_req_hour          int;
    v_req_minute        int;
    v_requested_start_at timestamptz;
    v_requested_end_at  timestamptz;
    v_phone_norm        text;
    v_email_val         text;
    v_real_count        int;
    v_design_count      int;
    v_total_paths       int;
    v_distinct_paths    int;
    v_all_paths         text[];
    v_path              text;
    v_meta_mime         text;
    v_expected_prefix   text;
    v_tracking_code     text;
    v_success           boolean;
    v_flash_price       numeric;
    v_flash_size        text;
    v_flash_artist_id   uuid;
    v_flash_style_id    uuid;
    
    -- Promotion variables
    v_promo             record;
    v_discount_amount   numeric := 0;
    v_final_price       numeric;
BEGIN
    IF p_safety_notice_acknowledged IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Safety notice must be acknowledged';
    END IF;

    IF v_width_val  <= 0 THEN v_width_val  := 5; END IF;
    IF v_height_val <= 0 THEN v_height_val := 5; END IF;

    v_phone_norm := regexp_replace(p_phone, '\D', '', 'g');
    IF length(v_phone_norm) < 9 THEN RAISE EXCEPTION 'Invalid phone'; END IF;

    v_email_val := NULLIF(btrim(p_email), '');

    SELECT * INTO v_session FROM private.public_booking_upload_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid session'; END IF;
    IF v_session.status = 'consumed' THEN
        SELECT public_token INTO v_public_token
        FROM public.booking_requests WHERE id = v_session.booking_request_id;
        IF v_public_token IS NULL THEN RAISE EXCEPTION 'Session consumed but booking not found'; END IF;
        RETURN v_public_token;
    END IF;
    IF v_session.expires_at < now() THEN RAISE EXCEPTION 'Session expired'; END IF;

    -- ===== FLASH VALIDATION =====
    IF p_flash_design_id IS NOT NULL THEN
        IF v_session.flash_design_id IS DISTINCT FROM p_flash_design_id THEN
            RAISE EXCEPTION 'Session flash mismatch';
        END IF;

        SELECT price, size, artist_id, style_id, style_name
        INTO v_flash_price, v_flash_size, v_flash_artist_id, v_flash_style_id, v_style_name
        FROM public.flash_designs
        WHERE id = p_flash_design_id
          AND status = 'held'
          AND (
              p_hold_session_id IS NULL
              OR held_by_session_id = p_hold_session_id
          )
          AND held_expires_at > now();

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Flash hold has expired or was taken by another session';
        END IF;

        IF v_session.artist_id IS DISTINCT FROM v_flash_artist_id THEN
            RAISE EXCEPTION 'Flash artist mismatch';
        END IF;
    ELSE
        -- Custom Booking
        IF v_session.style_id IS NULL THEN
            RAISE EXCEPTION 'Style is required';
        END IF;
        SELECT name INTO v_style_name FROM public.tattoo_styles WHERE id = v_session.style_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = v_session.shop_id
          AND user_id = v_session.artist_id
          AND role IN ('artist', 'owner')
          AND status = 'active'
    ) THEN RAISE EXCEPTION 'Artist not active'; END IF;

    -- Validate style support for custom booking only
    IF p_flash_design_id IS NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.artist_tattoo_styles ats
            WHERE ats.shop_id   = v_session.shop_id
              AND ats.artist_id = v_session.artist_id
              AND ats.style_id  = v_session.style_id
        ) THEN RAISE EXCEPTION 'Style not supported by artist'; END IF;
    END IF;

    SELECT accepts_black_grey, accepts_color, accepts_new_work, accepts_extension,
           accepts_touch_up, accepts_cover_up, accepts_scar_cover
    INTO v_acc_bg, v_acc_col, v_acc_nw, v_acc_ext, v_acc_tu, v_acc_cu, v_acc_sc
    FROM public.shop_members
    WHERE shop_id = v_session.shop_id
      AND user_id = v_session.artist_id
      AND role IN ('artist', 'owner')
      AND status = 'active';

    IF v_session.color_mode = 'black_grey' AND NOT v_acc_bg  THEN RAISE EXCEPTION 'Artist rejects black_grey'; END IF;
    IF v_session.color_mode = 'color'      AND NOT v_acc_col THEN RAISE EXCEPTION 'Artist rejects color'; END IF;
    IF v_session.work_type  = 'new_work'   AND NOT v_acc_nw  THEN RAISE EXCEPTION 'Artist rejects new_work'; END IF;
    IF v_session.work_type  = 'extension'  AND NOT v_acc_ext THEN RAISE EXCEPTION 'Artist rejects extension'; END IF;
    IF v_session.work_type  = 'touch_up'   AND NOT v_acc_tu  THEN RAISE EXCEPTION 'Artist rejects touch_up'; END IF;
    IF v_session.work_type  = 'cover_up'   AND NOT v_acc_cu  THEN RAISE EXCEPTION 'Artist rejects cover_up'; END IF;
    IF v_session.work_type  = 'scar_cover' AND NOT v_acc_sc  THEN RAISE EXCEPTION 'Artist rejects scar_cover'; END IF;

    v_area    := v_width_val * v_height_val;
    v_max_dim := GREATEST(v_width_val, v_height_val);
    IF    v_max_dim <= 5  AND v_area <= 25  THEN v_buffer_hours := 2;
    ELSIF v_max_dim <= 10 AND v_area <= 75  THEN v_buffer_hours := 3;
    ELSIF v_max_dim <= 15 AND v_area <= 150 THEN v_buffer_hours := 4;
    ELSIF v_max_dim <= 25 AND v_area <= 350 THEN v_buffer_hours := 6;
    ELSE                                         v_buffer_hours := 8; END IF;

    v_req_minute := extract(minute from p_requested_time::time);
    IF v_req_minute NOT IN (0, 30) THEN RAISE EXCEPTION 'Invalid time boundary'; END IF;

    v_req_hour     := extract(hour from p_requested_time::time);
    v_time_decimal := v_req_hour + (v_req_minute / 60.0);
    IF v_time_decimal < 10.0 OR v_time_decimal > (23.5 - v_buffer_hours) THEN
        RAISE EXCEPTION 'Requested time is outside store hours or buffer limit';
    END IF;

    SELECT effective_capacity, is_closed INTO v_effective_cap, v_is_closed
    FROM public.get_effective_daily_capacity(v_session.shop_id, v_session.artist_id, p_requested_date::date);

    IF v_is_closed THEN RAISE EXCEPTION 'Shop/Artist is closed on this date'; END IF;

    SELECT public.get_occupied_daily_capacity(v_session.shop_id, v_session.artist_id, p_requested_date::date)
    INTO v_occupied_cap;

    IF v_effective_cap > 0 AND v_occupied_cap >= v_effective_cap THEN
        RAISE EXCEPTION 'Daily capacity is FULL';
    END IF;

    v_real_count   := COALESCE(array_length(p_real_area_paths, 1), 0);
    v_design_count := COALESCE(array_length(p_design_ref_paths, 1), 0);

    IF v_real_count   > 5 THEN RAISE EXCEPTION 'Max 5 real area photos'; END IF;
    IF v_design_count > 5 THEN RAISE EXCEPTION 'Max 5 design photos'; END IF;
    IF (v_real_count + v_design_count) > 10 THEN RAISE EXCEPTION 'Max 10 total photos'; END IF;

    IF v_session.work_type IN ('extension', 'touch_up', 'cover_up', 'scar_cover') THEN
        IF v_real_count < 1 THEN RAISE EXCEPTION 'Real area photo required for this work type'; END IF;
    END IF;

    v_all_paths := COALESCE(p_real_area_paths, ARRAY[]::text[]) || COALESCE(p_design_ref_paths, ARRAY[]::text[]);
    SELECT count(*), count(DISTINCT p) INTO v_total_paths, v_distinct_paths FROM unnest(v_all_paths) p;
    IF v_total_paths != v_distinct_paths THEN RAISE EXCEPTION 'Duplicate storage paths detected'; END IF;

    v_expected_prefix := 'temp/' || p_session_id || '/';
    FOREACH v_path IN ARRAY v_all_paths LOOP
        IF v_path NOT LIKE (v_expected_prefix || '%') THEN RAISE EXCEPTION 'Invalid path'; END IF;
        IF NOT EXISTS (
            SELECT 1 FROM storage.objects WHERE bucket_id = 'tattoo-references' AND name = v_path
        ) THEN
            RAISE EXCEPTION 'File missing: %', v_path;
        END IF;
    END LOOP;

    INSERT INTO public.customers (shop_id, full_name, phone_normalized, email, source)
    VALUES (v_session.shop_id, btrim(p_full_name), v_phone_norm, v_email_val, 'online')
    ON CONFLICT (shop_id, phone_normalized) DO UPDATE SET
        full_name  = COALESCE(EXCLUDED.full_name, public.customers.full_name),
        email      = COALESCE(EXCLUDED.email, public.customers.email),
        updated_at = now()
    RETURNING id INTO v_customer_id;

    -- ===== PROMOTION CALCULATION FOR FLASH =====
    IF p_flash_design_id IS NOT NULL THEN
        IF v_session.promotion_id IS NOT NULL THEN
            SELECT * INTO v_promo FROM public.promotions WHERE id = v_session.promotion_id;
            IF FOUND THEN
                IF v_promo.discount_type = 'percentage' THEN
                    v_discount_amount := round(v_flash_price * v_promo.discount_value / 100);
                ELSE
                    v_discount_amount := least(v_promo.discount_value, v_flash_price);
                END IF;
                v_final_price := greatest(v_flash_price - v_discount_amount, 0);
            ELSE
                v_final_price := v_flash_price;
            END IF;
        ELSE
            v_final_price := v_flash_price;
        END IF;

        -- Flash booking: agreed price snapshot, size_note snapshot, width/height left as NULL.
        INSERT INTO public.tattoo_projects (
            shop_id, customer_id, artist_id, style_id, tattoo_style, color_mode, work_type,
            width_cm, height_cm, body_placement, description, name, status,
            agreed_price, size_note, flash_design_id, original_price, promotion_id,
            promotion_name_snapshot, discount_type_snapshot, discount_value_snapshot, discount_amount
        )
        VALUES (
            v_session.shop_id, v_customer_id, v_session.artist_id, v_flash_style_id,
            v_style_name, v_session.color_mode, v_session.work_type,
            NULL, NULL, btrim(p_placement), btrim(p_description),
            'Flash Booking Request', 'proposed',
            v_final_price, 'Flash Size: ' || v_flash_size, p_flash_design_id, v_flash_price, v_session.promotion_id,
            v_promo.name, v_promo.discount_type, v_promo.discount_value, v_discount_amount
        )
        RETURNING id INTO v_project_id;
    ELSE
        -- Custom booking
        INSERT INTO public.tattoo_projects (
            shop_id, customer_id, artist_id, style_id, tattoo_style, color_mode, work_type,
            width_cm, height_cm, body_placement, description, name, status
        )
        VALUES (
            v_session.shop_id, v_customer_id, v_session.artist_id, v_session.style_id,
            v_style_name, v_session.color_mode, v_session.work_type,
            v_width_val, v_height_val, btrim(p_placement), btrim(p_description),
            'Public Booking Request', 'proposed'
        )
        RETURNING id INTO v_project_id;
    END IF;

    FOREACH v_path IN ARRAY COALESCE(p_real_area_paths, ARRAY[]::text[]) LOOP
        SELECT COALESCE(metadata->>'mimetype', 'application/octet-stream') INTO v_meta_mime
        FROM storage.objects WHERE bucket_id = 'tattoo-references' AND name = v_path LIMIT 1;
        IF v_meta_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
            RAISE EXCEPTION 'Invalid MIME type for image';
        END IF;
        INSERT INTO public.tattoo_project_references
            (shop_id, project_id, storage_path, file_name, mime_type, reference_type)
        VALUES
            (v_session.shop_id, v_project_id, v_path, v_path, v_meta_mime, 'real_area');
    END LOOP;

    FOREACH v_path IN ARRAY COALESCE(p_design_ref_paths, ARRAY[]::text[]) LOOP
        SELECT COALESCE(metadata->>'mimetype', 'application/octet-stream') INTO v_meta_mime
        FROM storage.objects WHERE bucket_id = 'tattoo-references' AND name = v_path LIMIT 1;
        IF v_meta_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
            RAISE EXCEPTION 'Invalid MIME type for image';
        END IF;
        INSERT INTO public.tattoo_project_references
            (shop_id, project_id, storage_path, file_name, mime_type, reference_type)
        VALUES
            (v_session.shop_id, v_project_id, v_path, v_path, v_meta_mime, 'design_reference');
    END LOOP;

    v_requested_start_at := (p_requested_date || ' ' || p_requested_time)::timestamp AT TIME ZONE 'Asia/Bangkok';
    v_requested_end_at   := v_requested_start_at + interval '1 hour';

    v_success := false;
    WHILE NOT v_success LOOP
        v_tracking_code := private.generate_secure_tracking_code();
        BEGIN
            INSERT INTO public.booking_requests (
                shop_id, project_id, customer_id, artist_id,
                requested_start_at, requested_end_at, status,
                submitted_full_name, submitted_phone, submitted_email,
                health_note, is_first_tattoo, safety_notice_acknowledged,
                terms_accepted_at, terms_version, tracking_code, flash_design_id, eligible_promotion_id
            )
            VALUES (
                v_session.shop_id, v_project_id, v_customer_id, v_session.artist_id,
                v_requested_start_at, v_requested_end_at, 'pending_review',
                btrim(p_full_name), p_phone, v_email_val,
                NULLIF(btrim(p_health_note), ''), p_is_first_tattoo, p_safety_notice_acknowledged,
                now(), '2026-08-21-v1', v_tracking_code, p_flash_design_id, v_session.promotion_id
            )
            RETURNING id, public_token INTO v_booking_id, v_public_token;
            v_success := true;
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;
    END LOOP;

    UPDATE private.public_booking_upload_sessions
    SET status = 'consumed', finalized_at = now(), booking_request_id = v_booking_id
    WHERE id = p_session_id;

    -- Set Flash status to reserved immediately
    IF p_flash_design_id IS NOT NULL THEN
        UPDATE public.flash_designs
        SET status             = 'reserved',
            held_by_session_id = NULL,
            held_expires_at    = NULL,
            booking_request_id = v_booking_id,
            updated_at         = now()
        WHERE id = p_flash_design_id;
    END IF;

    RETURN v_public_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_public_booking(
    uuid, numeric, numeric, text, text, text, text, text, text, text, text,
    text[], text[], boolean, boolean, boolean, uuid, uuid
) TO anon, authenticated;

-- 9. Update approve_booking_request_v2 to handle Custom promotion snapshots
CREATE OR REPLACE FUNCTION public.approve_booking_request_v2(
    p_booking_id uuid,
    p_agreed_price numeric,
    p_deposit_amount numeric,
    p_confirmed_start_at timestamptz,
    p_confirmed_end_at timestamptz
) RETURNS TABLE (
    booking_status text,
    appointment_id uuid,
    payment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_booking record;
    v_app_id uuid;
    v_pay_id uuid;
    v_deposit_paid boolean;
    
    -- Promotion calculation variables
    v_promo             record;
    v_discount_amount   numeric := 0;
    v_final_price       numeric := p_agreed_price;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_agreed_price IS NULL OR p_deposit_amount IS NULL OR p_confirmed_start_at IS NULL OR p_confirmed_end_at IS NULL THEN
        RAISE EXCEPTION 'All input parameters must be specified';
    END IF;

    IF p_agreed_price < 0 THEN
        RAISE EXCEPTION 'Agreed price must be non-negative';
    END IF;

    IF p_deposit_amount < 0 THEN
        RAISE EXCEPTION 'Deposit amount must be non-negative';
    END IF;

    IF p_confirmed_start_at >= p_confirmed_end_at THEN
        RAISE EXCEPTION 'Confirmed start time must be before end time';
    END IF;

    SELECT * INTO v_booking
    FROM public.booking_requests
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking request not found';
    END IF;

    IF v_booking.status != 'pending_review' THEN
        RAISE EXCEPTION 'Booking request is not in pending_review state';
    END IF;

    -- Membership authorization
    IF NOT (
        EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_id = v_booking.shop_id
              AND user_id = v_user_id
              AND status = 'active'
              AND role = 'owner'
        )
        OR
        (
            v_booking.artist_id = v_user_id
            AND EXISTS (
                SELECT 1 FROM public.shop_members
                WHERE shop_id = v_booking.shop_id
                  AND user_id = v_user_id
                  AND status = 'active'
                  AND role = 'artist'
            )
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized to approve this booking request';
    END IF;

    -- Compute Custom Promotion if eligible
    IF v_booking.eligible_promotion_id IS NOT NULL THEN
        SELECT * INTO v_promo FROM public.promotions WHERE id = v_booking.eligible_promotion_id;
        IF FOUND THEN
            IF v_promo.discount_type = 'percentage' THEN
                v_discount_amount := round(p_agreed_price * v_promo.discount_value / 100);
            ELSE
                v_discount_amount := least(v_promo.discount_value, p_agreed_price);
            END IF;
            v_final_price := greatest(p_agreed_price - v_discount_amount, 0);
        END IF;
    END IF;

    -- Validate deposit amount against final price
    IF p_deposit_amount > v_final_price THEN
        RAISE EXCEPTION 'Deposit amount cannot exceed final agreed price';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.payments
        WHERE booking_request_id = p_booking_id
          AND payment_type = 'deposit'
          AND status = 'paid'
    ) INTO v_deposit_paid;

    IF p_deposit_amount = 0 OR v_deposit_paid THEN
        -- Immediate Approval Flow
        UPDATE public.tattoo_projects
        SET status = 'active',
            agreed_price = v_final_price,
            original_price = p_agreed_price,
            promotion_id = v_booking.eligible_promotion_id,
            promotion_name_snapshot = v_promo.name,
            discount_type_snapshot = v_promo.discount_type,
            discount_value_snapshot = v_promo.discount_value,
            discount_amount = v_discount_amount,
            updated_at = now()
        WHERE id = v_booking.project_id;

        INSERT INTO public.appointments (
            shop_id, project_id, booking_request_id, customer_id, artist_id,
            session_number, start_at, end_at, status, created_by
        )
        VALUES (
            v_booking.shop_id, v_booking.project_id, v_booking.id, v_booking.customer_id, v_booking.artist_id,
            1, p_confirmed_start_at, p_confirmed_end_at, 'scheduled', v_user_id
        )
        RETURNING id INTO v_app_id;

        UPDATE public.booking_requests
        SET status = 'approved',
            approved_by = v_user_id,
            approved_at = now(),
            confirmed_start_at = p_confirmed_start_at,
            confirmed_end_at = p_confirmed_end_at,
            updated_at = now()
        WHERE id = v_booking.id;

        IF p_deposit_amount = 0 AND NOT v_deposit_paid THEN
            INSERT INTO public.payments (
                shop_id, customer_id, project_id, booking_request_id,
                payment_type, amount, status, paid_at, verified_by, verified_at
            )
            VALUES (
                v_booking.shop_id, v_booking.customer_id, v_booking.project_id, v_booking.id,
                'deposit', 0, 'paid', now(), v_user_id, now()
            )
            RETURNING id INTO v_pay_id;
        END IF;

        RETURN QUERY SELECT 'approved'::text, v_app_id, v_pay_id;
    ELSE
        -- Pending Payment Flow
        UPDATE public.tattoo_projects
        SET agreed_price = v_final_price,
            original_price = p_agreed_price,
            promotion_id = v_booking.eligible_promotion_id,
            promotion_name_snapshot = v_promo.name,
            discount_type_snapshot = v_promo.discount_type,
            discount_value_snapshot = v_promo.discount_value,
            discount_amount = v_discount_amount,
            updated_at = now()
        WHERE id = v_booking.project_id;

        UPDATE public.booking_requests
        SET status = 'pending_payment',
            confirmed_start_at = p_confirmed_start_at,
            confirmed_end_at = p_confirmed_end_at,
            updated_at = now()
        WHERE id = v_booking.id;

        INSERT INTO public.booking_schedule_holds (
            shop_id, booking_request_id, artist_id, start_at, end_at, expires_at
        )
        VALUES (
            v_booking.shop_id, v_booking.id, v_booking.artist_id,
            p_confirmed_start_at, p_confirmed_end_at, now() + interval '48 hours'
        );

        INSERT INTO public.payments (
            shop_id, customer_id, project_id, booking_request_id,
            payment_type, amount, status
        )
        VALUES (
            v_booking.shop_id, v_booking.customer_id, v_booking.project_id, v_booking.id,
            'deposit', p_deposit_amount, 'pending'
        )
        RETURNING id INTO v_pay_id;

        RETURN QUERY SELECT 'pending_payment'::text, NULL::uuid, v_pay_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_booking_request_v2(uuid, numeric, numeric, timestamptz, timestamptz) TO authenticated;

-- 10. Redefine get_public_booking_status to return promotion snapshot columns
DROP FUNCTION IF EXISTS public.get_public_booking_status(text, uuid);

CREATE OR REPLACE FUNCTION public.get_public_booking_status(p_shop_slug text, p_public_token uuid)
RETURNS TABLE (
    booking_status text,
    shop_name text,
    artist_name text,
    submitted_full_name text,
    tattoo_style text,
    body_placement text,
    description text,
    requested_start_at timestamptz,
    confirmed_start_at timestamptz,
    confirmed_end_at timestamptz,
    agreed_price numeric,
    deposit_amount numeric,
    payment_status text,
    payment_deadline timestamptz,
    rejection_reason text,
    message text,
    original_price numeric,
    discount_amount numeric,
    promotion_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_booking record;
    v_shop record;
    v_artist record;
    v_project record;
    v_payment record;
    v_hold record;
BEGIN
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT * INTO v_shop FROM public.shops WHERE id = v_booking.shop_id AND slug = p_shop_slug;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT * INTO v_artist FROM public.profiles WHERE id = v_booking.artist_id;
    SELECT * INTO v_project FROM public.tattoo_projects WHERE id = v_booking.project_id;
    
    SELECT * INTO v_payment FROM public.payments WHERE booking_request_id = v_booking.id AND payment_type = 'deposit' ORDER BY created_at DESC LIMIT 1;
    SELECT * INTO v_hold FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id;

    booking_status := v_booking.status;
    shop_name := v_shop.name;
    artist_name := v_artist.full_name;
    submitted_full_name := v_booking.submitted_full_name;
    tattoo_style := v_project.tattoo_style;
    body_placement := v_project.body_placement;
    description := v_project.description;
    requested_start_at := v_booking.requested_start_at;
    confirmed_start_at := v_booking.confirmed_start_at;
    confirmed_end_at := v_booking.confirmed_end_at;
    agreed_price := v_project.agreed_price;
    deposit_amount := v_payment.amount;
    payment_status := COALESCE(v_payment.status, 'none');
    
    IF v_hold IS NOT NULL THEN
        payment_deadline := v_hold.expires_at;
    ELSE
        payment_deadline := v_booking.hold_expires_at;
    END IF;
    
    rejection_reason := v_booking.rejection_reason;
    message := 'Your booking is ' || v_booking.status;

    original_price := v_project.original_price;
    discount_amount := v_project.discount_amount;
    promotion_name := v_project.promotion_name_snapshot;

    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_booking_status(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_booking_status(text, uuid) TO anon, authenticated;
