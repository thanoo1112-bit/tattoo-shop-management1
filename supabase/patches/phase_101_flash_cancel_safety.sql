-- =============================================================================
-- 157 TATTOO — PHASE 101: FLASH CANCEL SAFETY PATCH
--
-- Objective:
-- Hardens public.cancel_flash_reservation(p_reservation_id UUID) to:
-- 1. Preserve original signature, SECURITY DEFINER, SET search_path = '', and permissions.
-- 2. Lock target flash_reservation row FOR UPDATE and verify ownership (auth.uid()).
-- 3. Restrict cancellation strictly to PENDING and WAITING_DEPOSIT states.
-- 4. Payment Guard:
--    Reject cancellation if any booking_payment_submissions exist in PENDING or APPROVED status.
--    Reject cancellation if linked booking indicates deposit_paid = true.
-- 5. Cascade Cancel:
--    - Set flash_reservations.status = 'CANCELLED', cancelled_at = NOW()
--    - Set linked bookings.status = 'CANCELLED', updated_at = NOW()
--    - Set linked booking_sessions (status != 'COMPLETED') to 'CANCELLED'
--    Eliminating all active bookings and ghost sessions consuming daily 3-slot capacity.
-- 6. Flash Design Restore:
--    - If is_repeatable = false (Single-use):
--      Check if any OTHER active reservation/booking exists for this design.
--      If none, restore public.flash_designs.status = 'AVAILABLE'.
--    - If is_repeatable = true (Repeatable):
--      Preserve flash_designs status (must stay AVAILABLE, never changed).
--
-- FOR LOCAL REVIEW ONLY — DO NOT APPLY TO LIVE DATABASE UNTIL APPROVED.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_flash_reservation(
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
  v_booking RECORD;
  v_has_pending_or_approved_slip BOOLEAN := FALSE;
  v_other_active_reservation_exists BOOLEAN := FALSE;
BEGIN
  -- 1. Authentication check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'p_reservation_id is required' USING ERRCODE = '22004';
  END IF;

  -- 2. Lock and retrieve flash_reservation row
  SELECT
    id,
    flash_design_id,
    customer_user_id,
    status,
    booking_id
  INTO v_res
  FROM public.flash_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ไม่พบรายการจอง Flash' USING ERRCODE = 'P0002';
  END IF;

  -- Verify ownership
  IF v_res.customer_user_id != v_user_id THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ยกเลิกคำขอจองนี้' USING ERRCODE = '42501';
  END IF;

  -- 3. Allowed Cancel States Check
  -- Strictly only allow PENDING or WAITING_DEPOSIT
  IF v_res.status NOT IN ('PENDING', 'WAITING_DEPOSIT') THEN
    IF v_res.status = 'CANCELLED' THEN
      RAISE EXCEPTION 'รายการจองนี้ถูกยกเลิกไปแล้ว' USING ERRCODE = '22000';
    ELSIF v_res.status IN ('APPROVED', 'CONFIRMED') THEN
      RAISE EXCEPTION 'รายการจองนี้ได้รับการยืนยันแล้ว กรุณาติดต่อทางร้านหากต้องการยกเลิกหรือเปลี่ยนแปลง' USING ERRCODE = '22000';
    ELSIF v_res.status = 'COMPLETED' THEN
      RAISE EXCEPTION 'รายการจองนี้เสร็จสิ้นแล้ว ไม่สามารถยกเลิกได้' USING ERRCODE = '22000';
    ELSIF v_res.status = 'EXPIRED' THEN
      RAISE EXCEPTION 'รายการจองนี้หมดเวลาแล้ว' USING ERRCODE = '22000';
    ELSIF v_res.status = 'REJECTED' THEN
      RAISE EXCEPTION 'รายการจองนี้ถูกปฏิเสธไปแล้ว' USING ERRCODE = '22000';
    ELSE
      RAISE EXCEPTION 'ไม่สามารถยกเลิกรายการจองในสถานะ % ได้' , v_res.status USING ERRCODE = '22000';
    END IF;
  END IF;

  -- 4. Locate and lock linked booking if present
  -- Find booking either via v_res.booking_id or bookings.flash_reservation_id
  SELECT
    id,
    status,
    deposit_paid
  INTO v_booking
  FROM public.bookings
  WHERE (id = v_res.booking_id OR flash_reservation_id = v_res.id)
    AND status NOT IN ('CANCELLED', 'REJECTED')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  -- 5. Payment Guard
  IF v_booking.id IS NOT NULL THEN
    -- Check if deposit is already marked paid
    IF COALESCE(v_booking.deposit_paid, FALSE) IS TRUE THEN
      RAISE EXCEPTION 'คิวนี้มีการชำระเงินมัดจำเรียบร้อยแล้ว กรุณาติดต่อทางร้านหากต้องการยกเลิกคิว' USING ERRCODE = '22000';
    END IF;

    -- Check if any payment submission exists with PENDING or APPROVED status
    SELECT EXISTS (
      SELECT 1
      FROM public.booking_payment_submissions
      WHERE booking_id = v_booking.id
        AND status IN ('PENDING', 'APPROVED')
    ) INTO v_has_pending_or_approved_slip;

    IF v_has_pending_or_approved_slip THEN
      RAISE EXCEPTION 'คิวนี้มีสลิปชำระเงินที่รอตรวจสอบหรือได้รับการอนุมัติแล้ว กรุณาติดต่อทางร้านหากต้องการยกเลิกคิว' USING ERRCODE = '22000';
    END IF;
  END IF;

  -- Also check if payment submissions are linked directly via reservation if applicable
  SELECT EXISTS (
    SELECT 1
    FROM public.booking_payment_submissions bps
    JOIN public.bookings b ON bps.booking_id = b.id
    WHERE (b.flash_reservation_id = v_res.id OR b.id = v_res.booking_id)
      AND bps.status IN ('PENDING', 'APPROVED')
  ) INTO v_has_pending_or_approved_slip;

  IF v_has_pending_or_approved_slip THEN
    RAISE EXCEPTION 'คิวนี้มีสลิปชำระเงินที่รอตรวจสอบหรือได้รับการอนุมัติแล้ว กรุณาติดต่อทางร้านหากต้องการยกเลิกคิว' USING ERRCODE = '22000';
  END IF;

  -- 6. Lock and retrieve flash design
  SELECT
    id,
    status,
    COALESCE(is_repeatable, FALSE) AS is_repeatable
  INTO v_design
  FROM public.flash_designs
  WHERE id = v_res.flash_design_id
  FOR UPDATE;

  -- 7. Cascade Cancel
  -- A. Update flash_reservations
  UPDATE public.flash_reservations
  SET
    status = 'CANCELLED',
    cancelled_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  WHERE id = v_res.id;

  -- B. Update linked bookings (if found)
  IF v_booking.id IS NOT NULL THEN
    UPDATE public.bookings
    SET
      status = 'CANCELLED',
      cancelled_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
    WHERE id = v_booking.id;

    -- C. Cancel linked booking sessions that are not COMPLETED
    UPDATE public.booking_sessions
    SET
      status = 'CANCELLED',
      updated_at = pg_catalog.now()
    WHERE booking_id = v_booking.id
      AND status != 'COMPLETED';
  END IF;

  -- Also update any other booking rows tied to this flash_reservation_id
  UPDATE public.bookings
  SET
    status = 'CANCELLED',
    cancelled_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  WHERE flash_reservation_id = v_res.id
    AND status NOT IN ('CANCELLED', 'REJECTED');

  UPDATE public.booking_sessions
  SET
    status = 'CANCELLED',
    updated_at = pg_catalog.now()
  WHERE booking_id IN (
    SELECT id FROM public.bookings WHERE flash_reservation_id = v_res.id
  ) AND status != 'COMPLETED';

  -- 8. Restore Flash Design State
  IF v_design.id IS NOT NULL THEN
    IF v_design.is_repeatable IS FALSE THEN
      -- Single-use flash design:
      -- Check if any other active reservation or booking still exists for this design
      SELECT EXISTS (
        SELECT 1
        FROM public.flash_reservations fr
        WHERE fr.flash_design_id = v_design.id
          AND fr.id != v_res.id
          AND fr.status NOT IN ('CANCELLED', 'EXPIRED', 'REJECTED')
      ) OR EXISTS (
        SELECT 1
        FROM public.bookings b
        JOIN public.flash_reservations fr2 ON b.flash_reservation_id = fr2.id
        WHERE fr2.flash_design_id = v_design.id
          AND fr2.id != v_res.id
          AND b.status NOT IN ('CANCELLED', 'EXPIRED', 'REJECTED')
      ) INTO v_other_active_reservation_exists;

      IF NOT v_other_active_reservation_exists THEN
        UPDATE public.flash_designs
        SET
          status = 'AVAILABLE',
          updated_at = pg_catalog.now()
        WHERE id = v_design.id;
      END IF;
    ELSE
      -- Repeatable flash design:
      -- Keep AVAILABLE, do not touch status
      NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_res.id,
    'status', 'CANCELLED'
  );
END;
$$;

-- 9. Grants
REVOKE ALL ON FUNCTION public.cancel_flash_reservation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_flash_reservation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_flash_reservation(UUID) TO service_role;

COMMIT;
