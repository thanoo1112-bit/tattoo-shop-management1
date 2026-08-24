BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "465f46dc-bdec-4102-9b91-267f5edf864b"}', true);
SELECT public.verify_balance_payment('ef533601-0c19-406c-ba02-edf09c8c6b44'::uuid, 'paid'::text);
COMMIT;
