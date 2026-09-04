-- ============================================================================
-- 157 TATTOO — PHASE 2C-A: PAYMENT / DEPOSIT FOUNDATION MIGRATION
-- (SECURITY HARDENED & ANTI-SPOOFING VERIFIED)
-- 
-- Creates:
-- 1. public.booking_payments table (Real money received by studio)
-- 2. Constraints (amount > 0, types, methods, status, void requirements)
-- 3. Before Insert Trigger: Database-authoritative created_by from auth.uid(),
--    enforces initial status = RECORDED, void fields must be null
-- 4. Immutability Trigger: Database-authoritative voided_by from auth.uid(),
--    voided_at from pg_catalog.now(), immutable financial fields
-- 5. updated_at Trigger
-- 6. Row Level Security (Admin full manage, Customer SELECT own, No DELETE)
-- 7. public.booking_payment_summary view WITH (security_invoker = true)
--
-- Security:
-- - Client CANNOT spoof created_by (overwritten by auth.uid())
-- - Client CANNOT spoof voided_by (overwritten by auth.uid())
-- - Client CANNOT initialize payment with VOIDED status
-- - security_invoker view without error-swallowing
-- - Hard DELETE is completely revoked from authenticated and anon
-- - No automated booking status changes in Phase 2C-A
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table: public.booking_payments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RECORDED',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  reference_no TEXT NULL,
  note TEXT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  voided_at TIMESTAMPTZ NULL,
  voided_by UUID NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  void_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  -- Constraints
  CONSTRAINT chk_booking_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT chk_booking_payments_type CHECK (
    payment_type IN ('DEPOSIT', 'BALANCE', 'FULL_PAYMENT', 'OTHER')
  ),
  CONSTRAINT chk_booking_payments_method CHECK (
    payment_method IN ('CASH', 'BANK_TRANSFER', 'QR', 'OTHER')
  ),
  CONSTRAINT chk_booking_payments_status CHECK (
    status IN ('RECORDED', 'VOIDED')
  ),
  CONSTRAINT chk_booking_payments_void_fields CHECK (
    status != 'VOIDED' OR (voided_at IS NOT NULL AND voided_by IS NOT NULL)
  )
);

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_booking_payments_booking_id ON public.booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_payments_status ON public.booking_payments(status);
CREATE INDEX IF NOT EXISTS idx_booking_payments_paid_at ON public.booking_payments(paid_at);

-- ----------------------------------------------------------------------------
-- 3. Triggers: Before Insert, Immutability & updated_at
-- ----------------------------------------------------------------------------

-- 3.1 Touch updated_at
CREATE OR REPLACE FUNCTION public.handle_booking_payments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_02_booking_payments_updated_at ON public.booking_payments;
CREATE TRIGGER trig_02_booking_payments_updated_at
  BEFORE UPDATE ON public.booking_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_payments_updated_at();

-- 3.2 Anti-Spoofing & Initial Status Enforcement on INSERT
CREATE OR REPLACE FUNCTION public.handle_booking_payments_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_uid UUID;
BEGIN
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'created_by must be set from authenticated context; auth.uid() is null'
      USING ERRCODE = 'P0001';
  END IF;

  -- Anti-Spoofing: Force created_by from auth.uid(), strictly ignoring client input
  NEW.created_by := v_caller_uid;

  -- Initial status MUST be RECORDED
  IF NEW.status IS NOT NULL AND NEW.status != 'RECORDED' THEN
    RAISE EXCEPTION 'New payment must start with RECORDED status; cannot be initialized as %', NEW.status
      USING ERRCODE = 'P0001';
  END IF;
  NEW.status := 'RECORDED';

  -- New payments must NOT have void fields populated
  IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
    RAISE EXCEPTION 'New payment cannot contain void fields upon creation'
      USING ERRCODE = 'P0001';
  END IF;
  NEW.voided_at := NULL;
  NEW.voided_by := NULL;
  NEW.void_reason := NULL;

  -- Ensure valid paid_at timestamp
  IF NEW.paid_at IS NULL THEN
    NEW.paid_at := pg_catalog.now();
  END IF;

  -- Timestamps
  NEW.created_at := pg_catalog.now();
  NEW.updated_at := pg_catalog.now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_00_booking_payments_before_insert ON public.booking_payments;
CREATE TRIGGER trig_00_booking_payments_before_insert
  BEFORE INSERT ON public.booking_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_payments_before_insert();

