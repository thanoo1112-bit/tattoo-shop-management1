-- Create security definer helper function to check active shop membership status
CREATE OR REPLACE FUNCTION public.is_active_shop_member(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.shop_members
        WHERE user_id = p_user_id AND status = 'active'
    );
END;
$$;

-- Grant SELECT access on non-sensitive columns of profiles table to anon
GRANT SELECT (id, full_name, avatar_url) ON public.profiles TO anon;

-- Create RLS SELECT policy on profiles table for anonymous/public users to see active artist profiles
DROP POLICY IF EXISTS "Public profiles are visible for active shop members" ON public.profiles;
CREATE POLICY "Public profiles are visible for active shop members"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (
    public.is_active_shop_member(id)
  );
