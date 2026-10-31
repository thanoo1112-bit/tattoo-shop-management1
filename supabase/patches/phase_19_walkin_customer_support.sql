-- ====================================================================
-- 157 TATTOO — PHASE 19: WALK-IN / OFFLINE CUSTOMER SUPPORT MIGRATION
-- ====================================================================
-- IMPORTANT:
-- This SQL Patch is PHASE 1 ONLY.
-- MUST BE EXECUTED IN SUPABASE SQL EDITOR BEFORE DEPLOYING PHASE 2 APP CODE.
--
-- AUDIT NOTICE:
-- To check for duplicate phone numbers in public.customers prior to future unique constraints,
-- run the following query:
--
-- SELECT phone, COUNT(*) AS duplicate_count, ARRAY_AGG(id) AS customer_ids, ARRAY_AGG(user_id) AS user_ids
-- FROM public.customers
-- WHERE phone IS NOT NULL AND phone != ''
-- GROUP BY phone
-- HAVING COUNT(*) > 1;
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1. MAKE public.customers.user_id NULLABLE & DROP UNIQUE CONSTRAINT
-- --------------------------------------------------------------------
-- Allow walk-in/offline customers to exist without an auth.users account
ALTER TABLE public.customers ALTER COLUMN user_id DROP NOT NULL;

-- Dynamically find and drop any UNIQUE constraint attached to public.customers(user_id)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu 
      ON tc.constraint_name = ccu.constraint_name 
      AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'UNIQUE' 
      AND tc.table_schema = 'public' 
      AND tc.table_name = 'customers' 
      AND ccu.column_name = 'user_id'
  ) LOOP
    EXECUTE 'ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;

-- Create partial UNIQUE index for user_id (Enforces unique user_id ONLY when user_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_user_id_unique
ON public.customers(user_id)
WHERE user_id IS NOT NULL;

-- --------------------------------------------------------------------
-- 2. CREATE NON-UNIQUE INDEX ON public.customers.phone
-- --------------------------------------------------------------------
-- Non-unique index for fast phone lookup without risking duplicate failures
CREATE INDEX IF NOT EXISTS idx_customers_phone
ON public.customers(phone)
WHERE phone IS NOT NULL;

-- --------------------------------------------------------------------
-- 3. ADD customer_id COLUMNS TO ESTIMATE, BOOKINGS, AND PAYMENTS
-- --------------------------------------------------------------------
ALTER TABLE public.estimate_requests 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.booking_payments 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- --------------------------------------------------------------------
-- 4. MAKE customer_user_id NULLABLE IN ESTIMATE, BOOKINGS, AND PAYMENTS
-- --------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estimate_requests' AND column_name = 'customer_user_id'
  ) THEN
    ALTER TABLE public.estimate_requests ALTER COLUMN customer_user_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_user_id'
  ) THEN
    ALTER TABLE public.bookings ALTER COLUMN customer_user_id DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'booking_payments' AND column_name = 'customer_user_id'
  ) THEN
    ALTER TABLE public.booking_payments ALTER COLUMN customer_user_id DROP NOT NULL;
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 5. CREATE PERFORMANCE INDEXES ON customer_id
-- --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_estimate_requests_customer_id 
ON public.estimate_requests(customer_id);

CREATE INDEX IF NOT EXISTS idx_bookings_customer_id 
ON public.bookings(customer_id);

CREATE INDEX IF NOT EXISTS idx_booking_payments_customer_id 
ON public.booking_payments(customer_id);

-- --------------------------------------------------------------------
-- 6. SCHEMA-AWARE SAFE BACKFILL OF customer_id
-- --------------------------------------------------------------------
DO $$
BEGIN
  -- 6.1 Backfill estimate_requests.customer_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estimate_requests' AND column_name = 'customer_user_id'
  ) THEN
    EXECUTE '
      UPDATE public.estimate_requests er
      SET customer_id = c.id
      FROM public.customers c
      WHERE er.customer_user_id = c.user_id AND er.customer_id IS NULL;
    ';
  END IF;

  -- 6.2 Backfill bookings.customer_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_user_id'
  ) THEN
    EXECUTE '
      UPDATE public.bookings b
      SET customer_id = c.id
      FROM public.customers c
      WHERE b.customer_user_id = c.user_id AND b.customer_id IS NULL;
    ';
  END IF;

  -- 6.3 Backfill booking_payments.customer_id (Schema-Aware: fallback to bookings.customer_id)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'booking_payments' AND column_name = 'customer_user_id'
  ) THEN
    EXECUTE '
      UPDATE public.booking_payments bp
      SET customer_id = c.id
      FROM public.customers c
      WHERE bp.customer_user_id = c.user_id AND bp.customer_id IS NULL;
    ';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'booking_payments' AND column_name = 'booking_id'
  ) THEN
    EXECUTE '
      UPDATE public.booking_payments bp
      SET customer_id = b.customer_id
      FROM public.bookings b
      WHERE bp.booking_id = b.id AND b.customer_id IS NOT NULL AND bp.customer_id IS NULL;
    ';
  END IF;
