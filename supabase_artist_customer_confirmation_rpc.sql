-- =============================================================================
-- 157 TATTOO - SECURE RPC: artist_get_customer_confirmation
-- Description: Securely check terms confirmation for an assigned customer
-- =============================================================================

CREATE OR REPLACE FUNCTION public.artist_get_customer_confirmation(
  p_customer_user_id UUID
)
RETURNS TABLE (
  is_confirmed BOOLEAN,
  eligibility_confirmed_at TIMESTAMPTZ,
  profile_completed_at TIMESTAMPTZ
) AS $$
DECLARE
  v_artist_id UUID;
  v_is_admin BOOLEAN := FALSE;
BEGIN
  -- 1. Input protection
  IF p_customer_user_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Security Check: Must be authenticated
  IF auth.uid() IS NULL THEN
    RETURN; -- Anon access strictly denied
  END IF;

  -- 3. Resolve Artist Identity strictly from auth.uid()
  BEGIN
    v_artist_id := private.get_artist_id();
  EXCEPTION WHEN OTHERS THEN
    v_artist_id := NULL;
  END;

  IF v_artist_id IS NULL THEN
    SELECT a.id INTO v_artist_id
    FROM public.artists a
    WHERE a.user_id = auth.uid() AND a.is_active = true
    LIMIT 1;
  END IF;

  -- If not an artist, check if caller is an active Admin
  IF v_artist_id IS NULL THEN
    SELECT (p.role = 'admin' AND p.is_active = true) INTO v_is_admin
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
    LIMIT 1;

    IF v_is_admin IS NOT TRUE THEN
      RETURN; -- Denied: Caller is neither an active artist nor an admin
    END IF;
  END IF;

  -- 4. Relationship Check: Caller must be admin OR artist with relationship to target customer
  IF v_is_admin IS NOT TRUE THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.artist_id = v_artist_id AND b.customer_user_id = p_customer_user_id
      UNION ALL
      SELECT 1 FROM public.estimate_requests e
      WHERE e.artist_id = v_artist_id AND e.customer_user_id = p_customer_user_id
    ) THEN
      RETURN; -- Denied: No relationship between artist and customer
    END IF;
  END IF;

  -- 5. Query customer confirmation status
  RETURN QUERY
  SELECT 
    (c.eligibility_confirmed_at IS NOT NULL OR c.profile_completed_at IS NOT NULL) AS is_confirmed,
    c.eligibility_confirmed_at,
    c.profile_completed_at
  FROM public.customers c
  WHERE c.user_id = p_customer_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

-- Permissions lockdown
REVOKE ALL ON FUNCTION public.artist_get_customer_confirmation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_get_customer_confirmation(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_get_customer_confirmation(UUID) TO authenticated;
