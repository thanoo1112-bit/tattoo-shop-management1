-- ============================================================================
-- 157 TATTOO — PHASE 80 MIGRATION
-- FIX STATUS TRANSITIONS & CONSTRAINTS FOR EXPIRED DEPOSIT BOOKINGS
-- ============================================================================

BEGIN;

-- 1. Update booking_status_check constraint to include EXPIRED
ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS booking_status_check;

ALTER TABLE public.bookings
ADD CONSTRAINT booking_status_check
CHECK (status IN ('PENDING', 'APPROVED', 'WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'));


-- 2. Update flash_reservations_status_check constraint to include EXPIRED
ALTER TABLE public.flash_reservations
DROP CONSTRAINT IF EXISTS flash_reservations_status_check;

ALTER TABLE public.flash_reservations
ADD CONSTRAINT flash_reservations_status_check
CHECK (status IN ('PENDING', 'WAITING_DEPOSIT', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED'));


-- 3. Update handle_estimate_status_transition to allow EXPIRED transition
CREATE OR REPLACE FUNCTION public.handle_estimate_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_is_assigned_artist BOOLEAN;
  v_booking_id UUID;
  v_booking_status TEXT;
  v_has_active_session BOOLEAN := false;
  v_has_slip BOOLEAN := false;
BEGIN
  v_is_admin := private.is_admin();
  v_is_customer_owner := (
    auth.uid() IS NOT NULL
    AND OLD.customer_user_id IS NOT NULL
    AND OLD.customer_user_id = auth.uid()
  );
  v_is_assigned_artist := (
    auth.uid() IS NOT NULL AND (
      (OLD.artist_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.artists WHERE artists.id = OLD.artist_id AND artists.user_id = auth.uid()
      ))
      OR (private.get_artist_id() IS NOT NULL AND OLD.artist_id = private.get_artist_id())
    )
  );

  -- Terminal Record Immutability Check (EXPIRED & CANCELLED are terminal; REJECTED can transition to PENDING ONLY for customer owner)
  IF OLD.status IN ('EXPIRED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Estimate request % is in terminal status %', OLD.id, OLD.status USING ERRCODE = '22023';
  ELSIF OLD.status = 'REJECTED' THEN
    IF NOT (NEW.status = 'PENDING' AND v_is_customer_owner) THEN
      RAISE EXCEPTION 'Estimate request % is in terminal status REJECTED', OLD.id USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status = 'QUOTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can quote estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'ACCEPTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or Customer owner can accept estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or Customer owner can reject estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only customer owner, admin, or assigned artist can cancel this request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role') THEN
          RAISE EXCEPTION 'Unauthorized to expire estimate request' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status USING ERRCODE = '22023';
      END IF;

    -- QUOTED transitions
    ELSIF OLD.status = 'QUOTED' THEN
      IF NEW.status = 'ACCEPTED' THEN
        IF NOT v_is_customer_owner THEN
          RAISE EXCEPTION 'Only the customer owner can accept estimate quotes' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Unauthorized to reject estimate quote' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role') THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can expire estimate quotes' USING ERRCODE = '22023';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from QUOTED to %', NEW.status USING ERRCODE = '22023';
      END IF;

    -- ACCEPTED transitions
    ELSIF OLD.status = 'ACCEPTED' THEN
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Unauthorized status transition' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role') THEN
          RAISE EXCEPTION 'Unauthorized status transition to EXPIRED' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only customer owner, admin, or assigned artist can cancel this request' USING ERRCODE = '42501';
        END IF;

        SELECT id, status INTO v_booking_id, v_booking_status
        FROM public.bookings
        WHERE estimate_request_id = OLD.id
          AND status NOT IN ('CANCELLED', 'REJECTED')
        ORDER BY created_at DESC LIMIT 1;

        IF v_booking_id IS NOT NULL THEN
          IF v_booking_status != 'WAITING_DEPOSIT' THEN
            RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM public.booking_sessions
            WHERE booking_id = v_booking_id
              AND status IN ('IN_PROGRESS', 'COMPLETED')
          ) INTO v_has_active_session;

          IF v_has_active_session THEN
            RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM public.booking_payment_submissions
            WHERE booking_id = v_booking_id
              AND status IN ('PENDING', 'APPROVED')
          ) INTO v_has_slip;

          IF v_has_slip THEN
            RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
          END IF;
        END IF;

      ELSE
        RAISE EXCEPTION 'Invalid status transition from ACCEPTED to %', NEW.status USING ERRCODE = '22023';
      END IF;

    -- REJECTED transitions (Allowed ONLY: REJECTED -> PENDING for customer owner)
    ELSIF OLD.status = 'REJECTED' THEN
      IF NEW.status = 'PENDING' THEN
        IF NOT v_is_customer_owner THEN
          RAISE EXCEPTION 'Only customer owner can resubmit a rejected request' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from REJECTED to %', NEW.status USING ERRCODE = '22023';
      END IF;

    ELSE
      RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status USING ERRCODE = '22023';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;


