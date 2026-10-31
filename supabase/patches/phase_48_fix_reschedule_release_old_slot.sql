BEGIN;

-- ============================================================================
-- Phase 48: Fix Reschedule Release Old Slot & Calendar Busy Check (157 TATTOO)
-- ============================================================================
--
-- Business Rules Enforced:
-- 1. Rescheduling MUST update the existing session using its booking_session.id.
-- 2. Strict Session Ownership Guard: If p_session_id is passed to artist_reschedule_booking,
--    it MUST belong to p_booking_id (id = p_session_id AND booking_id = p_booking_id).
-- 3. Strict Lifecycle Guard: Only sessions in status 'SCHEDULED' of active bookings
--    (status NOT IN 'CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED') can be rescheduled.
-- 4. Date A MUST be released immediately upon rescheduling to Date B.
-- 5. Date B MUST be marked as busy instead.
-- 6. Conflict check MUST exclude the session being edited (s.id != p_session_id)
--    and count only active SCHEDULED sessions.
-- 7. All table syncs (booking_sessions, bookings, estimate_requests) occur in ONE transaction.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RPC: public.get_artist_busy_ranges
-- Returns dates marked as busy for a given artist (or studio-wide).
-- Uses dynamic SQL for flash_reservations if table exists.
-- Excludes estimate_requests / bookings that already have active booking_sessions.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_artist_busy_ranges(
  p_artist_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_flash_reservations_exists BOOLEAN;
  v_sql TEXT;
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date are required' USING ERRCODE = '22004';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'p_end_date cannot be earlier than p_start_date' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'flash_reservations'
  ) INTO v_flash_reservations_exists;

  v_sql := '
    WITH busy_dates AS (
      -- 1. Active estimate_requests WITHOUT active booking_sessions
      SELECT er.preferred_date AS d
      FROM public.estimate_requests er
      WHERE er.is_date_proposed IS NOT TRUE
        AND er.preferred_date BETWEEN $2 AND $3
        AND er.status NOT IN (''CANCELLED'', ''REJECTED'', ''EXPIRED'', ''COMPLETED'')
        AND ($1::UUID IS NULL OR er.artist_id = $1::UUID)
        AND NOT EXISTS (
          SELECT 1
          FROM public.bookings b
          JOIN public.booking_sessions s ON s.booking_id = b.id
          WHERE b.estimate_request_id = er.id
            AND s.status IN (''SCHEDULED'', ''IN_PROGRESS'')
            AND b.status NOT IN (''CANCELLED'', ''REJECTED'', ''EXPIRED'', ''COMPLETED'')
        )

      UNION

      -- 2. Active bookings WITHOUT active booking_sessions
      SELECT b.requested_date AS d
      FROM public.bookings b
      WHERE b.requested_date BETWEEN $2 AND $3
        AND b.status NOT IN (''CANCELLED'', ''REJECTED'', ''EXPIRED'', ''COMPLETED'')
        AND ($1::UUID IS NULL OR b.artist_id = $1::UUID)
        AND NOT EXISTS (
          SELECT 1
          FROM public.booking_sessions s
          WHERE s.booking_id = b.id
            AND s.status IN (''SCHEDULED'', ''IN_PROGRESS'')
        )

      UNION

      -- 3. Active booking_sessions for active bookings
      SELECT (s.start_at AT TIME ZONE ''Asia/Bangkok'')::DATE AS d
      FROM public.booking_sessions s
      JOIN public.bookings b ON s.booking_id = b.id
      WHERE (s.start_at AT TIME ZONE ''Asia/Bangkok'')::DATE BETWEEN $2 AND $3
        AND s.status IN (''SCHEDULED'', ''IN_PROGRESS'')
        AND b.status NOT IN (''CANCELLED'', ''REJECTED'', ''EXPIRED'', ''COMPLETED'')
        AND ($1::UUID IS NULL OR b.artist_id = $1::UUID OR s.artist_id = $1::UUID)';

  IF v_flash_reservations_exists THEN
    v_sql := v_sql || '
      UNION

      -- 4. Active flash_reservations across ALL artists (via Dynamic SQL)
      SELECT requested_date AS d
      FROM public.flash_reservations
      WHERE requested_date BETWEEN $2 AND $3
        AND status NOT IN (''CANCELLED'', ''REJECTED'', ''EXPIRED'', ''COMPLETED'')
        AND ($1::UUID IS NULL OR artist_id = $1::UUID)';
  END IF;

  v_sql := v_sql || '
      UNION

      -- 5. Studio blocked dates (ALL artists) OR Artist blocked dates for p_artist_id
      SELECT blocked_date AS d
      FROM public.artist_blocked_dates
      WHERE blocked_date BETWEEN $2 AND $3
        AND (
          scope = ''STUDIO''
          OR ($1::UUID IS NOT NULL AND scope = ''ARTIST'' AND artist_id = $1::UUID)
          OR (artist_id IS NULL AND scope IS NULL)
        )
    )
    SELECT
      (bd.d::TEXT || '' 00:00:00+07'')::TIMESTAMPTZ AS start_at,
      (bd.d::TEXT || '' 23:59:59+07'')::TIMESTAMPTZ AS end_at
    FROM busy_dates bd
    WHERE bd.d IS NOT NULL
    ORDER BY start_at ASC';

  RETURN QUERY EXECUTE v_sql USING p_artist_id, p_start_date, p_end_date;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. RPC: public.artist_reschedule_session_item
