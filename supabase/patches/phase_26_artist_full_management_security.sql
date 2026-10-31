-- ============================================================================
-- 157 TATTOO — PHASE 26: ARTIST FULL MANAGEMENT & STRICT ISOLATION PATCH
-- Security Model:
--   - Admin can manage all requests/bookings
--   - Artist can manage ONLY requests/bookings where artist_id = private.get_artist_id()
--   - Accessing another artist's request/booking raises: 'คุณไม่มีสิทธิ์จัดการคิวนี้'
--   - Slip approval/rejection uses FOR UPDATE atomic lock & PENDING status check
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper Function: private.get_artist_id()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.get_artist_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT a.id
    FROM public.artists a
    WHERE a.user_id = auth.uid()
      AND a.is_active = true
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

-- ----------------------------------------------------------------------------
-- 2. Helper Function: private.is_admin()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid()
          AND role = 'admin'
          AND is_active = true
      )
    ),
    FALSE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

-- ----------------------------------------------------------------------------
-- 3. RPC: artist_confirm_booking_request / admin_confirm_booking_request
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
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_estimate RECORD;
  v_booking_id UUID;
  v_booking_status TEXT;
  v_quoted NUMERIC;
  v_deposit NUMERIC;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_estimate_request_id IS NULL OR p_appointment_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'ข้อมูลจำเป็นไม่ครบถ้วน' USING ERRCODE = '22004';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น' USING ERRCODE = '22023';
  END IF;

  SELECT id, customer_user_id, artist_id, status, description, quoted_price
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการคำขอจองคิว' USING ERRCODE = 'P0002';
  END IF;

  -- Scope Check: Admin or Assigned Artist Only
  IF NOT (v_is_admin OR (v_estimate.artist_id IS NOT NULL AND v_estimate.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'คำขอจองคิวไม่อยู่ในสถานะที่สามารถยืนยันได้' USING ERRCODE = '22023';
  END IF;

  v_quoted := COALESCE(p_quoted_price, v_estimate.quoted_price, 0);
  v_deposit := COALESCE(p_deposit_required, 0);

  IF v_deposit > 0 THEN
    v_booking_status := 'WAITING_DEPOSIT';
  ELSE
    v_booking_status := 'CONFIRMED';
  END IF;

  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    quoted_price = v_quoted,
    deposit_required = v_deposit,
    quote_note = p_artist_note,
    updated_at = pg_catalog.now()
  WHERE id = p_estimate_request_id;

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
    COALESCE(v_estimate.artist_id, v_artist_id),
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

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', p_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_status', v_booking_status
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. RPC: artist_reject_booking_request
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
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_estimate RECORD;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
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
    RAISE EXCEPTION 'ไม่พบรายการคำขอจองคิว' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_is_admin OR (v_estimate.artist_id IS NOT NULL AND v_estimate.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF v_estimate.status != 'PENDING' THEN
    RAISE EXCEPTION 'คำขอจองคิวไม่อยู่ในสถานะที่สามารถปฏิเสธได้' USING ERRCODE = '22023';
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
-- 5. RPC: artist_approve_payment_submission / admin_approve_payment_submission
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
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_submission RECORD;
  v_booking RECORD;
  v_payment_id UUID;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'จำนวนเงินต้องมากกว่า 0' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic Lock & PENDING Status Check
  SELECT id, booking_id, customer_user_id, claimed_amount, status, reference_no
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการส่งสลิปชำระเงิน' USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'รายการสลิปนี้ถูกตรวจสอบไปแล้ว' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, artist_id, status INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงานที่เกี่ยวข้อง' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
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
    COALESCE(p_payment_method, 'BANK_TRANSFER'),
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
    reviewed_by = auth.uid(),
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  UPDATE public.bookings
  SET
    status = 'CONFIRMED',
    confirmed_at = COALESCE(confirmed_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE id = v_submission.booking_id;

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

-- Alias admin_approve_payment_submission to artist_approve_payment_submission
CREATE OR REPLACE FUNCTION public.admin_approve_payment_submission(
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
BEGIN
  RETURN public.artist_approve_payment_submission(
    p_submission_id,
    p_verified_amount,
    p_payment_method,
    p_reference_no,
    p_artist_note
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC: artist_reject_payment_submission / admin_reject_payment_submission
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
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_submission RECORD;
  v_booking RECORD;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'กรุณาระบุเหตุผลการปฏิเสธ' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, booking_id, status
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการส่งสลิปชำระเงิน' USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'รายการสลิปนี้ถูกตรวจสอบไปแล้ว' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, artist_id INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  UPDATE public.booking_payment_submissions
  SET
    status = 'REJECTED',
    rejection_reason = trim(p_rejection_reason),
    reviewed_at = pg_catalog.now(),
    reviewed_by = auth.uid(),
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'status', 'REJECTED'
  );
END;
$$;

-- Alias admin_reject_payment_submission to artist_reject_payment_submission
CREATE OR REPLACE FUNCTION public.admin_reject_payment_submission(
  p_submission_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.artist_reject_payment_submission(p_submission_id, p_rejection_reason);
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. RPC: artist_reschedule_booking
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
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_booking RECORD;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  SELECT id, artist_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF p_new_date IS NOT NULL THEN
    UPDATE public.bookings
    SET
      requested_date = p_new_date,
      requested_start_time = COALESCE(p_new_start_time, requested_start_time),
      admin_note = COALESCE(p_note, admin_note),
      updated_at = pg_catalog.now()
    WHERE id = p_booking_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'new_date', p_new_date
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC: artist_cancel_booking
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
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_booking RECORD;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  SELECT id, artist_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  UPDATE public.bookings
  SET
    status = 'CANCELLED',
    admin_note = COALESCE(p_cancellation_reason, admin_note),
    updated_at = pg_catalog.now()
  WHERE id = p_booking_id;

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
-- 9. RPC: artist_complete_booking
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_complete_booking(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_booking RECORD;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  SELECT id, artist_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_sessions
    WHERE booking_id = p_booking_id
      AND status NOT IN ('COMPLETED', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'ยังมีรอบสักที่ดำเนินการไม่เสร็จสิ้น' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bookings
  SET
    status = 'COMPLETED',
    updated_at = pg_catalog.now()
  WHERE id = p_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'COMPLETED'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. RLS Policies Lockdown: Customers, Estimate Requests, Bookings, Payments
-- ----------------------------------------------------------------------------

-- public.estimate_requests RLS
ALTER TABLE public.estimate_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Estimate requests read policy" ON public.estimate_requests;
CREATE POLICY "Estimate requests read policy"
ON public.estimate_requests
FOR SELECT
TO authenticated
USING (
  customer_user_id = auth.uid()
  OR private.is_admin()
  OR (
    private.get_artist_id() IS NOT NULL
    AND artist_id = private.get_artist_id()
  )
);

-- public.bookings RLS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Bookings read policy" ON public.bookings;
CREATE POLICY "Bookings read policy"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  customer_user_id = auth.uid()
  OR private.is_admin()
  OR (
    private.get_artist_id() IS NOT NULL
    AND artist_id = private.get_artist_id()
  )
);

-- public.customers RLS (Artist can view customers linked to their bookings/estimates only)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Customers read policy for artist isolation" ON public.customers;
CREATE POLICY "Customers read policy for artist isolation"
ON public.customers
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR private.is_admin()
  OR (
    private.get_artist_id() IS NOT NULL
    AND (
      EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.customer_user_id = customers.user_id
          AND b.artist_id = private.get_artist_id()
      )
      OR EXISTS (
        SELECT 1 FROM public.estimate_requests er
        WHERE er.customer_user_id = customers.user_id
          AND er.artist_id = private.get_artist_id()
      )
    )
  )
);

COMMIT;
