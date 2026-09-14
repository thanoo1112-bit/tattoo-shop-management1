-- ============================================================================
-- 157 TATTOO — PHASE 7B2.1: PRICING CONFIGURATION INTEGRITY
-- Database Hardening for Pricing Rules & Settings
-- ============================================================================

-- 1. Enforce single active pricing settings row using Partial Unique Index
CREATE UNIQUE INDEX IF NOT EXISTS ux_pricing_settings_single_active
  ON public.pricing_settings (is_active)
  WHERE is_active = TRUE;

-- 2. Non-Size Rule Dimension Safety Constraint
-- Ensures COLOR_TECHNIQUE and WORK_TYPE rules cannot store min_dimension_cm or max_dimension_cm
ALTER TABLE public.pricing_rules
  DROP CONSTRAINT IF EXISTS check_pricing_rules_non_size_dimension;

ALTER TABLE public.pricing_rules
  ADD CONSTRAINT check_pricing_rules_non_size_dimension
  CHECK (rule_type = 'SIZE_TIER' OR (min_dimension_cm IS NULL AND max_dimension_cm IS NULL));

-- 3. Size Rule Minimum Required Constraint
-- Ensures SIZE_TIER rules always specify min_dimension_cm (max_dimension_cm can be NULL for open-ended final tier)
ALTER TABLE public.pricing_rules
  DROP CONSTRAINT IF EXISTS check_pricing_rules_size_min_required;

ALTER TABLE public.pricing_rules
  ADD CONSTRAINT check_pricing_rules_size_min_required
  CHECK (rule_type != 'SIZE_TIER' OR min_dimension_cm IS NOT NULL);
