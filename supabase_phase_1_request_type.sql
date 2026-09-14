-- ============================================================================
-- 157 TATTOO — PHASE 1 MIGRATION: REQUEST TYPE DATABASE FOUNDATION
-- Add request_type column to public.estimate_requests
-- DEFAULT 'ESTIMATE', NOT NULL, CHECK (request_type IN ('ESTIMATE', 'DIRECT_BOOKING'))
-- Backward compatible with 100% preservation of existing estimate workflow.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'estimate_requests' 
      AND column_name = 'request_type'
  ) THEN
    ALTER TABLE public.estimate_requests
      ADD COLUMN request_type TEXT NOT NULL DEFAULT 'ESTIMATE';

    ALTER TABLE public.estimate_requests
      ADD CONSTRAINT estimate_request_type_check 
      CHECK (request_type IN ('ESTIMATE', 'DIRECT_BOOKING'));
  END IF;
END $$;
