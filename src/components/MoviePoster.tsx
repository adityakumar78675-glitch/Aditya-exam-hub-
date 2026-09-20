import { useEffect, useState } from "react";
import { Clapperboard } from "lucide-react";
import { getPosterUrl } from "@/lib/movie-upload";

type Props = {
  posterPath?: string | null;
  posterUrl?: string | null;
  title: string;
  className?: string;
};

/** Lazy-loaded poster. Private storage paths are resolved to short-lived signed URLs. */
export function MoviePoster({ posterPath, posterUrl, title, className = "" }: Props) {
  const [src, setSrc] = useState<string | null>(posterUrl ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    if (posterUrl) { setSrc(posterUrl); return; }
    setSrc(null);
    if (posterPath) {
      getPosterUrl(posterPath).then((u) => { if (alive) setSrc(u); });
    }
    return () => { alive = false; };
  }, [posterPath, posterUrl]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-muted ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={`${title} poster`}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="w-full h-full grid place-items-center bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
          <Clapperboard className="size-8" />
        </div>
      )}
    </div>
  );
}
