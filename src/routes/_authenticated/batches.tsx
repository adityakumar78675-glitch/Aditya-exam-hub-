import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/batches")({ component: BatchesPage });

function BatchesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: batches = [] } = useQuery({
    queryKey: ["batches-all"],
    queryFn: async () => {
      const { data } = await supabase.from("batches").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: myEnrolls = [] } = useQuery({
    queryKey: ["my-enroll-ids", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("enrollments").select("batch_id").eq("student_id", user!.id);
      return (data ?? []).map((r) => r.batch_id);
    },
  });

  const enroll = useMutation({
    mutationFn: async (batchId: string) => {
      const { error } = await supabase.from("enrollments").insert({ student_id: user!.id, batch_id: batchId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolled!");
      qc.invalidateQueries({ queryKey: ["my-enroll-ids"] });
      qc.invalidateQueries({ queryKey: ["enrolled"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-8 flex items-center">
        <h1 className="text-lg font-semibold">Browse Batches</h1>
      </header>
      <div className="p-8 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {batches.map((b: any) => {
            const enrolled = myEnrolls.includes(b.id);
            return (
              <div key={b.id} className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
                <div className="aspect-video bg-muted grid place-items-center">
                  {b.thumbnail_url ? <img src={b.thumbnail_url} alt={b.title} className="w-full h-full object-cover" /> :
                    <span className="text-xs text-muted-foreground uppercase">Course Preview</span>}
                </div>
                <div className="p-5 flex flex-col flex-1 gap-3">
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded uppercase">{b.class_level}</span>
                    {(b.subjects ?? []).slice(0, 2).map((s: string) => (
                      <span key={s} className="bg-muted text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded uppercase">{s}</span>
                    ))}
                  </div>
                  <h3 className="font-bold text-lg leading-tight">{b.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">{b.description}</p>
                  <div className="flex items-end gap-2 mt-auto">
                    <span className="text-xl font-bold">{Number(b.discount_price ?? b.price) === 0 ? "FREE" : `₹${b.discount_price ?? b.price}`}</span>
                    {b.discount_price && Number(b.discount_price) < Number(b.price) && (
                      <span className="text-sm text-muted-foreground line-through mb-0.5">₹{b.price}</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Link to="/batches/$batchId" params={{ batchId: b.id }} className="flex-1">
                      <Button variant="outline" className="w-full">View</Button>
                    </Link>
                    {enrolled ? (
                      <Button disabled className="flex-1">Enrolled</Button>
                    ) : (
                      <Button onClick={() => enroll.mutate(b.id)} disabled={!b.enrollment_open || enroll.isPending} className="flex-1">
                        {b.enrollment_open ? "Enroll" : "Closed"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {batches.length === 0 && <p className="text-muted-foreground col-span-full">No batches yet.</p>}
        </div>
      </div>
    </div>
  );
}
