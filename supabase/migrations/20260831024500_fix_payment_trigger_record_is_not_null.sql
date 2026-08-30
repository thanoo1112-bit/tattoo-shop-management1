-- Fix trg_fn_payment_notifications: replace invalid "v_booking IS NOT NULL" row comparison 
-- with "v_booking.artist_id IS NOT NULL" to ensure artist gets notified.

CREATE OR REPLACE FUNCTION public.trg_fn_payment_notifications()
RETURNS TRIGGER AS $$
DECLARE
    v_recipient RECORD;
    v_title text;
    v_message text;
    v_type text;
    v_booking RECORD;
    v_artist_name text;
BEGIN
    -- Only trigger when status changes to 'verification_pending'
    IF NEW.status = 'verification_pending' AND (OLD.status IS DISTINCT FROM 'verification_pending') THEN
        -- Get booking details (if any)
        IF NEW.booking_request_id IS NOT NULL THEN
            SELECT * INTO v_booking FROM public.booking_requests WHERE id = NEW.booking_request_id;
        END IF;

        IF OLD.status = 'failed' THEN
            v_type := 'PAYMENT_PROOF_RESUBMITTED';
            v_title := 'ลูกค้าอัปโหลดสลิปใหม่';
            v_message := 'สลิปการชำระเงินของลูกค้า: ' || COALESCE(v_booking.submitted_full_name, 'ลูกค้า') || ' (จำนวน ฿' || to_char(NEW.amount, 'FM999,999,999') || ')';
        ELSE
            v_type := 'PAYMENT_PROOF_UPLOADED';
            v_title := 'มีสลิปการชำระเงินรอตรวจสอบ';
            v_message := 'สลิปการชำระเงินของลูกค้า: ' || COALESCE(v_booking.submitted_full_name, 'ลูกค้า') || ' (จำนวน ฿' || to_char(NEW.amount, 'FM999,999,999') || ')';
        END IF;

        -- Query recipients (Owner + Assigned Artist if exists)
        FOR v_recipient IN 
            SELECT DISTINCT user_id 
            FROM public.shop_members 
            WHERE shop_id = NEW.shop_id 
              AND status = 'active' 
              AND (role = 'owner' OR (v_booking.artist_id IS NOT NULL AND user_id = v_booking.artist_id))
        LOOP
            INSERT INTO public.notifications (
                shop_id,
                recipient_user_id,
                type,
                title,
                message,
                booking_request_id,
                payment_id,
                is_read
            ) VALUES (
                NEW.shop_id,
                v_recipient.user_id,
                v_type,
                v_title,
                v_message,
                NEW.booking_request_id,
                NEW.id,
                false
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
