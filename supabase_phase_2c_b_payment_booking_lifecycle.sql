-- ============================================================================
-- 157 TATTOO — PHASE 2C-B: DEPOSIT <-> BOOKING LIFECYCLE FOUNDATION
-- (SECURITY, CONCURRENCY & STATUS CONSISTENCY HARDENED)
-- 
-- Fixes:
-- 1. Session Eligibility: Sessions can ONLY be scheduled when booking status
--    is CONFIRMED or IN_PROGRESS. WAITING_DEPOSIT, APPROVED, PENDING, and
--    terminals are strictly DENIED.
-- 2. Concurrency Row Lock: reconcile_booking_deposit_status locks booking
--    using SELECT ... FOR UPDATE OF b to serialize concurrent payment mutations.
-- 3. confirmed_at Semantics:
--    - CONFIRMED -> WAITING_DEPOSIT sets confirmed_at = NULL (approved_at kept).
--    - WAITING_DEPOSIT -> CONFIRMED sets confirmed_at = pg_catalog.now().
-- 4. Manual Downgrade Inconsistency Protection:
--    - CONFIRMED -> WAITING_DEPOSIT is strictly blocked if deposit_required <= 0
--      OR paid_total >= deposit_required.
--    - Allowed ONLY when deposit_required > 0 AND paid_total < deposit_required
--      AND no active/completed sessions exist.
-- 5. Lockdown Internal Functions: REVOKE ALL from PUBLIC, anon, authenticated
--    on reconcile_booking_deposit_status and internal helpers.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Payment Recording Eligibility (Pre-Insert on booking_payments)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_payments_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_uid UUID;
  v_booking_status TEXT;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'created_by must be set from authenticated context; auth.uid() is null'
      USING ERRCODE = 'P0001';
  END IF;

  -- Verify Associated Booking Existence and Status Eligibility
  SELECT status INTO v_booking_status
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF v_booking_status IS NULL THEN
    RAISE EXCEPTION 'Associated booking % does not exist', NEW.booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking_status IN ('PENDING', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot record payment for booking % in % status', NEW.booking_id, v_booking_status
      USING ERRCODE = 'P0001';
  END IF;

  -- Anti-Spoofing: Force created_by from auth.uid(), strictly ignoring client input
  NEW.created_by := v_caller_uid;

  -- Initial status MUST be RECORDED
  IF NEW.status IS NOT NULL AND NEW.status != 'RECORDED' THEN
    RAISE EXCEPTION 'New payment must start with RECORDED status; cannot be initialized as %', NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  NEW.status := 'RECORDED';

  -- New payments must NOT have void fields populated
  IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
    RAISE EXCEPTION 'New payment cannot contain void fields upon creation'
      USING ERRCODE = 'P0001';
  END IF;
  NEW.voided_at := NULL;
  NEW.voided_by := NULL;
  NEW.void_reason := NULL;

  -- Ensure valid paid_at timestamp
  IF NEW.paid_at IS NULL THEN
    NEW.paid_at := pg_catalog.now();
  END IF;

  -- Timestamps
  NEW.created_at := pg_catalog.now();
  NEW.updated_at := pg_catalog.now();

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Booking State Machine: Transition Enhancements, Deposit & confirmed_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
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

  -- 3. Identify Actor
  v_is_admin := private.is_admin();
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);

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

        -- Block manual inconsistency: cannot revert if deposit is not required
        IF v_deposit_required <= 0 THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: booking has no deposit requirement', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        -- Block manual inconsistency: cannot revert if deposit is already satisfied
        IF v_paid_total >= v_deposit_required THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: deposit requirement of % is fully satisfied (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;

        -- Safeguard: cannot downgrade if work has started
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
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can start booking'
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

    -- IN_PROGRESS transitions
    ELSIF OLD.status = 'IN_PROGRESS' THEN
      IF NEW.status = 'COMPLETED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can complete booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from IN_PROGRESS to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    END IF;

  END IF;

  -- 5. Artist Reassignment Protection (Cannot break completed sessions)
  IF NEW.artist_id IS DISTINCT FROM OLD.artist_id AND OLD.artist_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.booking_sessions
      WHERE booking_sessions.booking_id = OLD.id AND booking_sessions.status = 'COMPLETED'
    ) THEN
      RAISE EXCEPTION 'Cannot reassign artist for booking % with completed historical sessions', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 6. Database Authority Over System Status Timestamps
  IF OLD.status = 'PENDING' AND NEW.status = 'APPROVED' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, pg_catalog.now());
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
    NEW.rejected_at := COALESCE(NEW.rejected_at, pg_catalog.now());
  ELSIF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, pg_catalog.now());
  ELSIF NEW.status = 'CONFIRMED' AND OLD.status != 'CONFIRMED' THEN
    NEW.confirmed_at := pg_catalog.now();
  ELSIF NEW.status = 'IN_PROGRESS' AND OLD.status != 'IN_PROGRESS' THEN
    NEW.started_at := COALESCE(NEW.started_at, pg_catalog.now());
  ELSIF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, pg_catalog.now());
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Booking Session Eligibility Validation
--    Only CONFIRMED or IN_PROGRESS bookings can have sessions created!
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_session_validation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_booking_artist_id UUID;
  v_booking_status TEXT;
