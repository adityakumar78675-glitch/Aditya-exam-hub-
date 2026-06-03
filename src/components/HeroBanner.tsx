import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  button_text: string | null;
  redirect_url: string | null;
};

export function HeroBanner() {
  const navigate = useNavigate();
  const { data: banners = [] } = useQuery({
    queryKey: ["homepage-banners"],
    queryFn: async () => {
      const { data } = await supabase
        .from("homepage_banners")
        .select("id, title, subtitle, image_url, button_text, redirect_url")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      return (data ?? []) as Banner[];
    },
  });

  const [idx, setIdx] = useState(0);
  const touchStart = useRef<number | null>(null);

  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length]);

  if (!banners.length) return null;

  const go = (delta: number) => setIdx((i) => (i + delta + banners.length) % banners.length);

  const handleClick = (b: Banner) => {
    if (!b.redirect_url) return;
    if (b.redirect_url.startsWith("http")) {
      window.open(b.redirect_url, "_blank");
    } else {
      navigate({ to: b.redirect_url });
    }
  };

  return (
    <section className="w-full">
      <div
        className="relative overflow-hidden rounded-2xl md:rounded-3xl shadow-xl"
        onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchStart.current == null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          if (Math.abs(dx) > 40) go(dx > 0 ? -1 : 1);
          touchStart.current = null;
        }}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {banners.map((b) => (
            <div key={b.id} className="min-w-full">
              <div className="relative aspect-[16/7] md:aspect-[21/8] bg-gradient-to-br from-primary via-primary/80 to-accent">
                {b.image_url && (
                  <img
                    src={b.image_url}
                    alt={b.title}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover opacity-90"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
                <div className="relative z-10 h-full flex flex-col justify-center px-5 md:px-12 max-w-2xl">
                  <h2 className="text-white text-2xl md:text-5xl font-extrabold tracking-tight leading-tight drop-shadow-lg">
                    {b.title}
                  </h2>
                  {b.subtitle && (
                    <p className="mt-2 md:mt-4 text-white/90 text-sm md:text-lg font-medium drop-shadow">
                      {b.subtitle}
                    </p>
                  )}
                  {b.button_text && (
                    <div className="mt-4 md:mt-6">
                      <Button
                        size="lg"
                        onClick={() => handleClick(b)}
                        className="bg-white text-primary hover:bg-white/90 font-bold shadow-lg"
                      >
                        {b.button_text}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {banners.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              aria-label="Previous banner"
              className="hidden md:grid place-items-center absolute left-3 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/80 hover:bg-white text-foreground shadow"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Next banner"
              className="hidden md:grid place-items-center absolute right-3 top-1/2 -translate-y-1/2 size-10 rounded-full bg-white/80 hover:bg-white text-foreground shadow"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
              {banners.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to banner ${i + 1}`}
                  className={`h-2 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-2 bg-white/50"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
