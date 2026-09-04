-- =============================================================================
-- 157 TATTOO — PHASE IMAGE STORAGE: SUPABASE STORAGE FOUNDATION
-- STEP 1: BUCKETS CREATION & STORAGE OBJECTS RLS POLICIES
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CREATE / CONFIGURE STORAGE BUCKETS
-- -----------------------------------------------------------------------------

-- Bucket 1: studio-assets (Public: artists/, flash/, portfolio/)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'studio-assets',
  'studio-assets',
  true,
  10485760, -- 10 MB (10 * 1024 * 1024 bytes)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Bucket 2: customer-references (Private: <auth.uid()>/<uuid>.<ext>)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-references',
  'customer-references',
  false,
  10485760, -- 10 MB (10 * 1024 * 1024 bytes)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- -----------------------------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY ON storage.objects
-- -----------------------------------------------------------------------------
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. DROP EXISTING 157 TATTOO STORAGE POLICIES IF RE-RUNNING
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read studio assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin insert studio assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin update studio assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete studio assets" ON storage.objects;

DROP POLICY IF EXISTS "Customer read own reference images" ON storage.objects;
DROP POLICY IF EXISTS "Customer upload own reference images" ON storage.objects;
DROP POLICY IF EXISTS "Customer delete own reference images" ON storage.objects;
DROP POLICY IF EXISTS "Admin read all reference images" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete reference images" ON storage.objects;

-- -----------------------------------------------------------------------------
-- 4. POLICIES FOR studio-assets (PUBLIC BUCKET)
-- -----------------------------------------------------------------------------

-- A. Public read studio assets (Anon & Authenticated can view business assets)
CREATE POLICY "Public read studio assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'studio-assets');

-- B. Admin insert studio assets (Only Admin can upload artists/, flash/, portfolio/)
CREATE POLICY "Admin insert studio assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'studio-assets'
  AND (SELECT private.is_admin())
);

-- C. Admin update studio assets
CREATE POLICY "Admin update studio assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'studio-assets'
  AND (SELECT private.is_admin())
)
WITH CHECK (
  bucket_id = 'studio-assets'
  AND (SELECT private.is_admin())
);

-- D. Admin delete studio assets
CREATE POLICY "Admin delete studio assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'studio-assets'
  AND (SELECT private.is_admin())
);

-- -----------------------------------------------------------------------------
-- 5. POLICIES FOR customer-references (PRIVATE BUCKET)
-- -----------------------------------------------------------------------------

-- E. Customer read own reference images (Restricted to owner's folder: auth.uid()/)
CREATE POLICY "Customer read own reference images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-references'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

-- F. Customer upload own reference images (Restricted to owner's folder: auth.uid()/)
CREATE POLICY "Customer upload own reference images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'customer-references'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

-- G. Customer delete own reference images (Can delete before submitting estimate)
CREATE POLICY "Customer delete own reference images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'customer-references'
  AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
);

-- H. Admin read all reference images
CREATE POLICY "Admin read all reference images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-references'
  AND (SELECT private.is_admin())
);

-- I. Admin delete reference images
CREATE POLICY "Admin delete reference images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'customer-references'
  AND (SELECT private.is_admin())
);

-- -----------------------------------------------------------------------------
-- 6. RELOAD SCHEMA NOTIFICATION
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- VERIFICATION QUERY (READ-ONLY)
-- Run this in Supabase SQL Editor after executing the migration above to verify
-- =============================================================================
/*
SELECT
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id IN ('studio-assets', 'customer-references')
ORDER BY id;

SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'Public read studio assets',
    'Admin insert studio assets',
    'Admin update studio assets',
    'Admin delete studio assets',
    'Customer read own reference images',
    'Customer upload own reference images',
    'Customer delete own reference images',
    'Admin read all reference images',
    'Admin delete reference images'
  )
ORDER BY policyname;
*/
