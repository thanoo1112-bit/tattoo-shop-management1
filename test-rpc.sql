BEGIN;
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claim.sub = '465f46dc-bdec-4102-9b91-267f5edf864b';
SELECT public.update_appointment_status('71b6b48c-0311-4966-ab73-6786fef42ee6', 'completed');
COMMIT;
