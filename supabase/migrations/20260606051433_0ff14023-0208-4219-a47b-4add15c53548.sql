
REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_community_blocked(uuid) FROM PUBLIC, anon, authenticated;
