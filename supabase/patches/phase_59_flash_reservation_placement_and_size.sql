-- Phase 59: Add placement, width_cm, height_cm columns to flash_reservations and update create_flash_reservation RPC

ALTER TABLE public.flash_reservations
ADD COLUMN IF NOT EXISTS placement TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS width_cm NUMERIC DEFAULT NULL,
ADD COLUMN IF NOT EXISTS height_cm NUMERIC DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.create_flash_reservation(
  p_flash_design_id UUID,
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
  v_flash_status TEXT;
  v_is_repeatable BOOLEAN;
  v_reservation_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาล็อกอินก่อนทำการจองลาย Flash';
  END IF;

  SELECT status, COALESCE(is_repeatable, FALSE)
  INTO v_flash_status, v_is_repeatable
  FROM public.flash_designs
  WHERE id = p_flash_design_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบแบบลายสัก Flash ที่ระบุ';
  END IF;

  -- For single-use designs (is_repeatable = false), must be AVAILABLE
  IF v_is_repeatable IS FALSE AND v_flash_status != 'AVAILABLE' THEN
    RAISE EXCEPTION 'แบบลายสัก Flash นี้มีผู้จองหรือถูกจำหน่ายแล้ว';
  END IF;

  -- Create reservation with placement and size
  INSERT INTO public.flash_reservations (
    flash_design_id,
    customer_user_id,
    status,
    requested_date,
    requested_start_time,
    customer_note,
    placement,
    width_cm,
    height_cm,
    created_at
  )
  VALUES (
    p_flash_design_id,
    v_user_id,
    'PENDING',
    p_requested_date,
    p_requested_start_time,
    p_customer_note,
    p_placement,
    p_width_cm,
    p_height_cm,
    NOW()
  )
  RETURNING id INTO v_reservation_id;

  -- Only change flash_designs.status to HELD if single-use
  IF v_is_repeatable IS FALSE THEN
    UPDATE public.flash_designs
    SET status = 'HELD'
    WHERE id = p_flash_design_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id
  );
END;
$$;
