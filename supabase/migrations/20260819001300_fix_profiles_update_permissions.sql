-- Fix UPDATE permission for public.profiles to allow updating updated_at

GRANT UPDATE (updated_at) ON public.profiles TO authenticated;
