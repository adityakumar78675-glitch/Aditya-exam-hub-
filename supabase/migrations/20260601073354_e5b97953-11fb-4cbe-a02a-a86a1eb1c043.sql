-- Tighten lectures SELECT: only admin, free lectures, free batches, or enrolled students
DROP POLICY IF EXISTS "Auth views lectures" ON public.lectures;

CREATE POLICY "View lectures by access"
ON public.lectures
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR is_free = true
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = auth.uid() AND e.batch_id = lectures.batch_id
  )
  OR EXISTS (
    SELECT 1 FROM public.batches b
    WHERE b.id = lectures.batch_id
      AND COALESCE(b.discount_price, b.price, 0) = 0
  )
);

-- Tighten materials SELECT: must have access to the parent lecture's batch
DROP POLICY IF EXISTS "Auth views materials" ON public.materials;

CREATE POLICY "View materials by access"
ON public.materials
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.lectures l
    LEFT JOIN public.batches b ON b.id = l.batch_id
    LEFT JOIN public.enrollments e ON e.batch_id = l.batch_id AND e.student_id = auth.uid()
    WHERE l.id = materials.lecture_id
      AND (
        l.is_free = true
        OR e.id IS NOT NULL
        OR COALESCE(b.discount_price, b.price, 0) = 0
      )
  )
);