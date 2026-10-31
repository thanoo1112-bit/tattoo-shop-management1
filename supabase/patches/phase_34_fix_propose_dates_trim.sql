-- ============================================================================
-- 157 TATTOO — PHASE 34 MIGRATION
-- FIX RUNTIME TRIM BUG IN ARTIST_PROPOSE_MULTI_BOOKING_DATES
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Update RPC: public.artist_propose_multi_booking_dates
-- Replaces pg_catalog.trim with NULLIF(BTRIM(COALESCE(p_artist_note, '')), '')
-- to resolve 'function pg_catalog.rtrim(text) / trim(text) does not exist' error.
-- Preserves all Phase 32 / 33 rules (allows 1 to 3 options, un-locks original date).
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
  v_trimmed_note TEXT;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  -- Safe text trimming with NULLIF and BTRIM (supported natively by PostgreSQL)
  v_trimmed_note := NULLIF(BTRIM(COALESCE(p_artist_note, '')), '');

  IF v_trimmed_note IS NULL THEN
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

  -- Scope Check: Admin or Assigned Artist Only
  IF NOT (v_is_admin OR (v_estimate.artist_id IS NOT NULL AND v_estimate.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'คำขอจองคิวไม่อยู่ในสถานะที่สามารถเสนอวันใหม่ได้' USING ERRCODE = '22023';
  END IF;

  -- 2. Mark any prior PENDING options as CANCELLED (Do NOT DELETE to preserve history)
  UPDATE public.estimate_request_date_options
  SET status = 'CANCELLED'
  WHERE estimate_request_id = p_estimate_request_id
    AND status = 'PENDING';

  -- 3. Insert new proposed options
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_date_options)
  LOOP
    v_idx := v_idx + 1;
    v_date := (v_item->>'date')::DATE;
    v_time := (v_item->>'time')::TIME;

    IF v_date IS NULL OR v_time IS NULL THEN
      RAISE EXCEPTION 'ข้อมูลวันหรือเวลาในตัวเลือกที่ % ไม่ถูกต้อง', v_idx USING ERRCODE = '22023';
    END IF;

    IF v_date < v_today THEN
      RAISE EXCEPTION 'ตัวเลือกที่ %: ไม่สามารถเลือกวันที่ย้อนหลังได้', v_idx USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.estimate_request_date_options (
      estimate_request_id,
      proposed_date,
      proposed_time,
      option_order,
      status,
      created_by_user_id,
      created_at
    )
    VALUES (
      p_estimate_request_id,
      v_date,
      v_time,
      v_idx,
      'PENDING',
      auth.uid(),
      pg_catalog.now()
    )
    ON CONFLICT (estimate_request_id, proposed_date, proposed_time)
    DO UPDATE SET
      option_order = EXCLUDED.option_order,
      status = 'PENDING',
      created_at = pg_catalog.now();
  END LOOP;

  -- 4. Update estimate_requests flag
  UPDATE public.estimate_requests
  SET
    is_date_proposed = TRUE,
    proposed_artist_note = v_trimmed_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', p_estimate_request_id,
    'options_count', v_option_count
  );
END;
$$;

-- Secure RPC Permissions for artist_propose_multi_booking_dates
REVOKE ALL ON FUNCTION public.artist_propose_multi_booking_dates(UUID, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_propose_multi_booking_dates(UUID, JSONB, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_propose_multi_booking_dates(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_propose_multi_booking_dates(UUID, JSONB, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
