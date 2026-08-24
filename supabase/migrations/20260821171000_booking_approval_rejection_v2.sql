-- Migration: Booking Approval & Rejection V2
-- Adds columns for confirmed schedule, rejection reason, and acceptance audit trail.
-- Creates booking_schedule_holds table, trigger guards, V2 RPCs, and updated verification/submission functions.

-- 1. Add columns and constraints to booking_requests
ALTER TABLE public.booking_requests
ADD COLUMN rejection_reason text,
ADD COLUMN confirmed_start_at timestamptz,
ADD COLUMN confirmed_end_at timestamptz,
ADD COLUMN accepted_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
ADD COLUMN accepted_at timestamptz,
ADD CONSTRAINT confirmed_dates_check CHECK (
    (confirmed_start_at IS NULL AND confirmed_end_at IS NULL) OR
    (confirmed_start_at IS NOT NULL AND confirmed_end_at IS NOT NULL AND confirmed_start_at < confirmed_end_at)
);

-- 2. Create booking_schedule_holds table
CREATE TABLE public.booking_schedule_holds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    booking_request_id uuid NOT NULL UNIQUE REFERENCES public.booking_requests(id) ON DELETE CASCADE,
    artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (start_at < end_at),
    CHECK (expires_at > created_at)
);

-- 3. Create indexes for booking_schedule_holds
CREATE INDEX booking_schedule_holds_expires_at_idx ON public.booking_schedule_holds (expires_at);
CREATE INDEX booking_schedule_holds_artist_idx ON public.booking_schedule_holds (artist_id);

-- Enable RLS on booking_schedule_holds
ALTER TABLE public.booking_schedule_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_schedule_holds FROM PUBLIC, anon, authenticated;

-- Grant table-level SELECT to authenticated users
GRANT SELECT ON TABLE public.booking_schedule_holds TO authenticated;

-- Expose read access to authenticated shop members (SELECT policy)
CREATE POLICY "Authenticated staff can view holds" ON public.booking_schedule_holds
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_members.shop_id = booking_schedule_holds.shop_id
          AND shop_members.user_id = auth.uid()
          AND shop_members.status = 'active'
    )
);

