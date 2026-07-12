
-- 1. Communities table
CREATE TABLE public.communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  icon text,
  batch_id uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  rules text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read communities" ON public.communities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert communities" ON public.communities FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update communities" ON public.communities FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete communities" ON public.communities FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER communities_updated BEFORE UPDATE ON public.communities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. Community members
CREATE TABLE public.community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'student',
  status text NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members TO authenticated;
GRANT ALL ON public.community_members TO service_role;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_join_community(_cid uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.has_role(_uid,'admin') OR EXISTS(
    SELECT 1 FROM public.communities c
    WHERE c.id=_cid AND c.is_active
      AND (c.batch_id IS NULL OR EXISTS(
        SELECT 1 FROM public.enrollments e WHERE e.batch_id=c.batch_id AND e.student_id=_uid
      ))
  )
$$;

CREATE OR REPLACE FUNCTION public.is_community_member(_cid uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.community_members WHERE community_id=_cid AND student_id=_uid AND status='active')
$$;

CREATE OR REPLACE FUNCTION public.is_community_banned(_cid uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.community_members WHERE community_id=_cid AND student_id=_uid AND status IN ('banned','muted'))
$$;

CREATE POLICY "Read community members" ON public.community_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users join allowed communities" ON public.community_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid()=student_id AND public.can_join_community(community_id, auth.uid()) AND NOT public.is_community_banned(community_id, auth.uid()));
CREATE POLICY "Admins manage members" ON public.community_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users leave own membership" ON public.community_members FOR DELETE TO authenticated USING (auth.uid()=student_id);

-- 3. Extend community_messages
ALTER TABLE public.community_messages
  ADD COLUMN community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  ADD COLUMN attachment_url text,
  ADD COLUMN attachment_type text,
  ADD COLUMN attachment_name text,
  ADD COLUMN reply_to_id uuid REFERENCES public.community_messages(id) ON DELETE SET NULL,
  ADD COLUMN pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN edited_at timestamptz,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Seed default community and backfill
INSERT INTO public.communities (name, description, icon) VALUES ('General Discussion','App-wide chat','🎯');
UPDATE public.community_messages SET community_id=(SELECT id FROM public.communities ORDER BY created_at LIMIT 1) WHERE community_id IS NULL;
ALTER TABLE public.community_messages ALTER COLUMN community_id SET NOT NULL;

CREATE INDEX idx_cmsg_community ON public.community_messages(community_id, created_at DESC);
CREATE TRIGGER community_messages_updated BEFORE UPDATE ON public.community_messages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reset policies
DROP POLICY IF EXISTS "Anyone authenticated reads messages" ON public.community_messages;
DROP POLICY IF EXISTS "Users send their own messages" ON public.community_messages;
DROP POLICY IF EXISTS "Admins delete messages" ON public.community_messages;

CREATE POLICY "Members read messages" ON public.community_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.is_community_member(community_id, auth.uid()));

CREATE POLICY "Members send messages" ON public.community_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid()=student_id
    AND NOT public.is_blocked(auth.uid())
    AND NOT public.is_community_blocked(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR (public.is_community_member(community_id, auth.uid()) AND NOT public.is_community_banned(community_id, auth.uid())))
    AND length(message) <= 4000
  );

CREATE POLICY "Users update own messages" ON public.community_messages FOR UPDATE TO authenticated
  USING (auth.uid()=student_id) WITH CHECK (auth.uid()=student_id);

CREATE POLICY "Admins update messages" ON public.community_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Users delete own messages" ON public.community_messages FOR DELETE TO authenticated
  USING (auth.uid()=student_id);
CREATE POLICY "Admins delete messages" ON public.community_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.communities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_members;
