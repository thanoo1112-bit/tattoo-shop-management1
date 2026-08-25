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

-- 11. Redefine finalize_public_booking to accept owner
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

    -- Email Format Validation
    v_email_val := NULLIF(btrim(p_email), '');
    IF v_email_val IS NOT NULL THEN
        IF v_email_val !~ '^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
            RAISE EXCEPTION 'Invalid email format';
        END IF;
    END IF;

    -- Phone Normalization
    v_phone_norm := regexp_replace(btrim(p_phone), '[^\d+]', '', 'g');
    IF length(regexp_replace(v_phone_norm, '[^\d]', '', 'g')) < 8 OR v_phone_norm = '+' THEN
        RAISE EXCEPTION 'Invalid phone number';
    END IF;

    v_width_val := COALESCE(p_width_cm, 0);
    v_height_val := COALESCE(p_height_cm, 0);
    IF v_width_val <= 0 OR v_height_val <= 0 THEN RAISE EXCEPTION 'Invalid dimensions'; END IF;

    SELECT * INTO v_session FROM private.public_booking_upload_sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
    IF v_session.status = 'consumed' THEN RETURN v_session.booking_request_id; END IF;
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

    -- Compute scheduling & dimensions
    v_area := v_width_val * v_height_val;
    v_max_dim := GREATEST(v_width_val, v_height_val);
    IF v_area <= 25 AND v_max_dim <= 5 THEN
        v_buffer_hours := 1;
    ELSIF v_area <= 100 AND v_max_dim <= 10 THEN
        v_buffer_hours := 2;
    ELSIF v_area <= 225 AND v_max_dim <= 15 THEN
        v_buffer_hours := 3;
    ELSIF v_area <= 400 AND v_max_dim <= 20 THEN
        v_buffer_hours := 4;
    ELSE
        v_buffer_hours := 6;
    END IF;

    -- Validate date-time formatting
    IF p_requested_date !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid date format'; END IF;
    IF p_requested_time !~ '^\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Invalid time format'; END IF;

    v_req_hour := (split_part(p_requested_time, ':', 1))::integer;
    v_req_minute := (split_part(p_requested_time, ':', 2))::integer;
    IF v_req_hour < 0 OR v_req_hour > 23 OR v_req_minute < 0 OR v_req_minute > 59 THEN RAISE EXCEPTION 'Invalid time bounds'; END IF;
    v_time_decimal := v_req_hour + (v_req_minute::numeric / 60.0);

    -- Check availability schedule bounds & overrides
    SELECT COALESCE(
        (SELECT daily_capacity FROM public.artist_booking_settings WHERE shop_id = v_session.shop_id AND artist_id = v_session.artist_id),
        (SELECT default_daily_capacity FROM public.shop_booking_settings WHERE shop_id = v_session.shop_id),
        1
    ) INTO v_effective_cap;

    SELECT is_closed, daily_capacity INTO v_is_closed, v_occupied_cap
    FROM public.artist_daily_overrides
    WHERE shop_id = v_session.shop_id AND artist_id = v_session.artist_id AND override_date = p_requested_date::date;

    IF FOUND THEN
        IF v_is_closed THEN RAISE EXCEPTION 'Artist is closed on this date'; END IF;
        v_effective_cap := COALESCE(v_occupied_cap, v_effective_cap);
    END IF;

    v_requested_start_at := (p_requested_date || ' ' || p_requested_time || ':00')::timestamptz;
    v_requested_end_at := v_requested_start_at + (v_buffer_hours || ' hours')::interval;

    IF v_requested_start_at < now() + interval '12 hours' THEN RAISE EXCEPTION 'Booking must be at least 12 hours in advance'; END IF;

    -- Check capacity limits
    SELECT COUNT(*)::integer INTO v_occupied_cap
    FROM public.booking_requests
    WHERE shop_id = v_session.shop_id
      AND artist_id = v_session.artist_id
      AND status IN ('pending_payment', 'pending_review', 'approved')
      AND requested_start_at::date = p_requested_date::date;

    IF v_occupied_cap >= v_effective_cap THEN RAISE EXCEPTION 'Artist capacity reached for this date'; END IF;

    -- Check overlap constraints
    IF EXISTS (
        SELECT 1 FROM public.booking_requests
        WHERE shop_id = v_session.shop_id
          AND artist_id = v_session.artist_id
          AND status IN ('pending_payment', 'pending_review', 'approved')
          AND tstzrange(requested_start_at, requested_end_at, '[)') && tstzrange(v_requested_start_at, v_requested_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Artist schedule overlap';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.appointments
        WHERE shop_id = v_session.shop_id
          AND artist_id = v_session.artist_id
          AND status IN ('scheduled', 'in_progress')
          AND tstzrange(start_at, end_at, '[)') && tstzrange(v_requested_start_at, v_requested_end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Artist appointment overlap';
    END IF;

    -- Image Upload Verification
    v_real_count := COALESCE(cardinality(p_real_area_paths), 0);
    v_design_count := COALESCE(cardinality(p_design_ref_paths), 0);
    IF v_real_count > 5 OR v_design_count > 5 THEN RAISE EXCEPTION 'Maximum 5 files allowed per section'; END IF;

    IF v_session.work_type IN ('extension', 'touch_up', 'cover_up', 'scar_cover') AND v_real_count = 0 THEN
        RAISE EXCEPTION 'Real area photo required for this work type';
    END IF;

    v_all_paths := COALESCE(p_real_area_paths, ARRAY[]::text[]) || COALESCE(p_design_ref_paths, ARRAY[]::text[]);
    v_total_paths := cardinality(v_all_paths);

    IF v_total_paths > 0 THEN
        SELECT COUNT(DISTINCT path)::integer INTO v_distinct_paths FROM unnest(v_all_paths) AS path;
        IF v_total_paths != v_distinct_paths THEN RAISE EXCEPTION 'Duplicate files provided'; END IF;

        v_expected_prefix := v_session.shop_id::text || '/' || p_session_id::text || '/';
        FOREACH v_path IN ARRAY v_all_paths
        LOOP
            IF v_path NOT LIKE v_expected_prefix || '%' THEN
                RAISE EXCEPTION 'Invalid file path location';
            END IF;

            SELECT mime_type INTO v_meta_mime FROM private.public_booking_uploaded_files_metadata WHERE session_id = p_session_id AND file_path = v_path;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Unregistered or unverified file';
            END IF;
        END LOOP;
    END IF;

    -- Insert records
    INSERT INTO public.customers (shop_id, full_name, phone_normalized, email, source)
    VALUES (v_session.shop_id, p_full_name, v_phone_norm, v_email_val, 'online')
    ON CONFLICT (shop_id, phone_normalized) DO UPDATE SET full_name = EXCLUDED.full_name RETURNING id INTO v_customer_id;

    INSERT INTO public.tattoo_projects (shop_id, customer_id, artist_id, name, tattoo_style, body_placement, width_cm, height_cm, status)
    VALUES (v_session.shop_id, v_customer_id, v_session.artist_id, 'Online Booking Project', v_style_name, p_placement, v_width_val, v_height_val, 'proposed') RETURNING id INTO v_project_id;

    INSERT INTO public.booking_requests (
        shop_id, project_id, customer_id, artist_id, requested_start_at, requested_end_at, status,
        submitted_full_name, submitted_phone, submitted_email, customer_note, health_note,
        real_area_images, design_reference_images
    )
    VALUES (
        v_session.shop_id, v_project_id, v_customer_id, v_session.artist_id, v_requested_start_at, v_requested_end_at, 'pending_payment',
        p_full_name, v_phone_norm, v_email_val, p_description, p_health_note,
        COALESCE(p_real_area_paths, ARRAY[]::text[]), COALESCE(p_design_ref_paths, ARRAY[]::text[])
    ) RETURNING id INTO v_booking_id;

    -- Insert payment item
    INSERT INTO public.payments (shop_id, customer_id, project_id, booking_request_id, payment_type, amount, status)
    VALUES (
        v_session.shop_id, v_customer_id, v_project_id, v_booking_id, 'deposit',
        (SELECT default_deposit_amount FROM public.shop_booking_settings WHERE shop_id = v_session.shop_id),
        'pending'
    );

    UPDATE private.public_booking_upload_sessions SET status = 'consumed', booking_request_id = v_booking_id, consumed_at = now() WHERE id = p_session_id;

    RETURN v_booking_id;
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

REVOKE ALL ON FUNCTION public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_public_booking(uuid, numeric, numeric, text, text, text, text, text, text, text, text, text[], text[], boolean) TO anon;


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
