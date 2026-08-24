CREATE TABLE public.customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
    full_name text NOT NULL,
    phone_normalized text NOT NULL CHECK (btrim(phone_normalized) <> ''),
    line_id text,
    email text,
    source text NOT NULL CHECK (source IN ('online', 'walk_in', 'staff_created')),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (shop_id, phone_normalized),
    UNIQUE (shop_id, id)
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.customers FROM authenticated, anon, public;

CREATE TABLE public.tattoo_projects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    name text NOT NULL,
    description text,
    tattoo_style text,
    body_placement text,
    width_cm numeric CHECK (width_cm > 0),
    height_cm numeric CHECK (height_cm > 0),
    size_note text,
    agreed_price numeric CHECK (agreed_price >= 0),
    status text NOT NULL CHECK (status IN ('proposed', 'active', 'completed', 'cancelled')),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (shop_id, customer_id) REFERENCES public.customers(shop_id, id) ON DELETE RESTRICT,
    UNIQUE (shop_id, id)
);
ALTER TABLE public.tattoo_projects ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.tattoo_projects FROM authenticated, anon, public;

CREATE TABLE public.tattoo_project_references (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL,
    project_id uuid NOT NULL,
    storage_path text NOT NULL,
    file_name text NOT NULL,
    mime_type text NOT NULL,
    file_size_bytes bigint,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (shop_id, project_id) REFERENCES public.tattoo_projects(shop_id, id) ON DELETE RESTRICT
);
ALTER TABLE public.tattoo_project_references ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.tattoo_project_references FROM authenticated, anon, public;
