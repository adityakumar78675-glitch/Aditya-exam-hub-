REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_community_blocked(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_live_stream_url(uuid) FROM anon;