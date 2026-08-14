ALTER TABLE public.test_questions
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS youtube_video_id text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS youtube_title text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_by uuid;

DROP POLICY IF EXISTS "Read community members" ON public.community_members;
CREATE POLICY "Members and admins read community members"
ON public.community_members
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR student_id = auth.uid()
  OR public.is_community_member(community_id, auth.uid())
);