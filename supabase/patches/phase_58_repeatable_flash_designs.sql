-- Phase 58: Add is_repeatable column to flash_designs and update RPCs for repeatable vs single-use flash logic

-- 1. Add column is_repeatable to flash_designs (default false)
ALTER TABLE public.flash_designs
ADD COLUMN IF NOT EXISTS is_repeatable BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Update create_flash_reservation RPC
CREATE OR REPLACE FUNCTION public.create_flash_reservation(
  p_flash_design_id UUID,
  p_requested_date DATE DEFAULT NULL,
  p_requested_start_time TIME DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL
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

  -- Create reservation
  INSERT INTO public.flash_reservations (
    flash_design_id,
    customer_user_id,
    status,
    requested_date,
    requested_start_time,
    customer_note,
    created_at
  )
  VALUES (
    p_flash_design_id,
    v_user_id,
    'PENDING',
    p_requested_date,
    p_requested_start_time,
    p_customer_note,
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

-- 3. Update admin_process_flash_reservation RPC
CREATE OR REPLACE FUNCTION public.admin_process_flash_reservation(
  p_reservation_id UUID,
  p_action TEXT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flash_design_id UUID;
  v_is_repeatable BOOLEAN;
  v_new_res_status TEXT;
  v_new_design_status TEXT;
BEGIN
  SELECT flash_design_id INTO v_flash_design_id
  FROM public.flash_reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการจอง Flash';
  END IF;

  SELECT COALESCE(is_repeatable, FALSE) INTO v_is_repeatable
  FROM public.flash_designs
  WHERE id = v_flash_design_id;

  IF p_action = 'APPROVE' THEN
    v_new_res_status := 'APPROVED';
    v_new_design_status := 'RESERVED';
  ELSIF p_action = 'REJECT' THEN
    v_new_res_status := 'REJECTED';
    v_new_design_status := 'AVAILABLE';
  ELSIF p_action = 'CANCEL' THEN
    v_new_res_status := 'CANCELLED';
    v_new_design_status := 'AVAILABLE';
  ELSIF p_action = 'COMPLETE' THEN
    v_new_res_status := 'COMPLETED';
    v_new_design_status := 'SOLD';
  ELSE
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- Update reservation status
  UPDATE public.flash_reservations
  SET
    status = v_new_res_status,
    admin_note = p_admin_note,
    approved_at = CASE WHEN p_action = 'APPROVE' THEN NOW() ELSE approved_at END,
    rejected_at = CASE WHEN p_action = 'REJECT' THEN NOW() ELSE rejected_at END,
    cancelled_at = CASE WHEN p_action = 'CANCEL' THEN NOW() ELSE cancelled_at END,
    completed_at = CASE WHEN p_action = 'COMPLETE' THEN NOW() ELSE completed_at END
  WHERE id = p_reservation_id;

  -- Only update flash_designs status if single-use (is_repeatable = false)
  IF v_is_repeatable IS FALSE THEN
    UPDATE public.flash_designs
    SET status = v_new_design_status
    WHERE id = v_flash_design_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Update cancel_flash_reservation RPC
CREATE OR REPLACE FUNCTION public.cancel_flash_reservation(
  p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_flash_design_id UUID;
  v_is_repeatable BOOLEAN;
  v_res_customer_id UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT flash_design_id, customer_user_id
  INTO v_flash_design_id, v_res_customer_id
  FROM public.flash_reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการจอง Flash';
  END IF;

  IF v_user_id IS NOT NULL AND v_res_customer_id != v_user_id THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ยกเลิกคำขอจองนี้';
  END IF;

  SELECT COALESCE(is_repeatable, FALSE) INTO v_is_repeatable
  FROM public.flash_designs
  WHERE id = v_flash_design_id;

  UPDATE public.flash_reservations
  SET status = 'CANCELLED', cancelled_at = NOW()
  WHERE id = p_reservation_id;

  IF v_is_repeatable IS FALSE THEN
    UPDATE public.flash_designs
    SET status = 'AVAILABLE'
    WHERE id = v_flash_design_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
