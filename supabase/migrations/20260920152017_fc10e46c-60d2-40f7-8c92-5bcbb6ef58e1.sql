CREATE TABLE public.movies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  poster_url text,
  poster_path text,
  video_url text,
  video_path text,
  release_year integer,
  genres text[] NOT NULL DEFAULT '{}',
  language text,
  duration_minutes integer,
  content_rating text,
  trailer_url text,
  featured boolean NOT NULL DEFAULT false,
  trending boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  file_size bigint,
  file_type text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.movies TO authenticated;
GRANT ALL ON public.movies TO service_role;
ALTER TABLE public.movies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View published movies" ON public.movies FOR SELECT TO authenticated
USING (published OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert movies" ON public.movies FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update movies" ON public.movies FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete movies" ON public.movies FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER movies_set_updated_at BEFORE UPDATE ON public.movies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX movies_published_idx ON public.movies (published, created_at DESC);
CREATE INDEX movies_title_idx ON public.movies (lower(title));

CREATE TABLE public.movie_genres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movie_genres TO authenticated;
GRANT ALL ON public.movie_genres TO service_role;
ALTER TABLE public.movie_genres ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in reads genres" ON public.movie_genres FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage genres" ON public.movie_genres FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.movie_genres (name, sort_order) VALUES
('Action',1),('Adventure',2),('Animation',3),('Biography',4),('Comedy',5),
('Documentary',6),('Drama',7),('Educational',8),('Family',9),('Fantasy',10),
('History',11),('Horror',12),('Motivational',13),('Mystery',14),('Romance',15),
('Sci-Fi',16),('Sports',17),('Thriller',18);

CREATE TABLE public.movie_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id uuid NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, movie_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movie_watchlist TO authenticated;
GRANT ALL ON public.movie_watchlist TO service_role;
ALTER TABLE public.movie_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own watchlist" ON public.movie_watchlist FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.movie_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  movie_id uuid NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  playback_position integer NOT NULL DEFAULT 0,
  duration_seconds integer,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, movie_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.movie_progress TO authenticated;
GRANT ALL ON public.movie_progress TO service_role;
ALTER TABLE public.movie_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own movie progress" ON public.movie_progress FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER movie_progress_set_updated_at BEFORE UPDATE ON public.movie_progress
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies
CREATE POLICY "Admins upload movie posters" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'movie-posters' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update movie posters" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'movie-posters' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'movie-posters' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete movie posters" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'movie-posters' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "View movie posters" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'movie-posters');

CREATE POLICY "Admins upload movie videos" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'movie-videos' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update movie videos" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'movie-videos' AND public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'movie-videos' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete movie videos" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'movie-videos' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Stream published movie videos" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'movie-videos'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.movies m WHERE m.published AND m.video_path = storage.objects.name)
  )
);