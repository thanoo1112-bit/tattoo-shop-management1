-- ====================================================================
-- 157 TATTOO - PHASE 19B: ADMIN WALKIN RLS POLICIES & GRANTS
-- ====================================================================
-- Purpose:
--   Grant least-privilege RLS policies for Admin to insert, select,
--   update, and delete (rollback cleanup) records across booking tables:
--     - public.customers
--     - public.estimate_requests
--     - public.bookings
--     - public.booking_sessions
--     - public.booking_payments
--   Fixes RLS violation (code: 42501) when creating Walk-in customer bookings
--   where customer_user_id is NULL.
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1. Ensure Table Level GRANTS for authenticated role
-- --------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_payments TO authenticated;

-- --------------------------------------------------------------------
-- 2. RLS Policies for public.customers
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin insert customer policy" ON public.customers;
DROP POLICY IF EXISTS "Admin insert policy on customers" ON public.customers;
CREATE POLICY "Admin insert policy on customers"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin select policy on customers" ON public.customers;
CREATE POLICY "Admin select policy on customers"
ON public.customers
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin update policy on customers" ON public.customers;
CREATE POLICY "Admin update policy on customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin delete policy on customers" ON public.customers;
CREATE POLICY "Admin delete policy on customers"
ON public.customers
FOR DELETE
TO authenticated
USING (
  private.is_admin()
);

-- --------------------------------------------------------------------
-- 3. RLS Policies for public.estimate_requests
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin insert policy on estimate_requests" ON public.estimate_requests;
CREATE POLICY "Admin insert policy on estimate_requests"
ON public.estimate_requests
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin select policy on estimate_requests" ON public.estimate_requests;
CREATE POLICY "Admin select policy on estimate_requests"
ON public.estimate_requests
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin update policy on estimate_requests" ON public.estimate_requests;
CREATE POLICY "Admin update policy on estimate_requests"
ON public.estimate_requests
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin delete policy on estimate_requests" ON public.estimate_requests;
CREATE POLICY "Admin delete policy on estimate_requests"
ON public.estimate_requests
FOR DELETE
TO authenticated
USING (
  private.is_admin()
);

-- --------------------------------------------------------------------
-- 4. RLS Policies for public.bookings
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin insert policy on bookings" ON public.bookings;
CREATE POLICY "Admin insert policy on bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin select policy on bookings" ON public.bookings;
CREATE POLICY "Admin select policy on bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin update policy on bookings" ON public.bookings;
CREATE POLICY "Admin update policy on bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin delete policy on bookings" ON public.bookings;
CREATE POLICY "Admin delete policy on bookings"
ON public.bookings
FOR DELETE
TO authenticated
USING (
  private.is_admin()
);

-- --------------------------------------------------------------------
-- 5. RLS Policies for public.booking_sessions
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin insert policy on booking_sessions" ON public.booking_sessions;
CREATE POLICY "Admin insert policy on booking_sessions"
ON public.booking_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin select policy on booking_sessions" ON public.booking_sessions;
CREATE POLICY "Admin select policy on booking_sessions"
ON public.booking_sessions
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin update policy on booking_sessions" ON public.booking_sessions;
CREATE POLICY "Admin update policy on booking_sessions"
ON public.booking_sessions
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin delete policy on booking_sessions" ON public.booking_sessions;
CREATE POLICY "Admin delete policy on booking_sessions"
ON public.booking_sessions
FOR DELETE
TO authenticated
USING (
  private.is_admin()
);

-- --------------------------------------------------------------------
-- 6. RLS Policies for public.booking_payments
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin insert policy on booking_payments" ON public.booking_payments;
CREATE POLICY "Admin insert policy on booking_payments"
ON public.booking_payments
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin select policy on booking_payments" ON public.booking_payments;
CREATE POLICY "Admin select policy on booking_payments"
ON public.booking_payments
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin update policy on booking_payments" ON public.booking_payments;
CREATE POLICY "Admin update policy on booking_payments"
ON public.booking_payments
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

DROP POLICY IF EXISTS "Admin delete policy on booking_payments" ON public.booking_payments;
CREATE POLICY "Admin delete policy on booking_payments"
ON public.booking_payments
FOR DELETE
TO authenticated
USING (
  private.is_admin()
);

-- --------------------------------------------------------------------
-- 7. Notify PostgREST schema reload
-- --------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
