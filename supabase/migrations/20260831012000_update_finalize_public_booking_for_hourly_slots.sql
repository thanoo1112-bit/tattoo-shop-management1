-- Migration: Update finalize_public_booking to support hourly slots and next-day midnight 00:00 logic
-- Drop old function overload to ensure clean creation
DROP FUNCTION IF EXISTS public.finalize_public_booking(
    uuid, numeric, numeric, text, text, text, text, text, text, text, text,
    text[], text[], boolean, boolean, boolean, uuid, uuid
);

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
    END IF;

    -- Get manual style_name for custom booking if style_id is set
    IF p_flash_design_id IS NULL THEN
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
    
    -- Handle 00:00 midnight as 24.0 decimal
    IF v_req_hour = 0 AND v_req_minute = 0 THEN
        v_time_decimal := 24.0;
    END IF;

    IF p_flash_design_id IS NOT NULL THEN
        -- Flash Booking: Keep original logic (max 23.5 - v_buffer_hours)
        IF v_time_decimal < 10.0 OR v_time_decimal > (23.5 - v_buffer_hours) THEN
            RAISE EXCEPTION 'Requested time is outside store hours or buffer limit';
        END IF;
    ELSE
        -- Custom Booking: Hourly start time 10:00-00:00 (24.0), no size buffer restriction
        IF v_req_minute != 0 THEN
            RAISE EXCEPTION 'Invalid time slot: Custom booking only allows hourly slots';
        END IF;
        IF v_time_decimal < 10.0 OR v_time_decimal > 24.0 THEN
            RAISE EXCEPTION 'Requested time is outside store hours';
        END IF;
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

    IF p_flash_design_id IS NOT NULL THEN
        -- Flash booking: agreed price snapshotted from DB, size_note snapshotted, width/height left as NULL.
        INSERT INTO public.tattoo_projects (
            shop_id, customer_id, artist_id, style_id, tattoo_style, color_mode, work_type,
            width_cm, height_cm, body_placement, description, name, status,
            agreed_price, size_note, flash_design_id
        )
        VALUES (
            v_session.shop_id, v_customer_id, v_session.artist_id, v_flash_style_id,
            v_style_name, v_session.color_mode, v_session.work_type,
            NULL, NULL, btrim(p_placement), btrim(p_description),
            'Flash Booking Request', 'proposed',
            v_flash_price, 'Flash Size: ' || v_flash_size, p_flash_design_id
        )
        RETURNING id INTO v_project_id;
    ELSE
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
    IF v_time_decimal = 24.0 THEN
        v_requested_start_at := v_requested_start_at + interval '1 day';
    END IF;
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
                terms_accepted_at, terms_version, tracking_code, flash_design_id
            )
            VALUES (
                v_session.shop_id, v_project_id, v_customer_id, v_session.artist_id,
                v_requested_start_at, v_requested_end_at, 'pending_review',
                btrim(p_full_name), p_phone, v_email_val,
                NULLIF(btrim(p_health_note), ''), p_is_first_tattoo, p_safety_notice_acknowledged,
                now(), '2026-08-21-v1', v_tracking_code, p_flash_design_id
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

-- Regrant permissions
REVOKE ALL ON FUNCTION public.finalize_public_booking(
    uuid, numeric, numeric, text, text, text, text, text, text, text, text,
    text[], text[], boolean, boolean, boolean, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_public_booking(
    uuid, numeric, numeric, text, text, text, text, text, text, text, text,
    text[], text[], boolean, boolean, boolean, uuid, uuid
) TO anon, authenticated;
