// Movie assets: resumable (chunked) video upload up to 5 GB + poster upload.
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

export const MOVIE_VIDEO_BUCKET = "movie-videos";
export const MOVIE_POSTER_BUCKET = "movie-posters";
export const MAX_MOVIE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
export const MAX_POSTER_BYTES = 10 * 1024 * 1024; // 10 MB
const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB chunks (resumable requirement)

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
  if (m < 60) return `${m} min${s ? ` ${s} sec` : ""}`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

export function formatDuration(minutes?: number | null) {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function validateMovieFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okType = ACCEPTED_MOVIE_TYPES.includes(file.type) || ACCEPTED_MOVIE_EXT.includes(ext);
  if (!okType) return "Only MP4, WebM, MOV and MKV videos are supported.";
  if (file.size > MAX_MOVIE_BYTES) return "Maximum movie size is 5 GB.";
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

export type UploadHandle = {
  pause: () => void;
  resume: () => void;
  abort: (removeChunks?: boolean) => Promise<void>;
};

export type UploadCallbacks = {
  onProgress: (uploaded: number, total: number) => void;
  onSuccess: (path: string) => void;
  onError: (error: Error) => void;
};

/**
 * Direct-to-storage resumable upload (TUS). Bytes never pass through the app server,
 * chunks retry automatically and interrupted uploads resume from the last chunk.
 */
export async function startResumableMovieUpload(
  file: File,
  objectPath: string,
  cb: UploadCallbacks,
): Promise<UploadHandle> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("You must be signed in to upload.");

  const projectUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const upload = new tus.Upload(file, {
    endpoint: `${projectUrl}/storage/v1/upload/resumable`,
    retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000],
    headers: { authorization: `Bearer ${token}`, "x-upsert": "true" },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    metadata: {
      bucketName: MOVIE_VIDEO_BUCKET,
      objectName: objectPath,
      contentType: file.type || "video/mp4",
      cacheControl: "3600",
    },
    chunkSize: CHUNK_SIZE,
    onProgress: (sent, total) => cb.onProgress(sent, total),
    onSuccess: () => cb.onSuccess(objectPath),
    onError: (err) => cb.onError(err as Error),
  });

  // Resume an interrupted upload of the same file when one exists (prevents duplicate uploads).
  const previous = await upload.findPreviousUploads();
  if (previous.length && previous[0]) upload.resumeFromPreviousUpload(previous[0]);
  upload.start();

  return {
    pause: () => upload.abort(false),
    resume: () => upload.start(),
    abort: async (removeChunks = true) => { await upload.abort(removeChunks); },
  };
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
