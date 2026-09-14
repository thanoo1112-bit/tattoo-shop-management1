-- ============================================================================
-- 157 TATTOO — TATTOO SESSIONS MANAGEMENT SQL MIGRATION
-- RPC Functions: Delete, Cancel, Reschedule, Edit Session
-- Security: Server-side authorization (Admin / Service Role OR Assigned Artist)
-- Protection: Time validation, Overlap checks, Delete safeguards, Contiguous re-numbering
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Update Trigger handle_booking_session_validation()
--    Allow session_number / note updates on CANCELLED/COMPLETED sessions
--    while blocking start_at/end_at/status modifications.
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

  -- 5. Terminal session immutability on UPDATE (COMPLETED and CANCELLED cannot change timing or status)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('COMPLETED', 'CANCELLED') THEN
      IF NEW.status IS DISTINCT FROM OLD.status OR NEW.start_at IS DISTINCT FROM OLD.start_at OR NEW.end_at IS DISTINCT FROM OLD.end_at THEN
        RAISE EXCEPTION 'Session % in terminal status % cannot be modified', OLD.id, OLD.status
          USING ERRCODE = 'P0001';
      END IF;
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
-- 1. RPC: artist_delete_session
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_delete_session(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_session RECORD;
BEGIN
  -- 1. Input Validation
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'p_session_id is required' USING ERRCODE = '22004';
  END IF;

  -- 2. Lock & Select Session & Parent Booking
  SELECT s.id, s.booking_id, s.status, b.artist_id
  INTO v_session
  FROM public.booking_sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Authorization Check (Admin / Service Role OR Assigned Artist)
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND v_session.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to delete this session' USING ERRCODE = '42501';
  END IF;

  -- 4. Delete Safeguard Rules
  -- Forbidden to delete: CANCELLED, IN_PROGRESS, COMPLETED
  IF v_session.status IN ('CANCELLED', 'IN_PROGRESS', 'COMPLETED') THEN
    RAISE EXCEPTION 'Cannot delete session in status %. Cancelled/In-Progress/Completed sessions cannot be deleted.', v_session.status
      USING ERRCODE = '22023';
  END IF;

  -- 5. Delete Session Row
  DELETE FROM public.booking_sessions
  WHERE id = p_session_id;

  -- 6. Atomic Re-numbering for Remaining Sessions (1..N by start_at ASC)
  WITH renumbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY start_at ASC) AS new_num
    FROM public.booking_sessions
    WHERE booking_id = v_session.booking_id
  )
  UPDATE public.booking_sessions s
  SET session_number = r.new_num
  FROM renumbered r
  WHERE s.id = r.id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'booking_id', v_session.booking_id,
    'message', 'Session deleted successfully'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. RPC: artist_cancel_session_item
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_cancel_session_item(
  p_session_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_session RECORD;
BEGIN
  -- 1. Input Validation
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'p_session_id is required' USING ERRCODE = '22004';
  END IF;

  -- 2. Lock & Select Session & Parent Booking
  SELECT s.id, s.booking_id, s.status, b.artist_id, s.note
  INTO v_session
  FROM public.booking_sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Authorization Check (Admin / Service Role OR Assigned Artist)
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND v_session.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to cancel this session' USING ERRCODE = '42501';
  END IF;

  -- 4. Status Protection
  IF v_session.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Cannot cancel a session that is already COMPLETED' USING ERRCODE = '22023';
  END IF;

  -- 5. Update Status to CANCELLED (Preserve Row)
  UPDATE public.booking_sessions
  SET
    status = 'CANCELLED',
    note = CASE WHEN p_reason IS NOT NULL AND p_reason != '' THEN p_reason ELSE note END,
    updated_at = pg_catalog.now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'booking_id', v_session.booking_id,
    'message', 'Session cancelled successfully'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. RPC: artist_reschedule_session_item
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_reschedule_session_item(
  p_session_id UUID,
  p_new_date DATE,
  p_new_start_time TIME,
  p_new_end_time TIME,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_session RECORD;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict_count INT;
BEGIN
  -- 1. Input Validation
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'p_session_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_new_date IS NULL THEN
    RAISE EXCEPTION 'p_new_date is required' USING ERRCODE = '22004';
  END IF;

  IF p_new_start_time IS NULL OR p_new_end_time IS NULL THEN
    RAISE EXCEPTION 'p_new_start_time and p_new_end_time are required' USING ERRCODE = '22004';
  END IF;

  IF p_new_end_time <= p_new_start_time THEN
    RAISE EXCEPTION 'new_end_time must be later than new_start_time' USING ERRCODE = '22023';
  END IF;

  -- 2. Lock & Select Session & Parent Booking
  SELECT s.id, s.booking_id, s.status, b.artist_id, s.note
  INTO v_session
  FROM public.booking_sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Authorization Check (Admin / Service Role OR Assigned Artist)
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND v_session.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to reschedule this session' USING ERRCODE = '42501';
  END IF;

  -- 4. Status Safeguards: Cannot reschedule COMPLETED or IN_PROGRESS sessions
  IF v_session.status IN ('COMPLETED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Cannot reschedule session in status %', v_session.status USING ERRCODE = '22023';
  END IF;

  -- 5. Calculate Datetimes (+07 Bangkok)
  v_start_at := (p_new_date::TEXT || ' ' || p_new_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_new_date::TEXT || ' ' || p_new_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be later than start_at' USING ERRCODE = '22023';
  END IF;

  -- 6. Schedule Conflict Check for Assigned Artist
  -- Checks against other active sessions (SCHEDULED, IN_PROGRESS) belonging to the same artist. Excludes CANCELLED sessions and current session.
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE b.artist_id = v_session.artist_id
    AND s.id != p_session_id
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND s.start_at < v_end_at
    AND s.end_at > v_start_at;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'Schedule conflict: Artist already has an active session during this date and time' USING ERRCODE = '22023';
  END IF;

  -- 7. Update Session
  UPDATE public.booking_sessions
  SET
    start_at = v_start_at,
    end_at = v_end_at,
    note = CASE WHEN p_note IS NOT NULL THEN p_note ELSE note END,
    updated_at = pg_catalog.now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'booking_id', v_session.booking_id,
    'message', 'Session rescheduled successfully'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC: artist_edit_session_item
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_edit_session_item(
  p_session_id UUID,
  p_new_date DATE DEFAULT NULL,
  p_new_start_time TIME DEFAULT NULL,
  p_new_end_time TIME DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_session RECORD;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_target_date DATE;
  v_target_start_time TIME;
  v_target_end_time TIME;
  v_conflict_count INT;
BEGIN
  -- 1. Input Validation
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'p_session_id is required' USING ERRCODE = '22004';
  END IF;

  -- 2. Lock & Select Session & Parent Booking
  SELECT s.id, s.booking_id, s.status, s.start_at, s.end_at, b.artist_id, s.note
  INTO v_session
  FROM public.booking_sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Authorization Check (Admin / Service Role OR Assigned Artist)
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND v_session.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'Unauthorized: You do not have permission to edit this session' USING ERRCODE = '42501';
  END IF;

  -- 4. Derive Date & Time
  v_target_date := COALESCE(p_new_date, (v_session.start_at AT TIME ZONE 'Asia/Bangkok')::DATE);
  v_target_start_time := COALESCE(p_new_start_time, (v_session.start_at AT TIME ZONE 'Asia/Bangkok')::TIME);
  v_target_end_time := COALESCE(p_new_end_time, (v_session.end_at AT TIME ZONE 'Asia/Bangkok')::TIME);

  IF v_target_end_time <= v_target_start_time THEN
    RAISE EXCEPTION 'new_end_time must be later than new_start_time' USING ERRCODE = '22023';
  END IF;

  v_start_at := (v_target_date::TEXT || ' ' || v_target_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (v_target_date::TEXT || ' ' || v_target_end_time::TEXT || '+07')::TIMESTAMPTZ;

  -- 5. Conflict Check if Date/Time changed
  IF v_start_at IS DISTINCT FROM v_session.start_at OR v_end_at IS DISTINCT FROM v_session.end_at THEN
    SELECT COUNT(*) INTO v_conflict_count
    FROM public.booking_sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.artist_id = v_session.artist_id
      AND s.id != p_session_id
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND s.start_at < v_end_at
      AND s.end_at > v_start_at;

    IF v_conflict_count > 0 THEN
      RAISE EXCEPTION 'Schedule conflict: Artist already has an active session during this date and time' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 6. Update Session
  UPDATE public.booking_sessions
  SET
    start_at = v_start_at,
    end_at = v_end_at,
    status = COALESCE(p_status, status),
    note = CASE WHEN p_note IS NOT NULL THEN p_note ELSE note END,
    updated_at = pg_catalog.now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'booking_id', v_session.booking_id,
    'message', 'Session edited successfully'
  );
END;
$$;

-- Permissions Lockdown
REVOKE ALL ON FUNCTION public.artist_delete_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_delete_session(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.artist_cancel_session_item(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_cancel_session_item(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.artist_reschedule_session_item(UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_reschedule_session_item(UUID, DATE, TIME, TIME, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.artist_edit_session_item(UUID, DATE, TIME, TIME, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_edit_session_item(UUID, DATE, TIME, TIME, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
