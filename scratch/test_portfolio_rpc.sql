BEGIN;

DO $$
DECLARE
    v_shop_id uuid;
    v_artist_id uuid;
    v_style_id uuid;
    v_pub_id uuid;
    v_unpub_id uuid;
    v_count integer;
BEGIN
    SELECT id INTO v_shop_id FROM public.shops WHERE slug = '157-tattoo' LIMIT 1;
    SELECT user_id INTO v_artist_id FROM public.shop_members WHERE shop_id = v_shop_id AND status = 'active' LIMIT 1;
    SELECT id INTO v_style_id FROM public.tattoo_styles WHERE shop_id = v_shop_id LIMIT 1;

    -- A. Insert one unpublished item
    INSERT INTO public.portfolio_items (shop_id, artist_id, title, style_id, image_path, is_published, sort_order)
    VALUES (v_shop_id, v_artist_id, 'UNPUBLISHED_TEST_ITEM', v_style_id, 'test/unpub.webp', false, 1)
    RETURNING id INTO v_unpub_id;

    -- B. Insert one published item
    INSERT INTO public.portfolio_items (shop_id, artist_id, title, style_id, image_path, is_published, sort_order)
    VALUES (v_shop_id, v_artist_id, 'PUBLISHED_TEST_ITEM', v_style_id, 'test/pub.webp', true, 0)
    RETURNING id INTO v_pub_id;

    -- Query the RPC get_public_portfolio_items
    SELECT COUNT(*) INTO v_count 
    FROM public.get_public_portfolio_items('157-tattoo')
    WHERE title = 'PUBLISHED_TEST_ITEM';
    
    IF v_count = 1 THEN
        RAISE NOTICE 'TEST A (Published Visible): PASS';
    ELSE
        RAISE EXCEPTION 'TEST A (Published Visible): FAIL';
    END IF;

    SELECT COUNT(*) INTO v_count 
    FROM public.get_public_portfolio_items('157-tattoo')
    WHERE title = 'UNPUBLISHED_TEST_ITEM';
    
    IF v_count = 0 THEN
        RAISE NOTICE 'TEST B (Unpublished Hidden): PASS';
    ELSE
        RAISE EXCEPTION 'TEST B (Unpublished Hidden): FAIL';
    END IF;
END $$;

ROLLBACK;
