-- =============================================================================
-- 157 TATTOO — PHASE E-B MIGRATION
-- CANONICAL ARTIST SESSION OPERATIONS: START + COMPLETE SESSION + COMPLETE JOB
-- (DEFENSE-IN-DEPTH TRIGGER AUTHORIZATION • PARENT-FIRST ROW LOCKS • IDEMPOTENT)
-- =============================================================================
-- Database Changes: RPC functions and trigger definition update ONLY.
-- NO table changes, NO column changes, NO RLS changes, NO constraint changes.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Update Booking Status State Machine: handle_booking_status_transition()
--    (Preserves all Admin/Customer rules and adds defense-in-depth Artist lifecycle guards)
-- -----------------------------------------------------------------------------
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
          SELECT 1 FROM public.booking_sessions
          WHERE booking_sessions.booking_id = OLD.id
            AND booking_sessions.status IN ('IN_PROGRESS', 'COMPLETED')
        ) THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: tattoo sessions have already started or completed', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        NEW.confirmed_at := NULL;

      ELSIF NEW.status = 'IN_PROGRESS' THEN
        -- Defense-in-depth: Admin OR (Assigned active Artist with an actual IN_PROGRESS session)
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
            AND EXISTS (
              SELECT 1 FROM public.booking_sessions bs
              WHERE bs.booking_id = OLD.id
                AND bs.status = 'IN_PROGRESS'
            )
          )
        ) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist with an active in-progress session can start booking'
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
        -- Defense-in-depth: Admin OR (Assigned active Artist with at least 1 completed session and 0 active sessions)
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
            AND EXISTS (
              SELECT 1 FROM public.booking_sessions bs
              WHERE bs.booking_id = OLD.id
                AND bs.status = 'COMPLETED'
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.booking_sessions bs
              WHERE bs.booking_id = OLD.id
                AND bs.status IN ('SCHEDULED', 'IN_PROGRESS')
            )
          )
        ) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist with all active sessions completed can complete booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from IN_PROGRESS to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    END IF;

  END IF;

  -- 5. Artist Reassignment Protection
  IF NEW.artist_id IS DISTINCT FROM OLD.artist_id AND OLD.artist_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.booking_sessions
      WHERE booking_sessions.booking_id = OLD.id
        AND booking_sessions.status = 'COMPLETED'
    ) THEN
      RAISE EXCEPTION 'Cannot reassign artist for booking % with completed historical sessions', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 6. System Status Timestamps Authority
  IF OLD.status = 'PENDING' AND NEW.status = 'APPROVED' THEN
    NEW.approved_at := pg_catalog.now();
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
    NEW.rejected_at := pg_catalog.now();
  ELSIF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
    NEW.cancelled_at := pg_catalog.now();
  ELSIF NEW.status = 'CONFIRMED' AND OLD.status != 'CONFIRMED' THEN
    NEW.confirmed_at := pg_catalog.now();
  ELSIF NEW.status = 'IN_PROGRESS' AND OLD.status != 'IN_PROGRESS' THEN
    NEW.started_at := pg_catalog.now();
  ELSIF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    NEW.completed_at := pg_catalog.now();
  END IF;

  RETURN NEW;
END;
$$;


