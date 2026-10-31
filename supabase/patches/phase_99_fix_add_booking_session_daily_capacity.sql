-- ============================================================================
-- 157 TATTOO — PHASE 99: FIX ADD BOOKING SESSION DAILY CAPACITY
-- ============================================================================
-- Purpose:
--   Fix ONLY the legacy 1-job-per-day rule in public.add_booking_session
--   (removing Phase 74 check: v_artist_session_count > 0).
--
-- Rules:
--   1. MAX 3 DISTINCT active jobs / artist / day (deduplicated by booking_id).
--   2. Multiple sessions of the same booking count as 1 job.
--   3. Adding a new session for a booking already on that date does NOT increase
--      the distinct job count.
--   4. Keep existing time overlap check ('ช่วงเวลานี้ช่างมีคิวอยู่แล้ว กรุณาเลือกเวลาอื่น')
--      and table constraint no_artist_double_booking.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.add_booking_session(
  p_booking_id UUID,
  p_session_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_end_time TIME WITHOUT TIME ZONE DEFAULT NULL,
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
  v_next_session_num INT;
  v_daily_count INT;
  v_new_session_id UUID;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_actual_end_time TIME WITHOUT TIME ZONE;
BEGIN
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- Input Validation
  IF p_session_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุวันที่นัดหมายรอบสัก' USING ERRCODE = '22023';
  END IF;
  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุเวลานัดหมาย' USING ERRCODE = '22023';
  END IF;

  -- Handle default end_time backend side if omitted by Client
  v_actual_end_time := COALESCE(p_end_time, p_start_time + INTERVAL '1 hour');

  IF p_start_time >= v_actual_end_time THEN
    v_actual_end_time := p_start_time + INTERVAL '1 hour';
  END IF;

  -- Lock Parent Booking FOR UPDATE
  SELECT id, status, artist_id
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('CANCELLED', 'REJECTED', 'EXPIRED') THEN
    RAISE EXCEPTION 'ไม่สามารถเพิ่มรอบสักในคิวงานที่ยกเลิกหรือถูกปฏิเสธแล้ว' USING ERRCODE = '22023';
  END IF;

  -- ==========================================================================
  -- Daily Capacity Check: MAX 3 DISTINCT active jobs / artist / day
  -- Deduplicated by booking_id (Same booking on same day = 1 job)
  -- ==========================================================================
  WITH active_jobs_on_date AS (
    -- Main bookings on requested_date
    SELECT b.id AS booking_id
    FROM public.bookings b
    WHERE b.artist_id = v_booking.artist_id
      AND b.requested_date = p_session_date
      AND b.status IN ('WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')

    UNION

    -- Booking sessions on session date
    SELECT s.booking_id
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE COALESCE(s.artist_id, b.artist_id) = v_booking.artist_id
      AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_session_date
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status IN ('WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')

    UNION

    -- The booking currently being added
    SELECT p_booking_id AS booking_id
  )
  SELECT COUNT(DISTINCT booking_id)
  INTO v_daily_count
  FROM active_jobs_on_date;

  IF v_daily_count > 3 THEN
    RAISE EXCEPTION 'ช่างรับงานครบ 3 งานในวันที่เลือกแล้ว (เต็มโควตารายวัน) กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
  END IF;

  -- Calculate session timestamps
  v_start_at := (p_session_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_session_date::TEXT || ' ' || v_actual_end_time::TEXT || '+07')::TIMESTAMPTZ;

  -- Overlap Check (keeping existing overlap protection / no_artist_double_booking)
  IF EXISTS (
    SELECT 1 FROM public.booking_sessions s
    WHERE COALESCE(s.artist_id, (SELECT b2.artist_id FROM public.bookings b2 WHERE b2.id = s.booking_id)) = v_booking.artist_id
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND tstzrange(s.start_at, s.end_at, '[)') && tstzrange(v_start_at, v_end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'ช่วงเวลานี้ช่างมีคิวอยู่แล้ว กรุณาเลือกเวลาอื่น' USING ERRCODE = '23505';
  END IF;

  -- Determine Next Session Number
  SELECT COALESCE(MAX(session_number), 0) + 1 INTO v_next_session_num
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  -- Create Next Session (SCHEDULED)
  INSERT INTO public.booking_sessions (
    booking_id,
    artist_id,
    session_number,
    start_at,
    end_at,
    status,
    note,
    created_at,
    updated_at
  ) VALUES (
    p_booking_id,
    v_booking.artist_id,
    v_next_session_num,
    v_start_at,
    v_end_at,
    'SCHEDULED',
    COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), NULL),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_new_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'session_id', v_new_session_id,
    'session_number', v_next_session_num,
    'start_at', v_start_at,
    'end_at', v_end_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_booking_session(UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
