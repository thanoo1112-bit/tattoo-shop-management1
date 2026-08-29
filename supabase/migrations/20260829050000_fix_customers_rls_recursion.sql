-- =============================================================================
-- Fix Customers RLS Recursion Migration
-- Replaces the recursive SELECT policy on public.customers with a clean,
-- non-recursive policy for active shop members (Owners and Artists).
-- =============================================================================

-- 1. Drop the recursive policy
DROP POLICY IF EXISTS "Owner sees all customers, Artist sees assigned" ON public.customers;

-- 2. Create a clean, non-recursive SELECT policy for active shop members
CREATE POLICY "Staff sees all customers in their shop"
ON public.customers FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = customers.shop_id
          AND user_id = auth.uid()
          AND status = 'active'
    )
);
