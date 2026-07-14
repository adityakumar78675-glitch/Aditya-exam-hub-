
ALTER TABLE public.extra_notes
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size BIGINT,
  ADD COLUMN IF NOT EXISTS file_type TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Storage bucket policies for 'extra-notes'
DROP POLICY IF EXISTS "Admins upload extra-notes" ON storage.objects;
DROP POLICY IF EXISTS "Admins update extra-notes" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete extra-notes" ON storage.objects;
DROP POLICY IF EXISTS "View extra-notes by access" ON storage.objects;

CREATE POLICY "Admins upload extra-notes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'extra-notes' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update extra-notes"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'extra-notes' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'extra-notes' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete extra-notes"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'extra-notes' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "View extra-notes by access"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'extra-notes'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.extra_notes n
      WHERE n.storage_path = storage.objects.name
        AND NOT public.is_blocked(auth.uid())
        AND (
          EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = n.batch_id)
          OR EXISTS (SELECT 1 FROM public.batches b WHERE b.id = n.batch_id AND COALESCE(b.discount_price, b.price, 0) = 0)
        )
    )
  )
);
