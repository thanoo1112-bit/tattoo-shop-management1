-- Phase 78: Cap deposit payment deadline by requested appointment date & time in submit_booking_payment_slip
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
  v_appointment_time TIMESTAMPTZ;
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
  SELECT id, customer_user_id, status, approved_at, created_at, requested_date, requested_start_time
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

  -- Cap deadline by requested appointment date & start time if present
  IF v_booking.requested_date IS NOT NULL THEN
    BEGIN
      v_appointment_time := (v_booking.requested_date::text || ' ' || COALESCE(v_booking.requested_start_time, '10:00:00'))::TIMESTAMPTZ;
      IF v_appointment_time < v_deadline THEN
        v_deadline := v_appointment_time;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
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

GRANT EXECUTE ON FUNCTION public.submit_booking_payment_slip(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
