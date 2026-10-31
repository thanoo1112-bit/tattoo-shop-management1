-- ============================================================================
-- 157 TATTOO — FIX NEW GOOGLE USER DATABASE TRIGGER FAILURE
-- Patch: Phase 21 Database Trigger Hotfix
-- Target Functions:
--   1. public.handle_customer_registration_consent()
--   2. public.handle_sync_profile_to_customer()
--   3. public.handle_new_user()
-- ============================================================================

BEGIN;

-- 1. Fix public.handle_customer_registration_consent()
CREATE OR REPLACE FUNCTION public.handle_customer_registration_consent()
RETURNS TRIGGER AS $$
DECLARE
  v_meta JSONB;
  v_phone TEXT;
BEGIN
  -- Process customer profiles only
  IF NEW.role = 'customer' THEN

    -- Retrieve raw_user_meta_data from auth.users securely
    SELECT raw_user_meta_data
    INTO v_meta
    FROM auth.users
    WHERE id = NEW.user_id;

    -- Strict JSONB boolean check for eligibility confirmation
    IF v_meta IS NOT NULL
       AND v_meta @> '{"eligibility_confirmed": true}'::jsonb
    THEN

      -- Sanitize phone: trim whitespace and normalize empty string '' to NULL
      v_phone := NULLIF(
        pg_catalog.btrim(
          COALESCE(
            NEW.phone,
            v_meta->>'phone',
            ''
          )
        ),
        ''
      );

      -- Verify 10-digit Thai phone format (^0[0-9]{9}$)
      IF v_phone IS NOT NULL AND v_phone ~ '^0[0-9]{9}$' THEN

        -- Sync phone to public.profiles if missing or different
        IF NEW.phone IS NULL OR NEW.phone <> v_phone THEN
          UPDATE public.profiles
          SET
            phone = v_phone,
            updated_at = pg_catalog.now()
          WHERE user_id = NEW.user_id;
        END IF;

        -- Update public.customers with phone + timestamps
        UPDATE public.customers
        SET
          phone = COALESCE(public.customers.phone, v_phone),
          profile_completed_at = COALESCE(profile_completed_at, pg_catalog.now()),
          eligibility_confirmed_at = COALESCE(eligibility_confirmed_at, pg_catalog.now()),
          updated_at = pg_catalog.now()
        WHERE user_id = NEW.user_id;

      END IF;

    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.handle_customer_registration_consent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_customer_registration_consent() FROM anon;
REVOKE ALL ON FUNCTION public.handle_customer_registration_consent() FROM authenticated;

-- 2. Fix public.handle_sync_profile_to_customer()
CREATE OR REPLACE FUNCTION public.handle_sync_profile_to_customer()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'customer' THEN
    IF EXISTS (SELECT 1 FROM public.customers WHERE user_id = NEW.user_id) THEN
      UPDATE public.customers
      SET
        display_name = NEW.display_name,
        email        = NEW.email,
        phone        = COALESCE(NULLIF(pg_catalog.btrim(NEW.phone), ''), public.customers.phone),
        avatar_url   = NEW.avatar_url,
        updated_at   = pg_catalog.now()
      WHERE user_id = NEW.user_id;
    ELSE
      INSERT INTO public.customers (
        user_id,
        display_name,
        email,
        phone,
        avatar_url,
        created_at,
        updated_at
      )
      VALUES (
        NEW.user_id,
        NEW.display_name,
        NEW.email,
        NULLIF(pg_catalog.btrim(NEW.phone), ''),
        NEW.avatar_url,
        pg_catalog.now(),
        pg_catalog.now()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.handle_sync_profile_to_customer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_sync_profile_to_customer() FROM anon;
REVOKE ALL ON FUNCTION public.handle_sync_profile_to_customer() FROM authenticated;

-- 3. Fix public.handle_new_user()
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (
        user_id,
        email,
        display_name,
        phone,
        avatar_url,
        role
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NEW.raw_user_meta_data->>'display_name',
            NEW.raw_user_meta_data->>'full_name',
            NEW.raw_user_meta_data->>'name',
            pg_catalog.split_part(NEW.email, '@', 1)
        ),
        NULLIF(pg_catalog.btrim(NEW.raw_user_meta_data->>'phone'), ''),
        COALESCE(
            NEW.raw_user_meta_data->>'avatar_url',
            NEW.raw_user_meta_data->>'picture'
        ),
        'customer'
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      email = EXCLUDED.email,
      display_name = COALESCE(EXCLUDED.display_name, public.profiles.display_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
      phone = COALESCE(EXCLUDED.phone, public.profiles.phone);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;

COMMIT;
