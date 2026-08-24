CREATE TABLE public.appointments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL,
    project_id uuid NOT NULL,
    booking_request_id uuid,
    customer_id uuid NOT NULL,
    artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    session_number integer NOT NULL CHECK (session_number > 0),
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled', 'no_show')),
    notes text,
    
    created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    cancelled_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    FOREIGN KEY (shop_id, project_id) REFERENCES public.tattoo_projects(shop_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (shop_id, customer_id) REFERENCES public.customers(shop_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (shop_id, booking_request_id) REFERENCES public.booking_requests(shop_id, id) ON DELETE RESTRICT,
    
    CHECK (start_at < end_at),
    UNIQUE (project_id, session_number),
    UNIQUE (shop_id, id)
);

ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_overlap_exclude 
EXCLUDE USING gist (
    artist_id WITH =, 
    tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (status IN ('scheduled', 'in_progress'));

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.appointments FROM authenticated, anon, public;

CREATE TABLE public.payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    project_id uuid,
    booking_request_id uuid,
    appointment_id uuid,
    payment_type text NOT NULL CHECK (payment_type IN ('deposit', 'balance', 'full_payment')),
    amount numeric NOT NULL CHECK (amount >= 0),
    currency text NOT NULL DEFAULT 'THB',
    status text NOT NULL CHECK (status IN ('pending', 'verification_pending', 'paid', 'failed', 'refund_pending', 'refunded', 'cancelled')),
    provider text,
    provider_reference text,
    proof_storage_path text,
    proof_submitted_at timestamptz,
    paid_at timestamptz,
    refunded_at timestamptz,
    
    verified_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON DELETE RESTRICT,
    FOREIGN KEY (shop_id, customer_id) REFERENCES public.customers(shop_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (shop_id, project_id) REFERENCES public.tattoo_projects(shop_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (shop_id, booking_request_id) REFERENCES public.booking_requests(shop_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (shop_id, appointment_id) REFERENCES public.appointments(shop_id, id) ON DELETE RESTRICT,
    
    CHECK (project_id IS NOT NULL OR booking_request_id IS NOT NULL OR appointment_id IS NOT NULL),
    CHECK (provider_reference IS NULL OR provider IS NOT NULL)
);

CREATE UNIQUE INDEX payments_provider_reference_idx ON public.payments (provider, provider_reference) WHERE provider_reference IS NOT NULL;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM authenticated, anon, public;
