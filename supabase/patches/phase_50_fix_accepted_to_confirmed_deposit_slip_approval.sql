-- ============================================================================
-- 157 TATTOO — PHASE 50 FORWARD MIGRATION
-- FIX CUSTOM BOOKING DEPOSIT SLIP APPROVAL (ACCEPTED -> CONFIRMED TRANSITION)
-- ============================================================================
-- Problem:
-- When approving a ฿500 deposit slip for a Custom Booking whose Estimate Request
-- is in status 'ACCEPTED', `reconcile_booking_deposit_status` attempts to update
-- `estimate_requests.status = 'CONFIRMED'`. The trigger `handle_estimate_status_transition`
-- on `estimate_requests` rejected this transition with:
--   "Invalid status transition from ACCEPTED to CONFIRMED"
--
-- Solution:
-- 1. Update `public.handle_estimate_status_transition()`:
--    - Allow 'ACCEPTED' -> 'CONFIRMED' and 'ACCEPTED' -> 'WAITING_DEPOSIT' transition
--      only for Admin, assigned Artist, or system reconciliation (auth.uid() IS NULL).
-- 2. Update `public.handle_booking_status_transition()`:
--    - Allow 'ACCEPTED' -> 'CONFIRMED' and 'ACCEPTED' -> 'WAITING_DEPOSIT' for bookings
--      only for Admin, assigned Artist, or system reconciliation.
-- 3. Update `public.reconcile_booking_deposit_status()`:
--    - Support 'WAITING_DEPOSIT', 'APPROVED', and 'ACCEPTED' statuses in reconciliation.
--    - Synchronize linked estimate request status to 'CONFIRMED' for ('ACCEPTED', 'WAITING_DEPOSIT').
-- 4. Preserve all existing sessions and Flash Flow rules.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Trigger Function: handle_estimate_status_transition
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
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Unauthorized status transition' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
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

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Trigger Function: handle_booking_status_transition
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_artist_id UUID;
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
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);
  v_artist_id := private.get_artist_id();

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
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can approve booking requests'
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

      ELSIF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, pg_catalog.now());

      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can reject booking requests'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin) THEN
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
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can update booking status'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := NULL;
      ELSIF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, pg_catalog.now());
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel approved booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from APPROVED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- WAITING_DEPOSIT transitions
    ELSIF OLD.status = 'WAITING_DEPOSIT' THEN
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit of % has not been received (current paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, pg_catalog.now());
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only Admin or Customer owner can cancel booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from WAITING_DEPOSIT to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- ACCEPTED transitions
    ELSIF OLD.status = 'ACCEPTED' THEN
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := COALESCE(NEW.confirmed_at, pg_catalog.now());
      ELSIF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND OLD.artist_id = v_artist_id) OR auth.uid() IS NULL) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system reconciliation can update booking status'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := NULL;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Unauthorized to cancel booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from ACCEPTED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- CONFIRMED transitions
    ELSIF OLD.status = 'CONFIRMED' THEN
      IF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin or system reconciliation can revert booking status'
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
        -- Defense-in-depth: Admin OR (Assigned active Artist with an actual IN_PROGRESS session)
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
            AND EXISTS (
              SELECT 1 FROM public.booking_sessions bs
              WHERE bs.booking_id = OLD.id
                AND bs.status = 'IN_PROGRESS'
            )
          )
        ) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist with an active in-progress session can start booking'
            USING ERRCODE = 'P0001';
        END IF;

      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel confirmed booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from CONFIRMED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- IN_PROGRESS transitions
    ELSIF OLD.status = 'IN_PROGRESS' THEN
      IF NEW.status = 'COMPLETED' THEN
        -- Defense-in-depth: Admin OR (Assigned active Artist with at least 1 completed session and 0 active sessions)
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
            AND EXISTS (
              SELECT 1 FROM public.booking_sessions bs
              WHERE bs.booking_id = OLD.id
                AND bs.status = 'COMPLETED'
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.booking_sessions bs
              WHERE bs.booking_id = OLD.id
                AND bs.status IN ('SCHEDULED', 'IN_PROGRESS')
            )
          )
        ) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist with all active sessions completed can complete booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from IN_PROGRESS to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    END IF;

  END IF;

  -- 5. Artist Reassignment Protection
  IF NEW.artist_id IS DISTINCT FROM OLD.artist_id AND OLD.artist_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.booking_sessions
      WHERE booking_sessions.booking_id = OLD.id
        AND booking_sessions.status = 'COMPLETED'
    ) THEN
      RAISE EXCEPTION 'Cannot reassign artist for booking % with completed historical sessions', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 6. System Status Timestamps Authority
  IF OLD.status = 'PENDING' AND NEW.status = 'APPROVED' THEN
    NEW.approved_at := COALESCE(NEW.approved_at, pg_catalog.now());
  END IF;

  IF NEW.status = 'CONFIRMED' AND OLD.status != 'CONFIRMED' THEN
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, pg_catalog.now());
  END IF;

  RETURN NEW;
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. Helper RPC: reconcile_booking_deposit_status (Single Source of Truth)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_booking_deposit_status(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_booking_status TEXT;
  v_estimate_request_id UUID;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
BEGIN
  -- Row lock booking to serialize concurrent reconciliations
  SELECT b.status, b.estimate_request_id, COALESCE(e.deposit_required, 500.00)
  INTO v_booking_status, v_estimate_request_id, v_deposit_required
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

  -- CASE A: Deposit satisfied -> WAITING_DEPOSIT / APPROVED / ACCEPTED -> CONFIRMED
  IF v_booking_status IN ('WAITING_DEPOSIT', 'APPROVED', 'ACCEPTED') THEN
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
          AND status IN ('ACCEPTED', 'WAITING_DEPOSIT');
      END IF;
    END IF;

  -- CASE B: Deposit lost (due to VOID) -> CONFIRMED -> WAITING_DEPOSIT
  ELSIF v_booking_status = 'CONFIRMED' THEN
    IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
      -- Safeguard: Do not downgrade if sessions have already started or completed
      IF NOT EXISTS (
        SELECT 1 FROM public.booking_sessions
        WHERE booking_id = p_booking_id
          AND status IN ('IN_PROGRESS', 'COMPLETED')
      ) THEN
        UPDATE public.bookings
        SET status = 'WAITING_DEPOSIT',
            confirmed_at = NULL,
            updated_at = pg_catalog.now()
        WHERE id = p_booking_id;
      END IF;
    END IF;
  END IF;
END;
$$;


-- ----------------------------------------------------------------------------
-- 4. Core RPC: artist_approve_payment_submission
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
  v_reviewer_uid UUID;
  v_submission RECORD;
  v_booking RECORD;
  v_payment_id UUID;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์อนุมัติหลักฐานการชำระเงิน' USING ERRCODE = '42501';
  END IF;

  v_reviewer_uid := auth.uid();

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
    RAISE EXCEPTION 'รายการสลิปนี้ถูกตรวจสอบไปแล้ว (สถานะปัจจุบัน: %)', v_submission.status USING ERRCODE = 'P0001';
  END IF;

  -- Lock associated booking
  SELECT id, artist_id, status, estimate_request_id INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงานที่เกี่ยวข้อง' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

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

  -- 3. Trigger Deposit Reconciliation Helper (Single source of truth for confirming booking & estimate request)
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


-- ----------------------------------------------------------------------------
-- 5. Core RPC: admin_approve_payment_submission (Alias / Wrapper)
-- ----------------------------------------------------------------------------
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
BEGIN
  RETURN public.artist_approve_payment_submission(
    p_submission_id,
    p_verified_amount,
    p_payment_method,
    p_reference_no,
    p_admin_note
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
