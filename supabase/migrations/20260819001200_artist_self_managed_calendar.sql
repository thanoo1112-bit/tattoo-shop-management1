-- Migration: Artist Self-Managed Calendar permissions
-- Enable RLS and add policies for artist_booking_settings and artist_daily_overrides

-- Grant access to authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_booking_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artist_daily_overrides TO authenticated;

-- Policies for artist_booking_settings
CREATE POLICY "owner_select_artist_booking_settings" 
ON public.artist_booking_settings FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_booking_settings.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role = 'owner'
    )
);

CREATE POLICY "artist_select_own_booking_settings" 
ON public.artist_booking_settings FOR SELECT 
TO authenticated 
USING (
    artist_id = auth.uid()
);

CREATE POLICY "artist_manage_own_booking_settings" 
ON public.artist_booking_settings FOR ALL 
TO authenticated 
USING (
    artist_id = auth.uid() 
    AND EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_booking_settings.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role = 'artist'
        AND sm.status = 'active'
    )
)
WITH CHECK (
    artist_id = auth.uid() 
    AND EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_booking_settings.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role = 'artist'
        AND sm.status = 'active'
    )
);

-- Policies for artist_daily_overrides
CREATE POLICY "owner_select_artist_daily_overrides" 
ON public.artist_daily_overrides FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_daily_overrides.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role = 'owner'
    )
);

CREATE POLICY "artist_select_own_daily_overrides" 
ON public.artist_daily_overrides FOR SELECT 
TO authenticated 
USING (
    artist_id = auth.uid()
);

CREATE POLICY "artist_manage_own_daily_overrides" 
ON public.artist_daily_overrides FOR ALL 
TO authenticated 
USING (
    artist_id = auth.uid() 
    AND EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_daily_overrides.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role = 'artist'
        AND sm.status = 'active'
    )
)
WITH CHECK (
    artist_id = auth.uid() 
    AND created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.shop_members sm 
        WHERE sm.shop_id = artist_daily_overrides.shop_id 
        AND sm.user_id = auth.uid() 
        AND sm.role = 'artist'
        AND sm.status = 'active'
    )
);