-- 4. Update handle_booking_status_transition to allow EXPIRED & REJECTED from WAITING_DEPOSIT
CREATE OR REPLACE FUNCTION public.handle_booking_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_artist_id UUID;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
BEGIN
  -- 1. Terminal Record Immutability Check
  IF OLD.status IN ('COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Booking % is in terminal status % and cannot be modified', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Customer Ownership & Estimate Immutability Check
  IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
    RAISE EXCEPTION 'customer_user_id cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.estimate_request_id IS DISTINCT FROM OLD.estimate_request_id THEN
    RAISE EXCEPTION 'estimate_request_id cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Identify Actor
  v_is_admin := private.is_admin();
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);
  v_artist_id := private.get_artist_id();

  -- 4. Validate Allowed Status Transitions & Enforce Actor Rules
  IF NEW.status IS DISTINCT FROM OLD.status THEN

    SELECT COALESCE(e.deposit_required, 0.00) INTO v_deposit_required
    FROM public.estimate_requests e
    WHERE e.id = OLD.estimate_request_id;

    SELECT COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) INTO v_paid_total
    FROM public.booking_payments bp
    WHERE bp.booking_id = OLD.id;

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status IN ('APPROVED', 'WAITING_DEPOSIT') THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can approve booking requests'
            USING ERRCODE = 'P0001';
        END IF;

        IF NEW.artist_id IS NULL THEN
          RAISE EXCEPTION 'artist_id must be assigned before approving a booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.artists WHERE artists.id = NEW.artist_id AND artists.is_active = true
        ) THEN
          RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', NEW.artist_id
            USING ERRCODE = 'P0001';
        END IF;

        NEW.approved_at := COALESCE(NEW.approved_at, pg_catalog.now());

        -- Deposit Auto-Reconciliation upon Approval
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          NEW.status := 'WAITING_DEPOSIT';
          NEW.confirmed_at := NULL;
        ELSE
          NEW.status := 'CONFIRMED';
          NEW.confirmed_at := pg_catalog.now();
        END IF;

      ELSIF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, pg_catalog.now());

      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can reject booking requests'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin) THEN
          RAISE EXCEPTION 'Unauthorized to cancel booking request'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT (v_is_admin OR auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role') THEN
          RAISE EXCEPTION 'Unauthorized to expire booking request'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- APPROVED transitions
    ELSIF OLD.status = 'APPROVED' THEN
      IF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can update booking status'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := NULL;
      ELSIF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, pg_catalog.now());
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel approved booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT (v_is_admin OR auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role') THEN
          RAISE EXCEPTION 'Unauthorized to expire approved booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from APPROVED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- WAITING_DEPOSIT transitions
    ELSIF OLD.status = 'WAITING_DEPOSIT' THEN
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit of % has not been received (current paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, pg_catalog.now());
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only Admin or Customer owner can cancel booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status IN ('EXPIRED', 'REJECTED') THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role') THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can expire or reject booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from WAITING_DEPOSIT to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- ACCEPTED transitions
    ELSIF OLD.status = 'ACCEPTED' THEN
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, pg_catalog.now());
      ELSIF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can update booking status'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := NULL;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Unauthorized to cancel booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT (v_is_admin OR auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role') THEN
          RAISE EXCEPTION 'Unauthorized to expire booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from ACCEPTED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- CONFIRMED transitions
    ELSIF OLD.status = 'CONFIRMED' THEN
      IF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin or system reconciliation can revert booking status'
            USING ERRCODE = 'P0001';
        END IF;

        IF v_deposit_required <= 0 THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: booking has no deposit requirement', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        IF v_paid_total >= v_deposit_required THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: deposit requirement of % is fully satisfied (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
          SELECT 1 FROM public.booking_sessions
          WHERE booking_sessions.booking_id = OLD.id
            AND booking_sessions.status IN ('IN_PROGRESS', 'COMPLETED')
        ) THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: tattoo sessions have already started or completed', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        NEW.confirmed_at := NULL;

      ELSIF NEW.status = 'IN_PROGRESS' THEN
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
          )
        ) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can start booking'
            USING ERRCODE = 'P0001';
        END IF;

      ELSIF NEW.status = 'COMPLETED' THEN
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
          )
          OR auth.uid() IS NULL
        ) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system RPC can complete booking'
            USING ERRCODE = 'P0001';
        END IF;

      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel confirmed booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from CONFIRMED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    END IF;

  END IF;

  RETURN NEW;
END;
$$;


