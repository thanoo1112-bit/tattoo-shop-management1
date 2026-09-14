-- =============================================================================
-- 157 TATTOO ??? PHASE B MIGRATION (REVISED)
-- ARTIST ACCOUNT FOUNDATION: AUTH USER ??? ARTIST LINK + ARTIST READ-ONLY RLS
-- (EXACT-OBJECT STORAGE AUTHORIZATION & DATABASE SECURITY LAYER)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Add user_id column to public.artists
--    (UNIQUE constraint automatically creates underlying index)
-- -----------------------------------------------------------------------------
ALTER TABLE public.artists
ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 2. Create private.get_artist_id() Security Function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.get_artist_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT a.id
    FROM public.artists a
    JOIN public.profiles p ON p.user_id = a.user_id
    WHERE a.user_id = auth.uid()
      AND a.is_active = true
      AND p.role = 'artist'
      AND p.is_active = true
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = '';

-- Permissions lockdown
REVOKE ALL ON FUNCTION private.get_artist_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.get_artist_id() FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_artist_id() TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. RLS Policies: public.bookings (Artist SELECT Only)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Artist read own assigned bookings policy" ON public.bookings;
CREATE POLICY "Artist read own assigned bookings policy"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  artist_id = private.get_artist_id()
  AND private.get_artist_id() IS NOT NULL
);

-- -----------------------------------------------------------------------------
-- 4. RLS Policies: public.booking_sessions (Artist SELECT Only)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Artist read own assigned booking sessions policy" ON public.booking_sessions;
CREATE POLICY "Artist read own assigned booking sessions policy"
ON public.booking_sessions
FOR SELECT
TO authenticated
USING (
  artist_id = private.get_artist_id()
  AND private.get_artist_id() IS NOT NULL
);

-- -----------------------------------------------------------------------------
-- 5. RLS Policies: public.estimate_requests (Artist SELECT Only for assigned jobs)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Artist read own assigned estimate requests policy" ON public.estimate_requests;
CREATE POLICY "Artist read own assigned estimate requests policy"
ON public.estimate_requests
FOR SELECT
TO authenticated
USING (
  artist_id = private.get_artist_id()
  AND private.get_artist_id() IS NOT NULL
);

-- -----------------------------------------------------------------------------
-- 6. RLS Policies: public.customers (Artist Privacy Guard)
--    Artist may only read customers who have an active booking or request assigned to them
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Artist read booked customers policy" ON public.customers;
CREATE POLICY "Artist read booked customers policy"
ON public.customers
FOR SELECT
TO authenticated
USING (
  private.get_artist_id() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.customer_user_id = customers.user_id
        AND bookings.artist_id = private.get_artist_id()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.estimate_requests
      WHERE estimate_requests.customer_user_id = customers.user_id
        AND estimate_requests.artist_id = private.get_artist_id()
    )
  )
);

-- -----------------------------------------------------------------------------
-- 7. Storage Policies: customer-references (EXACT OBJECT AUTHORIZATION)
--    Artist can read ONLY specific files listed in reference_images of their assigned jobs
--    (No broad folder access by customer_user_id)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Artist read assigned reference images" ON storage.objects;
CREATE POLICY "Artist read assigned reference images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'customer-references'
  AND private.get_artist_id() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.estimate_requests er
      WHERE er.artist_id = private.get_artist_id()
        AND storage.objects.name = ANY(er.reference_images)
    )
    OR
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.estimate_requests er ON er.id = b.estimate_request_id
      WHERE b.artist_id = private.get_artist_id()
        AND storage.objects.name = ANY(er.reference_images)
    )
  )
);

-- -----------------------------------------------------------------------------
-- 8. Reload Schema Cache
-- -----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
