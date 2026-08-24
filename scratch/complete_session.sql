BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "465f46dc-bdec-4102-9b91-267f5edf864b"}', true);
SELECT public.start_appointment_session('83992306-0770-4ca7-809c-31e6155591cb'::uuid);
SELECT public.complete_appointment_session('83992306-0770-4ca7-809c-31e6155591cb'::uuid);
COMMIT;
