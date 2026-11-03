-- ============================================================================
-- 157 TATTOO — PHASE 100: REAL SUPABASE BOOKING RESCHEDULE REQUESTS & RPCS
-- ============================================================================
-- Purpose:
--   Convert Reschedule Request flow from prototype (localStorage/tmp file)
--   to production-grade Supabase table with security definer RPCs, RLS, and Realtime.
--
-- Features:
--   1. Table: public.booking_reschedule_requests
--   2. Constraints: One active PENDING request per booking
--   3. RPC: customer_submit_reschedule_request (Customer submits with live capacity & slot validation)
--   4. RPC: staff_review_reschedule_request (Staff approves/rejects with atomic slot reallocation)
--   5. RPC: customer_cancel_reschedule_request (Customer cancels own pending request)
--   6. RLS: Strict security policies for Customer, Artist, and Admin
--   7. Realtime publication integration
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Create Table: public.booking_reschedule_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.booking_reschedule_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.booking_sessions(id) ON DELETE SET NULL,
  customer_user_id UUID NOT NULL REFERENCES auth.users(id),
  artist_id UUID NOT NULL REFERENCES public.artists(id),
  original_date DATE NOT NULL,
  original_start_time TIME WITHOUT TIME ZONE NOT NULL,
  original_end_time TIME WITHOUT TIME ZONE,
  requested_date DATE NOT NULL,
  requested_start_time TIME WITHOUT TIME ZONE NOT NULL,
  requested_end_time TIME WITHOUT TIME ZONE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  review_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

-- Comments
COMMENT ON TABLE public.booking_reschedule_requests IS '157 TATTOO — Customer booking reschedule requests with review lifecycle';

-- ----------------------------------------------------------------------------
-- 2. Indexes & Constraints
-- ----------------------------------------------------------------------------
-- Enforce only 1 active PENDING reschedule request per booking
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_pending_reschedule
ON public.booking_reschedule_requests (booking_id)
WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_reschedule_booking_id
ON public.booking_reschedule_requests (booking_id);

CREATE INDEX IF NOT EXISTS idx_reschedule_artist_status
ON public.booking_reschedule_requests (artist_id, status);

CREATE INDEX IF NOT EXISTS idx_reschedule_customer_user_id
ON public.booking_reschedule_requests (customer_user_id);

CREATE INDEX IF NOT EXISTS idx_reschedule_created_at
ON public.booking_reschedule_requests (created_at DESC);

-- ----------------------------------------------------------------------------
-- 2b. Auto-update Trigger for updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_booking_reschedule_request_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_booking_reschedule_requests_updated_at ON public.booking_reschedule_requests;
CREATE TRIGGER trg_booking_reschedule_requests_updated_at
BEFORE UPDATE ON public.booking_reschedule_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_booking_reschedule_request_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Row Level Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.booking_reschedule_requests ENABLE ROW LEVEL SECURITY;

-- 3a. Customer can view own reschedule requests
DROP POLICY IF EXISTS "customer_select_own_reschedule_requests" ON public.booking_reschedule_requests;
CREATE POLICY "customer_select_own_reschedule_requests"
ON public.booking_reschedule_requests
FOR SELECT
TO authenticated
USING (customer_user_id = auth.uid());

-- 3b. Artist can view requests assigned to them (or Admin can view all)
DROP POLICY IF EXISTS "artist_select_own_reschedule_requests" ON public.booking_reschedule_requests;
CREATE POLICY "artist_select_own_reschedule_requests"
ON public.booking_reschedule_requests
FOR SELECT
TO authenticated
USING (
  artist_id = private.get_artist_id()
  OR private.is_admin()
  OR COALESCE(auth.role(), '') = 'service_role'
  OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role'
);

-- 3c. Admin has full read/manage access
DROP POLICY IF EXISTS "admin_all_reschedule_requests" ON public.booking_reschedule_requests;
CREATE POLICY "admin_all_reschedule_requests"
ON public.booking_reschedule_requests
FOR ALL
TO authenticated
USING (
  private.is_admin()
  OR COALESCE(auth.role(), '') = 'service_role'
  OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role'
);

