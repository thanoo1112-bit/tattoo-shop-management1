-- ============================================================================
-- 157 TATTOO — PHASE 33 MIGRATION
-- ALLOW SINGLE APPOINTMENT OPTION PROPOSAL (1 TO 3 OPTIONS)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Update RPC: public.artist_propose_multi_booking_dates
-- Allows artist (assigned) or Admin to propose 1 to 3 appointment options.
-- Does NOT lock any dates on the studio calendar yet.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_propose_multi_booking_dates(
  p_estimate_request_id UUID,
  p_date_options JSONB,
  p_artist_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_estimate RECORD;
  v_option_count INT;
  v_item JSONB;
  v_date DATE;
  v_time TIME;
  v_idx INT := 0;
  v_today DATE;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_artist_note IS NULL OR pg_catalog.trim(p_artist_note) = '' THEN
    RAISE EXCEPTION 'กรุณาระบุหมายเหตุถึงลูกค้า (เช่น เหตุผลที่เสนอวันใหม่)' USING ERRCODE = '22004';
  END IF;

  -- Validate json array of options
  IF p_date_options IS NULL OR jsonb_typeof(p_date_options) != 'array' THEN
    RAISE EXCEPTION 'กรุณาระบุตัวเลือกวันนัดหมายที่ถูกต้อง' USING ERRCODE = '22023';
  END IF;

  v_option_count := jsonb_array_length(p_date_options);
  IF v_option_count < 1 OR v_option_count > 3 THEN
    RAISE EXCEPTION 'กรุณาระบุตัวเลือกวันนัดหมายอย่างน้อย 1 ตัวเลือก และไม่เกิน 3 ตัวเลือก' USING ERRCODE = '22023';
  END IF;

  v_today := (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE;

  -- 1. Select and lock target estimate request
  SELECT id, artist_id, status, customer_user_id
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการคำขอจองคิว' USING ERRCODE = 'P0002';
  END IF;

  -- Permission check: Admin or assigned Artist only
  IF NOT v_is_admin THEN
    IF v_estimate.artist_id IS NULL OR v_estimate.artist_id != v_artist_id THEN
      RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคำขอของช่างท่านอื่น' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Status check: Request must be PENDING
  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'ไม่สามารถเสนอวันนัดใหม่สำหรับคำขอนี้ได้เนื่องจากไม่อยู่ในสถานะรอดำเนินการ (PENDING)' USING ERRCODE = '22000';
  END IF;

  -- 2. Mark existing PENDING options as CANCELLED (do NOT delete to preserve history)
  UPDATE public.estimate_request_date_options
  SET status = 'CANCELLED'
  WHERE estimate_request_id = p_estimate_request_id
    AND status = 'PENDING';

  -- 3. Loop and insert new options
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_date_options)
  LOOP
    v_idx := v_idx + 1;
    v_date := (v_item->>'date')::DATE;
    v_time := (v_item->>'time')::TIME;

    IF v_date IS NULL OR v_time IS NULL THEN
      RAISE EXCEPTION 'รูปแบบวันและเวลาไม่ถูกต้องในตัวเลือกที่ %', v_idx USING ERRCODE = '22007';
    END IF;

    IF v_date < v_today THEN
      RAISE EXCEPTION 'ไม่สามารถเสนอวันนัดย้อนหลังได้ (ตัวเลือกที่ %: %)', v_idx, v_date USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.estimate_request_date_options (
      estimate_request_id,
      proposed_date,
      proposed_time,
      option_order,
      status,
      created_by_user_id
    ) VALUES (
      p_estimate_request_id,
      v_date,
      v_time,
      v_idx,
      'PENDING',
      auth.uid()
    );
  END LOOP;

  -- 4. Update estimate_requests table flags
  UPDATE public.estimate_requests
  SET is_date_proposed = TRUE,
      proposed_artist_note = pg_catalog.trim(p_artist_note),
      updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'ส่งเสนอตัวเลือกวันนัดหมายใหม่ให้ลูกค้าเรียบร้อยแล้ว',
    'option_count', v_option_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.artist_propose_multi_booking_dates(UUID, JSONB, TEXT) TO authenticated;

COMMIT;
