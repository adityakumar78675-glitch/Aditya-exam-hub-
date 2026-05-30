// Detect & normalize video URLs for embed/native playback.
export type VideoSource =
  | { kind: "youtube"; embedUrl: string; id: string }
  | { kind: "vimeo"; embedUrl: string; id: string }
  | { kind: "gdrive"; embedUrl: string; id: string }
  | { kind: "file"; url: string }
  | { kind: "invalid" };

export function parseVideoUrl(raw?: string | null): VideoSource {
  if (!raw) return { kind: "invalid" };
  const url = raw.trim();
  if (!url) return { kind: "invalid" };

  // YouTube
  const yt =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/);
  if (yt) {
    return {
      kind: "youtube",
      id: yt[1],
      embedUrl: `https://www.youtube.com/embed/${yt[1]}?rel=0&modestbranding=1`,
    };
  }

  // Vimeo
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) {
    return {
      kind: "vimeo",
      id: vm[1],
      embedUrl: `https://player.vimeo.com/video/${vm[1]}`,
    };
  }

  // Google Drive
  const gd = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([\w-]+)/);
  if (gd) {
    return {
      kind: "gdrive",
      id: gd[1],
      embedUrl: `https://drive.google.com/file/d/${gd[1]}/preview`,
    };
  }

  // Direct video file
  if (/^https?:\/\//i.test(url)) return { kind: "file", url };
  return { kind: "invalid" };
}
