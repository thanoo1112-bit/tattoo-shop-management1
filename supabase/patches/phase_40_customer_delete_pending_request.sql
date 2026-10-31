-- ============================================================================
-- 157 TATTOO — PHASE 40 MIGRATION
-- RPC CUSTOMER DELETE PENDING / WAITING_DEPOSIT / CANCELLED ESTIMATE REQUEST
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC: public.customer_delete_pending_request
-- Permanently deletes an estimate request owned by the authenticated customer.
-- Allowed for:
--   - estimate_requests.customer_user_id = auth.uid()
--   - status IN ('PENDING', 'CANCELLED') OR (booking.status = 'WAITING_DEPOSIT' AND NO payment submissions)
-- Strictly prohibited if:
--   - ANY booking_payment_submissions exist (regardless of status)
--   - ANY linked booking is NOT in WAITING_DEPOSIT / CANCELLED / REJECTED status
--   - ANY linked session is IN_PROGRESS or COMPLETED
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
  v_ref_images JSONB;
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

  -- 5. Cleanup child records
  -- Delete booking sessions for associated bookings (frees up schedule)
  DELETE FROM public.booking_sessions
  WHERE booking_id IN (
    SELECT id FROM public.bookings WHERE estimate_request_id = p_estimate_request_id
  );

  -- Delete associated bookings
  DELETE FROM public.bookings
  WHERE estimate_request_id = p_estimate_request_id;

  -- Delete estimate_request_date_options
  DELETE FROM public.estimate_request_date_options
  WHERE estimate_request_id = p_estimate_request_id;

  -- Delete estimate_requests
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
REVOKE ALL ON FUNCTION public.customer_delete_pending_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_delete_pending_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_delete_pending_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_delete_pending_request(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
