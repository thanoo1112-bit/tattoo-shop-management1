-- ============================================================================
-- 157 TATTOO — PHASE 39 MIGRATION
-- RPC CUSTOMER DELETE CANCELLED ESTIMATE REQUEST & CLEANUP
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC: public.customer_delete_cancelled_request
-- Permanently deletes a CANCELLED estimate request owned by the authenticated customer.
-- Allowed ONLY for:
--   - estimate_requests.customer_user_id = auth.uid()
--   - status = 'CANCELLED'
--   - NO booking_payment_submissions linked to any associated booking
-- Cleans up date options, linked cancelled bookings/sessions, and the estimate request.
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
  v_est_id UUID;
  v_est_status TEXT;
  v_ref_images JSONB;
  v_has_payment_submissions BOOLEAN := false;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  -- 1. Lock estimate_request
  SELECT id, status, customer_user_id, reference_images
  INTO v_est_id, v_est_status, v_target_owner_id, v_ref_images
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id FOR UPDATE;

  IF v_est_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอที่ต้องการลบ' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_owner_id IS NULL OR v_target_owner_id != v_customer_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ลบคำขอนี้' USING ERRCODE = '42501';
  END IF;

  IF v_est_status != 'CANCELLED' THEN
    RAISE EXCEPTION 'ลบได้เฉพาะคำขอที่ถูกยกเลิกแล้วเท่านั้น' USING ERRCODE = '22000';
  END IF;

  -- 2. Check payment submissions
  SELECT EXISTS (
    SELECT 1 FROM public.booking_payment_submissions bps
    JOIN public.bookings b ON b.id = bps.booking_id
    WHERE b.estimate_request_id = p_estimate_request_id
  ) INTO v_has_payment_submissions;

  IF v_has_payment_submissions THEN
    RAISE EXCEPTION 'ไม่สามารถลบรายการที่มีข้อมูลชำระเงินได้' USING ERRCODE = '22000';
  END IF;

  -- 3. Cleanup child tables
  -- Delete date options
  DELETE FROM public.estimate_request_date_options
  WHERE estimate_request_id = p_estimate_request_id;

  -- Delete associated booking sessions & bookings (if any cancelled booking exists)
  DELETE FROM public.booking_sessions
  WHERE booking_id IN (
    SELECT id FROM public.bookings WHERE estimate_request_id = p_estimate_request_id
  );

  DELETE FROM public.bookings
  WHERE estimate_request_id = p_estimate_request_id;

  -- 4. Delete estimate_request
  DELETE FROM public.estimate_requests
  WHERE id = p_estimate_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'deleted_id', p_estimate_request_id,
    'reference_images', COALESCE(v_ref_images, '[]'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Permissions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.customer_delete_cancelled_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_delete_cancelled_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_delete_cancelled_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_delete_cancelled_request(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
