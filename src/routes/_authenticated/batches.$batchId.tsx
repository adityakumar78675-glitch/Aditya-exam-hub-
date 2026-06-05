import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { ArrowLeft, BookOpen, ChevronRight, FileText, PlayCircle, Radio, Lock, RefreshCcw, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/batches/$batchId")({ component: BatchDetail });

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

const UNCATEGORIZED = "__uncategorized__";

function BatchDetail() {
  const { batchId } = Route.useParams();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [selectedChapterId, setSelectedChapterId] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: batch, isLoading: batchLoading, isError: batchError, error: batchErrorInfo, refetch: refetchBatch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("*").eq("id", batchId).maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: 1,
  });

  const { data: enrollment, isLoading: enrollLoading, isError: enrollError, refetch: refetchEnrollment } = useQuery({
    queryKey: ["enrollment-check", batchId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", user!.id)
        .eq("batch_id", batchId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    retry: 1,
  });

  const batchPrice = Number(batch?.discount_price ?? batch?.price ?? 0);
  const isFreeBatch = batchPrice === 0;
  const hasAccess = isAdmin || isFreeBatch || !!enrollment;

  const { data: subjectsData = [], isLoading: subjectsLoading, refetch: refetchSubjects } = useQuery({
    queryKey: ["batch-subjects", batchId],
    enabled: !!batch,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("subjects")
        .select("*")
        .eq("batch_id", batchId)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: chaptersData = [], refetch: refetchChapters } = useQuery({
    queryKey: ["batch-chapters", batchId, subjectsData.map((s: any) => s.id).join(",")],
    enabled: subjectsData.length > 0,
    queryFn: async () => {
      const ids = subjectsData.map((s: any) => s.id);
      const { data, error } = await (supabase.from as any)("chapters")
        .select("*")
        .in("subject_id", ids)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: lectures = [], isLoading: lecturesLoading, isError: lecturesError, error: lecturesErrorInfo, refetch: refetchLectures } = useQuery({
    queryKey: ["lectures", batchId],
    enabled: !!batch,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lectures")
        .select("*, materials(*)")
        .eq("batch_id", batchId)
        .order("order_index");
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

  // Build subject → chapter → lectures tree from real tables, with legacy fallback
  const tree = useMemo(() => {
    const subs: Array<{ id: string; name: string; icon: string | null; chapters: Array<{ id: string; title: string; lectures: any[] }> }> = [];
    subjectsData.forEach((s: any) => {
      const subjChapters = chaptersData
        .filter((c: any) => c.subject_id === s.id)
        .map((c: any) => ({
          id: c.id,
          title: c.title,
          lectures: lectures.filter((l: any) => l.chapter_id === c.id),
        }));
      // Lectures attached to subject but no chapter
      const orphans = lectures.filter((l: any) => l.subject_id === s.id && !l.chapter_id);
      if (orphans.length) subjChapters.push({ id: `${s.id}-orphan`, title: "Other lectures", lectures: orphans });
      subs.push({ id: s.id, name: s.name, icon: s.icon, chapters: subjChapters });
    });
    // Legacy: lectures with no subject_id
    const legacy = lectures.filter((l: any) => !l.subject_id);
    if (legacy.length) {
      subs.push({
        id: UNCATEGORIZED,
        name: "All Lectures",
        icon: null,
        chapters: [{ id: `${UNCATEGORIZED}-all`, title: "Lectures", lectures: legacy }],
      });
    }
    return subs;
  }, [subjectsData, chaptersData, lectures]);

  // Apply search filter
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const q = search.toLowerCase();
    return tree
      .map((s) => ({
        ...s,
        chapters: s.chapters
          .map((c) => ({ ...c, lectures: c.lectures.filter((l: any) => l.title?.toLowerCase().includes(q)) }))
          .filter((c) => c.lectures.length > 0 || c.title.toLowerCase().includes(q)),
      }))
      .filter((s) => s.chapters.length > 0 || s.name.toLowerCase().includes(q));
  }, [tree, search]);

  useEffect(() => {
    if (!selectedSubjectId && filteredTree[0]) setSelectedSubjectId(filteredTree[0].id);
    if (selectedSubjectId && !filteredTree.some((s) => s.id === selectedSubjectId)) {
      setSelectedSubjectId(filteredTree[0]?.id ?? "");
    }
  }, [selectedSubjectId, filteredTree]);

  const activeSubject = filteredTree.find((s) => s.id === selectedSubjectId) ?? filteredTree[0];

  useEffect(() => {
    if (!activeSubject) return;
    if (!selectedChapterId || !activeSubject.chapters.some((c) => c.id === selectedChapterId)) {
      setSelectedChapterId(activeSubject.chapters[0]?.id ?? "");
    }
  }, [activeSubject, selectedChapterId]);

  const activeChapter = activeSubject?.chapters.find((c) => c.id === selectedChapterId) ?? activeSubject?.chapters[0];

  const retryAll = () => {
    refetchBatch(); refetchEnrollment(); refetchLectures(); refetchSubjects(); refetchChapters();
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

  const totalLectures = lectures.length;
  const subjectsLoadingState = subjectsLoading || lecturesLoading;

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
              <Button size="lg" disabled={!batch.enrollment_open || enroll.isPending} onClick={() => enroll.mutate()}>
                {batch.enrollment_open ? "Buy Now / Enroll" : "Enrollment Closed"}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-xl font-bold">Subjects & Chapters{totalLectures ? ` (${totalLectures} lectures)` : ""}</h3>
            <div className="relative max-w-xs w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lectures…" className="pl-8 h-9" />
            </div>
          </div>

          {!hasAccess && !isAdmin && (
            <div className="bg-muted/30 border border-dashed border-border rounded-xl p-6 text-center mb-3">
              <Lock className="size-8 mx-auto mb-2 text-muted-foreground" />
              <p className="font-semibold">Please purchase this batch to continue.</p>
              <p className="text-sm text-muted-foreground mt-1">Free lectures (if any) are listed below.</p>
            </div>
          )}

          {subjectsLoadingState ? (
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
          ) : filteredTree.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
              No subjects or lectures added yet.
            </div>
          ) : (
            <>
              {/* Subject cards (PW-style grid) — tap to open chapter list */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredTree.map((s) => {
                  const totalLec = s.chapters.reduce((t, c) => t + c.lectures.length, 0);
                  const isActive = selectedSubjectId === s.id;
                  const isUncat = s.id === UNCATEGORIZED;
                  const handleClick = () => {
                    if (isUncat) setSelectedSubjectId(s.id);
                    else navigate({ to: "/batches/$batchId/subjects/$subjectId", params: { batchId, subjectId: s.id } });
                  };
                  return (
                    <button
                      key={s.id}
                      onClick={handleClick}
                      className={`text-left rounded-2xl border p-4 transition-all active:scale-[0.99] ${
                        isActive && isUncat ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/50 hover:shadow-sm"
                      }`}
                    >
                      <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2 text-lg">
                        {s.icon ? <span>{s.icon}</span> : <BookOpen className="size-5" />}
                      </div>
                      <p className="font-semibold truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.chapters.length} chapter{s.chapters.length === 1 ? "" : "s"} • {totalLec} lec</p>
                    </button>
                  );
                })}
              </div>

              {/* Chapter chips */}
              {activeSubject && activeSubject.chapters.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {activeSubject.chapters.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedChapterId(c.id)}
                      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                        selectedChapterId === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted"
                      }`}
                    >
                      {c.title} <span className="opacity-75">({c.lectures.length})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Lectures */}
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
                        onClick={() => navigate({ to: "/lectures/$lectureId", params: { lectureId: l.id } })}
                        className="shrink-0"
                      >
                        {lectureUnlocked ? <>Watch <ChevronRight className="size-4 ml-1" /></> : "Locked"}
                      </Button>
                    </div>
                  );
                })}
                {(activeChapter?.lectures.length ?? 0) === 0 && (
                  <div className="bg-card border border-border rounded-xl p-6 text-center text-sm text-muted-foreground">
                    No lectures in this chapter yet.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
