-- ====================================================================
-- 157 TATTOO - PHASE 2A MIGRATION: ESTIMATE REQUESTS
-- OWNER-MANAGED ARTISTS ARCHITECTURE (NO ARTIST AUTH)
-- DATABASE TIMESTAMP AUTHORITY, IMMUTABLE DATA OWNERSHIP, ATOMIC RPCs
-- ====================================================================

-- 1. Create public.estimate_requests Table
CREATE TABLE IF NOT EXISTS public.estimate_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  reference_images TEXT[] NOT NULL DEFAULT '{}',
  width_cm NUMERIC(6,2),
  height_cm NUMERIC(6,2),
  placement TEXT NOT NULL,
  style TEXT,
  description TEXT,
  preferred_date DATE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  quoted_price NUMERIC(12,2),
  estimated_duration_minutes INTEGER,
  deposit_required NUMERIC(12,2),
  quote_note TEXT,
  quoted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  -- Status check constraint
  CONSTRAINT estimate_status_check CHECK (status IN ('PENDING', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED')),

  -- Numerical validation constraints
  CONSTRAINT width_cm_positive CHECK (width_cm IS NULL OR width_cm > 0),
  CONSTRAINT height_cm_positive CHECK (height_cm IS NULL OR height_cm > 0),
  CONSTRAINT quoted_price_non_negative CHECK (quoted_price IS NULL OR quoted_price >= 0),
  CONSTRAINT deposit_required_non_negative CHECK (deposit_required IS NULL OR deposit_required >= 0),
  CONSTRAINT estimated_duration_minutes_positive CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0),
  CONSTRAINT deposit_less_than_or_equal_to_price CHECK (
    (deposit_required IS NULL OR quoted_price IS NULL) OR (deposit_required <= quoted_price)
  )
);

-- 2. Performance & Query Indexes
CREATE INDEX IF NOT EXISTS idx_estimate_customer ON public.estimate_requests(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_estimate_artist ON public.estimate_requests(artist_id);
CREATE INDEX IF NOT EXISTS idx_estimate_status ON public.estimate_requests(status);
CREATE INDEX IF NOT EXISTS idx_estimate_created ON public.estimate_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_estimate_artist_status ON public.estimate_requests(artist_id, status);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.estimate_requests ENABLE ROW LEVEL SECURITY;

-- 4. Revoke and Grant Permissions (Principle of Least Privilege)
REVOKE ALL ON public.estimate_requests FROM PUBLIC;
REVOKE ALL ON public.estimate_requests FROM anon;
REVOKE ALL ON public.estimate_requests FROM authenticated;

-- Anon has NO table access
-- Authenticated users (Customers & Admins) have SELECT, INSERT, UPDATE grants
-- (Customer direct UPDATE is strictly blocked by RLS policies)
GRANT SELECT, INSERT, UPDATE ON public.estimate_requests TO authenticated;
GRANT ALL ON public.estimate_requests TO service_role;

-- 5. Row Level Security Policies

-- Drop any previous draft policies for clean idempotent rerun
DROP POLICY IF EXISTS "Select policy for estimate_requests" ON public.estimate_requests;
DROP POLICY IF EXISTS "Insert policy for estimate_requests" ON public.estimate_requests;
DROP POLICY IF EXISTS "Update policy for estimate_requests" ON public.estimate_requests;
DROP POLICY IF EXISTS "Customer read own estimate requests policy" ON public.estimate_requests;
DROP POLICY IF EXISTS "Admin read all estimate requests policy" ON public.estimate_requests;
DROP POLICY IF EXISTS "Customer insert estimate request policy" ON public.estimate_requests;
DROP POLICY IF EXISTS "Admin update estimate request policy" ON public.estimate_requests;

-- POLICY A: Customer Can Read ONLY Their Own Estimate Requests
CREATE POLICY "Customer read own estimate requests policy"
ON public.estimate_requests
FOR SELECT
TO authenticated
USING (
  customer_user_id = auth.uid()
);

-- POLICY B: Admin Can Read ALL Estimate Requests
CREATE POLICY "Admin read all estimate requests policy"
ON public.estimate_requests
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

-- POLICY C: Customer Can Insert ONLY Their Own Request in PENDING Status
-- Disallows customer from setting prices, notes, status, or timestamps on creation
-- Validates that chosen artist_id (if specified) is currently active and visible
CREATE POLICY "Customer insert estimate request policy"
ON public.estimate_requests
FOR INSERT
TO authenticated
WITH CHECK (
  customer_user_id = auth.uid()
  AND status = 'PENDING'
  AND quoted_price IS NULL
  AND estimated_duration_minutes IS NULL
  AND deposit_required IS NULL
  AND quote_note IS NULL
  AND quoted_at IS NULL
  AND accepted_at IS NULL
  AND rejected_at IS NULL
  AND (
    artist_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.artists
      WHERE artists.id = estimate_requests.artist_id
        AND artists.is_active = true
        AND artists.is_visible = true
    )
  )
);

