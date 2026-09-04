-- ====================================================================
-- 157 TATTOO - SUPABASE INTEGRATION PHASE 1.2
-- PROFILES + ROLE SECURITY FOUNDATION MIGRATION
-- ====================================================================

-- 1. Create the private schema if not exists
CREATE SCHEMA IF NOT EXISTS private;

-- 2. Create public.profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  -- Role constraint: customer, artist, admin
  CONSTRAINT profile_role_check CHECK (role IN ('customer', 'artist', 'admin'))
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Define the is_admin function inside private schema (STABLE, SECURITY DEFINER, search_path = '')
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

-- Revoke all execute privileges on private.is_admin from public/anon
REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM anon;

-- Grant execution to authenticated users so they can run policies that check is_admin
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- 4. Trigger Function: Automatically create public profile on signup (SECURITY DEFINER, search_path = '')
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    user_id,
    email,
    display_name,
    phone,
    role
  )
  VALUES (
    NEW.id,
    NEW.email,
    pg_catalog.coalesce(NEW.raw_user_meta_data->>'display_name', pg_catalog.split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone',
    'customer'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    display_name = pg_catalog.coalesce(EXCLUDED.display_name, public.profiles.display_name),
    phone = pg_catalog.coalesce(EXCLUDED.phone, public.profiles.phone);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revoke all execute privileges on public.handle_new_user from public/anon
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;

-- Create Trigger on auth.users for new user profile creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. Trigger Function: Prevent non-admins from changing their role during updates (SECURITY DEFINER, search_path = '', RAISE EXCEPTION on role tampering)
CREATE OR REPLACE FUNCTION public.handle_update_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT private.is_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Role modification is restricted to administrators only.' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revoke all execute privileges on public.handle_update_profile_role from public/anon
REVOKE ALL ON FUNCTION public.handle_update_profile_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_update_profile_role() FROM anon;

-- Create Trigger on public.profiles for role modification protection
DROP TRIGGER IF EXISTS on_profile_role_update ON public.profiles;
CREATE TRIGGER on_profile_role_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_update_profile_role();

-- 6. Admin-controlled role modification RPC (SECURITY DEFINER, search_path = '')
CREATE OR REPLACE FUNCTION public.set_user_role(target_user_id UUID, new_role TEXT)
RETURNS VOID AS $$
BEGIN
  -- Validate caller is admin
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only administrators can modify roles.' USING ERRCODE = '42501';
  END IF;

  -- Validate role values
  IF new_role NOT IN ('customer', 'artist', 'admin') THEN
    RAISE EXCEPTION 'Invalid role value: %', new_role;
  END IF;

  -- Update target profile role
  UPDATE public.profiles
  SET role = new_role
  WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revoke execute from public/anon
REVOKE ALL ON FUNCTION public.set_user_role(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_role(UUID, TEXT) FROM anon;

-- Grant execute to authenticated users (who pass internal checks)
GRANT EXECUTE ON FUNCTION public.set_user_role(UUID, TEXT) TO authenticated;

-- 7. Setup Row Level Security (RLS) policies using private.is_admin()
DROP POLICY IF EXISTS "Enable select for users own profile and admin" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users own profile and admin" ON public.profiles;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.profiles;

CREATE POLICY "Enable select for authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR
  (SELECT private.is_admin())
);

CREATE POLICY "Enable update for authenticated users"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  OR
  (SELECT private.is_admin())
)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  OR
  (SELECT private.is_admin())
);

-- 8. Define Database-level Grants (Least Privilege)
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;

-- Grant read access on all columns to authenticated users
GRANT SELECT ON public.profiles TO authenticated;

-- Grant write access ONLY to display_name, phone, and avatar_url to authenticated users
GRANT UPDATE (display_name, phone, avatar_url) ON public.profiles TO authenticated;
