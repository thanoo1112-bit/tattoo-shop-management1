-- Migration: Fix Promotion tstzrange Overlap Verification
-- Corrects tsrange constructor usage to tstzrange to match the timestamptz datatype on starts_at and ends_at columns.

CREATE OR REPLACE FUNCTION public.trg_promotions_overlap_check()
RETURNS trigger AS $$
BEGIN
    IF NEW.is_active = true THEN
        IF EXISTS (
            SELECT 1 FROM public.promotions
            WHERE id != NEW.id
              AND shop_id = NEW.shop_id
              AND is_active = true
              AND tstzrange(starts_at, ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
              AND (
                  applies_to = NEW.applies_to
                  OR NEW.applies_to = 'all'
                  OR applies_to = 'all'
              )
        ) THEN
            RAISE EXCEPTION 'Overlapping active promotions are not allowed for the same scope.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