-- POLICY D: Admin ONLY Direct UPDATE Policy
-- Customers have NO direct UPDATE policy (Blocked: 0 rows / permission denied)
CREATE POLICY "Admin update estimate request policy"
ON public.estimate_requests
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

-- 6. Trigger Function: INSERT Timestamp & Field Authority
CREATE OR REPLACE FUNCTION public.handle_estimate_request_insert_defaults()
RETURNS TRIGGER AS $$
BEGIN
  -- Overwrite any client-supplied timestamps or admin fields with trusted DB defaults
  NEW.created_at := pg_catalog.now();
  NEW.updated_at := pg_catalog.now();
  NEW.status := 'PENDING';
  NEW.quoted_at := NULL;
  NEW.accepted_at := NULL;
  NEW.rejected_at := NULL;
  NEW.quoted_price := NULL;
  NEW.estimated_duration_minutes := NULL;
  NEW.deposit_required := NULL;
  NEW.quote_note := NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- 7. Trigger Function: Database-Level Business State Machine & UPDATE Authority
CREATE OR REPLACE FUNCTION public.handle_estimate_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
BEGIN
  -- 1. Terminal Record Immutability Check
  IF OLD.status IN ('ACCEPTED', 'REJECTED', 'EXPIRED') THEN
    RAISE EXCEPTION 'Estimate request % is in terminal status % and cannot be modified', OLD.id, OLD.status;
  END IF;

  -- 2. Customer Ownership Immutability Check
  IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
    RAISE EXCEPTION 'customer_user_id cannot be changed';
  END IF;

  -- 3. Created At Immutability Check
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be changed';
  END IF;

  -- 4. Customer-Submitted Request Content Immutability Check
  IF (
    NEW.reference_images IS DISTINCT FROM OLD.reference_images
    OR NEW.width_cm IS DISTINCT FROM OLD.width_cm
    OR NEW.height_cm IS DISTINCT FROM OLD.height_cm
    OR NEW.placement IS DISTINCT FROM OLD.placement
    OR NEW.style IS DISTINCT FROM OLD.style
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.preferred_date IS DISTINCT FROM OLD.preferred_date
  ) THEN
    RAISE EXCEPTION 'Customer-submitted request fields cannot be modified after creation';
  END IF;

  -- 5. Identify Actor
  v_is_admin := private.is_admin();
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);

  -- 6. Validate Allowed Status Transitions & Enforce Actor Rules
  IF NEW.status IS DISTINCT FROM OLD.status THEN

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status = 'QUOTED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can quote estimate requests';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can reject pending estimate requests';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status;
      END IF;

    -- QUOTED transitions
    ELSIF OLD.status = 'QUOTED' THEN
      IF NEW.status = 'ACCEPTED' THEN
        -- ACCEPTED must only be done by Customer Owner via RPC (Admin direct spoofing blocked)
        IF NOT v_is_customer_owner THEN
          RAISE EXCEPTION 'Only the customer owner can accept estimate quotes';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        -- Both Customer Owner (via RPC) and Admin can reject
        IF NOT (v_is_customer_owner OR v_is_admin) THEN
          RAISE EXCEPTION 'Unauthorized to reject estimate quote';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can expire estimate quotes';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from QUOTED to %', NEW.status;
      END IF;
    END IF;

  END IF;

  -- 7. Validate Admin Artist Assignment (Active Artist Requirement)
  IF NEW.artist_id IS NOT NULL AND (OLD.artist_id IS DISTINCT FROM NEW.artist_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.artists
      WHERE artists.id = NEW.artist_id AND artists.is_active = true
    ) THEN
      RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', NEW.artist_id;
    END IF;
  END IF;

  -- 8. Validate Quote Fields When Status is QUOTED
  IF NEW.status = 'QUOTED' THEN
    IF NEW.quoted_price IS NULL OR NEW.quoted_price < 0 THEN
      RAISE EXCEPTION 'quoted_price >= 0 is required when estimate status is QUOTED';
    END IF;
    IF NEW.deposit_required IS NOT NULL THEN
      IF NEW.deposit_required < 0 OR NEW.deposit_required > NEW.quoted_price THEN
        RAISE EXCEPTION 'deposit_required must be between 0 and quoted_price';
      END IF;
    END IF;
    IF NEW.estimated_duration_minutes IS NOT NULL AND NEW.estimated_duration_minutes <= 0 THEN
      RAISE EXCEPTION 'estimated_duration_minutes must be greater than 0';
    END IF;
  END IF;

  -- 9. Complete Database Authority Over System Status Timestamps (Deterministic Overwrite)
  IF OLD.status = 'PENDING' AND NEW.status = 'QUOTED' THEN
    NEW.quoted_at := pg_catalog.now();
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := OLD.rejected_at;
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'ACCEPTED' THEN
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := pg_catalog.now();
    NEW.rejected_at := OLD.rejected_at;
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'REJECTED' THEN
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'EXPIRED' THEN
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := OLD.rejected_at;
  ELSE
    -- No status change: preserve all trusted status timestamps exactly as they were
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := OLD.rejected_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- 8. Trigger Function: Updated At (SECURITY INVOKER)
CREATE OR REPLACE FUNCTION public.handle_estimate_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- 9. Deterministic Trigger Attachment (00: Insert Defaults -> 01: Business Validation -> 02: Updated At)
DROP TRIGGER IF EXISTS trig_00_estimate_insert_defaults ON public.estimate_requests;
CREATE TRIGGER trig_00_estimate_insert_defaults
  BEFORE INSERT ON public.estimate_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_estimate_request_insert_defaults();

