import sys

sql = """-- RLS POLICIES FOR ALL TABLES

CREATE POLICY "Owner sees all customers, Artist sees assigned" ON public.customers FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = customers.shop_id AND user_id = auth.uid() AND status = 'active' AND role = 'owner') OR
    EXISTS (SELECT 1 FROM public.tattoo_projects WHERE customer_id = customers.id AND artist_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.booking_requests WHERE customer_id = customers.id AND artist_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.appointments WHERE customer_id = customers.id AND artist_id = auth.uid())
);

CREATE POLICY "Owner sees all projects, Artist sees assigned" ON public.tattoo_projects FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = tattoo_projects.shop_id AND user_id = auth.uid() AND status = 'active' AND role = 'owner') OR artist_id = auth.uid()
);

CREATE POLICY "Owner sees all bookings, Artist sees assigned" ON public.booking_requests FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = booking_requests.shop_id AND user_id = auth.uid() AND status = 'active' AND role = 'owner') OR artist_id = auth.uid()
);

CREATE POLICY "Owner sees all appointments, Artist sees assigned" ON public.appointments FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = appointments.shop_id AND user_id = auth.uid() AND status = 'active' AND role = 'owner') OR artist_id = auth.uid()
);

CREATE POLICY "Owner sees all payments, Artist sees assigned" ON public.payments FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = payments.shop_id AND user_id = auth.uid() AND status = 'active' AND role = 'owner') OR
    EXISTS (SELECT 1 FROM public.tattoo_projects WHERE id = payments.project_id AND artist_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.booking_requests WHERE id = payments.booking_request_id AND artist_id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.appointments WHERE id = payments.appointment_id AND artist_id = auth.uid())
);

CREATE POLICY "Owner sees all availability, Artist sees own" ON public.artist_availability_slots FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = artist_availability_slots.shop_id AND user_id = auth.uid() AND status = 'active' AND role = 'owner') OR artist_id = auth.uid()
);

CREATE POLICY "Owner sees all references, Artist sees assigned" ON public.tattoo_project_references FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = tattoo_project_references.shop_id AND user_id = auth.uid() AND status = 'active' AND role = 'owner') OR
    EXISTS (SELECT 1 FROM public.tattoo_projects WHERE id = tattoo_project_references.project_id AND artist_id = auth.uid())
);


-- STORAGE BUCKETS & LIMITS
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES ('tattoo-references', 'tattoo-references', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']) ON CONFLICT (id) DO UPDATE SET file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) 
VALUES ('payment-proofs', 'payment-proofs', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']) ON CONFLICT (id) DO UPDATE SET file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

CREATE POLICY "Staff reads tattoo references" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'tattoo-references' AND (
        EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = (string_to_array(name, '/'))[1]::uuid AND user_id = auth.uid() AND status = 'active' AND role = 'owner') OR 
        EXISTS (SELECT 1 FROM public.tattoo_projects WHERE id = (string_to_array(name, '/'))[2]::uuid AND artist_id = auth.uid())
    )
);

CREATE POLICY "Staff reads payment proofs" ON storage.objects FOR SELECT TO authenticated USING (
    bucket_id = 'payment-proofs' AND (
        EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = (string_to_array(name, '/'))[1]::uuid AND user_id = auth.uid() AND status = 'active' AND role = 'owner') OR 
        EXISTS (SELECT 1 FROM public.booking_requests WHERE id = (string_to_array(name, '/'))[2]::uuid AND artist_id = auth.uid()) OR 
        EXISTS (SELECT 1 FROM public.payments WHERE id = (string_to_array(name, '/'))[2]::uuid AND EXISTS (SELECT 1 FROM public.tattoo_projects WHERE id = payments.project_id AND artist_id = auth.uid()))
    )
);

-- PUBLIC RPCS

CREATE OR REPLACE FUNCTION public.get_public_artists_by_shop_slug(p_slug text)
RETURNS TABLE (artist_id uuid, display_name text, avatar_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.display_name, p.avatar_url
    FROM public.profiles p
    JOIN public.shop_members sm ON p.id = sm.user_id
    JOIN public.shops s ON sm.shop_id = s.id
    WHERE s.slug = p_slug AND sm.status = 'active' AND sm.role = 'artist';
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_artists_by_shop_slug(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_artists_by_shop_slug(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_artists_by_shop_slug(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artists_by_shop_slug(text) TO anon;

CREATE OR REPLACE FUNCTION public.get_public_artist_availability(p_shop_id uuid, p_artist_id uuid)
RETURNS TABLE (slot_id uuid, start_at timestamptz, end_at timestamptz, available boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_artist_id AND status = 'active' AND role = 'artist') THEN
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
REVOKE EXECUTE ON FUNCTION public.get_public_artist_availability(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_artist_availability(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_artist_availability(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_artist_availability(uuid, uuid) TO anon;


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
    
    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_shop.id AND user_id = v_slot.artist_id AND status = 'active' AND role = 'artist') THEN RAISE EXCEPTION 'Artist not active'; END IF;
    
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
REVOKE EXECUTE ON FUNCTION public.create_public_booking_request(text, uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_public_booking_request(text, uuid, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_public_booking_request(text, uuid, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_public_booking_request(text, uuid, text, text, text, text, text) TO anon;

CREATE OR REPLACE FUNCTION public.get_public_booking_status(p_public_token uuid)
RETURNS TABLE (booking_status text, shop_name text, artist_name text, requested_start_at timestamptz, requested_end_at timestamptz, payment_status text, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    RETURN QUERY
    SELECT br.status, s.name, p.display_name, br.requested_start_at, br.requested_end_at, pay.status, 'Your booking is ' || br.status
    FROM public.booking_requests br
    JOIN public.shops s ON br.shop_id = s.id
    JOIN public.profiles p ON br.artist_id = p.id
    LEFT JOIN public.payments pay ON br.id = pay.booking_request_id AND pay.payment_type = 'deposit'
    WHERE br.public_token = p_public_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_public_booking_status(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_public_booking_status(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_public_booking_status(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_booking_status(uuid) TO anon;


CREATE OR REPLACE FUNCTION public.submit_public_payment_slip(p_public_token uuid, p_storage_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_booking record;
    v_payment record;
BEGIN
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid token'; END IF;
    IF v_booking.status != 'pending_payment' THEN RAISE EXCEPTION 'Booking not awaiting payment'; END IF;
    
    SELECT * INTO v_payment FROM public.payments WHERE booking_request_id = v_booking.id AND payment_type = 'deposit' AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No pending deposit found'; END IF;
    
    UPDATE public.payments SET status = 'verification_pending', proof_storage_path = p_storage_path, proof_submitted_at = now(), updated_at = now() WHERE id = v_payment.id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_public_payment_slip(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_public_payment_slip(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_public_payment_slip(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_payment_slip(uuid, text) TO anon;

-- STAFF RPCS

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
    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_artist_id AND status = 'active' AND role = 'artist') THEN RAISE EXCEPTION 'Artist not active'; END IF;
    IF p_start_at >= p_end_at THEN RAISE EXCEPTION 'Invalid time range'; END IF;
    
    IF EXISTS (SELECT 1 FROM public.artist_availability_slots WHERE artist_id = p_artist_id AND status IN ('open', 'held', 'booked', 'blocked') AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')) THEN RAISE EXCEPTION 'Availability overlap'; END IF;
    IF EXISTS (SELECT 1 FROM public.appointments WHERE artist_id = p_artist_id AND status IN ('scheduled', 'in_progress') AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')) THEN RAISE EXCEPTION 'Appointment overlap'; END IF;

    INSERT INTO public.artist_availability_slots (shop_id, artist_id, start_at, end_at, status, created_by)
    VALUES (p_shop_id, p_artist_id, p_start_at, p_end_at, 'open', v_user_id) RETURNING id INTO v_slot_id;
    RETURN v_slot_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_availability_slot(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_availability_slot(uuid, uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_availability_slot(uuid, uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_availability_slot(uuid, uuid, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_availability_slot(p_slot_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_slot record;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT * INTO v_slot FROM public.artist_availability_slots WHERE id = p_slot_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Slot not found'; END IF;
    
    SELECT role INTO v_role FROM public.shop_members WHERE shop_id = v_slot.shop_id AND user_id = v_user_id AND status = 'active';
    IF v_role IS NULL OR (v_role = 'artist' AND v_slot.artist_id != v_user_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    IF v_slot.status = 'booked' AND EXISTS (SELECT 1 FROM public.appointments WHERE artist_id = v_slot.artist_id AND status IN ('scheduled', 'in_progress') AND tstzrange(start_at, end_at, '[)') && tstzrange(v_slot.start_at, v_slot.end_at, '[)')) THEN
        RAISE EXCEPTION 'Cannot cancel booked slot with active appointment';
    END IF;
    
    IF v_slot.status = 'held' THEN
        UPDATE public.booking_requests SET status = 'cancelled', cancelled_by = v_user_id, cancelled_at = now() WHERE id = v_slot.held_by_booking_request_id;
        UPDATE public.payments SET status = 'cancelled' WHERE booking_request_id = v_slot.held_by_booking_request_id AND status IN ('pending', 'verification_pending');
    END IF;
    
    UPDATE public.artist_availability_slots SET status = 'cancelled', held_until = NULL, held_by_booking_request_id = NULL, updated_at = now() WHERE id = p_slot_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_availability_slot(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_availability_slot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_availability_slot(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_availability_slot(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.reject_booking_request(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_booking record;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT * INTO v_booking FROM public.booking_requests WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
    
    SELECT role INTO v_role FROM public.shop_members WHERE shop_id = v_booking.shop_id AND user_id = v_user_id AND status = 'active';
    IF v_role IS NULL OR (v_role = 'artist' AND v_booking.artist_id != v_user_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    IF v_booking.status NOT IN ('pending_review', 'changes_requested') THEN RAISE EXCEPTION 'Invalid state for rejection'; END IF;
    
    IF EXISTS (SELECT 1 FROM public.payments WHERE booking_request_id = p_booking_id AND payment_type = 'deposit' AND status = 'paid') THEN
        UPDATE public.payments SET status = 'refund_pending', updated_at = now() WHERE booking_request_id = p_booking_id AND payment_type = 'deposit' AND status = 'paid';
    END IF;
    
    UPDATE public.booking_requests SET status = 'rejected', rejected_by = v_user_id, rejected_at = now(), updated_at = now() WHERE id = p_booking_id;
    UPDATE public.artist_availability_slots SET status = 'open', held_until = NULL, held_by_booking_request_id = NULL WHERE held_by_booking_request_id = p_booking_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reject_booking_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_booking_request(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reject_booking_request(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_booking_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_booking_changes(p_booking_id uuid, p_staff_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_booking record;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT * INTO v_booking FROM public.booking_requests WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
    
    SELECT role INTO v_role FROM public.shop_members WHERE shop_id = v_booking.shop_id AND user_id = v_user_id AND status = 'active';
    IF v_role IS NULL OR (v_role = 'artist' AND v_booking.artist_id != v_user_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    IF v_booking.status != 'pending_review' THEN RAISE EXCEPTION 'Invalid state'; END IF;
    
    UPDATE public.booking_requests SET status = 'changes_requested', staff_note = p_staff_note, updated_at = now() WHERE id = p_booking_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.request_booking_changes(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_booking_changes(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_booking_changes(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.request_booking_changes(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_staff_appointment(
    p_shop_id uuid, p_artist_id uuid, p_full_name text, p_phone text, p_start_at timestamptz, p_end_at timestamptz, p_notes text
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
    IF NOT EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = p_shop_id AND user_id = p_artist_id AND status = 'active' AND role = 'artist') THEN RAISE EXCEPTION 'Artist not active'; END IF;
    
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
REVOKE EXECUTE ON FUNCTION public.create_staff_appointment(uuid, uuid, text, text, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_staff_appointment(uuid, uuid, text, text, timestamptz, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_staff_appointment(uuid, uuid, text, text, timestamptz, timestamptz, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_staff_appointment(uuid, uuid, text, text, timestamptz, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_project_session(
    p_project_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_proj record;
    v_next_sess integer;
    v_app_id uuid;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT * INTO v_proj FROM public.tattoo_projects WHERE id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
    
    SELECT role INTO v_role FROM public.shop_members WHERE shop_id = v_proj.shop_id AND user_id = v_user_id AND status = 'active';
    IF v_role IS NULL OR (v_role = 'artist' AND v_proj.artist_id != v_user_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_proj.status != 'active' THEN RAISE EXCEPTION 'Project not active'; END IF;
    
    IF EXISTS (SELECT 1 FROM public.appointments WHERE artist_id = v_proj.artist_id AND status IN ('scheduled', 'in_progress') AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')) THEN RAISE EXCEPTION 'Appointment conflict'; END IF;
    IF EXISTS (SELECT 1 FROM public.artist_availability_slots WHERE artist_id = v_proj.artist_id AND status IN ('held', 'booked') AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')) THEN RAISE EXCEPTION 'Slot conflict'; END IF;
    
    SELECT COALESCE(MAX(session_number), 0) + 1 INTO v_next_sess FROM public.appointments WHERE project_id = p_project_id;
    
    INSERT INTO public.appointments (shop_id, project_id, customer_id, artist_id, session_number, start_at, end_at, status, notes, created_by)
    VALUES (v_proj.shop_id, v_proj.id, v_proj.customer_id, v_proj.artist_id, v_next_sess, p_start_at, p_end_at, 'scheduled', p_notes, v_user_id) RETURNING id INTO v_app_id;
    RETURN v_app_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.create_project_session(uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_project_session(uuid, timestamptz, timestamptz, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_project_session(uuid, timestamptz, timestamptz, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_session(uuid, timestamptz, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_app record;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT * INTO v_app FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Appointment not found'; END IF;
    
    SELECT role INTO v_role FROM public.shop_members WHERE shop_id = v_app.shop_id AND user_id = v_user_id AND status = 'active';
    IF v_role IS NULL OR (v_role = 'artist' AND v_app.artist_id != v_user_id) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    IF v_app.status IN ('completed', 'cancelled') THEN RAISE EXCEPTION 'Invalid state for cancellation'; END IF;
    
    UPDATE public.appointments SET status = 'cancelled', cancelled_by = v_user_id, cancelled_at = now(), updated_at = now() WHERE id = p_appointment_id;
    
    IF v_app.booking_request_id IS NOT NULL THEN
        UPDATE public.artist_availability_slots SET status = 'open', held_until = NULL, held_by_booking_request_id = NULL WHERE held_by_booking_request_id = v_app.booking_request_id;
    END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.cancel_appointment(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_appointment(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_appointment(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_appointment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.verify_manual_payment(p_payment_id uuid, p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_payment record;
    v_is_authorized boolean := false;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
    
    IF EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_payment.shop_id AND user_id = v_user_id AND status = 'active' AND role = 'owner') THEN
        v_is_authorized := true;
    ELSIF EXISTS (SELECT 1 FROM public.tattoo_projects WHERE id = v_payment.project_id AND artist_id = v_user_id) OR 
          EXISTS (SELECT 1 FROM public.booking_requests WHERE id = v_payment.booking_request_id AND artist_id = v_user_id) OR 
          EXISTS (SELECT 1 FROM public.appointments WHERE id = v_payment.appointment_id AND artist_id = v_user_id) THEN
        v_is_authorized := true;
    END IF;
    IF NOT v_is_authorized THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    IF v_payment.status != 'verification_pending' THEN RAISE EXCEPTION 'Payment not pending verification'; END IF;
    IF p_status NOT IN ('paid', 'failed') THEN RAISE EXCEPTION 'Invalid status transition'; END IF;
    
    UPDATE public.payments SET status = p_status, verified_by = v_user_id, verified_at = now(), updated_at = now() WHERE id = p_payment_id;
    
    IF p_status = 'paid' AND v_payment.booking_request_id IS NOT NULL THEN
        UPDATE public.booking_requests SET status = 'pending_review', updated_at = now() WHERE id = v_payment.booking_request_id AND status = 'pending_payment';
    END IF;
    
    IF p_status = 'failed' AND v_payment.booking_request_id IS NOT NULL THEN
        UPDATE public.artist_availability_slots SET status = 'open', held_until = NULL, held_by_booking_request_id = NULL WHERE held_by_booking_request_id = v_payment.booking_request_id;
        UPDATE public.booking_requests SET status = 'expired' WHERE id = v_payment.booking_request_id;
    END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_manual_payment(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verify_manual_payment(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verify_manual_payment(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_manual_payment(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_booking_request(p_booking_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_booking record;
    v_slot record;
    v_is_authorized boolean := false;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    SELECT * INTO v_booking FROM public.booking_requests WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
    
    IF EXISTS (SELECT 1 FROM public.shop_members WHERE shop_id = v_booking.shop_id AND user_id = v_user_id AND status = 'active' AND role = 'owner') OR v_booking.artist_id = v_user_id THEN
        v_is_authorized := true;
    END IF;
    IF NOT v_is_authorized THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    IF v_booking.status NOT IN ('pending_review', 'changes_requested') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
    
    IF EXISTS (SELECT 1 FROM public.shop_booking_settings WHERE shop_id = v_booking.shop_id AND deposit_required = true) THEN
        IF NOT EXISTS (SELECT 1 FROM public.payments WHERE booking_request_id = p_booking_id AND payment_type = 'deposit' AND status = 'paid') THEN RAISE EXCEPTION 'Deposit unpaid'; END IF;
    END IF;
    
    SELECT * INTO v_slot FROM public.artist_availability_slots WHERE id = v_booking.availability_slot_id FOR UPDATE;
    IF NOT FOUND OR v_slot.shop_id != v_booking.shop_id OR v_slot.artist_id != v_booking.artist_id OR v_slot.status != 'held' OR v_slot.held_by_booking_request_id != v_booking.id THEN RAISE EXCEPTION 'Slot invalid'; END IF;
    
    IF EXISTS (SELECT 1 FROM public.appointments WHERE artist_id = v_booking.artist_id AND status IN ('scheduled', 'in_progress') AND tstzrange(start_at, end_at, '[)') && tstzrange(v_booking.requested_start_at, v_booking.requested_end_at, '[)')) THEN RAISE EXCEPTION 'Time conflict'; END IF;
    
    INSERT INTO public.appointments (shop_id, project_id, booking_request_id, customer_id, artist_id, session_number, start_at, end_at, status, created_by)
    VALUES (v_booking.shop_id, v_booking.project_id, v_booking.id, v_booking.customer_id, v_booking.artist_id, 1, v_booking.requested_start_at, v_booking.requested_end_at, 'scheduled', v_user_id);
    
    UPDATE public.artist_availability_slots SET status = 'booked', held_until = NULL, updated_at = now() WHERE id = v_slot.id;
    UPDATE public.tattoo_projects SET status = 'active', updated_at = now() WHERE id = v_booking.project_id;
    UPDATE public.booking_requests SET status = 'approved', approved_by = v_user_id, approved_at = now(), updated_at = now() WHERE id = p_booking_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.approve_booking_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_booking_request(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_booking_request(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_booking_request(uuid) TO authenticated;
"""

with open("C:/Users/Thanoo Armee/Downloads/โฟลเดอร์ใหม่ (3)/supabase/migrations/20260819000600_step_6a_06_rls_and_rpcs.sql", "w", encoding="utf-8") as f:
    f.write(sql)
