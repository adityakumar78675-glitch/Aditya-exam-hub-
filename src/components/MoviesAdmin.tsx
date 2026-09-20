import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Upload, CheckCircle2, Image as ImageIcon, Eye, Tag } from "lucide-react";
import { MoviePoster } from "@/components/MoviePoster";
import { MovieUploader, type MovieUploadResult } from "@/components/MovieUploader";
import {
  formatBytes,
  MOVIE_POSTER_BUCKET,
  MOVIE_VIDEO_BUCKET,
  removeMovieObjects,
  uploadMoviePoster,
  validatePosterFile,
} from "@/lib/movie-upload";

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
  published: boolean;
  file_size: number | null;
  file_type: string | null;
};

const emptyForm = {
  title: "",
  description: "",
  release_year: new Date().getFullYear(),
  genres: [] as string[],
  language: "Hindi",
  duration_minutes: 0,
  content_rating: "U/A",
  trailer_url: "",
  featured: false,
  trending: false,
  published: false,
};

export function MoviesAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Movie | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [movieKey, setMovieKey] = useState<string>(() => crypto.randomUUID());
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [posterUploading, setPosterUploading] = useState(false);
  const [video, setVideo] = useState<MovieUploadResult | null>(null);
  const posterInput = useRef<HTMLInputElement>(null);
  const [genreInput, setGenreInput] = useState("");

  const { data: movies } = useQuery({
    queryKey: ["admin-movies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("movies").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Movie[];
    },
  });

  const { data: genres } = useQuery({
    queryKey: ["movie-genres"],
    queryFn: async () => {
      const { data, error } = await supabase.from("movie_genres").select("*").order("sort_order");
      if (error) throw error;
      return data as { id: string; name: string; sort_order: number }[];
    },
  });

  const existingVideoPath = editing?.video_path ?? null;
  const hasVideo = !!(video?.video_path ?? existingVideoPath);
  const hasPoster = !!(posterPath ?? editing?.poster_path);

  function resetForm() {
    setEditing(null);
    setForm({ ...emptyForm });
    setPosterPath(null);
    setVideo(null);
    setMovieKey(crypto.randomUUID());
  }

  function openNew() {
    resetForm();
    setOpen(true);
  }

  function openEdit(m: Movie) {
    setEditing(m);
    setMovieKey(m.id);
    setPosterPath(m.poster_path);
    setVideo(null);
    setForm({
      title: m.title,
      description: m.description ?? "",
      release_year: m.release_year ?? new Date().getFullYear(),
      genres: m.genres ?? [],
      language: m.language ?? "",
      duration_minutes: m.duration_minutes ?? 0,
      content_rating: m.content_rating ?? "",
      trailer_url: m.trailer_url ?? "",
      featured: m.featured,
      trending: m.trending,
      published: m.published,
    });
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async (publishNow?: boolean) => {
      if (!form.title.trim()) throw new Error("Title is required.");
      const published = publishNow ?? form.published;
      if (published && !(hasVideo && form.title.trim())) throw new Error("Upload the movie video before publishing.");
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        poster_path: posterPath,
        video_path: video?.video_path ?? existingVideoPath,
        release_year: Number(form.release_year) || null,
        genres: form.genres,
        language: form.language.trim() || null,
        duration_minutes: Number(form.duration_minutes) || video?.duration_minutes || null,
        content_rating: form.content_rating.trim() || null,
        trailer_url: form.trailer_url.trim() || null,
        featured: form.featured,
        trending: form.trending,
        published,
        file_size: video?.file_size ?? editing?.file_size ?? null,
        file_type: video?.file_type ?? editing?.file_type ?? null,
        uploaded_by: user?.id ?? null,
      };
      if (editing) {
        const { error } = await supabase.from("movies").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("movies").insert({ id: movieKey, ...payload });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-movies"] });
      qc.invalidateQueries({ queryKey: ["movies"] });
      toast.success("Movie saved");
      setOpen(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message ?? "Could not save the movie."),
  });

  const toggleFlag = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "featured" | "trending" | "published"; value: boolean }) => {
      const { error } = await supabase.from("movies").update({ [field]: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-movies"] });
      qc.invalidateQueries({ queryKey: ["movies"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed."),
  });

  const removeMovie = useMutation({
    mutationFn: async (m: Movie) => {
      await removeMovieObjects(MOVIE_VIDEO_BUCKET, [m.video_path]);
      await removeMovieObjects(MOVIE_POSTER_BUCKET, [m.poster_path]);
      const { error } = await supabase.from("movies").delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-movies"] });
      qc.invalidateQueries({ queryKey: ["movies"] });
      toast.success("Movie deleted");
    },
    onError: (e: any) => toast.error(e.message ?? "Delete failed."),
  });

  const addGenre = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("movie_genres").insert({ name: name.trim(), sort_order: (genres?.length ?? 0) + 1 });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["movie-genres"] }); setGenreInput(""); },
    onError: (e: any) => toast.error(e.message ?? "Could not add genre."),
  });

  const deleteGenre = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("movie_genres").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["movie-genres"] }),
    onError: (e: any) => toast.error(e.message ?? "Could not remove genre."),
  });

  async function handlePoster(file: File) {
    const invalid = validatePosterFile(file);
    if (invalid) { toast.error(invalid); return; }
    setPosterUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${movieKey}/poster.${ext}`;
      await uploadMoviePoster(file, path);
      setPosterPath(null);
      setTimeout(() => setPosterPath(path), 0);
      toast.success("Poster uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Poster upload failed.");
    } finally {
      setPosterUploading(false);
    }
  }

  const stats = useMemo(() => ({
    total: movies?.length ?? 0,
    published: movies?.filter((m) => m.published).length ?? 0,
  }), [movies]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">Movie Management</h2>
          <p className="text-sm text-muted-foreground">{stats.total} movies · {stats.published} published</p>
        </div>
        <Button onClick={openNew}><Plus className="size-4 mr-2" /> Add New Movie</Button>
      </div>

      {/* Genres */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-2"><Tag className="size-4 text-primary" /> Genres</p>
        <div className="flex flex-wrap gap-2">
          {genres?.map((g) => (
            <Badge key={g.id} variant="secondary" className="gap-1">
              {g.name}
              <button type="button" className="ml-1 opacity-60 hover:opacity-100" onClick={() => deleteGenre.mutate(g.id)} aria-label={`Remove ${g.name}`}>
                <Trash2 className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2 max-w-sm">
          <Input placeholder="New genre" value={genreInput} onChange={(e) => setGenreInput(e.target.value)} />
          <Button variant="outline" disabled={!genreInput.trim()} onClick={() => addGenre.mutate(genreInput)}>Add</Button>
        </div>
      </div>

      {/* List */}
      <div className="grid gap-3">
        {movies?.map((m) => (
          <div key={m.id} className="rounded-xl border border-border bg-card p-3 flex gap-3 items-start">
            <MoviePoster posterPath={m.poster_path} posterUrl={m.poster_url} title={m.title} className="w-16 h-24 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold truncate">{m.title}</p>
                {m.published ? <Badge className="bg-accent text-accent-foreground">Published</Badge> : <Badge variant="outline">Draft</Badge>}
                {m.featured && <Badge variant="secondary">Featured</Badge>}
                {m.trending && <Badge variant="secondary">Trending</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">
                {[m.release_year, m.language, m.content_rating, m.genres?.join(", ")].filter(Boolean).join(" · ")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {m.video_path ? `Video ready${m.file_size ? ` · ${formatBytes(m.file_size)}` : ""}` : "No video uploaded"}
              </p>
              <div className="flex items-center gap-4 pt-1 flex-wrap text-xs">
                <label className="flex items-center gap-2">
                  <Switch checked={m.published} onCheckedChange={(v) => toggleFlag.mutate({ id: m.id, field: "published", value: v })} /> Published
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={m.featured} onCheckedChange={(v) => toggleFlag.mutate({ id: m.id, field: "featured", value: v })} /> Featured
                </label>
                <label className="flex items-center gap-2">
                  <Switch checked={m.trending} onCheckedChange={(v) => toggleFlag.mutate({ id: m.id, field: "trending", value: v })} /> Trending
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(m)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${m.title}" and its files?`)) removeMovie.mutate(m); }}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        {movies && movies.length === 0 && <p className="text-sm text-muted-foreground">No movies yet.</p>}
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Movie" : "Add New Movie"}</DialogTitle></DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label>Title *</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label>Release Year</Label>
                <Input type="number" value={form.release_year} onChange={(e) => setForm({ ...form, release_year: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Duration (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>Language</Label>
                <Input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Content Rating</Label>
                <Input placeholder="U / U/A / A" value={form.content_rating} onChange={(e) => setForm({ ...form, content_rating: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Trailer URL (optional)</Label>
                <Input value={form.trailer_url} onChange={(e) => setForm({ ...form, trailer_url: e.target.value })} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Genres</Label>
              <div className="flex flex-wrap gap-2">
                {genres?.map((g) => {
                  const on = form.genres.includes(g.name);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setForm({ ...form, genres: on ? form.genres.filter((x) => x !== g.name) : [...form.genres, g.name] })}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Poster */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-2"><ImageIcon className="size-4 text-primary" /> Poster</span>
                <span className="text-[11px] text-muted-foreground">JPG / PNG / WEBP · max 10 MB</span>
              </div>
              <input
                ref={posterInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) handlePoster(f); }}
              />
              <div className="flex gap-3 items-start">
                {posterPath && <MoviePoster posterPath={posterPath} title={form.title || "Poster"} className="w-24 h-36" />}
                <div className="space-y-2">
                  <Button type="button" variant="outline" size="sm" disabled={posterUploading} onClick={() => posterInput.current?.click()}>
                    <Upload className="size-4 mr-2" /> {posterUploading ? "Uploading…" : posterPath ? "Replace poster" : "Choose Poster"}
                  </Button>
                  {posterPath && <p className="text-xs text-accent flex items-center gap-1"><CheckCircle2 className="size-3.5" /> Poster uploaded</p>}
                </div>
              </div>
            </div>

            <MovieUploader
              movieKey={movieKey}
              existingPath={existingVideoPath}
              existingSize={editing?.file_size ?? null}
              onUploaded={setVideo}
              onCleared={() => setVideo(null)}
            />

            <div className="flex items-center gap-6 flex-wrap text-sm">
              <label className="flex items-center gap-2"><Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} /> Featured</label>
              <label className="flex items-center gap-2"><Switch checked={form.trending} onCheckedChange={(v) => setForm({ ...form, trending: v })} /> Trending</label>
              <label className="flex items-center gap-2"><Switch checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} disabled={!hasVideo} /> Published</label>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p className={hasPoster ? "text-accent" : ""}>{hasPoster ? "✓ Poster uploaded" : "• Poster pending"}</p>
              <p className={hasVideo ? "text-accent" : ""}>{hasVideo ? "✓ Video uploaded" : "• Video pending"}</p>
              <p>{form.title.trim() ? "✓ Movie metadata ready" : "• Add a title"}</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => save.mutate(false)} disabled={save.isPending}>Save as Draft</Button>
            <Button onClick={() => save.mutate(true)} disabled={save.isPending || !hasVideo || !form.title.trim()}>
              <Eye className="size-4 mr-2" /> Publish Movie
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
