import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ChevronRight, FileText, Lock, PlayCircle, Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/batches/$batchId/chapters/$chapterId")({
  component: ChapterLecturesPage,
});

function ChapterLecturesPage() {
  const { batchId, chapterId } = Route.useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "admin";

  const { data: batch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => (await supabase.from("batches").select("*").eq("id", batchId).maybeSingle()).data,
  });

  const { data: chapter } = useQuery({
    queryKey: ["chapter", chapterId],
    queryFn: async () => (await (supabase.from as any)("chapters").select("*, subjects(name, icon)").eq("id", chapterId).maybeSingle()).data,
  });

  const { data: enrollment } = useQuery({
    queryKey: ["enrollment-check", batchId, user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("enrollments").select("id").eq("student_id", user!.id).eq("batch_id", batchId).maybeSingle()).data,
  });

  const { data: lectures = [], isLoading } = useQuery({
    queryKey: ["chapter-lectures", chapterId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lectures")
        .select("*, materials(*)")
        .eq("chapter_id", chapterId)
        .order("order_index");
      return data ?? [];
    },
  });

  const price = Number(batch?.discount_price ?? batch?.price ?? 0);
  const hasAccess = isAdmin || price === 0 || !!enrollment;

  return (
    <div className="flex flex-col">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-4 md:px-8 flex items-center gap-3">
        <Link to="/batches/$batchId" params={{ batchId }}>
          <Button variant="ghost" size="sm"><ArrowLeft className="size-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">{chapter?.subjects?.name ?? batch?.title}</p>
          <h1 className="text-lg font-semibold truncate">{chapter?.title ?? "Chapter"}</h1>
        </div>
      </header>

      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-4">
        {!hasAccess && (
          <div className="bg-muted/30 border border-dashed border-border rounded-xl p-5 text-center">
            <Lock className="size-7 mx-auto mb-2 text-muted-foreground" />
            <p className="font-semibold">Purchase this batch to watch all lectures.</p>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
        ) : lectures.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
            No lectures in this chapter yet.
          </div>
        ) : (
          <div className="space-y-2">
            {lectures.map((l: any) => {
              const unlocked = hasAccess || l.is_free;
              return (
                <div
                  key={l.id}
                  className={`bg-card border border-border rounded-xl p-4 flex items-start gap-4 ${unlocked ? "hover:border-primary transition-colors" : "opacity-60"}`}
                >
                  {l.is_live ? <Radio className="size-5 text-destructive shrink-0 mt-0.5" /> :
                    unlocked ? <PlayCircle className="size-5 text-primary shrink-0 mt-0.5" /> :
                    <Lock className="size-5 text-muted-foreground shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold flex items-center gap-2 flex-wrap">
                      <span className="truncate">{l.title}</span>
                      {l.is_free && <span className="bg-accent/10 text-accent font-bold px-2 py-0.5 rounded uppercase text-[10px]">Free</span>}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {l.is_live ? `Live • ${l.scheduled_at ? new Date(l.scheduled_at).toLocaleString() : "TBD"}` : `${l.duration_minutes ?? 0} min`}
                      {l.materials?.length > 0 && ` • ${l.materials.length} note${l.materials.length > 1 ? "s" : ""}`}
                    </p>
                    {l.materials?.length > 0 && unlocked && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {l.materials.map((m: any) => (
                          <a key={m.id} href={m.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                            <FileText className="size-3" /> {m.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={unlocked ? "default" : "outline"}
                    disabled={!unlocked}
                    onClick={() => navigate({ to: "/lectures/$lectureId", params: { lectureId: l.id } })}
                    className="shrink-0"
                  >
                    {unlocked ? <>Watch <ChevronRight className="size-4 ml-1" /></> : "Locked"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
