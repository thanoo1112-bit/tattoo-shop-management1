CREATE TABLE public.artist_availability_slots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
    artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,
    status text NOT NULL CHECK (status IN ('open', 'held', 'booked', 'blocked', 'cancelled')),
    held_until timestamptz,
    held_by_booking_request_id uuid,
    created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (start_at < end_at),
    CHECK (status != 'held' OR (held_until IS NOT NULL AND held_by_booking_request_id IS NOT NULL)),
    UNIQUE (shop_id, id)
);

ALTER TABLE public.artist_availability_slots 
ADD CONSTRAINT artist_availability_slots_overlap_exclude 
EXCLUDE USING gist (
    artist_id WITH =, 
    tstzrange(start_at, end_at, '[)') WITH &&
) WHERE (status IN ('open', 'held', 'booked', 'blocked'));

ALTER TABLE public.artist_availability_slots ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.artist_availability_slots FROM authenticated, anon, public;
