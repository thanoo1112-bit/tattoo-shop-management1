-- ============================================================================
-- 157 TATTOO — PHASE 57: STANDALONE RPC FOR ADD BOOKING SESSION ONLY
-- Contains ONLY public.add_booking_session and public.admin_add_booking_session
-- NO financial logic, NO view modifications, NO payment calculations.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_booking_session(
  p_booking_id UUID,
  p_session_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_end_time TIME WITHOUT TIME ZONE,
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
  IF p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด' USING ERRCODE = '22023';
  END IF;
  IF p_start_time >= p_end_time THEN
    RAISE EXCEPTION 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มรอบสัก' USING ERRCODE = '22023';
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
    -- 1. Primary booking requested_date of OTHER customers on p_session_date
    SELECT id FROM public.bookings
    WHERE id <> p_booking_id
      AND status IN ('WAITING_DEPOSIT', 'CONFIRMED', 'IN_PROGRESS')
      AND requested_date = p_session_date

    UNION ALL

    -- 2. Additional sessions of OTHER customer bookings on p_session_date
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
  v_end_at := (p_session_date::TEXT || ' ' || p_end_time::TEXT || '+07')::TIMESTAMPTZ;

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
    'booking_id', p_booking_id,
    'new_session_id', v_new_session_id,
    'session_number', v_next_session_num
  );
END;
$$;

-- Alias Wrapper RPC: admin_add_booking_session
CREATE OR REPLACE FUNCTION public.admin_add_booking_session(
  p_booking_id UUID,
  p_session_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_end_time TIME WITHOUT TIME ZONE,
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

GRANT EXECUTE ON FUNCTION public.add_booking_session(UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_booking_session(UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
