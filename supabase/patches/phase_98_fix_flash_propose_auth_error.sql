-- ============================================================================
-- 157 TATTOO — PHASE 98: FIX FLASH PROPOSE AUTH + USER-FRIENDLY ERROR
-- Fix RPC: public.artist_propose_flash_reservation_date
-- Remove invalid reference to public.admin_users
-- Authenticate via private.is_admin() and private.get_artist_id()
-- LOCAL PATCH ONLY — DO NOT APPLY SQL DIRECTLY
-- ============================================================================

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
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ดำเนินการคำขอนี้' USING ERRCODE = '42501';
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
      RAISE EXCEPTION 'วันที่เลือกช่างไม่พร้อมให้บริการ กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
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
      RAISE EXCEPTION 'วันที่นี้คิวของช่างเต็ม 3 งานแล้ว กรุณาเลือกวันอื่น' USING ERRCODE = '23505';
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
