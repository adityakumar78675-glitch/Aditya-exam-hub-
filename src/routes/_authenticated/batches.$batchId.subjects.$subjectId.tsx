import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, BookOpen, ChevronRight, FileText, PlayCircle, Search, Lock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/batches/$batchId/subjects/$subjectId")({
  component: SubjectChaptersPage,
});

function SubjectChaptersPage() {
  const { batchId, subjectId } = Route.useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");

  const { data: batch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => (await supabase.from("batches").select("*").eq("id", batchId).maybeSingle()).data,
  });

  const { data: subject, isLoading: subjectLoading } = useQuery({
    queryKey: ["subject", subjectId],
    queryFn: async () => (await (supabase.from as any)("subjects").select("*").eq("id", subjectId).maybeSingle()).data,
  });

  const { data: enrollment } = useQuery({
    queryKey: ["enrollment-check", batchId, user?.id],
    enabled: !!user,
    queryFn: async () =>
      (await supabase.from("enrollments").select("id").eq("student_id", user!.id).eq("batch_id", batchId).maybeSingle()).data,
  });

  const { data: chapters = [], isLoading: chaptersLoading } = useQuery({
    queryKey: ["subject-chapters", subjectId],
    queryFn: async () => {
      const { data } = await (supabase.from as any)("chapters").select("*").eq("subject_id", subjectId).order("sort_order");
      return data ?? [];
    },
  });

  const { data: lectures = [] } = useQuery({
    queryKey: ["subject-lectures", subjectId, batchId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lectures")
        .select("id, title, chapter_id, video_url, materials(id)")
        .eq("batch_id", batchId)
        .eq("subject_id", subjectId);
      return data ?? [];
    },
  });

  const price = Number(batch?.discount_price ?? batch?.price ?? 0);
  const hasAccess = isAdmin || price === 0 || !!enrollment;

  const enriched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chapters
      .map((c: any) => {
        const chLectures = lectures.filter((l: any) => l.chapter_id === c.id);
        const videoCount = chLectures.filter((l: any) => l.video_url).length;
        const notesCount = chLectures.reduce((sum: number, l: any) => sum + (l.materials?.length ?? 0), 0);
        return { ...c, videoCount, lectureCount: chLectures.length, notesCount };
      })
      .filter((c: any) => !q || c.title.toLowerCase().includes(q));
  }, [chapters, lectures, search]);

  const loading = subjectLoading || chaptersLoading;

  return (
    <div className="flex flex-col">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-4 md:px-8 flex items-center gap-3">
        <Link to="/batches/$batchId" params={{ batchId }}>
          <Button variant="ghost" size="sm"><ArrowLeft className="size-4" /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground truncate">{batch?.title}</p>
          <h1 className="text-lg font-semibold truncate flex items-center gap-2">
            {subject?.icon && <span>{subject.icon}</span>}
            {subject?.name ?? "Subject"}
          </h1>
        </div>
      </header>

      <div className="p-4 md:p-8 max-w-5xl mx-auto w-full space-y-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chapters…"
            className="pl-9 h-11 rounded-xl"
          />
        </div>

        {!hasAccess && (
          <div className="bg-muted/30 border border-dashed border-border rounded-xl p-5 text-center">
            <Lock className="size-7 mx-auto mb-2 text-muted-foreground" />
            <p className="font-semibold">Purchase this batch to unlock all chapters.</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
          </div>
        ) : enriched.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
            No chapters yet for this subject.
          </div>
        ) : (
          <div className="space-y-3">
            {enriched.map((c: any, idx: number) => (
              <button
                key={c.id}
                onClick={() => navigate({ to: "/batches/$batchId/chapters/$chapterId", params: { batchId, chapterId: c.id } })}
                className="w-full text-left bg-card border border-border rounded-2xl p-4 md:p-5 flex items-center gap-4 hover:border-primary hover:shadow-sm transition-all active:scale-[0.99]"
              >
                <div className="size-12 rounded-xl bg-primary/10 text-primary grid place-items-center font-bold shrink-0">
                  {String(idx + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{c.title}</h3>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><PlayCircle className="size-3.5" /> {c.videoCount} Videos</span>
                    <span className="inline-flex items-center gap-1"><BookOpen className="size-3.5" /> {c.lectureCount} Lectures</span>
                    <span className="inline-flex items-center gap-1"><FileText className="size-3.5" /> {c.notesCount} Notes</span>
                  </div>
                </div>
                <ChevronRight className="size-5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
