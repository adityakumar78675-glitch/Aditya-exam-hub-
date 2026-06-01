import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import { VideoPlayer } from "@/components/VideoPlayer";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/lectures/$lectureId")({
  component: LecturePage,
});

function LecturePage() {
  const { lectureId } = Route.useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "admin";

  const { data: lecture, isLoading } = useQuery({
    queryKey: ["lecture", lectureId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lectures")
        .select("*, batch:batches(id, title, price, discount_price), materials(*)")
        .eq("id", lectureId)
        .maybeSingle();
      return data;
    },
  });

  const { data: enrollment } = useQuery({
    queryKey: ["enrollment-check", lectureId, user?.id],
    enabled: !!user && !!lecture?.batch?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", user!.id)
        .eq("batch_id", lecture!.batch.id)
        .maybeSingle();
      return data;
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["lecture-progress", lectureId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("lecture_progress")
        .select("*")
        .eq("student_id", user!.id)
        .eq("lecture_id", lectureId)
        .maybeSingle();
      return data;
    },
  });

  const saveProgress = useMutation({
    mutationFn: async (vals: { position: number; percent: number; completed: boolean }) => {
      if (!user) return;
      await supabase.from("lecture_progress").upsert(
        {
          student_id: user.id,
          lecture_id: lectureId,
          position_seconds: Math.floor(vals.position),
          watch_percent: vals.percent,
          completed: vals.completed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,lecture_id" }
      );
    },
  });

  const lastSavedRef = useRef(0);
  const handleProgress = (pos: number, dur: number) => {
    if (isAdmin || !user || !dur) return;
    const now = Date.now();
    if (now - lastSavedRef.current < 5000) return;
    lastSavedRef.current = now;
    const percent = Math.min(100, Math.round((pos / dur) * 100));
    saveProgress.mutate({ position: pos, percent, completed: percent >= 95 });
  };

  const markComplete = () => {
    saveProgress.mutate({ position: 0, percent: 100, completed: true });
    toast.success("Marked as completed");
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading lecture...</div>;
  if (!lecture) return (
    <div className="p-8 max-w-xl mx-auto text-center space-y-3">
      <Lock className="size-10 mx-auto text-muted-foreground" />
      <h2 className="text-xl font-bold">Lecture unavailable</h2>
      <p className="text-sm text-muted-foreground">You may need to enroll in the batch to access this lecture.</p>
      <Button onClick={() => navigate({ to: "/batches" })}>Browse batches</Button>
    </div>
  );

  const batchPrice = Number(lecture.batch?.discount_price ?? lecture.batch?.price ?? 0);
  const isFreeBatch = batchPrice === 0;
  const hasAccess = isAdmin || lecture.is_free || isFreeBatch || !!enrollment;

  return (
    <div className="flex flex-col">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-4 md:px-8 flex items-center gap-3">
        <Link to="/batches/$batchId" params={{ batchId: lecture.batch?.id ?? "" }}>
          <Button variant="ghost" size="sm"><ArrowLeft className="size-4" /></Button>
        </Link>
        <h1 className="text-lg font-semibold truncate">{lecture.title}</h1>
        {isAdmin && <span className="ml-auto text-[10px] uppercase font-bold text-accent bg-accent/10 px-2 py-1 rounded">Admin preview</span>}
      </header>

      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-5">
        {!hasAccess ? (
          <div className="aspect-video bg-muted rounded-xl flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Lock className="size-10 text-muted-foreground" />
            <h2 className="text-lg font-bold">This lecture is locked</h2>
            <p className="text-sm text-muted-foreground">Enroll in {lecture.batch?.title} to watch.</p>
            <Button onClick={() => navigate({ to: "/batches/$batchId", params: { batchId: lecture.batch?.id ?? "" } })}>
              Buy Batch — ₹{batchPrice}
            </Button>
          </div>
        ) : (
          <VideoPlayer
            url={lecture.video_url}
            poster={lecture.thumbnail_url}
            initialPosition={progress?.position_seconds ?? 0}
            onProgress={handleProgress}
            onEnded={() => saveProgress.mutate({ position: 0, percent: 100, completed: true })}
          />
        )}

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl md:text-2xl font-bold">{lecture.title}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {lecture.duration_minutes ?? 0} min
              {lecture.is_free && <span className="ml-2 bg-accent/10 text-accent font-bold px-2 py-0.5 rounded uppercase text-[10px]">Free</span>}
              {progress?.completed && <span className="ml-2 inline-flex items-center gap-1 text-accent font-semibold"><CheckCircle2 className="size-3" /> Completed</span>}
            </p>
            {lecture.description && <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{lecture.description}</p>}
          </div>
          {hasAccess && !isAdmin && !progress?.completed && (
            <Button variant="outline" onClick={markComplete}><CheckCircle2 className="size-4 mr-1" /> Mark complete</Button>
          )}
        </div>

        {lecture.materials && lecture.materials.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-bold mb-3">Study Materials</h3>
            <div className="space-y-2">
              {lecture.materials.map((m: any) => (
                <a key={m.id} href={m.file_url} target="_blank" rel="noreferrer"
                   className="flex items-center gap-2 text-sm hover:text-primary">
                  📄 {m.title} <span className="text-xs text-muted-foreground uppercase">({m.file_type})</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
