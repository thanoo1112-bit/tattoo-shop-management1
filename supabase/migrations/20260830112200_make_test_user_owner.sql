INSERT INTO public.profiles (id, full_name, email)
VALUES ('ee516464-d912-4e21-8417-a93f230bfeec', 'New Test Owner', 'newowner@157tattoo.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.shop_members (shop_id, user_id, role, status)
SELECT id, 'ee516464-d912-4e21-8417-a93f230bfeec', 'owner', 'active'
FROM public.shops WHERE slug = '157-tattoo'
ON CONFLICT (shop_id, user_id) DO UPDATE SET role = 'owner', status = 'active';
