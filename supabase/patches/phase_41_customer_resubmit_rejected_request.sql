-- ============================================================================
-- 157 TATTOO — PHASE 41 MIGRATION
-- CUSTOMER RESUBMIT REJECTED REQUEST & ALLOW REJECTED HARD DELETE
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Update handle_estimate_status_transition Trigger Function
-- Permits REJECTED -> PENDING transition ONLY for customer owner (v_is_customer_owner).
-- Preserves terminal status immutability for EXPIRED & CANCELLED.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_estimate_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_is_assigned_artist BOOLEAN;
  v_booking_id UUID;
  v_booking_status TEXT;
  v_has_active_session BOOLEAN := false;
  v_has_slip BOOLEAN := false;
BEGIN
  v_is_admin := private.is_admin();
  v_is_customer_owner := (
    auth.uid() IS NOT NULL
    AND OLD.customer_user_id IS NOT NULL
    AND OLD.customer_user_id = auth.uid()
  );
  v_is_assigned_artist := (
    auth.uid() IS NOT NULL AND (
      (OLD.artist_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.artists WHERE artists.id = OLD.artist_id AND artists.user_id = auth.uid()
      ))
      OR (private.get_artist_id() IS NOT NULL AND OLD.artist_id = private.get_artist_id())
    )
  );

  -- Terminal Record Immutability Check (EXPIRED & CANCELLED are terminal; REJECTED can transition to PENDING ONLY for customer owner)
  IF OLD.status IN ('EXPIRED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Estimate request % is in terminal status %', OLD.id, OLD.status USING ERRCODE = '22023';
  ELSIF OLD.status = 'REJECTED' THEN
    IF NOT (NEW.status = 'PENDING' AND v_is_customer_owner) THEN
      RAISE EXCEPTION 'Estimate request % is in terminal status REJECTED', OLD.id USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status = 'QUOTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can quote estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'ACCEPTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or Customer owner can accept estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or Customer owner can reject estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only customer owner, admin, or assigned artist can cancel this request' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status USING ERRCODE = '22023';
      END IF;

    -- QUOTED transitions
    ELSIF OLD.status = 'QUOTED' THEN
      IF NEW.status = 'ACCEPTED' THEN
        IF NOT v_is_customer_owner THEN
          RAISE EXCEPTION 'Only the customer owner can accept estimate quotes' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Unauthorized to reject estimate quote' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can expire estimate quotes' USING ERRCODE = '22023';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from QUOTED to %', NEW.status USING ERRCODE = '22023';
      END IF;

    -- ACCEPTED transitions
    ELSIF OLD.status = 'ACCEPTED' THEN
      IF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only customer owner, admin, or assigned artist can cancel this request' USING ERRCODE = '42501';
        END IF;

        SELECT id, status INTO v_booking_id, v_booking_status
        FROM public.bookings
        WHERE estimate_request_id = OLD.id
          AND status NOT IN ('CANCELLED', 'REJECTED')
        ORDER BY created_at DESC LIMIT 1;

        IF v_booking_id IS NOT NULL THEN
          IF v_booking_status != 'WAITING_DEPOSIT' THEN
            RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM public.booking_sessions
            WHERE booking_id = v_booking_id
              AND status IN ('IN_PROGRESS', 'COMPLETED')
          ) INTO v_has_active_session;

          IF v_has_active_session THEN
            RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM public.booking_payment_submissions
            WHERE booking_id = v_booking_id
              AND status IN ('PENDING', 'APPROVED')
          ) INTO v_has_slip;

          IF v_has_slip THEN
            RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
          END IF;
        END IF;

      ELSE
        RAISE EXCEPTION 'Invalid status transition from ACCEPTED to %', NEW.status USING ERRCODE = '22023';
      END IF;

    -- REJECTED transitions (Allowed ONLY: REJECTED -> PENDING for customer owner)
    ELSIF OLD.status = 'REJECTED' THEN
      IF NEW.status = 'PENDING' THEN
        IF NOT v_is_customer_owner THEN
          RAISE EXCEPTION 'Only customer owner can resubmit a rejected request' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from REJECTED to %', NEW.status USING ERRCODE = '22023';
      END IF;

    ELSE
      RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Validate Assigned Artist
  IF NEW.artist_id IS NOT NULL AND (OLD.artist_id IS DISTINCT FROM NEW.artist_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.artists WHERE artists.id = NEW.artist_id AND artists.is_active = true
    ) THEN
      RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', NEW.artist_id USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Validate Quote Fields
  IF NEW.status IN ('QUOTED', 'ACCEPTED') THEN
    IF NEW.quoted_price IS NOT NULL AND NEW.quoted_price < 0 THEN
      RAISE EXCEPTION 'quoted_price must be >= 0 when estimate status is %', NEW.status USING ERRCODE = '22023';
    END IF;
    IF NEW.quoted_price IS NOT NULL AND NEW.deposit_required IS NOT NULL THEN
      IF NEW.deposit_required < 0 OR NEW.deposit_required > NEW.quoted_price THEN
        RAISE EXCEPTION 'deposit_required must be between 0 and quoted_price' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.estimated_duration_minutes IS NOT NULL AND NEW.estimated_duration_minutes <= 0 THEN
      RAISE EXCEPTION 'estimated_duration_minutes must be greater than 0' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- System Status Timestamps Management
  IF OLD.status = 'PENDING' AND NEW.status = 'QUOTED' THEN
    NEW.quoted_at := pg_catalog.now();
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED' THEN
    NEW.accepted_at := pg_catalog.now();
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
    NEW.rejected_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'ACCEPTED' THEN
    NEW.accepted_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'REJECTED' THEN
    NEW.rejected_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'EXPIRED' THEN
    NEW.rejected_at := OLD.rejected_at;
  ELSIF OLD.status = 'REJECTED' AND NEW.status = 'PENDING' THEN
    NEW.rejected_at := NULL;
    NEW.quote_note := NULL;
    NEW.quoted_at := NULL;
    NEW.accepted_at := NULL;
    NEW.quoted_price := NULL;
    NEW.deposit_required := NULL;
    NEW.is_date_proposed := false;
    NEW.proposed_artist_note := NULL;
    NEW.proposed_date := NULL;
    NEW.proposed_time := NULL;
  ELSE
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := OLD.rejected_at;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger Attachment
DROP TRIGGER IF EXISTS trig_01_estimate_status_transition ON public.estimate_requests;
CREATE TRIGGER trig_01_estimate_status_transition
  BEFORE UPDATE ON public.estimate_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_estimate_status_transition();

