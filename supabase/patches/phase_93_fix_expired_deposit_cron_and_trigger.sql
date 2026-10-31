-- PHASE 93: FIX EXPIRED DEPOSIT STATUS TRANSITION IN TRIGGER & PG_CRON SCHEDULING
-- 1. Update public.handle_booking_status_transition() trigger to allow WAITING_DEPOSIT -> EXPIRED / REJECTED
-- 2. Reschedule auto_reject_expired_deposit_bookings_job in pg_cron (runs every 5 mins)

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
  v_quoted_price NUMERIC(12,2);
  v_effective_price NUMERIC(12,2);
  v_total_sessions INT;
  v_completed_sessions INT;
  v_active_sessions INT;
BEGIN
  -- 1. Terminal Record Immutability Check
  IF OLD.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
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

  -- 3. Identify Actor (Supports authenticated Admin profile OR service_role)
  v_is_admin := private.is_admin()
    OR (auth.jwt() ->> 'role' = 'service_role')
    OR (current_setting('role', true) = 'service_role');
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
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := pg_catalog.now();
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel approved booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from APPROVED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- WAITING_DEPOSIT transitions
    ELSIF OLD.status = 'WAITING_DEPOSIT' THEN
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit of % has not been received (current paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := pg_catalog.now();
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status IN ('EXPIRED', 'REJECTED') THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin or system cron can expire/reject deposit booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from WAITING_DEPOSIT to %', NEW.status
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
          SELECT 1 FROM public.booking_sessions bs
          WHERE bs.booking_id = OLD.id AND bs.status IN ('IN_PROGRESS', 'COMPLETED')
        ) THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: active or completed sessions exist', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        NEW.confirmed_at := NULL;

      ELSIF NEW.status = 'IN_PROGRESS' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id)) THEN
          RAISE EXCEPTION 'Only assigned Artist or Admin can start booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'COMPLETED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can mark booking as COMPLETED'
            USING ERRCODE = 'P0001';
        END IF;

        SELECT COALESCE(b.quoted_price, e.quoted_price, 0.00) INTO v_quoted_price
        FROM public.bookings b
        LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
        WHERE b.id = OLD.id;

        v_effective_price := COALESCE(NEW.quoted_price, OLD.quoted_price, v_quoted_price, 0.00);

        IF v_effective_price > 0 AND v_paid_total < v_effective_price THEN
          RAISE EXCEPTION 'Cannot complete booking %: outstanding balance remaining (quoted: %, paid: %)',
            OLD.id, v_effective_price, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;

        SELECT COUNT(*), 
               COUNT(*) FILTER (WHERE bs.status = 'COMPLETED'),
               COUNT(*) FILTER (WHERE bs.status IN ('SCHEDULED', 'IN_PROGRESS'))
        INTO v_total_sessions, v_completed_sessions, v_active_sessions
        FROM public.booking_sessions bs
        WHERE bs.booking_id = OLD.id;

        IF v_total_sessions > 0 AND v_active_sessions > 0 THEN
          RAISE EXCEPTION 'Cannot complete booking %: % active session(s) remain incomplete',
            OLD.id, v_active_sessions
            USING ERRCODE = 'P0001';
        END IF;

        NEW.completed_at := COALESCE(NEW.completed_at, pg_catalog.now());

      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only Customer owner or Admin can cancel booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from CONFIRMED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- IN_PROGRESS transitions
    ELSIF OLD.status = 'IN_PROGRESS' THEN
      IF NEW.status = 'COMPLETED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id)) THEN
          RAISE EXCEPTION 'Only assigned Artist or Admin can complete booking'
            USING ERRCODE = 'P0001';
        END IF;

        SELECT COALESCE(b.quoted_price, e.quoted_price, 0.00) INTO v_quoted_price
        FROM public.bookings b
        LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
        WHERE b.id = OLD.id;

        v_effective_price := COALESCE(NEW.quoted_price, OLD.quoted_price, v_quoted_price, 0.00);

        IF v_effective_price > 0 AND v_paid_total < v_effective_price THEN
          RAISE EXCEPTION 'Cannot complete booking %: outstanding balance remaining (quoted: %, paid: %)',
            OLD.id, v_effective_price, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;

        SELECT COUNT(*), 
               COUNT(*) FILTER (WHERE bs.status = 'COMPLETED'),
               COUNT(*) FILTER (WHERE bs.status IN ('SCHEDULED', 'IN_PROGRESS'))
        INTO v_total_sessions, v_completed_sessions, v_active_sessions
        FROM public.booking_sessions bs
        WHERE bs.booking_id = OLD.id;

        IF v_total_sessions > 0 AND v_active_sessions > 0 THEN
          RAISE EXCEPTION 'Cannot complete booking %: % active session(s) remain incomplete',
            OLD.id, v_active_sessions
            USING ERRCODE = 'P0001';
        END IF;

        NEW.completed_at := COALESCE(NEW.completed_at, pg_catalog.now());

      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel in-progress booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from IN_PROGRESS to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    ELSE
      RAISE EXCEPTION 'Unhandled status transition from % to %', OLD.status, NEW.status
        USING ERRCODE = 'P0001';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- 2. Enable pg_cron and schedule auto_reject_expired_deposit_bookings_job
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('auto_reject_expired_deposit_bookings_job') 
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_reject_expired_deposit_bookings_job');

SELECT cron.schedule(
  'auto_reject_expired_deposit_bookings_job',
  '*/5 * * * *',
  'SELECT public.auto_reject_expired_deposit_bookings()'
);
