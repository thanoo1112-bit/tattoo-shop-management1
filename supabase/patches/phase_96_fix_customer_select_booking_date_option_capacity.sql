-- ============================================================================
-- 157 TATTOO — PHASE 96: FIX customer_select_booking_date_option CAPACITY
-- ALIGN CUSTOMER PROPOSED DATE CONFIRMATION WITH PHASE 95 (MAX 3 JOBS / ARTIST / DAY)
-- ============================================================================
-- Rules:
--   1. Replace obsolete Phase 29/32 capacity check (max 1 job across studio)
--      with Phase 95 standard rule: MAX 3 DISTINCT ACTIVE JOBS PER ARTIST PER DAY.
--   2. Strict artist scoping: v_estimate.artist_id is guaranteed NOT NULL and required.
--   3. Enforce Single-Job Deduplication across estimate_requests, bookings,
--      sessions, and flash_reservations matching Phase 95.
--   4. Exclude current customer request/estimate from self-blocking.
--   5. Exclude terminal/inactive statuses: CANCELLED, REJECTED, EXPIRED, COMPLETED.
--   6. Maintain atomic advisory locking, security definer, customer ownership check.
--   7. Preserve downstream booking creation in WAITING_DEPOSIT with 500 THB deposit.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.customer_select_booking_date_option(
  p_option_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_user_id UUID;
  v_option RECORD;
  v_estimate RECORD;
  v_booking_id UUID;
  v_daily_count INT;
BEGIN
  v_customer_user_id := auth.uid();
  IF v_customer_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_option_id IS NULL THEN
    RAISE EXCEPTION 'p_option_id is required' USING ERRCODE = '22004';
  END IF;

  -- 1. Select and lock target option
  SELECT id, estimate_request_id, proposed_date, proposed_time, status
  INTO v_option
  FROM public.estimate_request_date_options
  WHERE id = p_option_id
  FOR UPDATE;

  IF v_option.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบตัวเลือกวันนัดหมายที่ระบุ' USING ERRCODE = 'P0002';
  END IF;

  IF v_option.status != 'PENDING' THEN
    RAISE EXCEPTION 'ตัวเลือกนี้ไม่สามารถเลือกได้แล้ว' USING ERRCODE = '22023';
  END IF;

  -- 2. Select and lock target estimate request
  SELECT id, customer_user_id, artist_id, status, description, proposed_artist_note, is_date_proposed, quoted_price, proposed_price
  INTO v_estimate
  FROM public.estimate_requests
  WHERE id = v_option.estimate_request_id
  FOR UPDATE;

  IF v_estimate.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบรายการคำขอจองคิว' USING ERRCODE = 'P0002';
  END IF;

  -- Ownership Check
  IF v_estimate.customer_user_id != v_customer_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์เลือกตัวเลือกคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- Requirement Check: request status MUST be PENDING and is_date_proposed MUST be TRUE
  IF v_estimate.status != 'PENDING' OR v_estimate.is_date_proposed IS NOT TRUE THEN
    RAISE EXCEPTION 'คำขอนี้ไม่อยู่ในสถานะรอลูกค้าเลือกวันนัดหมาย' USING ERRCODE = '22023';
  END IF;

  -- Artist ID Guarantee Check: artist must be assigned for capacity calculation
  IF v_estimate.artist_id IS NULL THEN
    RAISE EXCEPTION 'คำขอนี้ไม่มีช่างสักที่ดูแล ไม่สามารถตรวจสอบคิวได้' USING ERRCODE = '22004';
  END IF;

  -- 3. Atomic Advisory Lock scoped to artist + proposed_date
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('lock_artist_date:' || v_estimate.artist_id::TEXT || ':' || v_option.proposed_date::TEXT)
  );

  -- 4. Check artist_blocked_dates
  IF EXISTS (
    SELECT 1 FROM public.artist_blocked_dates
    WHERE blocked_date = v_option.proposed_date
      AND (
        scope = 'STUDIO'
        OR (scope = 'ARTIST' AND artist_id = v_estimate.artist_id)
        OR (artist_id IS NULL AND scope IS NULL)
      )
  ) THEN
    UPDATE public.estimate_request_date_options SET status = 'UNAVAILABLE' WHERE id = v_option.id;
    RAISE EXCEPTION 'ตัวเลือกนี้ไม่ว่างแล้ว กรุณาเลือกตัวเลือกอื่น' USING ERRCODE = '23505';
  END IF;

  -- 5. Phase 95 Daily Capacity Check (Deduplicated active jobs, EXCLUDING current estimate request v_estimate.id)
  WITH active_distinct_jobs AS (
    -- Estimate requests without booking (excluding current estimate request)
    SELECT
      ('est:' || e.id::TEXT) AS job_id
    FROM public.estimate_requests e
    WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) = v_option.proposed_date
      AND e.artist_id = v_estimate.artist_id
      AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND e.id != v_estimate.id
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.estimate_request_id = e.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )

    UNION ALL

    -- Bookings (canonical main appointment, excluding bookings associated with current estimate)
    SELECT
      ('bk:' || b.id::TEXT) AS job_id
    FROM public.bookings b
    WHERE b.requested_date = v_option.proposed_date
      AND b.artist_id = v_estimate.artist_id
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (b.estimate_request_id IS NULL OR b.estimate_request_id != v_estimate.id)

    UNION ALL

    -- Booking sessions on a DIFFERENT date from main booking (excluding sessions associated with current estimate)
    SELECT
      ('sess:' || s.id::TEXT) AS job_id
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = v_option.proposed_date
      AND b.artist_id = v_estimate.artist_id
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (b.estimate_request_id IS NULL OR b.estimate_request_id != v_estimate.id)
      AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

    UNION ALL

    -- Flash reservations without booking
    SELECT
      ('flash:' || fr.id::TEXT) AS job_id
    FROM public.flash_reservations fr
    JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
    WHERE fr.requested_date = v_option.proposed_date
      AND fd.artist_id = v_estimate.artist_id
      AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.flash_reservation_id = fr.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )
  )
  SELECT COUNT(DISTINCT job_id)
  INTO v_daily_count
  FROM active_distinct_jobs;

  -- 6. Enforce Daily Capacity <= 3 per artist
  IF v_daily_count >= 3 THEN
    UPDATE public.estimate_request_date_options SET status = 'UNAVAILABLE' WHERE id = v_option.id;
    RAISE EXCEPTION 'ตัวเลือกนี้ไม่ว่างแล้ว กรุณาเลือกตัวเลือกอื่น' USING ERRCODE = '23505';
  END IF;

  -- 7. Mark option SELECTED & others CANCELLED
  UPDATE public.estimate_request_date_options
  SET status = 'SELECTED'
  WHERE id = v_option.id;

  UPDATE public.estimate_request_date_options
  SET status = 'CANCELLED'
  WHERE estimate_request_id = v_estimate.id
    AND id != v_option.id
    AND status = 'PENDING';

  -- 8. Update estimate_requests to ACCEPTED status, preferred_date/time set to chosen option
  UPDATE public.estimate_requests
  SET
    status = 'ACCEPTED',
    preferred_date = v_option.proposed_date,
    preferred_time = v_option.proposed_time,
    is_date_proposed = FALSE,
    quoted_price = COALESCE(v_estimate.quoted_price, v_estimate.proposed_price, NULL),
    deposit_required = 500,
    quote_note = v_estimate.proposed_artist_note,
    updated_at = pg_catalog.now()
  WHERE id = v_estimate.id;

  -- 9. Insert into public.bookings with status WAITING_DEPOSIT and 500 THB deposit
  INSERT INTO public.bookings (
    estimate_request_id,
    customer_user_id,
    artist_id,
    requested_date,
    requested_start_time,
    customer_note,
    admin_note,
    status,
    approved_at,
    created_at,
    updated_at
  )
  VALUES (
    v_estimate.id,
    v_estimate.customer_user_id,
    v_estimate.artist_id,
    v_option.proposed_date,
    v_option.proposed_time,
    v_estimate.description,
    v_estimate.proposed_artist_note,
    'WAITING_DEPOSIT',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'estimate_request_id', v_estimate.id,
    'booking_id', v_booking_id,
    'booking_status', 'WAITING_DEPOSIT',
    'selected_date', v_option.proposed_date,
    'selected_time', v_option.proposed_time
  );
END;
$$;

-- Secure RPC Permissions for customer_select_booking_date_option
REVOKE ALL ON FUNCTION public.customer_select_booking_date_option(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_select_booking_date_option(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_select_booking_date_option(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_select_booking_date_option(UUID) TO service_role;

COMMIT;
