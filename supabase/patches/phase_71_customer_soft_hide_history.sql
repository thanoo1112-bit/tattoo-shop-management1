-- Phase 71: Customer Soft-Hide History System ("ซ่อนรายการจากประวัติของฉัน")
-- Description: Add customer_hidden_at column and RPCs to allow customers to soft-hide completed/rejected/cancelled requests from Customer Portal without hard-deleting database records.

-- 1. Add customer_hidden_at TIMESTAMPTZ column to estimate_requests
ALTER TABLE public.estimate_requests
ADD COLUMN IF NOT EXISTS customer_hidden_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add customer_hidden_at TIMESTAMPTZ column to flash_reservations
ALTER TABLE public.flash_reservations
ADD COLUMN IF NOT EXISTS customer_hidden_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_estimate_requests_cust_hidden
ON public.estimate_requests (customer_user_id, customer_hidden_at);

CREATE INDEX IF NOT EXISTS idx_flash_reservations_cust_hidden
ON public.flash_reservations (customer_user_id, customer_hidden_at);

-- 4. RPC function to hide estimate request for current authenticated customer
CREATE OR REPLACE FUNCTION public.customer_hide_estimate_request(
    p_estimate_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_target_user_id UUID;
    v_status TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'คุณต้องเข้าสู่ระบบก่อนทำรายการ');
    END IF;

    SELECT customer_user_id, status
    INTO v_target_user_id, v_status
    FROM public.estimate_requests
    WHERE id = p_estimate_request_id;

    IF v_target_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'ไม่พบข้อมูลคำขอที่ระบุ');
    END IF;

    IF v_target_user_id <> v_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'คุณไม่มีสิทธิ์ซ่อนรายการนี้');
    END IF;

    -- Update customer_hidden_at timestamp
    UPDATE public.estimate_requests
    SET customer_hidden_at = NOW()
    WHERE id = p_estimate_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'ซ่อนรายการออกจากประวัติสำเร็จ',
        'estimate_request_id', p_estimate_request_id
    );
END;
$$;

-- 5. RPC function to hide flash reservation for current authenticated customer
CREATE OR REPLACE FUNCTION public.customer_hide_flash_reservation(
    p_reservation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_target_user_id UUID;
    v_status TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED', 'message', 'คุณต้องเข้าสู่ระบบก่อนทำรายการ');
    END IF;

    SELECT customer_user_id, status
    INTO v_target_user_id, v_status
    FROM public.flash_reservations
    WHERE id = p_reservation_id;

    IF v_target_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND', 'message', 'ไม่พบข้อมูลการจองลายสักที่ระบุ');
    END IF;

    IF v_target_user_id <> v_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN', 'message', 'คุณไม่มีสิทธิ์ซ่อนรายการนี้');
    END IF;

    -- Update customer_hidden_at timestamp
    UPDATE public.flash_reservations
    SET customer_hidden_at = NOW()
    WHERE id = p_reservation_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'ซ่อนรายการออกจากประวัติสำเร็จ',
        'reservation_id', p_reservation_id
    );
END;
$$;

-- Grant EXECUTE permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.customer_hide_estimate_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_hide_flash_reservation(UUID) TO authenticated;
