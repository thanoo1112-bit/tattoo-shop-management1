CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.shops ADD COLUMN timezone text NOT NULL DEFAULT 'Asia/Bangkok';

CREATE TABLE public.shop_booking_settings (
    shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
    deposit_required boolean NOT NULL DEFAULT false,
    default_deposit_amount numeric NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'THB',
    hold_minutes integer NOT NULL DEFAULT 30 CHECK (hold_minutes > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (default_deposit_amount >= 0),
    CHECK (deposit_required = false OR default_deposit_amount > 0)
);

ALTER TABLE public.shop_booking_settings ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.shop_booking_settings FROM authenticated, anon, public;
