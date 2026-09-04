-- ====================================================================
-- 157 TATTOO — CUSTOMER MASTER TABLE MIGRATION
-- Table: public.customers
-- 
-- FINAL ARCHITECTURE:
-- 1. auth.users: Login credentials & provider session (Email / Password / Google)
-- 2. public.profiles: Authorization & RBAC (role: 'admin' | 'customer' ONLY, is_active)
--    * No Artist Auth: Artists are Owner-Managed business records in public.artists
-- 3. public.customers: Customer Master Data (display_name, email, phone, avatar_url)
-- 4. public.artists: Artist Business Records (specialties, bio, working_days, etc.)
--
-- Security Hardening:
-- - private.is_admin() requires profiles.role = 'admin' AND profiles.is_active = true
-- - Automatic Profile Sync Trigger (public.profiles -> public.customers)
-- - Trigger Function EXECUTE revoked from authenticated/anon (internal trigger engine only)
-- - Thai 10-Digit Phone Format Validation (^0[0-9]{9}$)
-- - Least Privilege RLS & Secure Backfill (Admin excluded)
-- ====================================================================

-- 0. Security Hardening: private.is_admin() strictly enforces is_active = true
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.user_id = auth.uid()
      AND profiles.role = 'admin'
      AND profiles.is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_admin() FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- 1. Create public.customers Table
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  display_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  -- Thai 10-digit mobile format: 0812345678 (NULL allowed)
  CONSTRAINT customer_phone_check CHECK (phone IS NULL OR phone ~ '^0[0-9]{9}$')
);

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);

-- 3. Trigger Function: Customers updated_at
CREATE OR REPLACE FUNCTION public.handle_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

DROP TRIGGER IF EXISTS trig_02_customers_updated_at ON public.customers;
CREATE TRIGGER trig_02_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_customers_updated_at();

-- 4. Automatic Customer Sync Trigger Function from public.profiles
CREATE OR REPLACE FUNCTION public.handle_sync_profile_to_customer()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync when profile role is 'customer'
  IF NEW.role = 'customer' THEN
    INSERT INTO public.customers (
      user_id,
      display_name,
      email,
      phone,
      avatar_url,
      created_at,
      updated_at
    )
    VALUES (
      NEW.user_id,
      NEW.display_name,
      NEW.email,
      NEW.phone,
      NEW.avatar_url,
      pg_catalog.now(),
      pg_catalog.now()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      display_name = EXCLUDED.display_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      avatar_url = EXCLUDED.avatar_url,
      updated_at = pg_catalog.now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Revoke public, anon, and authenticated execution from sync trigger function
-- (Trigger functions must only be executed by the database trigger engine)
REVOKE ALL ON FUNCTION public.handle_sync_profile_to_customer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_sync_profile_to_customer() FROM anon;
REVOKE ALL ON FUNCTION public.handle_sync_profile_to_customer() FROM authenticated;

-- Attach Trigger to public.profiles
DROP TRIGGER IF EXISTS trig_01_profile_sync_customer ON public.profiles;
CREATE TRIGGER trig_01_profile_sync_customer
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_sync_profile_to_customer();

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 6. Table Grants (Least Privilege)
REVOKE ALL ON public.customers FROM PUBLIC;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.customers FROM authenticated;

-- Authenticated users (Customers & Admins) can SELECT via RLS
GRANT SELECT ON public.customers TO authenticated;

-- Authenticated Admins can UPDATE safe contact fields (display_name, phone, avatar_url)
-- user_id and email remain immutable via column grants and RLS
GRANT UPDATE (display_name, phone, avatar_url) ON public.customers TO authenticated;

-- Service Role Full Privileges
GRANT ALL ON public.customers TO service_role;

-- 7. RLS Policies
-- Policy A: Customer reads own customer row
DROP POLICY IF EXISTS "Customer read own customer row policy" ON public.customers;
CREATE POLICY "Customer read own customer row policy"
ON public.customers
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
);

-- Policy B: Admin reads all customer records
DROP POLICY IF EXISTS "Admin read all customers policy" ON public.customers;
CREATE POLICY "Admin read all customers policy"
ON public.customers
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

-- Policy C: Admin updates customer records
DROP POLICY IF EXISTS "Admin update customer policy" ON public.customers;
CREATE POLICY "Admin update customer policy"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

-- 8. Backfill Existing Customer Profiles (EXCLUDING Admin)
INSERT INTO public.customers (
  user_id,
  display_name,
  email,
  phone,
  avatar_url,
  created_at,
  updated_at
)
SELECT
  p.user_id,
  p.display_name,
  p.email,
  p.phone,
  p.avatar_url,
  COALESCE(p.created_at, pg_catalog.now()),
  COALESCE(p.updated_at, pg_catalog.now())
FROM public.profiles p
WHERE p.role = 'customer'
ON CONFLICT (user_id) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email,
  phone = EXCLUDED.phone,
  avatar_url = EXCLUDED.avatar_url,
  updated_at = pg_catalog.now();
