-- ====================================================================
-- 157 TATTOO - PHASE 2B MIGRATION: REGULAR TATTOO BOOKINGS & SESSIONS
-- OWNER-MANAGED ARTISTS ARCHITECTURE (NO ARTIST AUTH)
-- CANONICAL RPC BOOKING CREATION, BTREE_GIST DOUBLE-BOOKING EXCLUSION
-- DATABASE TIMESTAMP AUTHORITY, IMMUTABLE DATA OWNERSHIP, ATOMIC RPCs
-- ====================================================================

-- 0. Enable btree_gist extension for UUID + TIMESTAMPTZ exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Create public.bookings Table
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_request_id UUID NOT NULL UNIQUE REFERENCES public.estimate_requests(id) ON DELETE RESTRICT,
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  artist_id UUID REFERENCES public.artists(id) ON DELETE RESTRICT,
  requested_date DATE NOT NULL,
  requested_start_time TIME,
  customer_note TEXT,
  admin_note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  -- Status check constraint
  CONSTRAINT booking_status_check CHECK (status IN (
    'PENDING', 
    'APPROVED', 
    'WAITING_DEPOSIT', 
    'CONFIRMED', 
    'IN_PROGRESS', 
    'COMPLETED', 
    'REJECTED', 
    'CANCELLED'
  ))
);

-- 2. Create public.booking_sessions Table
CREATE TABLE IF NOT EXISTS public.booking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE RESTRICT,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE RESTRICT,
  session_number INTEGER NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),

  -- Numerical and range constraints
  CONSTRAINT session_number_positive CHECK (session_number > 0),
  CONSTRAINT session_time_valid CHECK (end_at > start_at),
  CONSTRAINT session_status_check CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT unique_booking_session UNIQUE (booking_id, session_number)
);

-- 3. Double-Booking Overlap Exclusion Constraint (GiST on artist_id + start_at..end_at)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_artist_double_booking'
  ) THEN
    ALTER TABLE public.booking_sessions
    ADD CONSTRAINT no_artist_double_booking
    EXCLUDE USING gist (
      artist_id WITH =,
      tstzrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (status IN ('SCHEDULED', 'IN_PROGRESS'));
  END IF;
END $$;

-- 4. Performance & Query Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON public.bookings(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_artist ON public.bookings(artist_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_estimate ON public.bookings(estimate_request_id);

CREATE INDEX IF NOT EXISTS idx_sessions_booking ON public.booking_sessions(booking_id);
CREATE INDEX IF NOT EXISTS idx_sessions_artist ON public.booking_sessions(artist_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.booking_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_timerange ON public.booking_sessions(start_at, end_at);

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_sessions ENABLE ROW LEVEL SECURITY;

-- 6. Revoke and Grant Permissions (Principle of Least Privilege)
REVOKE ALL ON public.bookings FROM PUBLIC;
REVOKE ALL ON public.bookings FROM anon;
REVOKE ALL ON public.bookings FROM authenticated;

REVOKE ALL ON public.booking_sessions FROM PUBLIC;
REVOKE ALL ON public.booking_sessions FROM anon;
REVOKE ALL ON public.booking_sessions FROM authenticated;

-- Direct Table Grants:
-- Customer and Admin have SELECT, UPDATE grants (strictly gated by RLS)
-- DIRECT INSERT is DENIED on bookings (All creation goes through create_booking_from_estimate RPC)
-- Admin ONLY has INSERT / UPDATE on booking_sessions
GRANT SELECT, UPDATE ON public.bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.booking_sessions TO authenticated;

GRANT ALL ON public.bookings TO service_role;
GRANT ALL ON public.booking_sessions TO service_role;

-- 7. Row Level Security Policies

-- Drop any previous draft policies for clean idempotent rerun
DROP POLICY IF EXISTS "Customer read own bookings policy" ON public.bookings;
DROP POLICY IF EXISTS "Admin read all bookings policy" ON public.bookings;
DROP POLICY IF EXISTS "Admin update bookings policy" ON public.bookings;
DROP POLICY IF EXISTS "Customer insert bookings policy" ON public.bookings;
DROP POLICY IF EXISTS "Admin insert bookings policy" ON public.bookings;

DROP POLICY IF EXISTS "Customer read own booking sessions policy" ON public.booking_sessions;
DROP POLICY IF EXISTS "Admin read all booking sessions policy" ON public.booking_sessions;
DROP POLICY IF EXISTS "Admin insert booking sessions policy" ON public.booking_sessions;
DROP POLICY IF EXISTS "Admin update booking sessions policy" ON public.booking_sessions;

-- BOOKINGS POLICIES:
-- POLICY A: Customer Reads Own Bookings
CREATE POLICY "Customer read own bookings policy"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  customer_user_id = auth.uid()
);

-- POLICY B: Admin Reads All Bookings
CREATE POLICY "Admin read all bookings policy"
ON public.bookings
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

-- POLICY C: Admin Updates Bookings (Gated by DB State Machine Trigger)
CREATE POLICY "Admin update bookings policy"
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);

-- BOOKING SESSIONS POLICIES:
-- POLICY D: Customer Reads Sessions Belonging to Their Own Booking
CREATE POLICY "Customer read own booking sessions policy"
ON public.booking_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bookings
    WHERE bookings.id = booking_sessions.booking_id
      AND bookings.customer_user_id = auth.uid()
  )
);

