import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { BookOpen, Radio } from "lucide-react";
import { HeroBanner } from "@/components/HeroBanner";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Dashboard() {
  const { user } = useAuth();

  const { data: enrolled = [] } = useQuery({
    queryKey: ["enrolled", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("progress_percent, batch:batches(*)")
        .eq("student_id", user!.id);
      return data ?? [];
    },
  });

  const { data: recommended = [] } = useQuery({
    queryKey: ["batches-recommended"],
    queryFn: async () => {
      const { data } = await supabase.from("batches").select("*").eq("enrollment_open", true).limit(6);
      return data ?? [];
    },
  });

  return (
    <div className="flex flex-col">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-8 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Student Dashboard</h1>
        <div className="bg-muted px-4 py-1.5 rounded-full flex items-center gap-2">
          <span className="size-2 bg-accent rounded-full animate-pulse" />
          <span className="text-xs font-medium text-muted-foreground">Keep going — every lecture counts.</span>
        </div>
      </header>

      <div className="p-8 max-w-6xl mx-auto w-full space-y-10">
        <HeroBanner />
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight">My Batches</h2>
            <Link to="/batches" className="text-primary text-sm font-medium hover:underline">Browse more</Link>
          </div>
          {enrolled.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <BookOpen className="size-10 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-bold text-lg">No enrollments yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Explore batches and enroll in one to start learning.</p>
              <Button asChild className="mt-4"><Link to="/batches">Browse Batches</Link></Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {enrolled.map((e: any) => e.batch && (
                <div key={e.batch.id} className="bg-card rounded-2xl border border-border overflow-hidden hover:shadow-xl transition-shadow group">
                  <div className="w-full aspect-video bg-muted grid place-items-center relative">
                    {e.batch.thumbnail_url ? (
                      <img src={e.batch.thumbnail_url} alt={e.batch.title} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Course Preview</span>
                    )}
                    <div className="absolute top-3 left-3 flex gap-2 flex-wrap">
                      {(e.batch.subjects ?? []).slice(0, 2).map((s: string) => (
                        <span key={s} className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded uppercase">{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">{e.batch.title}</h3>
                      <p className="text-sm text-muted-foreground mt-1">By {e.batch.mentors ?? "Aditya Faculty"}</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-muted-foreground uppercase tracking-tighter">Progress</span>
                        <span className="text-primary">{e.progress_percent}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${e.progress_percent}%` }} />
                      </div>
                    </div>
                    <Button asChild className="w-full">
                      <Link to="/batches/$batchId" params={{ batchId: e.batch.id }}>Continue Learning</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight">Recommended for You</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recommended.map((b: any) => (
              <Link key={b.id} to="/batches/$batchId" params={{ batchId: b.id }}
                className="bg-card border border-border rounded-xl p-4 space-y-3 hover:shadow-md transition-shadow block">
                <div className="w-full h-24 bg-muted rounded-lg grid place-items-center">
                  <Radio className="size-5 text-muted-foreground" />
                </div>
                <span className="text-[10px] font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded uppercase">{b.class_level}</span>
                <h4 className="font-bold leading-tight">{b.title}</h4>
                <div className="flex items-end gap-2">
                  <span className="text-lg font-bold">{Number(b.discount_price ?? b.price) === 0 ? "FREE" : `₹${b.discount_price ?? b.price}`}</span>
                  {b.discount_price && Number(b.discount_price) < Number(b.price) && (
                    <span className="text-xs text-muted-foreground line-through mb-1">₹{b.price}</span>
                  )}
                </div>
              </Link>
            ))}
            {recommended.length === 0 && (
              <p className="text-sm text-muted-foreground col-span-full">No batches available yet. {`{`}Admin can create them from the Admin Panel.{`}`}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
