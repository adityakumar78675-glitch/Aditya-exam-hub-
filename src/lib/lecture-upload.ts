// Resumable (chunked) lecture video upload to private cloud storage via TUS.
import * as tus from "tus-js-client";
import { supabase } from "@/integrations/supabase/client";

export const LECTURE_BUCKET = "lecture-videos";
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; // 1 GB
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-quicktime"];
const CHUNK_SIZE = 6 * 1024 * 1024; // 6MB chunks (Supabase resumable requirement)

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatEta(seconds: number) {
  if (!isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)} sec`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m} min${s ? ` ${s} sec` : ""}`;
  return `${Math.floor(m / 60)} hr ${m % 60} min`;
}

export function validateVideoFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const okType = ACCEPTED_VIDEO_TYPES.includes(file.type) || ["mp4", "webm", "mov"].includes(ext);
  if (!okType) return "Only MP4, WebM and MOV videos are supported.";
  if (file.size > MAX_VIDEO_BYTES) return "Maximum lecture video size is 1 GB.";
  if (file.size === 0) return "This file appears to be empty.";
  return null;
}

/** Read duration (seconds) + a poster frame from a local video file. */
export function probeVideo(file: File): Promise<{ durationSeconds: number; thumbnail: Blob | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    let done = false;
    const finish = (durationSeconds: number, thumbnail: Blob | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve({ durationSeconds, thumbnail });
    };
    video.onloadedmetadata = () => {
      const duration = isFinite(video.duration) ? video.duration : 0;
      const seekTo = Math.min(Math.max(duration * 0.1, 1), Math.max(duration - 0.5, 0.5));
      video.currentTime = seekTo;
      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = Math.min(video.videoWidth || 1280, 1280);
          canvas.height = Math.round(canvas.width * ((video.videoHeight || 720) / (video.videoWidth || 1280)));
          canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => finish(duration, blob), "image/jpeg", 0.8);
        } catch {
          finish(duration, null);
        }
      };
      setTimeout(() => finish(duration, null), 8000);
    };
    video.onerror = () => finish(0, null);
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

/** Starts a resumable upload. Interrupted uploads resume from the last chunk (fingerprint stored in localStorage). */
export async function startResumableUpload(
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
    retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
    headers: {
      authorization: `Bearer ${token}`,
      "x-upsert": "true",
    },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    metadata: {
      bucketName: LECTURE_BUCKET,
      objectName: objectPath,
      contentType: file.type || "video/mp4",
      cacheControl: "3600",
    },
    chunkSize: CHUNK_SIZE,
    onProgress: (sent, total) => cb.onProgress(sent, total),
    onSuccess: () => cb.onSuccess(objectPath),
    onError: (err) => cb.onError(err as Error),
  });

  // Resume a previous interrupted upload of the same file when one exists.
  const previous = await upload.findPreviousUploads();
  if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
  upload.start();

  return {
    pause: () => upload.abort(false),
    resume: () => upload.start(),
    abort: async (removeChunks = true) => {
      await upload.abort(removeChunks);
    },
  };
}

export async function uploadThumbnail(blob: Blob, objectPath: string) {
  const { error } = await supabase.storage
    .from(LECTURE_BUCKET)
    .upload(objectPath, blob, { contentType: blob.type || "image/jpeg", upsert: true });
  if (error) throw error;
  return objectPath;
}

export async function removeStorageObjects(paths: (string | null | undefined)[]) {
  const clean = paths.filter(Boolean) as string[];
  if (!clean.length) return;
  await supabase.storage.from(LECTURE_BUCKET).remove(clean);
}

/** Signed URL for a private lecture asset. Storage RLS decides who gets one. */
export async function getSignedLectureUrl(path?: string | null, expiresIn = 60 * 60 * 4) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(LECTURE_BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}
