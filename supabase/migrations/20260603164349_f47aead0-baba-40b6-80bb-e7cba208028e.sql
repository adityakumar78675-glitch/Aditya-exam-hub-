
CREATE TABLE public.live_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL,
  title text NOT NULL,
  teacher text,
  subject text,
  thumbnail_url text,
  stream_url text,
  status text NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_classes_status_check CHECK (status IN ('scheduled','live','ended'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_classes TO authenticated;
GRANT ALL ON public.live_classes TO service_role;

ALTER TABLE public.live_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View live classes by access" ON public.live_classes
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = live_classes.batch_id)
  OR EXISTS (SELECT 1 FROM batches b WHERE b.id = live_classes.batch_id AND COALESCE(b.discount_price, b.price, 0) = 0)
);

CREATE POLICY "Admins insert live classes" ON public.live_classes
FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update live classes" ON public.live_classes
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete live classes" ON public.live_classes
FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_live_classes_updated_at
BEFORE UPDATE ON public.live_classes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.live_classes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_classes;
