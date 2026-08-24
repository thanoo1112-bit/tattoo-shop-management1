-- Revoke default public execution
REVOKE EXECUTE ON FUNCTION public.get_public_artist_color_options(text, uuid) FROM PUBLIC;

-- Explicitly grant execution to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_public_artist_color_options(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_artist_color_options(text, uuid) TO authenticated;
