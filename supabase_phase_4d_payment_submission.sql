-- ============================================================================
-- 157 TATTOO — PHASE 4D-A MIGRATION (REVISED)
-- NORMAL TATTOO BOOKING — QR PAYMENT, SLIP SUBMISSION & ADMIN VERIFICATION
-- (DATABASE, STORAGE, SECURITY & CANONICAL RPCs)
-- ============================================================================
-- Revisions:
-- 1. Removed ALL mock/fake bank account and seed data from payment_settings.
-- 2. Added dedicated private storage bucket 'shop-payment-assets' for shop QR.
-- 3. Added strict WAITING_DEPOSIT status guard in admin_approve_payment_submission.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Create public.booking_payment_submissions Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_payment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  claimed_amount NUMERIC(12,2) NOT NULL,
  slip_path TEXT NOT NULL,
  reference_no TEXT,
  customer_note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  CONSTRAINT chk_submission_claimed_amount CHECK (claimed_amount > 0),
  CONSTRAINT chk_submission_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
);

-- Unique constraint: maximum 1 active PENDING submission per booking
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_submission 
ON public.booking_payment_submissions (booking_id) 
WHERE (status = 'PENDING');

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_submissions_booking ON public.booking_payment_submissions(booking_id);
CREATE INDEX IF NOT EXISTS idx_submissions_customer ON public.booking_payment_submissions(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON public.booking_payment_submissions(status);

-- ----------------------------------------------------------------------------
-- 2. Create public.payment_settings Table (No Fake Data / NULLable Config)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_qr_path TEXT,
  payment_display_name TEXT DEFAULT NULL,
  bank_name TEXT DEFAULT NULL,
  account_no TEXT DEFAULT NULL,
  account_name TEXT DEFAULT NULL,
  promptpay_id TEXT DEFAULT NULL,
  payment_instruction TEXT DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT
);

-- Enforce single active configuration constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_active_payment_settings
ON public.payment_settings (is_active)
WHERE (is_active = true);

-- ----------------------------------------------------------------------------
-- 3. Create Private Storage Buckets
--    A. booking-payment-slips (Customer Uploaded Slips)
--    B. shop-payment-assets (Admin Uploaded Shop QR & Assets)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'booking-payment-slips',
    'booking-payment-slips',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  ),
  (
    'shop-payment-assets',
    'shop-payment-assets',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

-- ----------------------------------------------------------------------------
-- 4. Enable Row Level Security & Policies
-- ----------------------------------------------------------------------------
ALTER TABLE public.booking_payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_payment_submissions FROM PUBLIC, anon;
REVOKE ALL ON public.payment_settings FROM PUBLIC, anon;

GRANT SELECT ON public.booking_payment_submissions TO authenticated;
GRANT SELECT ON public.payment_settings TO authenticated;
GRANT ALL ON public.booking_payment_submissions TO service_role;
GRANT ALL ON public.payment_settings TO service_role;

DROP POLICY IF EXISTS "Customer read own submissions" ON public.booking_payment_submissions;
CREATE POLICY "Customer read own submissions"
ON public.booking_payment_submissions
FOR SELECT
TO authenticated
USING (
  customer_user_id = auth.uid() OR private.is_admin()
);

DROP POLICY IF EXISTS "Active payment settings readable" ON public.payment_settings;
CREATE POLICY "Active payment settings readable"
ON public.payment_settings
FOR SELECT
TO authenticated
USING (
  is_active = true OR private.is_admin()
);

DROP POLICY IF EXISTS "Admin manage payment settings" ON public.payment_settings;
CREATE POLICY "Admin manage payment settings"
ON public.payment_settings
FOR ALL
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

-- Storage Policies: booking-payment-slips
DROP POLICY IF EXISTS "Customer upload own slips" ON storage.objects;
CREATE POLICY "Customer upload own slips"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'booking-payment-slips'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Customer read own slips or Admin read all" ON storage.objects;
CREATE POLICY "Customer read own slips or Admin read all"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'booking-payment-slips'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR private.is_admin()
  )
);

-- Storage Policies: shop-payment-assets (Admin Manage, Authenticated Read)
DROP POLICY IF EXISTS "Admin manage shop payment assets" ON storage.objects;
CREATE POLICY "Admin manage shop payment assets"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'shop-payment-assets' AND private.is_admin()
)
WITH CHECK (
  bucket_id = 'shop-payment-assets' AND private.is_admin()
);

DROP POLICY IF EXISTS "Authenticated read shop payment assets" ON storage.objects;
CREATE POLICY "Authenticated read shop payment assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'shop-payment-assets'
);

