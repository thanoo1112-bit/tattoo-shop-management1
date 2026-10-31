-- ============================================================================
-- 157 TATTOO — PHASE 37 MIGRATION
-- FIX CUSTOMER CANCEL AUTHORIZATION IN ESTIMATE REQUEST STATE MACHINE
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Update handle_estimate_status_transition Trigger Function
-- Evaluates customer ownership strictly from OLD.customer_user_id = auth.uid().
-- Requires auth.uid() to be NOT NULL and match customer owner, admin, or assigned artist.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_estimate_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_is_assigned_artist BOOLEAN;
  v_booking_id UUID;
  v_booking_status TEXT;
  v_has_active_session BOOLEAN := false;
  v_has_slip BOOLEAN := false;
BEGIN
  -- Terminal Record Immutability Check (EXPIRED, REJECTED, CANCELLED are terminal)
  IF OLD.status IN ('EXPIRED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Estimate request % is in terminal status %', OLD.id, OLD.status USING ERRCODE = '22023';
  END IF;

  v_is_admin := private.is_admin();
  v_is_customer_owner := (
    auth.uid() IS NOT NULL
    AND OLD.customer_user_id IS NOT NULL
    AND OLD.customer_user_id = auth.uid()
  );
  v_is_assigned_artist := (
    auth.uid() IS NOT NULL AND (
      (OLD.artist_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.artists WHERE artists.id = OLD.artist_id AND artists.user_id = auth.uid()
      ))
      OR (private.get_artist_id() IS NOT NULL AND OLD.artist_id = private.get_artist_id())
    )
  );

  IF NEW.status IS DISTINCT FROM OLD.status THEN

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status = 'QUOTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can quote estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'ACCEPTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or Customer owner can accept estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only Admin, assigned Artist, or Customer owner can reject estimate request' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only customer owner, admin, or assigned artist can cancel this request' USING ERRCODE = '42501';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status USING ERRCODE = '22023';
      END IF;

    -- QUOTED transitions (Strictly preserves original rules: ACCEPTED, REJECTED, EXPIRED)
    ELSIF OLD.status = 'QUOTED' THEN
      IF NEW.status = 'ACCEPTED' THEN
        IF NOT v_is_customer_owner THEN
          RAISE EXCEPTION 'Only the customer owner can accept estimate quotes' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Unauthorized to reject estimate quote' USING ERRCODE = '42501';
        END IF;
      ELSIF NEW.status = 'EXPIRED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can expire estimate quotes' USING ERRCODE = '22023';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from QUOTED to %', NEW.status USING ERRCODE = '22023';
      END IF;

    -- ACCEPTED transitions
    ELSIF OLD.status = 'ACCEPTED' THEN
      IF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_admin OR v_is_assigned_artist OR v_is_customer_owner) THEN
          RAISE EXCEPTION 'Only customer owner, admin, or assigned artist can cancel this request' USING ERRCODE = '42501';
        END IF;

        -- Check associated booking status
        SELECT id, status INTO v_booking_id, v_booking_status
        FROM public.bookings
        WHERE estimate_request_id = OLD.id
          AND status NOT IN ('CANCELLED', 'REJECTED')
        ORDER BY created_at DESC LIMIT 1;

        IF v_booking_id IS NOT NULL THEN
          IF v_booking_status != 'WAITING_DEPOSIT' THEN
            RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM public.booking_sessions
            WHERE booking_id = v_booking_id
              AND status IN ('IN_PROGRESS', 'COMPLETED')
          ) INTO v_has_active_session;

          IF v_has_active_session THEN
            RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
          END IF;

          SELECT EXISTS (
            SELECT 1 FROM public.booking_payment_submissions
            WHERE booking_id = v_booking_id
              AND status IN ('PENDING', 'APPROVED')
          ) INTO v_has_slip;

          IF v_has_slip THEN
            RAISE EXCEPTION 'คิวนี้อยู่ระหว่างดำเนินการ กรุณาติดต่อร้านหากต้องการเลื่อนหรือยกเลิกคิว' USING ERRCODE = '22000';
          END IF;
        END IF;

      ELSE
        RAISE EXCEPTION 'Invalid status transition from ACCEPTED to %', NEW.status USING ERRCODE = '22023';
      END IF;

    ELSE
      RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Validate Assigned Artist
  IF NEW.artist_id IS NOT NULL AND (OLD.artist_id IS DISTINCT FROM NEW.artist_id) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.artists WHERE artists.id = NEW.artist_id AND artists.is_active = true
    ) THEN
      RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', NEW.artist_id USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Validate Quote Fields (Supports flexible price requests where quoted_price IS NULL)
  IF NEW.status IN ('QUOTED', 'ACCEPTED') THEN
    IF NEW.quoted_price IS NOT NULL AND NEW.quoted_price < 0 THEN
      RAISE EXCEPTION 'quoted_price must be >= 0 when estimate status is %', NEW.status USING ERRCODE = '22023';
    END IF;
    IF NEW.quoted_price IS NOT NULL AND NEW.deposit_required IS NOT NULL THEN
      IF NEW.deposit_required < 0 OR NEW.deposit_required > NEW.quoted_price THEN
        RAISE EXCEPTION 'deposit_required must be between 0 and quoted_price' USING ERRCODE = '22023';
      END IF;
    END IF;
    IF NEW.estimated_duration_minutes IS NOT NULL AND NEW.estimated_duration_minutes <= 0 THEN
      RAISE EXCEPTION 'estimated_duration_minutes must be greater than 0' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- System Status Timestamps Management
  IF OLD.status = 'PENDING' AND NEW.status = 'QUOTED' THEN
    NEW.quoted_at := pg_catalog.now();
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'ACCEPTED' THEN
    NEW.accepted_at := pg_catalog.now();
  ELSIF OLD.status = 'PENDING' AND NEW.status = 'REJECTED' THEN
    NEW.rejected_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'ACCEPTED' THEN
    NEW.accepted_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'REJECTED' THEN
    NEW.rejected_at := pg_catalog.now();
  ELSIF OLD.status = 'QUOTED' AND NEW.status = 'EXPIRED' THEN
    NEW.rejected_at := OLD.rejected_at;
  ELSE
    NEW.quoted_at := OLD.quoted_at;
    NEW.accepted_at := OLD.accepted_at;
    NEW.rejected_at := OLD.rejected_at;
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Trigger Attachment
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trig_01_estimate_status_transition ON public.estimate_requests;
CREATE TRIGGER trig_01_estimate_status_transition
  BEFORE UPDATE ON public.estimate_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_estimate_status_transition();

-- ----------------------------------------------------------------------------
-- 3. PostgREST Schema Cache Reload
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

COMMIT;
