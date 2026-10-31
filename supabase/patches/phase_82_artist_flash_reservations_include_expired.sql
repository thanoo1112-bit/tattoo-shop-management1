-- ============================================================================
-- 157 TATTOO — PHASE 82 MIGRATION
-- INCLUDE EXPIRED AND CANCELLED FLASH RESERVATIONS IN ARTIST DASHBOARD RPC
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.artist_get_flash_reservations(UUID);

CREATE OR REPLACE FUNCTION public.artist_get_flash_reservations(p_artist_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  flash_design_id UUID,
  customer_user_id UUID,
  status TEXT,
  requested_date DATE,
  requested_start_time TIME WITHOUT TIME ZONE,
  customer_note TEXT,
  admin_note TEXT,
  placement TEXT,
  width_cm NUMERIC,
  height_cm NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  flash_design_title TEXT,
  flash_design_style TEXT,
  flash_design_image_url TEXT,
  flash_design_price NUMERIC,
  flash_design_deposit_amount NUMERIC,
  flash_design_size_label TEXT,
  flash_design_artist_id UUID,
  has_medical_condition BOOLEAN,
  medical_condition_note TEXT,
  has_allergy BOOLEAN,
  allergy_note TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_caller_artist_id UUID;
  v_effective_artist_id UUID;
BEGIN
  v_is_admin := private.is_admin();
  v_caller_artist_id := private.get_artist_id();

  IF v_is_admin THEN
    v_effective_artist_id := COALESCE(p_artist_id, v_caller_artist_id);
  ELSIF v_caller_artist_id IS NOT NULL THEN
    v_effective_artist_id := v_caller_artist_id;
  ELSE
    v_effective_artist_id := p_artist_id;
  END IF;

  IF v_effective_artist_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    fr.id,
    fr.flash_design_id,
    fr.customer_user_id,
    fr.status,
    fr.requested_date,
    fr.requested_start_time,
    fr.customer_note,
    fr.admin_note,
    fr.placement,
    fr.width_cm,
    fr.height_cm,
    fr.created_at,
    fr.updated_at,
    fd.title AS flash_design_title,
    fd.style AS flash_design_style,
    fd.image_url AS flash_design_image_url,
    fd.price AS flash_design_price,
    fd.deposit_amount AS flash_design_deposit_amount,
    fd.size_label AS flash_design_size_label,
    fd.artist_id AS flash_design_artist_id,
    er.has_medical_condition,
    er.medical_condition_note,
    er.has_allergy,
    er.allergy_note
  FROM public.flash_reservations fr
  JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
  LEFT JOIN LATERAL (
    SELECT 
      est.has_medical_condition, 
      est.medical_condition_note, 
      est.has_allergy, 
      est.allergy_note
    FROM public.estimate_requests est
    WHERE est.customer_user_id = fr.customer_user_id
    ORDER BY est.created_at DESC
    LIMIT 1
  ) er ON true
  WHERE fd.artist_id = v_effective_artist_id
    AND fr.status NOT IN ('CONFIRMED', 'COMPLETED', 'APPROVED')
  ORDER BY fr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.artist_get_flash_reservations(UUID) TO authenticated, service_role;

COMMIT;