-- POLICY E: Admin Reads All Booking Sessions
CREATE POLICY "Admin read all booking sessions policy"
ON public.booking_sessions
FOR SELECT
TO authenticated
USING (
  private.is_admin()
);

-- POLICY F: Admin Inserts Booking Sessions
CREATE POLICY "Admin insert booking sessions policy"
ON public.booking_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  private.is_admin()
);

-- POLICY G: Admin Updates Booking Sessions
CREATE POLICY "Admin update booking sessions policy"
ON public.booking_sessions
FOR UPDATE
TO authenticated
USING (
  private.is_admin()
)
WITH CHECK (
  private.is_admin()
);


-- 8. Trigger Functions: Bookings Validation & State Machine
CREATE OR REPLACE FUNCTION public.handle_booking_status_transition()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
BEGIN
  -- 1. Terminal Record Immutability Check
  IF OLD.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Booking % is in terminal status % and cannot be modified', OLD.id, OLD.status;
  END IF;

  -- 2. Customer Ownership & Estimate Immutability Check
  IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
    RAISE EXCEPTION 'customer_user_id cannot be changed';
  END IF;

  IF NEW.estimate_request_id IS DISTINCT FROM OLD.estimate_request_id THEN
    RAISE EXCEPTION 'estimate_request_id cannot be changed';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be changed';
  END IF;

  -- 3. Identify Actor
  v_is_admin := private.is_admin();
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);

  -- 4. Validate Allowed Status Transitions & Enforce Actor Rules
  IF NEW.status IS DISTINCT FROM OLD.status THEN

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status = 'APPROVED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can approve booking requests';
        END IF;
        -- Require active assigned artist before APPROVED
        IF NEW.artist_id IS NULL THEN
          RAISE EXCEPTION 'artist_id must be assigned before approving a booking';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.artists
          WHERE artists.id = NEW.artist_id AND artists.is_active = true
        ) THEN
          RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', NEW.artist_id;
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can reject booking requests';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin) THEN
          RAISE EXCEPTION 'Unauthorized to cancel booking request';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status;
      END IF;

    -- APPROVED transitions
    ELSIF OLD.status = 'APPROVED' THEN
      IF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can request deposit for booking';
        END IF;
      ELSIF NEW.status = 'CONFIRMED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can confirm booking';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel approved booking';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from APPROVED to %', NEW.status;
      END IF;

    -- WAITING_DEPOSIT transitions
    ELSIF OLD.status = 'WAITING_DEPOSIT' THEN
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can confirm booking';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel booking';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from WAITING_DEPOSIT to %', NEW.status;
      END IF;

    -- CONFIRMED transitions
    ELSIF OLD.status = 'CONFIRMED' THEN
      IF NEW.status = 'IN_PROGRESS' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can start booking';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel confirmed booking';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from CONFIRMED to %', NEW.status;
      END IF;

    -- IN_PROGRESS transitions
    ELSIF OLD.status = 'IN_PROGRESS' THEN
      IF NEW.status = 'COMPLETED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can complete booking';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from IN_PROGRESS to %', NEW.status;
      END IF;

    END IF;

  END IF;

  -- 5. Artist Reassignment Protection (Cannot break completed sessions)
  IF NEW.artist_id IS DISTINCT FROM OLD.artist_id AND OLD.artist_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.booking_sessions
      WHERE booking_sessions.booking_id = OLD.id
        AND booking_sessions.status = 'COMPLETED'
    ) THEN
      RAISE EXCEPTION 'Cannot reassign artist for booking % with completed historical sessions', OLD.id;
    END IF;
  END IF;

  -- 6. Complete Database Authority Over System Status Timestamps
  IF OLD.status = 'PENDING' AND NEW.status = 'APPROVED' THEN
    NEW.approved_at := pg_catalog.now();
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
    NEW.rejected_at := pg_catalog.now();
  ELSIF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
    NEW.cancelled_at := pg_catalog.now();
  ELSIF NEW.status = 'CONFIRMED' AND OLD.status != 'CONFIRMED' THEN
    NEW.confirmed_at := pg_catalog.now();
  ELSIF NEW.status = 'IN_PROGRESS' AND OLD.status != 'IN_PROGRESS' THEN
    NEW.started_at := pg_catalog.now();
  ELSIF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    NEW.completed_at := pg_catalog.now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- 9. Trigger Function: Session Consistency & Validation
CREATE OR REPLACE FUNCTION public.handle_booking_session_validation()
RETURNS TRIGGER AS $$
DECLARE
  v_booking_artist_id UUID;
  v_booking_status TEXT;
