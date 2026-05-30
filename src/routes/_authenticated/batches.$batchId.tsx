import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PlayCircle, Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/batches/$batchId")({ component: BatchDetail });

function BatchDetail() {
  const { batchId } = Route.useParams();

  const { data: batch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => {
      const { data } = await supabase.from("batches").select("*").eq("id", batchId).maybeSingle();
      return data;
    },
  });

  const { data: lectures = [] } = useQuery({
    queryKey: ["lectures", batchId],
    queryFn: async () => {
      const { data } = await supabase.from("lectures").select("*, materials(*)").eq("batch_id", batchId).order("order_index");
      return data ?? [];
    },
  });

  if (!batch) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="flex flex-col">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-8 flex items-center gap-3">
        <Link to="/batches"><Button variant="ghost" size="sm"><ArrowLeft className="size-4" /></Button></Link>
        <h1 className="text-lg font-semibold truncate">{batch.title}</h1>
      </header>
      <div className="p-8 max-w-5xl mx-auto w-full space-y-6">
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex gap-2 mb-3">
            <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded uppercase">{batch.class_level}</span>
            {(batch.subjects ?? []).map((s: string) => (
              <span key={s} className="bg-muted text-muted-foreground text-xs font-bold px-2 py-1 rounded uppercase">{s}</span>
            ))}
          </div>
          <h2 className="text-2xl font-bold">{batch.title}</h2>
          <p className="text-muted-foreground mt-1">{batch.description}</p>
          <p className="text-sm mt-3"><span className="font-semibold">Mentors:</span> {batch.mentors ?? "—"}</p>
        </div>

        <div>
          <h3 className="text-xl font-bold mb-3">Lectures ({lectures.length})</h3>
          <div className="space-y-2">
            {lectures.map((l: any) => (
              <Link
                key={l.id}
                to="/lectures/$lectureId"
                params={{ lectureId: l.id }}
                className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary transition-colors"
              >
                {l.is_live ? <Radio className="size-5 text-destructive" /> : <PlayCircle className="size-5 text-primary" />}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold truncate flex items-center gap-2">
                    {l.title}
                    {l.is_free && <span className="bg-accent/10 text-accent font-bold px-2 py-0.5 rounded uppercase text-[10px]">Free</span>}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {l.is_live ? `Live • ${l.scheduled_at ? new Date(l.scheduled_at).toLocaleString() : "TBD"}` : `${l.duration_minutes ?? 0} min`}
                    {l.materials?.length > 0 && ` • ${l.materials.length} material${l.materials.length > 1 ? "s" : ""}`}
                  </p>
                </div>
                <Button size="sm">Watch</Button>
              </Link>
            ))}
            {lectures.length === 0 && <p className="text-sm text-muted-foreground">No lectures uploaded yet.</p>}
          </div>

        </div>
      </div>
    </div>
  );
}
