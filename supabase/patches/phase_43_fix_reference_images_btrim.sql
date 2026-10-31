-- ============================================================================
-- 157 TATTOO — PHASE 43 MIGRATION
-- FIX REFERENCE IMAGES HELPER FUNCTION USING BTRIM INSTEAD OF TRIM
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Helper Function: private.safe_parse_reference_images_array
-- Replaces pg_catalog.trim with pg_catalog.btrim to prevent PostgreSQL error 42883
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.safe_parse_reference_images_array(p_val TEXT)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_trimmed TEXT;
  v_json JSONB;
BEGIN
  IF p_val IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  v_trimmed := pg_catalog.btrim(p_val);

  IF v_trimmed = '' OR v_trimmed = 'null' OR v_trimmed = '[]' THEN
    RETURN '[]'::jsonb;
  END IF;

  BEGIN
    v_json := v_trimmed::jsonb;
    IF pg_catalog.jsonb_typeof(v_json) = 'array' THEN
      RETURN v_json;
    ELSE
      RETURN pg_catalog.jsonb_build_array(v_json);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Raw TEXT, UUID, or non-JSON string fallback
    RETURN pg_catalog.jsonb_build_array(v_trimmed);
  END;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
