// Movie assets: true resumable (chunked, TUS) video upload up to 5 GB + poster upload.
//
// Architecture notes (root-cause fixes for stalled / auto-cancelled uploads):
//  - Bytes go browser -> storage directly. Nothing passes through the app server.
//  - The auth token is refreshed and re-attached on EVERY chunk request. Previously a
//    single token was captured at start, so uploads longer than the token lifetime
//    failed with 401 mid-way and looked like a random cancellation.
//  - Retries use exponential backoff and explicitly retry network/5xx/401/timeout
//    errors instead of aborting the whole upload.
//  - Offline events pause instead of failing; the upload auto-resumes when the
//    connection returns.
//  - Upload state (tus fingerprint URL) is persisted in localStorage, so a refresh or
//    a remount resumes from the last successfully uploaded chunk.
//  - The storage resumable protocol requires a fixed 6 MB chunk size and does not
//    accept concurrently uploaded parts for one object, so chunks are streamed
//    sequentially with aggressive retry rather than in parallel.
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

export const MOVIE_VIDEO_BUCKET = "movie-videos";
export const MOVIE_POSTER_BUCKET = "movie-posters";
export const MAX_MOVIE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
export const MAX_POSTER_BYTES = 10 * 1024 * 1024; // 10 MB
const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB — required by the storage resumable endpoint

