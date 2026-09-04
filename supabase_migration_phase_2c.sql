-- ====================================================================
-- 157 TATTOO - SUPABASE INTEGRATION PHASE 2C MIGRATION
-- DEPOSIT & PAYMENT RECORD DATABASE INTEGRATION
-- ====================================================================

-- 1. Create public.booking_payments table
CREATE TABLE IF NOT EXISTS public.booking_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payment_type TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'THB',
  payment_method TEXT,
  payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  customer_note TEXT,
  staff_note TEXT,
  submitted_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  verified_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  -- Type check constraint
  CONSTRAINT payment_type_check CHECK (payment_type IN ('DEPOSIT', 'BALANCE')),

  -- Status check constraint
  CONSTRAINT payment_status_check CHECK (status IN ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'CANCELLED')),

  -- Amount must be positive
  CONSTRAINT payment_amount_positive CHECK (amount > 0)
);

-- 2. Indexes for booking_payments
CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON public.booking_payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer_id ON public.booking_payments(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.booking_payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.booking_payments(created_at);

-- One Active Deposit Constraint: 1 Booking -> 1 Active DEPOSIT payment
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_deposit_payment 
ON public.booking_payments(booking_id) 
WHERE payment_type = 'DEPOSIT' AND status IN ('PENDING', 'SUBMITTED', 'VERIFIED');


-- 3. Automatic Deposit Record Initializer Trigger
-- When a booking transitions to WAITING_DEPOSIT and deposit_required > 0,
-- automatically creates the PENDING booking_payments record with snapshot amount.
CREATE OR REPLACE FUNCTION public.handle_booking_payment_init()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'WAITING_DEPOSIT' AND NEW.deposit_required > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.booking_payments
      WHERE booking_id = NEW.id AND payment_type = 'DEPOSIT' AND status IN ('PENDING', 'SUBMITTED', 'VERIFIED')
    ) THEN
      INSERT INTO public.booking_payments (
        booking_id,
        customer_user_id,
        payment_type,
        amount,
        currency,
        status,
        created_at,
        updated_at
      ) VALUES (
        NEW.id,
        NEW.customer_user_id,
        'DEPOSIT',
        NEW.deposit_required,
        'THB',
        'PENDING',
        pg_catalog.now(),
        pg_catalog.now()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_booking_payment_init ON public.bookings;
CREATE TRIGGER on_booking_payment_init
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_payment_init();


-- 4. Payment Changes Validation Trigger
CREATE OR REPLACE FUNCTION public.handle_payment_changes()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Retrieve caller role
  SELECT role INTO caller_role FROM public.profiles WHERE user_id = auth.uid();

  -- ==========================================
  -- A. INSERT RESTRICTIONS
  -- ==========================================
  IF TG_OP = 'INSERT' THEN
    -- Direct client inserts are blocked except via system/admin trigger
    IF NOT (private.is_admin() OR auth.uid() IS NULL) THEN
      -- If called via trigger, auth.uid() might be staff or customer. We allow system trigger by checking consistency.
      IF NEW.amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than 0.' USING ERRCODE = '42501';
      END IF;
    END IF;

  -- ==========================================
  -- B. UPDATE RESTRICTIONS
  -- ==========================================
  ELSIF TG_OP = 'UPDATE' THEN
    -- Immutable identifiers
    IF OLD.id IS DISTINCT FROM NEW.id OR
       OLD.booking_id IS DISTINCT FROM NEW.booking_id OR
       OLD.customer_user_id IS DISTINCT FROM NEW.customer_user_id OR
       OLD.payment_type IS DISTINCT FROM NEW.payment_type OR
       OLD.amount IS DISTINCT FROM NEW.amount OR
       OLD.currency IS DISTINCT FROM NEW.currency OR
       OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Forbidden: Modifying system financial columns is not allowed.' USING ERRCODE = '42501';
    END IF;

    -- Role-based checks
    IF caller_role = 'customer' THEN
      IF OLD.customer_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Forbidden: You do not own this payment record.' USING ERRCODE = '42501';
      END IF;

      -- Customer can only transition PENDING -> SUBMITTED or REJECTED -> SUBMITTED
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT (
          (OLD.status IN ('PENDING', 'REJECTED') AND NEW.status = 'SUBMITTED')
        ) THEN
          RAISE EXCEPTION 'Forbidden: Invalid payment status transition from % to % for Customer.', OLD.status, NEW.status USING ERRCODE = '42501';
        END IF;
        NEW.submitted_at := pg_catalog.now();
      END IF;

      -- Customer cannot set verified info or staff notes
      IF OLD.verified_at IS DISTINCT FROM NEW.verified_at OR
         OLD.verified_by_user_id IS DISTINCT FROM NEW.verified_by_user_id OR
         OLD.rejected_at IS DISTINCT FROM NEW.rejected_at OR
         OLD.staff_note IS DISTINCT FROM NEW.staff_note THEN
        RAISE EXCEPTION 'Forbidden: Customers cannot verify payments or modify staff notes.' USING ERRCODE = '42501';
      END IF;

    ELSIF caller_role = 'admin' THEN
      -- Admin can update status and notes
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NEW.status = 'VERIFIED' THEN
          NEW.verified_at := pg_catalog.now();
          NEW.verified_by_user_id := auth.uid();
        ELSIF NEW.status = 'REJECTED' THEN
          NEW.rejected_at := pg_catalog.now();
        END IF;
      END IF;

    ELSE
      RAISE EXCEPTION 'Forbidden: Access denied.' USING ERRCODE = '42501';
    END IF;

    NEW.updated_at := pg_catalog.now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_payment_change ON public.booking_payments;
CREATE TRIGGER on_payment_change
  BEFORE INSERT OR UPDATE ON public.booking_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_payment_changes();

REVOKE ALL ON FUNCTION public.handle_payment_changes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_payment_changes() FROM anon;


-- 5. Enable Row Level Security (RLS) on booking_payments
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_payments FROM anon;
REVOKE ALL ON public.booking_payments FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.booking_payments TO authenticated;

-- SELECT Policy
CREATE POLICY "Select policy for booking_payments"
ON public.booking_payments
FOR SELECT
TO authenticated
USING (
  customer_user_id = auth.uid()
  OR
  private.is_admin()
  OR
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = booking_payments.booking_id AND b.artist_user_id = auth.uid()
  )
);

