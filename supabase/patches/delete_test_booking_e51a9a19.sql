-- ============================================================================
-- ONE-TIME TEST DATA CLEANUP: คิว #e51a9a19
-- ============================================================================
-- ลบข้อมูลทดสอบเพียงรายการเดียว ไม่แก้ Schema / Migration เดิม
-- ห้ามรัน script นี้ใน Production โดยไม่ตรวจสอบก่อน
--
-- หลักฐานที่มา:
--   "คิว #e51a9a19" ถูก render จาก: booking.id.slice(0, 8)
--   → ค้นหาด้วย: LEFT(id::text, 8) = 'e51a9a19'
--   หรือ:        id::text LIKE 'e51a9a19%'
--
-- ขั้นตอน:
--   1. SELECT + ASSERT ว่าพบเป้าหมายเพียง 1 รายการ (ถ้า 0 หรือ >1 → RAISE EXCEPTION)
--   2. ลบตามลำดับ FK:
--      booking_payment_submissions → booking_payments → booking_sessions
--      → bookings → estimate_request_date_options → estimate_requests
--   3. แสดงผลสรุปรหัสที่ลบ
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_booking_id          UUID;
  v_estimate_request_id UUID;
  v_match_count         INT;

  -- นับรายการที่ลบจริง
  v_del_payment_submissions INT := 0;
  v_del_payments            INT := 0;
  v_del_sessions            INT := 0;
  v_del_bookings            INT := 0;
  v_del_date_options        INT := 0;
  v_del_estimate_requests   INT := 0;
BEGIN

  -- ================================================================
  -- STEP 1: ค้นหาและ ASSERT ว่ามีเป้าหมายเพียง 1 รายการเท่านั้น
  -- ================================================================
  SELECT COUNT(*) INTO v_match_count
  FROM public.bookings
  WHERE LEFT(id::text, 8) = 'e51a9a19';

  IF v_match_count = 0 THEN
    RAISE EXCEPTION
      '[ABORT] ไม่พบ booking ที่ขึ้นต้นด้วย "e51a9a19" — ไม่มีการลบใด ๆ'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_match_count > 1 THEN
    RAISE EXCEPTION
      '[ABORT] พบ booking ที่ตรงกัน % รายการ (คาดว่า 1) — ไม่ปลอดภัย จึงยกเลิกการลบทั้งหมด',
      v_match_count
      USING ERRCODE = 'P0001';
  END IF;

  -- ดึง booking_id ที่แน่นอน
  SELECT id, estimate_request_id
  INTO   v_booking_id, v_estimate_request_id
  FROM   public.bookings
  WHERE  LEFT(id::text, 8) = 'e51a9a19';

  RAISE NOTICE '✅ พบเป้าหมาย 1 รายการ: booking_id = %, estimate_request_id = %',
    v_booking_id, v_estimate_request_id;

  -- ================================================================
  -- STEP 1.5: Safety Guards ก่อนเริ่ม DELETE
  -- ================================================================

  -- Guard A: ล็อก target booking row เพื่อป้องกัน concurrent modification
  PERFORM id
  FROM public.bookings
  WHERE id = v_booking_id
  FOR UPDATE;

  -- Guard B: ถ้ามี estimate_request_id ให้ตรวจสอบว่าไม่มี booking อื่นอ้างอิงอยู่
  --          (ป้องกันการลบ estimate_requests ที่ยังมีคิวอื่น FK ชี้มา)
  IF v_estimate_request_id IS NOT NULL THEN
    DECLARE
      v_other_booking_count INT;
    BEGIN
      SELECT COUNT(*) INTO v_other_booking_count
      FROM public.bookings
      WHERE estimate_request_id = v_estimate_request_id
        AND id <> v_booking_id;

      IF v_other_booking_count > 0 THEN
        RAISE EXCEPTION
          '[ABORT] estimate_request_id % ยังมี booking อื่นอ้างอิงอยู่อีก % รายการ — ไม่ปลอดภัยที่จะลบ estimate_requests จึงยกเลิก transaction ทั้งหมด',
          v_estimate_request_id,
          v_other_booking_count
          USING ERRCODE = 'P0001';
      END IF;
    END;
  END IF;

  -- ================================================================
  -- STEP 2: ลบข้อมูลตามลำดับ (child → parent)
  -- ================================================================

  -- 2.1 booking_payment_submissions (FK → booking_id)
  DELETE FROM public.booking_payment_submissions
  WHERE booking_id = v_booking_id;
  GET DIAGNOSTICS v_del_payment_submissions = ROW_COUNT;

  -- 2.2 booking_payments (FK → booking_id)
  DELETE FROM public.booking_payments
  WHERE booking_id = v_booking_id;
  GET DIAGNOSTICS v_del_payments = ROW_COUNT;

  -- 2.3 booking_sessions (FK → booking_id)
  DELETE FROM public.booking_sessions
  WHERE booking_id = v_booking_id;
  GET DIAGNOSTICS v_del_sessions = ROW_COUNT;

  -- 2.4 bookings (ตัว booking เอง)
  DELETE FROM public.bookings
  WHERE id = v_booking_id;
  GET DIAGNOSTICS v_del_bookings = ROW_COUNT;

  -- 2.5 estimate_request_date_options (FK → estimate_request_id) — ลบก่อน parent
  IF v_estimate_request_id IS NOT NULL THEN
    DELETE FROM public.estimate_request_date_options
    WHERE estimate_request_id = v_estimate_request_id;
    GET DIAGNOSTICS v_del_date_options = ROW_COUNT;
  END IF;

  -- 2.6 estimate_requests (parent ลบหลังสุด)
  IF v_estimate_request_id IS NOT NULL THEN
    DELETE FROM public.estimate_requests
    WHERE id = v_estimate_request_id;
    GET DIAGNOSTICS v_del_estimate_requests = ROW_COUNT;
  END IF;

  -- ================================================================
  -- STEP 3: แสดงผลสรุปรหัสที่ลบ
  -- ================================================================
  RAISE NOTICE '============================================================';
  RAISE NOTICE '🗑️  สรุปการลบข้อมูลทดสอบ: คิว #e51a9a19';
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '  booking_id              : %', v_booking_id;
  RAISE NOTICE '  estimate_request_id     : %', COALESCE(v_estimate_request_id::text, '(null — Direct Booking)');
  RAISE NOTICE '------------------------------------------------------------';
  RAISE NOTICE '  booking_payment_submissions ลบ: % แถว', v_del_payment_submissions;
  RAISE NOTICE '  booking_payments            ลบ: % แถว', v_del_payments;
  RAISE NOTICE '  booking_sessions            ลบ: % แถว', v_del_sessions;
  RAISE NOTICE '  bookings                    ลบ: % แถว', v_del_bookings;
  RAISE NOTICE '  estimate_request_date_opts  ลบ: % แถว', v_del_date_options;
  RAISE NOTICE '  estimate_requests           ลบ: % แถว', v_del_estimate_requests;
  RAISE NOTICE '============================================================';
  RAISE NOTICE '✅ เสร็จสิ้น — ไม่มีการลบบัญชีลูกค้า/ช่าง/คิวอื่น';

END;
$$;

COMMIT;
