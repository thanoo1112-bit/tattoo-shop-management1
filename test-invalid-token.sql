BEGIN;
SET LOCAL role = anon;
SELECT public.get_public_balance_payment_details('00000000-0000-0000-0000-000000000000');
COMMIT;
