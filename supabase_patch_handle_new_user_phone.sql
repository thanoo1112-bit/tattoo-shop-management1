-- ============================================================================
-- 157 TATTOO — FIX CUSTOMER PROFILE PHONE & GOOGLE OAUTH SYNC
-- Patch: public.handle_new_user() trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    display_name,
    avatar_url,
    phone,
    role
  )
  VALUES (
    NEW.id,
    NEW.email,
    pg_catalog.coalesce(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      pg_catalog.split_part(NEW.email, '@', 1)
    ),
    pg_catalog.coalesce(
      NEW.raw_user_meta_data->>'avatar_url',
      NEW.raw_user_meta_data->>'picture'
    ),
    NEW.raw_user_meta_data->>'phone',
    'customer'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    display_name = pg_catalog.coalesce(EXCLUDED.display_name, public.profiles.display_name),
    avatar_url = pg_catalog.coalesce(EXCLUDED.avatar_url, public.profiles.avatar_url),
    phone = pg_catalog.coalesce(EXCLUDED.phone, public.profiles.phone);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revoke all execute privileges from public/anon
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