-- 3.3 Payment Immutability & Anti-Spoofing Void State Machine on UPDATE
CREATE OR REPLACE FUNCTION public.validate_booking_payment_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_caller_uid UUID;
BEGIN
  -- Terminal State: VOIDED records cannot be modified or reactivated
  IF OLD.status = 'VOIDED' THEN
    RAISE EXCEPTION 'Voided payment cannot be modified or reactivated'
      USING ERRCODE = 'P0001';
  END IF;

  -- While status is RECORDED and stays RECORDED:
  -- Core financial audit fields are completely immutable: booking_id, amount, payment_type, paid_at, created_by
  IF OLD.status = 'RECORDED' AND NEW.status = 'RECORDED' THEN
    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
      RAISE EXCEPTION 'booking_id is immutable once recorded'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.amount IS DISTINCT FROM OLD.amount THEN
      RAISE EXCEPTION 'amount is immutable once recorded; void and re-record if incorrect'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.payment_type IS DISTINCT FROM OLD.payment_type THEN
      RAISE EXCEPTION 'payment_type is immutable once recorded'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'paid_at timestamp is immutable once recorded'
        USING ERRCODE = 'P0001';
    END IF;
    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'created_by is immutable once recorded'
        USING ERRCODE = 'P0001';
    END IF;

    -- Void fields cannot be set while RECORDED
    IF NEW.voided_at IS NOT NULL OR NEW.voided_by IS NOT NULL OR NEW.void_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot set void fields while payment status is RECORDED'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Transition: RECORDED -> VOIDED
  IF OLD.status = 'RECORDED' AND NEW.status = 'VOIDED' THEN
    -- Financial details cannot be altered during void operation
    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.payment_type IS DISTINCT FROM OLD.payment_type
       OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
      RAISE EXCEPTION 'Payment financial details cannot be altered when voiding'
        USING ERRCODE = 'P0001';
    END IF;

    -- Anti-Spoofing: voided_by must come strictly from auth.uid()
    v_caller_uid := auth.uid();
    IF v_caller_uid IS NULL THEN
      RAISE EXCEPTION 'voided_by must be set from authenticated context; auth.uid() is null'
        USING ERRCODE = 'P0001';
    END IF;

    -- Database is the sole authority for void audit fields, strictly ignoring client input
    NEW.voided_by := v_caller_uid;
    NEW.voided_at := pg_catalog.now();

    -- Enforce non-empty void_reason
    IF NEW.void_reason IS NULL OR trim(NEW.void_reason) = '' THEN
      RAISE EXCEPTION 'void_reason must be provided when voiding a payment'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trig_01_booking_payments_immutability ON public.booking_payments;
CREATE TRIGGER trig_01_booking_payments_immutability
  BEFORE UPDATE ON public.booking_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_booking_payment_mutation();

-- ----------------------------------------------------------------------------
-- 4. Row Level Security (RLS) & Grants
-- ----------------------------------------------------------------------------
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

-- 4.1 Admin Policies: Full Management (SELECT, INSERT, UPDATE)
DROP POLICY IF EXISTS "admin_select_booking_payments" ON public.booking_payments;
CREATE POLICY "admin_select_booking_payments"
  ON public.booking_payments
  FOR SELECT
  TO authenticated
  USING (private.is_admin());

DROP POLICY IF EXISTS "admin_insert_booking_payments" ON public.booking_payments;
CREATE POLICY "admin_insert_booking_payments"
  ON public.booking_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (private.is_admin());

DROP POLICY IF EXISTS "admin_update_booking_payments" ON public.booking_payments;
CREATE POLICY "admin_update_booking_payments"
  ON public.booking_payments
  FOR UPDATE
  TO authenticated
  USING (private.is_admin())
  WITH CHECK (private.is_admin());

-- 4.2 Customer Policy: Read-Only for payments associated with customer's own booking
DROP POLICY IF EXISTS "customer_select_booking_payments" ON public.booking_payments;
CREATE POLICY "customer_select_booking_payments"
  ON public.booking_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = booking_payments.booking_id
        AND b.customer_user_id = auth.uid()
    )
  );

-- 4.3 Table-level Grants: Authenticated can SELECT, INSERT, UPDATE. DELETE is revoked!
REVOKE ALL ON public.booking_payments FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.booking_payments TO authenticated;
REVOKE DELETE ON public.booking_payments FROM authenticated, anon;

-- ----------------------------------------------------------------------------
-- 5. View: public.booking_payment_summary WITH (security_invoker = true)
-- ----------------------------------------------------------------------------
-- Mandatory: Must be security_invoker = true without error-swallowing
CREATE OR REPLACE VIEW public.booking_payment_summary
WITH (security_invoker = true)
AS
SELECT
  b.id AS booking_id,
  b.estimate_request_id,
  b.customer_user_id,
  b.artist_id,
  e.quoted_price,
  e.deposit_required,
  COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00)::NUMERIC(12,2) AS paid_total,
  CASE
    WHEN e.quoted_price IS NULL THEN NULL::NUMERIC(12,2)
    ELSE GREATEST(e.quoted_price - COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00), 0.00)::NUMERIC(12,2)
  END AS remaining_balance,
  CASE
    WHEN e.deposit_required IS NULL OR e.deposit_required <= 0 THEN true
    ELSE COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) >= e.deposit_required
  END AS deposit_paid,
  CASE
    WHEN e.quoted_price IS NULL OR e.quoted_price <= 0 THEN false
    ELSE COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) >= e.quoted_price
  END AS is_fully_paid
FROM public.bookings b
LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
LEFT JOIN public.booking_payments bp ON bp.booking_id = b.id
GROUP BY
  b.id,
  b.estimate_request_id,
  b.customer_user_id,
  b.artist_id,
  e.quoted_price,
  e.deposit_required;

GRANT SELECT ON public.booking_payment_summary TO authenticated;

COMMIT;

-- ----------------------------------------------------------------------------
-- 6. Reload PostgREST Schema Cache
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
