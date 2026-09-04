-- ============================================================================
-- 157 TATTOO — PHASE 2E-B MIGRATION
-- PRIVACY-SAFE ARTIST AVAILABILITY RPC
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Create Privacy-Safe RPC: get_artist_busy_ranges
-- ----------------------------------------------------------------------------
-- Returns ONLY start_at and end_at timestamps for SCHEDULED and IN_PROGRESS sessions.
-- Zero PII, Zero Customer IDs, Zero Booking IDs, Zero Price/Notes.
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

  -- 6. Query Busy Sessions (SCHEDULED or IN_PROGRESS only) with Time Overlap Logic
  RETURN QUERY
  SELECT
    s.start_at,
    s.end_at
  FROM public.booking_sessions s
  WHERE s.artist_id = p_artist_id
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND s.start_at < v_range_end
    AND s.end_at > v_range_start
  ORDER BY s.start_at ASC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Secure RPC Permissions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM anon;

GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Schema Cache Reload Notification
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
