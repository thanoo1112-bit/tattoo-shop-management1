-- ====================================================================
-- 157 TATTOO - PHASE 1.5 MIGRATION: ARTISTS MASTER DATA
-- OWNER-MANAGED BUSINESS ENTITY (NO AUTH / NO PASSWORDS)
-- HARDENED PERMISSIONS & SEPARATED RLS POLICIES
-- ZERO SEED DATA (Owner manually provisions real artists via /admin/artists)
-- ====================================================================

-- 1. Create public.artists Table
CREATE TABLE IF NOT EXISTS public.artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  nickname TEXT,
  slug TEXT UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  specialties TEXT[] NOT NULL DEFAULT '{}',
  working_days TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  -- Status check constraint
  CONSTRAINT artist_status_check CHECK (status IN ('AVAILABLE', 'TATTOOING', 'BREAK', 'OFF_DUTY')),

  -- Name validation
  CONSTRAINT artist_name_not_empty CHECK (length(trim(name)) > 0)
);

-- 2. Performance & Filter Indexes
CREATE INDEX IF NOT EXISTS idx_artists_status ON public.artists(status);
CREATE INDEX IF NOT EXISTS idx_artists_active_visible ON public.artists(is_active, is_visible);
CREATE INDEX IF NOT EXISTS idx_artists_sort_order ON public.artists(sort_order);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

-- 4. Revoke and Grant Table Privileges (Least Privilege Model)
REVOKE ALL ON public.artists FROM PUBLIC;
REVOKE ALL ON public.artists FROM anon;
REVOKE ALL ON public.artists FROM authenticated;

-- Anon has read-only access (restricted by RLS)
GRANT SELECT ON public.artists TO anon;

-- Authenticated has CRUD grants (strictly gated by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artists TO authenticated;

-- Service role has administrative access
GRANT ALL ON public.artists TO service_role;

-- 5. Separated Row Level Security Policies

-- Drop any previous draft policies for clean idempotent rerun
DROP POLICY IF EXISTS "Public and Customers can view active artists" ON public.artists;
DROP POLICY IF EXISTS "Admin full access on artists" ON public.artists;
DROP POLICY IF EXISTS "Public visible artists select policy" ON public.artists;
DROP POLICY IF EXISTS "Admin read all artists policy" ON public.artists;
DROP POLICY IF EXISTS "Admin insert artists policy" ON public.artists;
DROP POLICY IF EXISTS "Admin update artists policy" ON public.artists;
DROP POLICY IF EXISTS "Admin delete artists policy" ON public.artists;

-- POLICY A: Public Visible Artists (For Anon and Authenticated Customers)
-- Does NOT call private.is_admin() to keep anonymous queries fast and isolated
CREATE POLICY "Public visible artists select policy"
ON public.artists
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND
  is_visible = true
);

-- POLICY B: Admin Can Read All Artists (Including Inactive / Hidden)
CREATE POLICY "Admin read all artists policy"
ON public.artists
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

-- POLICY C: Admin Insert Artists
CREATE POLICY "Admin insert artists policy"
ON public.artists
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_admin()
);

-- POLICY D: Admin Update Artists
CREATE POLICY "Admin update artists policy"
ON public.artists
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

-- POLICY E: Admin Delete Artists
CREATE POLICY "Admin delete artists policy"
ON public.artists
FOR DELETE
TO authenticated
USING (
  private.is_admin()
);

-- 6. Updated At Trigger (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.handle_artists_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS on_artists_updated_at ON public.artists;
CREATE TRIGGER on_artists_updated_at
  BEFORE UPDATE ON public.artists
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_artists_updated_at();
