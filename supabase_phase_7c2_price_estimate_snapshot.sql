-- ============================================================================
-- 157 TATTOO — PHASE 7C2: PRICE ESTIMATE SNAPSHOT FOUNDATION
-- Add price estimate snapshot fields & integrity constraints to estimate_requests
-- ============================================================================

-- 1. Add Snapshot Columns to estimate_requests
ALTER TABLE public.estimate_requests
  ADD COLUMN IF NOT EXISTS estimated_min_price NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_max_price NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_base_price_snapshot NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_size_tier TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_size_multiplier NUMERIC(8,3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_color_multiplier NUMERIC(8,3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_work_type_multiplier NUMERIC(8,3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_range_factor NUMERIC(6,3) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_rounding_increment NUMERIC(10,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS price_estimated_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Drop existing constraints if re-applying
ALTER TABLE public.estimate_requests
  DROP CONSTRAINT IF EXISTS check_estimate_requests_snapshot_min_max_pair,
  DROP CONSTRAINT IF EXISTS check_estimate_requests_snapshot_size_tier,
  DROP CONSTRAINT IF EXISTS check_estimate_requests_snapshot_base_price,
  DROP CONSTRAINT IF EXISTS check_estimate_requests_snapshot_size_multiplier,
  DROP CONSTRAINT IF EXISTS check_estimate_requests_snapshot_color_multiplier,
  DROP CONSTRAINT IF EXISTS check_estimate_requests_snapshot_work_type_multiplier,
  DROP CONSTRAINT IF EXISTS check_estimate_requests_snapshot_range_factor,
  DROP CONSTRAINT IF EXISTS check_estimate_requests_snapshot_rounding_increment,
  DROP CONSTRAINT IF EXISTS check_estimate_requests_snapshot_group_integrity;

-- 3. Add Integrity Constraints
ALTER TABLE public.estimate_requests
  ADD CONSTRAINT check_estimate_requests_snapshot_min_max_pair
  CHECK (
    (estimated_min_price IS NULL AND estimated_max_price IS NULL)
    OR
    (estimated_min_price IS NOT NULL AND estimated_max_price IS NOT NULL AND estimated_min_price > 0 AND estimated_max_price >= estimated_min_price)
  ),

  ADD CONSTRAINT check_estimate_requests_snapshot_size_tier
  CHECK (
    estimated_size_tier IS NULL
    OR estimated_size_tier IN ('MICRO', 'SMALL_MED', 'LARGE', 'XL', 'FULL_PROJECT')
  ),

  ADD CONSTRAINT check_estimate_requests_snapshot_base_price
  CHECK (
    estimated_base_price_snapshot IS NULL OR estimated_base_price_snapshot > 0
  ),

  ADD CONSTRAINT check_estimate_requests_snapshot_size_multiplier
  CHECK (
    estimated_size_multiplier IS NULL OR estimated_size_multiplier > 0
  ),

  ADD CONSTRAINT check_estimate_requests_snapshot_color_multiplier
  CHECK (
    estimated_color_multiplier IS NULL OR estimated_color_multiplier > 0
  ),

  ADD CONSTRAINT check_estimate_requests_snapshot_work_type_multiplier
  CHECK (
    estimated_work_type_multiplier IS NULL OR estimated_work_type_multiplier > 0
  ),

  ADD CONSTRAINT check_estimate_requests_snapshot_range_factor
  CHECK (
    estimated_range_factor IS NULL OR estimated_range_factor >= 1
  ),

  ADD CONSTRAINT check_estimate_requests_snapshot_rounding_increment
  CHECK (
    estimated_rounding_increment IS NULL OR estimated_rounding_increment > 0
  ),

  ADD CONSTRAINT check_estimate_requests_snapshot_group_integrity
  CHECK (
    (
      estimated_min_price IS NULL
      AND estimated_max_price IS NULL
      AND estimated_base_price_snapshot IS NULL
      AND estimated_size_tier IS NULL
      AND estimated_size_multiplier IS NULL
      AND estimated_color_multiplier IS NULL
      AND estimated_work_type_multiplier IS NULL
      AND estimated_range_factor IS NULL
      AND estimated_rounding_increment IS NULL
      AND price_estimated_at IS NULL
    )
    OR
    (
      estimated_min_price IS NOT NULL
      AND estimated_max_price IS NOT NULL
      AND estimated_base_price_snapshot IS NOT NULL
      AND estimated_size_tier IS NOT NULL
      AND estimated_size_multiplier IS NOT NULL
      AND estimated_color_multiplier IS NOT NULL
      AND estimated_work_type_multiplier IS NOT NULL
      AND estimated_range_factor IS NOT NULL
      AND estimated_rounding_increment IS NOT NULL
      AND price_estimated_at IS NOT NULL
    )
  );
