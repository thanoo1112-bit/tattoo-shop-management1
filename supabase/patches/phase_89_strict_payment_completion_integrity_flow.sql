-- =============================================================================
-- 157 TATTOO — PHASE 89: STRICT PAYMENT COMPLETION INTEGRITY FLOW & TRIGGER HARDENING
-- 
-- 1. Hardens public.handle_booking_status_transition() trigger to:
--    a) Permit CONFIRMED -> COMPLETED status transition with full Phase 7G3A Server Integrity Checks.
--    b) Enforce Financial Completion Rule: v_paid_total (status = 'RECORDED') >= NEW.quoted_price
--       before allowing status transition to COMPLETED (blocks Direct UPDATE bypass).
--
-- 2. Refactors record_final_payment_and_complete_booking RPC to:
--    a) Maintain FOR UPDATE row locking and Idempotency Guard (returns clean success if already COMPLETED).
--    b) Calculate remaining balance: GREATEST(0, p_actual_price - v_recorded_paid).
--    c) INSERT remaining payment to public.booking_payments FIRST (if remaining balance > 0).
--    d) Update linked estimate_requests quoted_price.
--    e) UPDATE public.bookings status = 'COMPLETED' SECOND (within same atomic transaction).
--    f) If any step fails, entire transaction rolls back atomically.
--
-- FOR REVIEW ONLY — DO NOT APPLY TO LIVE DATABASE UNTIL APPROVED.
-- =============================================================================

BEGIN;

-- =============================================================================
-- PART 1: TRIGGER FUNCTION HARDENING (public.handle_booking_status_transition)
-- =============================================================================

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
  v_quoted_price NUMERIC(12,2);
  v_effective_price NUMERIC(12,2);
  v_total_sessions INT;
  v_completed_sessions INT;
  v_active_sessions INT;
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

  -- 3. Identify Actor (Supports authenticated Admin profile OR service_role)
  v_is_admin := private.is_admin()
    OR (auth.jwt() ->> 'role' = 'service_role')
    OR (current_setting('role', true) = 'service_role');
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
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := pg_catalog.now();
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
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit of % has not been received (current paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := pg_catalog.now();
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from WAITING_DEPOSIT to %', NEW.status
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

      ELSIF NEW.status = 'COMPLETED' THEN
        -- Apply Server Completion Integrity Rules (Supports CONFIRMED -> COMPLETED)
        -- 1. Authorization Check
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
          )
        ) THEN
          RAISE EXCEPTION 'Unauthorized: Only Admin or assigned Artist can complete booking'
            USING ERRCODE = '42501';
        END IF;

        -- 2. Actual Tattoo Price Requirement (quoted_price)
        IF OLD.estimate_request_id IS NOT NULL THEN
          SELECT e.quoted_price INTO v_quoted_price
          FROM public.estimate_requests e
          WHERE e.id = OLD.estimate_request_id;
        ELSE
          v_quoted_price := NEW.quoted_price;
        END IF;

        v_effective_price := COALESCE(NEW.quoted_price, v_quoted_price, 0.00);

        IF v_effective_price <= 0 THEN
          RAISE EXCEPTION 'ACTUAL_PRICE_REQUIRED: actual tattoo price (quoted_price) has not been set for booking %', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        -- 3. Financial Completion Rule: Recorded Payments Must Satisfy Quoted Price
        IF v_paid_total < v_effective_price THEN
          RAISE EXCEPTION 'PAYMENT_REQUIRED: total recorded paid (฿%) is less than actual tattoo price (฿%) for booking %',
            v_paid_total, v_effective_price, OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        -- 4. Session State Counts Check
        SELECT 
          COUNT(*),
          COUNT(*) FILTER (WHERE status = 'COMPLETED'),
          COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS'))
        INTO v_total_sessions, v_completed_sessions, v_active_sessions
        FROM public.booking_sessions
        WHERE booking_id = OLD.id;

        IF v_total_sessions = 0 THEN
          RAISE EXCEPTION 'Cannot complete booking %: no sessions found', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        IF v_active_sessions > 0 THEN
          RAISE EXCEPTION 'Cannot complete booking %: all scheduled or in-progress sessions must be completed or cancelled first', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        IF v_completed_sessions = 0 THEN
          RAISE EXCEPTION 'Cannot complete booking %: no completed sessions found', OLD.id
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
        -- 1. Authorization Check
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
          )
        ) THEN
          RAISE EXCEPTION 'Unauthorized: Only Admin or assigned Artist can complete booking'
            USING ERRCODE = '42501';
        END IF;

        -- 2. Actual Tattoo Price Requirement (quoted_price)
        IF OLD.estimate_request_id IS NOT NULL THEN
          SELECT e.quoted_price INTO v_quoted_price
          FROM public.estimate_requests e
          WHERE e.id = OLD.estimate_request_id;
        ELSE
          v_quoted_price := NEW.quoted_price;
        END IF;

        v_effective_price := COALESCE(NEW.quoted_price, v_quoted_price, 0.00);

        IF v_effective_price <= 0 THEN
          RAISE EXCEPTION 'ACTUAL_PRICE_REQUIRED: actual tattoo price (quoted_price) has not been set for booking %', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        -- 3. Financial Completion Rule: Recorded Payments Must Satisfy Quoted Price
        IF v_paid_total < v_effective_price THEN
          RAISE EXCEPTION 'PAYMENT_REQUIRED: total recorded paid (฿%) is less than actual tattoo price (฿%) for booking %',
            v_paid_total, v_effective_price, OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        -- 4. Session State Counts Check
        SELECT 
          COUNT(*),
          COUNT(*) FILTER (WHERE status = 'COMPLETED'),
          COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS'))
        INTO v_total_sessions, v_completed_sessions, v_active_sessions
        FROM public.booking_sessions
        WHERE booking_id = OLD.id;

        IF v_total_sessions = 0 THEN
          RAISE EXCEPTION 'Cannot complete booking %: no sessions found', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        IF v_active_sessions > 0 THEN
          RAISE EXCEPTION 'Cannot complete booking %: all scheduled or in-progress sessions must be completed or cancelled first', OLD.id
            USING ERRCODE = 'P0001';
        END IF;

        IF v_completed_sessions = 0 THEN
          RAISE EXCEPTION 'Cannot complete booking %: no completed sessions found', OLD.id
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
    NEW.approved_at := pg_catalog.now();
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
    NEW.rejected_at := pg_catalog.now();
  ELSIF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
    NEW.cancelled_at := pg_catalog.now();
  ELSIF NEW.status = 'CONFIRMED' AND OLD.status != 'CONFIRMED' THEN
    NEW.confirmed_at := pg_catalog.now();
  ELSIF NEW.status = 'IN_PROGRESS' AND OLD.status != 'IN_PROGRESS' THEN
    NEW.started_at := pg_catalog.now();
  ELSIF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    NEW.completed_at := pg_catalog.now();
  END IF;

  RETURN NEW;