-- ----------------------------------------------------------------------------
-- 2. RPC: public.customer_resubmit_rejected_request
-- Resubmits a REJECTED estimate request owned by the authenticated customer.
-- Resets status to PENDING, clears rejection reasons/notes, cancels date options.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_resubmit_rejected_request(
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
  v_has_active_booking BOOLEAN := false;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  -- 1. Lock estimate_request
  SELECT id, status, customer_user_id
  INTO v_est_id, v_est_status, v_target_owner_id
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id FOR UPDATE;

  IF v_est_id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอที่ต้องการส่งใหม่' USING ERRCODE = 'P0002';
  END IF;

  IF v_target_owner_id IS NULL OR v_target_owner_id != v_customer_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ส่งคำขอนี้ใหม่' USING ERRCODE = '42501';
  END IF;

  IF v_est_status != 'REJECTED' THEN
    RAISE EXCEPTION 'ไม่สามารถส่งคำขอใหม่ได้ กรุณาติดต่อร้าน' USING ERRCODE = '22000';
  END IF;

  -- 2. Check that no active booking or payment submission exists
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.estimate_request_id = p_estimate_request_id
      AND b.status NOT IN ('CANCELLED', 'REJECTED')
  ) INTO v_has_active_booking;

  IF v_has_active_booking THEN
    RAISE EXCEPTION 'ไม่สามารถส่งคำขอใหม่ได้ กรุณาติดต่อร้าน' USING ERRCODE = '22000';
  END IF;

  -- 3. Delete any date options if present
  DELETE FROM public.estimate_request_date_options
  WHERE estimate_request_id = p_estimate_request_id;

  -- 4. Perform update to PENDING status
  UPDATE public.estimate_requests
  SET
    status = 'PENDING',
    rejected_at = NULL,
    quote_note = NULL,
    quoted_at = NULL,
    accepted_at = NULL,
    quoted_price = NULL,
    deposit_required = NULL,
    is_date_proposed = false,
    proposed_artist_note = NULL,
    proposed_date = NULL,
    proposed_time = NULL,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'status', 'PENDING'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Update public.customer_delete_pending_request
-- Allows hard delete for REJECTED status as well when no active bookings/slips exist.
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
    'reference_images', COALESCE(v_ref_images, '[]'::jsonb)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Permissions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.customer_resubmit_rejected_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_resubmit_rejected_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_resubmit_rejected_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_resubmit_rejected_request(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.customer_delete_pending_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_delete_pending_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_delete_pending_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_delete_pending_request(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
