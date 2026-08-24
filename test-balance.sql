BEGIN;
SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', '{"sub": "465f46dc-bdec-4102-9b91-267f5edf864b"}', true);
SELECT public.create_project_balance_payment('b710ffff-156a-4773-a524-c71cb35f108e');
COMMIT;
