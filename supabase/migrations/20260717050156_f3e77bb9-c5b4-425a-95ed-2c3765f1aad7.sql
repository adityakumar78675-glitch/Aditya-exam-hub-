
CREATE POLICY "MasterJi: users manage own uploads"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'masterji-uploads' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'masterji-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
