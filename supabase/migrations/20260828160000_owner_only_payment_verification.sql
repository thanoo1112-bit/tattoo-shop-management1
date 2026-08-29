-- 1. Restructure verify_manual_payment to enforce Owner-only permission
CREATE OR REPLACE FUNCTION public.verify_manual_payment(
    p_payment_id uuid,
    p_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_payment record;
    v_booking record;
    v_is_authorized boolean := false;
BEGIN
    -- 1. Authentication check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Explicit NULL check
    IF p_status IS NULL THEN
        RAISE EXCEPTION 'Status must be specified';
    END IF;

    -- 3. Fetch and lock payment row
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found';
    END IF;

    -- 4. Active Membership / Authorization check (Owner only from same shop)
    IF EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_payment.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'owner'
    ) THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Unauthorized to verify this payment (Owner only)';
    END IF;

    -- 5. Check status transition
    IF v_payment.status != 'verification_pending' THEN
        RAISE EXCEPTION 'Payment is not pending verification';
    END IF;

    IF p_status NOT IN ('paid', 'failed') THEN
        RAISE EXCEPTION 'Invalid status transition';
    END IF;

    -- 6. Update payment status
    UPDATE public.payments 
    SET status = p_status, 
        verified_by = v_user_id, 
        verified_at = now(), 
        updated_at = now() 
    WHERE id = p_payment_id;

    -- 7. Conditional updates for booking requests on successful payment
    -- (Deposit-Only Finalization: only runs for payment_type = 'deposit')
    IF p_status = 'paid' AND v_payment.booking_request_id IS NOT NULL AND v_payment.payment_type = 'deposit' THEN
        SELECT * INTO v_booking FROM public.booking_requests WHERE id = v_payment.booking_request_id FOR UPDATE;
        
        IF v_booking.status = 'pending_payment' THEN
            -- Check if a valid (non-expired) hold exists
            IF EXISTS (
                SELECT 1 FROM public.booking_schedule_holds
                WHERE booking_request_id = v_booking.id
                  AND expires_at > now()
            ) THEN
                -- V2 flow: confirmed times exist, active hold exists, activate project, create appointment, and approve request.
                
                -- Lock artist profile row for serialization
                PERFORM 1 FROM public.profiles WHERE id = v_booking.artist_id FOR UPDATE;

                -- Delete/consume hold row (exempting it from trig checks)
                DELETE FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id;

                -- Create Appointment (Triggers overlap check automatically)
                INSERT INTO public.appointments (
                    shop_id,
                    project_id,
                    booking_request_id,
                    customer_id,
                    artist_id,
                    session_number,
                    start_at,
                    end_at,
                    status,
                    created_by
                )
                VALUES (
                    v_booking.shop_id,
                    v_booking.project_id,
                    v_booking.id,
                    v_booking.customer_id,
                    v_booking.artist_id,
                    1,
                    v_booking.confirmed_start_at,
                    v_booking.confirmed_end_at,
                    'scheduled',
                    v_user_id
                );

                -- Update project
                UPDATE public.tattoo_projects
                SET status = 'active',
                    updated_at = now()
                WHERE id = v_booking.project_id;

                -- Approve request (set final approver/verifier metadata)
                UPDATE public.booking_requests
                SET status = 'approved',
                    approved_by = v_user_id,
                    approved_at = now(),
                    updated_at = now()
                WHERE id = v_booking.id;

            ELSE
                -- V2 Expired hold flow: confirmed times exist but hold is expired or missing.
                -- Do NOT create appointment. Update request back to pending_review and clear confirmed times.
                UPDATE public.booking_requests
                SET status = 'pending_review',
                    confirmed_start_at = NULL,
                    confirmed_end_at = NULL,
                    updated_at = now()
                WHERE id = v_booking.id;
                
                -- Delete hold just in case it was stale (unexpired check failed)
                DELETE FROM public.booking_schedule_holds WHERE booking_request_id = v_booking.id;
            END IF;
        END IF;
    END IF;

    -- 8. Handle payment failure for booking requests
    IF p_status = 'failed' AND v_payment.booking_request_id IS NOT NULL THEN
        -- If payment fails, release capacity slots if any held_by_booking_request_id exists
        UPDATE public.artist_availability_slots 
        SET status = 'open', 
            held_until = NULL, 
            held_by_booking_request_id = NULL 
        WHERE held_by_booking_request_id = v_payment.booking_request_id;
        
        -- Cancel/delete hold
        DELETE FROM public.booking_schedule_holds WHERE booking_request_id = v_payment.booking_request_id;

        -- Cancel Tattoo Project
        UPDATE public.tattoo_projects
        SET status = 'cancelled',
            updated_at = now()
        WHERE id = v_payment.project_id;

        -- Expire the booking request
        UPDATE public.booking_requests 
        SET status = 'expired',
            updated_at = now()
        WHERE id = v_payment.booking_request_id;
    END IF;
