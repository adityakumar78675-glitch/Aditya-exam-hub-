GRANT EXECUTE ON FUNCTION public.is_blocked(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_community_blocked(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_live_stream_url(uuid) TO authenticated, anon;