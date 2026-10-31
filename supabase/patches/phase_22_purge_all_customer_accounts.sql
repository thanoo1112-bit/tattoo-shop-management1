-- ====================================================================
-- 157 TATTOO — PURGE ALL CUSTOMER ACCOUNTS & DATA MIGRATION (REVISED V2)
-- Supabase SQL Editor — Transaction-Safe PL/pgSQL Execution
-- ====================================================================
-- REVISION SUMMARY (V2):
--   Fixed Error: "customer_user_id cannot be changed" on public.bookings UPDATE.
--   Solution:
--   1. Update public.handle_booking_status_transition() trigger function to check:
--      IF current_setting('app.customer_purge', true) = 'on' THEN RETURN NEW; END IF;
--   2. Set transaction-local flag PERFORM set_config('app.customer_purge', 'on', true)
--      during the unlinking phase.
--   3. Turn off transaction-local flag before transaction ends.
--   4. Preserves all trigger immutability & validation rules during normal operations.
-- ====================================================================

-- --------------------------------------------------------------------
-- PART 1: UPDATE TRIGGER FUNCTION TO SUPPORT PURGE BYPASS FLAG
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_booking_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_is_customer_owner BOOLEAN;
  v_artist_id UUID;
  v_deposit_required NUMERIC(12,2);
  v_paid_total NUMERIC(12,2);
  v_quoted_price NUMERIC(12,2);
  v_total_sessions INT;
  v_completed_sessions INT;
  v_active_sessions INT;
