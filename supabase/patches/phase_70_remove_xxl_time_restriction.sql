-- ============================================================================
-- Phase 70: Remove Size XXL 10:00 AM Time Restriction
-- Updates calculate_tattoo_session_end_time to allow any start time between 10:00 and 23:00 for Size XXL
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_tattoo_session_end_time(
  p_start_time TIME,
  p_size_tier TEXT DEFAULT NULL,
  p_width NUMERIC DEFAULT NULL,
  p_height NUMERIC DEFAULT NULL,
  p_raw_text TEXT DEFAULT NULL
)
RETURNS TIME
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_tier TEXT;
  v_mins INT;
  v_start_mins INT;
  v_end_mins INT;
  v_end_h INT;
  v_end_m INT;
BEGIN
  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'p_start_time is required' USING ERRCODE = '22004';
  END IF;

  -- 1. Determine Size Tier
  v_tier := COALESCE(UPPER(TRIM(p_size_tier)), '');

  IF v_tier = 'XXL' OR v_tier = 'FULL_PROJECT' OR v_tier LIKE '%XXL%' OR v_tier LIKE '%A4%' THEN
    v_tier := 'XXL';
  ELSIF (p_width IS NOT NULL AND p_height IS NOT NULL AND p_width > 0 AND p_height > 0) THEN
    IF (LEAST(p_width, p_height) >= 20 AND GREATEST(p_width, p_height) >= 28) OR GREATEST(p_width, p_height) > 25 THEN
      v_tier := 'XXL';
    ELSIF (LEAST(p_width, p_height) = 15 AND GREATEST(p_width, p_height) = 25) OR GREATEST(p_width, p_height) > 15 THEN
      v_tier := 'XL';
    ELSIF (LEAST(p_width, p_height) = 10 AND GREATEST(p_width, p_height) = 15) OR GREATEST(p_width, p_height) > 10 THEN
      v_tier := 'L';
    ELSIF (LEAST(p_width, p_height) = 5 AND GREATEST(p_width, p_height) = 10) OR GREATEST(p_width, p_height) > 5 THEN
      v_tier := 'M';
    ELSE
      v_tier := 'S';
    END IF;
  ELSIF v_tier = 'XL' THEN
    v_tier := 'XL';
  ELSIF v_tier = 'L' OR v_tier = 'LARGE' THEN
    v_tier := 'L';
  ELSIF v_tier = 'M' OR v_tier = 'SMALL_MED' THEN
    v_tier := 'M';
  ELSIF v_tier = 'S' OR v_tier = 'MICRO' THEN
    v_tier := 'S';
  ELSIF p_raw_text IS NOT NULL AND p_raw_text <> '' THEN
    IF LOWER(p_raw_text) LIKE '%xxl%' OR LOWER(p_raw_text) LIKE '%a4%' OR (LOWER(p_raw_text) LIKE '%21%' AND LOWER(p_raw_text) LIKE '%30%') THEN
      v_tier := 'XXL';
    ELSIF LOWER(p_raw_text) LIKE '%xl%' THEN
      v_tier := 'XL';
    ELSIF LOWER(p_raw_text) LIKE '%size l%' OR (LOWER(p_raw_text) LIKE '%10%' AND LOWER(p_raw_text) LIKE '%15%') THEN
      v_tier := 'L';
    ELSIF LOWER(p_raw_text) LIKE '%size m%' OR (LOWER(p_raw_text) LIKE '%5%' AND LOWER(p_raw_text) LIKE '%10%') THEN
      v_tier := 'M';
    ELSIF LOWER(p_raw_text) LIKE '%size s%' OR LOWER(p_raw_text) LIKE '%5x5%' OR LOWER(p_raw_text) LIKE '%5 × 5%' THEN
      v_tier := 'S';
    ELSE
      v_tier := 'M';
    END IF;
  ELSE
    v_tier := 'M';
  END IF;

  -- 2. Determine blocking duration in minutes
  IF v_tier = 'XXL' OR v_tier = 'XL' THEN
    v_mins := 360; -- 6 hours
  ELSIF v_tier = 'L' THEN
    v_mins := 240; -- 4 hours
  ELSIF v_tier = 'M' THEN
    v_mins := 120; -- 2 hours
  ELSE
    v_mins := 60;  -- 1 hour (Size S)
  END IF;

  -- 3. Calculate start minutes and end minutes
  v_start_mins := EXTRACT(HOUR FROM p_start_time)::INT * 60 + EXTRACT(MINUTE FROM p_start_time)::INT;

  IF v_start_mins < (10 * 60) OR v_start_mins >= (23 * 60) THEN
    RAISE EXCEPTION 'Start time % must be between 10:00 and 23:00', p_start_time USING ERRCODE = '22023';
  END IF;

  v_end_mins := LEAST(23 * 60, v_start_mins + v_mins);

  v_end_h := v_end_mins / 60;
  v_end_m := v_end_mins % 60;

  RETURN (LPAD(v_end_h::TEXT, 2, '0') || ':' || LPAD(v_end_m::TEXT, 2, '0') || ':00')::TIME;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_tattoo_session_end_time(TIME, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_tattoo_session_end_time(TIME, TEXT, NUMERIC, NUMERIC, TEXT) TO authenticated, service_role;
