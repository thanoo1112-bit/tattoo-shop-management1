-- ============================================================================
-- 157 TATTOO — FULL ARTIST OWN-WORK MANAGEMENT SQL MIGRATION
-- Security Model: Strict server-side verification using private.get_artist_id()
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. RPC: artist_confirm_booking_request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_confirm_booking_request(
  p_estimate_request_id UUID,
  p_appointment_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_quoted_price NUMERIC DEFAULT NULL,
  p_deposit_required NUMERIC DEFAULT 0,
  p_artist_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_estimate RECORD;
  v_booking_id UUID;
  v_session_id UUID;
  v_booking_status TEXT;
  v_quoted NUMERIC;
  v_deposit NUMERIC;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
BEGIN
  -- 1. Authorization: Require Authenticated Active Artist
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can confirm booking requests' USING ERRCODE = '42501';
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

  -- 3. Lock and Verify Target Estimate Request & Ownership
  SELECT id, customer_user_id, artist_id, status, description, quoted_price
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'Estimate request % not found', p_estimate_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_estimate.artist_id IS NULL OR v_estimate.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only confirm requests assigned to you' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'Estimate request % is in status % (must be PENDING to confirm)', p_estimate_request_id, v_estimate.status
      USING ERRCODE = '22023';
  END IF;

  -- 4. Validate Price & Deposit
  v_quoted := COALESCE(p_quoted_price, v_estimate.quoted_price, 0);
  IF v_quoted < 0 THEN
    RAISE EXCEPTION 'quoted_price cannot be negative' USING ERRCODE = '22023';
  END IF;

  v_deposit := COALESCE(p_deposit_required, 0);
  IF v_deposit < 0 THEN
    RAISE EXCEPTION 'deposit_required cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_deposit > v_quoted THEN
    RAISE EXCEPTION 'deposit_required cannot exceed quoted_price' USING ERRCODE = '22023';
  END IF;

  -- 5. Verify Single Booking Per Estimate Rule
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE estimate_request_id = p_estimate_request_id
  ) THEN
    RAISE EXCEPTION 'A booking already exists for estimate request %', p_estimate_request_id USING ERRCODE = '23505';
  END IF;

  -- 6. Calculate Datetime Timestamps (+07:00)
  v_start_at := (p_appointment_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_appointment_date::TEXT || ' ' || p_end_time::TEXT || '+07')::TIMESTAMPTZ;

  IF v_end_at <= v_start_at THEN
    RAISE EXCEPTION 'Calculated end_at must be greater than start_at' USING ERRCODE = '22023';
  END IF;

  -- 7. Determine Booking Status based on Deposit
  IF v_deposit > 0 THEN
    v_booking_status := 'WAITING_DEPOSIT';
  ELSE
    v_booking_status := 'CONFIRMED';
  END IF;

  -- 8. Update Estimate Request to ACCEPTED
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    quoted_price = v_quoted,
    deposit_required = v_deposit,
    quote_note = p_artist_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  -- 9. Create Booking Record
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
    v_artist_id,
    p_appointment_date,
    p_start_time,
    v_estimate.description,
    p_artist_note,
    v_booking_status,
    pg_catalog.now(),
    CASE WHEN v_booking_status = 'CONFIRMED' THEN pg_catalog.now() ELSE NULL END,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  -- 10. Create Scheduled Session #1 (Subject to GiST no_artist_double_booking constraint)
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
    v_artist_id,
    1,
    v_start_at,
    v_end_at,
    'SCHEDULED',
    p_artist_note,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_session_id', v_session_id,
    'booking_status', v_booking_status
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. RPC: artist_reject_booking_request
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_reject_booking_request(
  p_estimate_request_id UUID,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_estimate RECORD;
BEGIN
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can reject booking requests' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'p_estimate_request_id is required' USING ERRCODE = '22004';
  END IF;

  SELECT id, artist_id, status
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'Estimate request % not found', p_estimate_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_estimate.artist_id IS NULL OR v_estimate.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only reject requests assigned to you' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'Estimate request % is in status % (must be PENDING to reject)', p_estimate_request_id, v_estimate.status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.estimate_requests
  SET
    status = 'REJECTED',
    quote_note = p_rejection_reason,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'status', 'REJECTED'
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. RPC: artist_reschedule_booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_reschedule_booking(
  p_booking_id UUID,
  p_session_id UUID DEFAULT NULL,
  p_new_date DATE DEFAULT NULL,
  p_new_start_time TIME DEFAULT NULL,
  p_new_end_time TIME DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_booking RECORD;
  v_session RECORD;
  v_target_session_id UUID;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
BEGIN
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can reschedule bookings' USING ERRCODE = '42501';
  END IF;

  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'p_booking_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_new_date IS NULL OR p_new_start_time IS NULL OR p_new_end_time IS NULL THEN
    RAISE EXCEPTION 'p_new_date, p_new_start_time, and p_new_end_time are required' USING ERRCODE = '22004';
  END IF;

  IF p_new_end_time <= p_new_start_time THEN
    RAISE EXCEPTION 'p_new_end_time must be later than p_new_start_time' USING ERRCODE = '22023';
  END IF;

  -- Lock target Booking FOR UPDATE
  SELECT id, artist_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only reschedule bookings assigned to you' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('CANCELLED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Cannot reschedule booking % in % status', p_booking_id, v_booking.status USING ERRCODE = '22023';
  END IF;

  -- Determine target session
  IF p_session_id IS NOT NULL THEN
    v_target_session_id := p_session_id;
  ELSE
    SELECT id INTO v_target_session_id
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
      AND status = 'SCHEDULED'
    ORDER BY session_number ASC, start_at ASC
    LIMIT 1;
  END IF;

  IF v_target_session_id IS NULL THEN
    RAISE EXCEPTION 'No SCHEDULED session found for booking %', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  -- Lock session FOR UPDATE
  SELECT id, booking_id, artist_id, session_number, status
  INTO v_session
  FROM public.booking_sessions
  WHERE id = v_target_session_id
  FOR UPDATE;

  IF v_session.id IS NULL OR v_session.booking_id != p_booking_id THEN
    RAISE EXCEPTION 'Session % does not belong to booking %', v_target_session_id, p_booking_id USING ERRCODE = '22023';
  END IF;

  IF v_session.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: Session belongs to another artist' USING ERRCODE = '42501';
  END IF;

  IF v_session.status != 'SCHEDULED' THEN
    RAISE EXCEPTION 'Session % is in status % (must be SCHEDULED to reschedule)', v_target_session_id, v_session.status
      USING ERRCODE = '22023';
  END IF;

  v_start_at := (p_new_date::TEXT || ' ' || p_new_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_new_date::TEXT || ' ' || p_new_end_time::TEXT || '+07')::TIMESTAMPTZ;

  -- Update session (Subject to GiST no_artist_double_booking constraint)
  UPDATE public.booking_sessions
  SET
    start_at = v_start_at,
    end_at = v_end_at,
    note = COALESCE(p_note, note),
    updated_at = pg_catalog.now()
  WHERE id = v_session.id;

  -- If session #1, update booking requested_date and requested_start_time
  IF v_session.session_number = 1 THEN
    UPDATE public.bookings
    SET
      requested_date = p_new_date,
      requested_start_time = p_new_start_time,
      updated_at = pg_catalog.now()
    WHERE id = p_booking_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'session_id', v_session.id,
    'new_date', p_new_date,
    'new_start_time', p_new_start_time,
    'new_end_time', p_new_end_time
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. RPC: artist_cancel_booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_cancel_booking(
  p_booking_id UUID,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_booking RECORD;
BEGIN
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can cancel bookings' USING ERRCODE = '42501';
  END IF;

  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'p_booking_id is required' USING ERRCODE = '22004';
  END IF;

  SELECT id, artist_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only cancel bookings assigned to you' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('CANCELLED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Booking % is already in % status', p_booking_id, v_booking.status USING ERRCODE = '22023';
  END IF;

  -- Update Booking status to CANCELLED
  UPDATE public.bookings
  SET
    status = 'CANCELLED',
    admin_note = COALESCE(p_cancellation_reason, admin_note),
    updated_at = pg_catalog.now()
  WHERE id = p_booking_id;

  -- Cancel all SCHEDULED sessions for this booking
  UPDATE public.booking_sessions
  SET
    status = 'CANCELLED',
    note = COALESCE(p_cancellation_reason, note),
    updated_at = pg_catalog.now()
  WHERE booking_id = p_booking_id
    AND status = 'SCHEDULED';

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'CANCELLED'
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 5. RPC: artist_add_session
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_add_session(
  p_booking_id UUID,
  p_appointment_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_booking RECORD;
  v_next_session_number INT;
  v_start_at TIMESTAMPTZ;
  v_end_at TIMESTAMPTZ;
  v_session_id UUID;
BEGIN
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can add sessions' USING ERRCODE = '42501';
  END IF;

  IF p_booking_id IS NULL OR p_appointment_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'p_booking_id, p_appointment_date, p_start_time, and p_end_time are required' USING ERRCODE = '22004';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'p_end_time must be later than p_start_time' USING ERRCODE = '22023';
  END IF;

  SELECT id, artist_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only add sessions to bookings assigned to you' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('CANCELLED', 'COMPLETED') THEN
    RAISE EXCEPTION 'Cannot add session to booking % in % status', p_booking_id, v_booking.status USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(session_number), 0) + 1 INTO v_next_session_number
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  v_start_at := (p_appointment_date::TEXT || ' ' || p_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_end_at := (p_appointment_date::TEXT || ' ' || p_end_time::TEXT || '+07')::TIMESTAMPTZ;

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
    p_booking_id,
    v_artist_id,
    v_next_session_number,
    v_start_at,
    v_end_at,
    'SCHEDULED',
    p_note,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_session_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'session_id', v_session_id,
    'session_number', v_next_session_number
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 6. RPC: artist_approve_payment_submission
-- ----------------------------------------------------------------------------
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
  v_artist_id UUID;
  v_artist_uid UUID;
  v_submission RECORD;
  v_booking RECORD;
  v_payment_id UUID;
BEGIN
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can approve payment submissions' USING ERRCODE = '42501';
  END IF;

  v_artist_uid := auth.uid();

  IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'verified_amount must be greater than 0' USING ERRCODE = 'P0001';
  END IF;

  IF p_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'QR', 'OTHER') THEN
    RAISE EXCEPTION 'Invalid payment_method: %. Allowed: CASH, BANK_TRANSFER, QR, OTHER', p_payment_method USING ERRCODE = 'P0001';
  END IF;

  SELECT id, booking_id, customer_user_id, claimed_amount, status, reference_no
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'Payment submission % not found', p_submission_id USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'Payment submission % is not PENDING (status: %)', p_submission_id, v_submission.status USING ERRCODE = 'P0001';
  END IF;

  SELECT id, artist_id, status INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Associated booking % not found', v_submission.booking_id USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: Payment submission belongs to another artist' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status != 'WAITING_DEPOSIT' THEN
    RAISE EXCEPTION 'Cannot approve deposit payment submission for booking % in % status; booking must be in WAITING_DEPOSIT status',
      v_booking.id, v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

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

  UPDATE public.booking_payment_submissions
  SET
    status = 'APPROVED',
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_artist_uid,
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


-- ----------------------------------------------------------------------------
-- 7. RPC: artist_reject_payment_submission
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_reject_payment_submission(
  p_submission_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_artist_uid UUID;
  v_submission RECORD;
  v_booking RECORD;
BEGIN
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can reject payment submissions' USING ERRCODE = '42501';
  END IF;

  v_artist_uid := auth.uid();

  IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'p_rejection_reason is required' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, booking_id, status
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'Payment submission % not found', p_submission_id USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'Payment submission % is not PENDING (status: %)', p_submission_id, v_submission.status USING ERRCODE = 'P0001';
  END IF;

  SELECT id, artist_id INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.artist_id != v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: Payment submission belongs to another artist' USING ERRCODE = '42501';
  END IF;

  UPDATE public.booking_payment_submissions
  SET
    status = 'REJECTED',
    rejection_reason = trim(p_rejection_reason),
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_artist_uid,
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'status', 'REJECTED'
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 8. REVOKE PUBLIC EXECUTION & GRANT TO AUTHENTICATED
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.artist_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_confirm_booking_request(UUID, DATE, TIME, TIME, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.artist_reject_booking_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_reject_booking_request(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.artist_reschedule_booking(UUID, UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_reschedule_booking(UUID, UUID, DATE, TIME, TIME, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.artist_cancel_booking(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_cancel_booking(UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.artist_add_session(UUID, DATE, TIME, TIME, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_add_session(UUID, DATE, TIME, TIME, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.artist_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.artist_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 8.5 UPDATE TRIGGER: handle_estimate_status_transition (Allow Assigned Artist)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_estimate_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_assigned_artist BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_current_artist_id UUID;
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
          RAISE EXCEPTION 'Only Admin or assigned Artist can expire estimate quotes' USING ERRCODE = '42501';
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
  END IF;

  -- 10. Automatically set updated_at
  NEW.updated_at := pg_catalog.now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';



-- ----------------------------------------------------------------------------
-- 8.6 UPDATE TRIGGER: handle_booking_status_transition (Allow Assigned Artist)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_assigned_artist BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_current_artist_id UUID;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
BEGIN
  -- 1. Terminal Record Immutability Check
  IF OLD.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Booking % is in terminal status % and cannot be modified', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Customer Ownership & Estimate Immutability Check
  IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
    RAISE EXCEPTION 'customer_user_id cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.estimate_request_id IS DISTINCT FROM OLD.estimate_request_id THEN
    RAISE EXCEPTION 'estimate_request_id cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Identify Actor
  v_is_admin := private.is_admin();
  v_current_artist_id := private.get_artist_id();
  v_is_assigned_artist := (v_current_artist_id IS NOT NULL AND OLD.artist_id IS NOT NULL AND OLD.artist_id = v_current_artist_id);
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);

  -- 4. Validate Allowed Status Transitions & Enforce Actor Rules
  IF NEW.status IS DISTINCT FROM OLD.status THEN

    SELECT COALESCE(e.deposit_required, 0.00) INTO v_deposit_required
    FROM public.estimate_requests e
    WHERE e.id = OLD.estimate_request_id;

    SELECT COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) INTO v_paid_total
    FROM public.booking_payments bp
    WHERE bp.booking_id = OLD.id;

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status IN ('APPROVED', 'WAITING_DEPOSIT') THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can approve booking requests'
            USING ERRCODE = 'P0001';
        END IF;

        IF NEW.artist_id IS NULL THEN
          RAISE EXCEPTION 'artist_id must be assigned before approving a booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.artists WHERE artists.id = NEW.artist_id AND artists.is_active = true
        ) THEN
          RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', NEW.artist_id
            USING ERRCODE = 'P0001';
        END IF;

        NEW.approved_at := COALESCE(NEW.approved_at, pg_catalog.now());

        -- Deposit Auto-Reconciliation upon Approval
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          NEW.status := 'WAITING_DEPOSIT';
          NEW.confirmed_at := NULL;
        ELSE
          NEW.status := 'CONFIRMED';
          NEW.confirmed_at := pg_catalog.now();
        END IF;

      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can reject booking requests'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Unauthorized to cancel booking request'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- APPROVED transitions
    ELSIF OLD.status = 'APPROVED' THEN
      IF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can update booking status'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := NULL;
      ELSIF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := pg_catalog.now();
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can cancel approved booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from APPROVED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- WAITING_DEPOSIT transitions
    ELSIF OLD.status = 'WAITING_DEPOSIT' THEN
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit of % has not been received (current paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := pg_catalog.now();
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can cancel booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from WAITING_DEPOSIT to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- CONFIRMED transitions
    ELSIF OLD.status = 'CONFIRMED' THEN
      IF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can revert booking status'
            USING ERRCODE = 'P0001';
        END IF;

        IF v_deposit_required <= 0 THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: booking has no deposit requirement', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        IF v_paid_total >= v_deposit_required THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: deposit requirement of % is fully satisfied (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
          SELECT 1 FROM public.booking_sessions
          WHERE booking_sessions.booking_id = OLD.id
            AND booking_sessions.status IN ('IN_PROGRESS', 'COMPLETED')
        ) THEN
          RAISE EXCEPTION 'Cannot revert booking % to WAITING_DEPOSIT: tattoo sessions have already started or completed', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        NEW.confirmed_at := NULL;

      ELSIF NEW.status = 'IN_PROGRESS' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can start booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can cancel confirmed booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from CONFIRMED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- IN_PROGRESS transitions
    ELSIF OLD.status = 'IN_PROGRESS' THEN
      IF NEW.status = 'COMPLETED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can complete booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from IN_PROGRESS to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    END IF;

  END IF;

  -- 5. Artist Reassignment Protection (Cannot break completed sessions)
  IF NEW.artist_id IS DISTINCT FROM OLD.artist_id AND OLD.artist_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.booking_sessions
      WHERE booking_sessions.booking_id = OLD.id AND booking_sessions.status = 'COMPLETED'
    ) THEN
      RAISE EXCEPTION 'Cannot reassign artist for booking % with completed historical sessions', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 6. Database Authority Over System Status Timestamps
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';


-- -----------------------------------------------------------------------------
-- 8.7 UPDATE RPC: artist_start_session (Sync parent booking to IN_PROGRESS)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_start_session(
  p_session_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_booking_id UUID;
  v_booking RECORD;
  v_session RECORD;
BEGIN
  -- 1. Identify Authenticated Active Artist
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can perform this operation'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Parent-First Lock Sequence: Peek session's parent booking_id
  SELECT booking_id INTO v_booking_id
  FROM public.booking_sessions
  WHERE id = p_session_id;

  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'Session % not found', p_session_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Lock Parent Booking FOR UPDATE
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = v_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Parent booking % not found', v_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock Target Session FOR UPDATE
  SELECT * INTO v_session
  FROM public.booking_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  -- 5. Validate Ownership
  IF v_session.artist_id IS DISTINCT FROM v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the assigned artist for this session'
      USING ERRCODE = '42501';
  END IF;

  IF v_booking.artist_id IS DISTINCT FROM v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the assigned artist for parent booking'
      USING ERRCODE = '42501';
  END IF;

  -- 6. Idempotency Guard
  IF v_session.status = 'IN_PROGRESS' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'already_in_progress', true,
      'session_id', p_session_id,
      'booking_id', v_booking.id,
      'status', 'IN_PROGRESS'
    );
  END IF;

  -- 7. State Eligibility Guards
  IF v_session.status != 'SCHEDULED' THEN
    RAISE EXCEPTION 'Cannot start session in % status; session must be SCHEDULED', v_session.status
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Cannot start session: parent booking status is % (must be CONFIRMED or IN_PROGRESS)', v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 8. Multi-Session Sequencing Guard
  IF EXISTS (
    SELECT 1 FROM public.booking_sessions
    WHERE booking_id = v_booking.id
      AND id != p_session_id
      AND status = 'IN_PROGRESS'
  ) THEN
    RAISE EXCEPTION 'Cannot start session: another session under this booking is currently IN_PROGRESS'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_sessions
    WHERE booking_id = v_booking.id
      AND session_number < v_session.session_number
      AND status NOT IN ('COMPLETED', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'Cannot start session #%: earlier sessions must be completed or cancelled first', v_session.session_number
      USING ERRCODE = 'P0001';
  END IF;

  -- 9. Execute Transition
  UPDATE public.booking_sessions
  SET status = 'IN_PROGRESS',
      updated_at = pg_catalog.now()
  WHERE id = p_session_id;

  IF v_booking.status = 'CONFIRMED' THEN
    UPDATE public.bookings
    SET status = 'IN_PROGRESS',
        updated_at = pg_catalog.now()
    WHERE id = v_booking.id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'session_id', p_session_id,
    'session_number', v_session.session_number,
    'session_status', 'IN_PROGRESS',
    'booking_id', v_booking.id
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 9. RLS & STORAGE POLICY ADJUSTMENTS FOR ARTIST ISOLATION
-- ----------------------------------------------------------------------------

-- 1. booking_payment_submissions SELECT Policy
DROP POLICY IF EXISTS "Customer read own submissions or Admin/Artist read assigned" ON public.booking_payment_submissions;
DROP POLICY IF EXISTS "Customer read own submissions" ON public.booking_payment_submissions;

CREATE POLICY "Customer read own submissions or Admin/Artist read assigned"
ON public.booking_payment_submissions
FOR SELECT
TO authenticated
USING (
  customer_user_id = auth.uid()
  OR private.is_admin()
  OR (
    private.get_artist_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_payment_submissions.booking_id
        AND b.artist_id = private.get_artist_id()
    )
  )
);

-- 2. booking_payments SELECT Policy
DROP POLICY IF EXISTS "Select policy for booking_payments" ON public.booking_payments;

CREATE POLICY "Select policy for booking_payments"
ON public.booking_payments
FOR SELECT
TO authenticated
USING (
  private.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_payments.booking_id
      AND (
        b.customer_user_id = auth.uid()
        OR (
          private.get_artist_id() IS NOT NULL
          AND b.artist_id = private.get_artist_id()
        )
      )
  )
);

-- 3. Storage Policy for booking-payment-slips
DROP POLICY IF EXISTS "Customer read own slips or Admin read all" ON storage.objects;
DROP POLICY IF EXISTS "Customer read own slips or Admin/Artist read assigned" ON storage.objects;

CREATE POLICY "Customer read own slips or Admin/Artist read assigned"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'booking-payment-slips'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.is_admin()
    OR (
      private.get_artist_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.booking_payment_submissions bps
        JOIN public.bookings b ON b.id = bps.booking_id
        WHERE bps.slip_path = storage.objects.name
          AND b.artist_id = private.get_artist_id()
      )
    )
  )
);

COMMIT;
