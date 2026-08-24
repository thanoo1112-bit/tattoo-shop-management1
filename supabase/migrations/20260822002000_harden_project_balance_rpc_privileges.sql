-- ==============================================================================
-- Harden Project Balance RPC Privileges
-- ==============================================================================

REVOKE EXECUTE ON FUNCTION public.create_project_balance_payment(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_project_balance_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project_balance_payment(uuid) TO authenticated;
