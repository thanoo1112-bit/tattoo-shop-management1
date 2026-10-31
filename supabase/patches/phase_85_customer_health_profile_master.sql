-- Phase 85: Single Source of Truth for Customer Health Disclosures on customers table
-- Adds master health disclosure columns to customers table, backfills non-conflicting profiles from estimate_requests, and updates RPCs

-- 1. Add Master Health Columns to customers table
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS has_medical_condition BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS medical_condition_note TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS has_allergy BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS allergy_note TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS medical_conditions TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS allergies TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS health_updated_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Backfill customers master profile from estimate_requests
-- NOTE: If a customer has CONFLICTING health disclosures across multiple estimate_requests,
-- we emit a NOTICE listing the conflicting customer_user_id and SKIP auto-overwriting.
-- Also, existing non-null data in customers table is strictly preserved and never cleared/overwritten.
DO $$
DECLARE
  r RECORD;
  v_updated_count INT := 0;
  v_skipped_conflict_count INT := 0;
BEGIN
  -- Report all customers with conflicting health variants across estimate_requests
  FOR r IN (
    SELECT 
      customer_user_id, 
      COUNT(DISTINCT (
        COALESCE(has_medical_condition::text, ''),
        COALESCE(medical_condition_note, ''),
        COALESCE(has_allergy::text, ''),
        COALESCE(allergy_note, '')
      )) as variant_count
    FROM public.estimate_requests
    WHERE (has_medical_condition IS NOT NULL OR has_allergy IS NOT NULL OR medical_condition_note IS NOT NULL OR allergy_note IS NOT NULL)
      AND customer_user_id IS NOT NULL
    GROUP BY customer_user_id
    HAVING COUNT(DISTINCT (
      COALESCE(has_medical_condition::text, ''),
      COALESCE(medical_condition_note, ''),
      COALESCE(has_allergy::text, ''),
      COALESCE(allergy_note, '')
    )) > 1
  ) LOOP
    v_skipped_conflict_count := v_skipped_conflict_count + 1;
    RAISE NOTICE 'CONFLICT DETECTED for customer_user_id %: Has % distinct health disclosure variants in estimate_requests. SKIPPING auto-backfill for this customer.', r.customer_user_id, r.variant_count;
  END LOOP;

  -- Perform backfill ONLY for customers with unanimous (single variant) health disclosures
  -- AND ONLY IF their customers profile currently has unrecorded health data (all health columns NULL).
  WITH single_health_customers AS (
    SELECT 
      customer_user_id,
      (ARRAY_AGG(has_medical_condition ORDER BY created_at DESC))[1] as has_medical_condition,
      (ARRAY_AGG(medical_condition_note ORDER BY created_at DESC))[1] as medical_condition_note,
      (ARRAY_AGG(has_allergy ORDER BY created_at DESC))[1] as has_allergy,
      (ARRAY_AGG(allergy_note ORDER BY created_at DESC))[1] as allergy_note
    FROM public.estimate_requests
    WHERE (has_medical_condition IS NOT NULL OR has_allergy IS NOT NULL OR medical_condition_note IS NOT NULL OR allergy_note IS NOT NULL)
      AND customer_user_id IS NOT NULL
    GROUP BY customer_user_id
    HAVING COUNT(DISTINCT (
      COALESCE(has_medical_condition::text, ''),
      COALESCE(medical_condition_note, ''),
      COALESCE(has_allergy::text, ''),
      COALESCE(allergy_note, '')
    )) = 1
  )
  UPDATE public.customers c
  SET 
    has_medical_condition = s.has_medical_condition,
    medical_condition_note = s.medical_condition_note,
    has_allergy = s.has_allergy,
    allergy_note = s.allergy_note,
    medical_conditions = s.medical_condition_note,
    allergies = s.allergy_note,
    health_updated_at = NOW(),
    updated_at = NOW()
  FROM single_health_customers s
  WHERE c.user_id = s.customer_user_id
    AND (c.has_medical_condition IS NULL AND c.has_allergy IS NULL AND c.medical_conditions IS NULL AND c.allergies IS NULL);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Phase 85 Backfill completed: % rows updated, % conflicting customers skipped.', v_updated_count, v_skipped_conflict_count;
END $$;

-- 3. Update create_flash_reservation RPC to support health disclosure parameters & atomic customers update
CREATE OR REPLACE FUNCTION public.create_flash_reservation(
  p_flash_design_id UUID,
  p_requested_date DATE DEFAULT NULL,
  p_requested_start_time TIME DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL,
  p_placement TEXT DEFAULT NULL,
  p_width_cm NUMERIC DEFAULT NULL,
  p_height_cm NUMERIC DEFAULT NULL,
  p_has_medical_condition BOOLEAN DEFAULT NULL,
  p_medical_condition_note TEXT DEFAULT NULL,
  p_has_allergy BOOLEAN DEFAULT NULL,
  p_allergy_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_flash_status TEXT;
  v_is_repeatable BOOLEAN;
  v_reservation_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'กรุณาล็อกอินก่อนทำการจองลาย Flash' USING ERRCODE = '42501';
  END IF;

  SELECT status, COALESCE(is_repeatable, FALSE)
  INTO v_flash_status, v_is_repeatable
  FROM public.flash_designs
  WHERE id = p_flash_design_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบแบบลายสัก Flash ที่ระบุ' USING ERRCODE = '22004';
  END IF;

  IF v_is_repeatable IS FALSE AND v_flash_status != 'AVAILABLE' THEN
    RAISE EXCEPTION 'แบบลายสัก Flash นี้มีผู้จองหรือถูกจำหน่ายแล้ว' USING ERRCODE = '22023';
  END IF;

  -- Create reservation
  INSERT INTO public.flash_reservations (
    flash_design_id,
    customer_user_id,
    status,
    requested_date,
    requested_start_time,
    customer_note,
    placement,
    width_cm,
    height_cm,
    created_at
  )
  VALUES (
    p_flash_design_id,
    v_user_id,
    'PENDING',
    p_requested_date,
    p_requested_start_time,
    p_customer_note,
    p_placement,
    p_width_cm,
    p_height_cm,
    NOW()
  )
  RETURNING id INTO v_reservation_id;

  IF v_is_repeatable IS FALSE THEN
    UPDATE public.flash_designs
    SET status = 'HELD'
    WHERE id = p_flash_design_id;
  END IF;

  -- Atomic update of customer master health profile inside the same transaction
  IF p_has_medical_condition IS NOT NULL OR p_has_allergy IS NOT NULL THEN
    UPDATE public.customers
    SET
      has_medical_condition = COALESCE(p_has_medical_condition, has_medical_condition),
      medical_condition_note = CASE WHEN p_has_medical_condition IS TRUE THEN p_medical_condition_note ELSE NULL END,
      has_allergy = COALESCE(p_has_allergy, has_allergy),
      allergy_note = CASE WHEN p_has_allergy IS TRUE THEN p_allergy_note ELSE NULL END,
      medical_conditions = CASE WHEN p_has_medical_condition IS TRUE THEN p_medical_condition_note ELSE NULL END,
      allergies = CASE WHEN p_has_allergy IS TRUE THEN p_allergy_note ELSE NULL END,
      health_updated_at = NOW(),
      updated_at = NOW()
    WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id
  );
END;
$$;

-- Grant permissions for create_flash_reservation
REVOKE ALL ON FUNCTION public.create_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_flash_reservation(UUID, DATE, TIME, TEXT, TEXT, NUMERIC, NUMERIC, BOOLEAN, TEXT, BOOLEAN, TEXT) TO service_role;
