-- ============================================================================
-- 157 TATTOO — PHASE 81 MIGRATION
-- FIX EXPIRED FLASH RESERVATION FILTERING IN ARTIST RPC & BACKEND ACTION GUARD
-- ============================================================================

BEGIN;

-- 1. Update artist_get_flash_reservations RPC to exclude EXPIRED status
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
  allergy_note TEXT
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
    v_effective_artist_id := p_artist_id;
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
    er.allergy_note
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
    AND fr.status NOT IN ('CANCELLED', 'CONFIRMED', 'COMPLETED', 'APPROVED', 'REJECTED', 'EXPIRED')
  ORDER BY fr.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.artist_get_flash_reservations(UUID) TO authenticated, service_role;


-- 2. Update artist_confirm_flash_reservation to block actions on terminal/expired reservations
CREATE OR REPLACE FUNCTION public.artist_confirm_flash_reservation(
  p_reservation_id UUID,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res RECORD;
  v_design RECORD;
  v_booking_id UUID;
  v_is_admin BOOLEAN;
  v_artist_id UUID;
  v_start_at TIMESTAMPTZ;
BEGIN
  v_is_admin := private.is_admin() OR COALESCE(auth.role(), '') = 'service_role' OR COALESCE((auth.jwt() ->> 'role'), '') = 'service_role';
  v_artist_id := private.get_artist_id();

  SELECT * INTO v_res
  FROM public.flash_reservations
  WHERE id = p_reservation_id;

  IF v_res.id IS NULL THEN
    RAISE EXCEPTION 'ไม่พบคำขอจอง Flash' USING ERRCODE = 'P0002';
  END IF;

  -- Terminal status check: Block actions on EXPIRED, CANCELLED, REJECTED, or COMPLETED reservations
  IF v_res.status IN ('CANCELLED', 'EXPIRED', 'REJECTED', 'COMPLETED') THEN
    RAISE EXCEPTION 'คำขอจอง Flash นี้อยู่ในสถานะ % ไม่สามารถอนุมัติได้', v_res.status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_design
  FROM public.flash_designs
  WHERE id = v_res.flash_design_id;

  -- Security Check: Admin OR assigned Artist only
  IF NOT (v_is_admin OR (v_design.artist_id IS NOT NULL AND v_design.artist_id = v_artist_id)) THEN
    RAISE EXCEPTION 'คุณไม่มีสิทธิ์อนุมัติคำขอนี้' USING ERRCODE = '42501';
  END IF;

  -- PAST APPOINTMENT DATE GUARD: Block approval if requested appointment time has passed
  IF v_res.requested_date IS NOT NULL THEN
    BEGIN
      v_start_at := (v_res.requested_date::text || ' ' || COALESCE(v_res.requested_start_time, '10:00:00')::text || '+07')::TIMESTAMPTZ;
      IF v_start_at < pg_catalog.now() THEN
        RAISE EXCEPTION 'PAST_APPOINTMENT_TIME: เวลานัดหมายผ่านไปแล้ว ไม่สามารถยืนยันคิวสำหรับวันนัดเก่าได้ กรุณาเลือกวันและเวลานัดใหม่'
          USING ERRCODE = 'P0001';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM LIKE '%PAST_APPOINTMENT_TIME%' THEN
        RAISE;
      END IF;
    END;
  END IF;

  -- 1. Check if booking already exists for this flash reservation
  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE flash_reservation_id = p_reservation_id;

  IF v_booking_id IS NULL THEN
    -- Insert new booking record in status WAITING_DEPOSIT
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
      v_res.requested_date,
      v_res.requested_start_time,
      v_res.customer_note,
      COALESCE(p_admin_note, 'อนุมัติโดยช่าง'),
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
      status = 'WAITING_DEPOSIT',
      admin_note = COALESCE(p_admin_note, admin_note),
      updated_at = pg_catalog.now()
    WHERE id = v_booking_id;
  END IF;

  -- 2. Update flash_reservations status to WAITING_DEPOSIT
  UPDATE public.flash_reservations
  SET
    status = 'WAITING_DEPOSIT',
    admin_note = COALESCE(p_admin_note, admin_note),
    approved_at = COALESCE(approved_at, pg_catalog.now()),
    updated_at = pg_catalog.now()
  WHERE id = p_reservation_id;

  -- 3. Lock flash design if single-use (is_repeatable = false)
  IF COALESCE(v_design.is_repeatable, FALSE) IS FALSE THEN
    UPDATE public.flash_designs
    SET status = 'RESERVED', updated_at = pg_catalog.now()
    WHERE id = v_design.id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'booking_id', v_booking_id,
    'reservation_id', p_reservation_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.artist_confirm_flash_reservation(UUID, TEXT) TO authenticated, service_role;

COMMIT;
