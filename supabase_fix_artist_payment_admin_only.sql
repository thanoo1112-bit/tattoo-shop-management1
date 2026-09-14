-- ----------------------------------------------------------------------------
-- FIX A2: Restrict Artist Payment Approval & Rejection RPCs to Admin-only
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.artist_approve_payment_submission(
  p_submission_id UUID,
  p_verified_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'BANK_TRANSFER',
  p_reference_no TEXT DEFAULT NULL,
  p_artist_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Payment authority is strictly Admin-only
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only active Admin can approve payment submissions'
      USING ERRCODE = '42501';
  END IF;

  RAISE EXCEPTION 'Use admin_approve_payment_submission instead' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.artist_reject_payment_submission(
  p_submission_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Payment authority is strictly Admin-only
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Only active Admin can reject payment submissions'
      USING ERRCODE = '42501';
  END IF;

  RAISE EXCEPTION 'Use admin_reject_payment_submission instead' USING ERRCODE = '42501';
END;
$$;
