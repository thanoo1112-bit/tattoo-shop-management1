-- ============================================================================
-- 157 TATTOO — PHASE 7C1: SERVER-SIDE PRICE CALCULATION ENGINE
-- RPC Function: public.calculate_tattoo_price_estimate
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_tattoo_price_estimate(
  p_artist_id UUID,
  p_width_cm NUMERIC,
  p_height_cm NUMERIC,
  p_color_technique TEXT,
  p_work_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_artist_exists BOOLEAN;
  v_artist_is_active BOOLEAN;
  v_base_price NUMERIC(10,2);

  v_dimension NUMERIC;
  v_matching_size_count INTEGER;
  v_size_tier TEXT;
  v_size_label TEXT;
  v_size_multiplier NUMERIC(8,3);

  v_color_label TEXT;
  v_color_multiplier NUMERIC(8,3);

  v_work_label TEXT;
  v_work_multiplier NUMERIC(8,3);

  v_range_factor NUMERIC(6,3);
  v_rounding_increment NUMERIC(10,2);

  v_raw_min NUMERIC;
  v_raw_max NUMERIC;
  v_estimated_min NUMERIC;
  v_estimated_max NUMERIC;
BEGIN
  -- 1. Validate Artist
  SELECT EXISTS(SELECT 1 FROM public.artists WHERE id = p_artist_id),
         is_active,
         base_price
  INTO v_artist_exists, v_artist_is_active, v_base_price
  FROM public.artists
  WHERE id = p_artist_id;

  IF NOT FOUND OR v_artist_exists IS NOT TRUE OR v_artist_is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'ARTIST_NOT_AVAILABLE';
  END IF;

  -- 2. Validate Artist Base Price
  IF v_base_price IS NULL OR v_base_price <= 0 THEN
    RAISE EXCEPTION 'ARTIST_BASE_PRICE_NOT_CONFIGURED';
  END IF;

  -- 3. Validate Dimensions Input
  IF p_width_cm IS NULL OR p_width_cm <= 0 OR p_height_cm IS NULL OR p_height_cm <= 0 THEN
    RAISE EXCEPTION 'INVALID_TATTOO_DIMENSIONS';
  END IF;

  -- 4. Validate Color Technique Input & Rule
  IF p_color_technique IS NULL OR p_color_technique NOT IN ('LINEWORK', 'BLACK_AND_GREY', 'FULL_COLOR') THEN
    RAISE EXCEPTION 'INVALID_COLOR_TECHNIQUE';
  END IF;

  SELECT multiplier, label INTO v_color_multiplier, v_color_label
  FROM public.pricing_rules
  WHERE rule_type = 'COLOR_TECHNIQUE'
    AND rule_key = p_color_technique
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COLOR_PRICING_RULE_NOT_CONFIGURED';
  END IF;

  -- 5. Validate Work Type Input & Rule
  IF p_work_type IS NULL OR p_work_type NOT IN ('NEW_TATTOO', 'REWORK', 'COVER_UP', 'SCAR_COVER') THEN
    RAISE EXCEPTION 'INVALID_WORK_TYPE';
  END IF;

  SELECT multiplier, label INTO v_work_multiplier, v_work_label
  FROM public.pricing_rules
  WHERE rule_type = 'WORK_TYPE'
    AND rule_key = p_work_type
    AND is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WORK_TYPE_PRICING_RULE_NOT_CONFIGURED';
  END IF;

  -- 6. Match Size Tier Rule by Dimension (GREATEST(p_width_cm, p_height_cm))
  v_dimension := GREATEST(p_width_cm, p_height_cm);

  SELECT COUNT(*) INTO v_matching_size_count
  FROM public.pricing_rules
  WHERE rule_type = 'SIZE_TIER'
    AND is_active = TRUE
    AND min_dimension_cm < v_dimension
    AND (max_dimension_cm IS NULL OR v_dimension <= max_dimension_cm);

  IF v_matching_size_count <> 1 THEN
    RAISE EXCEPTION 'SIZE_RULE_CONFIGURATION_INVALID';
  END IF;

  SELECT rule_key, label, multiplier
  INTO v_size_tier, v_size_label, v_size_multiplier
  FROM public.pricing_rules
  WHERE rule_type = 'SIZE_TIER'
    AND is_active = TRUE
    AND min_dimension_cm < v_dimension
    AND (max_dimension_cm IS NULL OR v_dimension <= max_dimension_cm);

  -- 7. Load Active Pricing Settings
  SELECT range_factor, rounding_increment
  INTO v_range_factor, v_rounding_increment
  FROM public.pricing_settings
  WHERE is_active = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRICING_SETTINGS_NOT_CONFIGURED';
  END IF;

  -- 8. Compute Estimates & Round Up to rounding_increment (CEIL)
  v_raw_min := v_base_price * v_size_multiplier * v_color_multiplier * v_work_multiplier;
  v_raw_max := v_raw_min * v_range_factor;

  v_estimated_min := CEIL(v_raw_min / v_rounding_increment) * v_rounding_increment;
  v_estimated_max := CEIL(v_raw_max / v_rounding_increment) * v_rounding_increment;

  -- 9. Return Result Object
  RETURN jsonb_build_object(
    'estimated_min_price', v_estimated_min,
    'estimated_max_price', v_estimated_max,
    'size_tier', v_size_tier,
    'size_label', v_size_label,
    'color_technique', p_color_technique,
    'color_label', v_color_label,
    'work_type', p_work_type,
    'work_type_label', v_work_label,
    'size_multiplier', v_size_multiplier,
    'color_multiplier', v_color_multiplier,
    'work_type_multiplier', v_work_multiplier,
    'range_factor', v_range_factor,
    'rounding_increment', v_rounding_increment
  );
END;
$$;

-- Revoke and Grant Permissions
REVOKE EXECUTE ON FUNCTION public.calculate_tattoo_price_estimate(UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_tattoo_price_estimate(UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
