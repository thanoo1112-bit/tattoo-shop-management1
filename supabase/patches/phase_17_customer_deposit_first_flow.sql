-- ============================================================================
-- 157 TATTOO — PHASE 17 PATCH: CUSTOMER DEPOSIT-FIRST BOOKING FLOW (REVISED)
-- Features:
-- 1. 1-Hour Deposit Deadline for New Customer Deposit-First Bookings
-- 2. Legacy Booking 24-Hour Safety Compatibility (approved_at discriminator)
-- 3. Strict auth.uid() Security & Active Artist Validation
-- 4. Atomic Booking Confirmation Sync (estimate_requests -> ACCEPTED)
-- ============================================================================

BEGIN;

-- 1. Atomic RPC: public.create_customer_booking_request
CREATE OR REPLACE FUNCTION public.create_customer_booking_request(
  p_artist_id UUID,
  p_placement TEXT DEFAULT NULL,
  p_width_cm NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL,
  p_style TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_preferred_date DATE DEFAULT NULL,
  p_preferred_time TIME DEFAULT NULL,
  p_reference_images TEXT[] DEFAULT '{}',
  p_has_medical_condition BOOLEAN DEFAULT FALSE,
  p_medical_condition_note TEXT DEFAULT NULL,
  p_has_allergy BOOLEAN DEFAULT FALSE,
  p_allergy_note TEXT DEFAULT NULL,
  p_work_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid UUID;
  v_artist RECORD;
  v_estimate_id UUID;
  v_booking_id UUID;
BEGIN
  -- 1. Identify Caller strictly from auth.uid() (NEVER TRUST CLIENT PARAMETER)
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Target Artist Existence & Active Status
  IF p_artist_id IS NULL THEN
    RAISE EXCEPTION 'p_artist_id is required' USING ERRCODE = '22004';
  END IF;

  SELECT id, name, is_active INTO v_artist
  FROM public.artists
  WHERE id = p_artist_id;

  IF v_artist.id IS NULL THEN
    RAISE EXCEPTION 'Artist % not found', p_artist_id USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_artist.is_active, true) = false THEN
    RAISE EXCEPTION 'Artist % is inactive or disabled', p_artist_id USING ERRCODE = 'P0001';
  END IF;

  -- 3. Insert Estimate Request (status = PENDING, deposit_required = 500, quoted_price = NULL)
  INSERT INTO public.estimate_requests (
    customer_user_id,
    artist_id,
    placement,
    width_cm,
    height_cm,
    style,
    description,
    preferred_date,
    preferred_time,
    reference_images,
    has_medical_condition,
    medical_condition_note,
    has_allergy,
    allergy_note,
    request_type,
    work_type,
    quoted_price,
    deposit_required,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_caller_uid,
    p_artist_id,
    COALESCE(trim(p_placement), 'ไม่ระบุ'),
    COALESCE(p_width_cm, 10),
    COALESCE(p_height_cm, 10),
    COALESCE(trim(p_style), 'ตามที่ช่างแนะนำ'),
    COALESCE(p_description, ''),
    p_preferred_date,
    p_preferred_time,
    COALESCE(p_reference_images, '{}'),
    COALESCE(p_has_medical_condition, FALSE),
    trim(p_medical_condition_note),
    COALESCE(p_has_allergy, FALSE),
    trim(p_allergy_note),
    'ESTIMATE',
    p_work_type,
    NULL, -- quoted_price IS NULL (final price determined on tattoo day)
    500.00, -- Fixed 500.00 THB Deposit
    'PENDING', -- PENDING status (preserves customer archive rules)
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_estimate_id;

  -- 4. Create Booking Record atomically (status = WAITING_DEPOSIT, approved_at = NULL)
  INSERT INTO public.bookings (
    estimate_request_id,
    customer_user_id,
    artist_id,
    requested_date,
    requested_start_time,
    customer_note,
    status,
    approved_at, -- NULL (reserved for staff/artist confirmation)
    created_at,
    updated_at
  )
  VALUES (
    v_estimate_id,
    v_caller_uid,
    p_artist_id,
    p_preferred_date,
    p_preferred_time,
    p_description,
    'WAITING_DEPOSIT',
    NULL, -- approved_at IS NULL
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', v_estimate_id,
    'booking_id', v_booking_id,
    'status', 'WAITING_DEPOSIT',
    'deposit_required', 500.00
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_customer_booking_request(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, DATE, TIME, TEXT[], BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_booking_request(UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, DATE, TIME, TEXT[], BOOLEAN, TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;


-- 2. Update submit_booking_payment_slip with 1-Hour New Flow Deadline & 24-Hour Legacy Discriminator
CREATE OR REPLACE FUNCTION public.submit_booking_payment_slip(
  p_booking_id UUID,
  p_claimed_amount NUMERIC,
  p_slip_path TEXT,
  p_reference_no TEXT DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid UUID;
  v_booking RECORD;
  v_submission_id UUID;
  v_expected_path_prefix TEXT;
  v_deadline TIMESTAMPTZ;
BEGIN
  -- 1. Identify Caller strictly from auth.uid()
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate claimed_amount
  IF p_claimed_amount IS NULL OR p_claimed_amount <= 0 THEN
    RAISE EXCEPTION 'claimed_amount must be greater than 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate slip_path
  IF p_slip_path IS NULL OR trim(p_slip_path) = '' THEN
    RAISE EXCEPTION 'slip_path is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Validate Booking Ownership & Status
  SELECT id, customer_user_id, status, approved_at, created_at
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.customer_user_id != v_caller_uid THEN
    RAISE EXCEPTION 'Access denied: You do not own booking %', p_booking_id
      USING ERRCODE = '42501';
  END IF;

  IF v_booking.status != 'WAITING_DEPOSIT' THEN
    RAISE EXCEPTION 'Cannot submit payment slip for booking % in % status; booking must be in WAITING_DEPOSIT status',
      p_booking_id, v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 4b. Validate Deposit Deadline
  -- Legacy Booking (approved_at IS NOT NULL): 24 hours from approved_at
  -- New Flow Booking (approved_at IS NULL): 1 hour from created_at
  IF v_booking.approved_at IS NOT NULL THEN
    v_deadline := v_booking.approved_at + INTERVAL '24 hours';
  ELSE
    v_deadline := v_booking.created_at + INTERVAL '1 hour';
  END IF;

  IF pg_catalog.now() >= v_deadline THEN
    RAISE EXCEPTION 'DEPOSIT_DEADLINE_EXPIRED: หมดเวลาชำระเงินมัดจำแล้ว (เกินกำหนดเวลา)'
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Validate slip_path pattern: must start with {auth.uid()}/{booking_id}/
  v_expected_path_prefix := v_caller_uid::text || '/' || p_booking_id::text || '/';
  IF NOT (p_slip_path LIKE (v_expected_path_prefix || '%')) THEN
    RAISE EXCEPTION 'Invalid slip_path: Path must start with %', v_expected_path_prefix
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Check if an active PENDING submission already exists
  IF EXISTS (
    SELECT 1 FROM public.booking_payment_submissions
    WHERE booking_id = p_booking_id
      AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'An active payment submission is already pending review for this booking'
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Insert submission
  INSERT INTO public.booking_payment_submissions (
    booking_id,
    customer_user_id,
    claimed_amount,
    slip_path,
    reference_no,
    customer_note,
    status
  )
  VALUES (
    p_booking_id,
    v_caller_uid,
    p_claimed_amount,
    p_slip_path,
    p_reference_no,
    p_customer_note,
    'PENDING'
  )
  RETURNING id INTO v_submission_id;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'status', 'PENDING'
  );
END;
$$;


-- 3. Update auto_reject_expired_deposit_bookings with 1-Hour New Flow Deadline & 24-Hour Legacy Discriminator
CREATE OR REPLACE FUNCTION public.auto_reject_expired_deposit_bookings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
  v_current_status TEXT;
  v_has_timely_submission BOOLEAN;
BEGIN
  FOR v_rec IN
    SELECT 
      b.id, 
      b.estimate_request_id, 
      b.approved_at,
      b.created_at,
      CASE 
        WHEN b.approved_at IS NOT NULL THEN b.approved_at + INTERVAL '24 hours'
        ELSE b.created_at + INTERVAL '1 hour'
      END AS deadline
    FROM public.bookings b
    WHERE b.status = 'WAITING_DEPOSIT'
      AND pg_catalog.now() >= (
        CASE 
          WHEN b.approved_at IS NOT NULL THEN b.approved_at + INTERVAL '24 hours'
          ELSE b.created_at + INTERVAL '1 hour'
        END
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.booking_payment_submissions s
        WHERE s.booking_id = b.id
          AND s.status IN ('PENDING', 'APPROVED')
          AND COALESCE(s.submitted_at, s.created_at) < (
            CASE 
              WHEN b.approved_at IS NOT NULL THEN b.approved_at + INTERVAL '24 hours'
              ELSE b.created_at + INTERVAL '1 hour'
            END
          )
      )
    FOR UPDATE OF b
  LOOP
    SELECT status INTO v_current_status
    FROM public.bookings
    WHERE id = v_rec.id;

    SELECT EXISTS (
      SELECT 1 FROM public.booking_payment_submissions s
      WHERE s.booking_id = v_rec.id
        AND s.status IN ('PENDING', 'APPROVED')
        AND COALESCE(s.submitted_at, s.created_at) < v_rec.deadline
    ) INTO v_has_timely_submission;

    IF v_current_status != 'WAITING_DEPOSIT' OR v_has_timely_submission THEN
      CONTINUE;
    END IF;

    -- 1. Update Booking status to REJECTED
    UPDATE public.bookings
    SET
      status = 'REJECTED',
      rejected_at = pg_catalog.now(),
      admin_note = CASE 
        WHEN v_rec.approved_at IS NOT NULL THEN 'ไม่ได้ชำระมัดจำภายในเวลาที่กำหนด (24 ชั่วโมง)'
        ELSE 'ไม่ได้ชำระมัดจำภายในเวลาที่กำหนด (1 ชั่วโมง)'
      END,
      updated_at = pg_catalog.now()
    WHERE id = v_rec.id;

    -- 2. Update linked Estimate Request to REJECTED
    IF v_rec.estimate_request_id IS NOT NULL THEN
      UPDATE public.estimate_requests
      SET
        status = 'REJECTED',
        quote_note = CASE 
          WHEN v_rec.approved_at IS NOT NULL THEN 'คำขอถูกยกเลิกเนื่องจากไม่ได้ชำระมัดจำภายใน 24 ชั่วโมง'
          ELSE 'คำขอถูกยกเลิกเนื่องจากไม่ได้ชำระมัดจำภายใน 1 ชั่วโมง'
        END,
        updated_at = pg_catalog.now()
      WHERE id = v_rec.estimate_request_id;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'auto_rejected_count', v_count
  );
END;
$$;


-- 4. Update admin_approve_payment_submission to Sync approved_at & linked estimate ACCEPTED
CREATE OR REPLACE FUNCTION public.admin_approve_payment_submission(
  p_submission_id UUID,
  p_verified_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'BANK_TRANSFER',
  p_reference_no TEXT DEFAULT NULL,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_uid UUID;
  v_submission RECORD;
  v_booking RECORD;
  v_payment_id UUID;
BEGIN
  -- 1. Verify Admin Authority
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only active Admin can approve payment submissions'
      USING ERRCODE = '42501';
  END IF;

  v_admin_uid := auth.uid();

  -- 2. Validate verified_amount
  IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'verified_amount must be greater than 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate payment_method enum
  IF p_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'QR', 'OTHER') THEN
    RAISE EXCEPTION 'Invalid payment_method: %. Allowed values: CASH, BANK_TRANSFER, QR, OTHER', p_payment_method
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock and Fetch Submission FOR UPDATE
  SELECT id, booking_id, customer_user_id, claimed_amount, status, reference_no
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'Payment submission % not found', p_submission_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'Payment submission % is not PENDING (current status: %)', p_submission_id, v_submission.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Lock and Fetch Associated Booking FOR UPDATE
  SELECT id, status, estimate_request_id INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Associated booking % not found', v_submission.booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Safety Check: Deposit submissions may ONLY be approved when booking is actively WAITING_DEPOSIT
  IF v_booking.status != 'WAITING_DEPOSIT' THEN
    RAISE EXCEPTION 'Cannot approve deposit payment submission for booking % in % status; booking must be in WAITING_DEPOSIT status',
      v_booking.id, v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Insert official booking payment record (Triggers handle_booking_payments_before_insert & reconcile -> transitions booking status to CONFIRMED)
  INSERT INTO public.booking_payments (
    booking_id,
    payment_type,
    amount,
    payment_method,
    reference_no,
    note,
    status,
    paid_at,
    created_at,
    updated_at
  )
  VALUES (
    v_submission.booking_id,
    'DEPOSIT',
    p_verified_amount,
    p_payment_method,
    COALESCE(trim(p_reference_no), v_submission.reference_no),
    p_admin_note,
    'RECORDED',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_payment_id;

  -- 7. Ensure approved_at is set on Booking upon slip approval
  UPDATE public.bookings
  SET 
    approved_at = COALESCE(approved_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE id = v_submission.booking_id;

  -- 8. Synchronize linked Estimate Request status to ACCEPTED (so it no longer shows as PENDING in Admin Request Center)
  IF v_booking.estimate_request_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET 
      status = 'ACCEPTED',
      updated_at = pg_catalog.now()
    WHERE id = v_booking.estimate_request_id
      AND status = 'PENDING';
  END IF;

  -- 9. Transition submission to APPROVED
  UPDATE public.booking_payment_submissions
  SET
    status = 'APPROVED',
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_admin_uid,
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'payment_id', v_payment_id,
    'booking_id', v_submission.booking_id,
    'verified_amount', p_verified_amount,
    'status', 'APPROVED'
  );
END;
$$;

-- 5. Patch handle_estimate_status_transition to support flexible price requests (quoted_price IS NULL when ACCEPTED)
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
BEGIN
  IF OLD.status IN ('EXPIRED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Estimate request % is in terminal status %', OLD.id, OLD.status USING ERRCODE = '22023';
  END IF;

  v_is_admin := private.is_admin();
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);
  v_is_assigned_artist := (
    auth.uid() IS NOT NULL AND OLD.artist_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.artists WHERE artists.id = OLD.artist_id AND artists.user_id = auth.uid()
    )
  );

  IF NEW.status IS DISTINCT FROM OLD.status THEN
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
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status USING ERRCODE = '22023';
      END IF;

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

  IF NEW.artist_id IS NOT NULL AND (OLD.artist_id IS DISTINCT FROM NEW.artist_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.artists WHERE artists.id = NEW.artist_id AND artists.is_active = true
    ) THEN
      RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', NEW.artist_id USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Validate Quote Fields (Supports flexible price requests where quoted_price IS NULL)
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
  END IF;

  RETURN NEW;
END;
$$;


-- 6. RPC: public.artist_approve_payment_submission (Artist approval for assigned bookings with Cross-Artist security)
CREATE OR REPLACE FUNCTION public.artist_approve_payment_submission(
  p_submission_id UUID,
  p_verified_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'BANK_TRANSFER',
  p_reference_no TEXT DEFAULT NULL,
  p_artist_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid UUID;
  v_submission RECORD;
  v_booking RECORD;
  v_artist RECORD;
  v_payment_id UUID;
BEGIN
  -- 1. Identify Caller
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify Artist Identity or Admin Authority
  IF private.is_admin() THEN
    NULL; -- Admin allowed
  ELSE
    SELECT id, is_active INTO v_artist
    FROM public.artists
    WHERE user_id = v_caller_uid;

    IF v_artist.id IS NULL OR COALESCE(v_artist.is_active, true) = false THEN
      RAISE EXCEPTION 'Access denied: Only active Artist or Admin can approve payment submissions'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 3. Validate verified_amount
  IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'verified_amount must be greater than 0' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock and Fetch Submission FOR UPDATE
  SELECT id, booking_id, customer_user_id, claimed_amount, status, reference_no
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'Payment submission % not found', p_submission_id USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'Payment submission % is not PENDING (current status: %)', p_submission_id, v_submission.status USING ERRCODE = 'P0001';
  END IF;

  -- 5. Lock and Fetch Associated Booking FOR UPDATE
  SELECT id, status, artist_id, estimate_request_id INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Associated booking % not found', v_submission.booking_id USING ERRCODE = 'P0001';
  END IF;

  -- 6. STRICT CROSS-ARTIST SECURITY CHECK:
  -- Artist can ONLY approve payment submissions for bookings assigned to them!
  IF NOT private.is_admin() THEN
    IF v_booking.artist_id IS NULL OR v_booking.artist_id != v_artist.id THEN
      RAISE EXCEPTION 'CROSS_ARTIST_DENIED: Access denied: You are not the assigned artist for booking %', v_booking.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 7. Safety Check: Deposit submissions may ONLY be approved when booking is actively WAITING_DEPOSIT
  IF v_booking.status != 'WAITING_DEPOSIT' THEN
    RAISE EXCEPTION 'Cannot approve deposit payment submission for booking % in % status; booking must be in WAITING_DEPOSIT status',
      v_booking.id, v_booking.status USING ERRCODE = 'P0001';
  END IF;

  -- 8. Insert official booking payment record (Triggers handle_booking_payments_before_insert & reconcile -> transitions booking status to CONFIRMED)
  INSERT INTO public.booking_payments (
    booking_id,
    payment_type,
    amount,
    payment_method,
    reference_no,
    note,
    status,
    paid_at,
    created_at,
    updated_at
  )
  VALUES (
    v_submission.booking_id,
    'DEPOSIT',
    p_verified_amount,
    p_payment_method,
    COALESCE(trim(p_reference_no), v_submission.reference_no),
    p_artist_note,
    'RECORDED',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_payment_id;

  -- 9. Ensure approved_at is set on Booking upon slip approval
  UPDATE public.bookings
  SET 
    approved_at = COALESCE(approved_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE id = v_submission.booking_id;

  -- 10. Synchronize linked Estimate Request status to ACCEPTED
  IF v_booking.estimate_request_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET 
      status = 'ACCEPTED',
      updated_at = pg_catalog.now()
    WHERE id = v_booking.estimate_request_id
      AND status = 'PENDING';
  END IF;

  -- 11. Transition submission to APPROVED
  UPDATE public.booking_payment_submissions
  SET
    status = 'APPROVED',
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_caller_uid,
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'payment_id', v_payment_id,
    'booking_id', v_submission.booking_id,
    'verified_amount', p_verified_amount,
    'status', 'APPROVED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.artist_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- 7. Patch handle_booking_status_transition to allow WAITING_DEPOSIT -> REJECTED transition (for deposit deadline expiry)
CREATE OR REPLACE FUNCTION public.handle_booking_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
BEGIN
  IF OLD.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Booking % is in terminal status % and cannot be modified', OLD.id, OLD.status USING ERRCODE = 'P0001';
  END IF;

  IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
    RAISE EXCEPTION 'customer_user_id cannot be changed' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.estimate_request_id IS DISTINCT FROM OLD.estimate_request_id THEN
    RAISE EXCEPTION 'estimate_request_id cannot be changed' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be changed' USING ERRCODE = 'P0001';
  END IF;

  v_is_admin := private.is_admin();
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT COALESCE(e.deposit_required, 0.00) INTO v_deposit_required
    FROM public.estimate_requests e WHERE e.id = OLD.estimate_request_id;

    SELECT COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) INTO v_paid_total
    FROM public.booking_payments bp WHERE bp.booking_id = OLD.id;

    IF OLD.status = 'PENDING' THEN
      IF NEW.status IN ('APPROVED', 'WAITING_DEPOSIT') THEN
        IF NOT v_is_admin THEN RAISE EXCEPTION 'Only Admin can approve booking requests' USING ERRCODE = 'P0001'; END IF;
        NEW.approved_at := COALESCE(NEW.approved_at, pg_catalog.now());
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          NEW.status := 'WAITING_DEPOSIT';
          NEW.confirmed_at := NULL;
        ELSE
          NEW.status := 'CONFIRMED';
          NEW.confirmed_at := pg_catalog.now();
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT v_is_admin THEN RAISE EXCEPTION 'Only Admin can reject booking requests' USING ERRCODE = 'P0001'; END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin) THEN RAISE EXCEPTION 'Unauthorized to cancel booking request' USING ERRCODE = 'P0001'; END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status USING ERRCODE = 'P0001';
      END IF;

    ELSIF OLD.status = 'APPROVED' THEN
      IF NEW.status = 'WAITING_DEPOSIT' THEN
        NEW.confirmed_at := NULL;
      ELSIF NEW.status = 'CONFIRMED' THEN
        NEW.confirmed_at := pg_catalog.now();
      ELSIF NEW.status = 'CANCELLED' THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from APPROVED to %', NEW.status USING ERRCODE = 'P0001';
      END IF;

    ELSIF OLD.status = 'WAITING_DEPOSIT' THEN
      IF NEW.status = 'CONFIRMED' THEN
        NEW.confirmed_at := pg_catalog.now();
      ELSIF NEW.status = 'REJECTED' THEN
        NEW.rejected_at := COALESCE(NEW.rejected_at, pg_catalog.now());
      ELSIF NEW.status = 'CANCELLED' THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from WAITING_DEPOSIT to %', NEW.status USING ERRCODE = 'P0001';
      END IF;

    ELSIF OLD.status = 'CONFIRMED' THEN
      IF NEW.status = 'WAITING_DEPOSIT' THEN
        NEW.confirmed_at := NULL;
      ELSIF NEW.status = 'IN_PROGRESS' THEN
        NULL;
      ELSIF NEW.status = 'CANCELLED' THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from CONFIRMED to %', NEW.status USING ERRCODE = 'P0001';
      END IF;

    ELSIF OLD.status = 'IN_PROGRESS' THEN
      IF NEW.status = 'COMPLETED' THEN
        NULL;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from IN_PROGRESS to %', NEW.status USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  IF OLD.status = 'PENDING' AND NEW.status = 'APPROVED' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, pg_catalog.now());
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
    NEW.rejected_at := COALESCE(NEW.rejected_at, pg_catalog.now());
  ELSIF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, pg_catalog.now());
  ELSIF NEW.status = 'CONFIRMED' AND OLD.status != 'CONFIRMED' THEN
    NEW.confirmed_at := pg_catalog.now();
  ELSIF NEW.status = 'IN_PROGRESS' AND OLD.status != 'IN_PROGRESS' THEN
    NEW.started_at := COALESCE(NEW.started_at, pg_catalog.now());
  ELSIF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    NEW.completed_at := COALESCE(NEW.completed_at, pg_catalog.now());
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';


