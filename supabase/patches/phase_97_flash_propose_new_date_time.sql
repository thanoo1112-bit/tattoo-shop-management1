-- ============================================================================
-- 157 TATTOO — PHASE 97 MIGRATION
-- FLASH RESERVATION PROPOSE NEW DATE/TIME & CONFIRMATION FLOW
-- (MAX 3 JOBS / ARTIST / DAY CAPACITY ALIGNED)
-- ============================================================================
-- IMPORTANT: LOCAL ONLY / DO NOT APPLY AUTOMATICALLY / FOR USER MANUAL APPLICATION
--
-- Features:
--   1. Add proposal columns to public.flash_reservations:
--      - proposed_date DATE DEFAULT NULL
--      - proposed_time TIME DEFAULT NULL
--      - proposal_note TEXT DEFAULT NULL
--      - date_proposed_at TIMESTAMPTZ DEFAULT NULL
--   2. Update public.get_artist_busy_ranges to count flash proposed_date if present.
--   3. Create RPC: public.artist_propose_flash_reservation_date
--      - Auth & ownership check (Admin or assigned artist)
--      - Status must be PENDING
--      - proposed_date not in past
--      - 10:00 - 23:00 time check
--      - artist_blocked_dates check
--      - Daily capacity check <= 3 (excluding current reservation)
--      - Saves proposed_date, proposed_time, proposal_note, date_proposed_at
--      - Keeps status PENDING (does NOT create booking yet)
--   4. Create RPC: public.customer_confirm_flash_proposed_date
--      - Auth check (customer_user_id)
--      - Status must be PENDING with proposed_date not null
--      - Atomic advisory lock & capacity check <= 3
--      - Sets requested_date = proposed_date, requested_start_time = proposed_time
--      - Clears proposed_date, proposed_time, proposal_note, date_proposed_at
--      - Transitions flash_reservations.status = 'WAITING_DEPOSIT'
--      - Creates/updates public.bookings in status 'WAITING_DEPOSIT' (1 booking max)
--      - Locks flash_design status to 'RESERVED' (single-use)
--   5. Update public.artist_get_flash_reservations to return proposal fields.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Add proposal columns to public.flash_reservations
-- ----------------------------------------------------------------------------
ALTER TABLE public.flash_reservations
ADD COLUMN IF NOT EXISTS proposed_date DATE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS proposed_time TIME DEFAULT NULL,
ADD COLUMN IF NOT EXISTS proposal_note TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS date_proposed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN public.flash_reservations.proposed_date IS 'Alternate appointment date proposed by artist/admin';
COMMENT ON COLUMN public.flash_reservations.proposed_time IS 'Alternate appointment time proposed by artist/admin';
COMMENT ON COLUMN public.flash_reservations.proposal_note IS 'Note or reason from artist/admin for proposing new date/time';
COMMENT ON COLUMN public.flash_reservations.date_proposed_at IS 'Timestamp when alternate appointment was proposed';

