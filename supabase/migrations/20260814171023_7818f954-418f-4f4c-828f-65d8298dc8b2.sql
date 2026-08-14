CREATE POLICY "note covers readable by authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'note-covers');

CREATE POLICY "admins manage note covers insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'note-covers' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage note covers update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'note-covers' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage note covers delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'note-covers' AND public.has_role(auth.uid(), 'admin'));