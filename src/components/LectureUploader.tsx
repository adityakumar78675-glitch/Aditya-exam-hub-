import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Upload, Pause, Play, X, RotateCcw, CheckCircle2, Loader2, AlertTriangle, Film } from "lucide-react";
import {
  formatBytes,
  formatEta,
  getSignedLectureUrl,
  probeVideo,
  removeStorageObjects,
  startResumableUpload,
  uploadThumbnail,
  validateVideoFile,
  type UploadHandle,
} from "@/lib/lecture-upload";

export type LectureUploadResult = {
  video_storage_path: string;
  thumbnail_storage_path: string | null;
  file_size: number;
  duration_seconds: number;
  duration_minutes: number;
};

type Props = {
  batchId: string;
  existingPath?: string | null;
  existingSize?: number | null;
  existingDuration?: number | null;
  onUploaded: (result: LectureUploadResult) => void;
};

type Phase = "idle" | "uploading" | "paused" | "processing" | "ready" | "error";

export function LectureUploader({ batchId, existingPath, existingSize, existingDuration, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const startedAtRef = useRef(0);
  const pendingRef = useRef<{ file: File; path: string; thumbPath: string | null; duration: number; thumb: Blob | null } | null>(null);

  const [phase, setPhase] = useState<Phase>(existingPath ? "ready" : "idle");
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState(0);
  const [total, setTotal] = useState(existingSize ?? 0);
  const [eta, setEta] = useState<number>(Infinity);
  const [errorMsg, setErrorMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [donePath, setDonePath] = useState<string | null>(existingPath ?? null);

  useEffect(() => () => { handleRef.current?.pause(); }, []);

  const percent = total ? Math.min(100, Math.round((uploaded / total) * 100)) : 0;

  async function pickFile(f: File) {
    const invalid = validateVideoFile(f);
    if (invalid) { toast.error(invalid); return; }
    setFile(f);
    setErrorMsg("");
    setUploaded(0);
    setTotal(f.size);
    setPhase("uploading");
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const ext = (f.name.split(".").pop() || "mp4").toLowerCase();
    const path = `${batchId}/${stamp}/video.${ext}`;
    const { durationSeconds, thumbnail } = await probeVideo(f);
    pendingRef.current = {
      file: f,
      path,
      thumbPath: thumbnail ? `${batchId}/${stamp}/thumb.jpg` : null,
      duration: durationSeconds,
      thumb: thumbnail,
    };
    beginUpload();
  }

  async function beginUpload() {
    const pending = pendingRef.current;
    if (!pending) return;
    startedAtRef.current = Date.now();
    setPhase("uploading");
    try {
      handleRef.current = await startResumableUpload(pending.file, pending.path, {
        onProgress: (sent, tot) => {
          setUploaded(sent);
          setTotal(tot);
          const elapsed = (Date.now() - startedAtRef.current) / 1000;
          const rate = sent / Math.max(elapsed, 0.001);
          setEta(rate > 0 ? (tot - sent) / rate : Infinity);
        },
        onSuccess: async (storagePath) => {
          setPhase("processing");
          let thumbPath: string | null = null;
          try {
            if (pending.thumb && pending.thumbPath) thumbPath = await uploadThumbnail(pending.thumb, pending.thumbPath);
          } catch { thumbPath = null; }
          setDonePath(storagePath);
          setPhase("ready");
          onUploaded({
            video_storage_path: storagePath,
            thumbnail_storage_path: thumbPath,
            file_size: pending.file.size,
            duration_seconds: Math.round(pending.duration),
            duration_minutes: Math.max(1, Math.round(pending.duration / 60)),
          });
          toast.success("Upload complete — lecture ready");
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
  function resume() { startedAtRef.current = Date.now() - (uploaded / Math.max(total, 1)) * 1000; handleRef.current?.resume(); setPhase("uploading"); }

  async function cancel() {
    await handleRef.current?.abort(true);
    handleRef.current = null;
    pendingRef.current = null;
    setFile(null);
    setPhase(donePath ? "ready" : "idle");
    setUploaded(0);
  }

  async function preview() {
    const url = await getSignedLectureUrl(donePath);
    if (!url) { toast.error("Could not open preview."); return; }
    setPreviewUrl(url);
  }

  async function replaceVideo() {
    if (donePath && !confirm("Replace the uploaded video? The old file will be removed.")) return;
    if (donePath) await removeStorageObjects([donePath]);
    setDonePath(null);
    setPreviewUrl(null);
    setPhase("idle");
    inputRef.current?.click();
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold flex items-center gap-2"><Film className="size-4 text-primary" /> Upload Lecture Video</span>
        <span className="text-[11px] text-muted-foreground">MP4 / WebM / MOV · max 1 GB</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickFile(f); }}
      />

      {phase === "idle" && (
        <Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
          <Upload className="size-4 mr-2" /> Select video from device
        </Button>
      )}

      {(phase === "uploading" || phase === "paused") && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{phase === "paused" ? "Upload paused" : "Uploading Lecture..."}</p>
          <Progress value={percent} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{percent}% · {formatBytes(uploaded)} / {formatBytes(total)}</span>
            <span>{phase === "uploading" ? `~${formatEta(eta)} remaining` : "Waiting to resume"}</span>
          </div>
          <div className="flex gap-2">
            {phase === "uploading"
              ? <Button type="button" size="sm" variant="secondary" onClick={pause}><Pause className="size-4 mr-1" /> Pause</Button>
              : <Button type="button" size="sm" onClick={resume}><Play className="size-4 mr-1" /> Resume</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={cancel}><X className="size-4 mr-1" /> Cancel</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{file?.name}</p>
        </div>
      )}

      {phase === "processing" && (
        <p className="text-sm flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Processing video...</p>
      )}

      {phase === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-destructive flex items-center gap-2"><AlertTriangle className="size-4" /> Upload interrupted.</p>
          <p className="text-xs text-muted-foreground">{errorMsg}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={beginUpload}><RotateCcw className="size-4 mr-1" /> Resume Upload</Button>
            <Button type="button" size="sm" variant="secondary" onClick={beginUpload}>Retry</Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}

      {phase === "ready" && donePath && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-accent flex items-center gap-2"><CheckCircle2 className="size-4" /> Lecture ready ✓</p>
          <p className="text-[11px] text-muted-foreground break-all">
            {formatBytes(total || existingSize || 0)}
            {existingDuration ? ` · ${Math.round(existingDuration / 60)} min` : ""}
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" size="sm" variant="outline" onClick={preview}><Play className="size-4 mr-1" /> Preview Lecture</Button>
            <Button type="button" size="sm" variant="ghost" onClick={replaceVideo}><Upload className="size-4 mr-1" /> Replace video</Button>
          </div>
          {previewUrl && (
            <video src={previewUrl} controls playsInline className="w-full rounded-lg bg-black aspect-video" />
          )}
        </div>
      )}
    </div>
  );
}
