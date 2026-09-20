import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AuthWall } from "@/components/AuthWall";
import { MoviePoster } from "@/components/MoviePoster";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, Bookmark, BookmarkCheck, Play, Clapperboard } from "lucide-react";
import { formatDuration, getMovieVideoUrl } from "@/lib/movie-upload";

export const Route = createFileRoute("/_authenticated/movies/$movieId")({
  component: MovieDetails,
  head: () => ({
    meta: [
      { title: "Movie | Aditya Exam Hub" },
      { name: "description", content: "Movie details, trailer and streaming on Aditya Exam Hub." },
      { property: "og:title", content: "Movie | Aditya Exam Hub" },
      { property: "og:description", content: "Watch this movie in the Aditya Exam Hub library." },
      { property: "og:type", content: "video.movie" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

type Movie = {
  id: string;
  title: string;
  description: string | null;
  poster_path: string | null;
  poster_url: string | null;
  video_path: string | null;
  release_year: number | null;
  genres: string[];
  language: string | null;
  duration_minutes: number | null;
  content_rating: string | null;
  trailer_url: string | null;
  featured: boolean;
  trending: boolean;
};

const SELECT =
  "id,title,description,poster_path,poster_url,video_path,release_year,genres,language,duration_minutes,content_rating,trailer_url,featured,trending";

function MovieDetails() {
  const { movieId } = useParams({ from: "/_authenticated/movies/$movieId" });
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [watching, setWatching] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const lastSaved = useRef(0);

  const { data: movie, isLoading } = useQuery({
    queryKey: ["movie", movieId],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("movies").select(SELECT).eq("id", movieId).maybeSingle();
      if (error) throw error;
      return data as unknown as Movie | null;
    },
  });

  const { data: related } = useQuery({
    queryKey: ["movies-related", movieId, movie?.genres?.[0]],
    enabled: !!movie,
    queryFn: async () => {
      const q = supabase.from("movies").select(SELECT).eq("published", true).neq("id", movieId).limit(8);
      const { data, error } = movie?.genres?.length ? await q.overlaps("genres", movie.genres) : await q;
      if (error) throw error;
      return data as unknown as Movie[];
    },
  });

  const { data: saved } = useQuery({
    queryKey: ["movie-watchlist", movieId],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("movie_watchlist").select("id").eq("movie_id", movieId).maybeSingle();
      return !!data;
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["movie-progress", movieId],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("movie_progress").select("playback_position").eq("movie_id", movieId).maybeSingle();
      return data?.playback_position ?? 0;
    },
  });

  const toggleWatchlist = useMutation({
    mutationFn: async (on: boolean) => {
      if (on) {
        const { error } = await supabase.from("movie_watchlist").insert({ movie_id: movieId, user_id: user!.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("movie_watchlist").delete().eq("movie_id", movieId).eq("user_id", user!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["movie-watchlist"] });
      qc.invalidateQueries({ queryKey: ["movie-watchlist", movieId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Could not update your watchlist."),
  });

  const saveProgress = useCallback(
    async (position: number, duration: number) => {
      if (!user) return;
      await supabase.from("movie_progress").upsert(
        {
          user_id: user.id,
          movie_id: movieId,
          playback_position: Math.floor(position),
          duration_seconds: Math.floor(duration) || null,
          completed: duration > 0 && position / duration > 0.95,
        },
        { onConflict: "user_id,movie_id" },
      );
    },
    [user, movieId],
  );

  const onProgress = useCallback(
    (position: number, duration: number) => {
      if (Date.now() - lastSaved.current < 10000) return;
      lastSaved.current = Date.now();
      void saveProgress(position, duration);
    },
    [saveProgress],
  );

  async function startWatching() {
    const url = await getMovieVideoUrl(movie?.video_path);
    if (!url) { toast.error("This movie is not available right now."); return; }
    setVideoUrl(url);
    setWatching(true);
  }

  useEffect(() => { setWatching(false); setVideoUrl(null); }, [movieId]);

  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!user) return <AuthWall title="Login to watch movies" description="Sign in to stream movies from the Aditya Exam Hub library." />;
  if (isLoading) return <div className="p-10 text-muted-foreground">Loading movie…</div>;
  if (!movie) {
    return (
      <div className="p-10 space-y-3">
        <p className="text-muted-foreground">This movie is not available.</p>
        <Button asChild variant="outline"><Link to="/movies"><ArrowLeft className="size-4 mr-1" /> Back to Movies</Link></Button>
      </div>
    );
  }

  const meta = [movie.release_year, movie.language, movie.content_rating, formatDuration(movie.duration_minutes)].filter(Boolean).join(" · ");

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link to="/movies"><ArrowLeft className="size-4 mr-1" /> Movies</Link></Button>

      {watching && videoUrl ? (
        <VideoPlayer url={videoUrl} initialPosition={progress ?? 0} onProgress={onProgress} />
      ) : (
        <div className="flex flex-col sm:flex-row gap-5">
          <MoviePoster posterPath={movie.poster_path} posterUrl={movie.poster_url} title={movie.title} className="w-full sm:w-56 aspect-[2/3] shrink-0" />
          <div className="space-y-3 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {movie.featured && <Badge className="bg-primary text-primary-foreground">Featured</Badge>}
              {movie.trending && <Badge variant="secondary">Trending</Badge>}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">{movie.title}</h1>
            <p className="text-sm text-muted-foreground">{meta}</p>
            <div className="flex flex-wrap gap-2">{movie.genres?.map((g) => <Badge key={g} variant="outline">{g}</Badge>)}</div>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{movie.description}</p>
            <div className="flex gap-2 flex-wrap pt-2">
              <Button onClick={startWatching} disabled={!movie.video_path}>
                <Play className="size-4 mr-1" /> {progress ? "Continue Watching" : "Watch Movie"}
              </Button>
              <Button variant="outline" onClick={() => toggleWatchlist.mutate(!saved)}>
                {saved ? <BookmarkCheck className="size-4 mr-1 text-primary" /> : <Bookmark className="size-4 mr-1" />}
                {saved ? "In Watchlist" : "Add to Watchlist"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {movie.trailer_url && !watching && (
        <div className="space-y-2">
          <h2 className="font-semibold">Trailer</h2>
          <VideoPlayer url={movie.trailer_url} />
        </div>
      )}

      {related && related.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-semibold flex items-center gap-2"><Clapperboard className="size-4 text-primary" /> Related Movies</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {related.map((m) => (
              <Link key={m.id} to="/movies/$movieId" params={{ movieId: m.id }} className="rounded-xl border border-border bg-card overflow-hidden">
                <MoviePoster posterPath={m.poster_path} posterUrl={m.poster_url} title={m.title} className="aspect-[2/3] w-full rounded-none" />
                <div className="p-2">
                  <p className="text-sm font-medium line-clamp-1">{m.title}</p>
                  <p className="text-[11px] text-muted-foreground">{[m.release_year, formatDuration(m.duration_minutes)].filter(Boolean).join(" · ")}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
