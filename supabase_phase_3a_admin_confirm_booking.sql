-- ============================================================================
-- 157 TATTOO — PHASE 1 MIGRATION
-- ADMIN CONFIRM NORMAL BOOKING REQUEST — CANONICAL RPC & TRIGGER ENHANCEMENT
-- ============================================================================
-- Architecture: Owner-Managed Artists Architecture (No Artist Auth)
-- Model: Direct Admin Confirmation (PENDING -> ACCEPTED -> Booking + Session)
-- Eliminates customer price acceptance requirement.
-- Atomic, All-or-Nothing, GiST double-booking protection preserved.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Enhance Trigger Function: handle_estimate_status_transition
-- ----------------------------------------------------------------------------
-- Allows Admin to transition estimate request directly from PENDING -> ACCEPTED
-- when confirming a booking, while preserving immutable historical safeguards.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_estimate_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
BEGIN
  -- 1. Terminal Record Immutability Check
  IF OLD.status IN ('ACCEPTED', 'REJECTED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Estimate request % is in terminal status % and cannot be modified', OLD.id, OLD.status
      USING ERRCODE = '22023';
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
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);

  -- 6. Validate Allowed Status Transitions & Enforce Actor Rules
  IF NEW.status IS DISTINCT FROM OLD.status THEN

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status = 'QUOTED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can quote estimate requests' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'ACCEPTED' THEN
        -- Direct Admin confirmation (New Business Flow)
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can directly confirm pending booking requests' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can reject pending estimate requests' USING ERRCODE = '42501';
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
        IF NOT (v_is_customer_owner OR v_is_admin) THEN
          RAISE EXCEPTION 'Unauthorized to reject estimate quote' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can expire estimate quotes' USING ERRCODE = '42501';
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

  -- 8. Validate Quote Fields When Status is QUOTED
  IF NEW.status = 'QUOTED' THEN
    IF NEW.quoted_price IS NULL OR NEW.quoted_price < 0 THEN
      RAISE EXCEPTION 'quoted_price >= 0 is required when estimate status is QUOTED' USING ERRCODE = '22023';
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
    NEW.rejected_at := OLD.rejected_at;
  ELSE
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := OLD.rejected_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- ----------------------------------------------------------------------------
-- 2. Create Canonical RPC: admin_confirm_booking_request
-- ----------------------------------------------------------------------------
-- Atomically confirms a PENDING request, creates the booking, and schedules the
-- first session. Fully protected by GiST no_artist_double_booking exclusion constraint.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_confirm_booking_request(
  p_estimate_request_id UUID,
  p_appointment_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_deposit_required NUMERIC DEFAULT 0,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_estimate RECORD;
  v_booking_id UUID;
  v_session_id UUID;
  v_booking_status TEXT;
  v_deposit NUMERIC;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
BEGIN
  -- 1. Authorization: Require Authenticated Admin
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only Admin can confirm booking requests' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Inputs
  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'p_appointment_date is required' USING ERRCODE = '22004';
  END IF;

  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'p_start_time is required' USING ERRCODE = '22004';
  END IF;

  IF p_end_time IS NULL THEN
    RAISE EXCEPTION 'p_end_time is required' USING ERRCODE = '22004';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'end_time must be later than start_time' USING ERRCODE = '22023';
  END IF;

  v_deposit := COALESCE(p_deposit_required, 0);
  IF v_deposit < 0 THEN
    RAISE EXCEPTION 'deposit_required cannot be negative' USING ERRCODE = '22023';
  END IF;

  -- 3. Lock and Verify Target Estimate Request
  SELECT id, customer_user_id, artist_id, status, description
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'Estimate request % not found', p_estimate_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'Estimate request % is in status % (must be PENDING to confirm)', p_estimate_request_id, v_estimate.status
      USING ERRCODE = '22023';
  END IF;

  IF v_estimate.artist_id IS NULL THEN
    RAISE EXCEPTION 'Estimate request % has no assigned artist', p_estimate_request_id USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.artists
    WHERE id = v_estimate.artist_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', v_estimate.artist_id USING ERRCODE = '22023';
  END IF;

  -- 4. Verify Single Booking Per Estimate Rule
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE estimate_request_id = p_estimate_request_id
  ) THEN
    RAISE EXCEPTION 'A booking already exists for estimate request %', p_estimate_request_id USING ERRCODE = '23505';
  END IF;

  -- 5. Calculate Datetime Timestamps in Asia/Bangkok (+07:00) Timezone
  v_start_at := (p_appointment_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_appointment_date::TEXT || ' ' || p_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be greater than start_at' USING ERRCODE = '22023';
  END IF;

  -- 6. Determine Booking Status based on Deposit
  IF v_deposit > 0 THEN
    v_booking_status := 'WAITING_DEPOSIT';
  ELSE
    v_booking_status := 'CONFIRMED';
  END IF;

  -- 7. Update Estimate Request to Internal ACCEPTED Status
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    deposit_required = v_deposit,
    quote_note = p_admin_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  -- 8. Create Canonical Booking Record
  INSERT INTO public.bookings (
    estimate_request_id,
    customer_user_id,
    artist_id,
    requested_date,
    requested_start_time,
    customer_note,
    admin_note,
    status,
    approved_at,
    confirmed_at,
    created_at,
    updated_at
  )
  VALUES (
    v_estimate.id,
    v_estimate.customer_user_id,
    v_estimate.artist_id,
    p_appointment_date,
    p_start_time,
    v_estimate.description,
    p_admin_note,
    v_booking_status,
    pg_catalog.now(),
    CASE WHEN v_booking_status = 'CONFIRMED' THEN pg_catalog.now() ELSE NULL END,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  -- 9. Create Scheduled Booking Session (Subject to GiST no_artist_double_booking constraint)
  INSERT INTO public.booking_sessions (
    booking_id,
    artist_id,
    session_number,
    start_at,
    end_at,
    status,
    note,
    created_at,
    updated_at
  )
  VALUES (
    v_booking_id,
    v_estimate.artist_id,
    1,
    v_start_at,
    v_end_at,
    'SCHEDULED',
    p_admin_note,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_session_id;

  -- 10. Return Structured Success Payload
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_session_id', v_session_id,
    'booking_status', v_booking_status,
    'session_status', 'SCHEDULED',
    'deposit_required', v_deposit,
    'start_at', v_start_at,
    'end_at', v_end_at
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Secure Function Permissions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Notify PostgREST to Reload Schema Cache
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
