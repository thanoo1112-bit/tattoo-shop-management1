-- ============================================================================
-- 157 TATTOO — PHASE 16 PATCH: PRICE ADJUSTMENT ARTIST OWNERSHIP SECURITY
-- Admin = All Jobs | Artist = Own Assigned Jobs Only | Customer = Denied
-- ============================================================================

-- 1. Tighten RLS Security Model on public.booking_price_adjustments
DROP POLICY IF EXISTS "Allow staff read on booking_price_adjustments" ON public.booking_price_adjustments;
DROP POLICY IF EXISTS "Allow admin or assigned artist read on booking_price_adjustments" ON public.booking_price_adjustments;

-- Admin can read all history; Artist can ONLY read history for bookings assigned to themselves
CREATE POLICY "Allow admin or assigned artist read on booking_price_adjustments"
  ON public.booking_price_adjustments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
        AND p.role = 'admin'
        AND p.is_active = true
    )
    OR
    EXISTS (
      SELECT 1 FROM public.bookings b
      JOIN public.artists a ON b.artist_id = a.id
      WHERE b.id = booking_price_adjustments.booking_id
        AND a.user_id = auth.uid()
        AND a.is_active = true
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE (p.user_id = auth.uid() OR p.id = auth.uid())
            AND p.role = 'artist'
            AND p.is_active = true
        )
    )
  );

-- Direct client mutations forbidden
REVOKE INSERT, UPDATE, DELETE ON public.booking_price_adjustments FROM public, anon, authenticated;
GRANT SELECT ON public.booking_price_adjustments TO authenticated, service_role;

-- 2. Hardened RPC: admin_update_booking_price with Ownership Verification
CREATE OR REPLACE FUNCTION public.admin_update_booking_price(
  p_booking_id UUID,
  p_new_price NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_uid UUID;
  v_caller_role TEXT;
  v_artist_id UUID;
  v_booking RECORD;
  v_estimate_id UUID;
  v_current_price NUMERIC;
  v_paid_total NUMERIC;
  v_adjustment_amount NUMERIC;
  v_adj_id UUID;
BEGIN
  -- 1. Identify Caller strictly from auth.uid()
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: Authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Fetch Caller Profile Role
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE (user_id = v_caller_uid OR id = v_caller_uid)
    AND is_active = true
  LIMIT 1;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'artist') THEN
    RAISE EXCEPTION 'FORBIDDEN: Admin/Staff privileges required' USING ERRCODE = '42501';
  END IF;

  -- 3. Validate input price > 0
  IF p_new_price IS NULL OR p_new_price <= 0 THEN
    RAISE EXCEPTION 'ราคางานใหม่ต้องมากกว่า 0' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock Booking row FOR UPDATE
  SELECT b.id, b.status, b.estimate_request_id, b.artist_id
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  -- 5. Artist Ownership Authorization Check (Admin can update all; Artist only own assigned jobs)
  IF v_caller_role = 'artist' THEN
    SELECT a.id INTO v_artist_id
    FROM public.artists a
    WHERE a.user_id = v_caller_uid
      AND a.is_active = true
    LIMIT 1;

    IF v_artist_id IS NULL OR v_booking.artist_id IS NULL OR v_booking.artist_id != v_artist_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Artist can only update price for assigned bookings' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 6. Validate Status (Allowed: WAITING_DEPOSIT, CONFIRMED, IN_PROGRESS)
  IF v_booking.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'ไม่สามารถปรับราคางานในสถานะ % ได้', v_booking.status USING ERRCODE = 'P0001';
  END IF;

  -- 7. Lock Estimate Request row FOR UPDATE
  v_estimate_id := v_booking.estimate_request_id;
  IF v_estimate_id IS NULL THEN
    RAISE EXCEPTION 'Booking % has no linked estimate request', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  SELECT quoted_price
  INTO v_current_price
  FROM public.estimate_requests
  WHERE id = v_estimate_id
  FOR UPDATE;

  IF v_current_price IS NULL THEN
    RAISE EXCEPTION 'ยังไม่มีการเสนอราคาเริ่มต้น' USING ERRCODE = 'P0001';
  END IF;

  -- 8. Check if price actually changed
  IF p_new_price = v_current_price THEN
    RAISE EXCEPTION 'ราคางานใหม่ต้องไม่เท่ากับราคาปัจจุบัน' USING ERRCODE = 'P0001';
  END IF;

  -- 9. Calculate paid_total
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_total
  FROM public.booking_payments
  WHERE booking_id = p_booking_id
    AND status = 'RECORDED';

  -- 10. Validate new_price >= paid_total
  IF p_new_price < v_paid_total THEN
    RAISE EXCEPTION 'ราคางานใหม่ต้องไม่น้อยกว่ายอดที่ลูกค้าชำระแล้ว (ชำระแล้ว % บาท)', v_paid_total USING ERRCODE = 'P0001';
  END IF;

  v_adjustment_amount := p_new_price - v_current_price;

  -- 11. Insert Price Adjustment Audit Log (created_by / adjusted_by = v_caller_uid)
  INSERT INTO public.booking_price_adjustments (
    booking_id,
    estimate_request_id,
    previous_price,
    new_price,
    adjustment_amount,
    note,
    adjusted_by
  ) VALUES (
    p_booking_id,
    v_estimate_id,
    v_current_price,
    p_new_price,
    v_adjustment_amount,
    p_note,
    v_caller_uid
  ) RETURNING id INTO v_adj_id;

  -- 12. Update estimate_requests.quoted_price = p_new_price
  UPDATE public.estimate_requests
  SET
    quoted_price = p_new_price,
    updated_at = pg_catalog.now()
  WHERE id = v_estimate_id;

  -- 13. Return JSONB summary
  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'adjustment_id', v_adj_id,
    'previous_price', v_current_price,
    'new_price', p_new_price,
    'adjustment_amount', v_adjustment_amount,
    'paid_total', v_paid_total,
    'remaining_balance', GREATEST(p_new_price - v_paid_total, 0)
  );
END;
$$;

-- Permissions Lockdown
REVOKE ALL ON FUNCTION public.admin_update_booking_price FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_update_booking_price FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_booking_price TO authenticated, service_role;
