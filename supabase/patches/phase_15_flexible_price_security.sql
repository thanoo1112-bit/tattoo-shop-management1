-- ============================================================================
-- 157 TATTOO — PHASE 15 PATCH: FLEXIBLE PRICE SYSTEM SECURITY HARDENING
-- Strict Role Authorization + Customer RLS Lockdown + ACCEPTED Price Adjustment Support
-- ============================================================================

-- 0. Update handle_estimate_status_transition trigger function to permit price adjustments on ACCEPTED estimates
CREATE OR REPLACE FUNCTION public.handle_estimate_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_is_admin BOOLEAN;
  v_is_assigned_artist BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_current_artist_id UUID;
BEGIN
  -- 1. Terminal Record Immutability Check (REJECTED and EXPIRED are strictly immutable)
  IF OLD.status IN ('REJECTED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Estimate request % is in terminal status % and cannot be modified', OLD.id, OLD.status
      USING ERRCODE = '22023';
  ELSIF OLD.status = 'ACCEPTED' THEN
    -- ACCEPTED requests cannot change status
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Estimate request % is ACCEPTED and status cannot be changed', OLD.id
        USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 2. Customer Ownership Immutability Check
  IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
    RAISE EXCEPTION 'customer_user_id cannot be changed'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Created At Immutability Check
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be changed'
      USING ERRCODE = '22023';
  END IF;

  -- 4. Customer-Submitted Request Content Immutability Check
  IF (
    NEW.reference_images IS DISTINCT FROM OLD.reference_images
    OR NEW.width_cm IS DISTINCT FROM OLD.width_cm
    OR NEW.height_cm IS DISTINCT FROM OLD.height_cm
    OR NEW.placement IS DISTINCT FROM OLD.placement
    OR NEW.style IS DISTINCT FROM OLD.style
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.preferred_date IS DISTINCT FROM OLD.preferred_date
  ) THEN
    RAISE EXCEPTION 'Customer-submitted request fields cannot be modified after creation'
      USING ERRCODE = '22023';
  END IF;

  -- 5. Identify Actor
  v_is_admin := private.is_admin();
  v_current_artist_id := private.get_artist_id();
  v_is_assigned_artist := (v_current_artist_id IS NOT NULL AND OLD.artist_id IS NOT NULL AND OLD.artist_id = v_current_artist_id);
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);

  -- 6. Validate Allowed Status Transitions & Enforce Actor Rules
  IF NEW.status IS DISTINCT FROM OLD.status THEN

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status = 'QUOTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can quote estimate requests' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'ACCEPTED' THEN
        -- Direct Admin or Assigned Artist confirmation
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can directly confirm pending booking requests' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can reject pending estimate requests' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status USING ERRCODE = '22023';
      END IF;

    -- QUOTED transitions (Preserved for compatibility)
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
    END IF;

  END IF;

  -- 7. Validate Admin Artist Assignment (Active Artist Requirement)
  IF NEW.artist_id IS NOT NULL AND (OLD.artist_id IS DISTINCT FROM NEW.artist_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.artists
      WHERE artists.id = NEW.artist_id AND artists.is_active = true
    ) THEN
      RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', NEW.artist_id USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 8. Validate Quote Fields When Status is QUOTED or ACCEPTED
  IF NEW.status IN ('QUOTED', 'ACCEPTED') THEN
    IF NEW.quoted_price IS NULL OR NEW.quoted_price < 0 THEN
      RAISE EXCEPTION 'quoted_price >= 0 is required when estimate status is %', NEW.status USING ERRCODE = '22023';
    END IF;
    IF NEW.deposit_required IS NOT NULL THEN
      IF NEW.deposit_required < 0 OR NEW.deposit_required > NEW.quoted_price THEN
        RAISE EXCEPTION 'deposit_required must be between 0 and quoted_price' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.estimated_duration_minutes IS NOT NULL AND NEW.estimated_duration_minutes <= 0 THEN
      RAISE EXCEPTION 'estimated_duration_minutes must be greater than 0' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 9. Complete Database Authority Over System Status Timestamps
  IF OLD.status = 'PENDING' AND NEW.status = 'QUOTED' THEN
    NEW.quoted_at := pg_catalog.now();
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := OLD.rejected_at;
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED' THEN
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := pg_catalog.now();
    NEW.rejected_at := OLD.rejected_at;
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'ACCEPTED' THEN
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := pg_catalog.now();
    NEW.rejected_at := OLD.rejected_at;
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'REJECTED' THEN
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'EXPIRED' THEN
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := pg_catalog.now();
  END IF;

  -- 10. Automatically set updated_at
  NEW.updated_at := pg_catalog.now();

  RETURN NEW;
END;
$function$;

