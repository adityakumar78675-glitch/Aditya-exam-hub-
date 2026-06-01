import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookOpen, ChevronRight, FileText, PlayCircle, Radio, Lock, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/batches/$batchId")({ component: BatchDetail });

const LOAD_TIMEOUT_MS = 5000;

function withTimeout<T>(task: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve(task),
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} took more than 5 seconds. Please retry.`)), LOAD_TIMEOUT_MS);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function getLectureSubject(lecture: any, fallback: string) {
  return lecture.subject || lecture.subject_name || fallback || "All Lectures";
}

function getLectureChapter(lecture: any) {
  return lecture.chapter_title || lecture.chapter || "Lectures";
}

function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
      <div className="bg-card border border-border rounded-xl p-6 text-center space-y-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex justify-center gap-2 flex-wrap">
          <Button variant="outline" onClick={onRetry}><RefreshCcw className="size-4 mr-1" /> Retry</Button>
          <Button asChild><Link to="/batches">Browse batches</Link></Button>
        </div>
      </div>
    </div>
  );
}

function BatchDetail() {
  const { batchId } = Route.useParams();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const { data: batch, isLoading: batchLoading } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("*").eq("id", batchId).maybeSingle();
      console.log("[BatchDetail] batchId:", batchId, "data:", data, "error:", error);
      return data;
    },
  });

  const { data: enrollment, isLoading: enrollLoading } = useQuery({
    queryKey: ["enrollment-check", batchId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", user!.id)
        .eq("batch_id", batchId)
        .maybeSingle();
      console.log("[BatchDetail] enrollment:", data);
      return data;
    },
  });

  const batchPrice = Number(batch?.discount_price ?? batch?.price ?? 0);
  const isFreeBatch = batchPrice === 0;
  const hasAccess = isAdmin || isFreeBatch || !!enrollment;
  console.log("[BatchDetail] userId:", user?.id, "isAdmin:", isAdmin, "hasAccess:", hasAccess);

  const { data: lectures = [], isLoading: lecturesLoading } = useQuery({
    queryKey: ["lectures", batchId],
    enabled: !!batch,
    queryFn: async () => {
      const { data } = await supabase
        .from("lectures")
        .select("*, materials(*)")
        .eq("batch_id", batchId)
        .order("order_index");
      return data ?? [];
    },
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("enrollments").insert({ student_id: user!.id, batch_id: batchId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolled!");
      qc.invalidateQueries({ queryKey: ["enrollment-check"] });
      qc.invalidateQueries({ queryKey: ["my-enroll-ids"] });
      qc.invalidateQueries({ queryKey: ["enrolled"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (batchLoading || enrollLoading) {
    return (
      <div className="p-8 space-y-4 max-w-5xl mx-auto w-full">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center space-y-3">
        <h2 className="text-xl font-bold">Batch not found</h2>
        <p className="text-muted-foreground text-sm">This batch may have been removed.</p>
        <Button asChild><Link to="/batches">Browse batches</Link></Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-4 md:px-8 flex items-center gap-3">
        <Link to="/batches"><Button variant="ghost" size="sm"><ArrowLeft className="size-4" /></Button></Link>
        <h1 className="text-lg font-semibold truncate">{batch.title}</h1>
      </header>
      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-6">
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex gap-2 mb-3 flex-wrap">
            <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded uppercase">{batch.class_level}</span>
            {(batch.subjects ?? []).map((s: string) => (
              <span key={s} className="bg-muted text-muted-foreground text-xs font-bold px-2 py-1 rounded uppercase">{s}</span>
            ))}
            {hasAccess && !isAdmin && <span className="bg-accent/10 text-accent text-xs font-bold px-2 py-1 rounded uppercase">Enrolled</span>}
          </div>
          <h2 className="text-2xl font-bold">{batch.title}</h2>
          <p className="text-muted-foreground mt-1">{batch.description}</p>
          <p className="text-sm mt-3"><span className="font-semibold">Mentors:</span> {batch.mentors ?? "—"}</p>
          {!hasAccess && (
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-semibold">Price</p>
                <p className="text-2xl font-bold">₹{batchPrice}</p>
              </div>
              <Button
                size="lg"
                disabled={!batch.enrollment_open || enroll.isPending}
                onClick={() => enroll.mutate()}
              >
                {batch.enrollment_open ? "Buy Now / Enroll" : "Enrollment Closed"}
              </Button>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xl font-bold mb-3">Lectures{lectures.length ? ` (${lectures.length})` : ""}</h3>
          {!hasAccess && !isAdmin && (
            <div className="bg-muted/30 border border-dashed border-border rounded-xl p-6 text-center mb-3">
              <Lock className="size-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-semibold">Please purchase this batch to continue.</p>
              <p className="text-sm text-muted-foreground mt-1">Free lectures (if any) are listed below.</p>
            </div>
          )}
          {lecturesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <div className="space-y-2">
              {lectures.map((l: any) => {
                const lectureUnlocked = hasAccess || l.is_free;
                const inner = (
                  <>
                    {l.is_live ? <Radio className="size-5 text-destructive shrink-0" /> :
                      lectureUnlocked ? <PlayCircle className="size-5 text-primary shrink-0" /> :
                      <Lock className="size-5 text-muted-foreground shrink-0" />}
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
                    <span className="text-xs font-semibold text-primary shrink-0">{lectureUnlocked ? "Watch →" : "Locked"}</span>
                  </>
                );
                return lectureUnlocked ? (
                  <Link
                    key={l.id}
                    to="/lectures/$lectureId"
                    params={{ lectureId: l.id }}
                    className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary transition-colors"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div
                    key={l.id}
                    className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 opacity-60 cursor-not-allowed"
                  >
                    {inner}
                  </div>
                );
              })}
              {lectures.length === 0 && <p className="text-sm text-muted-foreground">No lectures uploaded yet.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
