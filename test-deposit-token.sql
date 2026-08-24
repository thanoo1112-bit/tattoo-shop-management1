BEGIN;
SET LOCAL role = anon;
SELECT public.get_public_balance_payment_details('e3e4daad-4971-423a-b935-a5aa2661f2e5');
COMMIT;
