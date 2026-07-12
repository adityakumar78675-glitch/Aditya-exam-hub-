
CREATE POLICY "Read community attachments" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='community-attachments');
CREATE POLICY "Upload own community attachments" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='community-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Delete own community attachments" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='community-attachments' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));