-- -----------------------------------------------------------------------------
-- 2. Canonical Artist RPC: artist_start_session(p_session_id UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_start_session(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_booking_id UUID;
  v_booking RECORD;
  v_session RECORD;
BEGIN
  -- 1. Identify Authenticated Active Artist
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can perform this operation'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Parent-First Lock Sequence: Peek session's parent booking_id
  SELECT booking_id INTO v_booking_id
  FROM public.booking_sessions
  WHERE id = p_session_id;

  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Lock Parent Booking FOR UPDATE
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = v_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Parent booking % not found', v_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock Target Session FOR UPDATE
  SELECT * INTO v_session
  FROM public.booking_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  -- 5. Validate Ownership
  IF v_session.artist_id IS DISTINCT FROM v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the assigned artist for this session'
      USING ERRCODE = '42501';
  END IF;

  IF v_booking.artist_id IS DISTINCT FROM v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the assigned artist for parent booking'
      USING ERRCODE = '42501';
  END IF;

  -- 6. Idempotency Guard
  IF v_session.status = 'IN_PROGRESS' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'already_in_progress', true,
      'session_id', p_session_id,
      'booking_id', v_booking.id,
      'status', 'IN_PROGRESS'
    );
  END IF;

  -- 7. State Eligibility Guards
  IF v_session.status != 'SCHEDULED' THEN
    RAISE EXCEPTION 'Cannot start session in % status; session must be SCHEDULED', v_session.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Cannot start session: parent booking status is % (must be CONFIRMED or IN_PROGRESS)', v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 8. Multi-Session Sequencing Guard:
  -- 8a. No other session under this booking may currently be IN_PROGRESS
  IF EXISTS (
    SELECT 1 FROM public.booking_sessions
    WHERE booking_id = v_booking.id
      AND id != p_session_id
      AND status = 'IN_PROGRESS'
  ) THEN
    RAISE EXCEPTION 'Cannot start session: another session under this booking is currently IN_PROGRESS'
      USING ERRCODE = 'P0001';
  END IF;

  -- 8b. All earlier sessions (session_number < current) must be COMPLETED or CANCELLED
  IF EXISTS (
    SELECT 1 FROM public.booking_sessions
    WHERE booking_id = v_booking.id
      AND session_number < v_session.session_number
      AND status NOT IN ('COMPLETED', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'Cannot start session #%: earlier sessions must be completed or cancelled first', v_session.session_number
      USING ERRCODE = 'P0001';
  END IF;

  -- 9. Execute Transition (Triggers will auto-synchronize parent booking to IN_PROGRESS)
  UPDATE public.booking_sessions
  SET status = 'IN_PROGRESS',
      updated_at = pg_catalog.now()
  WHERE id = p_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'session_number', v_session.session_number,
    'session_status', 'IN_PROGRESS',
    'booking_id', v_booking.id
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 3. Canonical Artist RPC: artist_complete_session(p_session_id UUID, p_session_note TEXT)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_complete_session(
  p_session_id UUID,
  p_session_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_booking_id UUID;
  v_booking RECORD;
  v_session RECORD;
  v_cleaned_note TEXT;
BEGIN
  -- 1. Identify Authenticated Active Artist
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can perform this operation'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Parent-First Lock Sequence
  SELECT booking_id INTO v_booking_id
  FROM public.booking_sessions
  WHERE id = p_session_id;

  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = v_booking_id
  FOR UPDATE;

  SELECT * INTO v_session
  FROM public.booking_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  -- 3. Validate Ownership
  IF v_session.artist_id IS DISTINCT FROM v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the assigned artist for this session'
      USING ERRCODE = '42501';
  END IF;

  IF v_booking.artist_id IS DISTINCT FROM v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the assigned artist for parent booking'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Idempotency Guard
  IF v_session.status = 'COMPLETED' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'already_completed', true,
      'session_id', p_session_id,
      'booking_id', v_booking.id,
      'status', 'COMPLETED'
    );
  END IF;

  -- 5. State Eligibility Guard
  IF v_session.status != 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Cannot complete session in % status; session must be IN_PROGRESS', v_session.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status != 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Cannot complete session: parent booking status is % (must be IN_PROGRESS)', v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Note Normalization (Preserve existing note if parameter is null or whitespace)
  v_cleaned_note := NULLIF(pg_catalog.btrim(p_session_note), '');

  -- 7. Execute Transition (Parent booking strictly remains IN_PROGRESS)
  UPDATE public.booking_sessions
  SET status = 'COMPLETED',
      note = COALESCE(v_cleaned_note, note),
      updated_at = pg_catalog.now()
  WHERE id = p_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'session_number', v_session.session_number,
    'session_status', 'COMPLETED',
    'booking_id', v_booking.id
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 4. Canonical Artist RPC: artist_complete_booking(p_booking_id UUID)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_complete_booking(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_booking RECORD;
  v_total_sessions INT;
  v_completed_sessions INT;
  v_active_sessions INT;
BEGIN
  -- 1. Identify Authenticated Active Artist
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can perform this operation'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock Parent Booking FOR UPDATE
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate Ownership
  IF v_booking.artist_id IS DISTINCT FROM v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the assigned artist for this booking'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Idempotency Guard
  IF v_booking.status = 'COMPLETED' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'already_completed', true,
      'booking_id', p_booking_id,
      'status', 'COMPLETED'
    );
  END IF;

  -- 5. Status Eligibility Guard
  IF v_booking.status != 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Cannot complete booking % in % status; booking must be IN_PROGRESS', p_booking_id, v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Validate Session State Counts
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'COMPLETED'),
    COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS'))
  INTO v_total_sessions, v_completed_sessions, v_active_sessions
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  IF v_total_sessions = 0 THEN
    RAISE EXCEPTION 'Cannot complete booking %: no sessions found', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_completed_sessions = 0 THEN
    RAISE EXCEPTION 'Cannot complete booking %: at least one session must be COMPLETED', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_active_sessions > 0 THEN
    RAISE EXCEPTION 'Cannot complete booking %: all scheduled or in-progress sessions must be completed or cancelled first', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Execute Transition (Trigger handles completed_at timestamp)
  UPDATE public.bookings
  SET status = 'COMPLETED'
  WHERE id = p_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'booking_status', 'COMPLETED'
  );
END;
$$;


-- -----------------------------------------------------------------------------
-- 5. Permissions Lockdown (Least Privilege)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.artist_start_session(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_start_session(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_start_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_start_session(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.artist_complete_session(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_complete_session(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_complete_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_complete_session(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.artist_complete_booking(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_complete_booking(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_complete_booking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_complete_booking(UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Reload Schema Cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
