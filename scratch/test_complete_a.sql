BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "465f46dc-bdec-4102-9b91-267f5edf864b"}', true);
SELECT public.complete_project('3b0141b3-9148-4281-bcbb-d20571d7429f'::uuid);
COMMIT;
