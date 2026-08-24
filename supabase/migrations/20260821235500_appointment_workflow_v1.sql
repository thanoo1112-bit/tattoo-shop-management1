-- ==============================================================================
-- Appointment Workflow V1
-- ==============================================================================
-- Safe status transitions for starting and completing tattoo sessions.
--
-- Direct mutations to public.appointments remain blocked by RLS.
-- Changes are encapsulated in this SECURITY DEFINER function.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_appointment_status(
    p_appointment_id uuid,
    p_status text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_appointment record;
    v_is_authorized boolean := false;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Lock appointment for concurrency safety
    SELECT * INTO v_appointment FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Appointment not found';
    END IF;

    -- 1. Authorization
    -- Owner can update any appointment in their shop
    IF EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_appointment.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'owner'
    ) THEN
        v_is_authorized := true;
    -- Artist can update only their assigned appointments in their shop
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
        RAISE EXCEPTION 'Unauthorized to update this appointment';
    END IF;

    -- 2. Status Validation
    IF p_status NOT IN ('in_progress', 'completed') THEN
        RAISE EXCEPTION 'Invalid target status. Allowed values: in_progress, completed.';
    END IF;

    -- 3. Transition Rules
    IF p_status = 'in_progress' AND v_appointment.status != 'scheduled' THEN
        RAISE EXCEPTION 'Can only start a scheduled appointment.';
    END IF;

    IF p_status = 'completed' AND v_appointment.status != 'in_progress' THEN
        RAISE EXCEPTION 'Can only complete an in_progress appointment.';
    END IF;

    -- 4. Project Validation
    IF v_appointment.project_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tattoo_projects 
            WHERE id = v_appointment.project_id AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'Cannot start or complete appointment: Associated project is not active.';
        END IF;
    END IF;

    -- 5. Mutation
    UPDATE public.appointments 
    SET status = p_status,
        updated_at = now()
    WHERE id = p_appointment_id;

    RETURN p_status;
END;
$$;

-- Secure execution
REVOKE ALL ON FUNCTION public.update_appointment_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_appointment_status(uuid, text) TO authenticated;