BEGIN
  -- 1. Fetch booking artist and status
  SELECT artist_id, status INTO v_booking_artist_id, v_booking_status
  FROM public.bookings
  WHERE id = NEW.booking_id;

  IF v_booking_status IS NULL THEN
    RAISE EXCEPTION 'Associated booking % does not exist', NEW.booking_id;
  END IF;

  -- 2. Consistency: Session artist must match booking assigned artist
  IF v_booking_artist_id IS NULL THEN
    RAISE EXCEPTION 'Cannot schedule session for booking % before artist is assigned', NEW.booking_id;
  END IF;

  IF NEW.artist_id IS DISTINCT FROM v_booking_artist_id THEN
    RAISE EXCEPTION 'Session artist % does not match booking assigned artist %', NEW.artist_id, v_booking_artist_id;
  END IF;

  -- 3. Cannot add sessions to terminal bookings
  IF v_booking_status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot schedule session for booking % in terminal status %', NEW.booking_id, v_booking_status;
  END IF;

  -- 4. Terminal session immutability on UPDATE
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'COMPLETED' THEN
      RAISE EXCEPTION 'Completed session % cannot be modified', OLD.id;
    END IF;
    IF NEW.booking_id IS DISTINCT FROM OLD.booking_id THEN
      RAISE EXCEPTION 'Session booking_id cannot be changed';
    END IF;
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'created_at cannot be changed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- 10. Trigger Functions: Updated At
CREATE OR REPLACE FUNCTION public.handle_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

CREATE OR REPLACE FUNCTION public.handle_booking_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = '';

-- 11. Attach Triggers
DROP TRIGGER IF EXISTS trig_01_booking_status_transition ON public.bookings;
CREATE TRIGGER trig_01_booking_status_transition
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_status_transition();

DROP TRIGGER IF EXISTS trig_02_bookings_updated_at ON public.bookings;
CREATE TRIGGER trig_02_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_bookings_updated_at();

DROP TRIGGER IF EXISTS trig_01_booking_session_validation ON public.booking_sessions;
CREATE TRIGGER trig_01_booking_session_validation
  BEFORE INSERT OR UPDATE ON public.booking_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_session_validation();

DROP TRIGGER IF EXISTS trig_02_booking_sessions_updated_at ON public.booking_sessions;
CREATE TRIGGER trig_02_booking_sessions_updated_at
  BEFORE UPDATE ON public.booking_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_booking_sessions_updated_at();


-- 12. Canonical RPC: Create Booking From ACCEPTED Estimate
CREATE OR REPLACE FUNCTION public.create_booking_from_estimate(
  p_estimate_request_id UUID,
  p_requested_date DATE,
  p_requested_start_time TIME DEFAULT NULL,
  p_customer_note TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_estimate RECORD;
  v_booking_id UUID;
BEGIN
  -- 1. Require Authenticated Session
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- 2. Validate input date
  IF p_requested_date IS NULL THEN
    RAISE EXCEPTION 'requested_date is required';
  END IF;

  -- 3. Verify Customer Ownership & ACCEPTED Estimate Status
  SELECT id, customer_user_id, artist_id, status
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = p_estimate_request_id
    AND customer_user_id = auth.uid()
    AND status = 'ACCEPTED';

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'Estimate request % is not found, not owned by caller, or not in ACCEPTED status', p_estimate_request_id;
  END IF;

  -- 4. Verify Single Booking Per Estimate Rule
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE estimate_request_id = p_estimate_request_id
  ) THEN
    RAISE EXCEPTION 'A booking already exists for estimate request %', p_estimate_request_id;
  END IF;

  -- 5. Insert Booking under trusted Database Authority
  INSERT INTO public.bookings (
    estimate_request_id,
    customer_user_id,
    artist_id,
    requested_date,
    requested_start_time,
    customer_note,
    status,
    created_at,
    updated_at
  )
  VALUES (
    v_estimate.id,
    auth.uid(),
    v_estimate.artist_id,
    p_requested_date,
    p_requested_start_time,
    p_customer_note,
    'PENDING',
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'status', 'PENDING',
    'booking_id', v_booking_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 13. Canonical RPC: Customer Cancel Booking Request
CREATE OR REPLACE FUNCTION public.cancel_booking_request(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_updated_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Atomic conditional update: only Customer owner while status is PENDING
  UPDATE public.bookings
  SET
    status = 'CANCELLED',
    cancelled_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  WHERE
    id = p_booking_id
    AND customer_user_id = auth.uid()
    AND status = 'PENDING'
  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Booking request cannot be cancelled';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'status', 'CANCELLED',
    'booking_id', v_updated_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- 14. Hardened Function Permissions
REVOKE ALL ON FUNCTION public.create_booking_from_estimate(UUID, DATE, TIME, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_booking_from_estimate(UUID, DATE, TIME, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_booking_from_estimate(UUID, DATE, TIME, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.cancel_booking_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_booking_request(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_booking_request(UUID) TO authenticated;
