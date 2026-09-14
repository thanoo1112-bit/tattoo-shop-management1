-- ============================================================================
-- 157 TATTOO - PHASE 9 ROLLBACK: REMOVE MANUAL / OFFLINE APPOINTMENTS ARCHITECTURE
-- ============================================================================
-- Purpose:
--   Rollback Phase 9 Manual Appointments feature.
--   Store policy decision: Customer self-booking via /booking is the single canonical entry point.
--
-- Actions:
--   1. Drop public.admin_create_manual_appointment RPC overloads
--   2. Restore NOT NULL constraints on estimate_requests.customer_user_id & bookings.customer_user_id
--   3. Drop manual_customer_name and manual_customer_phone columns from estimate_requests
-- ============================================================================

BEGIN;

-- 1. Drop Manual Appointment RPC functions
DROP FUNCTION IF EXISTS public.admin_create_manual_appointment(
  TEXT, TEXT, UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], TEXT
);

DROP FUNCTION IF EXISTS public.admin_create_manual_appointment(
  TEXT, TEXT, UUID, DATE, TIME WITHOUT TIME ZONE, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, TEXT[], TEXT
);

-- 2. Restore NOT NULL constraints (Requires 0 rows with customer_user_id IS NULL)
-- Note: If any manual appointment records remain with customer_user_id IS NULL,
-- these ALTER TABLE commands will fail until those rows are resolved/archived.

DO $$
BEGIN
  -- Verify if any NULL customer_user_id rows exist in estimate_requests
  IF EXISTS (SELECT 1 FROM public.estimate_requests WHERE customer_user_id IS NULL) THEN
    RAISE NOTICE 'CANNOT RESTORE NOT NULL: estimate_requests still contains rows with customer_user_id IS NULL';
  ELSE
    ALTER TABLE public.estimate_requests ALTER COLUMN customer_user_id SET NOT NULL;
  END IF;

  -- Verify if any NULL customer_user_id rows exist in bookings
  IF EXISTS (SELECT 1 FROM public.bookings WHERE customer_user_id IS NULL) THEN
    RAISE NOTICE 'CANNOT RESTORE NOT NULL: bookings still contains rows with customer_user_id IS NULL';
  ELSE
    ALTER TABLE public.bookings ALTER COLUMN customer_user_id SET NOT NULL;
  END IF;
END $$;

-- 3. Drop Manual Customer snapshot columns from estimate_requests
-- Note: Dropped safely only if no dependent objects exist.
ALTER TABLE public.estimate_requests DROP COLUMN IF EXISTS manual_customer_name;
ALTER TABLE public.estimate_requests DROP COLUMN IF EXISTS manual_customer_phone;

NOTIFY pgrst, 'reload schema';

COMMIT;
