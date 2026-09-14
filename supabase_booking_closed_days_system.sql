-- ============================================================================
-- 157 TATTOO — BOOKING CLOSED DAY / AVAILABILITY BLOCK SYSTEM MIGRATION
-- ============================================================================

BEGIN;

-- 1. Extend public.artist_blocked_dates Table for Studio and Artist Scope
ALTER TABLE public.artist_blocked_dates 
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'ARTIST';

ALTER TABLE public.artist_blocked_dates 
  ALTER COLUMN artist_id DROP NOT NULL;

ALTER TABLE public.artist_blocked_dates 
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Remove legacy constraints
ALTER TABLE public.artist_blocked_dates 
  DROP CONSTRAINT IF EXISTS unique_artist_blocked_date;

ALTER TABLE public.artist_blocked_dates 
  DROP CONSTRAINT IF EXISTS chk_availability_block_scope;

-- Add Scope Validation Constraint
ALTER TABLE public.artist_blocked_dates 
  ADD CONSTRAINT chk_availability_block_scope CHECK (
    scope IN ('STUDIO', 'ARTIST') AND (
      (scope = 'STUDIO' AND artist_id IS NULL) OR 
      (scope = 'ARTIST' AND artist_id IS NOT NULL)
    )
  );

-- Create partial unique indexes for Studio & Artist blocks
DROP INDEX IF EXISTS public.idx_unique_studio_blocked_date;
CREATE UNIQUE INDEX idx_unique_studio_blocked_date 
  ON public.artist_blocked_dates (blocked_date) 
  WHERE scope = 'STUDIO';

DROP INDEX IF EXISTS public.idx_unique_artist_blocked_date;
CREATE UNIQUE INDEX idx_unique_artist_blocked_date 
  ON public.artist_blocked_dates (artist_id, blocked_date) 
  WHERE scope = 'ARTIST';

-- 2. RLS Security Lockdown
ALTER TABLE public.artist_blocked_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read blocked dates for availability" ON public.artist_blocked_dates;
CREATE POLICY "Public read blocked dates for availability"
ON public.artist_blocked_dates
FOR SELECT
TO PUBLIC
USING (true);

DROP POLICY IF EXISTS "Admin insert blocked dates" ON public.artist_blocked_dates;
CREATE POLICY "Admin insert blocked dates"
ON public.artist_blocked_dates
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_admin() OR (scope = 'ARTIST' AND artist_id = private.get_artist_id())
);

DROP POLICY IF EXISTS "Admin delete blocked dates" ON public.artist_blocked_dates;
CREATE POLICY "Admin delete blocked dates"
ON public.artist_blocked_dates
FOR DELETE
TO authenticated
USING (
  private.is_admin() OR (scope = 'ARTIST' AND artist_id = private.get_artist_id())
);

-- 3. RPC: admin_set_availability_block
CREATE OR REPLACE FUNCTION public.admin_set_availability_block(
  p_date DATE,
  p_scope TEXT DEFAULT 'STUDIO',
  p_artist_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_blocked BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only admins can manage booking availability blocks' USING ERRCODE = '42501';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'p_date is required' USING ERRCODE = '22004';
  END IF;

  IF p_scope NOT IN ('STUDIO', 'ARTIST') THEN
    RAISE EXCEPTION 'p_scope must be STUDIO or ARTIST' USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'ARTIST' AND p_artist_id IS NULL THEN
    RAISE EXCEPTION 'p_artist_id is required when scope is ARTIST' USING ERRCODE = '22004';
  END IF;

  v_user_id := auth.uid();

  IF p_blocked IS TRUE THEN
    IF p_scope = 'STUDIO' THEN
      INSERT INTO public.artist_blocked_dates (scope, artist_id, blocked_date, reason, created_by)
      VALUES ('STUDIO', NULL, p_date, p_reason, v_user_id)
      ON CONFLICT (blocked_date) WHERE scope = 'STUDIO'
      DO UPDATE SET reason = EXCLUDED.reason, created_at = pg_catalog.now();
    ELSE
      INSERT INTO public.artist_blocked_dates (scope, artist_id, blocked_date, reason, created_by)
      VALUES ('ARTIST', p_artist_id, p_date, p_reason, v_user_id)
      ON CONFLICT (artist_id, blocked_date) WHERE scope = 'ARTIST'
      DO UPDATE SET reason = EXCLUDED.reason, created_at = pg_catalog.now();
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'blocked', true,
      'date', p_date,
      'scope', p_scope,
      'message', 'Availability block applied successfully'
    );
  ELSE
    IF p_scope = 'STUDIO' THEN
      DELETE FROM public.artist_blocked_dates
      WHERE scope = 'STUDIO' AND blocked_date = p_date;
    ELSE
      DELETE FROM public.artist_blocked_dates
      WHERE scope = 'ARTIST' AND artist_id = p_artist_id AND blocked_date = p_date;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'blocked', false,
      'date', p_date,
      'scope', p_scope,
      'message', 'Availability block removed successfully'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_availability_block(DATE, TEXT, UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_availability_block(DATE, TEXT, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_availability_block(DATE, TEXT, UUID, TEXT, BOOLEAN) TO service_role;

-- 4. Update get_artist_busy_ranges RPC
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
  IF p_artist_id IS NULL THEN
    RAISE EXCEPTION 'p_artist_id is required' USING ERRCODE = '22004';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date are required' USING ERRCODE = '22004';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'p_end_date cannot be earlier than p_start_date' USING ERRCODE = '22023';
  END IF;

  v_range_start := (p_start_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;
  v_range_end := ((p_end_date + 1)::TEXT || ' 00:00:00+07')::TIMESTAMPTZ;

  RETURN QUERY
  -- Active Scheduled Sessions
  SELECT
    s.start_at,
    s.end_at
  FROM public.booking_sessions s
  WHERE s.artist_id = p_artist_id
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND s.start_at < v_range_end
    AND s.end_at > v_range_start

  UNION ALL

  -- Studio-wide Blocked Dates
  SELECT
    (b.blocked_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ AS start_at,
    ((b.blocked_date + 1)::TEXT || ' 00:00:00+07')::TIMESTAMPTZ AS end_at
  FROM public.artist_blocked_dates b
  WHERE b.scope = 'STUDIO'
    AND b.blocked_date >= p_start_date
    AND b.blocked_date <= p_end_date

  UNION ALL

  -- Artist-specific Blocked Dates
  SELECT
    (b.blocked_date::TEXT || ' 00:00:00+07')::TIMESTAMPTZ AS start_at,
    ((b.blocked_date + 1)::TEXT || ' 00:00:00+07')::TIMESTAMPTZ AS end_at
  FROM public.artist_blocked_dates b
  WHERE (b.scope IS NULL OR b.scope = 'ARTIST')
    AND b.artist_id = p_artist_id
    AND b.blocked_date >= p_start_date
    AND b.blocked_date <= p_end_date

  ORDER BY start_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO anon;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO service_role;

COMMIT;
