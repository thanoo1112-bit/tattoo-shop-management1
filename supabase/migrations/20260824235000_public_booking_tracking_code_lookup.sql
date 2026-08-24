-- Migration: Public Booking Tracking Code Lookup RPC
-- Description: Creates public.get_public_booking_tracking_code(text, uuid) to safely retrieve
-- the short tracking code for a specific booking request using the shop slug and public token.

CREATE OR REPLACE FUNCTION public.get_public_booking_tracking_code(
    p_shop_slug text,
    p_public_token uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_shop_id uuid;
    v_tracking_code text;
BEGIN
    -- Find shop ID
    SELECT id INTO v_shop_id 
    FROM public.shops 
    WHERE slug = p_shop_slug;

    IF v_shop_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Find tracking code by shop and public token
    SELECT tracking_code INTO v_tracking_code
    FROM public.booking_requests
    WHERE shop_id = v_shop_id
      AND public_token = p_public_token;

    RETURN v_tracking_code;
END;
$$;

-- Revoke all permissions from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.get_public_booking_tracking_code(text, uuid) FROM PUBLIC, anon, authenticated;
-- Grant execute permissions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_public_booking_tracking_code(text, uuid) TO anon, authenticated;