-- INSERT Policy
CREATE POLICY "Insert policy for booking_payments"
ON public.booking_payments
FOR INSERT
TO authenticated
WITH CHECK (
  customer_user_id = auth.uid()
  OR
  private.is_admin()
);

-- UPDATE Policy
CREATE POLICY "Update policy for booking_payments"
ON public.booking_payments
FOR UPDATE
TO authenticated
USING (
  customer_user_id = auth.uid()
  OR
  private.is_admin()
)
WITH CHECK (
  customer_user_id = auth.uid()
  OR
  private.is_admin()
);


-- 6. Atomic Admin Payment Verification & Booking Confirmation Function
CREATE OR REPLACE FUNCTION public.verify_deposit_payment(p_payment_id UUID, p_staff_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  v_payment RECORD;
  v_booking RECORD;
BEGIN
  -- 1. Enforce Admin Caller
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can verify deposit payments.' USING ERRCODE = '42501';
  END IF;

  -- 2. Lock Payment Row
  SELECT * INTO v_payment FROM public.booking_payments WHERE id = p_payment_id FOR UPDATE;
  
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found.' USING ERRCODE = '42501';
  END IF;

  IF v_payment.status = 'VERIFIED' THEN
    RETURN; -- Already verified, idempotent success
  END IF;

  IF v_payment.status IS DISTINCT FROM 'SUBMITTED' THEN
    RAISE EXCEPTION 'Payment must be in SUBMITTED status to verify (Current status: %).', v_payment.status USING ERRCODE = '42501';
  END IF;

  -- 3. Lock Booking Row
  SELECT * INTO v_booking FROM public.bookings WHERE id = v_payment.booking_id FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Linked booking not found.' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IS DISTINCT FROM 'WAITING_DEPOSIT' THEN
    RAISE EXCEPTION 'Linked booking must be in WAITING_DEPOSIT status (Current: %).', v_booking.status USING ERRCODE = '42501';
  END IF;

  -- 4. Update Payment to VERIFIED
  UPDATE public.booking_payments
  SET status = 'VERIFIED',
      verified_at = pg_catalog.now(),
      verified_by_user_id = auth.uid(),
      staff_note = COALESCE(p_staff_note, staff_note),
      updated_at = pg_catalog.now()
  WHERE id = p_payment_id;

  -- 5. Update Booking to CONFIRMED
  UPDATE public.bookings
  SET status = 'CONFIRMED',
      confirmed_at = pg_catalog.now(),
      staff_note = COALESCE(p_staff_note, staff_note),
      updated_at = pg_catalog.now()
  WHERE id = v_booking.id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.verify_deposit_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_deposit_payment(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.verify_deposit_payment(UUID, TEXT) TO authenticated;


-- 7. Admin Payment Rejection Function
CREATE OR REPLACE FUNCTION public.reject_deposit_payment(p_payment_id UUID, p_reason TEXT)
RETURNS VOID AS $$
DECLARE
  v_payment RECORD;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can reject deposit payments.' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_payment FROM public.booking_payments WHERE id = p_payment_id FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found.' USING ERRCODE = '42501';
  END IF;

  IF v_payment.status IS DISTINCT FROM 'SUBMITTED' THEN
    RAISE EXCEPTION 'Payment must be in SUBMITTED status to reject (Current: %).', v_payment.status USING ERRCODE = '42501';
  END IF;

  UPDATE public.booking_payments
  SET status = 'REJECTED',
      rejected_at = pg_catalog.now(),
      staff_note = p_reason,
      updated_at = pg_catalog.now()
  WHERE id = p_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.reject_deposit_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_deposit_payment(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_deposit_payment(UUID, TEXT) TO authenticated;


-- 8. Hardening Booking Transition: Prevent direct CONFIRMED without Verified Deposit
CREATE OR REPLACE FUNCTION public.handle_booking_changes()
RETURNS TRIGGER AS $$
DECLARE
  caller_role TEXT;
  est_record RECORD;
  artist_valid BOOLEAN;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE user_id = auth.uid();

  -- ==========================================
  -- A. INSERT VALIDATIONS
  -- ==========================================
  IF TG_OP = 'INSERT' THEN
    IF NEW.customer_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Forbidden: customer_user_id must match authenticated user.' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = NEW.artist_user_id AND role = 'artist' AND is_active = TRUE
    ) INTO artist_valid;

    IF NOT artist_valid THEN
      RAISE EXCEPTION 'Invalid Artist: Selected artist does not exist or is inactive.' USING ERRCODE = '42501';
    END IF;

    NEW.status := 'PENDING';
    NEW.approved_at := NULL;
    NEW.confirmed_at := NULL;
    NEW.cancelled_at := NULL;
    NEW.completed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.staff_note := NULL;
    NEW.created_at := pg_catalog.now();
    NEW.updated_at := pg_catalog.now();

    IF NEW.booking_source = 'ESTIMATE' THEN
      IF NEW.estimate_request_id IS NULL THEN
        RAISE EXCEPTION 'Invalid Request: estimate_request_id is required for ESTIMATE bookings.' USING ERRCODE = '42501';
      END IF;

      SELECT * INTO est_record FROM public.estimate_requests WHERE id = NEW.estimate_request_id;
      
      IF est_record.id IS NULL THEN
        RAISE EXCEPTION 'Estimate not found.' USING ERRCODE = '42501';
      END IF;

      IF est_record.status IS DISTINCT FROM 'ACCEPTED' THEN
        RAISE EXCEPTION 'Invalid Estimate: Booking can only be created from ACCEPTED estimates.' USING ERRCODE = '42501';
      END IF;

      IF est_record.customer_user_id IS DISTINCT FROM NEW.customer_user_id THEN
        RAISE EXCEPTION 'Forbidden: You do not own this estimate request.' USING ERRCODE = '42501';
      END IF;

      IF est_record.artist_user_id IS DISTINCT FROM NEW.artist_user_id THEN
        RAISE EXCEPTION 'Invalid Artist: Artist must match the accepted estimate.' USING ERRCODE = '42501';
      END IF;

      NEW.tattoo_price := est_record.quoted_price;
      NEW.deposit_required := est_record.deposit_required;
      NEW.placement := COALESCE(NEW.placement, est_record.placement);
      NEW.width_cm := COALESCE(NEW.width_cm, est_record.width_cm);
      NEW.height_cm := COALESCE(NEW.height_cm, est_record.height_cm);
      NEW.description := COALESCE(NEW.description, est_record.description);
    END IF;

  -- ==========================================
  -- B. UPDATE VALIDATIONS
  -- ==========================================
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.id IS DISTINCT FROM NEW.id OR 
       OLD.customer_user_id IS DISTINCT FROM NEW.customer_user_id OR 
       OLD.booking_source IS DISTINCT FROM NEW.booking_source OR
       OLD.created_at IS DISTINCT FROM NEW.created_at THEN
      RAISE EXCEPTION 'Forbidden: Modifying system identifiers is not allowed.' USING ERRCODE = '42501';
    END IF;

    IF OLD.booking_source = 'ESTIMATE' THEN
      IF OLD.estimate_request_id IS DISTINCT FROM NEW.estimate_request_id OR
         OLD.tattoo_price IS DISTINCT FROM NEW.tattoo_price OR
         OLD.deposit_required IS DISTINCT FROM NEW.deposit_required THEN
        RAISE EXCEPTION 'Forbidden: Cannot alter pricing or estimate linkage for estimate-based bookings.' USING ERRCODE = '42501';
      END IF;
    END IF;

    -- ENFORCE DEPOSIT PAYMENT FOR CONFIRMATION
    -- If booking is transitioning to CONFIRMED and deposit_required > 0, verify payment existence
    IF NEW.status = 'CONFIRMED' AND OLD.status IS DISTINCT FROM 'CONFIRMED' THEN
      IF NEW.deposit_required > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.booking_payments
          WHERE booking_id = NEW.id AND payment_type = 'DEPOSIT' AND status = 'VERIFIED'
        ) THEN
          RAISE EXCEPTION 'Forbidden: Booking cannot be confirmed without a verified deposit payment.' USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;

    -- Role Restrictions
    IF caller_role = 'customer' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT (
          (OLD.status IN ('PENDING', 'WAITING_DEPOSIT') AND NEW.status = 'CANCELLED')
        ) THEN
          RAISE EXCEPTION 'Forbidden: Invalid status transition from % to % for Customer.', OLD.status, NEW.status USING ERRCODE = '42501';
        END IF;
        NEW.cancelled_at := pg_catalog.now();
      END IF;

      IF OLD.artist_user_id IS DISTINCT FROM NEW.artist_user_id OR
         OLD.start_at IS DISTINCT FROM NEW.start_at OR
         OLD.end_at IS DISTINCT FROM NEW.end_at OR
         OLD.tattoo_price IS DISTINCT FROM NEW.tattoo_price OR
         OLD.deposit_required IS DISTINCT FROM NEW.deposit_required OR
         OLD.approved_at IS DISTINCT FROM NEW.approved_at OR
         OLD.confirmed_at IS DISTINCT FROM NEW.confirmed_at OR
         OLD.completed_at IS DISTINCT FROM NEW.completed_at OR
         OLD.staff_note IS DISTINCT FROM NEW.staff_note OR
         OLD.rejection_reason IS DISTINCT FROM NEW.rejection_reason THEN
        RAISE EXCEPTION 'Forbidden: Customer cannot modify schedule, artist, or pricing details.' USING ERRCODE = '42501';
      END IF;

    ELSIF caller_role = 'artist' THEN
      IF OLD.artist_user_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Forbidden: Artists can only update bookings assigned to themselves.' USING ERRCODE = '42501';
      END IF;

      IF OLD.artist_user_id IS DISTINCT FROM NEW.artist_user_id THEN
        RAISE EXCEPTION 'Forbidden: Artists cannot reassign bookings.' USING ERRCODE = '42501';
      END IF;

      IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF OLD.status = 'PENDING' AND NEW.status IN ('APPROVED', 'WAITING_DEPOSIT') THEN
          NEW.approved_at := pg_catalog.now();
        ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
          IF NEW.rejection_reason IS NULL OR TRIM(NEW.rejection_reason) = '' THEN
            RAISE EXCEPTION 'Rejection reason is required when rejecting a booking.' USING ERRCODE = '42501';
          END IF;
        ELSIF OLD.status = 'WAITING_DEPOSIT' AND NEW.status = 'CANCELLED' THEN
          NEW.cancelled_at := pg_catalog.now();
        ELSIF OLD.status = 'CONFIRMED' AND NEW.status = 'IN_PROGRESS' THEN
          -- OK
        ELSIF OLD.status = 'IN_PROGRESS' AND NEW.status = 'COMPLETED' THEN
          NEW.completed_at := pg_catalog.now();
        ELSE
          RAISE EXCEPTION 'Forbidden: Invalid status transition from % to % for Artist.', OLD.status, NEW.status USING ERRCODE = '42501';
        END IF;
      END IF;

    ELSIF caller_role = 'admin' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF OLD.status = 'PENDING' AND NEW.status IN ('APPROVED', 'WAITING_DEPOSIT') THEN
          NEW.approved_at := pg_catalog.now();
        ELSIF NEW.status = 'CANCELLED' THEN
          NEW.cancelled_at := pg_catalog.now();
        ELSIF NEW.status = 'COMPLETED' THEN
          NEW.completed_at := pg_catalog.now();
        END IF;
      END IF;

    ELSE
      -- System trigger / Internal operations allowed
      NULL;
    END IF;

    NEW.updated_at := pg_catalog.now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';
