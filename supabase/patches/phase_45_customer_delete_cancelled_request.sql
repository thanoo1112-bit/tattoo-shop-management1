-- ============================================================================
-- 157 TATTOO — PHASE 45 MIGRATION
-- CUSTOMER DELETE CANCELLED OR REJECTED REQUEST ARCHITECTURE
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC: public.customer_delete_cancelled_request
-- Permanently hard deletes estimate_request and linked objects ONLY if status IN ('CANCELLED', 'REJECTED').
-- Strictly blocks PENDING, ACCEPTED, QUOTED, EXPIRED, etc.
-- Revokes execution on obsolete customer_delete_pending_request RPC from authenticated.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_delete_cancelled_request(
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
  v_est_status TEXT;
  v_raw_ref_images TEXT;
  v_ref_images_jsonb JSONB := '[]'::jsonb;
  v_booking_ids UUID[] := '{}'::UUID[];
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  -- 1. Lock target estimate_request
  SELECT customer_user_id, status, reference_images::text
  INTO v_target_owner_id, v_est_status, v_raw_ref_images
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบคำขอที่ต้องการลบ' USING ERRCODE = 'P0002';
  END IF;

  -- Ownership Guard
  IF v_target_owner_id IS NULL OR v_target_owner_id != v_customer_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ลบคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- Strict Status Guard: ALLOW ONLY 'CANCELLED' OR 'REJECTED'
  IF v_est_status NOT IN ('CANCELLED', 'REJECTED') THEN
    RAISE EXCEPTION 'สามารถลบได้เฉพาะคำขอที่ถูกยกเลิกหรือถูกปฏิเสธแล้วเท่านั้น' USING ERRCODE = '22000';
  END IF;

  -- Collect linked bookings
  SELECT pg_catalog.array_agg(id) INTO v_booking_ids
  FROM public.bookings
  WHERE estimate_request_id = p_estimate_request_id;

  v_booking_ids := COALESCE(v_booking_ids, '{}'::UUID[]);

  -- Financial & Session Safety Check if linked bookings exist
  IF pg_catalog.cardinality(v_booking_ids) > 0 THEN
    -- BLOCK if ANY payment submission exists (regardless of status)
    IF EXISTS (
      SELECT 1 FROM public.booking_payment_submissions
      WHERE booking_id = ANY(v_booking_ids)
    ) OR EXISTS (
      SELECT 1 FROM public.booking_payments
      WHERE booking_id = ANY(v_booking_ids)
    ) THEN
      RAISE EXCEPTION 'ไม่สามารถลบคำขอนี้ได้ เนื่องจากมีประวัติการชำระเงินที่เกี่ยวข้อง' USING ERRCODE = '22000';
    END IF;

    -- BLOCK if any booking is in active status or active session exists
    IF EXISTS (
      SELECT 1 FROM public.bookings
      WHERE id = ANY(v_booking_ids)
        AND status NOT IN ('CANCELLED', 'REJECTED')
    ) THEN
      RAISE EXCEPTION 'ไม่สามารถลบคำขอนี้ได้ เนื่องจากคิวค้างอยู่ระหว่างดำเนินการ' USING ERRCODE = '22000';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.booking_sessions
      WHERE booking_id = ANY(v_booking_ids)
        AND status IN ('IN_PROGRESS', 'COMPLETED')
    ) THEN
      RAISE EXCEPTION 'ไม่สามารถลบคำขอนี้ได้ เนื่องจากมีรอบสักที่อยู่ระหว่างดำเนินการ' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Parse reference images safely using existing helper
  v_ref_images_jsonb := private.safe_parse_reference_images_array(v_raw_ref_images);

  -- Hard Delete sequence: booking_sessions -> bookings -> estimate_request_date_options -> estimate_requests
  IF pg_catalog.cardinality(v_booking_ids) > 0 THEN
    DELETE FROM public.booking_sessions
    WHERE booking_id = ANY(v_booking_ids);

    DELETE FROM public.bookings
    WHERE id = ANY(v_booking_ids);
  END IF;

  DELETE FROM public.estimate_request_date_options
  WHERE estimate_request_id = p_estimate_request_id;

  DELETE FROM public.estimate_requests
  WHERE id = p_estimate_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'deleted_estimate_request_id', p_estimate_request_id,
    'reference_images', v_ref_images_jsonb
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Revoke permissions on old RPC & Grant on new RPC
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.customer_delete_pending_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_delete_pending_request(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.customer_delete_pending_request(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.customer_delete_pending_request(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.customer_delete_cancelled_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_delete_cancelled_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_delete_cancelled_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_delete_cancelled_request(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