-- 1. Tighten RLS Security Model on public.booking_price_adjustments
DROP POLICY IF EXISTS "Allow authenticated read on booking_price_adjustments" ON public.booking_price_adjustments;
DROP POLICY IF EXISTS "Allow staff read on booking_price_adjustments" ON public.booking_price_adjustments;

-- Restrict SELECT access strictly to Admin and Artist staff users
CREATE POLICY "Allow staff read on booking_price_adjustments"
  ON public.booking_price_adjustments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (profiles.user_id = auth.uid() OR profiles.id = auth.uid())
        AND profiles.role IN ('admin', 'artist')
        AND profiles.is_active = true
    )
  );

-- Ensure client-side mutations are strictly forbidden
REVOKE INSERT, UPDATE, DELETE ON public.booking_price_adjustments FROM public, anon, authenticated;
GRANT SELECT ON public.booking_price_adjustments TO authenticated, service_role;

-- 2. Hardened RPC with Strict Admin Role Verification
CREATE OR REPLACE FUNCTION public.admin_update_booking_price(
  p_booking_id UUID,
  p_new_price NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid UUID;
  v_caller_role TEXT;
  v_booking RECORD;
  v_estimate_id UUID;
  v_current_price NUMERIC;
  v_paid_total NUMERIC;
  v_adjustment_amount NUMERIC;
  v_adj_id UUID;
BEGIN
  -- 1. Identify Caller strictly from auth.uid()
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Strict Role Verification: Must be Admin or Artist staff
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE (user_id = v_caller_uid OR id = v_caller_uid)
    AND is_active = true
  LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'artist') THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin/Staff privileges required' USING ERRCODE = '42501';
  END IF;

  -- 3. Validate input price > 0
  IF p_new_price IS NULL OR p_new_price <= 0 THEN
    RAISE EXCEPTION 'ราคางานใหม่ต้องมากกว่า 0' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock Booking row FOR UPDATE
  SELECT b.id, b.status, b.estimate_request_id
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  -- 5. Validate Status (Allowed: WAITING_DEPOSIT, CONFIRMED, IN_PROGRESS)
  IF v_booking.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'ไม่สามารถปรับราคางานในสถานะ % ได้', v_booking.status USING ERRCODE = 'P0001';
  END IF;

  -- 6. Lock Estimate Request row FOR UPDATE
  v_estimate_id := v_booking.estimate_request_id;
  IF v_estimate_id IS NULL THEN
    RAISE EXCEPTION 'Booking % has no linked estimate request', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  SELECT quoted_price
  INTO v_current_price
  FROM public.estimate_requests
  WHERE id = v_estimate_id
  FOR UPDATE;

  IF v_current_price IS NULL THEN
    RAISE EXCEPTION 'ยังไม่มีการเสนอราคาเริ่มต้น' USING ERRCODE = 'P0001';
  END IF;

  -- 7. Check if price actually changed
  IF p_new_price = v_current_price THEN
    RAISE EXCEPTION 'ราคางานใหม่ต้องไม่เท่ากับราคาปัจจุบัน' USING ERRCODE = 'P0001';
  END IF;

  -- 8. Calculate paid_total
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_total
  FROM public.booking_payments
  WHERE booking_id = p_booking_id
    AND status = 'RECORDED';

  -- 9. Validate new_price >= paid_total
  IF p_new_price < v_paid_total THEN
    RAISE EXCEPTION 'ราคางานใหม่ต้องไม่น้อยกว่ายอดที่ลูกค้าชำระแล้ว (ชำระแล้ว % บาท)', v_paid_total USING ERRCODE = 'P0001';
  END IF;

  v_adjustment_amount := p_new_price - v_current_price;

  -- 10. Insert Price Adjustment Audit Log
  INSERT INTO public.booking_price_adjustments (
    booking_id,
    estimate_request_id,
    previous_price,
    new_price,
    adjustment_amount,
    note,
    adjusted_by
  ) VALUES (
    p_booking_id,
    v_estimate_id,
    v_current_price,
    p_new_price,
    v_adjustment_amount,
    p_note,
    v_caller_uid
  ) RETURNING id INTO v_adj_id;

  -- 11. Update estimate_requests.quoted_price = p_new_price
  UPDATE public.estimate_requests
  SET
    quoted_price = p_new_price,
    updated_at = pg_catalog.now()
  WHERE id = v_estimate_id;

  -- 12. Return JSONB summary
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'adjustment_id', v_adj_id,
    'previous_price', v_current_price,
    'new_price', p_new_price,
    'adjustment_amount', v_adjustment_amount,
    'paid_total', v_paid_total,
    'remaining_balance', GREATEST(p_new_price - v_paid_total, 0)
  );
END;
$$;

-- Permissions Lockdown
REVOKE ALL ON FUNCTION public.admin_update_booking_price FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_booking_price FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_booking_price TO authenticated, service_role;
