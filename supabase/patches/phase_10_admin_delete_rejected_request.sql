-- ============================================================================
-- 157 TATTOO - PHASE 10: ADMIN DELETE REJECTED REQUEST ARCHITECTURE
-- ============================================================================
-- Purpose:
--   Allow Admin to permanently delete requests with status = 'REJECTED'.
--   Includes strict safety checks for financial payment records and active sessions.
--   Preserves customer accounts (auth.users, profiles, customers).
-- ============================================================================

BEGIN;

-- 1. Create Secure Canonical Admin Delete RPC
CREATE OR REPLACE FUNCTION public.admin_delete_rejected_request(
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_estimate RECORD;
  v_booking RECORD;
  v_booking_ids UUID[] := '{}'::UUID[];
  v_ref_images TEXT[] := '{}'::TEXT[];
  v_target_est_id UUID := NULL;
BEGIN
  -- 1. Authorization Check: Require Authenticated Admin
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin can delete rejected requests' USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'p_request_id is required' USING ERRCODE = '22004';
  END IF;

  -- 2. Locate Target Request (Check estimate_requests first)
  SELECT id, status, reference_images INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_request_id;

  IF FOUND THEN
    v_target_est_id := v_estimate.id;
    v_ref_images := COALESCE(v_estimate.reference_images, '{}'::TEXT[]);

    -- Status Safety Check on estimate_requests
    IF v_estimate.status != 'REJECTED' THEN
      RAISE EXCEPTION 'ไม่สามารถลบได้ เนื่องจากสถานะรายการมีการเปลี่ยนแปลง' USING ERRCODE = '22023';
    END IF;

    -- Collect linked booking IDs if any
    SELECT pg_catalog.array_agg(id) INTO v_booking_ids
    FROM public.bookings
    WHERE estimate_request_id = v_target_est_id;

    v_booking_ids := COALESCE(v_booking_ids, '{}'::UUID[]);

  ELSE
    -- If not found in estimate_requests, check bookings table
    SELECT id, estimate_request_id, status INTO v_booking
    FROM public.bookings
    WHERE id = p_request_id;

    IF FOUND THEN
      IF v_booking.status != 'REJECTED' THEN
        RAISE EXCEPTION 'ไม่สามารถลบได้ เนื่องจากสถานะรายการมีการเปลี่ยนแปลง' USING ERRCODE = '22023';
      END IF;

      v_booking_ids := ARRAY[v_booking.id];

      IF v_booking.estimate_request_id IS NOT NULL THEN
        v_target_est_id := v_booking.estimate_request_id;

        -- Check parent estimate status if present
        SELECT status, reference_images INTO v_estimate
        FROM public.estimate_requests
        WHERE id = v_target_est_id;

        IF FOUND THEN
          v_ref_images := COALESCE(v_estimate.reference_images, '{}'::TEXT[]);
          IF v_estimate.status != 'REJECTED' THEN
            RAISE EXCEPTION 'ไม่สามารถลบได้ เนื่องจากสถานะรายการมีการเปลี่ยนแปลง' USING ERRCODE = '22023';
          END IF;
        END IF;
      END IF;

    ELSE
      RAISE EXCEPTION 'Target request with ID % not found', p_request_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 3. Financial Safety Check: BLOCK if payment records or payment submissions exist
  IF pg_catalog.cardinality(v_booking_ids) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.booking_payments
      WHERE booking_id = ANY(v_booking_ids)
    ) OR EXISTS (
      SELECT 1 FROM public.booking_payment_submissions
      WHERE booking_id = ANY(v_booking_ids)
    ) THEN
      RAISE EXCEPTION 'ไม่สามารถลบรายการนี้ได้ เนื่องจากมีข้อมูลการชำระเงินที่เกี่ยวข้อง' USING ERRCODE = '22023';
    END IF;

    -- 4. Session Safety Check: BLOCK if active / non-cancelled booking sessions exist
    IF EXISTS (
      SELECT 1 FROM public.booking_sessions
      WHERE booking_id = ANY(v_booking_ids) AND status != 'CANCELLED'
    ) THEN
      RAISE EXCEPTION 'ไม่สามารถลบรายการนี้ได้ เนื่องจากมีรอบสักที่เข้าสู่ระบบแล้ว' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 5. Safe Order Deletion (Exact target IDs only)
  IF pg_catalog.cardinality(v_booking_ids) > 0 THEN
    -- Delete cancelled booking sessions if any exist
    DELETE FROM public.booking_sessions
    WHERE booking_id = ANY(v_booking_ids);

    -- Delete linked bookings
    DELETE FROM public.bookings
    WHERE id = ANY(v_booking_ids);
  END IF;

  -- Delete target estimate request if present
  IF v_target_est_id IS NOT NULL THEN
    DELETE FROM public.estimate_requests
    WHERE id = v_target_est_id;
  END IF;

  -- 6. Return Payload with reference image paths for storage cleanup
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'message', 'ลบคำขอที่ปฏิเสธแล้วเรียบร้อย',
    'deleted_request_id', p_request_id,
    'deleted_estimate_id', v_target_est_id,
    'reference_images', v_ref_images
  );
END;
$function$;

-- 2. Grant Permissions
REVOKE ALL ON FUNCTION public.admin_delete_rejected_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_rejected_request(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_delete_rejected_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_rejected_request(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
