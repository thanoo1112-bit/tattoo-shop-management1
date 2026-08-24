-- RESCHEDULE APPOINTMENT SESSION RPC
CREATE OR REPLACE FUNCTION public.reschedule_appointment_session(
  p_appointment_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role text;
    v_app record;
BEGIN
    -- 1. AUTHORIZATION - User must be authenticated
    IF v_user_id IS NULL THEN 
        RAISE EXCEPTION 'Unauthorized'; 
    END IF;

    -- 2. APPOINTMENT LOOKUP
    SELECT * INTO v_app FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Appointment not found'; 
    END IF;
    
    -- 3. ALLOWED STATUS GUARD
    IF v_app.status != 'scheduled' THEN
        RAISE EXCEPTION 'Only scheduled sessions can be rescheduled';
    END IF;

    -- 4. AUTHORIZATION - Verify permissions (Artist owner of appointment or Shop owner/admin)
    SELECT role INTO v_role FROM public.shop_members 
    WHERE shop_id = v_app.shop_id AND user_id = v_user_id AND status = 'active';
    
    IF v_role IS NULL OR (v_role = 'artist' AND v_app.artist_id != v_user_id) THEN 
        RAISE EXCEPTION 'Unauthorized'; 
    END IF;

    -- 5. TIME VALIDATION
    IF p_start_at IS NULL OR p_end_at IS NULL THEN
        RAISE EXCEPTION 'Invalid time range';
    END IF;
    IF p_start_at >= p_end_at THEN 
        RAISE EXCEPTION 'Invalid time range'; 
    END IF;

    -- 6. APPOINTMENT OVERLAP CHECK (SELF-EXCLUSION)
    IF EXISTS (
        SELECT 1 FROM public.appointments 
        WHERE artist_id = v_app.artist_id 
          AND status IN ('scheduled', 'in_progress') 
          AND id != p_appointment_id
          AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
    ) THEN 
        RAISE EXCEPTION 'Appointment conflict'; 
    END IF;

    -- 7. AVAILABILITY SLOT CHECK (SELF-EXCLUSION if matching current booking request)
    IF EXISTS (
        SELECT 1 FROM public.artist_availability_slots 
        WHERE artist_id = v_app.artist_id 
          AND status IN ('held', 'booked') 
          AND (v_app.booking_request_id IS NULL OR held_by_booking_request_id IS NULL OR held_by_booking_request_id != v_app.booking_request_id)
          AND tstzrange(start_at, end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
    ) THEN 
        RAISE EXCEPTION 'Slot conflict'; 
    END IF;

    -- 8. UPDATE ONLY SCHEDULE FIELDS
    UPDATE public.appointments 
    SET start_at = p_start_at,
        end_at = p_end_at,
        updated_at = now()
    WHERE id = p_appointment_id;

    RETURN p_appointment_id;
END;
$$;

-- Security & Exec Privileges
REVOKE EXECUTE ON FUNCTION public.reschedule_appointment_session(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reschedule_appointment_session(uuid, timestamptz, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reschedule_appointment_session(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment_session(uuid, timestamptz, timestamptz) TO authenticated;
