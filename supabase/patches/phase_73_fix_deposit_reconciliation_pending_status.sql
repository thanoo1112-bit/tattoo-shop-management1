-- ============================================================================
-- 157 TATTOO — PHASE 73 MIGRATION
-- FIX DEPOSIT RECONCILIATION FOR PENDING & QUOTED BOOKING STATUSES
-- ============================================================================

BEGIN;

-- Update reconcile_booking_deposit_status to include PENDING & QUOTED booking statuses
CREATE OR REPLACE FUNCTION public.reconcile_booking_deposit_status(p_booking_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_booking_status TEXT;
  v_estimate_request_id UUID;
  v_artist_id UUID;
  v_requested_date DATE;
  v_requested_start_time TIME;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
BEGIN
  -- Row lock booking to serialize concurrent reconciliations
  SELECT b.status, b.estimate_request_id, b.artist_id, b.requested_date, b.requested_start_time, COALESCE(e.deposit_required, 500.00)
  INTO v_booking_status, v_estimate_request_id, v_artist_id, v_requested_date, v_requested_start_time, v_deposit_required
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

COMMIT;
