-- ============================================================================
-- 157 TATTOO — PHASE 94 MIGRATION PATCH
-- ADMIN DIRECT BOOKING ATOMIC TRANSACTION RPC
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_create_direct_booking(
  p_customer_mode TEXT,
  p_customer_id UUID,
  p_display_name TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_date_of_birth DATE,
  p_artist_id UUID,
  p_appointment_date DATE,
  p_start_time TIME WITHOUT TIME ZONE,
  p_end_time TIME WITHOUT TIME ZONE,
  p_placement TEXT,
  p_style TEXT,
  p_description TEXT,
  p_quoted_price NUMERIC,
  p_deposit_amount NUMERIC,
  p_payment_method TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_customer_mode TEXT;
  v_customer_id UUID;
  v_customer_user_id UUID;
  v_is_duplicate_customer BOOLEAN := false;
  v_raw_phone TEXT;
  v_clean_phone TEXT;
  v_clean_email TEXT;
  v_existing_by_phone RECORD;
  v_existing_by_email RECORD;
  v_customer RECORD;
  v_estimate_request_id UUID;
  v_booking_id UUID;
  v_session_id UUID;
  v_session_start_at TIMESTAMPTZ;
  v_session_end_at TIMESTAMPTZ;
  v_custom_end_at TIMESTAMPTZ;
  v_payment_id UUID := NULL;
  v_payment_method TEXT;
  v_quoted_price NUMERIC;
  v_deposit_amount NUMERIC;
BEGIN
  -- 1. Security Check: Authenticated Admin
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Only admin can create direct booking' USING ERRCODE = '42501';
  END IF;

  -- 2. Validate Customer Mode
  v_customer_mode := upper(pg_catalog.btrim(COALESCE(p_customer_mode, '')));
  IF v_customer_mode NOT IN ('EXISTING', 'NEW') THEN
    RAISE EXCEPTION 'INVALID_CUSTOMER_MODE: Customer mode must be EXISTING or NEW' USING ERRCODE = '22023';
  END IF;

  IF v_customer_mode = 'EXISTING' THEN
    IF p_customer_id IS NULL THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: customer_id is required for EXISTING mode' USING ERRCODE = '22004';
    END IF;

    SELECT id, user_id, display_name, phone, email
    INTO v_customer
    FROM public.customers
    WHERE id = p_customer_id;

    IF v_customer.id IS NULL THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND: Customer with id % not found', p_customer_id USING ERRCODE = 'P0002';
    END IF;

    v_customer_id := v_customer.id;
    v_customer_user_id := v_customer.user_id;
    v_is_duplicate_customer := false;

  ELSE
    -- Mode NEW: Input validation
    IF p_display_name IS NULL OR pg_catalog.btrim(p_display_name) = '' THEN
      RAISE EXCEPTION 'NAME_REQUIRED: กรุณาระบุชื่อลูกค้า' USING ERRCODE = '22004';
    END IF;

    -- Thai phone normalization & validation
    v_raw_phone := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
    IF v_raw_phone LIKE '66%' AND pg_catalog.length(v_raw_phone) = 11 THEN
      v_clean_phone := '0' || pg_catalog.substr(v_raw_phone, 3);
    ELSIF pg_catalog.length(v_raw_phone) = 10 AND v_raw_phone LIKE '0%' THEN
      v_clean_phone := v_raw_phone;
    ELSE
      RAISE EXCEPTION 'INVALID_PHONE: เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก (เช่น 0812345678)' USING ERRCODE = '22023';
    END IF;

    -- Normalize email
    IF p_email IS NOT NULL AND pg_catalog.btrim(p_email) <> '' THEN
      v_clean_email := pg_catalog.lower(pg_catalog.btrim(p_email));
    ELSE
      v_clean_email := NULL;
    END IF;

    -- Pre-checks for duplicates
    SELECT * INTO v_existing_by_phone
    FROM public.customers
    WHERE phone = v_clean_phone
    LIMIT 1;

    IF v_clean_email IS NOT NULL THEN
      SELECT * INTO v_existing_by_email
      FROM public.customers
      WHERE pg_catalog.lower(email) = pg_catalog.lower(v_clean_email)
      LIMIT 1;
    END IF;

    -- Scenario B: Phone belongs to Customer A, but Email belongs to Customer B -> ABORT / NO AUTO-MERGE
    IF v_existing_by_phone.id IS NOT NULL 
       AND v_existing_by_email.id IS NOT NULL 
       AND v_existing_by_phone.id <> v_existing_by_email.id THEN
      RAISE EXCEPTION 'DUPLICATE_CONFLICT: เบอร์โทรศัพท์และอีเมลตรงกับลูกค้าคนละท่านในระบบ กรุณาตรวจสอบข้อมูล' USING ERRCODE = '23505';
    END IF;

    -- Scenario C: Email matches existing customer, but phone does NOT match
    IF v_existing_by_phone.id IS NULL AND v_existing_by_email.id IS NOT NULL THEN
      RAISE EXCEPTION 'DUPLICATE_EMAIL: อีเมลนี้ถูกใช้งานโดยลูกค้าท่านอื่นแล้ว (%)', v_existing_by_email.display_name USING ERRCODE = '23505';
    END IF;

    -- Scenario A: Phone matches existing customer (reuse customer record)
    IF v_existing_by_phone.id IS NOT NULL THEN
      v_customer_id := v_existing_by_phone.id;
      v_customer_user_id := v_existing_by_phone.user_id;
      v_is_duplicate_customer := true;
    ELSE
      -- Insert New Customer with Concurrency Trap
      BEGIN
        INSERT INTO public.customers (
          display_name,
          phone,
          email,
          date_of_birth,
          user_id,
          created_at,
          updated_at
        ) VALUES (
          pg_catalog.btrim(p_display_name),
          v_clean_phone,
          v_clean_email,
          p_date_of_birth,
          NULL,
          pg_catalog.clock_timestamp(),
          pg_catalog.clock_timestamp()
        )
        RETURNING id, user_id INTO v_customer_id, v_customer_user_id;
        v_is_duplicate_customer := false;

      EXCEPTION WHEN unique_violation THEN
        -- Concurrent insert collided
        SELECT * INTO v_existing_by_phone
        FROM public.customers
        WHERE phone = v_clean_phone
        LIMIT 1;

        IF v_clean_email IS NOT NULL THEN
          SELECT * INTO v_existing_by_email
          FROM public.customers
          WHERE pg_catalog.lower(email) = pg_catalog.lower(v_clean_email)
          LIMIT 1;
        END IF;

        IF v_existing_by_phone.id IS NOT NULL THEN
          IF v_existing_by_email.id IS NOT NULL AND v_existing_by_phone.id <> v_existing_by_email.id THEN
            RAISE EXCEPTION 'DUPLICATE_CONFLICT: เบอร์โทรศัพท์และอีเมลตรงกับลูกค้าคนละท่านในระบบ กรุณาตรวจสอบข้อมูล' USING ERRCODE = '23505';
          END IF;
          v_customer_id := v_existing_by_phone.id;
          v_customer_user_id := v_existing_by_phone.user_id;
          v_is_duplicate_customer := true;
        ELSIF v_existing_by_email.id IS NOT NULL THEN
          RAISE EXCEPTION 'DUPLICATE_EMAIL: อีเมลนี้ถูกใช้งานโดยลูกค้าท่านอื่นแล้ว (%)', v_existing_by_email.display_name USING ERRCODE = '23505';
        ELSE
          RAISE EXCEPTION 'UNIQUE_VIOLATION: ข้อมูลลูกค้าซ้ำซ้อนในระบบ' USING ERRCODE = '23505';
        END IF;
      END;
    END IF;
  END IF;

  -- 3. Validate Artist
  IF p_artist_id IS NULL THEN
    RAISE EXCEPTION 'ARTIST_NOT_FOUND: artist_id is required' USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.artists WHERE id = p_artist_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'ARTIST_NOT_FOUND: Artist % not found or inactive', p_artist_id USING ERRCODE = '22023';
  END IF;

  -- 4. Validate Appointment Date & Times
  IF p_appointment_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_DATE: appointment_date is required' USING ERRCODE = '22004';
  END IF;

  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'INVALID_TIME: start_time is required' USING ERRCODE = '22004';
  END IF;

  IF p_end_time IS NOT NULL AND p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'INVALID_TIME: end_time must be greater than start_time' USING ERRCODE = '22023';
  END IF;

  -- 5. Validate Price & Deposit
  v_quoted_price := COALESCE(p_quoted_price, 0);
  v_deposit_amount := COALESCE(p_deposit_amount, 0);

  IF v_quoted_price < 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE: quoted_price cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_deposit_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE: deposit_amount cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF v_deposit_amount > v_quoted_price THEN
    RAISE EXCEPTION 'INVALID_PRICE: deposit_amount cannot exceed quoted_price' USING ERRCODE = '22023';
  END IF;

  -- 6. Create Estimate Request
  -- Note: trigger trig_00_estimate_insert_defaults forces status='PENDING', so we INSERT then UPDATE to 'QUOTED'
  INSERT INTO public.estimate_requests (
    customer_id,
    customer_user_id,
    artist_id,
    placement,
    width_cm,
    height_cm,
    style,
    description,
    preferred_date,
    preferred_time,
    reference_images,
    request_type,
    work_type,
    deposit_required,
    created_at,
    updated_at
  ) VALUES (
    v_customer_id,
    v_customer_user_id,
    p_artist_id,
    COALESCE(NULLIF(pg_catalog.btrim(p_placement), ''), 'ไม่ระบุ'),
    10,
    10,
    COALESCE(NULLIF(pg_catalog.btrim(p_style), ''), 'ตามที่ช่างแนะนำ'),
    COALESCE(NULLIF(pg_catalog.btrim(p_description), ''), 'สร้างคิวงานใหม่โดยผู้ดูแลระบบ (Direct Booking)'),
    p_appointment_date,
    p_start_time,
    '{}'::text[],
    'DIRECT_BOOKING',
    'NEW_TATTOO',
    v_deposit_amount,
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_estimate_request_id;

  -- Transition status to QUOTED with price
  UPDATE public.estimate_requests
  SET
    status = 'QUOTED',
    quoted_price = v_quoted_price,
    deposit_required = v_deposit_amount,
    quoted_at = pg_catalog.now(),
    updated_at = pg_catalog.now()
  WHERE id = v_estimate_request_id;

  -- 7. Create Booking
  -- (Trigger trig_auto_create_session_1 automatically creates Session #1 upon INSERT into public.bookings)
  INSERT INTO public.bookings (
    estimate_request_id,
    customer_id,
    customer_user_id,
    artist_id,
    requested_date,
    requested_start_time,
    customer_note,
    admin_note,
    quoted_price,
    status,
    approved_at,
    confirmed_at,
    created_at,
    updated_at
  ) VALUES (
    v_estimate_request_id,
    v_customer_id,
    v_customer_user_id,
    p_artist_id,
    p_appointment_date,
    p_start_time,
    COALESCE(NULLIF(pg_catalog.btrim(p_description), ''), 'สร้างคิวงานใหม่โดยผู้ดูแลระบบ (Direct Booking)'),
    'สร้างคิวงานใหม่โดยผู้ดูแลระบบ (Direct Booking)',
    v_quoted_price,
    'CONFIRMED',
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now(),
    pg_catalog.now()
  )
  RETURNING id INTO v_booking_id;

  -- 8. Verify Auto-Created Session #1 from Trigger trig_auto_create_session_1
  SELECT id, start_at, end_at
  INTO v_session_id, v_session_start_at, v_session_end_at
  FROM public.booking_sessions
  WHERE booking_id = v_booking_id AND session_number = 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_CREATION_FAILED: Failed to auto-create booking session #1 for booking %', v_booking_id USING ERRCODE = 'P0001';
  END IF;

  -- If p_end_time provided, persist into booking_sessions.end_at
  IF p_end_time IS NOT NULL THEN
    v_custom_end_at := (p_appointment_date::TEXT || ' ' || p_end_time::TEXT || '+07')::TIMESTAMPTZ;
    IF v_custom_end_at > v_session_start_at THEN
      UPDATE public.booking_sessions
      SET end_at = v_custom_end_at,
          updated_at = pg_catalog.now()
      WHERE id = v_session_id;
      v_session_end_at := v_custom_end_at;
    END IF;
  END IF;

  -- 9. Payment Recording (if deposit > 0)
  IF v_deposit_amount > 0 THEN
    v_payment_method := upper(COALESCE(NULLIF(pg_catalog.btrim(p_payment_method), ''), 'CASH'));
    IF v_payment_method NOT IN ('CASH', 'BANK_TRANSFER', 'QR', 'OTHER') THEN
      v_payment_method := 'CASH';
    END IF;

    INSERT INTO public.booking_payments (
      booking_id,
      booking_session_id,
      customer_id,
      payment_type,
      amount,
      payment_method,
      status,
      paid_at,
      note,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      v_booking_id,
      v_session_id,
      v_customer_id,
      'DEPOSIT',
      v_deposit_amount,
      v_payment_method,
      'RECORDED',
      pg_catalog.now(),
      'มัดจำที่รับแล้ว (Direct Booking)',
      auth.uid(),
      pg_catalog.now(),
      pg_catalog.now()
    )
    RETURNING id INTO v_payment_id;
  ELSE
    v_payment_id := NULL;
  END IF;

  -- 10. Return Structured Success Payload
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'customer_id', v_customer_id,
    'customer_user_id', v_customer_user_id,
    'estimate_request_id', v_estimate_request_id,
    'booking_id', v_booking_id,
    'booking_session_id', v_session_id,
    'payment_id', v_payment_id,
    'is_duplicate_customer', v_is_duplicate_customer,
    'message', 'สร้างคิวงานโดยตรงสำเร็จ'
  );
END;
$$;

-- Permissions for admin_create_direct_booking
REVOKE ALL ON FUNCTION public.admin_create_direct_booking(
  TEXT, UUID, TEXT, TEXT, TEXT, DATE,
  UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE,
  TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_create_direct_booking(
  TEXT, UUID, TEXT, TEXT, TEXT, DATE,
  UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE,
  TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT
) FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_create_direct_booking(
  TEXT, UUID, TEXT, TEXT, TEXT, DATE,
  UUID, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE,
  TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT
) TO authenticated, service_role;

COMMIT;
