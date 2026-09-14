-- ============================================================================
-- 157 TATTOO — PHASE 7B2: PRICING RULES FOUNDATION
-- Database Rule Configuration for Price Estimation Engine
-- ============================================================================

-- 1. Create public.pricing_rules table
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  label TEXT NOT NULL,
  multiplier NUMERIC(8,3) NOT NULL,
  min_dimension_cm NUMERIC NULL,
  max_dimension_cm NUMERIC NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT check_pricing_rules_type CHECK (rule_type IN ('SIZE_TIER', 'COLOR_TECHNIQUE', 'WORK_TYPE')),
  CONSTRAINT check_pricing_rules_unique UNIQUE (rule_type, rule_key),
  CONSTRAINT check_pricing_rules_multiplier CHECK (multiplier > 0),
  CONSTRAINT check_pricing_rules_min_dimension CHECK (min_dimension_cm IS NULL OR min_dimension_cm >= 0),
  CONSTRAINT check_pricing_rules_max_dimension CHECK (max_dimension_cm IS NULL OR max_dimension_cm > 0),
  CONSTRAINT check_pricing_rules_dimension_range CHECK (
    min_dimension_cm IS NULL OR max_dimension_cm IS NULL OR max_dimension_cm > min_dimension_cm
  )
);

-- 2. Create public.pricing_settings table
CREATE TABLE IF NOT EXISTS public.pricing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  range_factor NUMERIC(6,3) NOT NULL,
  rounding_increment NUMERIC(10,2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT check_pricing_settings_range_factor CHECK (range_factor >= 1),
  CONSTRAINT check_pricing_settings_rounding_increment CHECK (rounding_increment > 0)
);

-- 3. Triggers for updated_at
DROP TRIGGER IF EXISTS trg_pricing_rules_updated_at ON public.pricing_rules;
CREATE TRIGGER trg_pricing_rules_updated_at
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_pricing_settings_updated_at ON public.pricing_settings;
CREATE TRIGGER trg_pricing_settings_updated_at
  BEFORE UPDATE ON public.pricing_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 4. Enable RLS & Configure SELECT Policies
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_rules_select_policy" ON public.pricing_rules;
CREATE POLICY "pricing_rules_select_policy" ON public.pricing_rules
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "pricing_settings_select_policy" ON public.pricing_settings;
CREATE POLICY "pricing_settings_select_policy" ON public.pricing_settings
  FOR SELECT USING (true);

-- 5. Seed Rules
INSERT INTO public.pricing_rules (rule_type, rule_key, label, multiplier, min_dimension_cm, max_dimension_cm, sort_order, is_active)
VALUES
  -- SIZE_TIER
  ('SIZE_TIER', 'MICRO', 'Micro / ไม่เกิน 5 ซม.', 1.000, 0, 5, 1, true),
  ('SIZE_TIER', 'SMALL_MED', 'Small–Medium / 6–15 ซม.', 1.500, 5, 15, 2, true),
  ('SIZE_TIER', 'LARGE', 'Large / 16–25 ซม.', 2.500, 15, 25, 3, true),
  ('SIZE_TIER', 'XL', 'Extra Large / 26–40 ซม.', 4.000, 25, 40, 4, true),
  ('SIZE_TIER', 'FULL_PROJECT', 'Full Project / มากกว่า 40 ซม.', 6.000, 40, NULL, 5, true),
  -- COLOR_TECHNIQUE
  ('COLOR_TECHNIQUE', 'LINEWORK', 'เส้น / Linework', 1.000, NULL, NULL, 1, true),
  ('COLOR_TECHNIQUE', 'BLACK_AND_GREY', 'ขาวดำและแรเงา', 1.200, NULL, NULL, 2, true),
  ('COLOR_TECHNIQUE', 'FULL_COLOR', 'งานสี', 1.400, NULL, NULL, 3, true),
  -- WORK_TYPE
  ('WORK_TYPE', 'NEW_TATTOO', 'งานสักใหม่', 1.000, NULL, NULL, 1, true),
  ('WORK_TYPE', 'REWORK', 'แก้ไข / ต่อเติมงานเดิม', 1.200, NULL, NULL, 2, true),
  ('WORK_TYPE', 'COVER_UP', 'Cover-up / สักทับงานเดิม', 1.500, NULL, NULL, 3, true),
  ('WORK_TYPE', 'SCAR_COVER', 'ปกปิดรอยแผลเป็น', 1.400, NULL, NULL, 4, true)
ON CONFLICT (rule_type, rule_key) DO UPDATE SET
  label = EXCLUDED.label,
  multiplier = EXCLUDED.multiplier,
  min_dimension_cm = EXCLUDED.min_dimension_cm,
  max_dimension_cm = EXCLUDED.max_dimension_cm,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- 6. Seed Global Settings
INSERT INTO public.pricing_settings (range_factor, rounding_increment, is_active)
SELECT 1.300, 100.00, true
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_settings);
