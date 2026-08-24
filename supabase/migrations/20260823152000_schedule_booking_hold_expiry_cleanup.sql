-- Enable pg_cron extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Safe unschedule pattern: only unschedule if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'cron' AND c.relname = 'job'
    ) THEN
        PERFORM cron.unschedule('expire-booking-schedule-holds');
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Safe catch-all
END;
$$;

-- Schedule the job to run every 5 minutes
SELECT cron.schedule(
  'expire-booking-schedule-holds',
  '*/5 * * * *',
  $$SELECT public.expire_booking_schedule_holds();$$
);
