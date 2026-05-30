import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { parseVideoUrl } from "@/lib/video";
import { Button } from "@/components/ui/button";

type Props = {
  url?: string | null;
  poster?: string | null;
  initialPosition?: number;
  onProgress?: (positionSeconds: number, durationSeconds: number) => void;
  onEnded?: () => void;
};

export function VideoPlayer({ url, poster, initialPosition = 0, onProgress, onEnded }: Props) {
  const source = parseVideoUrl(url);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(false);
  }, [url, retryKey]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || source.kind !== "file") return;
    const onLoaded = () => {
      setLoading(false);
      if (initialPosition > 0 && initialPosition < v.duration - 5) v.currentTime = initialPosition;
    };
    const onErr = () => { setError(true); setLoading(false); };
    const onTime = () => onProgress?.(v.currentTime, v.duration || 0);
    const onEnd = () => onEnded?.();
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("error", onErr);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnd);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("error", onErr);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnd);
    };
  }, [source.kind, retryKey, initialPosition, onProgress, onEnded]);

  if (source.kind === "invalid") {
    return (
      <div className="aspect-video bg-muted rounded-xl flex flex-col items-center justify-center text-muted-foreground gap-2">
        <AlertTriangle className="size-8" />
        <p className="text-sm font-medium">Video Not Found</p>
        <p className="text-xs">No valid video URL provided.</p>
      </div>
    );
  }

  if (source.kind === "file") {
    return (
      <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
        {loading && !error && (
          <div className="absolute inset-0 grid place-items-center bg-black/40 z-10">
            <Loader2 className="size-8 animate-spin text-white" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-black text-white gap-3 z-10">
            <AlertTriangle className="size-8" />
            <p className="text-sm">Failed to load video.</p>
            <Button size="sm" variant="secondary" onClick={() => setRetryKey((k) => k + 1)}>
              <RotateCcw className="size-4 mr-1" /> Retry
            </Button>
          </div>
        )}
        <video
          key={retryKey}
          ref={videoRef}
          src={source.url}
          poster={poster ?? undefined}
          controls
          controlsList="nodownload"
          playsInline
          className="w-full h-full"
        />
      </div>
    );
  }

  // YouTube / Vimeo / Google Drive — iframe embeds (their players include all standard controls)
  return (
    <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-black/40 z-10 pointer-events-none">
          <Loader2 className="size-8 animate-spin text-white" />
        </div>
      )}
      <iframe
        key={retryKey}
        src={source.embedUrl}
        title="Lecture video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        onLoad={() => setLoading(false)}
        className="w-full h-full border-0"
      />
    </div>
  );
}
