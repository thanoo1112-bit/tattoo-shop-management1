-- REDEFINE get_public_booking_status WITH DETAILED PUBLIC STATUS FIELDS AND SHOP SLUG BINDING
DROP FUNCTION IF EXISTS public.get_public_booking_status(uuid);
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
    message text
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
    -- Query the booking request by token first
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token;
    IF NOT FOUND THEN RETURN; END IF;

    -- Query the shop by slug and match the booking request's shop_id
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

    RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_booking_status(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_booking_status(text, uuid) TO anon, authenticated;


-- UPDATE finalize_public_booking TO RETURN public_token INSTEAD OF id
CREATE OR REPLACE FUNCTION public.finalize_public_booking(
    p_session_id uuid,
    p_width_cm numeric,
    p_height_cm numeric,
    p_placement text,
    p_description text,
    p_full_name text,
    p_phone text,
    p_email text,
    p_health_note text,
    p_requested_date text,
    p_requested_time text,
    p_real_area_paths text[],
    p_design_ref_paths text[],
    p_terms_accepted boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_session record;
    v_customer_id uuid;
    v_project_id uuid;
    v_booking_id uuid;
    v_public_token uuid;
    v_phone_norm text;
    v_email_val text;
    v_requested_start_at timestamptz;
    v_requested_end_at timestamptz;
    v_path text;
    v_style_name text;
    v_expected_prefix text;
    
    v_acc_bg boolean; v_acc_col boolean;
    v_acc_nw boolean; v_acc_ext boolean; v_acc_tu boolean; v_acc_cu boolean; v_acc_sc boolean;
    
    v_width_val numeric;
    v_height_val numeric;
    v_area numeric;
    v_max_dim numeric;
    v_buffer_hours integer;
    v_req_minute integer;
    v_req_hour integer;
    v_time_decimal numeric;
    
    v_effective_cap integer;
    v_is_closed boolean;
    v_occupied_cap integer;
    
    v_real_count integer;
    v_design_count integer;
    v_all_paths text[];
    v_total_paths integer;
    v_distinct_paths integer;
    
    v_meta_mime text;
BEGIN
    IF p_terms_accepted IS DISTINCT FROM true THEN RAISE EXCEPTION 'Terms must be accepted'; END IF;
    IF p_full_name IS NULL OR btrim(p_full_name) = '' OR p_phone IS NULL OR btrim(p_phone) = '' OR p_placement IS NULL OR btrim(p_placement) = '' OR p_description IS NULL OR btrim(p_description) = '' THEN
        RAISE EXCEPTION 'Required details missing';
    END IF;

    v_email_val := NULLIF(btrim(p_email), '');
    IF v_email_val IS NOT NULL THEN
        IF v_email_val !~ '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
            RAISE EXCEPTION 'Invalid email format';
        END IF;
    END IF;

    v_phone_norm := regexp_replace(btrim(p_phone), '[^\d+]', '', 'g');
    IF length(regexp_replace(v_phone_norm, '[^\d]', '', 'g')) < 8 OR v_phone_norm = '+' THEN
        RAISE EXCEPTION 'Invalid phone number';
    END IF;

    v_width_val := COALESCE(p_width_cm, 0);
    v_height_val := COALESCE(p_height_cm, 0);
    IF v_width_val <= 0 OR v_height_val <= 0 THEN RAISE EXCEPTION 'Invalid dimensions'; END IF;

    SELECT * INTO v_session FROM private.public_booking_upload_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
    IF v_session.status = 'consumed' THEN 
        SELECT public_token INTO v_public_token FROM public.booking_requests WHERE id = v_session.booking_request_id;
        RETURN v_public_token;
    END IF;
    IF v_session.expires_at < now() THEN RAISE EXCEPTION 'Session expired'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_session.shop_id AND user_id = v_session.artist_id AND role = 'artist' AND status = 'active') THEN
        RAISE EXCEPTION 'Artist not active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.artist_tattoo_styles ats WHERE ats.shop_id = v_session.shop_id AND ats.artist_id = v_session.artist_id AND ats.style_id = v_session.style_id) THEN
        RAISE EXCEPTION 'Style not supported by artist';
    END IF;
    SELECT name INTO v_style_name FROM public.tattoo_styles WHERE id = v_session.style_id;

    SELECT accepts_black_grey, accepts_color, accepts_new_work, accepts_extension, accepts_touch_up, accepts_cover_up, accepts_scar_cover
    INTO v_acc_bg, v_acc_col, v_acc_nw, v_acc_ext, v_acc_tu, v_acc_cu, v_acc_sc
    FROM public.shop_members 
    WHERE shop_id = v_session.shop_id AND user_id = v_session.artist_id AND role = 'artist' AND status = 'active';

    IF v_session.color_mode = 'black_grey' AND NOT v_acc_bg THEN RAISE EXCEPTION 'Artist rejects black_grey'; END IF;
    IF v_session.color_mode = 'color' AND NOT v_acc_col THEN RAISE EXCEPTION 'Artist rejects color'; END IF;
    IF v_session.work_type = 'new_work' AND NOT v_acc_nw THEN RAISE EXCEPTION 'Artist rejects new_work'; END IF;
    IF v_session.work_type = 'extension' AND NOT v_acc_ext THEN RAISE EXCEPTION 'Artist rejects extension'; END IF;
    IF v_session.work_type = 'touch_up' AND NOT v_acc_tu THEN RAISE EXCEPTION 'Artist rejects touch_up'; END IF;
    IF v_session.work_type = 'cover_up' AND NOT v_acc_cu THEN RAISE EXCEPTION 'Artist rejects cover_up'; END IF;
    IF v_session.work_type = 'scar_cover' AND NOT v_acc_sc THEN RAISE EXCEPTION 'Artist rejects scar_cover'; END IF;

    v_area := v_width_val * v_height_val;
    v_max_dim := GREATEST(v_width_val, v_height_val);
    IF v_max_dim <= 5 AND v_area <= 25 THEN v_buffer_hours := 2;
    ELSIF v_max_dim <= 10 AND v_area <= 75 THEN v_buffer_hours := 3;
    ELSIF v_max_dim <= 15 AND v_area <= 150 THEN v_buffer_hours := 4;
    ELSIF v_max_dim <= 25 AND v_area <= 350 THEN v_buffer_hours := 6;
    ELSE v_buffer_hours := 8; END IF;

    v_req_minute := extract(minute from p_requested_time::time);
    IF v_req_minute NOT IN (0, 30) THEN RAISE EXCEPTION 'Invalid time boundary'; END IF;
    
    v_req_hour := extract(hour from p_requested_time::time);
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

    v_real_count := COALESCE(array_length(p_real_area_paths, 1), 0);
    v_design_count := COALESCE(array_length(p_design_ref_paths, 1), 0);
    
    IF v_real_count > 5 THEN RAISE EXCEPTION 'Max 5 real area photos'; END IF;
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
        IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'tattoo-references' AND name = v_path) THEN 
            RAISE EXCEPTION 'File missing: %', v_path; 
        END IF;
    END LOOP;

    INSERT INTO public.customers (shop_id, full_name, phone_normalized, email, source) 
    VALUES (v_session.shop_id, btrim(p_full_name), v_phone_norm, v_email_val, 'online')
    ON CONFLICT (shop_id, phone_normalized) DO UPDATE SET 
        full_name = COALESCE(EXCLUDED.full_name, public.customers.full_name), 
        email = COALESCE(EXCLUDED.email, public.customers.email), 
        updated_at = now() 
    RETURNING id INTO v_customer_id;

    INSERT INTO public.tattoo_projects (shop_id, customer_id, artist_id, style_id, tattoo_style, color_mode, work_type, width_cm, height_cm, body_placement, description, name, status)
    VALUES (v_session.shop_id, v_customer_id, v_session.artist_id, v_session.style_id, v_style_name, v_session.color_mode, v_session.work_type, v_width_val, v_height_val, btrim(p_placement), btrim(p_description), 'Public Booking Request', 'proposed') 
    RETURNING id INTO v_project_id;

    FOREACH v_path IN ARRAY COALESCE(p_real_area_paths, ARRAY[]::text[]) LOOP
        SELECT COALESCE(mimetype, 'application/octet-stream') INTO v_meta_mime FROM storage.objects WHERE bucket_id = 'tattoo-references' AND name = v_path LIMIT 1;
        IF v_meta_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN RAISE EXCEPTION 'Invalid MIME type for image'; END IF;
        INSERT INTO public.tattoo_project_references (shop_id, project_id, storage_path, file_name, mime_type, reference_type) 
        VALUES (v_session.shop_id, v_project_id, v_path, v_path, v_meta_mime, 'real_area');
    END LOOP;
    FOREACH v_path IN ARRAY COALESCE(p_design_ref_paths, ARRAY[]::text[]) LOOP
        SELECT COALESCE(mimetype, 'application/octet-stream') INTO v_meta_mime FROM storage.objects WHERE bucket_id = 'tattoo-references' AND name = v_path LIMIT 1;
        IF v_meta_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN RAISE EXCEPTION 'Invalid MIME type for image'; END IF;
        INSERT INTO public.tattoo_project_references (shop_id, project_id, storage_path, file_name, mime_type, reference_type) 
        VALUES (v_session.shop_id, v_project_id, v_path, v_path, v_meta_mime, 'design_reference');
    END LOOP;

    v_requested_start_at := (p_requested_date || ' ' || p_requested_time)::timestamp AT TIME ZONE 'Asia/Bangkok';
    v_requested_end_at := v_requested_start_at + interval '1 hour';
    
    INSERT INTO public.booking_requests (shop_id, project_id, customer_id, artist_id, requested_start_at, requested_end_at, status, submitted_full_name, submitted_phone, submitted_email, health_note, terms_accepted_at, terms_version)
    VALUES (v_session.shop_id, v_project_id, v_customer_id, v_session.artist_id, v_requested_start_at, v_requested_end_at, 'pending_review', btrim(p_full_name), p_phone, v_email_val, NULLIF(btrim(p_health_note), ''), now(), '2026-08-21-v1') 
    RETURNING id, public_token INTO v_booking_id, v_public_token;

    UPDATE private.public_booking_upload_sessions SET status = 'consumed', finalized_at = now(), booking_request_id = v_booking_id WHERE id = p_session_id;

    RETURN v_public_token;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean) TO anon;
