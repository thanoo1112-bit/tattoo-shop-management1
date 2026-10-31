-- ============================================================================
-- 157 TATTOO — PHASE 52 MIGRATION
-- CUSTOM BOOKING 1-SESSION COMPLETION FLOW & ADDITIONAL SESSIONS GUARD
-- ============================================================================
-- Rules:
-- 1. If total sessions = 1:
--    Atomically update the single initial session to COMPLETED and Booking to COMPLETED
--    within a single database transaction.
-- 2. If total sessions > 1:
--    Do NOT auto-complete any session. Check if any additional session (session_number > 1)
--    is in status SCHEDULED or IN_PROGRESS. If so, raise exception:
--      "กรุณาปิดรอบสักเพิ่มเติมให้ครบก่อนเสร็จสิ้นงาน"
--    When all additional sessions are completed/cancelled, update Booking to COMPLETED.
-- 3. Update trigger `handle_booking_status_transition` to allow transition
--    from CONFIRMED to COMPLETED.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Trigger Function Update: handle_booking_status_transition
--    Allow transition from CONFIRMED -> COMPLETED for Admin or assigned Artist.
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
        -- Defense-in-depth: Admin OR (Assigned active Artist)
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
          )
        ) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can start booking'
            USING ERRCODE = 'P0001';
        END IF;

      ELSIF NEW.status = 'COMPLETED' THEN
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
          )
          OR auth.uid() IS NULL
        ) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or system RPC can complete booking'
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
        IF NOT (
          v_is_admin
          OR (
            v_artist_id IS NOT NULL
            AND OLD.artist_id IS NOT NULL
            AND OLD.artist_id = v_artist_id
          )
          OR auth.uid() IS NULL
        ) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can complete booking'
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
-- 2. Core RPC: artist_complete_booking(p_booking_id UUID)
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
  v_quoted_price NUMERIC(12,2);
  v_total_sessions INT;
  v_active_additional_sessions INT;
  v_initial_session_id UUID;
BEGIN
  v_is_admin := private.is_admin();
  v_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- Lock Parent Booking FOR UPDATE
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  -- Validate Ownership
  IF NOT (v_is_admin OR (v_booking.artist_id IS NOT NULL AND v_booking.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวนี้' USING ERRCODE = '42501';
  END IF;

  -- Idempotency Guard
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
    RAISE EXCEPTION 'ไม่สามารถจบงานจากสถานะ % ได้ (คิวงานต้องอยู่ในสถานะยืนยันแล้วหรือกำลังดำเนินการ)', v_booking.status USING ERRCODE = '22023';
  END IF;

  -- Validate Linked Estimate Request & Actual Tattoo Price (quoted_price)
  IF v_booking.estimate_request_id IS NOT NULL THEN
    SELECT e.quoted_price INTO v_quoted_price
    FROM public.estimate_requests e
    WHERE e.id = v_booking.estimate_request_id;

    IF v_quoted_price IS NULL OR v_quoted_price <= 0 THEN
      RAISE EXCEPTION 'ACTUAL_PRICE_REQUIRED: กรุณาระบุราคางานก่อนเสร็จสิ้นงาน' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Count Total Sessions for Booking
  SELECT COUNT(*) INTO v_total_sessions
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  IF v_total_sessions = 0 THEN
    RAISE EXCEPTION 'ไม่พบรอบสักในคิวงานนี้' USING ERRCODE = 'P0001';
  END IF;

  IF v_total_sessions = 1 THEN
    -- RULE 1: Total sessions = 1 -> Update ONLY the single initial session to COMPLETED and Booking to COMPLETED in 1 transaction
    SELECT id INTO v_initial_session_id
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
    ORDER BY session_number ASC, created_at ASC
    LIMIT 1;

    UPDATE public.booking_sessions
    SET status = 'COMPLETED',
        completed_at = COALESCE(completed_at, pg_catalog.now()),
        updated_at = pg_catalog.now()
    WHERE id = v_initial_session_id;

    UPDATE public.bookings
    SET status = 'COMPLETED',
        updated_at = pg_catalog.now()
    WHERE id = p_booking_id;

  ELSE
    -- RULE 2: Total sessions > 1 -> Do NOT auto-complete any session. Check if any additional session is active.
    SELECT COUNT(*) INTO v_active_additional_sessions
    FROM public.booking_sessions
    WHERE booking_id = p_booking_id
      AND session_number > 1
      AND status IN ('SCHEDULED', 'IN_PROGRESS');

    IF v_active_additional_sessions > 0 THEN
      RAISE EXCEPTION 'กรุณาปิดรอบสักเพิ่มเติมให้ครบก่อนเสร็จสิ้นงาน' USING ERRCODE = '22023';
    END IF;

    UPDATE public.bookings
    SET status = 'COMPLETED',
        updated_at = pg_catalog.now()
    WHERE id = p_booking_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'status', 'COMPLETED'
  );
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. Core RPC: complete_booking(p_booking_id UUID) (Admin completion alias)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_booking(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN public.artist_complete_booking(p_booking_id);
END;
$$;

-- Permissions Lockdown
REVOKE ALL ON FUNCTION public.artist_complete_booking(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_complete_booking(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_complete_booking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_complete_booking(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.complete_booking(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_booking(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_booking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_booking(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