-- 4. Central Hold Guard Trigger Function
CREATE OR REPLACE FUNCTION public.booking_schedule_hold_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- 1. Lock artist row for serialization
    PERFORM 1 FROM public.profiles WHERE id = NEW.artist_id FOR UPDATE;

    -- 2. Validate expiration is in the future
    IF NEW.expires_at <= now() THEN
        RAISE EXCEPTION 'Hold expiration must be in the future';
    END IF;

    -- 3. Check overlap with scheduled / in_progress appointments
    IF EXISTS (
        SELECT 1 FROM public.appointments
        WHERE artist_id = NEW.artist_id
          AND status IN ('scheduled', 'in_progress')
          AND tstzrange(start_at, end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Schedule conflict: Artist has an overlapping appointment';
    END IF;

    -- 4. Check overlap with other active holds
    IF EXISTS (
        SELECT 1 FROM public.booking_schedule_holds
        WHERE artist_id = NEW.artist_id
          AND id IS DISTINCT FROM NEW.id
          AND expires_at > now()
          AND tstzrange(start_at, end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)')
    ) THEN
        RAISE EXCEPTION 'Schedule conflict: Artist has an overlapping schedule hold';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER booking_schedule_hold_guard_trigger
BEFORE INSERT OR UPDATE ON public.booking_schedule_holds
FOR EACH ROW
EXECUTE FUNCTION public.booking_schedule_hold_guard();

-- 5. Central Appointment Guard Trigger Function
CREATE OR REPLACE FUNCTION public.appointment_schedule_hold_guard() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Only guard when status is scheduled or in_progress
    IF NEW.status IN ('scheduled', 'in_progress') THEN
        -- 1. Lock artist row for serialization
        PERFORM 1 FROM public.profiles WHERE id = NEW.artist_id FOR UPDATE;

        -- 2. Check booking_schedule_holds where expires_at > now() (exempt own hold)
        IF EXISTS (
            SELECT 1 FROM public.booking_schedule_holds
            WHERE artist_id = NEW.artist_id
              AND expires_at > now()
              AND booking_request_id IS DISTINCT FROM NEW.booking_request_id
              AND tstzrange(start_at, end_at, '[)') && tstzrange(NEW.start_at, NEW.end_at, '[)')
        ) THEN
            RAISE EXCEPTION 'Schedule conflict: Overlaps with an active schedule hold';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER appointment_schedule_hold_guard_trigger
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.appointment_schedule_hold_guard();

-- 6. Approve Booking Request V2 Function
CREATE OR REPLACE FUNCTION public.approve_booking_request_v2(
    p_booking_id uuid,
    p_agreed_price numeric,
    p_deposit_amount numeric,
    p_confirmed_start_at timestamptz,
    p_confirmed_end_at timestamptz
) RETURNS TABLE (
    booking_status text,
    appointment_id uuid,
    payment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_booking record;
    v_app_id uuid;
    v_pay_id uuid;
    v_deposit_paid boolean;
BEGIN
    -- 1. Authentication check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Explicit NULL checks
    IF p_agreed_price IS NULL OR p_deposit_amount IS NULL OR p_confirmed_start_at IS NULL OR p_confirmed_end_at IS NULL THEN
        RAISE EXCEPTION 'All input parameters (agreed price, deposit amount, confirmed start, confirmed end) must be specified';
    END IF;

    -- 3. Validate input parameters
    IF p_agreed_price < 0 THEN
        RAISE EXCEPTION 'Agreed price must be non-negative';
    END IF;

    IF p_deposit_amount < 0 THEN
        RAISE EXCEPTION 'Deposit amount must be non-negative';
    END IF;

    IF p_deposit_amount > p_agreed_price THEN
        RAISE EXCEPTION 'Deposit amount cannot exceed agreed price';
    END IF;

    IF p_confirmed_start_at >= p_confirmed_end_at THEN
        RAISE EXCEPTION 'Confirmed start time must be before end time';
    END IF;

    -- 4. Lock booking request row and fetch details
    SELECT * INTO v_booking
    FROM public.booking_requests
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking request not found';
    END IF;

    -- 5. Check status transition (only pending_review -> approved/pending_payment)
    IF v_booking.status != 'pending_review' THEN
        RAISE EXCEPTION 'Booking request is not in pending_review state';
    END IF;

    -- 6. Active Membership / Authority check
    IF NOT (
        -- Shop Owner: must be active role = owner
        EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_id = v_booking.shop_id
              AND user_id = v_user_id
              AND status = 'active'
              AND role = 'owner'
        )
        OR
        -- Assigned Artist: must be active role = artist
        (
            v_booking.artist_id = v_user_id
            AND EXISTS (
                SELECT 1 FROM public.shop_members
                WHERE shop_id = v_booking.shop_id
                  AND user_id = v_user_id
                  AND status = 'active'
                  AND role = 'artist'
            )
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized to approve this booking request';
    END IF;

    -- 7. Check if there is an existing paid deposit for this booking request (Reschedule flow)
    SELECT EXISTS (
        SELECT 1 FROM public.payments
        WHERE booking_request_id = p_booking_id
          AND payment_type = 'deposit'
          AND status = 'paid'
    ) INTO v_deposit_paid;

    -- 8. Branch based on deposit status
    IF p_deposit_amount = 0 OR v_deposit_paid THEN
        -- CASE A: Deposit = 0 OR deposit already paid (Immediate Approval)
        
        -- Update Tattoo Project (status = 'active', agreed_price = p_agreed_price)
        UPDATE public.tattoo_projects
        SET status = 'active',
            agreed_price = p_agreed_price,
            updated_at = now()
        WHERE id = v_booking.project_id;

        -- Create Appointment (Triggers overlap validation automatically)
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
            p_confirmed_start_at,
            p_confirmed_end_at,
            'scheduled',
            v_user_id
        )
        RETURNING id INTO v_app_id;

        -- Update Booking Request status (immediate approval, write accepted and approved fields)
        UPDATE public.booking_requests
        SET status = 'approved',
            accepted_by = v_user_id,
            accepted_at = now(),
            approved_by = v_user_id,
            approved_at = now(),
            confirmed_start_at = p_confirmed_start_at,
            confirmed_end_at = p_confirmed_end_at,
            updated_at = now()
        WHERE id = p_booking_id;

        -- Fetch payment ID if it was an existing paid deposit
        IF v_deposit_paid THEN
            SELECT id INTO v_pay_id FROM public.payments WHERE booking_request_id = p_booking_id AND payment_type = 'deposit' AND status = 'paid' LIMIT 1;
        ELSE
            v_pay_id := NULL;
        END IF;

        RETURN QUERY SELECT 'approved'::text, v_app_id, v_pay_id;

    ELSE
        -- CASE B: Deposit > 0 and unpaid (Requires Payment verification first)
        
        -- Prevent duplicate deposit payments
        IF EXISTS (
            SELECT 1 FROM public.payments
            WHERE booking_request_id = p_booking_id
              AND payment_type = 'deposit'
              AND status IN ('pending', 'verification_pending')
        ) THEN
            RAISE EXCEPTION 'A pending or unverified deposit payment already exists for this booking request';
        END IF;

        -- Lock artist row for serialization before checking hold overlap
        PERFORM 1 FROM public.profiles WHERE id = v_booking.artist_id FOR UPDATE;

        -- Delete any STALE hold belonging to this booking request if it expired
        DELETE FROM public.booking_schedule_holds
        WHERE booking_request_id = p_booking_id
          AND expires_at <= now();

        -- Create new hard schedule hold (Triggers overlap check automatically)
        INSERT INTO public.booking_schedule_holds (
            shop_id,
            booking_request_id,
            artist_id,
            start_at,
            end_at,
            expires_at,
            created_by
        )
        VALUES (
            v_booking.shop_id,
            v_booking.id,
            v_booking.artist_id,
            p_confirmed_start_at,
            p_confirmed_end_at,
            now() + interval '24 hours',
            v_user_id
        )
        RETURNING id INTO v_pay_id; -- Temporary reuse variable

        -- Update Tattoo Project agreed price (keep status = 'proposed')
        UPDATE public.tattoo_projects
        SET agreed_price = p_agreed_price,
            updated_at = now()
        WHERE id = v_booking.project_id;

        -- Create pending payment record
        INSERT INTO public.payments (
            shop_id,
            customer_id,
            project_id,
            booking_request_id,
            payment_type,
            amount,
            status
        )
        VALUES (
            v_booking.shop_id,
            v_booking.customer_id,
            v_booking.project_id,
            v_booking.id,
            'deposit',
            p_deposit_amount,
            'pending'
        )
        RETURNING id INTO v_pay_id;

        -- Save confirmed times and acceptance audit, status = pending_payment
        UPDATE public.booking_requests
        SET status = 'pending_payment',
            accepted_by = v_user_id,
            accepted_at = now(),
            confirmed_start_at = p_confirmed_start_at,
            confirmed_end_at = p_confirmed_end_at,
            updated_at = now()
        WHERE id = p_booking_id;

        RETURN QUERY SELECT 'pending_payment'::text, NULL::uuid, v_pay_id;
    END IF;
END;
$$;

-- 7. Reject Booking Request V2 Function
CREATE OR REPLACE FUNCTION public.reject_booking_request_v2(
    p_booking_id uuid,
    p_rejection_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_booking record;
    v_trimmed_reason text;
BEGIN
    -- 1. Authentication check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Validate input parameters
    v_trimmed_reason := btrim(p_rejection_reason);
    IF v_trimmed_reason = '' OR v_trimmed_reason IS NULL THEN
        RAISE EXCEPTION 'Rejection reason is required and cannot be empty';
    END IF;

    -- 3. Lock booking request row and fetch details
    SELECT * INTO v_booking
    FROM public.booking_requests
    WHERE id = p_booking_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking request not found';
    END IF;

    -- 4. Check status transition (only pending_review -> rejected)
    IF v_booking.status != 'pending_review' THEN
        RAISE EXCEPTION 'Booking request is not in pending_review state';
    END IF;

    -- 5. Active Membership / Authority check
    IF NOT (
        -- Shop Owner: must be active role = owner
        EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_id = v_booking.shop_id
              AND user_id = v_user_id
              AND status = 'active'
              AND role = 'owner'
        )
        OR
        -- Assigned Artist: must be active role = artist
        (
            v_booking.artist_id = v_user_id
            AND EXISTS (
                SELECT 1 FROM public.shop_members
                WHERE shop_id = v_booking.shop_id
                  AND user_id = v_user_id
                  AND status = 'active'
                  AND role = 'artist'
            )
        )
    ) THEN
        RAISE EXCEPTION 'Unauthorized to reject this booking request';
    END IF;

    -- 6. Update Tattoo Project (status = 'cancelled')
    UPDATE public.tattoo_projects
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = v_booking.project_id;

    -- 7. Update Booking Request status (do NOT populate accepted_by or approved_by fields)
    UPDATE public.booking_requests
    SET status = 'rejected',
        rejection_reason = v_trimmed_reason,
        rejected_by = v_user_id,
        rejected_at = now(),
        updated_at = now()
    WHERE id = p_booking_id;
END;
$$;

-- 8. Replace verify_manual_payment to support V2 deposit workflow
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

    -- 4. Active Membership / Authorization check
    IF EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_payment.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'owner'
    ) THEN
        v_is_authorized := true;
    ELSIF EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = v_payment.shop_id
          AND user_id = v_user_id
          AND status = 'active'
          AND role = 'artist'
    ) AND (
        EXISTS (
            SELECT 1 FROM public.tattoo_projects 
            WHERE id = v_payment.project_id 
              AND artist_id = v_user_id
        ) OR 
        EXISTS (
            SELECT 1 FROM public.booking_requests 
            WHERE id = v_payment.booking_request_id 
              AND artist_id = v_user_id
        ) OR 
        EXISTS (
            SELECT 1 FROM public.appointments 
            WHERE id = v_payment.appointment_id 
              AND artist_id = v_user_id
        )
    ) THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Unauthorized to verify this payment';
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

-- 9. Replace submit_public_payment_slip to handle grace period and reject expired holds
CREATE OR REPLACE FUNCTION public.submit_public_payment_slip(
    p_public_token uuid,
    p_storage_path text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_booking record;
    v_payment record;
BEGIN
    -- 1. Lock booking request
    SELECT * INTO v_booking FROM public.booking_requests WHERE public_token = p_public_token FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid token';
    END IF;
    
    IF v_booking.status != 'pending_payment' THEN
        RAISE EXCEPTION 'Booking not awaiting payment';
    END IF;
    
    -- 2. Reject submission if hold exists but has already expired
    IF EXISTS (
        SELECT 1 FROM public.booking_schedule_holds
        WHERE booking_request_id = v_booking.id
          AND expires_at <= now()
    ) THEN
        RAISE EXCEPTION 'Reservation hold has expired. Please contact support to reschedule.';
    END IF;

    -- 3. Lock pending payment
    SELECT * INTO v_payment FROM public.payments WHERE booking_request_id = v_booking.id AND payment_type = 'deposit' AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No pending deposit found';
    END IF;
    
    -- 4. Extend the schedule hold for a 24-hour verification grace period
    UPDATE public.booking_schedule_holds
    SET expires_at = now() + interval '24 hours',
        updated_at = now()
    WHERE booking_request_id = v_booking.id;

    -- 5. Advance payment status to verification_pending
    UPDATE public.payments 
    SET status = 'verification_pending', 
        proof_storage_path = p_storage_path, 
        proof_submitted_at = now(), 
        updated_at = now() 
    WHERE id = v_payment.id;
END;
$$;

-- 10. Create Hold Expiration RPC
CREATE OR REPLACE FUNCTION public.expire_booking_schedule_holds() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_hold record;
    v_booking record;
BEGIN
    FOR v_hold IN 
        SELECT * FROM public.booking_schedule_holds
        WHERE expires_at <= now()
    LOOP
        -- Lock booking request
        SELECT * INTO v_booking FROM public.booking_requests WHERE id = v_hold.booking_request_id FOR UPDATE;
        
        IF FOUND AND v_booking.status = 'pending_payment' THEN
            -- Ensure linked deposit payment is not verification_pending (i.e. still waiting for review)
            IF NOT EXISTS (
                SELECT 1 FROM public.payments
                WHERE booking_request_id = v_booking.id
                  AND payment_type = 'deposit'
                  AND status = 'verification_pending'
            ) THEN
                -- Lock artist profile row for serialization
                PERFORM 1 FROM public.profiles WHERE id = v_booking.artist_id FOR UPDATE;

                -- Cancel deposit payment if pending
                UPDATE public.payments
                SET status = 'cancelled',
                    updated_at = now()
                WHERE booking_request_id = v_booking.id
                  AND payment_type = 'deposit'
                  AND status = 'pending';

                -- Update tattoo project
                UPDATE public.tattoo_projects
                SET status = 'cancelled',
                    updated_at = now()
                WHERE id = v_booking.project_id;

                -- Expire request
                UPDATE public.booking_requests
                SET status = 'expired',
                    updated_at = now()
                WHERE id = v_booking.id;

                -- Delete hold
                DELETE FROM public.booking_schedule_holds WHERE id = v_hold.id;
            END IF;
        END IF;
    END LOOP;
END;
$$;

-- 11. Maintain and Grant Executing Privileges
REVOKE ALL ON FUNCTION public.approve_booking_request_v2(uuid, numeric, numeric, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_booking_request_v2(uuid, numeric, numeric, timestamptz, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_booking_request_v2(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_booking_request_v2(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.verify_manual_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_manual_payment(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_public_payment_slip(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_payment_slip(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_payment_slip(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.expire_booking_schedule_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_booking_schedule_holds() TO authenticated;

-- Harden Internal Trigger Functions
REVOKE ALL ON FUNCTION public.booking_schedule_hold_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.appointment_schedule_hold_guard() FROM PUBLIC, anon, authenticated;