BEGIN
  -- 1. Fetch booking artist and status
  SELECT artist_id, status INTO v_booking_artist_id, v_booking_status
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF v_booking_status IS NULL THEN
    RAISE EXCEPTION 'Associated booking % does not exist', NEW.booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Consistency: Session artist must match booking assigned artist
  IF v_booking_artist_id IS NULL THEN
    RAISE EXCEPTION 'Cannot schedule session for booking % before artist is assigned', NEW.booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.artist_id IS DISTINCT FROM v_booking_artist_id THEN
    RAISE EXCEPTION 'Session artist % does not match booking assigned artist %', NEW.artist_id, v_booking_artist_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Status Eligibility: Sessions may ONLY be scheduled when CONFIRMED or IN_PROGRESS
  IF TG_OP = 'INSERT' THEN
    IF v_booking_status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'Cannot schedule session for booking % in % status; booking must be CONFIRMED or IN_PROGRESS',
        NEW.booking_id, v_booking_status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 4. Cannot add/modify sessions for terminal bookings
  IF v_booking_status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot schedule session for booking % in terminal status %', NEW.booking_id, v_booking_status
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Terminal session immutability on UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'COMPLETED' THEN
      RAISE EXCEPTION 'Completed session % cannot be modified', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
      RAISE EXCEPTION 'Session booking_id cannot be changed'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'created_at cannot be changed'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Concurrency-Safe Deposit Reconciliation Function (Row-Locked)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_booking_deposit_status(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_booking_status TEXT;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
  v_has_active_sessions BOOLEAN;
BEGIN
  -- Row lock booking to serialize concurrent reconciliations and prevent race conditions
  SELECT b.status, COALESCE(e.deposit_required, 0.00)
  INTO v_booking_status, v_deposit_required
  FROM public.bookings b
  LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF v_booking_status IS NULL THEN
    RETURN;
  END IF;

  -- Terminal or in-flight bookings cannot be altered by payment reconciliation
  IF v_booking_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RETURN;
  END IF;

  -- Calculate paid_total strictly from RECORDED payments under row lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)
  INTO v_paid_total
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- CASE A: Deposit satisfied -> WAITING_DEPOSIT (or APPROVED) -> CONFIRMED
  IF v_booking_status IN ('WAITING_DEPOSIT', 'APPROVED') THEN
    IF v_deposit_required <= 0 OR v_paid_total >= v_deposit_required THEN
      UPDATE public.bookings
      SET status = 'CONFIRMED',
          confirmed_at = pg_catalog.now()
      WHERE id = p_booking_id;
    END IF;

  -- CASE B: Deposit lost (due to VOID) -> CONFIRMED -> WAITING_DEPOSIT
  ELSIF v_booking_status = 'CONFIRMED' THEN
    IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
      -- Safeguard: Do not downgrade if sessions have already started or completed
      SELECT EXISTS (
        SELECT 1 FROM public.booking_sessions
        WHERE booking_id = p_booking_id
          AND status IN ('IN_PROGRESS', 'COMPLETED')
      ) INTO v_has_active_sessions;

      IF NOT v_has_active_sessions THEN
        UPDATE public.bookings
        SET status = 'WAITING_DEPOSIT',
            confirmed_at = NULL
        WHERE id = p_booking_id;
      END IF;
    END IF;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Automatic Booking Reconciliation Trigger on Payments
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_payments_after_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.reconcile_booking_deposit_status(NEW.booking_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
      PERFORM public.reconcile_booking_deposit_status(OLD.booking_id);
    END IF;
    PERFORM public.reconcile_booking_deposit_status(NEW.booking_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trig_03_booking_payments_after_mutation ON public.booking_payments;
CREATE TRIGGER trig_03_booking_payments_after_mutation
  AFTER INSERT OR UPDATE OF status, amount, booking_id ON public.booking_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_payments_after_mutation();

-- ----------------------------------------------------------------------------
-- 6. Lockdown Internal Security Definer Functions (No Client Execution)
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.reconcile_booking_deposit_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_booking_deposit_status(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_booking_deposit_status(UUID) FROM authenticated;

REVOKE ALL ON FUNCTION public.handle_booking_payments_after_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_booking_payments_after_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.handle_booking_payments_after_mutation() FROM authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
