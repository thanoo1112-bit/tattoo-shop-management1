-- ==============================================================================
-- Add Actual Started/Ended Times and Session workflow RPCs
-- ==============================================================================

-- 1. Add actual started and ended times to public.appointments
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS actual_started_at timestamp with time zone NULL,
ADD COLUMN IF NOT EXISTS actual_ended_at timestamp with time zone NULL;

-- Add time consistency check constraint
ALTER TABLE public.appointments
DROP CONSTRAINT IF EXISTS appointments_actual_times_check;

ALTER TABLE public.appointments
ADD CONSTRAINT appointments_actual_times_check CHECK (
  actual_ended_at IS NULL OR (
    actual_started_at IS NOT NULL
    AND actual_started_at <= actual_ended_at
  )
);

-- 2. Create Start Appointment Session RPC
CREATE OR REPLACE FUNCTION public.start_appointment_session(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_appointment record;
    v_is_authorized boolean := false;
    v_now timestamptz := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_appointment FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment not found';
    END IF;

    -- Authorization check
    IF EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_appointment.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'owner'
    ) THEN
        v_is_authorized := true;
    ELSIF v_appointment.artist_id = v_user_id AND EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_appointment.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'artist'
    ) THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Unauthorized to start this session';
    END IF;

    IF v_appointment.status != 'scheduled' THEN
        RAISE EXCEPTION 'Can only start a scheduled session';
    END IF;

    IF v_appointment.actual_started_at IS NOT NULL THEN
        RAISE EXCEPTION 'Session has already started';
    END IF;

    -- Project active check
    IF v_appointment.project_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tattoo_projects 
            WHERE id = v_appointment.project_id AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Cannot start session: Associated project is not active';
        END IF;
    END IF;

    UPDATE public.appointments 
    SET status = 'in_progress',
        actual_started_at = v_now,
        updated_at = v_now
    WHERE id = p_appointment_id;

    RETURN jsonb_build_object(
        'appointment_id', p_appointment_id,
        'status', 'in_progress',
        'actual_started_at', v_now
    );
END;
$$;

-- Secure execution
REVOKE ALL ON FUNCTION public.start_appointment_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_appointment_session(uuid) TO authenticated;

-- 3. Create Complete Appointment Session RPC
CREATE OR REPLACE FUNCTION public.complete_appointment_session(p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_appointment record;
    v_is_authorized boolean := false;
    v_now timestamptz := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO v_appointment FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment not found';
    END IF;

    -- Authorization check
    IF EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_appointment.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'owner'
    ) THEN
        v_is_authorized := true;
    ELSIF v_appointment.artist_id = v_user_id AND EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_appointment.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'artist'
    ) THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Unauthorized to complete this session';
    END IF;

    IF v_appointment.status != 'in_progress' THEN
        RAISE EXCEPTION 'Can only complete an in_progress session';
    END IF;

    IF v_appointment.actual_started_at IS NULL THEN
        RAISE EXCEPTION 'Session has not started yet';
    END IF;

    IF v_appointment.actual_ended_at IS NOT NULL THEN
        RAISE EXCEPTION 'Session has already ended';
    END IF;

    -- Project active check
    IF v_appointment.project_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tattoo_projects 
            WHERE id = v_appointment.project_id AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Cannot complete session: Associated project is not active';
        END IF;
    END IF;

    UPDATE public.appointments 
    SET status = 'completed',
        actual_ended_at = v_now,
        updated_at = v_now
    WHERE id = p_appointment_id;

    RETURN jsonb_build_object(
        'appointment_id', p_appointment_id,
        'status', 'completed',
        'actual_started_at', v_appointment.actual_started_at,
        'actual_ended_at', v_now
    );
END;
$$;

-- Secure execution
REVOKE ALL ON FUNCTION public.complete_appointment_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_appointment_session(uuid) TO authenticated;
