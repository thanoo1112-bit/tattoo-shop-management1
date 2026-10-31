-- ============================================================================
-- 157 TATTOO — PHASE 75 MIGRATION
-- FLASH RESERVATION DEPOSIT PAYMENT FLOW & LINKED BOOKINGS
-- ============================================================================

BEGIN;

-- 1. Update check constraint on flash_reservations to include WAITING_DEPOSIT
ALTER TABLE public.flash_reservations
DROP CONSTRAINT IF EXISTS flash_reservations_status_check;

ALTER TABLE public.flash_reservations
ADD CONSTRAINT flash_reservations_status_check
CHECK (status IN ('PENDING', 'WAITING_DEPOSIT', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED'));

-- 2. Make estimate_request_id DROP NOT NULL & add flash_reservation_id to public.bookings
ALTER TABLE public.bookings ALTER COLUMN estimate_request_id DROP NOT NULL;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS flash_reservation_id UUID REFERENCES public.flash_reservations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_flash_reservation_id ON public.bookings(flash_reservation_id);

-- 3. Update handle_booking_payments_before_insert trigger to support service role & explicit created_by
CREATE OR REPLACE FUNCTION public.handle_booking_payments_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_caller_uid UUID;
  v_booking_status TEXT;
BEGIN
  v_caller_uid := COALESCE(auth.uid(), NEW.created_by);
  IF v_caller_uid IS NULL THEN
    SELECT customer_user_id INTO v_caller_uid FROM public.bookings WHERE id = NEW.booking_id;
  END IF;

  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'created_by must be set from authenticated context; auth.uid() is null'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_booking_status
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF v_booking_status IS NULL THEN
    RAISE EXCEPTION 'Associated booking % does not exist', NEW.booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking_status IN ('PENDING', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot record payment for booking % in % status', NEW.booking_id, v_booking_status
      USING ERRCODE = 'P0001';
  END IF;

  NEW.created_by := v_caller_uid;

  IF NEW.status IS NOT NULL AND NEW.status != 'RECORDED' THEN
    RAISE EXCEPTION 'New payment must start with RECORDED status; cannot be initialized as %', NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  NEW.status := 'RECORDED';

  IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
    RAISE EXCEPTION 'New payment cannot contain void fields upon creation'
      USING ERRCODE = 'P0001';
  END IF;
  NEW.voided_at := NULL;
  NEW.voided_by := NULL;
  NEW.void_reason := NULL;

  IF NEW.paid_at IS NULL THEN
    NEW.paid_at := pg_catalog.now();
  END IF;

  NEW.created_at := pg_catalog.now();
  NEW.updated_at := pg_catalog.now();

  RETURN NEW;
END;
$function$;

-- 4. Update reconcile_booking_deposit_status to sync linked flash_reservations to APPROVED/CONFIRMED upon deposit satisfaction
CREATE OR REPLACE FUNCTION public.reconcile_booking_deposit_status(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_booking_status TEXT;
  v_estimate_request_id UUID;
  v_flash_reservation_id UUID;
  v_artist_id UUID;
  v_requested_date DATE;
  v_requested_start_time TIME;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
BEGIN
  -- Row lock booking to serialize concurrent reconciliations
  SELECT b.status, b.estimate_request_id, b.flash_reservation_id, b.artist_id, b.requested_date, b.requested_start_time, COALESCE(e.deposit_required, 500.00)
  INTO v_booking_status, v_estimate_request_id, v_flash_reservation_id, v_artist_id, v_requested_date, v_requested_start_time, v_deposit_required
  FROM public.bookings b
  LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF v_booking_status IS NULL THEN
    RETURN;
  END IF;

  -- Terminal or in-flight bookings cannot be altered by payment reconciliation
  IF v_booking_status IN ('IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RETURN;
  END IF;

  -- Calculate paid_total strictly from RECORDED payments under row lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)
  INTO v_paid_total
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- CASE A: Deposit satisfied -> PENDING / WAITING_DEPOSIT / APPROVED / ACCEPTED / QUOTED -> CONFIRMED
  IF v_booking_status IN ('PENDING', 'WAITING_DEPOSIT', 'APPROVED', 'ACCEPTED', 'QUOTED') THEN
    IF v_deposit_required <= 0 OR v_paid_total >= v_deposit_required THEN
      UPDATE public.bookings
      SET status = 'CONFIRMED',
          confirmed_at = COALESCE(confirmed_at, pg_catalog.now()),
          updated_at = pg_catalog.now()
      WHERE id = p_booking_id;

      IF v_estimate_request_id IS NOT NULL THEN
        UPDATE public.estimate_requests
        SET status = 'CONFIRMED',
            updated_at = pg_catalog.now()
        WHERE id = v_estimate_request_id
          AND status IN ('ACCEPTED', 'WAITING_DEPOSIT', 'PENDING', 'QUOTED', 'APPROVED');
      END IF;

      IF v_flash_reservation_id IS NOT NULL THEN
        UPDATE public.flash_reservations
        SET status = 'APPROVED',
            approved_at = COALESCE(approved_at, pg_catalog.now()),
            updated_at = pg_catalog.now()
        WHERE id = v_flash_reservation_id
          AND status IN ('ACCEPTED', 'WAITING_DEPOSIT', 'PENDING');
      END IF;

      -- Ensure booking_session exists & is SCHEDULED for the artist's calendar
      IF NOT EXISTS (
        SELECT 1 FROM public.booking_sessions WHERE booking_id = p_booking_id
      ) THEN
        INSERT INTO public.booking_sessions (
          booking_id,
          artist_id,
          session_number,
          start_at,
          end_at,
          status,
          created_at,
          updated_at
        )
        VALUES (
          p_booking_id,
          v_artist_id,
          1,
          (COALESCE(v_requested_date, CURRENT_DATE)::TEXT || ' ' || COALESCE(v_requested_start_time, '10:00:00')::TEXT || '+07')::TIMESTAMPTZ,
          (COALESCE(v_requested_date, CURRENT_DATE)::TEXT || ' ' || COALESCE(v_requested_start_time, '10:00:00')::TEXT || '+07')::TIMESTAMPTZ + INTERVAL '2 hours',
          'SCHEDULED',
          pg_catalog.now(),
          pg_catalog.now()
        );
      ELSE
        UPDATE public.booking_sessions
        SET status = 'SCHEDULED',
            updated_at = pg_catalog.now()
        WHERE booking_id = p_booking_id
          AND status NOT IN ('COMPLETED', 'CANCELLED', 'IN_PROGRESS');
      END IF;

    END IF;

  -- CASE B: Deposit lost (due to VOID) -> CONFIRMED -> WAITING_DEPOSIT
  ELSIF v_booking_status = 'CONFIRMED' THEN
    IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
      UPDATE public.bookings
      SET status = 'WAITING_DEPOSIT',
          updated_at = pg_catalog.now()
      WHERE id = p_booking_id;
    END IF;
  END IF;

END;
$$;

-- 5. Core RPC: artist_approve_payment_submission (Service role & fallback support)
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
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_reviewer_uid UUID;
  v_submission RECORD;
  v_booking RECORD;
  v_payment_id UUID;
BEGIN
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์อนุมัติหลักฐานการชำระเงิน' USING ERRCODE = '42501';
  END IF;

  IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'จำนวนเงินต้องมากกว่า 0' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic Lock & PENDING Status Check (Idempotency safeguard)
  SELECT id, booking_id, customer_user_id, claimed_amount, status, reference_no
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการส่งสลิปชำระเงิน' USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'รายการสลิปนี้ถูกตรวจสอบไปแล้ว (สถานะปัจจุบัน: %)', v_submission.status USING ERRCODE = 'P0001';
  END IF;

  -- Lock associated booking
  SELECT id, artist_id, customer_user_id, status, estimate_request_id INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงานที่เกี่ยวข้อง' USING ERRCODE = 'P0001';
  END IF;

  -- Security Check: Admin OR assigned Artist only
  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  v_reviewer_uid := COALESCE(auth.uid(), v_booking.customer_user_id);

  -- 1. Insert official payment record with status RECORDED
  INSERT INTO public.booking_payments (
    booking_id,
    payment_type,
    amount,
    payment_method,
    reference_no,
    note,
    status,
    paid_at,
    created_by,
    created_at,
    updated_at
  )
  VALUES (
    v_submission.booking_id,
    'DEPOSIT',
    p_verified_amount,
    COALESCE(p_payment_method, 'BANK_TRANSFER'),
    COALESCE(NULLIF(pg_catalog.btrim(p_reference_no), ''), v_submission.reference_no),
    p_artist_note,
    'RECORDED',
    pg_catalog.now(),
    v_reviewer_uid,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_payment_id;

  -- 2. Update submission status to APPROVED
  UPDATE public.booking_payment_submissions
  SET
    status = 'APPROVED',
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_reviewer_uid,
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  -- 3. Trigger Deposit Reconciliation Helper
  PERFORM public.reconcile_booking_deposit_status(v_submission.booking_id);

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

GRANT EXECUTE ON FUNCTION public.artist_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 6. Core RPC: artist_confirm_flash_reservation
CREATE OR REPLACE FUNCTION public.artist_confirm_flash_reservation(
  p_reservation_id UUID,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res RECORD;
  v_design RECORD;
  v_booking_id UUID;
  v_is_admin BOOLEAN;
  v_artist_id UUID;
BEGIN
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  SELECT * INTO v_res
  FROM public.flash_reservations
  WHERE id = p_reservation_id;

  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอจอง Flash' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_design
  FROM public.flash_designs
  WHERE id = v_res.flash_design_id;

  -- Security Check: Admin OR assigned Artist only
  IF NOT (v_is_admin OR (v_design.artist_id IS NOT NULL AND v_design.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์อนุมัติคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- 1. Check if booking already exists for this flash reservation
  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE flash_reservation_id = p_reservation_id;

  IF v_booking_id IS NULL THEN
    -- Insert new booking record in status WAITING_DEPOSIT
    INSERT INTO public.bookings (
      flash_reservation_id,
      customer_user_id,
      artist_id,
      requested_date,
      requested_start_time,
      customer_note,
      admin_note,
      status,
      quoted_price,
      approved_at,
      created_at,
      updated_at
    ) VALUES (
      p_reservation_id,
      v_res.customer_user_id,
      v_design.artist_id,
      v_res.requested_date,
      v_res.requested_start_time,
      v_res.customer_note,
      COALESCE(p_admin_note, 'อนุมัติโดยช่าง'),
      'WAITING_DEPOSIT',
      v_design.price,
      pg_catalog.now(),
      pg_catalog.now(),
      pg_catalog.now()
    )
    RETURNING id INTO v_booking_id;
  ELSE
    UPDATE public.bookings
    SET
      status = 'WAITING_DEPOSIT',
      admin_note = COALESCE(p_admin_note, admin_note),
      updated_at = pg_catalog.now()
    WHERE id = v_booking_id;
  END IF;

  -- 2. Update flash_reservations status to WAITING_DEPOSIT
  UPDATE public.flash_reservations
  SET
    status = 'WAITING_DEPOSIT',
    admin_note = COALESCE(p_admin_note, admin_note),
    approved_at = COALESCE(approved_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE id = p_reservation_id;

  -- 3. Lock flash design if single-use (is_repeatable = false)
  IF COALESCE(v_design.is_repeatable, FALSE) IS FALSE THEN
    UPDATE public.flash_designs
    SET status = 'RESERVED', updated_at = pg_catalog.now()
    WHERE id = v_design.id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'reservation_id', p_reservation_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.artist_confirm_flash_reservation(UUID, TEXT) TO authenticated, service_role;

-- 7. Update admin_process_flash_reservation RPC to delegate APPROVE to deposit flow
CREATE OR REPLACE FUNCTION public.admin_process_flash_reservation(
  p_reservation_id UUID,
  p_action TEXT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flash_design_id UUID;
  v_is_repeatable BOOLEAN;
  v_new_res_status TEXT;
  v_new_design_status TEXT;
BEGIN
  IF p_action = 'APPROVE' THEN
    RETURN public.artist_confirm_flash_reservation(p_reservation_id, p_admin_note);
  END IF;

  SELECT flash_design_id INTO v_flash_design_id
  FROM public.flash_reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการจอง Flash';
  END IF;

  SELECT COALESCE(is_repeatable, FALSE) INTO v_is_repeatable
  FROM public.flash_designs
  WHERE id = v_flash_design_id;

  IF p_action = 'REJECT' THEN
    v_new_res_status := 'REJECTED';
    v_new_design_status := 'AVAILABLE';
  ELSIF p_action = 'CANCEL' THEN
    v_new_res_status := 'CANCELLED';
    v_new_design_status := 'AVAILABLE';
  ELSIF p_action = 'COMPLETE' THEN
    v_new_res_status := 'COMPLETED';
    v_new_design_status := 'SOLD';
  ELSE
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- Update reservation status
  UPDATE public.flash_reservations
  SET
    status = v_new_res_status,
    admin_note = COALESCE(p_admin_note, admin_note),
    rejected_at = CASE WHEN p_action = 'REJECT' THEN NOW() ELSE rejected_at END,
    cancelled_at = CASE WHEN p_action = 'CANCEL' THEN NOW() ELSE cancelled_at END,
    completed_at = CASE WHEN p_action = 'COMPLETE' THEN NOW() ELSE completed_at END
  WHERE id = p_reservation_id;

  -- Update linked booking status if exists
  UPDATE public.bookings
  SET
    status = CASE
      WHEN p_action = 'REJECT' THEN 'REJECTED'
      WHEN p_action = 'CANCEL' THEN 'CANCELLED'
      WHEN p_action = 'COMPLETE' THEN 'COMPLETED'
      ELSE status
    END,
    rejected_at = CASE WHEN p_action = 'REJECT' THEN NOW() ELSE rejected_at END,
    cancelled_at = CASE WHEN p_action = 'CANCEL' THEN NOW() ELSE cancelled_at END,
    completed_at = CASE WHEN p_action = 'COMPLETE' THEN NOW() ELSE completed_at END,
    updated_at = NOW()
  WHERE flash_reservation_id = p_reservation_id;

  -- Only update flash_designs status if single-use (is_repeatable = false)
  IF v_is_repeatable IS FALSE THEN
    UPDATE public.flash_designs
    SET status = v_new_design_status
    WHERE id = v_flash_design_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_process_flash_reservation(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 8. Data Fix / Backfill for FLASH-68E277BB (68e277bb-4de1-43da-9ed3-7193226d41d7)
DO $$
DECLARE
  v_res RECORD;
  v_design RECORD;
  v_b_id UUID;
BEGIN
  SELECT * INTO v_res FROM public.flash_reservations WHERE id = '68e277bb-4de1-43da-9ed3-7193226d41d7';
  IF v_res.id IS NOT NULL THEN
    SELECT * INTO v_design FROM public.flash_designs WHERE id = v_res.flash_design_id;

    SELECT id INTO v_b_id FROM public.bookings WHERE flash_reservation_id = v_res.id;

    IF v_b_id IS NULL THEN
      INSERT INTO public.bookings (
        flash_reservation_id,
        customer_user_id,
        artist_id,
        requested_date,
        requested_start_time,
        customer_note,
        admin_note,
        status,
        quoted_price,
        approved_at,
        created_at,
        updated_at
      ) VALUES (
        v_res.id,
        v_res.customer_user_id,
        v_design.artist_id,
        v_res.requested_date,
        v_res.requested_start_time,
        v_res.customer_note,
        COALESCE(v_res.admin_note, 'อนุมัติโดยช่าง'),
        'WAITING_DEPOSIT',
        COALESCE(v_design.price, 10000),
        COALESCE(v_res.approved_at, NOW()),
        v_res.created_at,
        NOW()
      );
    ELSE
      UPDATE public.bookings
      SET status = 'WAITING_DEPOSIT', updated_at = NOW()
      WHERE id = v_b_id;
    END IF;

    UPDATE public.flash_reservations
    SET status = 'WAITING_DEPOSIT', updated_at = NOW()
    WHERE id = v_res.id;
  END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
