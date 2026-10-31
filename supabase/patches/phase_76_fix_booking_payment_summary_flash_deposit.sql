-- Phase 76: Fix booking_payment_summary SQL view to support flash_reservations deposit amount and status
CREATE OR REPLACE VIEW public.booking_payment_summary AS
SELECT 
    b.id AS booking_id,
    b.estimate_request_id,
    b.customer_user_id,
    b.artist_id,
    COALESCE(e.quoted_price, b.quoted_price, fd.price)::numeric(12,2) AS quoted_price,
    COALESCE(e.deposit_required, fd.deposit_amount, 500.00)::numeric(12,2) AS deposit_required,
    COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00)::numeric(12,2) AS paid_total,
    CASE
        WHEN COALESCE(e.quoted_price, b.quoted_price, fd.price) IS NULL THEN NULL::numeric(12,2)
        ELSE GREATEST(COALESCE(e.quoted_price, b.quoted_price, fd.price) - COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00), 0.00)::numeric(12,2)
    END AS remaining_balance,
    CASE
        WHEN COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) >= COALESCE(e.deposit_required, fd.deposit_amount, 500.00) THEN true
        ELSE false
    END AS deposit_paid,
    CASE
        WHEN COALESCE(e.quoted_price, b.quoted_price, fd.price) IS NULL OR COALESCE(e.quoted_price, b.quoted_price, fd.price) <= 0 THEN false
        ELSE COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) >= COALESCE(e.quoted_price, b.quoted_price, fd.price)
    END AS is_fully_paid
FROM public.bookings b
LEFT JOIN public.estimate_requests e ON e.id = b.estimate_request_id
LEFT JOIN public.flash_reservations fr ON fr.id = b.flash_reservation_id
LEFT JOIN public.flash_designs fd ON fd.id = fr.flash_design_id
LEFT JOIN public.booking_payments bp ON bp.booking_id = b.id
GROUP BY b.id, b.estimate_request_id, b.customer_user_id, b.artist_id, b.quoted_price, e.quoted_price, e.deposit_required, fd.price, fd.deposit_amount;