DROP TRIGGER IF EXISTS trig_01_estimate_status_transition ON public.estimate_requests;
CREATE TRIGGER trig_01_estimate_status_transition
  BEFORE UPDATE ON public.estimate_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_estimate_status_transition();

DROP TRIGGER IF EXISTS trig_02_estimate_updated_at ON public.estimate_requests;
CREATE TRIGGER trig_02_estimate_updated_at
  BEFORE UPDATE ON public.estimate_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_estimate_requests_updated_at();

-- 10. RPC: Customer Secure Accept Quote Action (Atomic Conditional UPDATE)
CREATE OR REPLACE FUNCTION public.accept_estimate_quote(p_estimate_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Atomic conditional update: prevents race conditions and eliminates info leakage
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED'
  WHERE
    id = p_estimate_id
    AND customer_user_id = auth.uid()
    AND status = 'QUOTED'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Estimate request cannot be accepted';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'status', 'ACCEPTED',
    'estimate_id', v_updated_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 11. RPC: Customer Secure Reject Quote Action (Atomic Conditional UPDATE)
CREATE OR REPLACE FUNCTION public.reject_estimate_quote(p_estimate_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Atomic conditional update: prevents race conditions and eliminates info leakage
  UPDATE public.estimate_requests
  SET
    status = 'REJECTED'
  WHERE
    id = p_estimate_id
    AND customer_user_id = auth.uid()
    AND status = 'QUOTED'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Estimate request cannot be rejected';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'status', 'REJECTED',
    'estimate_id', v_updated_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 12. Hardened Function Permissions
REVOKE ALL ON FUNCTION public.accept_estimate_quote(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_estimate_quote(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_estimate_quote(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.reject_estimate_quote(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_estimate_quote(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_estimate_quote(UUID) TO authenticated;
