-- ====================================================================
-- 157 TATTOO - PHASE 2A CONTROLLED TEST DATA CLEANUP
-- EXECUTE IN SUPABASE SQL EDITOR ONLY (DATABASE ADMIN CONTEXT)
-- NO RLS MODIFICATION / NO SCHEMA MODIFICATION
-- ====================================================================

DELETE FROM public.estimate_requests
WHERE id IN (
  '1758f2a3-8f3f-4779-afd1-b1f49701fd3a', -- Temporary Phase 2A Admin Test
  '00c2efca-67ca-412a-94e6-42ede9595acd', -- Admin Reject Test
  '0165ebf7-ad2f-4f8c-81d5-9006c1abab40', -- Accept RPC Test
  '5be1e44d-02c6-43d6-9394-963d0decadca'  -- Reject RPC Test
);

-- Verification: Check that count returns to 0
SELECT count(*) AS remaining_estimate_requests_count
FROM public.estimate_requests;