-- Reschedules a specific booking_sessions row by ID, updating booking_sessions,
-- bookings.requested_date, and estimate_requests.preferred_date in one transaction.
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
  SELECT s.id, s.booking_id, s.status AS session_status, 
         b.artist_id, b.estimate_request_id, b.status AS booking_status, s.note
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

  -- 4. Strict Lifecycle Guards: Only SCHEDULED sessions and active bookings allowed
  IF v_session.booking_status IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Cannot reschedule session for booking in status %', v_session.booking_status USING ERRCODE = '22023';
  END IF;

  IF v_session.session_status != 'SCHEDULED' THEN
    RAISE EXCEPTION 'Cannot reschedule session in status % (only SCHEDULED sessions can be rescheduled)', v_session.session_status USING ERRCODE = '22023';
  END IF;

  -- 5. Calculate Datetimes (+07 Bangkok)
  v_start_at := (p_new_date::TEXT || ' ' || p_new_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_new_date::TEXT || ' ' || p_new_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be later than start_at' USING ERRCODE = '22023';
  END IF;

  -- 6. Schedule Conflict Check for Assigned Artist
  -- Excludes session itself (s.id != p_session_id) and inactive bookings/sessions
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE b.artist_id = v_session.artist_id
    AND s.id != p_session_id
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND s.start_at < v_end_at
    AND s.end_at > v_start_at;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'Schedule conflict: Artist already has an active session during this date and time' USING ERRCODE = '22023';
  END IF;

  -- 7. Update Session row by ID
  UPDATE public.booking_sessions
  SET
    start_at = v_start_at,
    end_at = v_end_at,
    note = CASE WHEN p_note IS NOT NULL THEN p_note ELSE note END,
    updated_at = pg_catalog.now()
  WHERE id = p_session_id;

  -- 8. Sync parent booking requested_date & requested_start_time
  UPDATE public.bookings
  SET
    requested_date = p_new_date,
    requested_start_time = p_new_start_time,
    updated_at = pg_catalog.now()
  WHERE id = v_session.booking_id;

  -- 9. Sync parent estimate_request preferred_date if exists
  IF v_session.estimate_request_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET
      preferred_date = p_new_date,
      updated_at = pg_catalog.now()
    WHERE id = v_session.estimate_request_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'booking_id', v_session.booking_id,
    'new_date', p_new_date,
    'new_start_time', p_new_start_time,
    'new_end_time', p_new_end_time
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. RPC: public.artist_reschedule_booking
-- Reschedules a booking and its associated session, updating booking_sessions,
-- bookings, and estimate_requests in a single transaction.
-- Enforces strict session-to-booking ownership check when p_session_id is passed.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_reschedule_booking(
  p_booking_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_new_date DATE DEFAULT NULL,
  p_new_start_time TIME DEFAULT NULL,
  p_new_end_time TIME DEFAULT NULL,
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
  v_booking RECORD;
  v_session RECORD;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_conflict_count INT;
  v_cur_start TIME;
  v_cur_end TIME;
BEGIN
  -- 1. Input Validation
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'p_booking_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_new_date IS NULL THEN
    RAISE EXCEPTION 'p_new_date is required' USING ERRCODE = '22004';
  END IF;

  -- 2. Authorization Check (Admin / Service Role OR Assigned Artist)
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 3. Lock & Select Booking
  SELECT id, artist_id, estimate_request_id, requested_date, requested_start_time, status
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน %', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 4. Strict Lifecycle Guard: Check Booking status
  IF v_booking.status IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Cannot reschedule booking in status %', v_booking.status USING ERRCODE = '22023';
  END IF;

  -- 5. Identify & Lock Target Session with Strict Ownership Guard
  IF p_session_id IS NOT NULL THEN
    SELECT s.id, s.booking_id, s.status, 
           (s.start_at AT TIME ZONE 'Asia/Bangkok')::TIME AS cur_start,
           (s.end_at AT TIME ZONE 'Asia/Bangkok')::TIME AS cur_end
    INTO v_session
    FROM public.booking_sessions s
    WHERE s.id = p_session_id AND s.booking_id = p_booking_id
    FOR UPDATE;

    IF v_session.id IS NULL THEN
      RAISE EXCEPTION 'Session % does not belong to booking % or does not exist', p_session_id, p_booking_id USING ERRCODE = 'P0002';
    END IF;
  ELSE
    SELECT s.id, s.booking_id, s.status, 
           (s.start_at AT TIME ZONE 'Asia/Bangkok')::TIME AS cur_start,
           (s.end_at AT TIME ZONE 'Asia/Bangkok')::TIME AS cur_end
    INTO v_session
    FROM public.booking_sessions s
    WHERE s.booking_id = p_booking_id
    ORDER BY s.session_number ASC
    LIMIT 1
    FOR UPDATE;
  END IF;

  -- 6. Strict Lifecycle Guard: Check Session status (Only SCHEDULED allowed)
  IF v_session.id IS NOT NULL AND v_session.status != 'SCHEDULED' THEN
    RAISE EXCEPTION 'Cannot reschedule session in status % (only SCHEDULED sessions can be rescheduled)', v_session.status USING ERRCODE = '22023';
  END IF;

  -- 7. Calculate Datetimes (+07 Bangkok)
  v_cur_start := COALESCE(p_new_start_time, v_session.cur_start, v_booking.requested_start_time, '10:00:00'::TIME);
  v_cur_end := COALESCE(p_new_end_time, v_session.cur_end, (v_cur_start + INTERVAL '2 hours')::TIME);

  IF v_cur_end <= v_cur_start THEN
    RAISE EXCEPTION 'Calculated end_at must be later than start_at' USING ERRCODE = '22023';
  END IF;

  v_start_at := (p_new_date::TEXT || ' ' || v_cur_start::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_new_date::TEXT || ' ' || v_cur_end::TEXT || '+07')::TIMESTAMPTZ;

  -- 8. Conflict Check (excluding target session)
  IF v_session.id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conflict_count
    FROM public.booking_sessions s
    JOIN public.bookings b ON b.id = s.booking_id
    WHERE b.artist_id = v_booking.artist_id
      AND s.id != v_session.id
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND s.start_at < v_end_at
      AND s.end_at > v_start_at;

    IF v_conflict_count > 0 THEN
      RAISE EXCEPTION 'Schedule conflict: Artist already has an active session during this date and time' USING ERRCODE = '22023';
    END IF;

    -- Update session row by ID
    UPDATE public.booking_sessions
    SET
      start_at = v_start_at,
      end_at = v_end_at,
      note = CASE WHEN p_note IS NOT NULL THEN p_note ELSE note END,
      updated_at = pg_catalog.now()
    WHERE id = v_session.id;
  END IF;

  -- 9. Update parent booking
  UPDATE public.bookings
  SET
    requested_date = p_new_date,
    requested_start_time = COALESCE(p_new_start_time, requested_start_time),
    admin_note = COALESCE(p_note, admin_note),
    updated_at = pg_catalog.now()
  WHERE id = p_booking_id;

  -- 10. Update linked estimate_request preferred_date if exists
  IF v_booking.estimate_request_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET
      preferred_date = p_new_date,
      updated_at = pg_catalog.now()
    WHERE id = v_booking.estimate_request_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'session_id', v_session.id,
    'new_date', p_new_date
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Secure Permissions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO service_role;

REVOKE ALL ON FUNCTION public.artist_reschedule_session_item(UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_reschedule_session_item(UUID, DATE, TIME, TIME, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_reschedule_session_item(UUID, DATE, TIME, TIME, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.artist_reschedule_booking(UUID, UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_reschedule_booking(UUID, UUID, DATE, TIME, TIME, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_reschedule_booking(UUID, UUID, DATE, TIME, TIME, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
