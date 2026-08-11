ALTER TABLE public.test_attempts DROP CONSTRAINT IF EXISTS test_attempts_test_id_student_id_key;

ALTER TABLE public.test_attempts
  ADD COLUMN IF NOT EXISTS attempt_number integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS test_attempts_test_student_number_key
  ON public.test_attempts (test_id, student_id, attempt_number);

CREATE INDEX IF NOT EXISTS test_attempts_test_student_idx
  ON public.test_attempts (test_id, student_id);

ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS allow_reattempts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_attempts integer,
  ADD COLUMN IF NOT EXISTS ranking_mode text NOT NULL DEFAULT 'best';

ALTER TABLE public.tests DROP CONSTRAINT IF EXISTS tests_ranking_mode_check;
ALTER TABLE public.tests ADD CONSTRAINT tests_ranking_mode_check
  CHECK (ranking_mode IN ('best','latest','average'));