-- ----------------------------------------------------------------------------
-- 4. RPC: public.customer_submit_reschedule_request
-- Allows authenticated customer to submit a reschedule request for their confirmed booking.
-- Validates:
--   - Booking ownership & active status
--   - Duplicate pending check
--   - No past dates / times
--   - No same date/time as current slot
--   - Artist blocked dates
--   - Artist daily capacity (max 3 jobs / artist / day)
--   - Time overlap with other sessions
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_submit_reschedule_request(
  p_booking_id UUID,
  p_requested_date DATE,
  p_requested_start_time TIME WITHOUT TIME ZONE,
  p_requested_end_time TIME WITHOUT TIME ZONE DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_session_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_booking RECORD;
  v_session RECORD;
  v_orig_date DATE;
  v_orig_start_time TIME WITHOUT TIME ZONE;
  v_orig_end_time TIME WITHOUT TIME ZONE;
  v_session_id UUID;
  v_actual_end_time TIME WITHOUT TIME ZONE;
  v_now_bkk TIMESTAMPTZ;
  v_today_bkk DATE;
  v_time_bkk TIME WITHOUT TIME ZONE;
  v_req_start_at TIMESTAMPTZ;
  v_req_end_at TIMESTAMPTZ;
  v_daily_job_count INT;
  v_conflict_count INT;
  v_new_record RECORD;
BEGIN
  -- 1. Verify Authentication
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบก่อนทำรายการ' USING ERRCODE = '42501';
  END IF;

  -- 2. Verify Booking Ownership & Status
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบข้อมูลคิวงาน' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.customer_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคิวงานนี้' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED') THEN
    RAISE EXCEPTION 'ไม่สามารถขอเลื่อนนัดสำหรับคิวที่ยกเลิกหรือเสร็จสิ้นแล้ว' USING ERRCODE = '22023';
  END IF;

  IF v_booking.artist_id IS NULL THEN
    RAISE EXCEPTION 'คิวนี้ยังไม่ได้รับการระบุช่างสัก' USING ERRCODE = '22023';
  END IF;

  -- 3. Check Duplicate Active Pending Request
  IF EXISTS (
    SELECT 1 FROM public.booking_reschedule_requests
    WHERE booking_id = p_booking_id AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'มีคำขอเลื่อนนัดที่รอตรวจสอบอยู่แล้ว' USING ERRCODE = '22023';
  END IF;

  -- 4. Date & Time Validations
  v_now_bkk := pg_catalog.now() AT TIME ZONE 'Asia/Bangkok';
  v_today_bkk := v_now_bkk::DATE;
  v_time_bkk := v_now_bkk::TIME;

  IF p_requested_date IS NULL THEN
    RAISE EXCEPTION 'กรุณาเลือกวันที่ต้องการเลื่อนนัด' USING ERRCODE = '22023';
  END IF;

  IF p_requested_date < v_today_bkk THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกวันที่ย้อนหลังได้' USING ERRCODE = '22023';
  END IF;

  IF p_requested_start_time IS NULL THEN
    RAISE EXCEPTION 'กรุณาเลือกเวลาที่ต้องการเลื่อนนัด' USING ERRCODE = '22023';
  END IF;

  IF p_requested_date = v_today_bkk AND p_requested_start_time <= v_time_bkk THEN
    RAISE EXCEPTION 'ไม่สามารถเลือกเวลาในอดีตได้ กรุณาเลือกเวลาล่วงหน้า' USING ERRCODE = '22023';
  END IF;

  -- 5. Resolve Target Session & Original Dates
  v_session_id := NULL;
  IF p_session_id IS NOT NULL THEN
    SELECT s.id, s.start_at, s.end_at, s.status
    INTO v_session
    FROM public.booking_sessions s
    WHERE s.id = p_session_id AND s.booking_id = p_booking_id;
    IF v_session.id IS NOT NULL THEN
      v_session_id := v_session.id;
    END IF;
  END IF;

  IF v_session_id IS NULL THEN
    SELECT s.id, s.start_at, s.end_at, s.status
    INTO v_session
    FROM public.booking_sessions s
    WHERE s.booking_id = p_booking_id AND s.status = 'SCHEDULED'
    ORDER BY s.session_number ASC
    LIMIT 1;
    IF v_session.id IS NOT NULL THEN
      v_session_id := v_session.id;
    END IF;
  END IF;

  IF v_session.id IS NOT NULL AND v_session.start_at IS NOT NULL THEN
    v_orig_date := (v_session.start_at AT TIME ZONE 'Asia/Bangkok')::DATE;
    v_orig_start_time := (v_session.start_at AT TIME ZONE 'Asia/Bangkok')::TIME;
    v_orig_end_time := (v_session.end_at AT TIME ZONE 'Asia/Bangkok')::TIME;
  ELSE
    v_orig_date := COALESCE(v_booking.requested_date, v_today_bkk);
    v_orig_start_time := COALESCE(v_booking.requested_start_time, '13:00'::TIME);
    v_orig_end_time := v_orig_start_time + INTERVAL '2 hours';
  END IF;

  -- Must not be same slot
  IF p_requested_date = v_orig_date AND p_requested_start_time = v_orig_start_time THEN
    RAISE EXCEPTION 'วันและเวลาใหม่ต้องไม่ซ้ำกับวันนัดปัจจุบัน' USING ERRCODE = '22023';
  END IF;

  -- Calculate requested end time
  v_actual_end_time := COALESCE(
    p_requested_end_time,
    p_requested_start_time + INTERVAL '2 hours'
  );
  IF v_actual_end_time <= p_requested_start_time THEN
    v_actual_end_time := p_requested_start_time + INTERVAL '2 hours';
  END IF;

  v_req_start_at := (p_requested_date::TEXT || ' ' || p_requested_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_req_end_at := (p_requested_date::TEXT || ' ' || v_actual_end_time::TEXT || '+07')::TIMESTAMPTZ;

  -- 6. Check Artist & Studio Blocked Dates
  IF EXISTS (
    SELECT 1 FROM public.artist_blocked_dates
    WHERE blocked_date = p_requested_date
      AND (
        scope = 'STUDIO'
        OR (scope = 'ARTIST' AND artist_id = v_booking.artist_id)
        OR (artist_id IS NULL AND scope IS NULL)
      )
  ) THEN
    RAISE EXCEPTION 'ช่างหรือร้านปิดรับคิวในวันที่เลือก กรุณาเลือกวันอื่น' USING ERRCODE = '22023';
  END IF;

  -- 7. Check Daily Capacity (Max 3 jobs / artist / day, deduplicated by booking)
  SELECT COUNT(DISTINCT b.id) INTO v_daily_job_count
  FROM public.bookings b
  WHERE b.artist_id = v_booking.artist_id
    AND b.id != p_booking_id
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND (
      b.requested_date = p_requested_date
      OR EXISTS (
        SELECT 1 FROM public.booking_sessions s
        WHERE s.booking_id = b.id
          AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = p_requested_date
          AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      )
    );

  IF v_daily_job_count >= 3 THEN
    RAISE EXCEPTION 'ช่างรับงานครบในวันที่เลือกแล้ว กรุณาเลือกวันอื่น' USING ERRCODE = '22023';
  END IF;

  -- 8. Check Time Overlap Against Other Active Sessions
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE b.artist_id = v_booking.artist_id
    AND s.booking_id != p_booking_id
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND s.start_at < v_req_end_at
    AND s.end_at > v_req_start_at;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'เวลาที่เลือกไม่ว่าง มีคิวอื่นจองแล้ว กรุณาเลือกเวลาอื่น' USING ERRCODE = '22023';
  END IF;

  -- 9. Insert Record into booking_reschedule_requests
  INSERT INTO public.booking_reschedule_requests (
    booking_id,
    session_id,
    customer_user_id,
    artist_id,
    original_date,
    original_start_time,
    original_end_time,
    requested_date,
    requested_start_time,
    requested_end_time,
    reason,
    status
  ) VALUES (
    p_booking_id,
    v_session_id,
    v_uid,
    v_booking.artist_id,
    v_orig_date,
    v_orig_start_time,
    v_orig_end_time,
    p_requested_date,
    p_requested_start_time,
    v_actual_end_time,
    COALESCE(NULLIF(TRIM(p_reason), ''), 'ไม่สะดวกตามวันและเวลาเดิม'),
    'PENDING'
  ) RETURNING * INTO v_new_record;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'message', 'ส่งคำขอเลื่อนวันนัดหมายเรียบร้อยแล้ว รอทางร้านและช่างตรวจสอบ',
    'request', pg_catalog.to_jsonb(v_new_record)
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC: public.customer_cancel_reschedule_request
-- Allows customer to cancel their own PENDING reschedule request.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_cancel_reschedule_request(
  p_reschedule_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID;
  v_req RECORD;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'กรุณาเข้าสู่ระบบก่อนทำรายการ' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req
  FROM public.booking_reschedule_requests
  WHERE id = p_reschedule_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอเลื่อนนัด' USING ERRCODE = 'P0002';
  END IF;

  IF v_req.customer_user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์ยกเลิกคำขอนี้' USING ERRCODE = '42501';
  END IF;

  IF v_req.status != 'PENDING' THEN
    RAISE EXCEPTION 'ไม่สามารถยกเลิกคำขอที่ได้รับการพิจารณาไปแล้ว' USING ERRCODE = '22023';
  END IF;

  UPDATE public.booking_reschedule_requests
  SET
    status = 'CANCELLED',
    updated_at = pg_catalog.now()
  WHERE id = p_reschedule_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'message', 'ยกเลิกคำขอเลื่อนนัดหมายแล้ว วันและเวลานัดเดิมยังคงมีผลอยู่'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. RPC: public.staff_review_reschedule_request
-- Allows Admin or Assigned Artist to review (APPROVE / REJECT) a pending reschedule request.
-- When APPROVED:
--   - Re-checks live capacity and time overlap
--   - Updates booking_sessions (start_at, end_at)
--   - Updates bookings (requested_date, requested_start_time)
--   - Updates estimate_requests (preferred_date if exists)
--   - Sets status = 'APPROVED'
--   - All executed in a single atomic transaction.
-- When REJECTED:
--   - Sets status = 'REJECTED' with optional review_note.
--   - Does NOT touch booking/session schedule.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_review_reschedule_request(
  p_reschedule_request_id UUID,
  p_action TEXT,
  p_review_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_staff_artist_id UUID;
  v_req RECORD;
  v_booking RECORD;
  v_session RECORD;
  v_req_start_at TIMESTAMPTZ;
  v_req_end_at TIMESTAMPTZ;
  v_daily_job_count INT;
  v_conflict_count INT;
  v_session_id UUID;
  v_note TEXT;
BEGIN
  -- 1. Authorization Check (Admin or Staff Artist)
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_staff_artist_id := private.get_artist_id();

  IF NOT (v_is_admin OR v_staff_artist_id IS NOT NULL) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์พิจารณาคำขอเลื่อนนัด' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Action
  IF UPPER(TRIM(p_action)) NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Invalid action: must be APPROVE or REJECT' USING ERRCODE = '22023';
  END IF;

  -- 3. Lock & Select Reschedule Request
  SELECT * INTO v_req
  FROM public.booking_reschedule_requests
  WHERE id = p_reschedule_request_id
  FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอเลื่อนนัด %', p_reschedule_request_id USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status != 'PENDING' THEN
    RAISE EXCEPTION 'คำขอนี้ได้รับการพิจารณาไปแล้ว (สถานะปัจจุบัน: %)', v_req.status USING ERRCODE = '22023';
  END IF;

  -- If not admin, artist must match request's assigned artist
  IF NOT v_is_admin THEN
    IF v_req.artist_id IS DISTINCT FROM v_staff_artist_id THEN
      RAISE EXCEPTION 'คุณไม่มีสิทธิ์จัดการคำขอของช่างท่านอื่น' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 4. Lock & Select Booking
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = v_req.booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคิวงานที่เกี่ยวข้อง' USING ERRCODE = 'P0002';
  END IF;

  IF v_booking.status IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED') THEN
    RAISE EXCEPTION 'คิวงานนี้ไม่อยู่ในสถานะที่สามารถเลื่อนนัดได้ (%)', v_booking.status USING ERRCODE = '22023';
  END IF;

  -- --------------------------------------------------------------------------
  -- REJECT ACTION
  -- --------------------------------------------------------------------------
  IF UPPER(TRIM(p_action)) = 'REJECT' THEN
    IF NULLIF(TRIM(COALESCE(p_review_note, '')), '') IS NULL THEN
      RAISE EXCEPTION 'กรุณาระบุเหตุผลในการปฏิเสธคำขอเลื่อนนัด' USING ERRCODE = '22023';
    END IF;

    UPDATE public.booking_reschedule_requests
    SET
      status = 'REJECTED',
      review_note = TRIM(p_review_note),
      reviewed_by = auth.uid(),
      reviewed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    WHERE id = p_reschedule_request_id;

    RETURN pg_catalog.jsonb_build_object(
      'success', true,
      'action', 'REJECTED',
      'message', 'ปฏิเสธคำขอเลื่อนนัดหมายแล้ว (คงวันและเวลาเดิม)'
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- APPROVE ACTION (Atomic Date Update & Reallocation)
  -- --------------------------------------------------------------------------
  -- 5. Calculate New Datetimes (+07 Bangkok)
  v_req_start_at := (v_req.requested_date::TEXT || ' ' || v_req.requested_start_time::TEXT || '+07')::TIMESTAMPTZ;
  v_req_end_at := (v_req.requested_date::TEXT || ' ' || COALESCE(v_req.requested_end_time, v_req.requested_start_time + INTERVAL '2 hours')::TEXT || '+07')::TIMESTAMPTZ;
  IF v_req_end_at <= v_req_start_at THEN
    v_req_end_at := v_req_start_at + INTERVAL '2 hours';
  END IF;

  -- 6. Re-verify Blocked Dates for Requested Date
  IF EXISTS (
    SELECT 1 FROM public.artist_blocked_dates
    WHERE blocked_date = v_req.requested_date
      AND (
        scope = 'STUDIO'
        OR (scope = 'ARTIST' AND artist_id = v_booking.artist_id)
        OR (artist_id IS NULL AND scope IS NULL)
      )
  ) THEN
    RAISE EXCEPTION 'ไม่สามารถอนุมัติได้: ร้านหรือช่างปิดรับคิวในวันที่ขอเลื่อน' USING ERRCODE = '22023';
  END IF;

  -- 7. Re-verify Artist Daily Capacity (Max 3 jobs, deduplicated by booking)
  SELECT COUNT(DISTINCT b.id) INTO v_daily_job_count
  FROM public.bookings b
  WHERE b.artist_id = v_booking.artist_id
    AND b.id != v_booking.id
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND (
      b.requested_date = v_req.requested_date
      OR EXISTS (
        SELECT 1 FROM public.booking_sessions s
        WHERE s.booking_id = b.id
          AND (s.start_at AT TIME ZONE 'Asia/Bangkok')::DATE = v_req.requested_date
          AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
      )
    );

  IF v_daily_job_count >= 3 THEN
    RAISE EXCEPTION 'ไม่สามารถอนุมัติได้: ช่างรับงานครบ 3 คิวในวันที่ลูกค้าขอเลื่อนแล้ว' USING ERRCODE = '22023';
  END IF;

  -- 8. Identify & Lock Session to Update
  v_session_id := v_req.session_id;
  IF v_session_id IS NOT NULL THEN
    SELECT * INTO v_session
    FROM public.booking_sessions
    WHERE id = v_session_id AND booking_id = v_booking.id
    FOR UPDATE;
  END IF;

  IF v_session.id IS NULL THEN
    SELECT * INTO v_session
    FROM public.booking_sessions
    WHERE booking_id = v_booking.id AND status = 'SCHEDULED'
    ORDER BY session_number ASC
    LIMIT 1
    FOR UPDATE;
    IF v_session.id IS NOT NULL THEN
      v_session_id := v_session.id;
    END IF;
  END IF;

  -- 9. Check Time Overlap against other active sessions (excluding this session)
  SELECT COUNT(*) INTO v_conflict_count
  FROM public.booking_sessions s
  JOIN public.bookings b ON b.id = s.booking_id
  WHERE b.artist_id = v_booking.artist_id
    AND s.booking_id != v_booking.id
    AND (v_session_id IS NULL OR s.id != v_session_id)
    AND s.status IN ('SCHEDULED', 'IN_PROGRESS')
    AND b.status NOT IN ('CANCELLED', 'REJECTED', 'EXPIRED', 'COMPLETED')
    AND s.start_at < v_req_end_at
    AND s.end_at > v_req_start_at;

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'ไม่สามารถอนุมัติได้: ช่วงเวลาที่ขอเลื่อนมีคิวอื่นทับซ้อนอยู่แล้ว' USING ERRCODE = '22023';
  END IF;

  -- 10. Update Session if exists
  v_note := COALESCE(p_review_note, 'เลื่อนนัดตามคำขอลูกค้า: ' || v_req.reason);
  IF v_session.id IS NOT NULL THEN
    UPDATE public.booking_sessions
    SET
      start_at = v_req_start_at,
      end_at = v_req_end_at,
      note = CASE WHEN p_review_note IS NOT NULL THEN p_review_note ELSE note END,
      updated_at = pg_catalog.now()
    WHERE id = v_session.id;
  END IF;

  -- 11. Update Parent Booking requested_date & requested_start_time
  UPDATE public.bookings
  SET
    requested_date = v_req.requested_date,
    requested_start_time = v_req.requested_start_time,
    updated_at = pg_catalog.now()
  WHERE id = v_booking.id;

  -- 12. Update Parent Estimate Request preferred_date if linked
  IF v_booking.estimate_request_id IS NOT NULL THEN
    UPDATE public.estimate_requests
    SET
      preferred_date = v_req.requested_date,
      updated_at = pg_catalog.now()
    WHERE id = v_booking.estimate_request_id;
  END IF;

  -- 13. Update Reschedule Request Record to APPROVED
  UPDATE public.booking_reschedule_requests
  SET
    status = 'APPROVED',
    review_note = p_review_note,
    reviewed_by = auth.uid(),
    reviewed_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  WHERE id = p_reschedule_request_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'action', 'APPROVED',
    'message', 'อนุมัติคำขอเลื่อนนัดหมายเรียบร้อยแล้ว คิวงานได้รับการอัปเดตวันและเวลาใหม่ทันที',
    'new_date', v_req.requested_date,
    'new_start_time', v_req.requested_start_time
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Add Table to Supabase Realtime Publication
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'booking_reschedule_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_reschedule_requests;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- In case publication does not exist or user doesn't have superuser in dev container
    NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. RPC Execution Permissions (Security Hardening)
-- Revoke execution from PUBLIC and anon, grant only to authenticated and service_role.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.customer_submit_reschedule_request(UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_submit_reschedule_request(UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT, UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.customer_cancel_reschedule_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_cancel_reschedule_request(UUID) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.staff_review_reschedule_request(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_review_reschedule_request(UUID, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
