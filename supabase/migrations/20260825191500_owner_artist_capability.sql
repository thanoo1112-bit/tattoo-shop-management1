-- Migration: Allow active Owner to function as a working artist
-- REDEFINES affected RPC functions and RLS policies to accept role IN ('artist', 'owner')

-- 1. Redefine get_public_artists_by_shop_slug to include active owner
CREATE OR REPLACE FUNCTION public.get_public_artists_by_shop_slug(p_slug text)
RETURNS TABLE (artist_id uuid, display_name text, avatar_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.full_name AS display_name, p.avatar_url
    FROM public.profiles p
    JOIN public.shop_members sm ON p.id = sm.user_id
    JOIN public.shops s ON sm.shop_id = s.id
    WHERE s.slug = p_slug AND sm.status = 'active' AND sm.role IN ('artist', 'owner');
END;
$$;

-- 2. Redefine get_public_artist_tattoo_styles to accept owner
CREATE OR REPLACE FUNCTION public.get_public_artist_tattoo_styles(
    p_shop_slug text,
    p_artist_id uuid
) RETURNS TABLE (
    style_id uuid,
    name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_shop_id uuid;
BEGIN
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug;
    IF v_shop_id IS NULL THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_shop_id 
        AND user_id = p_artist_id 
        AND role IN ('artist', 'owner')
        AND status = 'active'
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT s.id, s.name
    FROM public.artist_tattoo_styles ats
    JOIN public.tattoo_styles s ON ats.style_id = s.id
    WHERE ats.shop_id = v_shop_id
      AND ats.artist_id = p_artist_id
    ORDER BY s.name ASC;
END;
$$;

-- 3. Redefine create_availability_slot to accept owner
CREATE OR REPLACE FUNCTION public.create_availability_slot(p_shop_id uuid, p_artist_id uuid, p_start_at timestamptz, p_end_at timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_slot_id uuid;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT role INTO v_role FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = v_user_id AND status = 'active';
    IF v_role IS NULL OR (v_role = 'artist' AND p_artist_id != v_user_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_artist_id AND status = 'active' AND role IN ('artist', 'owner')) THEN RAISE EXCEPTION 'Artist not active'; END IF;
    IF p_start_at >= p_end_at THEN RAISE EXCEPTION 'Invalid time range'; END IF;
    
    IF EXISTS (SELECT 1 FROM public.artist_availability_slots WHERE artist_id = p_artist_id AND status IN ('open', 'held', 'booked', 'blocked') AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')) THEN RAISE EXCEPTION 'Availability overlap'; END IF;
    IF EXISTS (SELECT 1 FROM public.appointments WHERE artist_id = p_artist_id AND status IN ('scheduled', 'in_progress') AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')) THEN RAISE EXCEPTION 'Appointment overlap'; END IF;

    INSERT INTO public.artist_availability_slots (shop_id, artist_id, start_at, end_at, status, created_by)
    VALUES (p_shop_id, p_artist_id, p_start_at, p_end_at, 'open', v_user_id) RETURNING id INTO v_slot_id;
    RETURN v_slot_id;
END;
$$;

-- 4. Redefine get_public_artist_availability to accept owner
CREATE OR REPLACE FUNCTION public.get_public_artist_availability(p_shop_id uuid, p_artist_id uuid)
RETURNS TABLE (slot_id uuid, start_at timestamptz, end_at timestamptz, available boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_artist_id AND status = 'active' AND role IN ('artist', 'owner')) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT s.id, s.start_at, s.end_at, 
           CASE WHEN s.status = 'open' THEN true 
                WHEN s.status = 'held' AND s.held_until <= now() AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.booking_request_id = s.held_by_booking_request_id AND p.status = 'verification_pending') THEN true
                ELSE false END
    FROM public.artist_availability_slots s
    WHERE s.shop_id = p_shop_id AND s.artist_id = p_artist_id AND s.start_at >= now()
    AND NOT EXISTS (
        SELECT 1 FROM public.appointments a 
        WHERE a.artist_id = p_artist_id AND a.status IN ('scheduled', 'in_progress') 
        AND tstzrange(a.start_at, a.end_at, '[)') && tstzrange(s.start_at, s.end_at, '[)')
    );
END;
$$;

-- 5. Redefine create_public_booking_request to accept owner
CREATE OR REPLACE FUNCTION public.create_public_booking_request(
    p_shop_slug text, p_slot_id uuid, p_full_name text, p_phone text, p_email text, p_line_id text, p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_norm_phone text := btrim(p_phone);
    v_shop record;
    v_settings record;
    v_slot record;
    v_customer_id uuid;
    v_project_id uuid;
    v_booking_id uuid;
BEGIN
    SELECT * INTO v_shop FROM public.shops WHERE slug = p_shop_slug;
    IF NOT FOUND THEN RAISE EXCEPTION 'Shop not found'; END IF;
    SELECT * INTO v_settings FROM public.shop_booking_settings WHERE shop_id = v_shop.id;
    
    SELECT * INTO v_slot FROM public.artist_availability_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND OR v_slot.shop_id != v_shop.id OR v_slot.status NOT IN ('open', 'held') THEN RAISE EXCEPTION 'Slot invalid'; END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_shop.id AND user_id = v_slot.artist_id AND status = 'active' AND role IN ('artist', 'owner')) THEN RAISE EXCEPTION 'Artist not active'; END IF;
    
    IF v_slot.status = 'held' THEN
        IF v_slot.held_until > now() THEN RAISE EXCEPTION 'Slot is held'; END IF;
        IF EXISTS (SELECT 1 FROM public.payments WHERE booking_request_id = v_slot.held_by_booking_request_id AND status = 'verification_pending') THEN RAISE EXCEPTION 'Slot pending verification'; END IF;
        
        UPDATE public.booking_requests SET status = 'expired' WHERE id = v_slot.held_by_booking_request_id AND status = 'pending_payment';
        UPDATE public.payments SET status = 'cancelled' WHERE booking_request_id = v_slot.held_by_booking_request_id AND status = 'pending';
    END IF;
    
    IF EXISTS (SELECT 1 FROM public.appointments WHERE artist_id = v_slot.artist_id AND status IN ('scheduled', 'in_progress') AND tstzrange(start_at, end_at, '[)') && tstzrange(v_slot.start_at, v_slot.end_at, '[)')) THEN RAISE EXCEPTION 'Time conflict'; END IF;
    
    INSERT INTO public.customers (shop_id, full_name, phone_normalized, email, line_id, source)
    VALUES (v_shop.id, p_full_name, v_norm_phone, p_email, p_line_id, 'online')
    ON CONFLICT (shop_id, phone_normalized) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id INTO v_customer_id;
    
    INSERT INTO public.tattoo_projects (shop_id, customer_id, artist_id, name, status)
    VALUES (v_shop.id, v_customer_id, v_slot.artist_id, 'Booking Request Project', 'proposed') RETURNING id INTO v_project_id;
    
    INSERT INTO public.booking_requests (shop_id, project_id, customer_id, artist_id, availability_slot_id, requested_start_at, requested_end_at, status, submitted_full_name, submitted_phone, submitted_email, submitted_line_id, customer_note)
    VALUES (v_shop.id, v_project_id, v_customer_id, v_slot.artist_id, p_slot_id, v_slot.start_at, v_slot.end_at, 'pending_payment', p_full_name, v_norm_phone, p_email, p_line_id, p_notes) RETURNING id INTO v_booking_id;
    
    IF v_settings.deposit_required = true THEN
        INSERT INTO public.payments (shop_id, customer_id, project_id, booking_request_id, payment_type, amount, status)
        VALUES (v_shop.id, v_customer_id, v_project_id, v_booking_id, 'deposit', v_settings.default_deposit_amount, 'pending');
    ELSE
        UPDATE public.booking_requests SET status = 'pending_review' WHERE id = v_booking_id;
    END IF;
    
    UPDATE public.artist_availability_slots SET status = 'held', held_until = now() + (v_settings.hold_minutes || ' minutes')::interval, held_by_booking_request_id = v_booking_id WHERE id = p_slot_id;
    RETURN v_booking_id;
END;
$$;

-- 6. Redefine create_appointment_with_customer_details to accept owner
CREATE OR REPLACE FUNCTION public.create_appointment_with_customer_details(
    p_shop_id uuid, p_artist_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_full_name text, p_phone text, p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_norm_phone text := btrim(p_phone);
    v_customer_id uuid;
    v_project_id uuid;
    v_app_id uuid;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT role INTO v_role FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = v_user_id AND status = 'active';
    IF v_role IS NULL OR (v_role = 'artist' AND p_artist_id != v_user_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_artist_id AND status = 'active' AND role IN ('artist', 'owner')) THEN RAISE EXCEPTION 'Artist not active'; END IF;
    
    IF EXISTS (SELECT 1 FROM public.appointments WHERE artist_id = p_artist_id AND status IN ('scheduled', 'in_progress') AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')) THEN RAISE EXCEPTION 'Appointment conflict'; END IF;
    IF EXISTS (SELECT 1 FROM public.artist_availability_slots WHERE artist_id = p_artist_id AND status IN ('held', 'booked') AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')) THEN RAISE EXCEPTION 'Slot conflict'; END IF;

    INSERT INTO public.customers (shop_id, full_name, phone_normalized, source)
    VALUES (p_shop_id, p_full_name, v_norm_phone, 'staff_created')
    ON CONFLICT (shop_id, phone_normalized) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id INTO v_customer_id;
    
    INSERT INTO public.tattoo_projects (shop_id, customer_id, artist_id, name, status)
    VALUES (p_shop_id, v_customer_id, p_artist_id, 'Staff Created Project', 'active') RETURNING id INTO v_project_id;

    INSERT INTO public.appointments (shop_id, project_id, customer_id, artist_id, session_number, start_at, end_at, status, notes, created_by)
    VALUES (p_shop_id, v_project_id, v_customer_id, p_artist_id, 1, p_start_at, p_end_at, 'scheduled', p_notes, v_user_id) RETURNING id INTO v_app_id;
    
    RETURN v_app_id;
END;
$$;

-- 7. Redefine get_public_artist_color_options to accept owner
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
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug AND status = 'active';
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

-- 8. Redefine get_public_artist_work_type_options to accept owner
CREATE OR REPLACE FUNCTION public.get_public_artist_work_type_options(
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
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug;
    IF v_shop_id IS NULL THEN
        RETURN;
    END IF;

    SELECT accepts_new_work, accepts_extension, accepts_touch_up, accepts_cover_up, accepts_scar_cover
    INTO v_new_work, v_extension, v_touch_up, v_cover_up, v_scar_cover
    FROM public.shop_members
    WHERE shop_id = v_shop_id 
      AND user_id = p_artist_id 
      AND role IN ('artist', 'owner')
      AND status = 'active';

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
        label := 'ปรับปรุงลายเดิม';
        RETURN NEXT;
    END IF;

    IF v_cover_up THEN
        value := 'cover_up';
        label := 'สักทับลายเดิม (Cover up)';
        RETURN NEXT;
    END IF;

    IF v_scar_cover THEN
        value := 'scar_cover';
        label := 'สักทับรอยแผลเป็น';
        RETURN NEXT;
    END IF;
END;
$$;

-- 9. Redefine add_my_artist_specialty to accept owner
CREATE OR REPLACE FUNCTION public.add_my_artist_specialty(
    p_shop_id uuid,
    p_style_name text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_uid uuid := (select auth.uid());
    v_style_id uuid;
    v_clean_name text;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id 
        AND user_id = v_uid 
        AND role IN ('artist', 'owner') 
        AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Not an active artist/owner in this shop';
    END IF;

    v_clean_name := trim(p_style_name);
    IF length(v_clean_name) = 0 THEN
        RAISE EXCEPTION 'Style name cannot be empty';
    END IF;
    IF length(v_clean_name) > 100 THEN
        RAISE EXCEPTION 'Style name is too long';
    END IF;

    SELECT id INTO v_style_id 
    FROM public.tattoo_styles 
    WHERE shop_id = p_shop_id AND lower(name) = lower(v_clean_name);

    IF v_style_id IS NULL THEN
        INSERT INTO public.tattoo_styles (shop_id, name, created_by)
        VALUES (p_shop_id, v_clean_name, v_uid)
        RETURNING id INTO v_style_id;
    END IF;

    INSERT INTO public.artist_tattoo_styles (shop_id, artist_id, style_id)
    VALUES (p_shop_id, v_uid, v_style_id)
    ON CONFLICT DO NOTHING;
END;
$$;

-- 10. Redefine create_public_booking_upload_session to accept owner
DROP FUNCTION IF EXISTS public.create_public_booking_upload_session(text, uuid, uuid, text, text);

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
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = p_shop_slug AND status = 'active';
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

-- 11. Redefine finalize_public_booking to accept owner (16 parameters with short tracking code to match production schema)
DROP FUNCTION IF EXISTS public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean);
DROP FUNCTION IF EXISTS public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean, boolean, boolean);

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
    p_terms_accepted boolean,
    p_is_first_tattoo boolean DEFAULT NULL,
    p_safety_notice_acknowledged boolean DEFAULT NULL
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
    v_style_name text;
    v_width_val numeric := p_width_cm;
    v_height_val numeric := p_height_cm;
    v_acc_bg boolean; v_acc_col boolean; v_acc_nw boolean; v_acc_ext boolean; v_acc_tu boolean; v_acc_cu boolean; v_acc_sc boolean;
    v_effective_cap int;
    v_occupied_cap int;
    v_is_closed boolean;
    v_area numeric;
    v_max_dim numeric;
    v_buffer_hours int;
    v_time_decimal numeric;
    v_req_hour int;
    v_req_minute int;
    v_requested_start_at timestamptz;
    v_requested_end_at timestamptz;
    v_phone_norm text;
    v_email_val text;
    v_real_count int;
    v_design_count int;
    v_total_paths int;
    v_distinct_paths int;
    v_all_paths text[];
    v_path text;
    v_meta_mime text;
    v_expected_prefix text;
    v_tracking_code text;
    v_success boolean;
BEGIN
    IF p_safety_notice_acknowledged IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Safety notice must be acknowledged';
    END IF;

    IF v_width_val <= 0 THEN v_width_val := 5; END IF;
    IF v_height_val <= 0 THEN v_height_val := 5; END IF;

    v_phone_norm := regexp_replace(p_phone, '\D', '', 'g');
    IF length(v_phone_norm) < 9 THEN RAISE EXCEPTION 'Invalid phone'; END IF;
    
    v_email_val := NULLIF(btrim(p_email), '');

    SELECT * INTO v_session FROM private.public_booking_upload_sessions WHERE id = p_session_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid session'; END IF;
    IF v_session.status = 'consumed' THEN 
        SELECT public_token INTO v_public_token FROM public.booking_requests WHERE id = v_session.booking_request_id;
        IF v_public_token IS NULL THEN RAISE EXCEPTION 'Session consumed but booking not found'; END IF;
        RETURN v_public_token;
    END IF;
    IF v_session.expires_at < now() THEN RAISE EXCEPTION 'Session expired'; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_session.shop_id AND user_id = v_session.artist_id AND role IN ('artist', 'owner') AND status = 'active') THEN
        RAISE EXCEPTION 'Artist not active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.artist_tattoo_styles ats WHERE ats.shop_id = v_session.shop_id AND ats.artist_id = v_session.artist_id AND ats.style_id = v_session.style_id) THEN
        RAISE EXCEPTION 'Style not supported by artist';
    END IF;
    SELECT name INTO v_style_name FROM public.tattoo_styles WHERE id = v_session.style_id;

    SELECT accepts_black_grey, accepts_color, accepts_new_work, accepts_extension, accepts_touch_up, accepts_cover_up, accepts_scar_cover
    INTO v_acc_bg, v_acc_col, v_acc_nw, v_acc_ext, v_acc_tu, v_acc_cu, v_acc_sc
    FROM public.shop_members 
    WHERE shop_id = v_session.shop_id AND user_id = v_session.artist_id AND role IN ('artist', 'owner') AND status = 'active';

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
        SELECT COALESCE(metadata->>'mimetype', 'application/octet-stream') INTO v_meta_mime FROM storage.objects WHERE bucket_id = 'tattoo-references' AND name = v_path LIMIT 1;
        IF v_meta_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN RAISE EXCEPTION 'Invalid MIME type for image'; END IF;
        INSERT INTO public.tattoo_project_references (shop_id, project_id, storage_path, file_name, mime_type, reference_type) 
        VALUES (v_session.shop_id, v_project_id, v_path, v_path, v_meta_mime, 'real_area');
    END LOOP;
    FOREACH v_path IN ARRAY COALESCE(p_design_ref_paths, ARRAY[]::text[]) LOOP
        SELECT COALESCE(metadata->>'mimetype', 'application/octet-stream') INTO v_meta_mime FROM storage.objects WHERE bucket_id = 'tattoo-references' AND name = v_path LIMIT 1;
        IF v_meta_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN RAISE EXCEPTION 'Invalid MIME type for image'; END IF;
        INSERT INTO public.tattoo_project_references (shop_id, project_id, storage_path, file_name, mime_type, reference_type) 
        VALUES (v_session.shop_id, v_project_id, v_path, v_path, v_meta_mime, 'design_reference');
    END LOOP;

    v_requested_start_at := (p_requested_date || ' ' || p_requested_time)::timestamp AT TIME ZONE 'Asia/Bangkok';
    v_requested_end_at := v_requested_start_at + interval '1 hour';
    
    v_success := false;
    WHILE NOT v_success LOOP
        v_tracking_code := private.generate_secure_tracking_code();
        BEGIN
            INSERT INTO public.booking_requests (
                shop_id, project_id, customer_id, artist_id, requested_start_at, requested_end_at, status, 
                submitted_full_name, submitted_phone, submitted_email, health_note, is_first_tattoo, 
                safety_notice_acknowledged, terms_accepted_at, terms_version, tracking_code
            )
            VALUES (
                v_session.shop_id, v_project_id, v_customer_id, v_session.artist_id, v_requested_start_at, v_requested_end_at, 'pending_review', 
                btrim(p_full_name), p_phone, v_email_val, NULLIF(btrim(p_health_note), ''), p_is_first_tattoo, 
                p_safety_notice_acknowledged, now(), '2026-08-21-v1', v_tracking_code
            ) 
            RETURNING id, public_token INTO v_booking_id, v_public_token;
            v_success := true;
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;
    END LOOP;

    UPDATE private.public_booking_upload_sessions SET status = 'consumed', finalized_at = now(), booking_request_id = v_booking_id WHERE id = p_session_id;

    RETURN v_public_token;
END;
$$;

-- Secure grants for all functions redefined above
REVOKE ALL ON FUNCTION public.get_public_artists_by_shop_slug(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artists_by_shop_slug(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_artist_tattoo_styles(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artist_tattoo_styles(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_availability_slot(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_availability_slot(uuid, uuid, timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_artist_availability(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artist_availability(uuid, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_public_booking_request(text, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking_request(text, uuid, text, text, text, text, text) TO anon;

REVOKE ALL ON FUNCTION public.create_appointment_with_customer_details(uuid, uuid, timestamptz, timestamptz, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_with_customer_details(uuid, uuid, timestamptz, timestamptz, text, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_artist_color_options(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artist_color_options(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_artist_work_type_options(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artist_work_type_options(text, uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.add_my_artist_specialty(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_my_artist_specialty(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking_upload_session(text, uuid, uuid, text, text) TO anon;

REVOKE ALL ON FUNCTION public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean, boolean, boolean) TO anon;


-- 12. Drop and Recreate RLS Policies to allow owner to edit their own artist booking settings and overrides
DROP POLICY IF EXISTS "artist_manage_own_booking_settings" ON public.artist_booking_settings;
CREATE POLICY "artist_manage_own_booking_settings" ON public.artist_booking_settings FOR ALL TO authenticated 
USING (
    artist_id = auth.uid() 
    AND EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_booking_settings.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role IN ('artist', 'owner')
        AND sm.status = 'active'
    )
)
WITH CHECK (
    artist_id = auth.uid() 
    AND EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_booking_settings.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role IN ('artist', 'owner')
        AND sm.status = 'active'
    )
);

DROP POLICY IF EXISTS "artist_manage_own_daily_overrides" ON public.artist_daily_overrides;
CREATE POLICY "artist_manage_own_daily_overrides" ON public.artist_daily_overrides FOR ALL TO authenticated
USING (
    artist_id = auth.uid() 
    AND EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_daily_overrides.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role IN ('artist', 'owner')
        AND sm.status = 'active'
    )
)
WITH CHECK (
    artist_id = auth.uid() 
    AND created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_daily_overrides.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role IN ('artist', 'owner')
        AND sm.status = 'active'
    )
);

-- 13. get_effective_daily_capacity override for Owner-as-Artist capability
CREATE OR REPLACE FUNCTION public.get_effective_daily_capacity(
    p_shop_id uuid,
    p_artist_id uuid,
    p_date date
) RETURNS TABLE (
    effective_capacity integer,
    is_closed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_override_cap integer;
    v_override_closed boolean;
    v_artist_cap integer;
    v_shop_cap integer;
BEGIN
    -- 0. Check Artist Status (Allows role IN ('artist', 'owner'))
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id 
        AND user_id = p_artist_id 
        AND role IN ('artist', 'owner') 
        AND status = 'active'
    ) THEN
        RETURN QUERY SELECT 0, true;
        RETURN;
    END IF;

    -- 1. Check Daily Override
    SELECT ado.capacity, ado.is_closed INTO v_override_cap, v_override_closed
    FROM public.artist_daily_overrides AS ado
    WHERE ado.shop_id = p_shop_id AND ado.artist_id = p_artist_id AND ado.override_date = p_date;

    IF FOUND THEN
        IF v_override_closed THEN
            RETURN QUERY SELECT 0, true;
        ELSE
            RETURN QUERY SELECT v_override_cap, false;
        END IF;
        RETURN;
    END IF;

    -- 2. Check Artist Default
    SELECT abs.daily_capacity INTO v_artist_cap
    FROM public.artist_booking_settings AS abs
    WHERE abs.shop_id = p_shop_id AND abs.artist_id = p_artist_id;

    IF FOUND THEN
        RETURN QUERY SELECT v_artist_cap, false;
        RETURN;
    END IF;

    -- 3. Check Shop Default
    SELECT sbs.default_daily_capacity INTO v_shop_cap
    FROM public.shop_booking_settings AS sbs
    WHERE sbs.shop_id = p_shop_id;

    RETURN QUERY SELECT COALESCE(v_shop_cap, 1), false;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_effective_daily_capacity FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_daily_capacity TO authenticated;
