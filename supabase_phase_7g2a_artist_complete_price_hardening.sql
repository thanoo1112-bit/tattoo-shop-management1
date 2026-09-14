-- =============================================================================
-- 157 TATTOO — PHASE 7G2A MIGRATION
-- ARTIST COMPLETE BOOKING SERVER HARDENING (ACTUAL PRICE REQUIREMENT)
-- =============================================================================
-- Database Changes: public.artist_complete_booking RPC function ONLY.
-- NO table changes, NO column changes, NO RLS changes, NO constraint changes.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.artist_complete_booking(
  p_booking_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_booking RECORD;
  v_quoted_price NUMERIC(12,2);
  v_total_sessions INT;
  v_completed_sessions INT;
  v_active_sessions INT;
BEGIN
  -- 1. Identify Authenticated Active Artist
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can perform this operation'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Lock Parent Booking FOR UPDATE
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate Ownership
  IF v_booking.artist_id IS DISTINCT FROM v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the assigned artist for this booking'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Idempotency Guard (Historical COMPLETED records return clean status without price re-validation)
  IF v_booking.status = 'COMPLETED' THEN
    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'already_completed', true,
      'booking_id', p_booking_id,
      'status', 'COMPLETED'
    );
  END IF;

  -- 5. Status Eligibility Guard
  IF v_booking.status != 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Cannot complete booking % in % status; booking must be IN_PROGRESS', p_booking_id, v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Validate Linked Estimate Request & Actual Tattoo Price (quoted_price)
  IF v_booking.estimate_request_id IS NULL THEN
    RAISE EXCEPTION 'BOOKING_ESTIMATE_REQUEST_NOT_FOUND: booking % has no linked estimate request', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT e.quoted_price INTO v_quoted_price
  FROM public.estimate_requests e
  WHERE e.id = v_booking.estimate_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_ESTIMATE_REQUEST_NOT_FOUND: linked estimate request % not found for booking %', v_booking.estimate_request_id, p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_quoted_price IS NULL OR v_quoted_price <= 0 THEN
    RAISE EXCEPTION 'ACTUAL_PRICE_REQUIRED: actual tattoo price (quoted_price) has not been set for booking %', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Validate Session State Counts
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'COMPLETED'),
    COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'IN_PROGRESS'))
  INTO v_total_sessions, v_completed_sessions, v_active_sessions
  FROM public.booking_sessions
  WHERE booking_id = p_booking_id;

  IF v_total_sessions = 0 THEN
    RAISE EXCEPTION 'Cannot complete booking %: no sessions found', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_completed_sessions = 0 THEN
    RAISE EXCEPTION 'Cannot complete booking %: at least one session must be COMPLETED', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_active_sessions > 0 THEN
    RAISE EXCEPTION 'Cannot complete booking %: all scheduled or in-progress sessions must be completed or cancelled first', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- 8. Execute Transition (Trigger handles completed_at timestamp)
  UPDATE public.bookings
  SET status = 'COMPLETED'
  WHERE id = p_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'booking_status', 'COMPLETED'
  );
END;
$$;

-- Permissions Lockdown (Least Privilege)
REVOKE ALL ON FUNCTION public.artist_complete_booking(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_complete_booking(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_complete_booking(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_complete_booking(UUID) TO service_role;

COMMIT;
