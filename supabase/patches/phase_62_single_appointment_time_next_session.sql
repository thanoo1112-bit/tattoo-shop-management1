-- ============================================================================
-- 157 TATTOO — PHASE 62: SINGLE APPOINTMENT TIME FOR NEXT BOOKING SESSIONS
-- Updates public.add_booking_session and public.admin_add_booking_session
-- Allows p_end_time DEFAULT NULL. If p_end_time IS NULL, backend defaults
-- v_actual_end_time := p_start_time + INTERVAL '1 hour' for DB constraint safety.
-- ============================================================================

BEGIN;

-- Drop old function overloads if present
DROP FUNCTION IF EXISTS public.add_booking_session(UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT);
DROP FUNCTION IF EXISTS public.admin_add_booking_session(UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT);

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
  v_artist_session_count INT;
  v_new_session_id UUID;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_actual_end_time TIME WITHOUT TIME ZONE;
BEGIN
  v_is_admin := private.is_admin();
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

  -- Check Availability: Ensure no OTHER customer booking has a main queue or session on p_session_date
  SELECT COUNT(*) INTO v_artist_session_count
  FROM (
    SELECT id FROM public.bookings
    WHERE id <> p_booking_id
      AND status IN ('WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')
      AND requested_date = p_session_date

    UNION ALL

    SELECT id FROM public.booking_sessions
    WHERE booking_id <> p_booking_id
      AND status IN ('SCHEDULED', 'IN_PROGRESS')
      AND (start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_session_date
  ) existing_queues;

  IF v_artist_session_count > 0 THEN
    RAISE EXCEPTION 'ช่างมีคิวในวันที่เลือกแล้ว กรุณาเลือกวันอื่น' USING ERRCODE = '22023';
  END IF;

  -- Determine Next Session Number
  SELECT COALESCE(MAX(session_number), 0) + 1 INTO v_next_session_num
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  -- Create Next Session (SCHEDULED)
  v_start_at := (p_session_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_session_date::TEXT || ' ' || v_actual_end_time::TEXT || '+07')::TIMESTAMPTZ;

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

CREATE OR REPLACE FUNCTION public.admin_add_booking_session(
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
BEGIN
  RETURN public.add_booking_session(p_booking_id, p_session_date, p_start_time, p_end_time, p_note);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_booking_session(UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_booking_session(UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
