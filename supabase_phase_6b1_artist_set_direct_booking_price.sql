-- 157 TATTOO — PHASE 6B1: ARTIST SET DIRECT BOOKING PRICE RPC
-- RPC: public.artist_set_direct_booking_price(p_booking_id UUID, p_quoted_price NUMERIC)

CREATE OR REPLACE FUNCTION public.artist_set_direct_booking_price(
  p_booking_id UUID,
  p_quoted_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_auth_uid UUID;
  v_artist_id UUID;
  v_booking RECORD;
  v_estimate RECORD;
BEGIN
  -- 1. Get authenticated user ID
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can perform this operation';
  END IF;

  -- 2. Resolve artist_id for current user
  SELECT id INTO v_artist_id
  FROM public.artists
  WHERE user_id = v_auth_uid AND is_active = true;

  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can perform this operation';
  END IF;

  -- 3. Fetch booking record
  SELECT id, artist_id, estimate_request_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- 4. Verify artist ownership
  IF v_booking.artist_id IS NULL OR v_booking.artist_id <> v_artist_id THEN
    RAISE EXCEPTION 'Unauthorized: You are not the assigned artist for this booking';
  END IF;

  -- 5. Verify allowed booking status (CONFIRMED or IN_PROGRESS only)
  IF v_booking.status NOT IN ('CONFIRMED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Invalid booking status for setting direct booking price. Must be CONFIRMED or IN_PROGRESS';
  END IF;

  -- 6. Fetch linked estimate_request
  SELECT id, request_type, deposit_required
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = v_booking.estimate_request_id;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'Linked estimate request not found';
  END IF;

  -- 7. Verify request_type is DIRECT_BOOKING only
  IF COALESCE(v_estimate.request_type, '') <> 'DIRECT_BOOKING' THEN
    RAISE EXCEPTION 'Price can only be set via this method for DIRECT_BOOKING requests';
  END IF;

  -- 8. Validate price parameters
  IF p_quoted_price IS NULL OR p_quoted_price <= 0 THEN
    RAISE EXCEPTION 'Price must be greater than zero';
  END IF;

  IF p_quoted_price < COALESCE(v_estimate.deposit_required, 0) THEN
    RAISE EXCEPTION 'Price must be greater than or equal to required deposit';
  END IF;

  -- 9. Update ONLY estimate_requests.quoted_price
  UPDATE public.estimate_requests
  SET quoted_price = p_quoted_price,
      updated_at = NOW()
  WHERE id = v_estimate.id;

  -- 10. Return minimal result JSON
  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'estimate_request_id', v_estimate.id,
    'quoted_price', p_quoted_price,
    'booking_status', v_booking.status
  );
END;
$$;

-- Security Grants
REVOKE EXECUTE ON FUNCTION public.artist_set_direct_booking_price(UUID, NUMERIC) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.artist_set_direct_booking_price(UUID, NUMERIC) TO authenticated;
