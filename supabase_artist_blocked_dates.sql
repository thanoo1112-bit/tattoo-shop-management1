-- ============================================================================
-- 157 TATTOO — ARTIST DAILY BLOCK/UNBLOCK DATE MIGRATION
-- ============================================================================

BEGIN;

-- 1. Create public.artist_blocked_dates Table
CREATE TABLE IF NOT EXISTS public.artist_blocked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  blocked_date DATE NOT NULL,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT unique_artist_blocked_date UNIQUE (artist_id, blocked_date)
);

-- Index for fast artist date lookup
CREATE INDEX IF NOT EXISTS idx_artist_blocked_dates_lookup 
ON public.artist_blocked_dates (artist_id, blocked_date);

-- Enable RLS
ALTER TABLE public.artist_blocked_dates ENABLE ROW LEVEL SECURITY;

-- Revoke default public access
REVOKE ALL ON public.artist_blocked_dates FROM PUBLIC;
REVOKE ALL ON public.artist_blocked_dates FROM anon;
REVOKE ALL ON public.artist_blocked_dates FROM authenticated;

-- Grant SELECT/INSERT/DELETE permissions
GRANT SELECT ON public.artist_blocked_dates TO anon;
GRANT SELECT, INSERT, DELETE ON public.artist_blocked_dates TO authenticated;
GRANT ALL ON public.artist_blocked_dates TO service_role;

-- RLS Policies
DROP POLICY IF EXISTS "Public read blocked dates for availability" ON public.artist_blocked_dates;
CREATE POLICY "Public read blocked dates for availability"
ON public.artist_blocked_dates
FOR SELECT
TO PUBLIC
USING (true);

DROP POLICY IF EXISTS "Artist insert own blocked dates" ON public.artist_blocked_dates;
CREATE POLICY "Artist insert own blocked dates"
ON public.artist_blocked_dates
FOR INSERT
TO authenticated
WITH CHECK (
  artist_id = private.get_artist_id() OR private.is_admin()
);

DROP POLICY IF EXISTS "Artist delete own blocked dates" ON public.artist_blocked_dates;
CREATE POLICY "Artist delete own blocked dates"
ON public.artist_blocked_dates
FOR DELETE
TO authenticated
USING (
  artist_id = private.get_artist_id() OR private.is_admin()
);

-- ----------------------------------------------------------------------------
-- 2. RPC: artist_set_day_block
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_set_day_block(
  p_date DATE,
  p_blocked BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_id UUID;
  v_today_bkk DATE;
  v_active_session_count INT;
  v_active_booking_count INT;
BEGIN
  -- 1. Authorization: Resolve artist_id from authenticated user session
  v_artist_id := private.get_artist_id();
  IF v_artist_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Only active authenticated artists can manage date blocks' USING ERRCODE = '42501';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'p_date is required' USING ERRCODE = '22004';
  END IF;

  -- 2. Validate Past Date (Bangkok Timezone)
  v_today_bkk := (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE;
  IF p_date < v_today_bkk THEN
    RAISE EXCEPTION 'Cannot block or unblock past dates (requested: %, today: %)', p_date, v_today_bkk
      USING ERRCODE = '22023';
  END IF;

  -- 3. Execute Block / Unblock Logic
  IF p_blocked IS TRUE THEN
    -- Check if date already has active sessions for this artist
    SELECT COUNT(*) INTO v_active_session_count
    FROM public.booking_sessions s
    WHERE s.artist_id = v_artist_id
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_date;

    IF v_active_session_count > 0 THEN
      RAISE EXCEPTION 'Cannot block date % because it has active scheduled sessions', p_date
        USING ERRCODE = '22023';
    END IF;

    -- Check if date already has confirmed/active bookings for this artist
    SELECT COUNT(*) INTO v_active_booking_count
    FROM public.bookings b
    WHERE b.artist_id = v_artist_id
      AND b.status IN ('CONFIRMED', 'IN_PROGRESS', 'WAITING_DEPOSIT')
      AND (b.requested_date = p_date);

    IF v_active_booking_count > 0 THEN
      RAISE EXCEPTION 'Cannot block date % because it has active bookings', p_date
        USING ERRCODE = '22023';
    END IF;

    -- Safe Insert with ON CONFLICT
    INSERT INTO public.artist_blocked_dates (artist_id, blocked_date, reason)
    VALUES (v_artist_id, p_date, p_reason)
    ON CONFLICT (artist_id, blocked_date)
    DO UPDATE SET reason = EXCLUDED.reason, created_at = pg_catalog.now();

    RETURN jsonb_build_object(
      'success', true,
      'blocked', true,
      'date', p_date,
      'message', 'Date blocked successfully'
    );
  ELSE
    -- Unblock date
    DELETE FROM public.artist_blocked_dates
    WHERE artist_id = v_artist_id
      AND blocked_date = p_date;

    RETURN jsonb_build_object(
      'success', true,
      'blocked', false,
      'date', p_date,
      'message', 'Date unblocked successfully'
    );
  END IF;
END;
$$;

-- Permissions lockdown for artist_set_day_block
REVOKE ALL ON FUNCTION public.artist_set_day_block(DATE, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_set_day_block(DATE, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_set_day_block(DATE, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_set_day_block(DATE, BOOLEAN, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Update get_artist_busy_ranges RPC to include Blocked Dates
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_artist_busy_ranges(
  p_artist_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_range_start TIMESTAMPTZ;
  v_range_end TIMESTAMPTZ;
BEGIN
  -- 1. Validate Input Nullability
  IF p_artist_id IS NULL THEN
    RAISE EXCEPTION 'p_artist_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date are required' USING ERRCODE = '22004';
  END IF;

  -- 2. Validate Range Bounds
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'p_end_date (%) cannot be earlier than p_start_date (%)', p_end_date, p_start_date
      USING ERRCODE = '22023';
  END IF;

  -- 3. Maximum Query Range Limit (62 Days)
  IF (p_end_date - p_start_date) > 62 THEN
    RAISE EXCEPTION 'Query date range cannot exceed 62 days (requested: % days)', (p_end_date - p_start_date)
      USING ERRCODE = '22023';
  END IF;

  -- 4. Validate Artist Existence
  IF NOT EXISTS (
    SELECT 1 FROM public.artists
    WHERE id = p_artist_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Artist with ID % not found or inactive', p_artist_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 5. Calculate Bangkok (+07:00) Timezone Boundaries (End-Exclusive)
  v_range_start := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
  v_range_end := ((p_end_date + 1)::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;

  -- 6. Query Busy Sessions AND Blocked Dates (Half-open range: [blocked_date 00:00+07, blocked_date+1 00:00+07))
  RETURN QUERY
  SELECT
    s.start_at,
    s.end_at
  FROM public.booking_sessions s
  WHERE s.artist_id = p_artist_id
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND s.start_at < v_range_end
    AND s.end_at > v_range_start

  UNION ALL

  SELECT
    (b.blocked_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ AS start_at,
    ((b.blocked_date + 1)::TEXT || ' 00:00:00+07')::TIMESTAMPTZ AS end_at
  FROM public.artist_blocked_dates b
  WHERE b.artist_id = p_artist_id
    AND b.blocked_date >= p_start_date
    AND b.blocked_date <= p_end_date

  ORDER BY start_at ASC;
END;
$$;

-- Permissions lockdown for get_artist_busy_ranges
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO service_role;

COMMIT;
