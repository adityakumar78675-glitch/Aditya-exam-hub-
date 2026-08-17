ALTER TABLE public.lectures
  ADD COLUMN IF NOT EXISTS video_storage_path text,
  ADD COLUMN IF NOT EXISTS thumbnail_storage_path text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS teacher text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

UPDATE public.lectures SET status = 'published' WHERE status IS NULL;

ALTER TABLE public.lectures DROP CONSTRAINT IF EXISTS lectures_status_check;
ALTER TABLE public.lectures ADD CONSTRAINT lectures_status_check
  CHECK (status IN ('draft','uploading','processing','published'));

DROP POLICY IF EXISTS "Guests view free lectures" ON public.lectures;
CREATE POLICY "Guests view free lectures" ON public.lectures
FOR SELECT USING (is_free = true AND status = 'published');

DROP POLICY IF EXISTS "View lectures by access" ON public.lectures;
CREATE POLICY "View lectures by access" ON public.lectures
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    status = 'published'
    AND NOT is_blocked(auth.uid())
    AND (
      is_free = true
      OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = lectures.batch_id)
      OR EXISTS (SELECT 1 FROM batches b WHERE b.id = lectures.batch_id AND COALESCE(b.discount_price, b.price, 0) = 0)
    )
  )
);

CREATE POLICY "Admins upload lecture videos" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'lecture-videos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update lecture videos" ON storage.objects
FOR UPDATE USING (bucket_id = 'lecture-videos' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'lecture-videos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete lecture videos" ON storage.objects
FOR DELETE USING (bucket_id = 'lecture-videos' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Stream lecture videos by access" ON storage.objects
FOR SELECT USING (
  bucket_id = 'lecture-videos'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.lectures l
      LEFT JOIN public.batches b ON b.id = l.batch_id
      WHERE (l.video_storage_path = objects.name OR l.thumbnail_storage_path = objects.name)
        AND l.status = 'published'
        AND NOT is_blocked(auth.uid())
        AND (
          l.is_free = true
          OR COALESCE(b.discount_price, b.price, 0) = 0
          OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.student_id = auth.uid() AND e.batch_id = l.batch_id)
        )
    )
  )
);