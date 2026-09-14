-- ============================================================================
-- 157 TATTOO — PHASE 7B1: PRICE ENGINE INPUT FOUNDATION
-- Database columns & check constraints for BasePrice and Color Technique
-- ============================================================================

-- 1. Add base_price to artists table
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS base_price NUMERIC(10,2) DEFAULT NULL;

ALTER TABLE public.artists
  DROP CONSTRAINT IF EXISTS check_artists_base_price_positive;

ALTER TABLE public.artists
  ADD CONSTRAINT check_artists_base_price_positive
  CHECK (base_price IS NULL OR base_price > 0);

-- 2. Add color_technique to estimate_requests table
ALTER TABLE public.estimate_requests
  ADD COLUMN IF NOT EXISTS color_technique TEXT DEFAULT NULL;

ALTER TABLE public.estimate_requests
  DROP CONSTRAINT IF EXISTS check_estimate_requests_color_technique;

ALTER TABLE public.estimate_requests
  ADD CONSTRAINT check_estimate_requests_color_technique
  CHECK (color_technique IS NULL OR color_technique IN ('LINEWORK', 'BLACK_AND_GREY', 'FULL_COLOR'));
