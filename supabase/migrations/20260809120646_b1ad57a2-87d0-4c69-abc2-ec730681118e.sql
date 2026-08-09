CREATE TYPE public.question_type AS ENUM ('mcq','numerical','truefalse','subjective');

CREATE TABLE public.tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid REFERENCES public.batches(id) ON DELETE CASCADE,
  title text NOT NULL,
  subject text,
  instructions text,
  duration_minutes integer NOT NULL DEFAULT 60,
  positive_marks numeric NOT NULL DEFAULT 4,
  negative_marks numeric NOT NULL DEFAULT 1,
  languages text[] NOT NULL DEFAULT ARRAY['en']::text[],
  randomize_questions boolean NOT NULL DEFAULT false,
  randomize_options boolean NOT NULL DEFAULT false,
  show_solutions boolean NOT NULL DEFAULT true,
  leaderboard_enabled boolean NOT NULL DEFAULT false,
  start_at timestamptz,
  end_at timestamptz,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tests TO authenticated;
GRANT ALL ON public.tests TO service_role;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage tests" ON public.tests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Students view published tests" ON public.tests FOR SELECT TO authenticated
  USING (is_published AND (batch_id IS NULL OR EXISTS (
    SELECT 1 FROM public.enrollments e WHERE e.batch_id = tests.batch_id AND e.student_id = auth.uid()
  )));
CREATE TRIGGER tests_set_updated_at BEFORE UPDATE ON public.tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.test_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  type public.question_type NOT NULL DEFAULT 'mcq',
  question_en text NOT NULL,
  question_hi text,
  image_url text,
  options_en jsonb NOT NULL DEFAULT '[]'::jsonb,
  options_hi jsonb NOT NULL DEFAULT '[]'::jsonb,
  correct_option integer,
  correct_numeric numeric,
  correct_bool boolean,
  solution_en text,
  solution_hi text,
  positive_marks numeric,
  negative_marks numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Students never read this table directly (answers live here); access is via server functions only.
GRANT ALL ON public.test_questions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_questions TO authenticated;
ALTER TABLE public.test_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage test questions" ON public.test_questions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER test_questions_set_updated_at BEFORE UPDATE ON public.test_questions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX test_questions_test_idx ON public.test_questions(test_id, order_index);

CREATE TABLE public.test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  question_order uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  marked jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  submitted_at timestamptz,
  score numeric,
  total_marks numeric,
  correct_count integer,
  incorrect_count integer,
  unattempted_count integer,
  time_taken_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, student_id)
);

GRANT SELECT ON public.test_attempts TO authenticated;
GRANT ALL ON public.test_attempts TO service_role;
ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students view own attempts" ON public.test_attempts FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER test_attempts_set_updated_at BEFORE UPDATE ON public.test_attempts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();