END;
$$;

-- 2. Modify check constraint on flash_designs status to support 'sold'
ALTER TABLE public.flash_designs DROP CONSTRAINT IF EXISTS flash_designs_status_check;
ALTER TABLE public.flash_designs ADD CONSTRAINT flash_designs_status_check CHECK (status IN ('open', 'closed', 'held', 'reserved', 'sold'));

-- 3. Update trg_booking_request_flash_status_sync trigger function to update status to 'sold' on booking approval
CREATE OR REPLACE FUNCTION public.trg_booking_request_flash_status_sync()
RETURNS trigger AS $$
BEGIN
    IF NEW.flash_design_id IS NOT NULL THEN
        IF NEW.status = 'approved' THEN
            UPDATE public.flash_designs
            SET status             = 'sold',
                booking_request_id = NEW.id,
                held_by_session_id = NULL,
                held_expires_at    = NULL,
                updated_at         = now()
            WHERE id = NEW.flash_design_id
              AND status != 'sold';

        ELSIF NEW.status IN ('rejected', 'cancelled', 'expired') THEN
            UPDATE public.flash_designs
            SET status             = 'open',
                booking_request_id = NULL,
                held_by_session_id = NULL,
                held_expires_at    = NULL,
                updated_at         = now()
            WHERE id     = NEW.flash_design_id
              AND status IN ('reserved', 'held');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Update trg_flash_owner_status_guard to restrict toggling status of a sold design
CREATE OR REPLACE FUNCTION public.trg_flash_owner_status_guard()
RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'sold' AND NEW.status IS DISTINCT FROM 'sold' THEN
        RAISE EXCEPTION 'Cannot change status of a sold Flash design';
    END IF;
    
    IF OLD.status IN ('reserved', 'held') AND NEW.status IN ('open', 'closed') THEN
        IF EXISTS (
            SELECT 1 FROM public.booking_requests
            WHERE flash_design_id = OLD.id
              AND status IN ('pending_review', 'pending_payment', 'approved')
        ) THEN
            RAISE EXCEPTION 'Cannot change Flash status while an active booking exists';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Re-declare edit lock trigger to include 'sold'
CREATE OR REPLACE FUNCTION public.trg_flash_designs_edit_lock()
RETURNS trigger AS $$
BEGIN
    IF OLD.status IN ('held', 'reserved', 'sold') THEN
        IF OLD.image_path IS DISTINCT FROM NEW.image_path OR
           OLD.artist_id  IS DISTINCT FROM NEW.artist_id  OR
           OLD.style_id   IS DISTINCT FROM NEW.style_id   OR
           OLD.style_name IS DISTINCT FROM NEW.style_name OR
           OLD.size       IS DISTINCT FROM NEW.size       OR
           OLD.price      IS DISTINCT FROM NEW.price      THEN
            RAISE EXCEPTION 'Cannot edit image, artist, style, size, or price of a held, reserved, or sold Flash design';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Re-declare delete lock trigger to include 'sold'
CREATE OR REPLACE FUNCTION public.trg_flash_designs_delete_lock()
RETURNS trigger AS $$
BEGIN
    IF OLD.status IN ('held', 'reserved', 'sold') THEN
        RAISE EXCEPTION 'Cannot delete a held, reserved, or sold Flash design';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