export const ACCEPTED_MOVIE_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
];
const ACCEPTED_MOVIE_EXT = ["mp4", "webm", "mov", "mkv"];
const ACCEPTED_POSTER_EXT = ["jpg", "jpeg", "png", "webp"];

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatSpeed(bytesPerSecond: number) {
  if (!isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "—";
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatEta(seconds: number) {
  if (!isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)} sec`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function formatDuration(minutes?: number | null) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function validateMovieFile(file: File | null | undefined): string | null {
  if (!file) return "No file selected.";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okType = ACCEPTED_MOVIE_TYPES.includes(file.type) || ACCEPTED_MOVIE_EXT.includes(ext);
  if (!okType) return "Only MP4, WebM, MOV and MKV videos are supported.";
  if (file.size > MAX_MOVIE_BYTES) return "Maximum movie file size is 5 GB.";
  if (file.size === 0) return "This file appears to be empty.";
  return null;
}

export function validatePosterFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okType = file.type.startsWith("image/") || ACCEPTED_POSTER_EXT.includes(ext);
  if (!okType || !ACCEPTED_POSTER_EXT.includes(ext)) return "Poster must be a JPG, JPEG, PNG or WEBP image.";
  if (file.size > MAX_POSTER_BYTES) return "Maximum poster size is 10 MB.";
  return null;
}

/** Read duration (seconds) from a local video file without loading it into memory. */
export function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const finish = (d: number) => { URL.revokeObjectURL(url); resolve(d); };
    video.onloadedmetadata = () => finish(isFinite(video.duration) ? video.duration : 0);
    video.onerror = () => finish(0);
    setTimeout(() => finish(isFinite(video.duration) ? video.duration : 0), 8000);
    video.src = url;
  });
}

/* ------------------------------------------------------------------ */
/* Persisted upload sessions (survive refresh / remount)               */
/* ------------------------------------------------------------------ */

export type PersistedSession = {
  uploadKey: string;
  movieKey: string;
  objectPath: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  uploadedBytes: number;
  durationSeconds: number;
  status: UploadStatus;
  createdAt: number;
  updatedAt: number;
};

const SESSION_PREFIX = "movie-upload-session:";

export function sessionKey(movieKey: string) {
  return `${SESSION_PREFIX}${movieKey}`;
}

export function loadSession(movieKey: string): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(sessionKey(movieKey));
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: PersistedSession) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(sessionKey(session.movieKey), JSON.stringify({ ...session, updatedAt: Date.now() }));
  } catch {
    /* storage full / private mode — resumability degrades gracefully */
  }
}

export function clearSession(movieKey: string) {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(sessionKey(movieKey)); } catch { /* noop */ }
}

/* ------------------------------------------------------------------ */
/* Resumable upload engine                                             */
/* ------------------------------------------------------------------ */

export type UploadStatus =
  | "idle"
  | "uploading"
  | "paused"
  | "resuming"
  | "reconnecting"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type UploadHandle = {
  pause: () => void;
  resume: () => void;
  abort: (removeChunks?: boolean) => Promise<void>;
  isRunning: () => boolean;
};

export type UploadCallbacks = {
  onProgress: (uploaded: number, total: number) => void;
  onStatus: (status: UploadStatus, message?: string) => void;
  onSuccess: (path: string) => void;
  onError: (error: Error) => void;
};

/** Rolling-average speed tracker (stable MB/s instead of a jittery instant value). */
export function createSpeedMeter(windowMs = 12_000) {
  let samples: { t: number; bytes: number }[] = [];
  return {
    reset() { samples = []; },
    push(bytes: number) {
      const t = Date.now();
      samples.push({ t, bytes });
      samples = samples.filter((s) => t - s.t <= windowMs);
    },
    rate() {
      if (samples.length < 2) return 0;
      const first = samples[0]!;
      const last = samples[samples.length - 1]!;
      const dt = (last.t - first.t) / 1000;
      if (dt <= 0) return 0;
      return Math.max(0, (last.bytes - first.bytes) / dt);
    },
  };
}

async function freshAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired. Sign in again to continue the upload.");
  return token;
}

function isRetryableStatus(status: number) {
  // 0 = network failure/offline, 401/403 = token refreshed on next attempt,
  // 409/423 = concurrent lock on the object, 429/5xx = transient server pressure.
  return status === 0 || status === 401 || status === 403 || status === 409 || status === 423 || status === 429 || status >= 500;
}

/**
 * Direct browser-to-storage resumable upload (TUS). Chunks are 6 MB, retried with
 * exponential backoff, and resumed from the last acknowledged byte after any
 * interruption. The entire file is never loaded into memory.
 */
export async function startResumableMovieUpload(
  file: File,
  objectPath: string,
  cb: UploadCallbacks,
): Promise<UploadHandle> {
  const token = await freshAccessToken();
  const projectUrl = import.meta.env.VITE_SUPABASE_URL as string;

  let running = true;
  let userPaused = false;
  let finished = false;

  const upload = new tus.Upload(file, {
    endpoint: `${projectUrl}/storage/v1/upload/resumable`,
    // Exponential backoff — a temporary drop never kills the whole upload.
    retryDelays: [0, 1000, 3000, 7000, 15000, 30000, 45000, 60000, 60000, 60000],
    headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    storeFingerprintForResuming: true,
    metadata: {
      bucketName: MOVIE_VIDEO_BUCKET,
      objectName: objectPath,
      contentType: file.type || "video/mp4",
      cacheControl: "3600",
    },
    chunkSize: CHUNK_SIZE,
    // Fresh token on every single chunk request: long uploads outlive one token.
    onBeforeRequest: async (req) => {
      try {
        const fresh = await freshAccessToken();
        req.setHeader("authorization", `Bearer ${fresh}`);
      } catch {
        /* keep the original token; the retry logic handles a 401 */
      }
    },
    onShouldRetry: (err: any, retryAttempt: number) => {
      if (finished || userPaused) return false;
      const status = err?.originalResponse?.getStatus?.() ?? 0;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        cb.onStatus("reconnecting", "Connection interrupted — retrying…");
        return true;
      }
      if (isRetryableStatus(status)) {
        cb.onStatus(
          "reconnecting",
          status === 0
            ? "Network connection lost. Retrying…"
            : status === 401 || status === 403
              ? "Upload session expired. Recovering…"
              : "Upload server temporarily unavailable. Retrying…",
        );
        return retryAttempt < 9;
      }
      return false;
    },
    onProgress: (sent, total) => {
      if (!userPaused) cb.onStatus("uploading");
      cb.onProgress(sent, total);
    },
    onSuccess: () => {
      finished = true;
      running = false;
      cb.onSuccess(objectPath);
    },
    onError: (err) => {
      running = false;
      cb.onError(err as Error);
    },
  });

  // Recover an interrupted session for the same file (also prevents duplicate uploads).
  const previous = await upload.findPreviousUploads();
  if (previous.length && previous[0]) upload.resumeFromPreviousUpload(previous[0]);
  upload.start();
  cb.onStatus("uploading");

  // Network-aware behaviour: stop trying while offline, continue when back online.
  const onOffline = () => {
    if (finished || userPaused) return;
    cb.onStatus("reconnecting", "Connection interrupted — retrying when the network returns…");
  };
  const onOnline = () => {
    if (finished || userPaused || running) return;
    running = true;
    cb.onStatus("resuming", "Connection restored — resuming upload…");
    upload.start();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
  }
  const cleanup = () => {
    if (typeof window === "undefined") return;
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
  };

  return {
    isRunning: () => running,
    pause: () => {
      userPaused = true;
      running = false;
      upload.abort(false);
      cb.onStatus("paused");
    },
    resume: () => {
      userPaused = false;
      running = true;
      cb.onStatus("resuming");
      upload.start();
    },
    abort: async (removeChunks = true) => {
      finished = true;
      running = false;
      cleanup();
      await upload.abort(removeChunks);
    },
  };
}

/** Confirm the finished object really exists in storage before marking it ready. */
export async function verifyUploadedObject(objectPath: string, expectedSize?: number) {
  const slash = objectPath.lastIndexOf("/");
  const folder = slash > -1 ? objectPath.slice(0, slash) : "";
  const name = slash > -1 ? objectPath.slice(slash + 1) : objectPath;
  const { data, error } = await supabase.storage.from(MOVIE_VIDEO_BUCKET).list(folder, { search: name, limit: 100 });
  if (error) return { ok: false, size: 0, reason: error.message };
  const found = data?.find((o) => o.name === name);
  if (!found) return { ok: false, size: 0, reason: "Uploaded file was not found in storage." };
  const size = Number((found.metadata as any)?.size ?? 0);
  if (expectedSize && size && Math.abs(size - expectedSize) > 1024) {
    return { ok: false, size, reason: "Uploaded file is incomplete." };
  }
  return { ok: true, size, reason: "" };
}

export async function uploadMoviePoster(file: File, objectPath: string) {
  const { error } = await supabase.storage
    .from(MOVIE_POSTER_BUCKET)
    .upload(objectPath, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw error;
  return objectPath;
}

export async function removeMovieObjects(bucket: string, paths: (string | null | undefined)[]) {
  const clean = paths.filter(Boolean) as string[];
  if (!clean.length) return;
  await supabase.storage.from(bucket).remove(clean);
}

const signedCache = new Map<string, { url: string; expires: number }>();

/** Signed URL for a private movie asset. Storage RLS decides who gets one. */
export async function getSignedMovieUrl(bucket: string, path?: string | null, expiresIn = 60 * 60 * 4) {
  if (!path) return null;
  const key = `${bucket}:${path}`;
  const hit = signedCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) return null;
  signedCache.set(key, { url: data.signedUrl, expires: Date.now() + (expiresIn - 60) * 1000 });
  return data.signedUrl;
}

export const getPosterUrl = (path?: string | null) => getSignedMovieUrl(MOVIE_POSTER_BUCKET, path, 60 * 60 * 6);
export const getMovieVideoUrl = (path?: string | null) => getSignedMovieUrl(MOVIE_VIDEO_BUCKET, path, 60 * 60 * 6);
