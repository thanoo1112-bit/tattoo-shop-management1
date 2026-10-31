-- Phase 60: Add update_flash_reservation RPC for editing pending flash reservations

CREATE OR REPLACE FUNCTION public.update_flash_reservation(
  p_reservation_id UUID,
  p_requested_date DATE DEFAULT NULL,
  p_requested_start_time TIME DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL,
  p_placement TEXT DEFAULT NULL,
  p_width_cm NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_owner_id UUID;
  v_status TEXT;
  v_flash_design_id UUID;
  v_artist_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาล็อกอินก่อนทำการแก้ไขคำขอ';
  END IF;

  -- Verify reservation existence, ownership, status, and flash_design_id
  SELECT fr.customer_user_id, fr.status, fr.flash_design_id, fd.artist_id
  INTO v_owner_id, v_status, v_flash_design_id, v_artist_id
  FROM public.flash_reservations fr
  JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
  WHERE fr.id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำขอจองลาย Flash ที่ระบุ';
  END IF;

  -- Security check: Ownership
  IF v_owner_id != v_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์แก้ไขคำขอนี้';
  END IF;

  -- Server-side re-verification: Must be in PENDING status
  IF v_status != 'PENDING' THEN
    RAISE EXCEPTION 'สามารถแก้ไขได้เฉพาะคำขอที่อยู่ในสถานะรอตรวจสอบ (PENDING) เท่านั้น';
  END IF;

  -- Date check: Cannot select past dates
  IF p_requested_date IS NOT NULL AND p_requested_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกวันนัดหมายย้อนหลังได้';
  END IF;

  -- Update reservation fields
  UPDATE public.flash_reservations
  SET
    requested_date = p_requested_date,
    requested_start_time = p_requested_start_time,
    customer_note = p_customer_note,
    placement = p_placement,
    width_cm = p_width_cm,
    height_cm = p_height_cm,
    updated_at = NOW()
  WHERE id = p_reservation_id AND customer_user_id = v_user_id AND status = 'PENDING';

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id
  );
END;
$$;
