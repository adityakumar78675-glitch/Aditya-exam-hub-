GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lectures TO authenticated;
GRANT ALL ON public.lectures TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials TO authenticated;
GRANT ALL ON public.materials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enrollments TO authenticated;
GRANT ALL ON public.enrollments TO service_role;

DROP POLICY IF EXISTS "Students update own enrollments" ON public.enrollments;
CREATE POLICY "Students update own enrollments"
ON public.enrollments
FOR UPDATE
TO authenticated
USING ((auth.uid() = student_id) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1
      FROM public.batches b
      WHERE b.id = enrollments.batch_id
        AND COALESCE(b.discount_price, b.price, 0) = 0
    )
  )
);

DROP POLICY IF EXISTS "Admins update batches" ON public.batches;
CREATE POLICY "Admins update batches"
ON public.batches
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage batches update" ON public.batches;
CREATE POLICY "Admins manage batches update"
ON public.batches
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update subjects" ON public.subjects;
CREATE POLICY "Admins update subjects"
ON public.subjects
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update chapters" ON public.chapters;
CREATE POLICY "Admins update chapters"
ON public.chapters
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update lectures" ON public.lectures;
CREATE POLICY "Admins update lectures"
ON public.lectures
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins update materials" ON public.materials;
CREATE POLICY "Admins update materials"
ON public.materials
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

ALTER PUBLICATION supabase_realtime ADD TABLE public.subjects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chapters;