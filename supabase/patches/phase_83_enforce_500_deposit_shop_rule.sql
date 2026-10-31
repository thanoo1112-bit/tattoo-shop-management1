-- ============================================================================
-- 157 TATTOO — PHASE 83 MIGRATION
-- ENFORCE ฿500 DEPOSIT SHOP RULE ACROSS ALL FLASH DESIGNS & BOOKINGS
-- ============================================================================

BEGIN;

-- 1. Update default constraint and set all flash_designs deposit_amount to 500.00
ALTER TABLE public.flash_designs 
  ALTER COLUMN deposit_amount SET DEFAULT 500.00;

UPDATE public.flash_designs
SET deposit_amount = 500.00
WHERE deposit_amount IS NULL OR deposit_amount != 500.00;

-- 2. Ensure booking_payment_summary SQL view strictly returns 500.00 deposit_required
CREATE OR REPLACE VIEW public.booking_payment_summary AS
SELECT 
    b.id AS booking_id,
    b.estimate_request_id,
    b.customer_user_id,
    b.artist_id,
    COALESCE(e.quoted_price, b.quoted_price, fd.price)::numeric(12,2) AS quoted_price,
    COALESCE(e.deposit_required, 500.00)::numeric(12,2) AS deposit_required,
    COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00)::numeric(12,2) AS paid_total,
    CASE
        WHEN COALESCE(e.quoted_price, b.quoted_price, fd.price) IS NULL THEN NULL::numeric(12,2)
        ELSE GREATEST(COALESCE(e.quoted_price, b.quoted_price, fd.price) - COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00), 0.00)::numeric(12,2)
    END AS remaining_balance,
    CASE
        WHEN COALESCE(SUM(bp.amount) FILTER (WHERE bp.status = 'RECORDED'), 0.00) >= COALESCE(e.deposit_required, 500.00) THEN true
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

GRANT SELECT ON public.booking_payment_summary TO authenticated;
GRANT SELECT ON public.booking_payment_summary TO anon, service_role;

COMMIT;