END;
$$;


-- =============================================================================
-- PART 2: RPC REFACTORING (record_final_payment_and_complete_booking)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_final_payment_and_complete_booking(
  p_booking_id UUID,
  p_actual_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_auth_uid UUID;
  v_booking RECORD;
  v_total_sessions INT;
  v_active_additional_sessions INT;
  v_initial_session_id UUID;
  v_initial_session_status TEXT;
  v_recorded_paid NUMERIC(12,2);
  v_remaining_balance NUMERIC(12,2);
  v_payment_type TEXT;
  v_payment_id UUID := NULL;
BEGIN
  v_auth_uid := auth.uid();
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 1. Validate Input Parameters
  IF p_actual_price IS NULL OR p_actual_price <= 0 THEN
    RAISE EXCEPTION 'กรุณาระบุราคางานสักที่ตกลงทั้งหมด' USING ERRCODE = '22023';
  END IF;

  -- 2. Lock Parent Booking FOR UPDATE (Prevents Concurrent Double-Completion)
  SELECT id, estimate_request_id, status, customer_user_id, customer_id, artist_id
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  -- Validate Ownership (Admin OR assigned active Artist)
  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- 3. Idempotency Guard (If already COMPLETED, return clean success without duplicate payment)
  IF v_booking.status = 'COMPLETED' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'already_completed', true,
      'booking_id', p_booking_id,
      'status', 'COMPLETED'
    );
  END IF;

  -- Status Eligibility Guard
  IF v_booking.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'ไม่สามารถปิดงานได้จากสถานะปัจจุบัน (%)', v_booking.status USING ERRCODE = '22023';
  END IF;

  -- 4. Calculate All Recorded Payments under Row Lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)::NUMERIC(12,2)
  INTO v_recorded_paid
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- Over-Payment Guard: If recorded paid > actual price
  IF v_recorded_paid > p_actual_price THEN
    RAISE EXCEPTION 'ยอดรับเงินสะสม (฿%) เกินราคางานรวม (฿%) กรุณาตรวจสอบประวัติการชำระเงิน',
      v_recorded_paid, p_actual_price USING ERRCODE = '22023';
  END IF;

  -- 5. Auto-Calculate Remaining Balance
  v_remaining_balance := GREATEST(0.00, p_actual_price - v_recorded_paid);

  -- 6. Session Validation & Completion Rules
  SELECT COUNT(*) INTO v_total_sessions
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  IF v_total_sessions > 1 THEN
    SELECT COUNT(*) INTO v_active_additional_sessions
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
      AND session_number > 1
      AND status IN ('SCHEDULED', 'IN_PROGRESS');

    IF v_active_additional_sessions > 0 THEN
      RAISE EXCEPTION 'กรุณาเสร็จสิ้นรอบสักให้ครบทุกรอบก่อนปิดงาน' USING ERRCODE = '22023';
    END IF;
  ELSIF v_total_sessions = 1 THEN
    SELECT id, status INTO v_initial_session_id, v_initial_session_status
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
    ORDER BY session_number ASC, created_at ASC
    LIMIT 1;

    IF v_initial_session_status != 'COMPLETED' AND v_initial_session_status != 'CANCELLED' THEN
      UPDATE public.booking_sessions
      SET status = 'COMPLETED',
          updated_at = pg_catalog.now()
      WHERE id = v_initial_session_id;
    END IF;
  END IF;

  -- 7. REORDERED FINANCIAL INTEGRITY STEP 1: Insert Final Balance Payment FIRST
  -- (Makes payment row visible to handle_booking_status_transition trigger within same transaction)
  IF v_remaining_balance > 0 THEN
    IF v_recorded_paid > 0 THEN
      v_payment_type := 'BALANCE';
    ELSE
      v_payment_type := 'FULL_PAYMENT';
    END IF;

    INSERT INTO public.booking_payments (
      booking_id,
      customer_id,
      customer_user_id,
      payment_type,
      amount,
      payment_method,
      status,
      paid_at,
      note,
      created_by
    ) VALUES (
      p_booking_id,
      v_booking.customer_id,
      v_booking.customer_user_id,
      v_payment_type,
      v_remaining_balance,
      'CASH',
      'RECORDED',
      pg_catalog.now(),
      'บันทึกรับเงินและปิดงาน',
      v_auth_uid
    )
    RETURNING id INTO v_payment_id;
  END IF;

  -- 8. Synchronize Linked Estimate Request quoted_price
  IF v_booking.estimate_request_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET quoted_price = p_actual_price,
        updated_at = pg_catalog.now()
    WHERE id = v_booking.estimate_request_id;
  END IF;

  -- 9. REORDERED FINANCIAL INTEGRITY STEP 2: Update Booking Status SECOND
  -- (Triggers handle_booking_status_transition, which verifies v_paid_total >= NEW.quoted_price)
  UPDATE public.bookings
  SET quoted_price = p_actual_price,
      status = 'COMPLETED',
      updated_at = pg_catalog.now()
  WHERE id = p_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'actual_price', p_actual_price,
    'recorded_paid', v_recorded_paid,
    'final_payment_amount', v_remaining_balance,
    'payment_created', (v_remaining_balance > 0),
    'payment_id', v_payment_id,
    'status', 'COMPLETED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_final_payment_and_complete_booking(UUID, NUMERIC) TO service_role;


-- Single Wrapper Alias RPC
CREATE OR REPLACE FUNCTION public.admin_record_final_payment_and_complete_booking(
  p_booking_id UUID,
  p_actual_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.record_final_payment_and_complete_booking(
    p_booking_id => p_booking_id,
    p_actual_price => p_actual_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_final_payment_and_complete_booking(UUID, NUMERIC) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
