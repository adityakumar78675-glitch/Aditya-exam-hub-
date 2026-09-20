import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, Pause, Play, X, RotateCcw, CheckCircle2, Loader2, AlertTriangle, Film } from "lucide-react";
import {
  formatBytes,
  formatEta,
  formatSpeed,
  getMovieVideoUrl,
  probeDuration,
  removeMovieObjects,
  startResumableMovieUpload,
  validateMovieFile,
  MOVIE_VIDEO_BUCKET,
  type UploadHandle,
} from "@/lib/movie-upload";

export type MovieUploadResult = {
  video_path: string;
  file_size: number;
  file_type: string;
  duration_minutes: number;
};

type Props = {
  movieKey: string;
  existingPath?: string | null;
  existingSize?: number | null;
  onUploaded: (result: MovieUploadResult) => void;
  onCleared?: () => void;
};

type Phase = "idle" | "uploading" | "paused" | "processing" | "ready" | "error";

export function MovieUploader({ movieKey, existingPath, existingSize, onUploaded, onCleared }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const startRef = useRef({ at: 0, from: 0 });
  const pendingRef = useRef<{ file: File; path: string; duration: number } | null>(null);

  const [phase, setPhase] = useState<Phase>(existingPath ? "ready" : "idle");
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState(0);
  const [total, setTotal] = useState(existingSize ?? 0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState<number>(Infinity);
  const [errorMsg, setErrorMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [donePath, setDonePath] = useState<string | null>(existingPath ?? null);

  useEffect(() => () => { handleRef.current?.pause(); }, []);

  const percent = total ? Math.min(100, Math.round((uploaded / total) * 100)) : 0;

  async function pickFile(f: File) {
    const invalid = validateMovieFile(f);
    if (invalid) { toast.error(invalid); return; }
    setFile(f);
    setErrorMsg("");
    setUploaded(0);
    setTotal(f.size);
    setPhase("uploading");
    const ext = (f.name.split(".").pop() || "mp4").toLowerCase();
    const duration = await probeDuration(f);
    pendingRef.current = { file: f, path: `${movieKey}/movie-file.${ext}`, duration };
    beginUpload();
  }

  async function beginUpload() {
    const pending = pendingRef.current;
    if (!pending) return;
    startRef.current = { at: Date.now(), from: uploaded };
    setPhase("uploading");
    try {
      handleRef.current = await startResumableMovieUpload(pending.file, pending.path, {
        onProgress: (sent, tot) => {
          setUploaded(sent);
          setTotal(tot);
          const elapsed = (Date.now() - startRef.current.at) / 1000;
          const rate = (sent - startRef.current.from) / Math.max(elapsed, 0.001);
          setSpeed(rate);
          setEta(rate > 0 ? (tot - sent) / rate : Infinity);
        },
        onSuccess: (storagePath) => {
          setPhase("processing");
          setDonePath(storagePath);
          setPhase("ready");
          onUploaded({
            video_path: storagePath,
            file_size: pending.file.size,
            file_type: pending.file.type || "video/mp4",
            duration_minutes: Math.max(1, Math.round(pending.duration / 60)),
          });
          toast.success("Movie video uploaded");
        },
        onError: (err) => {
          setErrorMsg(err.message || "Upload interrupted.");
          setPhase("error");
        },
      });
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Upload could not start.");
      setPhase("error");
    }
  }

  function pause() { handleRef.current?.pause(); setPhase("paused"); }
  function resume() { startRef.current = { at: Date.now(), from: uploaded }; handleRef.current?.resume(); setPhase("uploading"); }

  async function cancel() {
    await handleRef.current?.abort(true);
    handleRef.current = null;
    pendingRef.current = null;
    setFile(null);
    setUploaded(0);
    setPhase(donePath ? "ready" : "idle");
  }

  async function preview() {
    const url = await getMovieVideoUrl(donePath);
    if (!url) { toast.error("Could not open preview."); return; }
    setPreviewUrl(url);
  }

  async function replaceVideo() {
    if (donePath && !confirm("Replace the uploaded movie file? The old file will be removed.")) return;
    if (donePath) await removeMovieObjects(MOVIE_VIDEO_BUCKET, [donePath]);
    setDonePath(null);
    setPreviewUrl(null);
    setPhase("idle");
    onCleared?.();
    inputRef.current?.click();
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold flex items-center gap-2"><Film className="size-4 text-primary" /> Movie Video</span>
        <span className="text-[11px] text-muted-foreground">MP4 / WebM / MOV / MKV · max 5 GB</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickFile(f); }}
      />

      {phase === "idle" && (
        <Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4 mr-2" /> Choose Video
        </Button>
      )}

      {(phase === "uploading" || phase === "paused") && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{phase === "paused" ? "Upload paused" : "Uploading movie…"}</p>
          <Progress value={percent} />
          <div className="flex justify-between text-xs text-muted-foreground flex-wrap gap-x-3">
            <span>{percent}% · {formatBytes(uploaded)} / {formatBytes(total)}</span>
            <span>{phase === "uploading" ? `Speed: ${formatSpeed(speed)} · Remaining: ${formatEta(eta)}` : "Waiting to resume"}</span>
          </div>
          <div className="flex gap-2">
            {phase === "uploading"
              ? <Button type="button" size="sm" variant="secondary" onClick={pause}><Pause className="size-4 mr-1" /> Pause</Button>
              : <Button type="button" size="sm" onClick={resume}><Play className="size-4 mr-1" /> Resume</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={cancel}><X className="size-4 mr-1" /> Cancel</Button>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{file?.name}</p>
        </div>
      )}

      {phase === "processing" && (
        <p className="text-sm flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Finalising…</p>
      )}

      {phase === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-destructive flex items-center gap-2"><AlertTriangle className="size-4" /> Upload interrupted.</p>
          <p className="text-xs text-muted-foreground">{errorMsg}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={beginUpload}><RotateCcw className="size-4 mr-1" /> Resume Upload</Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}

      {phase === "ready" && donePath && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-accent flex items-center gap-2"><CheckCircle2 className="size-4" /> Video uploaded</p>
          <p className="text-[11px] text-muted-foreground break-all">{formatBytes(total || existingSize || 0)} · {donePath}</p>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" size="sm" variant="outline" onClick={preview}><Play className="size-4 mr-1" /> Preview Movie</Button>
            <Button type="button" size="sm" variant="ghost" onClick={replaceVideo}><Upload className="size-4 mr-1" /> Replace video</Button>
          </div>
          {previewUrl && <video src={previewUrl} controls playsInline className="w-full rounded-lg bg-black aspect-video" />}
        </div>
      )}
    </div>
  );
}
