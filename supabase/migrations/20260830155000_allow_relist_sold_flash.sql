-- Migration: Add secure function to allow shop owners to relist a sold flash design as a new open design.
CREATE OR REPLACE FUNCTION public.relist_sold_flash_design(
    p_flash_id          uuid,
    p_shop_id           uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_new_flash_id      uuid;
    v_source_fd         record;
    v_var               record;
BEGIN
    -- Authorization check: must be active owner of the target shop
    IF NOT EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE shop_id = p_shop_id
          AND user_id = auth.uid()
          AND role = 'owner'
          AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Access Denied: Only shop owners can relist flash designs';
    END IF;

    -- Fetch original flash design
    SELECT * INTO v_source_fd FROM public.flash_designs
    WHERE id = p_flash_id AND shop_id = p_shop_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Flash design not found';
    END IF;

    IF v_source_fd.status != 'sold' THEN
        RAISE EXCEPTION 'Only sold flash designs can be relisted';
    END IF;

    -- Insert new open flash design copying source attributes
    INSERT INTO public.flash_designs (
        shop_id,
        artist_id,
        style_id,
        style_name,
        image_path,
        size,
        price,
        status
    )
    VALUES (
        v_source_fd.shop_id,
        v_source_fd.artist_id,
        v_source_fd.style_id,
        v_source_fd.style_name,
        v_source_fd.image_path,
        v_source_fd.size,
        v_source_fd.price,
        'open'
    )
    RETURNING id INTO v_new_flash_id;

    -- Duplicate variants from old flash design to new flash design
    FOR v_var IN
        SELECT size_name, min_size_cm, max_size_cm, price, is_enabled, sort_order
        FROM public.flash_design_variants
        WHERE flash_design_id = p_flash_id
    LOOP
        INSERT INTO public.flash_design_variants (
            flash_design_id,
            size_name,
            min_size_cm,
            max_size_cm,
            price,
            is_enabled,
            sort_order
        )
        VALUES (
            v_new_flash_id,
            v_var.size_name,
            v_var.min_size_cm,
            v_var.max_size_cm,
            v_var.price,
            v_var.is_enabled,
            v_var.sort_order
        );
    END LOOP;

    RETURN v_new_flash_id;
END;
$$;

REVOKE ALL ON FUNCTION public.relist_sold_flash_design(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.relist_sold_flash_design(uuid, uuid) TO authenticated;
