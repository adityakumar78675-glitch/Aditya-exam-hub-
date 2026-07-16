
DROP POLICY IF EXISTS "Read community attachments" ON storage.objects;

CREATE POLICY "Read community attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'community-attachments'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.community_messages cm
      WHERE cm.attachment_url LIKE '%' || storage.objects.name
        AND public.is_community_member(cm.community_id, auth.uid())
    )
  )
);
