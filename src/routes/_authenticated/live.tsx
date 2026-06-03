import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, Calendar, PlayCircle, ExternalLink } from "lucide-react";
import { VideoPlayer } from "@/components/VideoPlayer";
import { parseVideoUrl } from "@/lib/video";

export const Route = createFileRoute("/_authenticated/live")({ component: LivePage });

type LiveClass = {
  id: string;
  batch_id: string;
  title: string;
  teacher: string | null;
  subject: string | null;
  thumbnail_url: string | null;
  stream_url: string | null;
  status: "scheduled" | "live" | "ended";
  scheduled_at: string | null;
};

function LivePage() {
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["live-classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("live_classes")
        .select("*")
        .in("status", ["scheduled", "live"])
        .order("status", { ascending: true })
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LiveClass[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("live-classes-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_classes" },
        () => qc.invalidateQueries({ queryKey: ["live-classes"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const live = useMemo(() => items.filter((i) => i.status === "live"), [items]);
  const upcoming = useMemo(() => items.filter((i) => i.status === "scheduled"), [items]);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto w-full space-y-8">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Radio className="size-6 text-destructive" /> Live Classes
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">Updates in real time as new streams go live.</p>
      </header>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-4">
          {[0, 1].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase text-muted-foreground tracking-wide">Now Live</h2>
            {live.length === 0 ? (
              <p className="text-sm text-muted-foreground">No streams are live right now.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {live.map((l) => <LiveCard key={l.id} item={l} />)}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase text-muted-foreground tracking-wide">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming classes scheduled.</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {upcoming.map((l) => <UpcomingCard key={l.id} item={l} />)}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function LiveCard({ item }: { item: LiveClass }) {
  const src = parseVideoUrl(item.stream_url);
  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="aspect-video bg-black relative">
        {item.stream_url ? (
          src.kind === "file" ? (
            <VideoPlayer url={item.stream_url} poster={item.thumbnail_url} />
          ) : item.thumbnail_url ? (
            <img src={item.thumbnail_url} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <PlayCircle className="size-12" />
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">No stream URL</div>
        )}
        <span className="absolute top-3 left-3 bg-destructive text-destructive-foreground text-[10px] font-bold uppercase px-2 py-1 rounded flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-current animate-pulse" /> Live
        </span>
      </div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold">{item.title}</h3>
        <p className="text-xs text-muted-foreground">
          {item.teacher ?? "—"}{item.subject ? ` • ${item.subject}` : ""}
        </p>
        {item.stream_url && src.kind !== "file" && (
          <Button asChild size="sm" className="w-full">
            <a href={item.stream_url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4 mr-1" /> Join Live
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

function UpcomingCard({ item }: { item: LiveClass }) {
  const when = item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : "TBA";
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex gap-4">
      {item.thumbnail_url ? (
        <img src={item.thumbnail_url} alt={item.title} className="size-20 rounded-xl object-cover" />
      ) : (
        <div className="size-20 rounded-xl bg-muted flex items-center justify-center"><Calendar className="size-6 text-muted-foreground" /></div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold truncate">{item.title}</h3>
        <p className="text-xs text-muted-foreground">{item.teacher ?? "—"}{item.subject ? ` • ${item.subject}` : ""}</p>
        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Calendar className="size-3" /> {when}</p>
      </div>
    </div>
  );
}
