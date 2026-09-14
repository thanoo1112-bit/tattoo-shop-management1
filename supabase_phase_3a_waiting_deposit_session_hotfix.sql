-- ============================================================================
-- 157 TATTOO — PHASE 1 HOTFIX MIGRATION
-- NORMAL TATTOO BOOKING — WAITING_DEPOSIT SESSION SUPPORT
-- ============================================================================
-- Fix: Allow SCHEDULED sessions under bookings in WAITING_DEPOSIT status.
-- Enables admin to lock artist calendar slot immediately upon confirming
-- a booking request, even when a deposit is pending payment.
-- Preserves: no_artist_double_booking GiST exclusion constraint 100%.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Update Validation Function: handle_booking_session_validation
-- ----------------------------------------------------------------------------
-- Target Table: public.booking_sessions
-- Trigger: trig_01_booking_session_validation (BEFORE INSERT OR UPDATE)
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
  -- (WAITING_DEPOSIT allows calendar slot locking while customer pays deposit)
  IF TG_OP = 'INSERT' THEN
    IF v_booking_status NOT IN ('WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'Cannot schedule session for booking % in % status; booking must be WAITING_DEPOSIT, CONFIRMED or IN_PROGRESS',
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
-- 2. Secure Permissions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.handle_booking_session_validation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_booking_session_validation() FROM anon;
REVOKE ALL ON FUNCTION public.handle_booking_session_validation() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.handle_booking_session_validation() TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Notify PostgREST to Reload Schema Cache
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
