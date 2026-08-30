-- Fix trg_fn_booking_notifications: use full_name instead of display_name
-- (profiles table has full_name, not display_name)

CREATE OR REPLACE FUNCTION public.trg_fn_booking_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_artist_name text;
    v_flash_code text;
    v_recipient RECORD;
    v_title text;
    v_message text;
    v_type text;
BEGIN
    -- Get artist full name
    SELECT full_name INTO v_artist_name 
    FROM public.profiles 
    WHERE id = NEW.artist_id;

    IF NEW.flash_design_id IS NOT NULL THEN
        -- Flash Booking
        SELECT flash_code INTO v_flash_code 
        FROM public.flash_designs 
        WHERE id = NEW.flash_design_id;

        v_type := 'NEW_FLASH_BOOKING';
        v_title := 'มีคำขอจอง Flash ใหม่';
        v_message := 'ลาย: ' || COALESCE(v_flash_code, '') || ' / ลูกค้า: ' || NEW.submitted_full_name || ' / ช่าง: ' || COALESCE(v_artist_name, '');
    ELSE
        -- Custom Booking
        v_type := 'NEW_CUSTOM_BOOKING';
        v_title := 'มีคำขอจองคิวสักใหม่';
        v_message := 'ลูกค้า: ' || NEW.submitted_full_name || ' / วันที่: ' || to_char(NEW.requested_start_at, 'DD/MM/YYYY') || ' / ช่าง: ' || COALESCE(v_artist_name, '');
    END IF;

    -- Query recipients (Owner + Assigned Artist, distinct to prevent duplicate)
    FOR v_recipient IN 
        SELECT DISTINCT user_id 
        FROM public.shop_members 
        WHERE shop_id = NEW.shop_id 
          AND status = 'active' 
          AND (role = 'owner' OR user_id = NEW.artist_id)
    LOOP
        INSERT INTO public.notifications (
            shop_id,
            recipient_user_id,
            type,
            title,
            message,
            booking_request_id,
            is_read
        ) VALUES (
            NEW.shop_id,
            v_recipient.user_id,
            v_type,
            v_title,
            v_message,
            NEW.id,
            false
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
