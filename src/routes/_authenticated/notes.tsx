import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Search, Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notes")({ component: NotesPage });

function formatBytes(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function NotesPage() {
  const [batchId, setBatchId] = useState<string>("all");
  const [subjectId, setSubjectId] = useState<string>("all");
  const [chapterId, setChapterId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["student-notes"],
    queryFn: async () => (await supabase.from("extra_notes").select("*, batches(title), subjects(name), chapters(title)").order("created_at", { ascending: false })).data ?? [],
  });

  const batchOpts = useMemo(() => {
    const m = new Map<string, string>();
    (notes as any[]).forEach((n) => n.batches && m.set(n.batch_id, n.batches.title));
    return Array.from(m.entries());
  }, [notes]);
  const subjectOpts = useMemo(() => {
    const m = new Map<string, string>();
    (notes as any[]).filter((n) => batchId === "all" || n.batch_id === batchId).forEach((n) => n.subjects && m.set(n.subject_id, n.subjects.name));
    return Array.from(m.entries());
  }, [notes, batchId]);
  const chapterOpts = useMemo(() => {
    const m = new Map<string, string>();
    (notes as any[]).filter((n) => (subjectId === "all" || n.subject_id === subjectId)).forEach((n) => n.chapters && m.set(n.chapter_id, n.chapters.title));
    return Array.from(m.entries());
  }, [notes, subjectId]);

  const filtered = useMemo(() => {
    let list = notes as any[];
    if (batchId !== "all") list = list.filter((n) => n.batch_id === batchId);
    if (subjectId !== "all") list = list.filter((n) => n.subject_id === subjectId);
    if (chapterId !== "all") list = list.filter((n) => n.chapter_id === chapterId);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((n) => (n.title || "").toLowerCase().includes(q) || (n.description || "").toLowerCase().includes(q));
    }
    return list;
  }, [notes, batchId, subjectId, chapterId, search]);

  const getSignedUrl = async (n: any) => {
    if (!n.storage_path) return n.pdf_url;
    const { data, error } = await supabase.storage.from("extra-notes").createSignedUrl(n.storage_path, 3600);
    if (error) throw error;
    return data.signedUrl;
  };

  const openNote = async (n: any) => {
    try { setBusy(n.id); const url = await getSignedUrl(n); window.open(url, "_blank", "noopener"); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  const downloadNote = async (n: any) => {
    try {
      setBusy(n.id);
      const url = await getSignedUrl(n);
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = n.file_name || n.title;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Extra Notes</h1>
        <p className="text-muted-foreground mt-1 text-sm">Study material, PDFs and resources for your batches.</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 mb-4 space-y-3">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Select value={batchId} onValueChange={(v) => { setBatchId(v); setSubjectId("all"); setChapterId("all"); }}>
            <SelectTrigger><SelectValue placeholder="Batch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Batches</SelectItem>
              {batchOpts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={subjectId} onValueChange={(v) => { setSubjectId(v); setChapterId("all"); }}>
            <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {subjectOpts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={chapterId} onValueChange={setChapterId}>
            <SelectTrigger><SelectValue placeholder="Chapter" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Chapters</SelectItem>
              {chapterOpts.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12"><Loader2 className="size-6 animate-spin mx-auto" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          <FileText className="size-10 mx-auto mb-2 opacity-50" />
          <p>No notes available yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((n: any) => (
            <div key={n.id} className="bg-card border border-border rounded-2xl p-4 flex gap-3">
              <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><FileText className="size-5" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{n.title}</p>
                {n.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.description}</p>}
                <p className="text-[11px] text-muted-foreground mt-1 truncate">
                  {n.batches?.title}{n.subjects?.name ? ` · ${n.subjects.name}` : ""}{n.chapters?.title ? ` · ${n.chapters.title}` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">{n.category?.toUpperCase()} · {formatBytes(n.file_size)}</p>
                <div className="flex gap-2 mt-2">
                  <Button size="sm" variant="secondary" disabled={busy === n.id} onClick={() => openNote(n)}>
                    <ExternalLink className="size-3 mr-1" /> Open
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === n.id} onClick={() => downloadNote(n)}>
                    <Download className="size-3 mr-1" /> Download
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
