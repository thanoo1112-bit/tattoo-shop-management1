-- Migration: Public Tattoo Portfolio Foundation
-- Description: Creates the public.portfolio_items table, sets up RLS policies for shop owners,
-- adds relationship validations (artist and style same-shop checks), adds a public RPC for fetching
-- published items, and creates a public storage bucket with policies.

-- 1. Create portfolio_items table
CREATE TABLE IF NOT EXISTS public.portfolio_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    artist_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    title text NOT NULL,
    style_id uuid REFERENCES public.tattoo_styles(id) ON DELETE SET NULL,
    image_path text NOT NULL,
    concept text,
    placement text,
    size_dimensions text,
    is_published boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    
    CONSTRAINT check_title_not_empty CHECK (trim(title) <> ''),
    CONSTRAINT check_image_path_not_empty CHECK (trim(image_path) <> ''),
    CONSTRAINT check_sort_order_non_negative CHECK (sort_order >= 0)
);

-- 2. Create trigger for updated_at column
CREATE TRIGGER update_portfolio_items_updated_at
    BEFORE UPDATE ON public.portfolio_items
    FOR EACH ROW
    EXECUTE FUNCTION private.update_updated_at_column();

-- 3. Create relationship validation function and trigger to enforce same-shop integrity
CREATE OR REPLACE FUNCTION private.validate_portfolio_item_relations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Validate Artist belongs to the same shop as the portfolio item
    IF NEW.artist_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = NEW.shop_id
              AND shop_members.user_id = NEW.artist_id
              AND shop_members.status = 'active'
        ) THEN
            RAISE EXCEPTION 'Artist must be an active member of the same shop';
        END IF;
    END IF;

    -- Validate Style belongs to the same shop as the portfolio item
    IF NEW.style_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.tattoo_styles
            WHERE tattoo_styles.shop_id = NEW.shop_id
              AND tattoo_styles.id = NEW.style_id
        ) THEN
            RAISE EXCEPTION 'Style must belong to the same shop';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Revoke execute on validation helper from public
REVOKE ALL ON FUNCTION private.validate_portfolio_item_relations() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER check_portfolio_item_relations
    BEFORE INSERT OR UPDATE ON public.portfolio_items
    FOR EACH ROW
    EXECUTE FUNCTION private.validate_portfolio_item_relations();

-- 4. Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS portfolio_items_shop_idx ON public.portfolio_items(shop_id);
CREATE INDEX IF NOT EXISTS portfolio_items_artist_idx ON public.portfolio_items(artist_id);
CREATE INDEX IF NOT EXISTS portfolio_items_style_idx ON public.portfolio_items(style_id);
CREATE INDEX IF NOT EXISTS portfolio_items_shop_published_sort_idx ON public.portfolio_items(shop_id, is_published, sort_order);

-- 5. Enable RLS and setup Owner Policies
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select own shop portfolio items" ON public.portfolio_items
    FOR SELECT
    USING (private.is_shop_owner(shop_id));

CREATE POLICY "Owner insert own shop portfolio items" ON public.portfolio_items
    FOR INSERT
    WITH CHECK (private.is_shop_owner(shop_id));

CREATE POLICY "Owner update own shop portfolio items" ON public.portfolio_items
    FOR UPDATE
    USING (private.is_shop_owner(shop_id))
    WITH CHECK (private.is_shop_owner(shop_id));

CREATE POLICY "Owner delete own shop portfolio items" ON public.portfolio_items
    FOR DELETE
    USING (private.is_shop_owner(shop_id));

-- 6. Create narrow public portfolio fetch RPC
CREATE OR REPLACE FUNCTION public.get_public_portfolio_items(
    p_shop_slug text
) RETURNS TABLE (
    id uuid,
    title text,
    image_path text,
    style_name text,
    artist_name text,
    concept text,
    placement text,
    size_dimensions text,
    sort_order integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_shop_id uuid;
BEGIN
    -- Find shop ID by slug
    SELECT s.id INTO v_shop_id 
    FROM public.shops s
    WHERE s.slug = p_shop_slug;

    IF v_shop_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        pi.id,
        pi.title,
        pi.image_path,
        ts.name AS style_name,
        p.full_name AS artist_name,
        pi.concept,
        pi.placement,
        pi.size_dimensions,
        pi.sort_order
    FROM public.portfolio_items pi
    LEFT JOIN public.tattoo_styles ts ON pi.style_id = ts.id
    LEFT JOIN public.profiles p ON pi.artist_id = p.id
    WHERE pi.shop_id = v_shop_id
      AND pi.is_published = true
    ORDER BY pi.sort_order ASC, pi.created_at DESC;
END;
$$;

-- Revoke all permissions from PUBLIC, anon, and authenticated for the RPC
REVOKE ALL ON FUNCTION public.get_public_portfolio_items(text) FROM PUBLIC, anon, authenticated;
-- Grant execute permissions to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_public_portfolio_items(text) TO anon, authenticated;

-- 7. Setup public storage bucket for portfolio images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-images',
  'portfolio-images',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
) ON CONFLICT (id) DO NOTHING;

-- 8. Define storage RLS policies
CREATE POLICY "Public Read Portfolio Images" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'portfolio-images');

CREATE POLICY "Owner Upload Portfolio Images" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'portfolio-images'
        AND (EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = (pg_catalog.string_to_array(name, '/'))[1]::uuid
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        ))
    );

CREATE POLICY "Owner Update Portfolio Images" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'portfolio-images'
        AND (EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = (pg_catalog.string_to_array(name, '/'))[1]::uuid
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        ))
    )
    WITH CHECK (
        bucket_id = 'portfolio-images'
        AND (EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = (pg_catalog.string_to_array(name, '/'))[1]::uuid
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        ))
    );

CREATE POLICY "Owner Delete Portfolio Images" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'portfolio-images'
        AND (EXISTS (
            SELECT 1 FROM public.shop_members
            WHERE shop_members.shop_id = (pg_catalog.string_to_array(name, '/'))[1]::uuid
              AND shop_members.user_id = auth.uid()
              AND shop_members.role = 'owner'
              AND shop_members.status = 'active'
        ))
    );
