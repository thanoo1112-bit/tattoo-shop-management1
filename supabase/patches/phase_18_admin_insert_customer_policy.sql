-- ====================================================================
-- 157 TATTOO - PHASE 18: ADMIN INSERT CUSTOMER POLICY & GRANT
-- ====================================================================
-- Purpose:
--   Fix "permission denied for table customers" error when Admin creates
--   a new customer record from Admin Master Calendar (+ เพิ่มคิวใหม่).
-- ====================================================================

-- 1. Table Grant for authenticated role (Required for Postgres INSERT permission)
GRANT INSERT ON public.customers TO authenticated;

-- 2. Admin Insert Customer RLS Policy
DROP POLICY IF EXISTS "Admin insert customer policy" ON public.customers;

CREATE POLICY "Admin insert customer policy"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_admin()
);