END $$;

-- --------------------------------------------------------------------
-- 7. HELPER FUNCTION: LINK CUSTOMER AUTH ACCOUNT BY PHONE (SCHEMA-AWARE)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_customer_auth_by_phone(
  p_user_id UUID,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_phone TEXT;
  v_norm_phone TEXT;
  v_customer_count INT;
  v_customer RECORD;
BEGIN
  -- 1. Input Validation
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'USER_ID_REQUIRED: p_user_id cannot be null' USING ERRCODE = '22004';
  END IF;

  IF p_phone IS NULL OR pg_catalog.btrim(p_phone) = '' THEN
    RAISE EXCEPTION 'PHONE_REQUIRED: p_phone cannot be empty' USING ERRCODE = '22004';
  END IF;

  -- 2. Normalize Phone Number to Thai 10-digit format (0XXXXXXXXX)
  v_raw_phone := pg_catalog.regexp_replace(p_phone, '\D', '', 'g');

  IF v_raw_phone LIKE '66%' AND pg_catalog.length(v_raw_phone) = 11 THEN
    v_norm_phone := '0' || pg_catalog.substr(v_raw_phone, 3);
  ELSIF v_raw_phone LIKE '0%' AND pg_catalog.length(v_raw_phone) = 10 THEN
    v_norm_phone := v_raw_phone;
  ELSE
    v_norm_phone := v_raw_phone;
  END IF;

  -- 3. Count Matching Customers by Phone
  SELECT COUNT(*) INTO v_customer_count
  FROM public.customers
  WHERE phone = v_norm_phone OR phone = p_phone;

  IF v_customer_count = 0 THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: No customer record found matching phone %', p_phone USING ERRCODE = 'P0002';
  END IF;

  IF v_customer_count > 1 THEN
    RAISE EXCEPTION 'MULTIPLE_CUSTOMERS_FOUND: Cannot auto-link because % customer records match phone %. Manual resolution required.', v_customer_count, p_phone USING ERRCODE = '23505';
  END IF;

  -- 4. Single Customer Match Resolution
  SELECT * INTO v_customer
  FROM public.customers
  WHERE phone = v_norm_phone OR phone = p_phone
  LIMIT 1;

  -- Check if customer record is already linked to another auth user
  IF v_customer.user_id IS NOT NULL AND v_customer.user_id != p_user_id THEN
    RAISE EXCEPTION 'CUSTOMER_ALREADY_LINKED: Customer record (id: %) is already linked to another auth user (%)', v_customer.id, v_customer.user_id USING ERRCODE = '23505';
  END IF;

  -- 5. Perform Atomic Linking
  UPDATE public.customers
  SET 
    user_id = p_user_id,
    updated_at = pg_catalog.now()
  WHERE id = v_customer.id;

  -- Schema-aware update of customer_user_id across related records
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estimate_requests' AND column_name = 'customer_user_id'
  ) THEN
    EXECUTE '
      UPDATE public.estimate_requests
      SET customer_user_id = $1
      WHERE customer_id = $2 AND customer_user_id IS NULL;
    ' USING p_user_id, v_customer.id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_user_id'
  ) THEN
    EXECUTE '
      UPDATE public.bookings
      SET customer_user_id = $1
      WHERE customer_id = $2 AND customer_user_id IS NULL;
    ' USING p_user_id, v_customer.id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'booking_payments' AND column_name = 'customer_user_id'
  ) THEN
    EXECUTE '
      UPDATE public.booking_payments
      SET customer_user_id = $1
      WHERE customer_id = $2 AND customer_user_id IS NULL;
    ' USING p_user_id, v_customer.id;
  END IF;

  -- Backfill booking_payments.customer_id via bookings if needed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'booking_payments' AND column_name = 'customer_id'
  ) THEN
    EXECUTE '
      UPDATE public.booking_payments bp
      SET customer_id = $1
      FROM public.bookings b
      WHERE bp.booking_id = b.id AND b.customer_id = $1 AND bp.customer_id IS NULL;
    ' USING v_customer.id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'customer_id', v_customer.id,
    'user_id', p_user_id,
    'phone', v_norm_phone,
    'message', 'Customer auth account linked successfully'
  );
END;
$$;

-- Revoke & Grant Execution Permissions
REVOKE ALL ON FUNCTION public.link_customer_auth_by_phone(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_customer_auth_by_phone(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_customer_auth_by_phone(UUID, TEXT) TO authenticated;

COMMIT;

-- ====================================================================
-- VERIFICATION QUERY (Run after executing this patch to verify success):
--
-- SELECT 
--   table_name, column_name, is_nullable, data_type 
-- FROM information_schema.columns 
-- WHERE table_schema = 'public' 
--   AND (
--     (table_name = 'customers' AND column_name IN ('id', 'user_id', 'phone')) OR
--     (table_name IN ('estimate_requests', 'bookings', 'booking_payments') AND column_name IN ('customer_id', 'customer_user_id'))
--   )
-- ORDER BY table_name, column_name;
-- ====================================================================
