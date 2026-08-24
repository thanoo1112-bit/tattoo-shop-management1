-- Migration: Fix ambiguity in get_effective_daily_capacity
-- Description: Adds table aliases to resolve ambiguity between OUT parameters and table columns.

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
AS $$
DECLARE
    v_override_cap integer;
    v_override_closed boolean;
    v_artist_cap integer;
    v_shop_cap integer;
BEGIN
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
$$;
REVOKE ALL ON FUNCTION public.get_effective_daily_capacity FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_daily_capacity TO authenticated;
