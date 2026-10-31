-- ============================================================================
-- 157 TATTOO — PHASE 48: ADD BOOKING SESSION ATOMIC TRANSITION CONTROL
-- Requirements:
-- 1. Atomic insertion of next session (SCHEDULED status)
-- 2. Transaction safety (all-or-nothing rollback)
-- 3. Authorization check (Admin / Service Role OR Assigned Artist)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.add_booking_session(
  p_booking_id UUID,
  p_session_date DATE,
  p_start_time TIME,
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
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_next_session_num INT;
  v_new_session_id UUID;
  v_conflict_count INT;
BEGIN
  -- 1. Input Validation
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'p_booking_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_session_date IS NULL OR p_start_time IS NULL THEN
    RAISE EXCEPTION 'p_session_date and p_start_time are required' USING ERRCODE = '22004';
  END IF;

  -- 2. Lock & Select Parent Booking
  SELECT id, status, artist_id, customer_user_id
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  -- 3. Authorization Check (Admin / Service Role OR Assigned Artist)
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 4. Status Check on Parent Booking
  IF v_booking.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot add session to booking % in status %', p_booking_id, v_booking.status
      USING ERRCODE = '22023';
  END IF;

  -- 5. Calculate Datetimes (+07 Bangkok)
  v_start_at := (p_session_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := v_start_at + INTERVAL '2 hours';

  -- 6. Calculate Next Session Number
  SELECT COALESCE(MAX(session_number), 0) + 1
  INTO v_next_session_num
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  -- 7. Overlap Check for Assigned Artist
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE b.artist_id = v_booking.artist_id
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND s.start_at < v_end_at
    AND s.end_at > v_start_at;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'ช่วงเวลานี้ช่างมีคิวอยู่แล้ว กรุณาเลือกเวลาอื่น' USING ERRCODE = '23P01';
  END IF;

  -- 8. Insert New Session (session.status MUST be SCHEDULED for future appointments)
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
    p_note,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_new_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', v_new_session_id,
    'booking_id', p_booking_id,
    'session_number', v_next_session_num,
    'booking_status', v_booking.status,
    'session_status', 'SCHEDULED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.add_booking_session(UUID, DATE, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_booking_session(UUID, DATE, TIME, TEXT) TO authenticated, service_role;