BEGIN
  -- 0. Purge Bypass Check: Allowed ONLY when transaction-local flag app.customer_purge = 'on'
  IF current_setting('app.customer_purge', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- 1. Terminal Record Immutability Check
  IF OLD.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Booking % is in terminal status % and cannot be modified', OLD.id, OLD.status
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Customer Ownership & Estimate Immutability Check
  IF NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id THEN
    RAISE EXCEPTION 'customer_user_id cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.estimate_request_id IS DISTINCT FROM OLD.estimate_request_id THEN
    RAISE EXCEPTION 'estimate_request_id cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'created_at cannot be changed'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Identify Actor (Supports authenticated Admin profile OR service_role)
  v_is_admin := private.is_admin()
    OR (auth.jwt() ->> 'role' = 'service_role')
    OR (current_setting('role', true) = 'service_role');
  v_is_customer_owner := (auth.uid() IS NOT NULL AND auth.uid() = OLD.customer_user_id);
  v_artist_id := private.get_artist_id();

  -- 4. Validate Allowed Status Transitions & Enforce Actor Rules
  IF NEW.status IS DISTINCT FROM OLD.status THEN

    SELECT COALESCE(e.deposit_required, 0.00) INTO v_deposit_required
    FROM public.estimate_requests e
    WHERE e.id = OLD.estimate_request_id;

    SELECT COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) INTO v_paid_total
    FROM public.booking_payments bp
    WHERE bp.booking_id = OLD.id;

    -- PENDING transitions
    IF OLD.status = 'PENDING' THEN
      IF NEW.status IN ('APPROVED', 'WAITING_DEPOSIT') THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can approve booking requests'
            USING ERRCODE = 'P0001';
        END IF;

        IF NEW.artist_id IS NULL THEN
          RAISE EXCEPTION 'artist_id must be assigned before approving a booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM public.artists WHERE artists.id = NEW.artist_id AND artists.is_active = true
        ) THEN
          RAISE EXCEPTION 'Assigned artist % does not exist or is inactive', NEW.artist_id
            USING ERRCODE = 'P0001';
        END IF;

        NEW.approved_at := COALESCE(NEW.approved_at, pg_catalog.now());

        -- Deposit Auto-Reconciliation upon Approval
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          NEW.status := 'WAITING_DEPOSIT';
          NEW.confirmed_at := NULL;
        ELSE
          NEW.status := 'CONFIRMED';
          NEW.confirmed_at := pg_catalog.now();
        END IF;

      ELSIF NEW.status = 'REJECTED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can reject booking requests'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin) THEN
          RAISE EXCEPTION 'Unauthorized to cancel booking request'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from PENDING to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- APPROVED transitions
    ELSIF OLD.status = 'APPROVED' THEN
      IF NEW.status = 'WAITING_DEPOSIT' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can update booking status'
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := NULL;
      ELSIF NEW.status = 'CONFIRMED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit required (%) not met (paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := pg_catalog.now();
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel approved booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from APPROVED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- WAITING_DEPOSIT transitions
    ELSIF OLD.status = 'WAITING_DEPOSIT' THEN
      IF NEW.status = 'CONFIRMED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can confirm booking'
            USING ERRCODE = 'P0001';
        END IF;
        IF v_deposit_required > 0 AND v_paid_total < v_deposit_required THEN
          RAISE EXCEPTION 'Cannot confirm booking %: deposit of % has not been received (current paid: %)',
            OLD.id, v_deposit_required, v_paid_total
            USING ERRCODE = 'P0001';
        END IF;
        NEW.confirmed_at := pg_catalog.now();
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT (v_is_customer_owner OR v_is_admin) THEN
          RAISE EXCEPTION 'Unauthorized to cancel booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from WAITING_DEPOSIT to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- CONFIRMED transitions
    ELSIF OLD.status = 'CONFIRMED' THEN
      IF NEW.status = 'IN_PROGRESS' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND v_artist_id = OLD.artist_id)) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can start session'
            USING ERRCODE = 'P0001';
        END IF;
      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel confirmed booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from CONFIRMED to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    -- IN_PROGRESS transitions
    ELSIF OLD.status = 'IN_PROGRESS' THEN
      IF NEW.status = 'COMPLETED' THEN
        IF NOT (v_is_admin OR (v_artist_id IS NOT NULL AND v_artist_id = OLD.artist_id)) THEN
          RAISE EXCEPTION 'Only Admin or assigned Artist can complete booking'
            USING ERRCODE = 'P0001';
        END IF;

        SELECT e.quoted_price INTO v_quoted_price
        FROM public.estimate_requests e
        WHERE e.id = OLD.estimate_request_id;

        IF v_quoted_price IS NOT NULL AND v_quoted_price > 0 AND v_paid_total < v_quoted_price THEN
          RAISE EXCEPTION 'Cannot complete booking %: total paid (%) is less than quoted price (%)',
            OLD.id, v_paid_total, v_quoted_price
            USING ERRCODE = 'P0001';
        END IF;

        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_sessions'
        ) THEN
          SELECT COUNT(*),
                 COUNT(*) FILTER (WHERE bs.status = 'COMPLETED'),
                 COUNT(*) FILTER (WHERE bs.status IN ('SCHEDULED', 'IN_PROGRESS'))
          INTO v_total_sessions, v_completed_sessions, v_active_sessions
          FROM public.booking_sessions bs
          WHERE bs.booking_id = OLD.id;

          IF v_total_sessions > 0 THEN
            IF v_active_sessions > 0 THEN
              RAISE EXCEPTION 'Cannot complete booking %: % session(s) are still active',
                OLD.id, v_active_sessions
                USING ERRCODE = 'P0001';
            END IF;
            IF v_completed_sessions = 0 THEN
              RAISE EXCEPTION 'Cannot complete booking %: no sessions have been completed',
                OLD.id
                USING ERRCODE = 'P0001';
            END IF;
          END IF;
        END IF;

        NEW.completed_at := pg_catalog.now();

      ELSIF NEW.status = 'CANCELLED' THEN
        IF NOT v_is_admin THEN
          RAISE EXCEPTION 'Only Admin can cancel in-progress booking'
            USING ERRCODE = 'P0001';
        END IF;
      ELSE
        RAISE EXCEPTION 'Invalid status transition from IN_PROGRESS to %', NEW.status
          USING ERRCODE = 'P0001';
      END IF;

    ELSE
      RAISE EXCEPTION 'Unhandled current status % for booking %', OLD.status, OLD.id
        USING ERRCODE = 'P0001';
    END IF;

  END IF;

  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------