-- 5. Correct process_expired_deposit_bookings RPC
CREATE OR REPLACE FUNCTION public.process_expired_deposit_bookings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_catalog'
AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
  v_current_status TEXT;
  v_has_timely_submission BOOLEAN;
  v_flash_design_id UUID;
  v_is_repeatable BOOLEAN;
  v_deadline TIMESTAMPTZ;
  v_appt_time TIMESTAMPTZ;
  v_expired_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  FOR v_rec IN
    SELECT 
      b.id, 
      b.estimate_request_id,
      b.flash_reservation_id,
      b.approved_at,
      b.created_at,
      b.requested_date,
      b.requested_start_time
    FROM public.bookings b
    WHERE b.status = 'WAITING_DEPOSIT'
    FOR UPDATE OF b
  LOOP
    -- Compute base deposit deadline (24h if approved, 1h if new flow)
    IF v_rec.approved_at IS NOT NULL THEN
      v_deadline := v_rec.approved_at + INTERVAL '24 hours';
    ELSE
      v_deadline := v_rec.created_at + INTERVAL '1 hour';
    END IF;

    -- Cap deadline by requested appointment start time if set
    IF v_rec.requested_date IS NOT NULL THEN
      BEGIN
        v_appt_time := (v_rec.requested_date::text || ' ' || COALESCE(v_rec.requested_start_time, '10:00:00')::text || '+07')::TIMESTAMPTZ;
        IF v_appt_time < v_deadline THEN
          v_deadline := v_appt_time;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;

    -- Check if deadline has actually passed
    IF pg_catalog.now() < v_deadline THEN
      CONTINUE;
    END IF;

    -- RACE CONDITION GUARD: Check if customer submitted slip before deadline
    SELECT EXISTS (
      SELECT 1 FROM public.booking_payment_submissions s
      WHERE s.booking_id = v_rec.id
        AND s.status IN ('PENDING', 'APPROVED')
        AND COALESCE(s.submitted_at, s.created_at) < v_deadline
    ) INTO v_has_timely_submission;

    IF v_has_timely_submission THEN
      CONTINUE;
    END IF;

    -- Re-verify current booking status under row lock
    SELECT status INTO v_current_status
    FROM public.bookings
    WHERE id = v_rec.id;

    IF v_current_status != 'WAITING_DEPOSIT' THEN
      CONTINUE;
    END IF;

    -- A. Update Booking status to EXPIRED
    UPDATE public.bookings
    SET
      status = 'EXPIRED',
      updated_at = pg_catalog.now()
    WHERE id = v_rec.id;

    -- B. Update linked Estimate Request to EXPIRED
    IF v_rec.estimate_request_id IS NOT NULL THEN
      UPDATE public.estimate_requests
      SET
        status = 'EXPIRED',
        updated_at = pg_catalog.now()
      WHERE id = v_rec.estimate_request_id;
    END IF;

    -- C. Update linked Flash Reservation to EXPIRED
    IF v_rec.flash_reservation_id IS NOT NULL THEN
      UPDATE public.flash_reservations
      SET
        status = 'EXPIRED',
        updated_at = pg_catalog.now()
      WHERE id = v_rec.flash_reservation_id;
    END IF;

    -- D. Restore Flash Design status to AVAILABLE if single-use (is_repeatable = false)
    v_flash_design_id := NULL;
    IF v_rec.flash_reservation_id IS NOT NULL THEN
      SELECT flash_design_id INTO v_flash_design_id
      FROM public.flash_reservations
      WHERE id = v_rec.flash_reservation_id;
    END IF;

    IF v_flash_design_id IS NOT NULL THEN
      SELECT COALESCE(is_repeatable, FALSE) INTO v_is_repeatable
      FROM public.flash_designs
      WHERE id = v_flash_design_id;

      IF v_is_repeatable IS FALSE THEN
        -- Only restore to AVAILABLE if no other active reservation/booking holds this flash_design
        IF NOT EXISTS (
          SELECT 1 FROM public.flash_reservations fr
          WHERE fr.flash_design_id = v_flash_design_id
            AND fr.status NOT IN ('CANCELLED', 'EXPIRED', 'REJECTED')
            AND fr.id != COALESCE(v_rec.flash_reservation_id, '00000000-0000-0000-0000-000000000000'::uuid)
        ) AND NOT EXISTS (
          SELECT 1 FROM public.bookings bk
          JOIN public.flash_reservations fr2 ON bk.flash_reservation_id = fr2.id
          WHERE fr2.flash_design_id = v_flash_design_id
            AND bk.status NOT IN ('CANCELLED', 'EXPIRED', 'REJECTED')
            AND bk.id != v_rec.id
        ) THEN
          UPDATE public.flash_designs
          SET status = 'AVAILABLE', updated_at = pg_catalog.now()
          WHERE id = v_flash_design_id;
        END IF;
      END IF;
    END IF;

    -- E. Cancel scheduled booking sessions
    UPDATE public.booking_sessions
    SET status = 'CANCELLED', updated_at = pg_catalog.now()
    WHERE booking_id = v_rec.id AND status NOT IN ('COMPLETED', 'CANCELLED');

    v_count := v_count + 1;
    v_expired_ids := array_append(v_expired_ids, v_rec.id);
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'expired_count', v_count,
    'expired_booking_ids', v_expired_ids
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_expired_deposit_bookings() TO authenticated, service_role, postgres;

COMMIT;