-- ----------------------------------------------------------------------------
-- 5. Canonical RPC: submit_booking_payment_slip
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_booking_payment_slip(
  p_booking_id UUID,
  p_claimed_amount NUMERIC,
  p_slip_path TEXT,
  p_reference_no TEXT DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid UUID;
  v_booking RECORD;
  v_submission_id UUID;
  v_expected_path_prefix TEXT;
BEGIN
  -- 1. Identify Caller strictly from auth.uid()
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate claimed_amount
  IF p_claimed_amount IS NULL OR p_claimed_amount <= 0 THEN
    RAISE EXCEPTION 'claimed_amount must be greater than 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate slip_path
  IF p_slip_path IS NULL OR trim(p_slip_path) = '' THEN
    RAISE EXCEPTION 'slip_path is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Validate Booking Ownership & Status
  SELECT id, customer_user_id, status
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.customer_user_id != v_caller_uid THEN
    RAISE EXCEPTION 'Access denied: You do not own booking %', p_booking_id
      USING ERRCODE = '42501';
  END IF;

  IF v_booking.status != 'WAITING_DEPOSIT' THEN
    RAISE EXCEPTION 'Cannot submit payment slip for booking % in % status; booking must be in WAITING_DEPOSIT status',
      p_booking_id, v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Validate slip_path pattern: must start with {auth.uid()}/{booking_id}/
  v_expected_path_prefix := v_caller_uid::text || '/' || p_booking_id::text || '/';
  IF NOT (p_slip_path LIKE (v_expected_path_prefix || '%')) THEN
    RAISE EXCEPTION 'Invalid slip_path: Path must start with %', v_expected_path_prefix
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Check if an active PENDING submission already exists
  IF EXISTS (
    SELECT 1 FROM public.booking_payment_submissions
    WHERE booking_id = p_booking_id
      AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'An active payment submission is already pending review for this booking'
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. Insert submission
  INSERT INTO public.booking_payment_submissions (
    booking_id,
    customer_user_id,
    claimed_amount,
    slip_path,
    reference_no,
    customer_note,
    status,
    submitted_at,
    created_at,
    updated_at
  )
  VALUES (
    p_booking_id,
    v_caller_uid,
    p_claimed_amount,
    p_slip_path,
    trim(p_reference_no),
    trim(p_customer_note),
    'PENDING',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_submission_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'status', 'PENDING',
    'claimed_amount', p_claimed_amount
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Canonical RPC: admin_approve_payment_submission
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_approve_payment_submission(
  p_submission_id UUID,
  p_verified_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'BANK_TRANSFER',
  p_reference_no TEXT DEFAULT NULL,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_uid UUID;
  v_submission RECORD;
  v_booking RECORD;
  v_payment_id UUID;
BEGIN
  -- 1. Verify Admin Authority
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only active Admin can approve payment submissions'
      USING ERRCODE = '42501';
  END IF;

  v_admin_uid := auth.uid();

  -- 2. Validate verified_amount
  IF p_verified_amount IS NULL OR p_verified_amount <= 0 THEN
    RAISE EXCEPTION 'verified_amount must be greater than 0'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Validate payment_method enum
  IF p_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'QR', 'OTHER') THEN
    RAISE EXCEPTION 'Invalid payment_method: %. Allowed values: CASH, BANK_TRANSFER, QR, OTHER', p_payment_method
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock and Fetch Submission FOR UPDATE
  SELECT id, booking_id, customer_user_id, claimed_amount, status, reference_no
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'Payment submission % not found', p_submission_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'Payment submission % is not PENDING (current status: %)', p_submission_id, v_submission.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Lock and Fetch Associated Booking FOR UPDATE
  SELECT id, status INTO v_booking
  FROM public.bookings
  WHERE id = v_submission.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Associated booking % not found', v_submission.booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Safety Check: Deposit submissions may ONLY be approved when booking is actively WAITING_DEPOSIT
  IF v_booking.status != 'WAITING_DEPOSIT' THEN
    RAISE EXCEPTION 'Cannot approve deposit payment submission for booking % in % status; booking must be in WAITING_DEPOSIT status',
      v_booking.id, v_booking.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Insert official booking payment record (Triggers handle_booking_payments_before_insert & reconcile)
  INSERT INTO public.booking_payments (
    booking_id,
    payment_type,
    amount,
    payment_method,
    reference_no,
    note,
    status,
    paid_at,
    created_at,
    updated_at
  )
  VALUES (
    v_submission.booking_id,
    'DEPOSIT',
    p_verified_amount,
    p_payment_method,
    COALESCE(trim(p_reference_no), v_submission.reference_no),
    p_admin_note,
    'RECORDED',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_payment_id;

  -- 7. Transition submission to APPROVED
  UPDATE public.booking_payment_submissions
  SET
    status = 'APPROVED',
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_admin_uid,
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'payment_id', v_payment_id,
    'booking_id', v_submission.booking_id,
    'verified_amount', p_verified_amount,
    'status', 'APPROVED'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Canonical RPC: admin_reject_payment_submission
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reject_payment_submission(
  p_submission_id UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_uid UUID;
  v_submission RECORD;
BEGIN
  -- 1. Verify Admin Authority
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Only active Admin can reject payment submissions'
      USING ERRCODE = '42501';
  END IF;

  v_admin_uid := auth.uid();

  -- 2. Validate rejection_reason
  IF p_rejection_reason IS NULL OR trim(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'rejection_reason is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Lock and Fetch Submission FOR UPDATE
  SELECT id, booking_id, status
  INTO v_submission
  FROM public.booking_payment_submissions
  WHERE id = p_submission_id
  FOR UPDATE;

  IF v_submission.id IS NULL THEN
    RAISE EXCEPTION 'Payment submission % not found', p_submission_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_submission.status != 'PENDING' THEN
    RAISE EXCEPTION 'Payment submission % is not PENDING (current status: %)', p_submission_id, v_submission.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Transition submission to REJECTED
  UPDATE public.booking_payment_submissions
  SET
    status = 'REJECTED',
    rejection_reason = trim(p_rejection_reason),
    reviewed_at = pg_catalog.now(),
    reviewed_by = v_admin_uid,
    updated_at = pg_catalog.now()
  WHERE id = p_submission_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'submission_id', p_submission_id,
    'booking_id', v_submission.booking_id,
    'status', 'REJECTED',
    'rejection_reason', trim(p_rejection_reason)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Function Permissions Lockdown
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.submit_booking_payment_slip(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_booking_payment_slip(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_payment_submission(UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_reject_payment_submission(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_payment_submission(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9. Reload Schema Cache
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
