-- ============================================================================
-- 157 TATTOO — PHASE 84 MIGRATION (REVISED & HARDENED)
-- STRICT ฿500 DEPOSIT RULE, SECURITY AUTHORIZATION, AND VIEW HARDENING
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. HARDEN DATABASE TABLES: SET ALL DEPOSIT FIELDS & DEFAULTS TO 500.00
-- ----------------------------------------------------------------------------
ALTER TABLE public.flash_designs 
  ALTER COLUMN deposit_amount SET DEFAULT 500.00;

UPDATE public.flash_designs
SET deposit_amount = 500.00
WHERE deposit_amount IS NULL OR deposit_amount != 500.00;

UPDATE public.estimate_requests
SET deposit_required = 500.00
WHERE deposit_required IS NOT NULL AND deposit_required != 500.00;

-- ----------------------------------------------------------------------------
-- 2. RE-CREATE BOOKING_PAYMENT_SUMMARY VIEW (NO CASCADE DROP, WITH SECURITY INVOKER & HARDCODED 500.00)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.booking_payment_summary 
WITH (security_invoker = true) AS
SELECT 
    b.id AS booking_id,
    b.estimate_request_id,
    b.customer_user_id,
    b.artist_id,
    COALESCE(e.quoted_price, b.quoted_price, fd.price)::numeric(12,2) AS quoted_price,
    500.00::numeric(12,2) AS deposit_required,
    COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00)::numeric(12,2) AS paid_total,
    CASE
        WHEN COALESCE(e.quoted_price, b.quoted_price, fd.price) IS NULL THEN NULL::numeric(12,2)
        ELSE GREATEST(COALESCE(e.quoted_price, b.quoted_price, fd.price) - COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00), 0.00)::numeric(12,2)
    END AS remaining_balance,
    CASE
        WHEN COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) >= 500.00 THEN true
        ELSE false
    END AS deposit_paid,
    CASE
        WHEN COALESCE(e.quoted_price, b.quoted_price, fd.price) IS NULL OR COALESCE(e.quoted_price, b.quoted_price, fd.price) <= 0 THEN false
        ELSE COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) >= COALESCE(e.quoted_price, b.quoted_price, fd.price)
    END AS is_fully_paid
FROM public.bookings b
LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
LEFT JOIN public.flash_reservations fr ON fr.id = b.flash_reservation_id
LEFT JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
LEFT JOIN public.booking_payments bp ON bp.booking_id = b.id
GROUP BY b.id, b.estimate_request_id, b.customer_user_id, b.artist_id, b.quoted_price, e.quoted_price, fd.price;

