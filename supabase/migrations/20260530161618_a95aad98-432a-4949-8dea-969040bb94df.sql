
ALTER TABLE public.lectures ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.lecture_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  lecture_id uuid NOT NULL REFERENCES public.lectures(id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0,
  watch_percent integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, lecture_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lecture_progress TO authenticated;
GRANT ALL ON public.lecture_progress TO service_role;

ALTER TABLE public.lecture_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own progress" ON public.lecture_progress
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Students insert own progress" ON public.lecture_progress
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students update own progress" ON public.lecture_progress
  FOR UPDATE TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Admins delete progress" ON public.lecture_progress
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
