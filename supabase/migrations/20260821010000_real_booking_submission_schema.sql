-- Migration: Real Public Booking Submission Schema Updates
-- Adds columns needed to support the final real submission flow safely.

-- 1. tattoo_projects additions
ALTER TABLE public.tattoo_projects
ADD COLUMN style_id uuid REFERENCES public.tattoo_styles(id) ON DELETE SET NULL,
ADD COLUMN color_mode text CHECK (color_mode IS NULL OR color_mode IN ('black_grey', 'color')),
ADD COLUMN work_type text CHECK (work_type IS NULL OR work_type IN ('new_work', 'extension', 'touch_up', 'cover_up', 'scar_cover'));

-- 2. tattoo_project_references additions
ALTER TABLE public.tattoo_project_references
ADD COLUMN reference_type text CHECK (reference_type IS NULL OR reference_type IN ('real_area', 'design_reference'));

-- 3. booking_requests additions
ALTER TABLE public.booking_requests
ADD COLUMN health_note text,
ADD COLUMN terms_accepted_at timestamptz,
ADD COLUMN terms_version text;
