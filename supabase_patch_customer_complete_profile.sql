-- ====================================================================
-- 157 TATTOO — COMPLETE PROFILE FINAL SECURITY PATCH
-- 
-- 1. Add profile_completed_at & eligibility_confirmed_at to public.customers
-- 2. Hardened complete_customer_profile RPC:
--    - VOLATILE: Authoritative Write RPC performing UPDATE on profiles & customers
--    - Enforces p_eligibility_confirmed IS TRUE (server-side check)
--    - Enforces caller is Active Customer in public.profiles (role = 'customer', is_active = true)
--    - Rejects Admin, Anon, Inactive Customer, and any non-customer account
--      (Note: Artists are business records in public.artists with no auth accounts;
--       public.profiles strictly uses 'admin' | 'customer' roles)
--    - Verifies 1 row updated on public.profiles (FOUND check)
--    - Preserves First Confirmation Timestamps using COALESCE(field, pg_catalog.now())
--    - Returns real stored timestamps via RETURNING into variables
-- ====================================================================

-- 1. Add Timestamp Columns to public.customers (if not present)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS eligibility_confirmed_at TIMESTAMPTZ NULL;

-- 2. Drop legacy function signatures if any
DROP FUNCTION IF EXISTS public.complete_customer_profile(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.complete_customer_profile(TEXT, TEXT, BOOLEAN);

-- 3. Hardened RPC Implementation (VOLATILE for Database Mutations)
CREATE OR REPLACE FUNCTION public.complete_customer_profile(
  p_display_name TEXT,
  p_phone TEXT,
  p_eligibility_confirmed BOOLEAN
)
RETURNS JSONB AS $$
DECLARE
  v_uid UUID;
  v_clean_name TEXT;
  v_clean_phone TEXT;
  v_profile_role TEXT;
  v_profile_is_active BOOLEAN;
  v_profile_completed_at TIMESTAMPTZ;
  v_eligibility_confirmed_at TIMESTAMPTZ;
BEGIN
  -- A. Authentication Authority
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- B. Verify Actor is an ACTIVE CUSTOMER in public.profiles
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

  -- C. Database Server-Side Checkbox Verification
  IF p_eligibility_confirmed IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'กรุณายืนยันเงื่อนไขก่อนดำเนินการ';
  END IF;

  -- D. Input Validations
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

  -- E. Update public.profiles (display_name, phone)
  -- Triggers existing trig_01_profile_sync_customer to sync to public.customers
  UPDATE public.profiles
  SET
    display_name = v_clean_name,
    phone = v_clean_phone,
    updated_at = pg_catalog.now()
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer profile not found';
  END IF;

  -- F. Stamp Completion Timestamps in public.customers
  -- Preserves initial confirmation timestamps using COALESCE if called repeatedly
  UPDATE public.customers
  SET
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer master record not found';
  END IF;

  -- G. Return Actual Stored Data
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'user_id', v_uid,
    'display_name', v_clean_name,
    'phone', v_clean_phone,
    'profile_completed_at', v_profile_completed_at,
    'eligibility_confirmed_at', v_eligibility_confirmed_at
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE SET search_path = '';

-- H. Least Privilege Grants
REVOKE ALL ON FUNCTION public.complete_customer_profile(TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_customer_profile(TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_customer_profile(TEXT, TEXT, BOOLEAN) TO authenticated;
