-- --------------------------------------------------------------------
-- 157 TATTOO - PHASE 20: CUSTOMER OWN ROW RLS POLICIES
-- Allow authenticated customers to SELECT, INSERT, and UPDATE their own row in public.customers
-- Preserve Admin walk-in and management policies
-- --------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE ON public.customers TO authenticated;

-- 1. Customer insert own customer row policy
DROP POLICY IF EXISTS "Customer insert own customer row policy" ON public.customers;
CREATE POLICY "Customer insert own customer row policy"
ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

-- 2. Customer update own customer row policy
DROP POLICY IF EXISTS "Customer update own customer row policy" ON public.customers;
CREATE POLICY "Customer update own customer row policy"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
);

-- 3. Customer select own customer row policy
DROP POLICY IF EXISTS "Customer select own customer row policy" ON public.customers;
CREATE POLICY "Customer select own customer row policy"
ON public.customers
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() OR private.is_admin()
);