-- PART 2: TRANSACTION-SAFE CUSTOMER DATA PURGE MIGRATION
-- --------------------------------------------------------------------
DO $$
DECLARE
  v_admin_user_id          UUID;
  v_customer_user_ids      UUID[] := ARRAY[]::UUID[];

  -- Logging counters
  v_unlinked_estimates     INT := 0;
  v_unlinked_bookings      INT := 0;
  v_unlinked_sessions      INT := 0;
  v_unlinked_payments      INT := 0;
  v_unlinked_submissions   INT := 0;
  v_unlinked_reservations  INT := 0;

  v_deleted_customers      INT := 0;
  v_deleted_profiles       INT := 0;
  v_deleted_auth_users     INT := 0;

  -- Safety assertion counters
  v_initial_bookings_count INT := 0;
  v_final_bookings_count   INT := 0;
  v_initial_requests_count INT := 0;
  v_final_requests_count   INT := 0;
  v_remaining_customers    INT := 0;
  v_remaining_cust_profile INT := 0;
  v_protected_admins       INT := 0;

BEGIN

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  157 TATTOO — EXECUTE CUSTOMER DATA PURGE MIGRATION (V2)';
  RAISE NOTICE '====================================================';

  -- STEP 0: SET TRANSACTION-LOCAL PURGE FLAG (is_local = true)
  PERFORM set_config('app.customer_purge', 'on', true);
  RAISE NOTICE 'Purge Flag app.customer_purge set to ON (Transaction Local)';

  -- STEP 1: RECORD PRE-PURGE TRANSACTION STATS FOR SAFETY ASSERTION
  SELECT COUNT(*) INTO v_initial_bookings_count FROM public.bookings;
  SELECT COUNT(*) INTO v_initial_requests_count FROM public.estimate_requests;

  RAISE NOTICE 'Initial Bookings Count: %', v_initial_bookings_count;
  RAISE NOTICE 'Initial Estimate Requests Count: %', v_initial_requests_count;

  -- Locate canonical Admin user ID for protection
  SELECT id INTO v_admin_user_id
  FROM auth.users
  WHERE email = 'admin@157tattoo.com'
  LIMIT 1;

  IF v_admin_user_id IS NULL THEN
    SELECT user_id INTO v_admin_user_id
    FROM public.profiles
    WHERE role = 'admin' AND is_active = true
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Protected Primary Admin User ID: %', COALESCE(v_admin_user_id::text, 'N/A');

  -- STEP 2: COLLECT TARGET CUSTOMER USER IDs (STRICTLY EXCLUDE ADMIN & ARTIST)
  SELECT ARRAY_AGG(DISTINCT uid) INTO v_customer_user_ids
  FROM (
    SELECT user_id AS uid FROM public.profiles WHERE role = 'customer' AND user_id IS NOT NULL
    UNION
    SELECT user_id AS uid FROM public.customers WHERE user_id IS NOT NULL
  ) u
  WHERE uid IS NOT NULL
    AND uid NOT IN (SELECT user_id FROM public.artists WHERE user_id IS NOT NULL)
    AND uid NOT IN (SELECT user_id FROM public.profiles WHERE role IN ('admin', 'artist'))
    AND (v_admin_user_id IS NULL OR uid != v_admin_user_id);

  RAISE NOTICE 'Customer Auth Users to be deleted: %', COALESCE(array_length(v_customer_user_ids, 1), 0);

  -- SAFETY ASSERTION: Verify no admin or artist ID is in target array
  IF v_admin_user_id IS NOT NULL AND v_admin_user_id = ANY(v_customer_user_ids) THEN
    RAISE EXCEPTION 'SAFETY ABORT: Admin user ID (%) detected in customer purge list!', v_admin_user_id
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.artists 
    WHERE user_id IS NOT NULL AND user_id = ANY(v_customer_user_ids)
  ) THEN
    RAISE EXCEPTION 'SAFETY ABORT: Artist user ID detected in customer purge list!'
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 3: UNLINK FOREIGN KEYS IN BOOKINGS & TRANSACTION TABLES (SET NULL)
  -- A. estimate_requests
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estimate_requests' AND column_name = 'customer_id'
  ) THEN
    EXECUTE 'UPDATE public.estimate_requests SET customer_id = NULL WHERE customer_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'estimate_requests' AND column_name = 'customer_user_id'
  ) THEN
    EXECUTE 'UPDATE public.estimate_requests SET customer_user_id = NULL WHERE customer_user_id IS NOT NULL';
  END IF;
  GET DIAGNOSTICS v_unlinked_estimates = ROW_COUNT;
  RAISE NOTICE 'Unlinked estimate_requests: %', v_unlinked_estimates;

  -- B. bookings (Bypasses handle_booking_status_transition because app.customer_purge = 'on')
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_id'
  ) THEN
    EXECUTE 'UPDATE public.bookings SET customer_id = NULL WHERE customer_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'customer_user_id'
  ) THEN
    EXECUTE 'UPDATE public.bookings SET customer_user_id = NULL WHERE customer_user_id IS NOT NULL';
  END IF;
  GET DIAGNOSTICS v_unlinked_bookings = ROW_COUNT;
  RAISE NOTICE 'Unlinked bookings: %', v_unlinked_bookings;

  -- C. booking_sessions
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_sessions'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'booking_sessions' AND column_name = 'customer_id'
    ) THEN
      EXECUTE 'UPDATE public.booking_sessions SET customer_id = NULL WHERE customer_id IS NOT NULL';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'booking_sessions' AND column_name = 'customer_user_id'
    ) THEN
      EXECUTE 'UPDATE public.booking_sessions SET customer_user_id = NULL WHERE customer_user_id IS NOT NULL';
    END IF;
    GET DIAGNOSTICS v_unlinked_sessions = ROW_COUNT;
    RAISE NOTICE 'Unlinked booking_sessions: %', v_unlinked_sessions;
  END IF;

  -- D. booking_payments
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_payments'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'booking_payments' AND column_name = 'customer_id'
    ) THEN
      EXECUTE 'UPDATE public.booking_payments SET customer_id = NULL WHERE customer_id IS NOT NULL';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'booking_payments' AND column_name = 'customer_user_id'
    ) THEN
      EXECUTE 'UPDATE public.booking_payments SET customer_user_id = NULL WHERE customer_user_id IS NOT NULL';
    END IF;
    GET DIAGNOSTICS v_unlinked_payments = ROW_COUNT;
    RAISE NOTICE 'Unlinked booking_payments: %', v_unlinked_payments;
  END IF;

  -- E. booking_payment_submissions
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'booking_payment_submissions'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'booking_payment_submissions' AND column_name = 'customer_id'
    ) THEN
      EXECUTE 'UPDATE public.booking_payment_submissions SET customer_id = NULL WHERE customer_id IS NOT NULL';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'booking_payment_submissions' AND column_name = 'customer_user_id'
    ) THEN
      EXECUTE 'UPDATE public.booking_payment_submissions SET customer_user_id = NULL WHERE customer_user_id IS NOT NULL';
    END IF;
    GET DIAGNOSTICS v_unlinked_submissions = ROW_COUNT;
    RAISE NOTICE 'Unlinked booking_payment_submissions: %', v_unlinked_submissions;
  END IF;

  -- F. flash_reservations
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'flash_reservations'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'flash_reservations' AND column_name = 'customer_id'
    ) THEN
      EXECUTE 'UPDATE public.flash_reservations SET customer_id = NULL WHERE customer_id IS NOT NULL';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'flash_reservations' AND column_name = 'customer_user_id'
    ) THEN
      EXECUTE 'UPDATE public.flash_reservations SET customer_user_id = NULL WHERE customer_user_id IS NOT NULL';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'flash_reservations' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'UPDATE public.flash_reservations SET user_id = NULL WHERE user_id IS NOT NULL';
    END IF;
    GET DIAGNOSTICS v_unlinked_reservations = ROW_COUNT;
    RAISE NOTICE 'Unlinked flash_reservations: %', v_unlinked_reservations;
  END IF;

  -- STEP 4: DELETE ALL ROWS IN public.customers (INCLUDING USER_ID IS NULL)
  DELETE FROM public.customers;
  GET DIAGNOSTICS v_deleted_customers = ROW_COUNT;
  RAISE NOTICE 'Deleted rows in public.customers: %', v_deleted_customers;

  -- STEP 5: DELETE CUSTOMER PROFILES (public.profiles)
  DELETE FROM public.profiles
  WHERE role = 'customer'
    AND role NOT IN ('admin', 'artist')
    AND user_id NOT IN (SELECT user_id FROM public.artists WHERE user_id IS NOT NULL);
  GET DIAGNOSTICS v_deleted_profiles = ROW_COUNT;
  RAISE NOTICE 'Deleted customer profiles: %', v_deleted_profiles;

  -- STEP 6: DELETE CUSTOMER AUTH ACCOUNTS (auth.users)
  IF array_length(v_customer_user_ids, 1) > 0 THEN
    DELETE FROM auth.users
    WHERE id = ANY(v_customer_user_ids)
      AND id NOT IN (SELECT user_id FROM public.artists WHERE user_id IS NOT NULL)
      AND id NOT IN (SELECT user_id FROM public.profiles WHERE role IN ('admin', 'artist'))
      AND (v_admin_user_id IS NULL OR id != v_admin_user_id);
    GET DIAGNOSTICS v_deleted_auth_users = ROW_COUNT;
    RAISE NOTICE 'Deleted customer auth.users accounts: %', v_deleted_auth_users;
  ELSE
    RAISE NOTICE 'No customer auth.users accounts to delete.';
  END IF;

  -- Also delete any auth.users associated with role = 'customer' profiles if any remained
  DELETE FROM auth.users
  WHERE id IN (SELECT user_id FROM public.profiles WHERE role = 'customer')
    AND id NOT IN (SELECT user_id FROM public.artists WHERE user_id IS NOT NULL)
    AND id NOT IN (SELECT user_id FROM public.profiles WHERE role IN ('admin', 'artist'))
    AND (v_admin_user_id IS NULL OR id != v_admin_user_id);

  -- STEP 7: MANDATORY POST-PURGE SAFETY ASSERTIONS
  -- 1. Verify customers table is 100% empty
  SELECT COUNT(*) INTO v_remaining_customers FROM public.customers;
  IF v_remaining_customers > 0 THEN
    RAISE EXCEPTION 'POST-PURGE ASSERTION FAILED: public.customers still has % rows!', v_remaining_customers
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Verify no customer profiles remain
  SELECT COUNT(*) INTO v_remaining_cust_profile 
  FROM public.profiles 
  WHERE role = 'customer';
  IF v_remaining_cust_profile > 0 THEN
    RAISE EXCEPTION 'POST-PURGE ASSERTION FAILED: public.profiles still has % customer profiles!', v_remaining_cust_profile
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Verify total bookings count matches pre-purge baseline
  SELECT COUNT(*) INTO v_final_bookings_count FROM public.bookings;
  IF v_final_bookings_count != v_initial_bookings_count THEN
    RAISE EXCEPTION 'POST-PURGE ASSERTION FAILED: Bookings count changed! Before: %, After: %', 
      v_initial_bookings_count, v_final_bookings_count
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Verify total estimate requests count matches pre-purge baseline
  SELECT COUNT(*) INTO v_final_requests_count FROM public.estimate_requests;
  IF v_final_requests_count != v_initial_requests_count THEN
    RAISE EXCEPTION 'POST-PURGE ASSERTION FAILED: Estimate requests count changed! Before: %, After: %', 
      v_initial_requests_count, v_final_requests_count
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Verify admin user account is intact
  SELECT COUNT(*) INTO v_protected_admins 
  FROM public.profiles 
  WHERE role = 'admin' AND is_active = true;
  IF v_protected_admins = 0 THEN
    RAISE EXCEPTION 'POST-PURGE ASSERTION FAILED: Admin profile missing or inactive!'
      USING ERRCODE = 'P0001';
  END IF;

  -- STEP 8: RESET PURGE FLAG (TRANSACTION CLEANUP)
  PERFORM set_config('app.customer_purge', 'off', true);

  RAISE NOTICE '====================================================';
  RAISE NOTICE '  PURGE SUCCESSFUL & ALL SAFETY ASSERTIONS PASSED ✓';
  RAISE NOTICE '  - Unlinked Bookings:  %', v_unlinked_bookings;
  RAISE NOTICE '  - Unlinked Estimates: %', v_unlinked_estimates;
  RAISE NOTICE '  - Deleted Customers:  %', v_deleted_customers;
  RAISE NOTICE '  - Deleted Profiles:   %', v_deleted_profiles;
  RAISE NOTICE '  - Deleted Auth Users: %', v_deleted_auth_users;
  RAISE NOTICE '  - Intact Bookings:    %', v_final_bookings_count;
  RAISE NOTICE '  - Intact Estimates:   %', v_final_requests_count;
  RAISE NOTICE '====================================================';

EXCEPTION WHEN OTHERS THEN
  -- Guarantee purge flag is reset even on error before re-raising exception
  PERFORM set_config('app.customer_purge', 'off', true);
  RAISE;
END $$;
