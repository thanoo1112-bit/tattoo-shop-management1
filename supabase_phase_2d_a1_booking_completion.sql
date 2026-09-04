-- ============================================================================
-- 157 TATTOO — PHASE 2D-A.1: BOOKING COMPLETION LIFECYCLE
-- SESSION -> BOOKING STATE SYNCHRONIZATION & CANONICAL COMPLETION RPC
-- (ATOMIC TRANSACTION • STRICT SECURITY DEFINER SET search_path = '' • ROW LOCKS)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Hardening: Session Validation with Parent Booking Row Lock (FOR UPDATE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_session_validation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking_artist_id UUID;
  v_booking_status TEXT;
BEGIN
  -- 1. Fetch and Lock Parent Booking row for Serialization
  SELECT artist_id, status INTO v_booking_artist_id, v_booking_status
  FROM public.bookings
  WHERE id = NEW.booking_id
  FOR UPDATE;

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

  -- 5. Terminal session immutability on UPDATE (COMPLETED and CANCELLED are terminal)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('COMPLETED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Session % in terminal status % cannot be modified', OLD.id, OLD.status
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
-- 2. Trigger Function: Session -> Booking State Synchronization
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_session_status_booking_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking_status TEXT;
BEGIN
  -- When a session starts (transitions to IN_PROGRESS)
  IF NEW.status = 'IN_PROGRESS' THEN
    SELECT status INTO v_booking_status
    FROM public.bookings
    WHERE id = NEW.booking_id
    FOR UPDATE;

    IF v_booking_status IS NULL THEN
      RAISE EXCEPTION 'Associated booking % does not exist', NEW.booking_id
        USING ERRCODE = 'P0001';
    END IF;

    -- Safety Guard: Cannot start session if booking is waiting deposit or terminal
    IF v_booking_status = 'WAITING_DEPOSIT' THEN
      RAISE EXCEPTION 'Cannot start session for booking % in WAITING_DEPOSIT status', NEW.booking_id
        USING ERRCODE = 'P0001';
    ELSIF v_booking_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED') THEN
      RAISE EXCEPTION 'Cannot start session for booking % in % status', NEW.booking_id, v_booking_status
        USING ERRCODE = 'P0001';
    END IF;

    -- If booking is CONFIRMED, automatically transition to IN_PROGRESS
    -- (started_at timestamp assignment is handled by handle_booking_status_transition)
    IF v_booking_status = 'CONFIRMED' THEN
      UPDATE public.bookings
      SET status = 'IN_PROGRESS'
      WHERE id = NEW.booking_id;
    END IF;
    -- If booking is already IN_PROGRESS, it remains IN_PROGRESS

  END IF;

  -- Note: When session status becomes 'COMPLETED', booking strictly remains IN_PROGRESS.
  -- Booking completion requires explicit Admin action via complete_booking() RPC.

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Attach Trigger to public.booking_sessions
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trig_03_session_booking_sync ON public.booking_sessions;
CREATE TRIGGER trig_03_session_booking_sync
  AFTER UPDATE OF status ON public.booking_sessions
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.handle_session_status_booking_sync();

-- ----------------------------------------------------------------------------
-- 4. Canonical Server-Side RPC: complete_booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_booking(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_booking RECORD;
  v_total_sessions INT;
  v_completed_sessions INT;
  v_active_sessions INT;
BEGIN
  -- 1. Admin Authority Check
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only active Admin can complete a booking'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock and Fetch Booking
  SELECT id, status, customer_user_id, artist_id
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Status Eligibility Check: STRICTLY IN_PROGRESS ONLY
  IF v_booking.status != 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Cannot complete booking % in % status; booking must be IN_PROGRESS', p_booking_id, v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Session State Validation
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'COMPLETED'),
    COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS'))
  INTO v_total_sessions, v_completed_sessions, v_active_sessions
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  -- Must have at least 1 session
  IF v_total_sessions = 0 THEN
    RAISE EXCEPTION 'Cannot complete booking %: no sessions found', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Must have at least 1 COMPLETED session
  IF v_completed_sessions = 0 THEN
    RAISE EXCEPTION 'Cannot complete booking %: at least one session must be COMPLETED', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Must have NO active (SCHEDULED or IN_PROGRESS) sessions
  IF v_active_sessions > 0 THEN
    RAISE EXCEPTION 'Cannot complete booking %: all scheduled or in-progress sessions must be completed or cancelled first', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Transition Booking to COMPLETED
  -- (completed_at timestamp assignment is handled by handle_booking_status_transition)
  UPDATE public.bookings
  SET status = 'COMPLETED'
  WHERE id = p_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'status', 'COMPLETED',
    'booking_id', p_booking_id
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Security & Permissions Lockdown
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.handle_booking_session_validation() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.handle_session_status_booking_sync() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.complete_booking(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_booking(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_booking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_booking(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 6. Schema Cache Reload Notification
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
