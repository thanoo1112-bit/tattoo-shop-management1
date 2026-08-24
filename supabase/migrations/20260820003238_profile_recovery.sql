-- Migration: Profile Recovery for existing auth users missing public.profiles

CREATE OR REPLACE FUNCTION public.recover_own_profile(p_full_name TEXT, p_phone TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    RETURN TRUE; -- Already exists, do nothing and succeed
  END IF;

  -- Get email from auth.users (more reliable than JWT in some contexts, but JWT is also fine)
  -- Since SECURITY DEFINER runs as admin, we can query auth.users
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'AUTH_USER_NOT_FOUND';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (v_user_id, p_full_name, v_email, p_phone);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.recover_own_profile(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_own_profile(TEXT, TEXT) TO authenticated;
