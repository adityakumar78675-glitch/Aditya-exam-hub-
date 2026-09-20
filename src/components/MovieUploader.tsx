import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Upload, Pause, Play, X, RotateCcw, CheckCircle2, Loader2, AlertTriangle, Film, Wifi } from "lucide-react";
import {
  clearSession,
  createSpeedMeter,
  formatBytes,
  formatEta,
  formatSpeed,
  getMovieVideoUrl,
  loadSession,
  probeDuration,
  removeMovieObjects,
  saveSession,
  startResumableMovieUpload,
  validateMovieFile,
  verifyUploadedObject,
  MOVIE_VIDEO_BUCKET,
  type UploadHandle,
  type UploadStatus,
  type UploadDiagnostics,
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

const STATUS_LABEL: Record<UploadStatus, string> = {
  idle: "Ready",
  uploading: "Uploading",
  paused: "Paused",
  resuming: "Resuming",
  reconnecting: "Reconnecting",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function MovieUploader({ movieKey, existingPath, existingSize, onUploaded, onCleared }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<UploadHandle | null>(null);
  const meterRef = useRef(createSpeedMeter(8000));
  const startingRef = useRef(false);
  const pendingRef = useRef<{ file: File; path: string; duration: number } | null>(null);
  const lastUiRef = useRef(0);
  const lastPersistRef = useRef(0);


  const [status, setStatus] = useState<UploadStatus>(existingPath ? "completed" : "idle");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState(0);
  const [total, setTotal] = useState(existingSize ?? 0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState<number>(Infinity);
  const [errorMsg, setErrorMsg] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [donePath, setDonePath] = useState<string | null>(existingPath ?? null);
  const [verified, setVerified] = useState(!!existingPath);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [diag, setDiag] = useState<UploadDiagnostics | null>(null);


  // Recover a previously interrupted session for this movie after a refresh/remount.
  const [recovered, setRecovered] = useState<ReturnType<typeof loadSession>>(null);
  useEffect(() => {
    if (existingPath) return;
    const prior = loadSession(movieKey);
    if (prior && prior.status !== "completed") {
      setRecovered(prior);
      setTotal(prior.fileSize);
      setUploaded(prior.uploadedBytes);
      setNotice(`An unfinished upload of "${prior.fileName}" was found. Choose the same file to resume from ${formatBytes(prior.uploadedBytes)}.`);
    }
  }, [movieKey, existingPath]);

  useEffect(() => () => { handleRef.current?.pause(); }, []);

  const percent = total ? Math.min(100, Math.round((uploaded / total) * 100)) : 0;
  const active = status === "uploading" || status === "paused" || status === "resuming" || status === "reconnecting";

  function persist(partial: Partial<Parameters<typeof saveSession>[0]>) {
    const pending = pendingRef.current;
    if (!pending) return;
    saveSession({
      uploadKey: `${movieKey}:${pending.file.name}:${pending.file.size}`,
      movieKey,
      objectPath: pending.path,
      fileName: pending.file.name,
      fileSize: pending.file.size,
      fileType: pending.file.type || "video/mp4",
      uploadedBytes: uploaded,
      durationSeconds: pending.duration,
      status,
      createdAt: recovered?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      ...partial,
    } as any);
  }

  async function pickFile(f: File) {
    if (active || startingRef.current) { toast.info("An upload is already in progress."); return; }
    const invalid = validateMovieFile(f);
    if (invalid) { toast.error(invalid); return; }
    setFile(f);
    setErrorMsg("");
    setNotice("");
    setUploaded(0);
    setVerified(false);
    setTotal(f.size);
    meterRef.current.reset();
    setStatus("uploading");
    const ext = (f.name.split(".").pop() || "mp4").toLowerCase();
    const duration = await probeDuration(f);
    pendingRef.current = { file: f, path: `${movieKey}/movie-file.${ext}`, duration };
    beginUpload();
  }

  async function beginUpload() {
    const pending = pendingRef.current;
    if (!pending || startingRef.current || handleRef.current?.isRunning()) return;
    startingRef.current = true;
    setErrorMsg("");
    setStatus("uploading");
    try {
      handleRef.current = await startResumableMovieUpload(pending.file, pending.path, {
        onStatus: (s, message) => {
          setStatus(s);
          setNotice(message ?? "");
          persist({ status: s });
        },
        onProgress: (sent, tot) => {
          meterRef.current.push(sent);
          const now = Date.now();
          // Throttle React renders: storage fires progress events continuously.
          if (now - lastUiRef.current >= 300 || sent >= tot) {
            lastUiRef.current = now;
            setUploaded(sent);
            setTotal(tot);
            const rate = meterRef.current.rate();
            if (rate > 0) {
              setSpeed(rate);
              setEta((tot - sent) / rate);
            }
          }
          if (now - lastPersistRef.current >= 3000 || sent >= tot) {
            lastPersistRef.current = now;
            persist({ uploadedBytes: sent });
          }
        },
        onDiagnostics: (d) => setDiag(d),

        onSuccess: async (storagePath) => {
          setStatus("processing");
          setNotice("Verifying uploaded file…");
          const check = await verifyUploadedObject(storagePath, pending.file.size);
          if (!check.ok) {
            setErrorMsg(check.reason || "Uploaded file could not be verified.");
            setStatus("failed");
            return;
          }
          clearSession(movieKey);
          setDonePath(storagePath);
          setVerified(true);
          setNotice("");
          setStatus("completed");
          onUploaded({
            video_path: storagePath,
            file_size: pending.file.size,
            file_type: pending.file.type || "video/mp4",
            duration_minutes: Math.max(1, Math.round(pending.duration / 60)),
          });
          toast.success("Movie video uploaded and verified");
        },
        onError: (err) => {
          setErrorMsg(err.message || "Upload failed after multiple retries.");
          setStatus("failed");
          persist({ status: "failed" });
        },
      });
    } catch (e: any) {
      setErrorMsg(e?.message ?? "Upload could not start.");
      setStatus("failed");
    } finally {
      startingRef.current = false;
    }
  }

  function pause() { handleRef.current?.pause(); meterRef.current.reset(); setSpeed(0); }
  function resume() { meterRef.current.reset(); handleRef.current?.resume(); }

  async function doCancel() {
    setConfirmCancel(false);
    await handleRef.current?.abort(true);
    handleRef.current = null;
    pendingRef.current = null;
    clearSession(movieKey);
    setFile(null);
    setUploaded(0);
    setSpeed(0);
    setNotice("");
    setStatus(donePath ? "completed" : "idle");
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
    setVerified(false);
    setPreviewUrl(null);
    setStatus("idle");
    onCleared?.();
    inputRef.current?.click();
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-semibold flex items-center gap-2"><Film className="size-4 text-primary" /> Movie File</span>
        <span className="text-[11px] text-muted-foreground">MP4 / WebM / MOV / MKV · Maximum Video Size: 5 GB</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/x-matroska,.mp4,.webm,.mov,.mkv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickFile(f); }}
      />

      {status === "idle" && (
        <div className="space-y-2">
          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
          <Button type="button" variant="outline" className="w-full" onClick={() => inputRef.current?.click()}>
            <Upload className="size-4 mr-2" /> {recovered ? "Choose file to resume" : "Choose Video"}
          </Button>
        </div>
      )}

      {active && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm font-medium flex items-center gap-2">
              {status === "reconnecting" ? <Wifi className="size-4 text-destructive" /> : status === "paused" ? <Pause className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
              {STATUS_LABEL[status]}
            </p>
            <span className="text-xs font-semibold">{percent}%</span>
          </div>
          <Progress value={percent} />
          <div className="flex justify-between text-xs text-muted-foreground flex-wrap gap-x-3">
            <span>{formatBytes(uploaded)} / {formatBytes(total)}</span>
            <span>
              {status === "uploading"
                ? `Speed: ${formatSpeed(speed)} · Remaining: ${formatEta(eta)}`
                : status === "paused" ? "Waiting to resume" : "Retrying automatically…"}
            </span>
          </div>
          {notice && <p className="text-[11px] text-muted-foreground">{notice}</p>}
          <div className="flex gap-2">
            {status === "paused"
              ? <Button type="button" size="sm" onClick={resume}><Play className="size-4 mr-1" /> Resume</Button>
              : <Button type="button" size="sm" variant="secondary" onClick={pause}><Pause className="size-4 mr-1" /> Pause</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}><X className="size-4 mr-1" /> Cancel</Button>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{file?.name}</p>
        </div>
      )}

      {status === "processing" && (
        <p className="text-sm flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {notice || "Finalising…"}</p>
      )}

      {status === "failed" && (
        <div className="space-y-2">
          <p className="text-sm text-destructive flex items-center gap-2"><AlertTriangle className="size-4" /> Upload failed.</p>
          <p className="text-xs text-muted-foreground">{errorMsg}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={beginUpload}><RotateCcw className="size-4 mr-1" /> Retry Upload</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>Cancel</Button>
          </div>
        </div>
      )}

      {status === "completed" && donePath && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-accent space-y-0.5">
            <p className="flex items-center gap-2"><CheckCircle2 className="size-4" /> Upload completed</p>
            {verified && <p className="flex items-center gap-2"><CheckCircle2 className="size-4" /> Video verified</p>}
            <p className="flex items-center gap-2"><CheckCircle2 className="size-4" /> Movie ready to publish</p>
          </div>
          <p className="text-[11px] text-muted-foreground break-all">{formatBytes(total || existingSize || 0)} · {donePath}</p>
          <div className="flex gap-2 flex-wrap">
            <Button type="button" size="sm" variant="outline" onClick={preview}><Play className="size-4 mr-1" /> Preview Movie</Button>
            <Button type="button" size="sm" variant="ghost" onClick={replaceVideo}><Upload className="size-4 mr-1" /> Replace video</Button>
          </div>
          {previewUrl && <video src={previewUrl} controls playsInline className="w-full rounded-lg bg-black aspect-video" />}
        </div>
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this upload?</AlertDialogTitle>
            <AlertDialogDescription>
              The uploaded parts will be discarded and the movie file will need to be uploaded again from the start.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continue Upload</AlertDialogCancel>
            <AlertDialogAction onClick={doCancel}>Cancel Upload</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
