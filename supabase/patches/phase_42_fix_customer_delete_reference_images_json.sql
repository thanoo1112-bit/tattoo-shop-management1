-- ============================================================================
-- 157 TATTOO — PHASE 42 MIGRATION
-- FIX REFERENCE IMAGES JSON CASTING & STRICT STATUS GUARD IN CUSTOMER DELETE RPC
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper Function: private.safe_parse_reference_images_array
-- Safely parses NULL, empty, JSON array, JSON string, or raw TEXT/UUID strings
-- into a valid JSONB array without throwing 22P02 casting errors.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.safe_parse_reference_images_array(p_val TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_trimmed TEXT;
  v_json JSONB;
BEGIN
  IF p_val IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_trimmed := pg_catalog.btrim(p_val);

  IF v_trimmed = '' OR v_trimmed = 'null' OR v_trimmed = '[]' THEN
    RETURN '[]'::jsonb;
  END IF;

  BEGIN
    v_json := v_trimmed::jsonb;
    IF pg_catalog.jsonb_typeof(v_json) = 'array' THEN
      RETURN v_json;
    ELSE
      RETURN pg_catalog.jsonb_build_array(v_json);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Raw TEXT, UUID, or non-JSON string fallback
    RETURN pg_catalog.jsonb_build_array(v_trimmed);
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. RPC: public.customer_delete_pending_request
-- Permanently deletes an estimate request owned by the authenticated customer.
-- Allowed STRICTLY ONLY for:
--   - estimate_requests.customer_user_id = auth.uid()
--   - status IN ('PENDING', 'CANCELLED') OR (status = 'ACCEPTED' AND linked booking status = 'WAITING_DEPOSIT' AND NO payment submissions)
-- Disallowed (RAISE 'คิวนี้มีการดำเนินการแล้ว กรุณาติดต่อร้าน') for:
--   - QUOTED, REJECTED, EXPIRED, CONFIRMED, IN_PROGRESS, COMPLETED
--   - ANY booking_payment_submissions existing
--   - ANY active booking in non-WAITING_DEPOSIT status or session in IN_PROGRESS/COMPLETED
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_delete_pending_request(
  p_estimate_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_user_id UUID;
  v_target_owner_id UUID;
  v_est_id UUID;
  v_est_status TEXT;
  v_raw_ref_images TEXT;
  v_ref_images JSONB := '[]'::jsonb;
  v_has_payment_submissions BOOLEAN := false;
  v_has_non_waiting_booking BOOLEAN := false;
  v_has_active_session BOOLEAN := false;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  -- 1. Lock estimate_request & extract reference_images safely as TEXT
  SELECT id, status, customer_user_id, reference_images::TEXT
  INTO v_est_id, v_est_status, v_target_owner_id, v_raw_ref_images
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id FOR UPDATE;

  IF v_est_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอที่ต้องการลบ' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_owner_id IS NULL OR v_target_owner_id != v_customer_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ลบคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- Convert raw reference_images text safely into JSONB array
  v_ref_images := private.safe_parse_reference_images_array(v_raw_ref_images);

  -- 2. Check payment submissions (PROHIBITED if any slip exists)
  SELECT EXISTS (
    SELECT 1 FROM public.booking_payment_submissions bps
    JOIN public.bookings b ON b.id = bps.booking_id
    WHERE b.estimate_request_id = p_estimate_request_id
  ) INTO v_has_payment_submissions;

  IF v_has_payment_submissions THEN
    RAISE EXCEPTION 'คิวนี้มีการดำเนินการแล้ว กรุณาติดต่อร้าน' USING ERRCODE = '22000';
  END IF;

  -- 3. Check for any booking in active status other than WAITING_DEPOSIT / CANCELLED / REJECTED
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.estimate_request_id = p_estimate_request_id
      AND b.status NOT IN ('WAITING_DEPOSIT', 'CANCELLED', 'REJECTED')
  ) INTO v_has_non_waiting_booking;

  IF v_has_non_waiting_booking THEN
    RAISE EXCEPTION 'คิวนี้มีการดำเนินการแล้ว กรุณาติดต่อร้าน' USING ERRCODE = '22000';
  END IF;

  -- 4. Check for sessions in IN_PROGRESS or COMPLETED
  SELECT EXISTS (
    SELECT 1 FROM public.booking_sessions bs
    JOIN public.bookings b ON b.id = bs.booking_id
    WHERE b.estimate_request_id = p_estimate_request_id
      AND bs.status IN ('IN_PROGRESS', 'COMPLETED')
  ) INTO v_has_active_session;

  IF v_has_active_session THEN
    RAISE EXCEPTION 'คิวนี้มีการดำเนินการแล้ว กรุณาติดต่อร้าน' USING ERRCODE = '22000';
  END IF;

  -- 5. Strict Status Guard
  -- อนุญาตลบเฉพาะ PENDING / CANCELLED
  -- หรือ ACCEPTED ที่มี booking WAITING_DEPOSIT และผ่านการตรวจสลิป/session แล้ว
  IF v_est_status IN ('PENDING', 'CANCELLED') THEN
    NULL;

  ELSIF v_est_status = 'ACCEPTED' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.bookings
      WHERE estimate_request_id = p_estimate_request_id
        AND status = 'WAITING_DEPOSIT'
    ) THEN
      RAISE EXCEPTION 'คิวนี้มีการดำเนินการแล้ว กรุณาติดต่อร้าน'
        USING ERRCODE = '22000';
    END IF;

  ELSE
    -- QUOTED, REJECTED, EXPIRED และสถานะอื่น ๆ
    RAISE EXCEPTION 'คิวนี้มีการดำเนินการแล้ว กรุณาติดต่อร้าน'
      USING ERRCODE = '22000';
  END IF;

  -- 6. Cleanup child records in strict order
  DELETE FROM public.booking_sessions
  WHERE booking_id IN (
    SELECT id FROM public.bookings WHERE estimate_request_id = p_estimate_request_id
  );

  DELETE FROM public.bookings
  WHERE estimate_request_id = p_estimate_request_id;

  DELETE FROM public.estimate_request_date_options
  WHERE estimate_request_id = p_estimate_request_id;

  DELETE FROM public.estimate_requests
  WHERE id = p_estimate_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'deleted_id', p_estimate_request_id,
    'reference_images', v_ref_images
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Permissions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.customer_delete_pending_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_delete_pending_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_delete_pending_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_delete_pending_request(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
