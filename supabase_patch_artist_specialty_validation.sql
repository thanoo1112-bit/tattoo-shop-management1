-- ============================================================================
-- 157 TATTOO — ARTIST SPECIALTY DATABASE VALIDATION PATCH (REVISED)
-- 
-- Enforces that estimate_requests.style ∈ artists.specialties for the selected artist
-- Runs as a PostgreSQL BEFORE INSERT OR UPDATE OF artist_id, style TRIGGER
-- Cannot be bypassed by Client DevTools, REST API calls, or Direct Supabase mutations
-- ============================================================================

BEGIN;

-- 1. Create or Replace Validation Function
CREATE OR REPLACE FUNCTION public.validate_estimate_request_artist_specialty()
RETURNS TRIGGER AS $$
DECLARE
  v_specialties TEXT[];
  v_is_active BOOLEAN;
  v_is_visible BOOLEAN;
  v_match BOOLEAN := false;
  v_trimmed_style TEXT;
  v_item TEXT;
BEGIN
  -- A. Ensure artist_id is provided
  IF NEW.artist_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาเลือกช่างสักที่ต้องการ' USING ERRCODE = '23502';
  END IF;

  -- B. Ensure style is provided and not empty / whitespace
  IF NEW.style IS NULL OR pg_catalog.btrim(NEW.style) = '' THEN
    RAISE EXCEPTION 'กรุณาเลือกสไตล์งานสัก' USING ERRCODE = '23514';
  END IF;

  v_trimmed_style := pg_catalog.btrim(NEW.style);
  NEW.style := v_trimmed_style;

  -- C. Fetch selected artist directly from database authority (specialties TEXT[])
  SELECT specialties, is_active, is_visible
  INTO v_specialties, v_is_active, v_is_visible
  FROM public.artists
  WHERE id = NEW.artist_id;

  -- D. Verify artist existence
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลช่างสักที่ระบุในระบบ' USING ERRCODE = '23503';
  END IF;

  -- E. Verify artist active and visible status
  IF NOT (COALESCE(v_is_active, false) AND COALESCE(v_is_visible, false)) THEN
    RAISE EXCEPTION 'ช่างสักที่เลือกไม่พร้อมให้บริการในขณะนี้' USING ERRCODE = '23514';
  END IF;

  -- F. Validate style against artist specialties array (Source of Truth)
  IF v_specialties IS NOT NULL AND pg_catalog.array_length(v_specialties, 1) > 0 THEN
    FOREACH v_item IN ARRAY v_specialties LOOP
      IF pg_catalog.btrim(v_item) = v_trimmed_style THEN
        v_match := true;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  -- G. Enforce strict match
  IF NOT v_match THEN
    RAISE EXCEPTION 'สไตล์งานสักที่เลือกไม่ตรงกับช่างสัก กรุณาเลือกใหม่' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 2. Revoke public/anon execute privileges
REVOKE ALL ON FUNCTION public.validate_estimate_request_artist_specialty() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_estimate_request_artist_specialty() FROM anon;
REVOKE ALL ON FUNCTION public.validate_estimate_request_artist_specialty() FROM authenticated;

-- 3. Attach BEFORE Trigger to public.estimate_requests
DROP TRIGGER IF EXISTS trig_00_estimate_validate_artist_specialty ON public.estimate_requests;
CREATE TRIGGER trig_00_estimate_validate_artist_specialty
  BEFORE INSERT OR UPDATE OF artist_id, style ON public.estimate_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_estimate_request_artist_specialty();

COMMIT;
