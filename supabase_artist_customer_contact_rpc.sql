-- =============================================================================
-- 157 TATTOO - SECURE RPC: artist_get_customer_contacts
-- Description: Minimal customer contact lookup (name + phone) for assigned Artists
-- =============================================================================

CREATE OR REPLACE FUNCTION public.artist_get_customer_contacts(
  p_customer_user_ids UUID[]
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  phone TEXT
) AS $$
DECLARE
  v_artist_id UUID;
  v_is_admin BOOLEAN := FALSE;
  v_clean_ids UUID[];
BEGIN
  -- 1. Input protection: empty or null check
  IF p_customer_user_ids IS NULL OR cardinality(p_customer_user_ids) = 0 THEN
    RETURN;
  END IF;

  -- Deduplicate input and limit batch size to 100 IDs
  SELECT ARRAY(
    SELECT DISTINCT unnest(p_customer_user_ids)
    LIMIT 100
  ) INTO v_clean_ids;

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
      RETURN; -- Denied: User is neither an active artist nor an admin
    END IF;
  END IF;

  -- 4. Query only authorized customer records
  RETURN QUERY
  WITH authorized_customers AS (
    SELECT DISTINCT target_id
    FROM unnest(v_clean_ids) AS target_id
    WHERE v_is_admin = TRUE
       OR EXISTS (
            SELECT 1 FROM public.bookings b
            WHERE b.artist_id = v_artist_id AND b.customer_user_id = target_id
          )
       OR EXISTS (
            SELECT 1 FROM public.estimate_requests e
            WHERE e.artist_id = v_artist_id AND e.customer_user_id = target_id
          )
  )
  SELECT 
    ac.target_id AS user_id,
    COALESCE(
      NULLIF(NULLIF(c.display_name, 'ลูกค้าประจำ'), 'ลูกค้า 157 TATTOO'),
      NULLIF(NULLIF(p.display_name, 'ลูกค้าประจำ'), 'ลูกค้า 157 TATTOO'),
      NULLIF(SPLIT_PART(c.email, '@', 1), ''),
      NULLIF(SPLIT_PART(p.email, '@', 1), ''),
      'ลูกค้า (ไม่ระบุชื่อ)'
    )::TEXT AS display_name,
    COALESCE(NULLIF(p.phone, ''), NULLIF(c.phone, ''), '')::TEXT AS phone
  FROM authorized_customers ac
  LEFT JOIN public.customers c ON c.user_id = ac.target_id
  LEFT JOIN public.profiles p ON p.user_id = ac.target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

-- Permissions lockdown
REVOKE ALL ON FUNCTION public.artist_get_customer_contacts(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_get_customer_contacts(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_get_customer_contacts(UUID[]) TO authenticated;
