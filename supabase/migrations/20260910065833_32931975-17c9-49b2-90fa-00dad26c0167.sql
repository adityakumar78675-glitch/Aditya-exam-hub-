REVOKE SELECT ON public.live_classes FROM authenticated;
REVOKE SELECT ON public.live_classes FROM anon;
GRANT SELECT (id, batch_id, title, teacher, subject, thumbnail_url, status, scheduled_at, started_at, ended_at, created_at, updated_at) ON public.live_classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_classes TO service_role;