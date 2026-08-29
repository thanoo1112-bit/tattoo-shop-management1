-- Migration: Add shop_slug to get_public_bookings_by_phone RPC return fields
-- File: supabase/migrations/20260830100000_add_shop_slug_to_tracking_rpc.sql

DROP FUNCTION IF EXISTS public.get_public_bookings_by_phone(text);

CREATE OR REPLACE FUNCTION public.get_public_bookings_by_phone(p_phone text)
 RETURNS TABLE (
    booking_id          uuid,
    submitted_full_name text,
    submitted_email     text,
    submitted_phone     text,
    tracking_code       text,
    requested_start_at  timestamp with time zone,
    status              text,
    project_name        text,
    tattoo_style        text,
    color_mode          text,
    body_placement      text,
    width_cm            numeric,
    height_cm           numeric,
    artist_name         text,
    deposit_amount      numeric,
    deposit_status      text,
    public_token        uuid,
    flash_design_id     uuid,
    flash_code          text,
    flash_style         text,
    agreed_price        numeric,
    shop_slug           text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
DECLARE
    v_phone_norm text;
BEGIN
    -- Normalize search phone number
    v_phone_norm := regexp_replace(p_phone, '\D', '', 'g');
    
    IF length(v_phone_norm) < 9 THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        br.id AS booking_id,
        br.submitted_full_name,
        br.submitted_email,
        br.submitted_phone,
        br.tracking_code,
        br.requested_start_at,
        br.status,
        tp.name AS project_name,
        tp.tattoo_style,
        tp.color_mode,
        tp.body_placement,
        tp.width_cm,
        tp.height_cm,
        prof.full_name AS artist_name,
        pay.amount AS deposit_amount,
        pay.status AS deposit_status,
        br.public_token,
        br.flash_design_id,
        fd.flash_code,
        fd.style_name AS flash_style,
        tp.agreed_price AS agreed_price,
        s.slug AS shop_slug
    FROM public.booking_requests br
    JOIN public.tattoo_projects tp ON br.project_id = tp.id
    JOIN public.shops s ON br.shop_id = s.id
    LEFT JOIN public.flash_designs fd ON br.flash_design_id = fd.id
    LEFT JOIN public.profiles prof ON br.artist_id = prof.id
    LEFT JOIN public.customers cust ON br.customer_id = cust.id
    LEFT JOIN LATERAL (
        SELECT p.amount, p.status 
        FROM public.payments p 
        WHERE p.booking_request_id = br.id AND p.payment_type = 'deposit'
        ORDER BY p.created_at DESC 
        LIMIT 1
    ) pay ON true
    WHERE regexp_replace(br.submitted_phone, '\D', '', 'g') = v_phone_norm
       OR cust.phone_normalized = v_phone_norm
    ORDER BY br.created_at DESC;
END;
$$;

-- Grant EXECUTE to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_public_bookings_by_phone(text) TO anon, authenticated;
