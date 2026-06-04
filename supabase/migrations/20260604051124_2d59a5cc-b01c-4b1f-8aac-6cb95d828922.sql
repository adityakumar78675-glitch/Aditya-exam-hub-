
-- SUBJECTS
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.batches(id) ON DELETE CASCADE,
  name text NOT NULL,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View subjects by access" ON public.subjects FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = subjects.batch_id)
  OR EXISTS (SELECT 1 FROM batches b WHERE b.id = subjects.batch_id AND COALESCE(b.discount_price, b.price, 0) = 0)
);
CREATE POLICY "Admins insert subjects" ON public.subjects FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update subjects" ON public.subjects FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete subjects" ON public.subjects FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER subjects_set_updated_at BEFORE UPDATE ON public.subjects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CHAPTERS
CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View chapters by access" ON public.chapters FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM subjects s
    LEFT JOIN enrollments e ON e.batch_id = s.batch_id AND e.student_id = auth.uid()
    LEFT JOIN batches b ON b.id = s.batch_id
    WHERE s.id = chapters.subject_id
      AND (e.id IS NOT NULL OR COALESCE(b.discount_price, b.price, 0) = 0)
  )
);
CREATE POLICY "Admins insert chapters" ON public.chapters FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update chapters" ON public.chapters FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete chapters" ON public.chapters FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER chapters_set_updated_at BEFORE UPDATE ON public.chapters
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- LECTURES: add chapter/subject linkage (nullable for backward compat)
ALTER TABLE public.lectures
  ADD COLUMN chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  ADD COLUMN subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL;

CREATE INDEX idx_lectures_chapter ON public.lectures(chapter_id);
CREATE INDEX idx_lectures_subject ON public.lectures(subject_id);
CREATE INDEX idx_chapters_subject ON public.chapters(subject_id);
CREATE INDEX idx_subjects_batch ON public.subjects(batch_id);
