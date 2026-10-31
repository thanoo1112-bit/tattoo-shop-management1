-- ============================================================================
-- 157 TATTOO — PHASE 57: COMPLETE BOOKING SESSION RPC ONLY
-- Standalone RPC to complete a specific booking session without touching payments or booking status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_booking_session(
  p_booking_id UUID,
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
  v_booking RECORD;
  v_session RECORD;
BEGIN
  -- 1. Check Permissions (Admin or Assigned Artist)
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- Input Validation
  IF p_booking_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุ booking_id และ session_id' USING ERRCODE = '22023';
  END IF;

  -- 2. Lock Parent Booking FOR UPDATE
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

  -- 3. Lock Target Session FOR UPDATE & verify it belongs to this booking
  SELECT id, booking_id, status
  INTO v_session
  FROM public.booking_sessions
  WHERE id = p_session_id AND booking_id = p_booking_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลรอบสักของคิวงานนี้' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Check Status (Allow only SCHEDULED or IN_PROGRESS)
  IF v_session.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', true, 'message', 'รอบสักนี้เสร็จสิ้นแล้ว');
  END IF;

  IF v_session.status NOT IN ('SCHEDULED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'ไม่สามารถเสร็จสิ้นรอบสักที่มีสถานะ % ได้', v_session.status USING ERRCODE = '22023';
  END IF;

  -- 5. UPDATE ONLY session status to COMPLETED
  UPDATE public.booking_sessions
  SET status = 'COMPLETED',
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'status', 'COMPLETED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_booking_session(UUID, UUID) TO authenticated;

-- Wrapper RPC
CREATE OR REPLACE FUNCTION public.admin_complete_booking_session(
  p_booking_id UUID,
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.complete_booking_session(p_booking_id, p_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_complete_booking_session(UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
