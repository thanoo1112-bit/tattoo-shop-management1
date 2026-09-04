-- ============================================================================
-- 157 TATTOO — REGISTRATION COMPLETION PATCH (MINIMAL SCOPE)
-- 
-- DO NOT MODIFY handle_new_user()
-- DO NOT MODIFY on_auth_user_created
-- 
-- Architecture Flow:
-- 1. Customer registers via Email/Password with name, phone, password, and checkbox
-- 2. supabase.auth.signUp stores { display_name, phone, eligibility_confirmed: true } in auth.users
-- 3. on_auth_user_created -> handle_new_user() creates public.profiles row (UNTOUCHED)
-- 4. trig_01_profile_sync_customer creates public.customers row (alphabetical order 01)
-- 5. trig_02_customer_registration_consent evaluates eligibility_confirmed (alphabetical order 02)
--    - Verifies NEW.role = 'customer'
--    - Reads auth.users.raw_user_meta_data
--    - Strict JSONB check: v_meta @> '{"eligibility_confirmed": true}'::jsonb
--    - Extracts phone: btrim(COALESCE(NEW.phone, v_meta->>'phone', ''))
--    - Verifies 10-digit Thai phone format: ^0[0-9]{9}$
--    - Updates public.profiles.phone if missing
--    - Updates public.customers: phone, profile_completed_at, eligibility_confirmed_at
--    - Preserves first confirmation timestamp with COALESCE(..., now())
-- 6. Safe Backfill: Syncs existing registered customer accounts matching strict criteria
-- ============================================================================

BEGIN;

-- 1. Ensure Timestamp Columns exist in public.customers
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS eligibility_confirmed_at TIMESTAMPTZ NULL;

-- 2. Registration Consent & Completion Trigger Function
CREATE OR REPLACE FUNCTION public.handle_customer_registration_consent()
RETURNS TRIGGER AS $$
DECLARE
  v_meta JSONB;
  v_phone TEXT;
BEGIN
  -- A. Only process customer profiles
  IF NEW.role = 'customer' THEN
    -- B. Retrieve raw_user_meta_data from auth.users securely
    SELECT raw_user_meta_data
    INTO v_meta
    FROM auth.users
    WHERE id = NEW.user_id;

    -- C. Strict JSONB Boolean Check:
    -- Only matches JSON boolean `true` (e.g. {"eligibility_confirmed": true})
    -- Rejects strings, numbers, false, null, or malformed values without exception
    IF v_meta IS NOT NULL AND v_meta @> '{"eligibility_confirmed": true}'::jsonb THEN
      -- Determine phone from profile or metadata
      v_phone := btrim(COALESCE(NEW.phone, v_meta->>'phone', ''));

      -- Verify 10-digit Thai phone format (^0[0-9]{9}$)
      IF v_phone ~ '^0[0-9]{9}$' THEN
        -- Sync phone to public.profiles if missing or different
        IF NEW.phone IS NULL OR NEW.phone <> v_phone THEN
          UPDATE public.profiles
          SET phone = v_phone, updated_at = now()
          WHERE user_id = NEW.user_id;
        END IF;

        -- Update public.customers with phone and completion timestamps
        -- Preserves initial confirmation timestamp with COALESCE if already populated
        UPDATE public.customers
        SET
          phone = COALESCE(public.customers.phone, v_phone),
          profile_completed_at = COALESCE(profile_completed_at, now()),
          eligibility_confirmed_at = COALESCE(eligibility_confirmed_at, now()),
          updated_at = now()
        WHERE user_id = NEW.user_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 3. Revoke all external execute privileges (trigger execution only)
REVOKE ALL ON FUNCTION public.handle_customer_registration_consent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_customer_registration_consent() FROM anon;
REVOKE ALL ON FUNCTION public.handle_customer_registration_consent() FROM authenticated;

-- 4. Attach Trigger to public.profiles
-- Fired AFTER INSERT in alphabetical order:
-- trig_01_profile_sync_customer runs FIRST (creates customers row)
-- trig_02_customer_registration_consent runs SECOND (syncs phone & stamps consent)
DROP TRIGGER IF EXISTS trig_02_customer_registration_consent ON public.profiles;
CREATE TRIGGER trig_02_customer_registration_consent
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_customer_registration_consent();

-- 5. Safe Backfill for Registered Customers with metadata in auth.users
-- Only backfills users who explicitly confirmed eligibility and have valid phone
-- Preserves existing timestamps with COALESCE
DO $$
DECLARE
  r RECORD;
  v_phone TEXT;
BEGIN
  FOR r IN 
    SELECT u.id AS user_id, u.raw_user_meta_data, p.phone AS profile_phone
    FROM auth.users u
    JOIN public.profiles p ON p.user_id = u.id
    WHERE p.role = 'customer'
      AND u.raw_user_meta_data @> '{"eligibility_confirmed": true}'::jsonb
  LOOP
    v_phone := btrim(COALESCE(r.profile_phone, r.raw_user_meta_data->>'phone', ''));
    IF v_phone ~ '^0[0-9]{9}$' THEN
      UPDATE public.profiles
      SET phone = COALESCE(phone, v_phone), updated_at = now()
      WHERE user_id = r.user_id;

      UPDATE public.customers
      SET
        phone = COALESCE(phone, v_phone),
        profile_completed_at = COALESCE(profile_completed_at, now()),
        eligibility_confirmed_at = COALESCE(eligibility_confirmed_at, now()),
        updated_at = now()
      WHERE user_id = r.user_id;
    END IF;
  END LOOP;
END $$;

COMMIT;
