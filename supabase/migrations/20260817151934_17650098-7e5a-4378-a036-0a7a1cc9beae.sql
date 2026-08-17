ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS allow_show_answer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS practice_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.test_attempts
  ADD COLUMN IF NOT EXISTS checked jsonb NOT NULL DEFAULT '{}'::jsonb;