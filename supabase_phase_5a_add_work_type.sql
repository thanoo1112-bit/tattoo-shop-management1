-- ============================================================================
-- 157 TATTOO — PHASE 5A MIGRATION: TATTOO WORK TYPE DATABASE FOUNDATION
-- Add work_type column to public.estimate_requests
-- NULLABLE (DEFAULT NULL), CHECK (work_type IS NULL OR work_type IN ('NEW_TATTOO', 'REWORK', 'COVER_UP', 'SCAR_COVER'))
-- Backward compatible with 100% preservation of existing records (work_type remains NULL).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'estimate_requests' 
      AND column_name = 'work_type'
  ) THEN
    ALTER TABLE public.estimate_requests
      ADD COLUMN work_type TEXT NULL;

    ALTER TABLE public.estimate_requests
      ADD CONSTRAINT check_estimate_requests_work_type 
      CHECK (work_type IS NULL OR work_type IN ('NEW_TATTOO', 'REWORK', 'COVER_UP', 'SCAR_COVER'));
  END IF;
END $$;
