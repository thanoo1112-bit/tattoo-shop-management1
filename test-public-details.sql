BEGIN;
SET LOCAL role = anon;
SELECT public.get_public_balance_payment_details('8f83fe6f-554c-4c4d-8833-5ce12aa2f33c');
COMMIT;
