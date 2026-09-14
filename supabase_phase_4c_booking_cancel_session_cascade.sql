-- ============================================================================
-- 157 TATTOO — PHASE 4C MIGRATION
-- NORMAL TATTOO BOOKING — BOOKING CANCELLATION SESSION CASCADE
-- (DATABASE SAFETY PATCH & CALENDAR INTEGRITY)
-- ============================================================================
-- Business Rules:
-- 1. When a booking's status transitions to 'CANCELLED', all associated
--    sessions in 'SCHEDULED' status are automatically updated to 'CANCELLED'.
-- 2. Sessions in 'IN_PROGRESS' status must NOT be auto-cancelled. If any
--    session is 'IN_PROGRESS', the booking cancellation is strictly REJECTED.
-- 3. Sessions in 'COMPLETED' or 'CANCELLED' status are terminal and preserved.
-- 4. Calendar slot exclusion constraint 'no_artist_double_booking' applies
--    only to SCHEDULED and IN_PROGRESS; cancelling the session immediately
--    releases the artist's calendar slot for other bookings.
-- 5. Atomic transaction: If session cascade fails, booking cancellation rolls back.
-- 6. Payment records (booking_payments) remain 100% untouched.
-- 7. Flash bookings are 100% untouched.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Update Session Validation Trigger Function
-- ----------------------------------------------------------------------------
-- Allow SCHEDULED -> CANCELLED session updates when parent booking is CANCELLED.
-- All other modifications to sessions under terminal bookings remain blocked.
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

  -- 3. Status Eligibility: Sessions may be scheduled when WAITING_DEPOSIT, CONFIRMED, or IN_PROGRESS
  IF TG_OP = 'INSERT' THEN
    IF v_booking_status NOT IN ('WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'Cannot schedule session for booking % in % status; booking must be WAITING_DEPOSIT, CONFIRMED or IN_PROGRESS',
        NEW.booking_id, v_booking_status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 4. Cannot add/modify sessions for terminal bookings (except cancelling a SCHEDULED session)
  IF v_booking_status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    IF NOT (TG_OP = 'UPDATE' AND OLD.status = 'SCHEDULED' AND NEW.status = 'CANCELLED') THEN
      RAISE EXCEPTION 'Cannot schedule session for booking % in terminal status %', NEW.booking_id, v_booking_status
        USING ERRCODE = 'P0001';
    END IF;
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
-- 2. Create Booking Cancellation Session Cascade Trigger Function
-- ----------------------------------------------------------------------------
-- Target Table: public.bookings
-- Trigger Event: AFTER UPDATE OF status ON public.bookings
-- Condition: OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'CANCELLED'
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_booking_cancel_session_cascade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- 1. Safeguard: Block cancelling parent booking if any session is currently IN_PROGRESS
  IF EXISTS (
    SELECT 1 FROM public.booking_sessions
    WHERE booking_id = NEW.id
      AND status = 'IN_PROGRESS'
  ) THEN
    RAISE EXCEPTION 'Cannot cancel booking %: session is currently IN_PROGRESS', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Cascade: Transition all SCHEDULED sessions under this booking to CANCELLED
  -- Note: COMPLETED sessions are preserved for historical record.
  UPDATE public.booking_sessions
  SET status = 'CANCELLED',
      updated_at = pg_catalog.now()
  WHERE booking_id = NEW.id
    AND status = 'SCHEDULED';

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Attach Cascade Trigger to public.bookings
-- ----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trig_04_booking_cancel_session_cascade ON public.bookings;
CREATE TRIGGER trig_04_booking_cancel_session_cascade
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'CANCELLED')
  EXECUTE FUNCTION public.handle_booking_cancel_session_cascade();

-- ----------------------------------------------------------------------------
-- 4. Permissions Lockdown (Security Definer)
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.handle_booking_session_validation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_booking_session_validation() FROM anon;
REVOKE ALL ON FUNCTION public.handle_booking_session_validation() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_booking_session_validation() TO service_role;

REVOKE ALL ON FUNCTION public.handle_booking_cancel_session_cascade() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_booking_cancel_session_cascade() FROM anon;
REVOKE ALL ON FUNCTION public.handle_booking_cancel_session_cascade() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_booking_cancel_session_cascade() TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Notify PostgREST to Reload Schema Cache
-- ----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
