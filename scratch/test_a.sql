BEGIN;
SELECT set_config('request.jwt.claims', '{"sub": "465f46dc-bdec-4102-9b91-267f5edf864b"}', true);
SELECT public.reschedule_appointment_session(
  '83992306-0770-4ca7-809c-31e6155591cb'::uuid,
  '2026-08-26 11:00:00+07'::timestamptz,
  '2026-08-26 13:00:00+07'::timestamptz
);
COMMIT;