-- Security Hardening: Revoke access from unauthenticated users (anon)
REVOKE ALL ON public.booking_payment_summary FROM PUBLIC, anon;
GRANT SELECT ON public.booking_payment_summary TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. RECONCILE DEPOSIT STATUS RPC: AUTHORIZATION CHECK, TERMINAL GUARDS & SAFE SESSION CREATION
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_booking_deposit_status(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_uid UUID;
  v_is_admin BOOLEAN;
  v_is_artist_owner BOOLEAN;
  v_is_customer_owner BOOLEAN;

  v_booking_status TEXT;
  v_estimate_request_id UUID;
  v_artist_id UUID;
  v_requested_date DATE;
  v_requested_start_time TIME;
  v_deposit_required CONSTANT NUMERIC(12,2) := 500.00;
  v_paid_total NUMERIC(12,2);
BEGIN
  v_caller_uid := auth.uid();
  v_is_admin := (
    COALESCE(auth.role(), '') = 'service_role' 
    OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role'
    OR (v_caller_uid IS NOT NULL AND private.is_admin())
  );

  -- Security Check: When invoked via direct RPC by authenticated user, verify caller authorization
  IF v_caller_uid IS NOT NULL AND NOT v_is_admin THEN
    SELECT 
      (b.customer_user_id = v_caller_uid),
      EXISTS (
        SELECT 1 FROM public.artists a 
        WHERE a.id = b.artist_id AND a.user_id = v_caller_uid
      )
    INTO v_is_customer_owner, v_is_artist_owner
    FROM public.bookings b
    WHERE b.id = p_booking_id;

    IF NOT (COALESCE(v_is_customer_owner, false) OR COALESCE(v_is_artist_owner, false)) THEN
      RAISE EXCEPTION 'Access denied: You are not authorized to reconcile booking %', p_booking_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Row lock booking to serialize concurrent reconciliations
  SELECT b.status, b.estimate_request_id, b.artist_id, b.requested_date, b.requested_start_time
  INTO v_booking_status, v_estimate_request_id, v_artist_id, v_requested_date, v_requested_start_time
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF v_booking_status IS NULL THEN
    RETURN;
  END IF;

  -- Strict Guard: Terminal and active work statuses CANNOT be altered by payment reconciliation
  IF v_booking_status IN ('EXPIRED', 'CANCELLED', 'REJECTED', 'COMPLETED', 'IN_PROGRESS') THEN
    RETURN;
  END IF;

  -- Calculate paid_total strictly from RECORDED payments under row lock
  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'RECORDED'), 0.00)
  INTO v_paid_total
  FROM public.booking_payments
  WHERE booking_id = p_booking_id;

  -- CASE A: Deposit satisfied (>= 500.00) -> transition to CONFIRMED
  IF v_booking_status IN ('PENDING', 'WAITING_DEPOSIT', 'APPROVED', 'ACCEPTED', 'QUOTED') THEN
    IF v_paid_total >= v_deposit_required THEN
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

      -- Safe Session Creation / Restoration
      IF NOT EXISTS (
        SELECT 1 FROM public.booking_sessions WHERE booking_id = p_booking_id
      ) THEN
        -- Create initial session if date/time requested
        IF v_requested_date IS NOT NULL AND v_requested_start_time IS NOT NULL THEN
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
            (v_requested_date::TEXT || ' ' || v_requested_start_time::TEXT || '+07')::TIMESTAMPTZ,
            (v_requested_date::TEXT || ' ' || v_requested_start_time::TEXT || '+07')::TIMESTAMPTZ + INTERVAL '2 hours',
            'SCHEDULED',
            pg_catalog.now(),
            pg_catalog.now()
          );
        END IF;
      ELSIF EXISTS (
        SELECT 1 FROM public.booking_sessions
        WHERE booking_id = p_booking_id AND status = 'SCHEDULED'
      ) THEN
        -- Session already active and scheduled, no duplicate created
        NULL;
      ELSE
        -- Session exists but was marked CANCELLED (e.g. during deposit void); restore session #1 to SCHEDULED
        UPDATE public.booking_sessions
        SET status = 'SCHEDULED',
            start_at = CASE
              WHEN v_requested_date IS NOT NULL AND v_requested_start_time IS NOT NULL
              THEN (v_requested_date::TEXT || ' ' || v_requested_start_time::TEXT || '+07')::TIMESTAMPTZ
              ELSE start_at
            END,
            end_at = CASE
              WHEN v_requested_date IS NOT NULL AND v_requested_start_time IS NOT NULL
              THEN (v_requested_date::TEXT || ' ' || v_requested_start_time::TEXT || '+07')::TIMESTAMPTZ + INTERVAL '2 hours'
              ELSE end_at
            END,
            updated_at = pg_catalog.now()
        WHERE booking_id = p_booking_id
          AND session_number = 1
          AND status NOT IN ('COMPLETED', 'IN_PROGRESS');
      END IF;

    END IF;

  -- CASE B: Deposit lost (due to VOID/refund) -> CONFIRMED -> WAITING_DEPOSIT (Guard in-progress / completed)
  ELSIF v_booking_status = 'CONFIRMED' THEN
    IF v_paid_total < v_deposit_required THEN
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

        IF v_estimate_request_id IS NOT NULL THEN
          UPDATE public.estimate_requests
          SET status = 'WAITING_DEPOSIT',
              updated_at = pg_catalog.now()
          WHERE id = v_estimate_request_id
            AND status IN ('CONFIRMED', 'ACCEPTED', 'APPROVED');
        END IF;

        UPDATE public.booking_sessions
        SET status = 'CANCELLED',
            updated_at = pg_catalog.now()
        WHERE booking_id = p_booking_id
          AND status = 'SCHEDULED';
      END IF;
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_booking_deposit_status(UUID) TO authenticated, service_role;

COMMIT;
