import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getBatchCurriculum } from "@/lib/curriculum.functions";
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

const KNOWN_SUBJECTS = ["Physics", "Chemistry", "English", "Hindi", "Biology", "Maths"];

function getBatchSubjectNames(subjects: string[] | null | undefined) {
  const raw = (subjects ?? []).join(", ").trim();
  if (!raw) return [];
  const normalized = raw.toLowerCase();
  const aliases: Record<string, string[]> = {
    Physics: ["physics"],
    Chemistry: ["chemistry"],
    English: ["english"],
    Hindi: ["hindi"],
    Biology: ["biology", "bio"],
    Maths: ["maths", "math", "mathematics"],
  };
  const found = KNOWN_SUBJECTS.filter((subject) => aliases[subject].some((alias) => normalized.includes(alias)));
  if (found.length > 0) return found;
  return raw.split(/,|\/|\band\b/gi).map((subject) => subject.trim()).filter(Boolean);
}

function BatchDetail() {
  const { batchId } = Route.useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const loadCurriculum = useServerFn(getBatchCurriculum);
  const qc = useQueryClient();
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedChapter, setSelectedChapter] = useState("");

  useEffect(() => {
    console.log("Batch ID:", batchId);
  }, [batchId]);

  const { data: batchPreview, isLoading: batchLoading, refetch: refetchBatch } = useQuery({
    queryKey: ["batch-preview", batchId],
    queryFn: async () => {
      const { data, error } = await withTimeout(
        supabase.from("batches").select("*").eq("id", batchId).maybeSingle(),
        "Batch loading"
      );
      console.log("[BatchDetail] batchId:", batchId, "data:", data, "error:", error);
      if (error) throw error;
      return data;
    },
    retry: 2,
  });

  const { data: curriculum, isLoading: curriculumLoading, isError: curriculumError, error: curriculumErrorInfo, refetch: refetchCurriculum } = useQuery({
    queryKey: ["batch-curriculum", batchId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      try {
        console.log("Checking blocked status");
        console.log("Curriculum loading...");
        return await withTimeout(loadCurriculum({ data: { batchId } }), "Curriculum loading");
      } catch (error) {
        console.log(error);
        console.log("Block check success/failure", error);
        throw error;
      }
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
  });

  useEffect(() => {
    if (!curriculumError) return;
    const retry = window.setTimeout(() => refetchCurriculum(), 3000);
    return () => window.clearTimeout(retry);
  }, [curriculumError, refetchCurriculum]);

  const batch = curriculum?.batch ?? batchPreview;
  const isAdmin = curriculum?.isAdmin ?? role === "admin";
  const hasAccess = curriculum?.hasAccess ?? isAdmin;

  const batchPrice = Number(batch?.discount_price ?? batch?.price ?? 0);
  console.log("User:", user?.id);
  console.log("Batch:", batchId);
  console.log("Purchased:", hasAccess);
  console.log("[BatchDetail] userId:", user?.id, "isAdmin:", isAdmin, "hasAccess:", hasAccess);

  const enroll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("enrollments").insert({ student_id: user!.id, batch_id: batchId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Enrolled!");
      qc.invalidateQueries({ queryKey: ["batch-curriculum", batchId] });
      qc.invalidateQueries({ queryKey: ["enrollment-check"] });
      qc.invalidateQueries({ queryKey: ["my-enroll-ids"] });
      qc.invalidateQueries({ queryKey: ["enrolled"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const subjects = useMemo(() => {
    const subjectRows = curriculum?.subjects ?? [];
    const chapterRows = curriculum?.chapters ?? [];
    const lectureRows = curriculum?.lectures ?? [];
    const materialRows = curriculum?.materials ?? [];
    const noteRows = curriculum?.extraNotes ?? [];
    const materialsByLecture = new Map<string, any[]>();
    materialRows.forEach((material: any) => {
      const list = materialsByLecture.get(material.lecture_id) ?? [];
      list.push(material);
      materialsByLecture.set(material.lecture_id, list);
    });
    const notesBySubject = new Map<string, any[]>();
    const notesByChapter = new Map<string, any[]>();
    const batchNotes: any[] = [];
    noteRows.forEach((note: any) => {
      if (note.chapter_id) notesByChapter.set(note.chapter_id, [...(notesByChapter.get(note.chapter_id) ?? []), note]);
      else if (note.subject_id) notesBySubject.set(note.subject_id, [...(notesBySubject.get(note.subject_id) ?? []), note]);
      else batchNotes.push(note);
    });

    const hydratedLectures = lectureRows.map((lecture: any) => ({ ...lecture, materials: materialsByLecture.get(lecture.id) ?? [] }));
    const subjectSource = subjectRows.length > 0
      ? subjectRows
      : getBatchSubjectNames(batch?.subjects).map((name, index) => ({ id: `fallback-${index}-${name}`, name, sort_order: index }));

    if (subjectSource.length === 0 && hydratedLectures.length === 0 && batchNotes.length === 0) return [];

    const nodes = subjectSource.map((subject: any) => {
      const subjectChapters = chapterRows.filter((chapter: any) => chapter.subject_id === subject.id);
      const directLectures = hydratedLectures.filter((lecture: any) => lecture.subject_id === subject.id && !lecture.chapter_id);
      const chapters = subjectChapters.map((chapter: any) => ({
        id: chapter.id,
        name: chapter.title,
        lectures: hydratedLectures.filter((lecture: any) => lecture.chapter_id === chapter.id),
        notes: notesByChapter.get(chapter.id) ?? [],
      }));
      if (directLectures.length > 0) {
        chapters.unshift({ id: `${subject.id}-direct`, name: "Lectures", lectures: directLectures, notes: [] });
      }
      return {
        id: subject.id,
        name: subject.name,
        notes: notesBySubject.get(subject.id) ?? [],
        chapters,
      };
    });

    const assignedLectureIds = new Set(nodes.flatMap((subject) => subject.chapters.flatMap((chapter) => chapter.lectures.map((lecture: any) => lecture.id))));
    const unassignedLectures = hydratedLectures.filter((lecture: any) => !assignedLectureIds.has(lecture.id));
    if (unassignedLectures.length > 0) {
      const target = nodes[0] ?? { id: "all", name: "All Lectures", notes: [], chapters: [] };
      target.chapters.push({ id: "unassigned", name: "Lectures", lectures: unassignedLectures, notes: [] });
      if (nodes.length === 0) nodes.push(target);
    }
    if (batchNotes.length > 0) {
      const target = nodes[0] ?? { id: "materials", name: "Materials", notes: [], chapters: [] };
      target.notes.push(...batchNotes);
      if (nodes.length === 0) nodes.push(target);
    }
    return nodes;
  }, [batch?.subjects, curriculum]);

  useEffect(() => {
    if (!selectedSubject && subjects[0]) setSelectedSubject(subjects[0].id);
    if (selectedSubject && !subjects.some((subject) => subject.id === selectedSubject)) {
      setSelectedSubject(subjects[0]?.id ?? "");
    }
  }, [selectedSubject, subjects]);

  const activeSubject = subjects.find((subject) => subject.id === selectedSubject) ?? subjects[0];

  useEffect(() => {
    if (!activeSubject) return;
    if (!selectedChapter || !activeSubject.chapters.some((chapter) => chapter.id === selectedChapter)) {
      setSelectedChapter(activeSubject.chapters[0]?.id ?? "");
    }
  }, [activeSubject, selectedChapter]);

  const activeChapter = activeSubject?.chapters.find((chapter) => chapter.id === selectedChapter) ?? activeSubject?.chapters[0];
  const lectureCount = curriculum?.lectures?.length ?? 0;
  const hasAnyCurriculum = subjects.length > 0;

  useEffect(() => {
    if (batch && hasAccess) console.log("Opening Batch");
  }, [batch, hasAccess]);

  const retryAll = () => {
    refetchBatch();
    refetchCurriculum();
  };

  if (batchLoading && !batch) {
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
          {curriculum && !hasAccess && (
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
            <h3 className="text-xl font-bold">Subjects, Chapters & Lectures{lectureCount ? ` (${lectureCount})` : ""}</h3>
            {curriculumError && <Button variant="outline" size="sm" onClick={() => refetchCurriculum()}><RefreshCcw className="size-4 mr-1" /> Retry</Button>}
          </div>

          {curriculum && !hasAccess && !isAdmin && (
            <div className="bg-muted/30 border border-dashed border-border rounded-xl p-6 text-center mb-3">
              <Lock className="size-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-semibold">{curriculum.isBlocked ? "Access is blocked for this account." : "Please purchase this batch to continue."}</p>
              <p className="text-sm text-muted-foreground mt-1">{curriculum.isBlocked ? "Contact support to restore access." : "Purchase Batch to view curriculum."}</p>
            </div>
          )}

          {curriculumLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : curriculumError ? (
            <div className="bg-card border border-border rounded-xl p-5 text-center space-y-2">
              <p className="font-semibold">Curriculum could not load</p>
              <p className="text-sm text-muted-foreground">{(curriculumErrorInfo as Error | undefined)?.message ?? "Retrying automatically."}</p>
              <Button variant="outline" size="sm" onClick={() => refetchCurriculum()}><RefreshCcw className="size-4 mr-1" /> Retry now</Button>
            </div>
          ) : curriculum && !hasAccess ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              Purchase Batch to View Curriculum
            </div>
          ) : !hasAnyCurriculum ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
              No Curriculum Added Yet
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
              <div className="bg-card border border-border rounded-xl p-3 space-y-2 h-fit">
                {subjects.map((subject) => (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => setSelectedSubject(subject.id)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 text-sm font-semibold flex items-center justify-between gap-2 transition-colors ${
                      selectedSubject === subject.id ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="truncate flex items-center gap-2"><BookOpen className="size-4 shrink-0" /> {subject.name}</span>
                    <span className="text-xs opacity-80">{subject.chapters.reduce((total, chapter) => total + chapter.lectures.length, 0) + subject.notes.length}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-3 min-w-0">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {(activeSubject?.chapters ?? []).map((chapter) => (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() => setSelectedChapter(chapter.id)}
                      className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                        selectedChapter === chapter.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
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
                        className={`bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-start gap-4 ${lectureUnlocked ? "hover:border-primary transition-colors" : "opacity-60"}`}
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
                  {[...(activeSubject?.notes ?? []), ...(activeChapter?.notes ?? [])].length > 0 && (
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h4 className="font-semibold mb-3">PDFs, Notes & DPP</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[...(activeSubject?.notes ?? []), ...(activeChapter?.notes ?? [])].map((note: any) => (
                          <a key={note.id} href={note.pdf_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm hover:border-primary hover:text-primary">
                            <FileText className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{note.title}</span>
                            <span className="text-[10px] uppercase text-muted-foreground">{note.category}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {(activeChapter?.lectures.length ?? 0) === 0 && (
                    <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                      {activeSubject?.chapters.length ? "No lectures uploaded in this chapter yet." : "No chapters added for this subject yet."}
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
