-- ============================================================================
-- 157 TATTOO — PHASE 14 PATCH: FLEXIBLE TATTOO JOB PRICE SYSTEM
-- Initial Price -> Current Price -> Final Lock
-- Supports audit history table: public.booking_price_adjustments
-- Supports RPC: public.admin_update_booking_price
-- ============================================================================

-- 1. Create Price Adjustments Audit Table
CREATE TABLE IF NOT EXISTS public.booking_price_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  estimate_request_id UUID REFERENCES public.estimate_requests(id) ON DELETE SET NULL,
  previous_price NUMERIC(12,2) NOT NULL,
  new_price NUMERIC(12,2) NOT NULL,
  adjustment_amount NUMERIC(12,2) NOT NULL,
  note TEXT,
  adjusted_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_booking_price_adjustments_booking ON public.booking_price_adjustments(booking_id);
CREATE INDEX IF NOT EXISTS idx_booking_price_adjustments_estimate ON public.booking_price_adjustments(estimate_request_id);

-- 2. RLS Security Model (Hardened)
ALTER TABLE public.booking_price_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated read on booking_price_adjustments" ON public.booking_price_adjustments;
DROP POLICY IF EXISTS "Allow staff read on booking_price_adjustments" ON public.booking_price_adjustments;

CREATE POLICY "Allow staff read on booking_price_adjustments"
  ON public.booking_price_adjustments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE (profiles.user_id = auth.uid() OR profiles.id = auth.uid())
        AND profiles.role IN ('admin', 'artist')
        AND profiles.is_active = true
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.booking_price_adjustments FROM public, anon, authenticated;
GRANT SELECT ON public.booking_price_adjustments TO authenticated, service_role;

-- 3. Hardened RPC: admin_update_booking_price
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

  -- 2. Strict Role Verification: Must be Admin or Artist staff
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
  SELECT b.id, b.status, b.estimate_request_id
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking % not found', p_booking_id USING ERRCODE = 'P0001';
  END IF;

  -- 5. Validate Status (Allowed: WAITING_DEPOSIT, CONFIRMED, IN_PROGRESS)
  IF v_booking.status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'ไม่สามารถปรับราคางานในสถานะ % ได้', v_booking.status USING ERRCODE = 'P0001';
  END IF;

  -- 6. Lock Estimate Request row FOR UPDATE
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

  -- 7. Check if price actually changed
  IF p_new_price = v_current_price THEN
    RAISE EXCEPTION 'ราคางานใหม่ต้องไม่เท่ากับราคาปัจจุบัน' USING ERRCODE = 'P0001';
  END IF;

  -- 8. Calculate paid_total
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_total
  FROM public.booking_payments
  WHERE booking_id = p_booking_id
    AND status = 'RECORDED';

  -- 9. Validate new_price >= paid_total
  IF p_new_price < v_paid_total THEN
    RAISE EXCEPTION 'ราคางานใหม่ต้องไม่น้อยกว่ายอดที่ลูกค้าชำระแล้ว (ชำระแล้ว % บาท)', v_paid_total USING ERRCODE = 'P0001';
  END IF;

  v_adjustment_amount := p_new_price - v_current_price;

  -- 10. Insert Price Adjustment Audit Log
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

  -- 11. Update estimate_requests.quoted_price = p_new_price
  UPDATE public.estimate_requests
  SET
    quoted_price = p_new_price,
    updated_at = pg_catalog.now()
  WHERE id = v_estimate_id;

  -- 12. Return JSONB summary
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
