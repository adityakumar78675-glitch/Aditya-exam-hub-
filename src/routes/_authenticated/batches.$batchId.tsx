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
  const navigate = useNavigate();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");

  useEffect(() => {
    console.log("Batch ID:", batchId);
  }, [batchId]);

  const { data: batch, isLoading: batchLoading, isError: batchError, error: batchErrorInfo, refetch: refetchBatch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase.from("batches").select("*").eq("id", batchId).maybeSingle(),
        "Batch loading"
      );
      console.log("[BatchDetail] batchId:", batchId, "data:", data, "error:", error);
      if (error) throw error;
      return data;
    },
    retry: 1,
  });

  const { data: enrollment, isLoading: enrollLoading, isError: enrollError, refetch: refetchEnrollment } = useQuery({
    queryKey: ["enrollment-check", batchId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await withTimeout(supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", user!.id)
        .eq("batch_id", batchId)
        .maybeSingle(), "Enrollment check");
      console.log("[BatchDetail] enrollment:", data);
      if (error) throw error;
      return data;
    },
    retry: 1,
  });

  const batchPrice = Number(batch?.discount_price ?? batch?.price ?? 0);
  const isFreeBatch = batchPrice === 0;
  const hasAccess = isAdmin || isFreeBatch || !!enrollment;
  console.log("User:", user?.id);
  console.log("Batch:", batchId);
  console.log("Purchased:", hasAccess);
  console.log("[BatchDetail] userId:", user?.id, "isAdmin:", isAdmin, "hasAccess:", hasAccess);

  const { data: lectures = [], isLoading: lecturesLoading, isError: lecturesError, error: lecturesErrorInfo, refetch: refetchLectures } = useQuery({
    queryKey: ["lectures", batchId],
    enabled: !!batch,
    queryFn: async () => {
      const { data, error } = await withTimeout(supabase
        .from("lectures")
        .select("*, materials(*)")
        .eq("batch_id", batchId)
        .order("order_index"), "Lecture loading");
      if (error) throw error;
      return data ?? [];
    },
    retry: 1,
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

  const subjects = useMemo(() => {
    const names = new Set<string>();
    (batch?.subjects ?? []).forEach((subject: string) => {
      if (subject?.trim()) names.add(subject.trim());
    });
    lectures.forEach((lecture: any) => names.add(getLectureSubject(lecture, batch?.subjects?.[0] ?? "All Lectures")));
    if (names.size === 0) names.add("All Lectures");

    return Array.from(names).map((subjectName) => {
      const subjectLectures = lectures.filter((lecture: any) => getLectureSubject(lecture, subjectName) === subjectName);
      const chapterNames = new Set<string>();
      subjectLectures.forEach((lecture: any) => chapterNames.add(getLectureChapter(lecture)));
      if (chapterNames.size === 0) chapterNames.add("Lectures");

      return {
        name: subjectName,
        chapters: Array.from(chapterNames).map((chapterName) => ({
          name: chapterName,
          lectures: subjectLectures.filter((lecture: any) => getLectureChapter(lecture) === chapterName),
        })),
      };
    });
  }, [batch, lectures]);

  useEffect(() => {
    if (!selectedSubject && subjects[0]) setSelectedSubject(subjects[0].name);
    if (selectedSubject && !subjects.some((subject) => subject.name === selectedSubject)) {
      setSelectedSubject(subjects[0]?.name ?? "");
    }
  }, [selectedSubject, subjects]);

  const activeSubject = subjects.find((subject) => subject.name === selectedSubject) ?? subjects[0];

  useEffect(() => {
    if (!activeSubject) return;
    if (!selectedChapter || !activeSubject.chapters.some((chapter) => chapter.name === selectedChapter)) {
      setSelectedChapter(activeSubject.chapters[0]?.name ?? "");
    }
  }, [activeSubject, selectedChapter]);

  const activeChapter = activeSubject?.chapters.find((chapter) => chapter.name === selectedChapter) ?? activeSubject?.chapters[0];

  useEffect(() => {
    if (batch && hasAccess) console.log("Opening Batch");
  }, [batch, hasAccess]);

  const retryAll = () => {
    refetchBatch();
    refetchEnrollment();
    refetchLectures();
  };

  if (batchLoading || enrollLoading) {
    return (
      <div className="p-8 space-y-4 max-w-5xl mx-auto w-full">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (batchError || enrollError) {
    return (
      <ErrorState
        title="Batch could not load"
        message={(batchErrorInfo as Error | undefined)?.message ?? "Access verification failed. Please retry."}
        onRetry={retryAll}
      />
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

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-xl font-bold">Subjects, Chapters & Lectures{lectures.length ? ` (${lectures.length})` : ""}</h3>
            {lecturesError && <Button variant="outline" size="sm" onClick={() => refetchLectures()}><RefreshCcw className="size-4 mr-1" /> Retry</Button>}
          </div>

          {!hasAccess && !isAdmin && (
            <div className="bg-muted/30 border border-dashed border-border rounded-xl p-6 text-center mb-3">
              <Lock className="size-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-semibold">Please purchase this batch to continue.</p>
              <p className="text-sm text-muted-foreground mt-1">Free lectures (if any) are listed below.</p>
            </div>
          )}

          {lecturesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : lecturesError ? (
            <div className="bg-card border border-border rounded-xl p-5 text-center space-y-2">
              <p className="font-semibold">Lectures could not load</p>
              <p className="text-sm text-muted-foreground">{(lecturesErrorInfo as Error | undefined)?.message ?? "Please retry."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
              <div className="bg-card border border-border rounded-xl p-3 space-y-2 h-fit">
                {subjects.map((subject) => (
                  <button
                    key={subject.name}
                    type="button"
                    onClick={() => setSelectedSubject(subject.name)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold flex items-center justify-between gap-2 transition-colors ${
                      selectedSubject === subject.name ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="truncate flex items-center gap-2"><BookOpen className="size-4 shrink-0" /> {subject.name}</span>
                    <span className="text-xs opacity-80">{subject.chapters.reduce((total, chapter) => total + chapter.lectures.length, 0)}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-3 min-w-0">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(activeSubject?.chapters ?? []).map((chapter) => (
                    <button
                      key={chapter.name}
                      type="button"
                      onClick={() => setSelectedChapter(chapter.name)}
                      className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                        selectedChapter === chapter.name ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {chapter.name} <span className="opacity-75">({chapter.lectures.length})</span>
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {(activeChapter?.lectures ?? []).map((l: any) => {
                    const lectureUnlocked = hasAccess || l.is_free;
                    return (
                      <div
                        key={l.id}
                        className={`bg-card border border-border rounded-xl p-4 flex items-start gap-4 ${lectureUnlocked ? "hover:border-primary transition-colors" : "opacity-60"}`}
                      >
                        {l.is_live ? <Radio className="size-5 text-destructive shrink-0 mt-0.5" /> :
                          lectureUnlocked ? <PlayCircle className="size-5 text-primary shrink-0 mt-0.5" /> :
                          <Lock className="size-5 text-muted-foreground shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold flex items-center gap-2 flex-wrap">
                            <span className="truncate">{l.title}</span>
                            {l.is_free && <span className="bg-accent/10 text-accent font-bold px-2 py-0.5 rounded uppercase text-[10px]">Free</span>}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {l.is_live ? `Live • ${l.scheduled_at ? new Date(l.scheduled_at).toLocaleString() : "TBD"}` : `${l.duration_minutes ?? 0} min`}
                            {l.materials?.length > 0 && ` • ${l.materials.length} PDF/note${l.materials.length > 1 ? "s" : ""}`}
                          </p>
                          {l.materials?.length > 0 && lectureUnlocked && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {l.materials.map((material: any) => (
                                <a key={material.id} href={material.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                                  <FileText className="size-3" /> {material.title}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={lectureUnlocked ? "default" : "outline"}
                          disabled={!lectureUnlocked}
                          onClick={() => {
                            console.log("[BatchDetail] Opening lecture", { lectureId: l.id, batchId });
                            navigate({ to: "/lectures/$lectureId", params: { lectureId: l.id } });
                          }}
                          className="shrink-0"
                        >
                          {lectureUnlocked ? <>Watch <ChevronRight className="size-4 ml-1" /></> : "Locked"}
                        </Button>
                      </div>
                    );
                  })}
                  {(activeChapter?.lectures.length ?? 0) === 0 && (
                    <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                      No lectures uploaded in this chapter yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
