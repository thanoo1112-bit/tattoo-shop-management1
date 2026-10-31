-- ============================================================================
-- 157 TATTOO — PERSIST CUSTOMER DATE OF BIRTH
-- Patch: Phase 23 Customer Date of Birth Persistence
-- Target:
--   1. Add date_of_birth DATE NULL column to public.customers
--   2. Update handle_customer_registration_consent() trigger to sync birthdate from metadata
--   3. Add overloaded complete_customer_profile RPC with p_date_of_birth support
-- ============================================================================

BEGIN;

-- 1. Add date_of_birth column to public.customers (Nullable, DATE type)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS date_of_birth DATE NULL;

-- 2. Update Registration Consent & Completion Trigger Function
CREATE OR REPLACE FUNCTION public.handle_customer_registration_consent()
RETURNS TRIGGER AS $$
DECLARE
  v_meta JSONB;
  v_phone TEXT;
  v_dob_raw TEXT;
  v_dob DATE;
BEGIN
  IF NEW.role = 'customer' THEN
    SELECT raw_user_meta_data
    INTO v_meta
    FROM auth.users
    WHERE id = NEW.user_id;

    IF v_meta IS NOT NULL THEN
      -- Extract and sanitize phone
      v_phone := NULLIF(pg_catalog.btrim(COALESCE(NEW.phone, v_meta->>'phone', '')), '');
      IF v_phone ~ '^0[0-9]{9}$' THEN
        IF NEW.phone IS NULL OR NEW.phone <> v_phone THEN
          UPDATE public.profiles
          SET phone = v_phone, updated_at = pg_catalog.now()
          WHERE user_id = NEW.user_id;
        END IF;

        UPDATE public.customers
        SET
          phone = COALESCE(public.customers.phone, v_phone),
          profile_completed_at = COALESCE(profile_completed_at, pg_catalog.now()),
          eligibility_confirmed_at = COALESCE(eligibility_confirmed_at, pg_catalog.now()),
          updated_at = pg_catalog.now()
        WHERE user_id = NEW.user_id;
      END IF;

      -- Extract and sanitize birthdate (YYYY-MM-DD format check)
      v_dob_raw := NULLIF(pg_catalog.btrim(COALESCE(v_meta->>'birthdate', v_meta->>'date_of_birth', '')), '');
      IF v_dob_raw IS NOT NULL AND v_dob_raw ~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
        BEGIN
          v_dob := v_dob_raw::DATE;
          UPDATE public.customers
          SET date_of_birth = COALESCE(public.customers.date_of_birth, v_dob),
              updated_at = pg_catalog.now()
          WHERE user_id = NEW.user_id;
        EXCEPTION WHEN OTHERS THEN
          -- Ignore invalid date parse errors gracefully
        END;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.handle_customer_registration_consent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_customer_registration_consent() FROM anon;
REVOKE ALL ON FUNCTION public.handle_customer_registration_consent() FROM authenticated;

-- 3. Overloaded RPC Functions for complete_customer_profile
-- Signature 1: 4 Arguments (with p_date_of_birth)
CREATE OR REPLACE FUNCTION public.complete_customer_profile(
  p_display_name TEXT,
  p_phone TEXT,
  p_eligibility_confirmed BOOLEAN,
  p_date_of_birth TEXT
)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID;
  v_clean_name TEXT;
  v_clean_phone TEXT;
  v_dob_raw TEXT;
  v_dob DATE;
  v_profile_role TEXT;
  v_profile_is_active BOOLEAN;
  v_profile_completed_at TIMESTAMPTZ;
  v_eligibility_confirmed_at TIMESTAMPTZ;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role, is_active
  INTO v_profile_role, v_profile_is_active
  FROM public.profiles
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  IF v_profile_role IS DISTINCT FROM 'customer' OR v_profile_is_active IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Customer account is not active';
  END IF;

  IF p_eligibility_confirmed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'กรุณายืนยันเงื่อนไขก่อนดำเนินการ';
  END IF;

  v_clean_name := pg_catalog.btrim(p_display_name);
  IF v_clean_name IS NULL OR v_clean_name = '' THEN
    RAISE EXCEPTION 'กรุณากรอกชื่อผู้ใช้งาน';
  END IF;

  v_clean_phone := pg_catalog.btrim(p_phone);
  IF v_clean_phone IS NULL OR v_clean_phone = '' THEN
    RAISE EXCEPTION 'กรุณากรอกเบอร์โทรศัพท์';
  END IF;

  IF v_clean_phone !~ '^0[0-9]{9}$' THEN
    RAISE EXCEPTION 'กรุณากรอกเบอร์โทรศัพท์ 10 หลัก';
  END IF;

  -- Validate optional date of birth
  v_dob_raw := NULLIF(pg_catalog.btrim(p_date_of_birth), '');
  IF v_dob_raw IS NOT NULL THEN
    IF v_dob_raw !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN
      RAISE EXCEPTION 'กรุณาระบุวัน/เดือน/ปีเกิดที่ถูกต้อง (YYYY-MM-DD)';
    END IF;
    v_dob := v_dob_raw::DATE;
  END IF;

  -- Update public.profiles
  UPDATE public.profiles
  SET
    display_name = v_clean_name,
    phone = v_clean_phone,
    updated_at = pg_catalog.now()
  WHERE user_id = v_uid;

  -- Update public.customers with date_of_birth
  UPDATE public.customers
  SET
    display_name = v_clean_name,
    phone = v_clean_phone,
    date_of_birth = COALESCE(v_dob, public.customers.date_of_birth),
    profile_completed_at = COALESCE(profile_completed_at, pg_catalog.now()),
    eligibility_confirmed_at = COALESCE(eligibility_confirmed_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE user_id = v_uid
  RETURNING
    profile_completed_at,
    eligibility_confirmed_at
  INTO
    v_profile_completed_at,
    v_eligibility_confirmed_at;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'user_id', v_uid,
    'display_name', v_clean_name,
    'phone', v_clean_phone,
    'date_of_birth', v_dob,
    'profile_completed_at', v_profile_completed_at,
    'eligibility_confirmed_at', v_eligibility_confirmed_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '';

-- Signature 2: 3 Arguments (Backward Compatibility wrapper)
CREATE OR REPLACE FUNCTION public.complete_customer_profile(
  p_display_name TEXT,
  p_phone TEXT,
  p_eligibility_confirmed BOOLEAN
)
RETURNS JSONB AS $$
BEGIN
  RETURN public.complete_customer_profile(p_display_name, p_phone, p_eligibility_confirmed, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '';

REVOKE ALL ON FUNCTION public.complete_customer_profile(TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_customer_profile(TEXT, TEXT, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_customer_profile(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_customer_profile(TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_customer_profile(TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_customer_profile(TEXT, TEXT, BOOLEAN) TO authenticated;

COMMIT;
