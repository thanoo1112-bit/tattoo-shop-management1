-- Migration: Create notifications table and setup RLS + notification triggers

CREATE TABLE public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    booking_request_id uuid REFERENCES public.booking_requests(id) ON DELETE SET NULL,
    payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Select policy: User can only select their own notifications
CREATE POLICY select_notifications ON public.notifications
    FOR SELECT TO authenticated USING (recipient_user_id = auth.uid());

-- Update policy: User can update their own notifications (e.g. mark as read)
CREATE POLICY update_notifications ON public.notifications
    FOR UPDATE TO authenticated USING (recipient_user_id = auth.uid());

-- Delete policy: User can delete their own notifications
CREATE POLICY delete_notifications ON public.notifications
    FOR DELETE TO authenticated USING (recipient_user_id = auth.uid());

-- Trigger function for new booking requests
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
    -- Get artist display name
    SELECT display_name INTO v_artist_name 
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

CREATE TRIGGER trg_booking_notifications
AFTER INSERT ON public.booking_requests
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_booking_notifications();

-- Trigger function for payment uploads
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
              AND (role = 'owner' OR (v_booking IS NOT NULL AND user_id = v_booking.artist_id))
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

CREATE TRIGGER trg_payment_notifications
AFTER UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_payment_notifications();
