-- Direct Artist Registration RPC
CREATE OR REPLACE FUNCTION public.register_artist_directly(
  p_phone TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_shop_id UUID;
  v_existing_role TEXT;
  v_existing_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Resolve the 157-tattoo shop ID by its fixed slug
  SELECT id INTO v_shop_id FROM public.shops WHERE slug = '157-tattoo' LIMIT 1;
  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'SHOP_NOT_FOUND';
  END IF;

  -- Check existing membership
  SELECT role, status INTO v_existing_role, v_existing_status
  FROM public.shop_members
  WHERE shop_id = v_shop_id AND user_id = v_user_id;

  IF FOUND THEN
    -- Strict checks:
    -- If already an active artist or active owner, return true safely without modifying role/status
    IF (v_existing_role = 'artist' AND v_existing_status = 'active') OR 
       (v_existing_role = 'owner' AND v_existing_status = 'active') THEN
      RETURN TRUE;
    ELSE
      -- Deactivated, inactive, or any other conflicting role/status combination must be rejected
      RAISE EXCEPTION 'CONFLICTING_MEMBERSHIP_STATE';
    END IF;
  END IF;

  -- Update phone number in profile if provided
  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    UPDATE public.profiles SET phone = p_phone WHERE id = v_user_id;
  END IF;

  -- Insert membership as active artist
  INSERT INTO public.shop_members (shop_id, user_id, role, status)
  VALUES (v_shop_id, v_user_id, 'artist', 'active');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revoke all execute rights from public/anon
REVOKE ALL ON FUNCTION public.register_artist_directly(TEXT) FROM PUBLIC, anon, authenticated;
-- Grant execute rights only to authenticated users
GRANT EXECUTE ON FUNCTION public.register_artist_directly(TEXT) TO authenticated;