-- ----------------------------------------------------------------------------
-- 2. Update RPC: public.get_artist_busy_ranges
--    Aligns flash reservations to count proposed_date if active
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_artist_busy_ranges(
  p_artist_id UUID DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE(
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_start_date and p_end_date are required' USING ERRCODE = '22004';
  END IF;

  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'p_end_date cannot be earlier than p_start_date' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH raw_busy_items AS (
    -- 1. Active estimate_requests that DO NOT yet have a booking
    SELECT
      (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) AS d,
      COALESCE((CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_time ELSE e.preferred_time END), '10:00:00'::TIME) AS t,
      NULL::TIMESTAMPTZ AS direct_start_at,
      NULL::TIMESTAMPTZ AS direct_end_at,
      FALSE AS is_full_day
    FROM public.estimate_requests e
    WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) BETWEEN p_start_date AND p_end_date
      AND (p_artist_id IS NULL OR e.artist_id = p_artist_id)
      AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.estimate_request_id = e.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )

    UNION ALL

    -- 2. Active bookings (canonical main appointment)
    SELECT
      b.requested_date AS d,
      COALESCE(b.requested_start_time, '10:00:00'::TIME) AS t,
      NULL::TIMESTAMPTZ AS direct_start_at,
      NULL::TIMESTAMPTZ AS direct_end_at,
      FALSE AS is_full_day
    FROM public.bookings b
    WHERE b.requested_date BETWEEN p_start_date AND p_end_date
      AND (p_artist_id IS NULL OR b.artist_id = p_artist_id)
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')

    UNION ALL

    -- 3. Active booking_sessions for rounds on a DIFFERENT date from the booking's main requested_date
    SELECT
      (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE AS d,
      (s.start_at AT TIME ZONE 'Asia/Bangkok')::TIME AS t,
      s.start_at AS direct_start_at,
      s.end_at AS direct_end_at,
      FALSE AS is_full_day
    FROM public.booking_sessions s
    JOIN public.bookings b ON s.booking_id = b.id
    WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE BETWEEN p_start_date AND p_end_date
      AND (p_artist_id IS NULL OR b.artist_id = p_artist_id)
      AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

    UNION ALL

    -- 4. Active flash_reservations that DO NOT yet have a booking (aligns to proposed_date if proposed)
    SELECT
      (CASE WHEN fr.proposed_date IS NOT NULL THEN fr.proposed_date ELSE fr.requested_date END) AS d,
      COALESCE((CASE WHEN fr.proposed_date IS NOT NULL THEN fr.proposed_time ELSE fr.requested_start_time END), '10:00:00'::TIME) AS t,
      NULL::TIMESTAMPTZ AS direct_start_at,
      NULL::TIMESTAMPTZ AS direct_end_at,
      FALSE AS is_full_day
    FROM public.flash_reservations fr
    JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
    WHERE (CASE WHEN fr.proposed_date IS NOT NULL THEN fr.proposed_date ELSE fr.requested_date END) BETWEEN p_start_date AND p_end_date
      AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      AND (p_artist_id IS NULL OR fd.artist_id = p_artist_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.flash_reservation_id = fr.id
          AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
      )

    UNION ALL

    -- 5. Blocked dates (studio or artist scope: full day block)
    SELECT
      blocked_date AS d,
      '00:00:00'::TIME AS t,
      NULL::TIMESTAMPTZ AS direct_start_at,
      NULL::TIMESTAMPTZ AS direct_end_at,
      TRUE AS is_full_day
    FROM public.artist_blocked_dates
    WHERE blocked_date BETWEEN p_start_date AND p_end_date
      AND (
        scope = 'STUDIO'
        OR (scope = 'ARTIST' AND (p_artist_id IS NULL OR artist_id = p_artist_id))
      )
  )
  SELECT DISTINCT
    CASE
      WHEN r.direct_start_at IS NOT NULL THEN r.direct_start_at
      WHEN r.is_full_day IS TRUE THEN (r.d::TEXT || ' 00:00:00+07')::TIMESTAMPTZ
      ELSE (r.d::TEXT || ' ' || r.t::TEXT || '+07')::TIMESTAMPTZ
    END AS start_at,

    CASE
      WHEN r.direct_end_at IS NOT NULL THEN r.direct_end_at
      WHEN r.is_full_day IS TRUE THEN (r.d::TEXT || ' 23:59:59+07')::TIMESTAMPTZ
      ELSE ((r.d::TEXT || ' ' || r.t::TEXT || '+07')::TIMESTAMPTZ + INTERVAL '2 hours')
    END AS end_at
  FROM raw_busy_items r
  WHERE r.d IS NOT NULL
  ORDER BY start_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_busy_ranges(UUID, DATE, DATE) TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Create RPC: public.artist_propose_flash_reservation_date
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.artist_propose_flash_reservation_date(
  p_reservation_id UUID,
  p_proposed_date DATE,
  p_proposed_time TIME,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_res RECORD;
  v_design RECORD;
  v_is_admin BOOLEAN := FALSE;
  v_artist_id UUID;
  v_saved_time TIME;
  v_daily_count INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 1. Check Admin status via private.is_admin()
  v_is_admin := private.is_admin();

  -- 2. Check Artist status via private.get_artist_id()
  IF NOT v_is_admin THEN
    v_artist_id := private.get_artist_id();
    IF v_artist_id IS NULL THEN
      SELECT a.id INTO v_artist_id
      FROM public.artists a
      WHERE a.user_id = v_user_id
        AND a.is_active = true
      LIMIT 1;
    END IF;
  END IF;

  -- 3. Fetch Flash Reservation
  SELECT fr.*
  INTO v_res
  FROM public.flash_reservations fr
  WHERE fr.id = p_reservation_id
  FOR UPDATE;

  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอจองลาย Flash ที่ระบุ' USING ERRCODE = '22004';
  END IF;

  -- 4. Fetch Flash Design
  SELECT fd.*
  INTO v_design
  FROM public.flash_designs fd
  WHERE fd.id = v_res.flash_design_id;

  -- 5. Security Check: Admin OR assigned artist of this flash design
  IF NOT (v_is_admin OR (v_design.artist_id IS NOT NULL AND v_design.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- 6. Must be in PENDING status
  IF v_res.status != 'PENDING' THEN
    RAISE EXCEPTION 'สามารถเสนอวันใหม่ได้เฉพาะคำขอที่อยู่ในสถานะรอตรวจสอบ (PENDING) เท่านั้น' USING ERRCODE = '22023';
  END IF;

  -- 7. Validate proposed_date (>= today in Bangkok)
  IF p_proposed_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาระบุวันที่ต้องการเสนอ' USING ERRCODE = '22004';
  END IF;

  IF p_proposed_date < (pg_catalog.now() AT TIME ZONE 'Asia/Bangkok')::DATE THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกวันนัดหมายย้อนหลังได้' USING ERRCODE = '22023';
  END IF;

  -- 8. Validate proposed_time (10:00 - 23:00)
  v_saved_time := COALESCE(p_proposed_time, '10:00:00'::TIME);
  IF v_saved_time < '10:00:00'::TIME OR v_saved_time > '23:00:00'::TIME THEN
    RAISE EXCEPTION 'เวลาที่เสนอต้องอยู่ระหว่างช่วงเวลา 10:00 - 23:00 น.' USING ERRCODE = '22023';
  END IF;

  -- 9. Advisory lock on artist + proposed_date
  IF v_design.artist_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('lock_artist_date:' || v_design.artist_id::TEXT || ':' || p_proposed_date::TEXT)
    );

    -- 10. Check blocked dates
    IF EXISTS (
      SELECT 1 FROM public.artist_blocked_dates
      WHERE blocked_date = p_proposed_date
        AND (
          scope = 'STUDIO'
          OR (scope = 'ARTIST' AND artist_id = v_design.artist_id)
        )
    ) THEN
      RAISE EXCEPTION 'วันที่เสนอไม่ว่าง กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
    END IF;

    -- 11. Daily Capacity Check <= 3 (Phase 95, deduplicated, excluding current reservation)
    WITH active_distinct_jobs AS (
      SELECT
        ('est:' || e.id::TEXT) AS job_id
      FROM public.estimate_requests e
      WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) = p_proposed_date
        AND e.artist_id = v_design.artist_id
        AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.estimate_request_id = e.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )

      UNION ALL

      SELECT
        ('bk:' || b.id::TEXT) AS job_id
      FROM public.bookings b
      WHERE b.requested_date = p_proposed_date
        AND b.artist_id = v_design.artist_id
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.flash_reservation_id IS NULL OR b.flash_reservation_id != p_reservation_id)

      UNION ALL

      SELECT
        ('sess:' || s.id::TEXT) AS job_id
      FROM public.booking_sessions s
      JOIN public.bookings b ON s.booking_id = b.id
      WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_proposed_date
        AND b.artist_id = v_design.artist_id
        AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.flash_reservation_id IS NULL OR b.flash_reservation_id != p_reservation_id)
        AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

      UNION ALL

      SELECT
        ('flash:' || fr.id::TEXT) AS job_id
      FROM public.flash_reservations fr
      JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
      WHERE (CASE WHEN fr.proposed_date IS NOT NULL THEN fr.proposed_date ELSE fr.requested_date END) = p_proposed_date
        AND fd.artist_id = v_design.artist_id
        AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND fr.id != p_reservation_id
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.flash_reservation_id = fr.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )
    )
    SELECT COUNT(DISTINCT job_id)
    INTO v_daily_count
    FROM active_distinct_jobs;

    IF v_daily_count >= 3 THEN
      RAISE EXCEPTION 'วันที่เสนอคิวเต็มแล้ว (ครบ 3 คิวต่อวัน) กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 12. Save proposal onto flash_reservations (remains PENDING)
  UPDATE public.flash_reservations
  SET
    proposed_date = p_proposed_date,
    proposed_time = v_saved_time,
    proposal_note = p_note,
    date_proposed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  WHERE id = p_reservation_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'proposed_date', p_proposed_date,
    'proposed_time', v_saved_time,
    'proposal_note', p_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.artist_propose_flash_reservation_date(UUID, DATE, TIME, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_propose_flash_reservation_date(UUID, DATE, TIME, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_propose_flash_reservation_date(UUID, DATE, TIME, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.artist_propose_flash_reservation_date(UUID, DATE, TIME, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 4. Create RPC: public.customer_confirm_flash_proposed_date
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_confirm_flash_proposed_date(
  p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_res RECORD;
  v_design RECORD;
  v_booking_id UUID;
  v_daily_count INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 1. Fetch reservation
  SELECT fr.*
  INTO v_res
  FROM public.flash_reservations fr
  WHERE fr.id = p_reservation_id
  FOR UPDATE;

  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอจองลาย Flash' USING ERRCODE = '22004';
  END IF;

  -- 2. Verify customer ownership
  IF v_res.customer_user_id != v_user_id THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ยืนยันคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- 3. Verify status and proposal existence
  IF v_res.status != 'PENDING' THEN
    RAISE EXCEPTION 'คำขอนี้ไม่อยู่ในสถานะที่สามารถยืนยันได้' USING ERRCODE = '22023';
  END IF;

  IF v_res.proposed_date IS NULL OR v_res.proposed_time IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลวันนัดหมายใหม่ที่ร้านเสนอ' USING ERRCODE = '22023';
  END IF;

  -- 4. Fetch design
  SELECT fd.*
  INTO v_design
  FROM public.flash_designs fd
  WHERE fd.id = v_res.flash_design_id;

  -- 5. Atomic advisory lock & daily capacity check on proposed_date
  IF v_design.artist_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('lock_artist_date:' || v_design.artist_id::TEXT || ':' || v_res.proposed_date::TEXT)
    );

    IF EXISTS (
      SELECT 1 FROM public.artist_blocked_dates
      WHERE blocked_date = v_res.proposed_date
        AND (
          scope = 'STUDIO'
          OR (scope = 'ARTIST' AND artist_id = v_design.artist_id)
        )
    ) THEN
      RAISE EXCEPTION 'วันที่เลือกช่างไม่พร้อมให้บริการ กรุณาติดต่อร้าน' USING ERRCODE = '23505';
    END IF;

    WITH active_distinct_jobs AS (
      SELECT
        ('est:' || e.id::TEXT) AS job_id
      FROM public.estimate_requests e
      WHERE (CASE WHEN e.is_date_proposed IS TRUE THEN e.proposed_date ELSE e.preferred_date END) = v_res.proposed_date
        AND e.artist_id = v_design.artist_id
        AND e.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.estimate_request_id = e.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )

      UNION ALL

      SELECT
        ('bk:' || b.id::TEXT) AS job_id
      FROM public.bookings b
      WHERE b.requested_date = v_res.proposed_date
        AND b.artist_id = v_design.artist_id
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.flash_reservation_id IS NULL OR b.flash_reservation_id != p_reservation_id)

      UNION ALL

      SELECT
        ('sess:' || s.id::TEXT) AS job_id
      FROM public.booking_sessions s
      JOIN public.bookings b ON s.booking_id = b.id
      WHERE (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = v_res.proposed_date
        AND b.artist_id = v_design.artist_id
        AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
        AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND (b.flash_reservation_id IS NULL OR b.flash_reservation_id != p_reservation_id)
        AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE != b.requested_date

      UNION ALL

      SELECT
        ('flash:' || fr.id::TEXT) AS job_id
      FROM public.flash_reservations fr
      JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
      WHERE (CASE WHEN fr.proposed_date IS NOT NULL THEN fr.proposed_date ELSE fr.requested_date END) = v_res.proposed_date
        AND fd.artist_id = v_design.artist_id
        AND fr.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        AND fr.id != p_reservation_id
        AND NOT EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.flash_reservation_id = fr.id
            AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
        )
    )
    SELECT COUNT(DISTINCT job_id)
    INTO v_daily_count
    FROM active_distinct_jobs;

    IF v_daily_count >= 3 THEN
      RAISE EXCEPTION 'วันที่เลือกคิวเต็มแล้ว (ครบ 3 คิวต่อวัน) กรุณาติดต่อร้านเพื่อเสนอวันอื่น' USING ERRCODE = '23505';
    END IF;
  END IF;

  -- 6. Apply proposed date/time to requested_date, clear proposal fields, set WAITING_DEPOSIT
  UPDATE public.flash_reservations
  SET
    requested_date = v_res.proposed_date,
    requested_start_time = v_res.proposed_time,
    proposed_date = NULL,
    proposed_time = NULL,
    proposal_note = NULL,
    date_proposed_at = NULL,
    status = 'WAITING_DEPOSIT',
    approved_at = COALESCE(approved_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE id = p_reservation_id;

  -- 7. Duplicate Booking Protection: Insert or Update single booking linked to flash_reservation
  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE flash_reservation_id = p_reservation_id;

  IF v_booking_id IS NULL THEN
    INSERT INTO public.bookings (
      flash_reservation_id,
      customer_user_id,
      artist_id,
      requested_date,
      requested_start_time,
      customer_note,
      admin_note,
      status,
      quoted_price,
      approved_at,
      created_at,
      updated_at
    ) VALUES (
      p_reservation_id,
      v_res.customer_user_id,
      v_design.artist_id,
      v_res.proposed_date,
      v_res.proposed_time,
      v_res.customer_note,
      COALESCE(v_res.proposal_note, 'ยืนยันวันนัดหมายใหม่ตามที่ร้านเสนอ'),
      'WAITING_DEPOSIT',
      v_design.price,
      pg_catalog.now(),
      pg_catalog.now(),
      pg_catalog.now()
    )
    RETURNING id INTO v_booking_id;
  ELSE
    UPDATE public.bookings
    SET
      requested_date = v_res.proposed_date,
      requested_start_time = v_res.proposed_time,
      status = 'WAITING_DEPOSIT',
      admin_note = COALESCE(v_res.proposal_note, admin_note),
      updated_at = pg_catalog.now()
    WHERE id = v_booking_id;
  END IF;

  -- 8. Lock flash design to RESERVED (All Flash designs are single-use)
  UPDATE public.flash_designs
  SET status = 'RESERVED', updated_at = pg_catalog.now()
  WHERE id = v_design.id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'booking_id', v_booking_id,
    'status', 'WAITING_DEPOSIT',
    'confirmed_date', v_res.proposed_date,
    'confirmed_time', v_res.proposed_time
  );
END;
$$;

REVOKE ALL ON FUNCTION public.customer_confirm_flash_proposed_date(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.customer_confirm_flash_proposed_date(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.customer_confirm_flash_proposed_date(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_confirm_flash_proposed_date(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Update RPC: public.artist_get_flash_reservations
--    Preserves 24 existing return fields + adds 4 proposal fields
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.artist_get_flash_reservations(UUID);

CREATE OR REPLACE FUNCTION public.artist_get_flash_reservations(p_artist_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  flash_design_id UUID,
  customer_user_id UUID,
  status TEXT,
  requested_date DATE,
  requested_start_time TIME WITHOUT TIME ZONE,
  customer_note TEXT,
  admin_note TEXT,
  placement TEXT,
  width_cm NUMERIC,
  height_cm NUMERIC,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  flash_design_title TEXT,
  flash_design_style TEXT,
  flash_design_image_url TEXT,
  flash_design_price NUMERIC,
  flash_design_deposit_amount NUMERIC,
  flash_design_size_label TEXT,
  flash_design_artist_id UUID,
  has_medical_condition BOOLEAN,
  medical_condition_note TEXT,
  has_allergy BOOLEAN,
  allergy_note TEXT,
  proposed_date DATE,
  proposed_time TIME WITHOUT TIME ZONE,
  proposal_note TEXT,
  date_proposed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_caller_artist_id UUID;
  v_effective_artist_id UUID;
BEGIN
  v_is_admin := private.is_admin();
  v_caller_artist_id := private.get_artist_id();

  IF v_is_admin THEN
    v_effective_artist_id := COALESCE(p_artist_id, v_caller_artist_id);
  ELSIF v_caller_artist_id IS NOT NULL THEN
    v_effective_artist_id := v_caller_artist_id;
  ELSE
    RETURN;
  END IF;

  IF v_effective_artist_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT 
    fr.id,
    fr.flash_design_id,
    fr.customer_user_id,
    fr.status,
    fr.requested_date,
    fr.requested_start_time,
    fr.customer_note,
    fr.admin_note,
    fr.placement,
    fr.width_cm,
    fr.height_cm,
    fr.created_at,
    fr.updated_at,
    fd.title AS flash_design_title,
    fd.style AS flash_design_style,
    fd.image_url AS flash_design_image_url,
    fd.price AS flash_design_price,
    fd.deposit_amount AS flash_design_deposit_amount,
    fd.size_label AS flash_design_size_label,
    fd.artist_id AS flash_design_artist_id,
    er.has_medical_condition,
    er.medical_condition_note,
    er.has_allergy,
    er.allergy_note,
    fr.proposed_date,
    fr.proposed_time,
    fr.proposal_note,
    fr.date_proposed_at
  FROM public.flash_reservations fr
  JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
  LEFT JOIN LATERAL (
    SELECT 
      est.has_medical_condition, 
      est.medical_condition_note, 
      est.has_allergy, 
      est.allergy_note
    FROM public.estimate_requests est
    WHERE est.customer_user_id = fr.customer_user_id
    ORDER BY est.created_at DESC
    LIMIT 1
  ) er ON true
  WHERE fd.artist_id = v_effective_artist_id
  ORDER BY fr.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.artist_get_flash_reservations(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.artist_get_flash_reservations(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.artist_get_flash_reservations(UUID) TO authenticated, service_role;

COMMIT;
