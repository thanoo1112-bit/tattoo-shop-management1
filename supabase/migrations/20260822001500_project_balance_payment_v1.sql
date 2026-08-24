-- ==============================================================================
-- Project Balance Payment Backend V1
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_project_balance_payment(
    p_project_id uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_project record;
    v_is_authorized boolean := false;
    v_paid_total numeric := 0;
    v_remaining_balance numeric := 0;
    v_existing_pending_payment record;
    v_new_payment_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 1. Fetch and lock project
    SELECT * INTO v_project FROM public.tattoo_projects WHERE id = p_project_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project not found';
    END IF;

    -- 2. Authorization
    -- Owner can initiate for any project in their shop
    IF EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_project.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'owner'
    ) THEN
        v_is_authorized := true;
    -- Artist can initiate only for their assigned project in their shop
    ELSIF v_project.artist_id = v_user_id AND EXISTS (
        SELECT 1 FROM public.shop_members 
        WHERE shop_id = v_project.shop_id 
          AND user_id = v_user_id 
          AND status = 'active' 
          AND role = 'artist'
    ) THEN
        v_is_authorized := true;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION 'Unauthorized to settle balance for this project';
    END IF;

    -- 3. Project Eligibility
    IF v_project.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot settle balance for a cancelled project';
    END IF;

    -- 4. Agreed Price Validation
    IF v_project.agreed_price IS NULL OR v_project.agreed_price < 0 THEN
        RAISE EXCEPTION 'Invalid or missing agreed_price for this project';
    END IF;

    -- 5. Check for refund_pending
    IF EXISTS (
        SELECT 1 FROM public.payments p
        WHERE (p.project_id = p_project_id 
               OR p.booking_request_id IN (SELECT id FROM public.booking_requests WHERE project_id = p_project_id))
          AND p.status = 'refund_pending'
    ) THEN
        RAISE EXCEPTION 'มีรายการคืนเงินที่กำลังดำเนินการ กรุณาดำเนินการให้เสร็จก่อนปิดยอด';
    END IF;

    -- 6. Calculate Paid Total
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_total
    FROM public.payments p
    WHERE (p.project_id = p_project_id 
           OR p.booking_request_id IN (SELECT id FROM public.booking_requests WHERE project_id = p_project_id))
      AND p.status = 'paid';

    -- 7. Calculate Remaining Balance
    v_remaining_balance := v_project.agreed_price - v_paid_total;

    IF v_remaining_balance <= 0 THEN
        RAISE EXCEPTION 'ไม่มียอดคงเหลือที่ต้องชำระ';
    END IF;

    -- 8. Duplicate Active Balance Guard
    -- Lock active balance payments for this project to prevent race condition
    SELECT * INTO v_existing_pending_payment 
    FROM public.payments 
    WHERE (project_id = p_project_id 
           OR booking_request_id IN (SELECT id FROM public.booking_requests WHERE project_id = p_project_id))
      AND payment_type = 'balance' 
      AND status IN ('pending', 'verification_pending')
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'มีรายการรอชำระยอดคงเหลืออยู่แล้ว';
    END IF;

    -- 9. Create Payment
    INSERT INTO public.payments (
        shop_id,
        customer_id,
        project_id,
        payment_type,
        amount,
        currency,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_project.shop_id,
        v_project.customer_id,
        p_project_id,
        'balance',
        v_remaining_balance,
        'THB',
        'pending',
        now(),
        now()
    ) RETURNING id INTO v_new_payment_id;

    -- 10. Return Result
    RETURN json_build_object(
        'payment_id', v_new_payment_id,
        'amount', v_remaining_balance,
        'remaining_balance', v_remaining_balance,
        'payment_status', 'pending'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_balance_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_project_balance_payment(uuid) TO authenticated;
