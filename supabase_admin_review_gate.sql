-- =========================================================================
-- 157 TATTOO — ADMIN REVIEW GATE MIGRATION
-- Adds admin_reviewed_at column to public.estimate_requests
-- Creates secure RPC admin_mark_estimate_reviewed
-- =========================================================================

-- 1. ADD COLUMN admin_reviewed_at
ALTER TABLE public.estimate_requests 
ADD COLUMN IF NOT EXISTS admin_reviewed_at TIMESTAMPTZ NULL;

-- 2. CREATE SECURE RPC FUNCTION
CREATE OR REPLACE FUNCTION public.admin_mark_estimate_reviewed(
  p_estimate_id UUID,
  p_artist_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
  v_staff_role TEXT;
  v_target_est public.estimate_requests%ROWTYPE;
  v_final_artist_id UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- Verify Staff Role = ADMIN
  SELECT role INTO v_staff_role
  FROM public.staff_profiles
  WHERE user_id = v_caller_id AND is_active = true;

  IF v_staff_role IS NULL OR v_staff_role != 'ADMIN' THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required' USING ERRCODE = '42501';
  END IF;

  -- Fetch target estimate request
  SELECT * INTO v_target_est
  FROM public.estimate_requests
  WHERE id = p_estimate_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estimate request not found' USING ERRCODE = 'P0002';
  END IF;

  -- Resolve artist_id: use p_artist_id if provided, otherwise existing v_target_est.artist_id
  v_final_artist_id := COALESCE(p_artist_id, v_target_est.artist_id);

  IF v_final_artist_id IS NULL THEN
    RAISE EXCEPTION 'Artist must be selected before sending for evaluation' USING ERRCODE = '22000';
  END IF;

  -- Update estimate_requests setting admin_reviewed_at = now() and artist_id
  UPDATE public.estimate_requests
  SET 
    admin_reviewed_at = NOW(),
    artist_id = v_final_artist_id,
    updated_at = NOW()
  WHERE id = p_estimate_id;

  RETURN jsonb_build_object(
    'success', true,
    'estimate_id', p_estimate_id,
    'artist_id', v_final_artist_id,
    'admin_reviewed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_estimate_reviewed(UUID, UUID) TO authenticated;
