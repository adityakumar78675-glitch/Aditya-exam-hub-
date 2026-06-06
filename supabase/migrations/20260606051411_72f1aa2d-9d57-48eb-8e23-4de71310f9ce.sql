
-- Profiles: community_blocked
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS community_blocked boolean NOT NULL DEFAULT false;

-- Helper to check blocked
CREATE OR REPLACE FUNCTION public.is_blocked(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT blocked FROM public.profiles WHERE id = _uid), false)
$$;

CREATE OR REPLACE FUNCTION public.is_community_blocked(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT community_blocked FROM public.profiles WHERE id = _uid), false)
$$;

-- Extra Notes
CREATE TABLE IF NOT EXISTS public.extra_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  subject_id uuid,
  chapter_id uuid,
  title text NOT NULL,
  category text NOT NULL DEFAULT 'notes',
  pdf_url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.extra_notes TO authenticated;
GRANT ALL ON public.extra_notes TO service_role;
ALTER TABLE public.extra_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View extra notes by access" ON public.extra_notes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (NOT public.is_blocked(auth.uid()) AND (
    EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = extra_notes.batch_id)
    OR EXISTS (SELECT 1 FROM batches b WHERE b.id = extra_notes.batch_id AND COALESCE(b.discount_price, b.price, 0) = 0)
  ))
);
CREATE POLICY "Admins insert extra notes" ON public.extra_notes FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update extra notes" ON public.extra_notes FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete extra notes" ON public.extra_notes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Community Messages
CREATE TABLE IF NOT EXISTS public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  student_name text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_messages TO authenticated;
GRANT ALL ON public.community_messages TO service_role;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated reads messages" ON public.community_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users send their own messages" ON public.community_messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND NOT public.is_community_blocked(auth.uid())
  AND NOT public.is_blocked(auth.uid())
  AND length(message) BETWEEN 1 AND 2000
);
CREATE POLICY "Admins delete messages" ON public.community_messages FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER TABLE public.community_messages REPLICA IDENTITY FULL;

-- Strengthen block: deny blocked users from reading lectures/subjects/chapters/materials/live
DROP POLICY IF EXISTS "View lectures by access" ON public.lectures;
CREATE POLICY "View lectures by access" ON public.lectures FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (NOT public.is_blocked(auth.uid()) AND (
    is_free = true
    OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = lectures.batch_id)
    OR EXISTS (SELECT 1 FROM batches b WHERE b.id = lectures.batch_id AND COALESCE(b.discount_price, b.price, 0) = 0)
  ))
);

DROP POLICY IF EXISTS "View subjects by access" ON public.subjects;
CREATE POLICY "View subjects by access" ON public.subjects FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (NOT public.is_blocked(auth.uid()) AND (
    EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = subjects.batch_id)
    OR EXISTS (SELECT 1 FROM batches b WHERE b.id = subjects.batch_id AND COALESCE(b.discount_price, b.price, 0) = 0)
  ))
);

DROP POLICY IF EXISTS "View chapters by access" ON public.chapters;
CREATE POLICY "View chapters by access" ON public.chapters FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (NOT public.is_blocked(auth.uid()) AND EXISTS (
    SELECT 1 FROM subjects s
    LEFT JOIN enrollments e ON e.batch_id = s.batch_id AND e.student_id = auth.uid()
    LEFT JOIN batches b ON b.id = s.batch_id
    WHERE s.id = chapters.subject_id
      AND (e.id IS NOT NULL OR COALESCE(b.discount_price, b.price, 0) = 0)
  ))
);

DROP POLICY IF EXISTS "View live classes by access" ON public.live_classes;
CREATE POLICY "View live classes by access" ON public.live_classes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (NOT public.is_blocked(auth.uid()) AND (
    EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = live_classes.batch_id)
    OR EXISTS (SELECT 1 FROM batches b WHERE b.id = live_classes.batch_id AND COALESCE(b.discount_price, b.price, 0) = 0)
  ))
);

CREATE TRIGGER set_updated_at_extra_notes BEFORE UPDATE ON public.extra_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
