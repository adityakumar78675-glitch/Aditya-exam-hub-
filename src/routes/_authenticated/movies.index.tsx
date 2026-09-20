import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AuthWall } from "@/components/AuthWall";
import { MoviePoster } from "@/components/MoviePoster";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Play, Bookmark, BookmarkCheck, Flame, Star, Clapperboard } from "lucide-react";
import { formatDuration } from "@/lib/movie-upload";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/movies/")({
  component: MoviesHome,
  head: () => ({
    meta: [
      { title: "Movies | Aditya Exam Hub" },
      { name: "description", content: "Watch featured, trending and latest movies curated for Aditya Exam Hub students." },
      { property: "og:title", content: "Movies | Aditya Exam Hub" },
      { property: "og:description", content: "Browse, search and stream the Aditya Exam Hub movie library." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

export type MovieRow = {
  id: string;
  title: string;
  description: string | null;
  poster_path: string | null;
  poster_url: string | null;
  release_year: number | null;
  genres: string[];
  language: string | null;
  duration_minutes: number | null;
  content_rating: string | null;
  featured: boolean;
  trending: boolean;
};

const PAGE = 24;

function MoviesHome() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [year, setYear] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "featured" | "trending" | "latest" | "watchlist">("all");
  const [limit, setLimit] = useState(PAGE);

  const { data: movies, isLoading } = useQuery({
    queryKey: ["movies"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movies")
        .select("id,title,description,poster_path,poster_url,release_year,genres,language,duration_minutes,content_rating,featured,trending")
        .eq("published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as MovieRow[];
    },
  });

  const { data: watchlist } = useQuery({
    queryKey: ["movie-watchlist"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("movie_watchlist").select("movie_id");
      if (error) throw error;
      return (data ?? []).map((r) => r.movie_id as string);
    },
  });

  const toggleWatch = useMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from("movie_watchlist").insert({ movie_id: id, user_id: user!.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("movie_watchlist").delete().eq("movie_id", id).eq("user_id", user!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["movie-watchlist"] }),
    onError: (e: any) => toast.error(e.message ?? "Could not update your watchlist."),
  });

  const genres = useMemo(() => Array.from(new Set((movies ?? []).flatMap((m) => m.genres ?? []))).sort(), [movies]);
  const languages = useMemo(() => Array.from(new Set((movies ?? []).map((m) => m.language).filter(Boolean) as string[])).sort(), [movies]);
  const years = useMemo(
    () => Array.from(new Set((movies ?? []).map((m) => m.release_year).filter(Boolean) as number[])).sort((a, b) => b - a).map(String),
    [movies],
  );

  const filtered = useMemo(() => {
    let list = movies ?? [];
    if (tab === "featured") list = list.filter((m) => m.featured);
    if (tab === "trending") list = list.filter((m) => m.trending);
    if (tab === "watchlist") list = list.filter((m) => watchlist?.includes(m.id));
    if (genre) list = list.filter((m) => m.genres?.includes(genre));
    if (language) list = list.filter((m) => m.language === language);
    if (year) list = list.filter((m) => String(m.release_year) === year);
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((m) => m.title.toLowerCase().includes(term));
    return list;
  }, [movies, tab, genre, language, year, q, watchlist]);

  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!user) return <AuthWall title="Login to watch movies" description="Sign in to browse and stream the Aditya Exam Hub movie library." />;

  const featured = (movies ?? []).filter((m) => m.featured).slice(0, 1)[0];

  const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap ${
        active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Clapperboard className="size-6 text-primary" /> Movies</h1>
        <p className="text-sm text-muted-foreground">Featured, trending and latest titles for you.</p>
      </div>

      {featured && tab === "all" && !q && (
        <Link to="/movies/$movieId" params={{ movieId: featured.id }} className="block">
          <div className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col sm:flex-row">
            <MoviePoster posterPath={featured.poster_path} posterUrl={featured.poster_url} title={featured.title} className="sm:w-48 h-56 sm:h-auto rounded-none" />
            <div className="p-5 space-y-2 flex-1">
              <Badge className="bg-primary text-primary-foreground"><Star className="size-3 mr-1" /> Featured</Badge>
              <h2 className="text-xl font-bold">{featured.title}</h2>
              <p className="text-xs text-muted-foreground">
                {[featured.release_year, featured.language, featured.content_rating, formatDuration(featured.duration_minutes)].filter(Boolean).join(" · ")}
              </p>
              <p className="text-sm text-muted-foreground line-clamp-3">{featured.description}</p>
              <Button size="sm" className="mt-2"><Play className="size-4 mr-1" /> Watch Movie</Button>
            </div>
          </div>
        </Link>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Filters */}
        <aside className="lg:w-56 shrink-0 space-y-4">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search movies" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-1">
            {(["all", "featured", "trending", "latest", "watchlist"] as const).map((t) => (
              <Chip key={t} active={tab === t} onClick={() => { setTab(t); setLimit(PAGE); }}>
                {t === "all" ? "All Movies" : t === "watchlist" ? "My Watchlist" : t[0]!.toUpperCase() + t.slice(1)}
              </Chip>
            ))}
          </div>
          {genres.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Genre</p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!genre} onClick={() => setGenre(null)}>All</Chip>
                {genres.map((g) => <Chip key={g} active={genre === g} onClick={() => setGenre(g)}>{g}</Chip>)}
              </div>
            </div>
          )}
          {languages.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Language</p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!language} onClick={() => setLanguage(null)}>All</Chip>
                {languages.map((l) => <Chip key={l} active={language === l} onClick={() => setLanguage(l)}>{l}</Chip>)}
              </div>
            </div>
          )}
          {years.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Year</p>
              <div className="flex flex-wrap gap-2">
                <Chip active={!year} onClick={() => setYear(null)}>All</Chip>
                {years.map((y) => <Chip key={y} active={year === y} onClick={() => setYear(y)}>{y}</Chip>)}
              </div>
            </div>
          )}
        </aside>

        {/* Grid */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading movies…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No movies found.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {filtered.slice(0, limit).map((m) => {
                  const saved = watchlist?.includes(m.id) ?? false;
                  return (
                    <div key={m.id} className="rounded-xl border border-border bg-card overflow-hidden group">
                      <Link to="/movies/$movieId" params={{ movieId: m.id }}>
                        <MoviePoster posterPath={m.poster_path} posterUrl={m.poster_url} title={m.title} className="aspect-[2/3] w-full rounded-none" />
                      </Link>
                      <div className="p-3 space-y-1">
                        <Link to="/movies/$movieId" params={{ movieId: m.id }} className="font-semibold text-sm line-clamp-1 hover:text-primary">
                          {m.title}
                        </Link>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {[m.release_year, m.genres?.[0], formatDuration(m.duration_minutes), m.content_rating].filter(Boolean).join(" · ")}
                        </p>
                        <div className="flex items-center gap-1.5 pt-1">
                          <Button asChild size="sm" className="h-8 flex-1 text-xs">
                            <Link to="/movies/$movieId" params={{ movieId: m.id }}><Play className="size-3.5 mr-1" /> Watch</Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            aria-label={saved ? "Remove from watchlist" : "Add to watchlist"}
                            onClick={() => toggleWatch.mutate({ id: m.id, on: !saved })}
                          >
                            {saved ? <BookmarkCheck className="size-4 text-primary" /> : <Bookmark className="size-4" />}
                          </Button>
                        </div>
                        {m.trending && <p className="text-[10px] text-accent flex items-center gap-1"><Flame className="size-3" /> Trending</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {filtered.length > limit && (
                <div className="flex justify-center mt-6">
                  <Button variant="outline" onClick={() => setLimit((l) => l + PAGE)}>Load more</Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
