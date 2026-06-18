
-- 1) Enrollments: only allow self-enrolling into free batches
DROP POLICY IF EXISTS "Students enroll themselves" ON public.enrollments;
CREATE POLICY "Students enroll free batches"
ON public.enrollments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = student_id
  AND EXISTS (
    SELECT 1 FROM public.batches b
    WHERE b.id = batch_id
      AND COALESCE(b.discount_price, b.price, 0) = 0
  )
);

-- 2) user_roles: admin-only INSERT and DELETE
CREATE POLICY "Admins insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3) live_classes.stream_url: column-level access control
REVOKE SELECT ON public.live_classes FROM authenticated;
GRANT SELECT
  (id, batch_id, title, teacher, subject, thumbnail_url,
   status, scheduled_at, started_at, ended_at, created_at, updated_at)
ON public.live_classes TO authenticated;

CREATE OR REPLACE FUNCTION public.get_live_stream_url(_class_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lc.stream_url
  FROM public.live_classes lc
  LEFT JOIN public.enrollments e
    ON e.batch_id = lc.batch_id AND e.student_id = auth.uid()
  LEFT JOIN public.batches b
    ON b.id = lc.batch_id
  WHERE lc.id = _class_id
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (
        lc.status = 'live'
        AND (
          e.id IS NOT NULL
          OR COALESCE(b.discount_price, b.price, 0) = 0
        )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.get_live_stream_url(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_stream_url(uuid) TO authenticated;
