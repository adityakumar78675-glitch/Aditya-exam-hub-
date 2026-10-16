DROP POLICY IF EXISTS "Anyone signed in reads genres" ON public.movie_genres;
CREATE POLICY "Signed-in users read genres" ON public.movie_genres FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
REVOKE ALL ON public.movie_genres FROM anon;