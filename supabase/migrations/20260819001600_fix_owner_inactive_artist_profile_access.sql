-- Migration: Fix owner inactive artist profile access
-- Description: Updates the profiles SELECT policy so shop members (especially owners) can view profiles of inactive shop members.

DROP POLICY IF EXISTS "Users can view members of their shops" ON public.profiles;

CREATE POLICY "Users can view members of their shops"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.shop_members sm1
      JOIN public.shop_members sm2 ON sm1.shop_id = sm2.shop_id
      WHERE sm1.user_id = auth.uid() 
        AND sm2.user_id = public.profiles.id 
        AND sm1.status = 'active'
        AND (
            (sm1.role = 'owner') OR 
            (sm2.status = 'active')
        )
    )
  );
