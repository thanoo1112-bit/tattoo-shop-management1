-- SQL Migration: Add release_public_flash_hold and seed shop settings
-- File: supabase/migrations/20260830000000_release_flash_hold_rpc.sql

-- 1. Create release_public_flash_hold RPC
CREATE OR REPLACE FUNCTION public.release_public_flash_hold(
    p_flash_id uuid,
    p_session_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_updated bigint;
BEGIN
    -- Only release hold if status is currently held, held_by_session_id matches,
    -- and there is no downstream booking request for this flash design that is active (not rejected/cancelled)
    UPDATE public.flash_designs
    SET status = 'open',
        held_by_session_id = NULL,
        held_expires_at = NULL,
        updated_at = now()
    WHERE id = p_flash_id
      AND status = 'held'
      AND held_by_session_id = p_session_id
      AND NOT EXISTS (
          SELECT 1 FROM public.booking_requests
          WHERE flash_design_id = p_flash_id
            AND status NOT IN ('rejected', 'cancelled')
      );

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

-- Grant execution to anon and authenticated
REVOKE ALL ON FUNCTION public.release_public_flash_hold(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_public_flash_hold(uuid, uuid) TO anon, authenticated;

-- 2. Seed shop_booking_settings safely if missing (do not overwrite)
INSERT INTO public.shop_booking_settings (shop_id, deposit_required, default_deposit_amount, currency, hold_minutes, default_daily_capacity)
SELECT 'f6a103ca-0fea-4c94-a57a-39ec85c14589', true, 500.00, 'THB', 30, 4
WHERE NOT EXISTS (
    SELECT 1 FROM public.shop_booking_settings WHERE shop_id = 'f6a103ca-0fea-4c94-a57a-39ec85c14589'
);
