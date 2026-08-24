-- Migration: Artist membership status management
-- Description: Adds a secure RPC for shop owners to deactivate or reactivate an artist's membership.

CREATE OR REPLACE FUNCTION public.set_artist_member_status(
    p_shop_id uuid,
    p_artist_id uuid,
    p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Verify owner
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id 
        AND user_id = v_user_id 
        AND role = 'owner' 
        AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Permission denied: Must be an active owner';
    END IF;

    -- Verify target artist
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id 
        AND user_id = p_artist_id 
        AND role = 'artist'
    ) THEN
        RAISE EXCEPTION 'Invalid artist or shop';
    END IF;

    IF p_status NOT IN ('active', 'inactive') THEN
        RAISE EXCEPTION 'Invalid status';
    END IF;

    UPDATE public.shop_members
    SET status = p_status,
        updated_at = now()
    WHERE shop_id = p_shop_id
      AND user_id = p_artist_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.set_artist_member_status(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_artist_member_status(uuid, uuid, text) TO authenticated;

-- Update get_effective_daily_capacity to check for active artist status
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
    -- 0. Check Artist Status
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = p_shop_id 
        AND user_id = p_artist_id 
        AND role = 'artist' 
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
