CREATE TABLE public.booking_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL,
    project_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    availability_slot_id uuid,
    requested_start_at timestamptz NOT NULL,
    requested_end_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('pending_payment', 'pending_review', 'changes_requested', 'approved', 'rejected', 'cancelled', 'expired')),
    public_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    
    submitted_full_name text NOT NULL,
    submitted_email text,
    submitted_line_id text,
    submitted_phone text NOT NULL,
    
    customer_note text,
    staff_note text,
    
    approved_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
    approved_at timestamptz,
    rejected_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
    rejected_at timestamptz,
    cancelled_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    FOREIGN KEY (shop_id, customer_id) REFERENCES public.customers(shop_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (shop_id, project_id) REFERENCES public.tattoo_projects(shop_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (shop_id, availability_slot_id) REFERENCES public.artist_availability_slots(shop_id, id) ON DELETE RESTRICT,
    CHECK (requested_start_at < requested_end_at),
    UNIQUE (shop_id, id)
);

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.booking_requests FROM authenticated, anon, public;

ALTER TABLE public.artist_availability_slots
ADD CONSTRAINT artist_availability_slots_booking_request_fk
FOREIGN KEY (shop_id, held_by_booking_request_id) 
REFERENCES public.booking_requests(shop_id, id) 
ON DELETE RESTRICT;
