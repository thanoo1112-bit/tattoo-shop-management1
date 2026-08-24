CREATE OR REPLACE FUNCTION public.delete_availability_slot(p_slot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_slot public.artist_availability_slots%ROWTYPE;
    v_membership public.shop_members%ROWTYPE;
    v_history_count int;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- Lock the slot row
    SELECT * INTO v_slot
    FROM public.artist_availability_slots
    WHERE id = p_slot_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Slot not found';
    END IF;

    -- Verify membership
    SELECT * INTO v_membership
    FROM public.shop_members
    WHERE user_id = v_user_id 
      AND shop_id = v_slot.shop_id 
      AND status = 'active'
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unauthorized: Not an active member of this shop';
    END IF;

    -- Check Artist vs Owner authority
    IF v_membership.role = 'artist' THEN
        IF v_slot.artist_id != v_user_id THEN
            RAISE EXCEPTION 'Unauthorized: Artists can only delete their own slots';
        END IF;
    ELSIF v_membership.role = 'owner' THEN
        -- Owners can delete any slot in their shop
    ELSE
        RAISE EXCEPTION 'Unauthorized: Invalid role';
    END IF;

    -- Status check
    IF v_slot.status != 'open' THEN
        RAISE EXCEPTION 'ช่วงเวลานี้ไม่สามารถลบได้ในสถานะปัจจุบัน';
    END IF;

    -- Business history check
    SELECT count(*) INTO v_history_count
    FROM public.booking_requests
    WHERE availability_slot_id = p_slot_id;

    IF v_history_count > 0 THEN
        RAISE EXCEPTION 'ไม่สามารถลบช่วงเวลานี้ได้ เนื่องจากมีประวัติการจองที่เกี่ยวข้อง';
    END IF;

    -- Safe to delete
    DELETE FROM public.artist_availability_slots
    WHERE id = p_slot_id;

    IF NOT FOUND THEN
         RAISE EXCEPTION 'Failed to delete slot';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_availability_slot(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_availability_slot(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_availability_slot(uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.delete_availability_slot(uuid) TO authenticated;
