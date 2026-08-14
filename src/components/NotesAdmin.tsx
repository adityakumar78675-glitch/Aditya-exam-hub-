import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2, Pencil, Upload, FileText, Search, Loader2, ImageIcon, RefreshCw, Download } from "lucide-react";
import { detectCover, uploadCoverBlob } from "@/lib/note-cover";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ALLOWED = [
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/zip",
  "application/x-zip-compressed",
];
const MAX_SIZE = 500 * 1024 * 1024;

function formatBytes(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

async function uploadWithProgress(path: string, file: File, onProgress: (p: number) => void) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/extra-notes/${path}`);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

export function NotesAdmin() {
  const qc = useQueryClient();
  const [batchId, setBatchId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>("all");
  const [chapterId, setChapterId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("notes");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [coverStatus, setCoverStatus] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: batches = [] } = useQuery({
    queryKey: ["notes-admin-batches"],
    queryFn: async () => (await supabase.from("batches").select("id,title").order("title")).data ?? [],
  });
  const { data: subjects = [] } = useQuery({
    queryKey: ["notes-admin-subjects", batchId],
    enabled: !!batchId,
    queryFn: async () => (await supabase.from("subjects").select("id,name").eq("batch_id", batchId).order("name")).data ?? [],
  });
  const { data: chapters = [] } = useQuery({
    queryKey: ["notes-admin-chapters", subjectId],
    enabled: !!subjectId && subjectId !== "all",
    queryFn: async () => (await supabase.from("chapters").select("id,title").eq("subject_id", subjectId).order("title")).data ?? [],
  });
  const { data: notes = [], refetch } = useQuery({
    queryKey: ["notes-admin-list", batchId],
    enabled: !!batchId,
    queryFn: async () => (await supabase.from("extra_notes").select("*").eq("batch_id", batchId).order("created_at", { ascending: false })).data ?? [],
  });

  const filtered = useMemo(() => {
    let list = notes as any[];
    if (subjectId !== "all") list = list.filter((n) => n.subject_id === subjectId);
    if (chapterId !== "all") list = list.filter((n) => n.chapter_id === chapterId);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((n) => (n.title || "").toLowerCase().includes(q) || (n.description || "").toLowerCase().includes(q));
    }
    return list;
  }, [notes, subjectId, chapterId, search]);

  const validateFile = (f: File): string | null => {
    if (f.size > MAX_SIZE) return "File exceeds 500 MB limit";
    const ok = ALLOWED.includes(f.type) || /\.(pdf|ppt|pptx|doc|docx|jpg|jpeg|png|webp|zip)$/i.test(f.name);
    if (!ok) return "Unsupported file type";
    return null;
  };

  const pickFile = (f: File) => {
    const err = validateFile(f);
    if (err) { toast.error(err); return; }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const handleUpload = async () => {
    if (!batchId) { toast.error("Select a batch"); return; }
    if (!file) { toast.error("Choose a file"); return; }
    if (!title.trim()) { toast.error("Enter a title"); return; }
    setUploading(true); setProgress(0); setCoverStatus(null);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${batchId}/${subjectId !== "all" ? subjectId : "general"}/${chapterId !== "all" ? chapterId : "root"}/${crypto.randomUUID()}.${ext}`;
      await uploadWithProgress(path, file, setProgress);
      const { data: signed } = await supabase.storage.from("extra-notes").createSignedUrl(path, 60 * 60 * 24 * 365);

      // Cover detection never blocks the upload
      const cover = await detectCover(file, batchId, title.trim(), setCoverStatus).catch(() => null);
      setCoverStatus(null);

      const { error } = await supabase.from("extra_notes").insert({
        batch_id: batchId,
        subject_id: subjectId !== "all" ? subjectId : null,
        chapter_id: chapterId !== "all" ? chapterId : null,
        title: title.trim(),
        description: description.trim() || null,
        category,
        pdf_url: signed?.signedUrl || "",
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || ext,
        cover_url: cover?.cover_url ?? null,
        cover_source: cover?.cover_source ?? null,
        book_author: cover?.book_author ?? null,
        book_isbn: cover?.book_isbn ?? null,
        book_publisher: cover?.book_publisher ?? null,
      });
      if (error) throw error;
      toast.success("Uploaded successfully");
      setFile(null); setTitle(""); setDescription(""); setProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setUploading(false);
      setCoverStatus(null);
    }
  };

  const replacePdf = async (n: any, f: File) => {
    const err = validateFile(f);
    if (err) { toast.error(err); return; }
    setRowBusy(n.id);
    try {
      const ext = f.name.split(".").pop() || "bin";
      const path = `${n.batch_id}/${n.subject_id || "general"}/${n.chapter_id || "root"}/${crypto.randomUUID()}.${ext}`;
      await uploadWithProgress(path, f, () => {});
      const { data: signed } = await supabase.storage.from("extra-notes").createSignedUrl(path, 60 * 60 * 24 * 365);
      const { error } = await supabase.from("extra_notes").update({
        pdf_url: signed?.signedUrl || "",
        storage_path: path,
        file_name: f.name,
        file_size: f.size,
        file_type: f.type || ext,
      }).eq("id", n.id);
      if (error) throw error;
      if (n.storage_path) await supabase.storage.from("extra-notes").remove([n.storage_path]);
      toast.success("PDF replaced");
      qc.invalidateQueries({ queryKey: ["notes-admin-list"] });
    } catch (e: any) { toast.error(e.message || "Replace failed"); } finally { setRowBusy(null); }
  };

  const replaceCover = async (n: any, img: File) => {
    if (!img.type.startsWith("image/")) { toast.error("Choose an image file"); return; }
    setRowBusy(n.id);
    try {
      const up = await uploadCoverBlob(img, n.batch_id);
      if (!up) throw new Error("Cover upload failed");
      const { error } = await supabase.from("extra_notes").update({ cover_url: up.url, cover_source: "manual" }).eq("id", n.id);
      if (error) throw error;
      toast.success("Cover updated");
      qc.invalidateQueries({ queryKey: ["notes-admin-list"] });
    } catch (e: any) { toast.error(e.message); } finally { setRowBusy(null); }
  };

  const redetectCover = async (n: any) => {
    setRowBusy(n.id);
    try {
      const url = n.storage_path
        ? (await supabase.storage.from("extra-notes").createSignedUrl(n.storage_path, 600)).data?.signedUrl
        : n.pdf_url;
      if (!url) throw new Error("File not found");
      const blob = await (await fetch(url)).blob();
      const f = new File([blob], n.file_name || "file.pdf", { type: blob.type || "application/pdf" });
      const cover = await detectCover(f, n.batch_id, n.title);
      if (!cover.cover_url) { toast.info("No cover could be detected"); return; }
      const { error } = await supabase.from("extra_notes").update({
        cover_url: cover.cover_url,
        cover_source: cover.cover_source,
        book_author: cover.book_author ?? n.book_author,
        book_isbn: cover.book_isbn ?? n.book_isbn,
        book_publisher: cover.book_publisher ?? n.book_publisher,
      }).eq("id", n.id);
      if (error) throw error;
      toast.success("Cover detected");
      qc.invalidateQueries({ queryKey: ["notes-admin-list"] });
    } catch (e: any) { toast.error(e.message || "Detection failed"); } finally { setRowBusy(null); }
  };

  const delNote = useMutation({
    mutationFn: async (n: any) => {
      if (n.storage_path) await supabase.storage.from("extra-notes").remove([n.storage_path]);
      const { error } = await supabase.from("extra_notes").delete().eq("id", n.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["notes-admin-list"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await supabase.from("extra_notes").update({
        title: editing.title,
        description: editing.description,
        subject_id: editing.subject_id || null,
        chapter_id: editing.chapter_id || null,
        category: editing.category,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); setEditing(null); qc.invalidateQueries({ queryKey: ["notes-admin-list"] }); },
    onError: (e: any) => toast.error(e.message),
  });



  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2"><Upload className="size-5 text-primary" /><h3 className="font-bold text-lg">Upload Notes</h3></div>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Batch *</Label>
            <Select value={batchId} onValueChange={(v) => { setBatchId(v); setSubjectId("all"); setChapterId("all"); }}>
              <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
              <SelectContent>{batches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Subject</Label>
            <Select value={subjectId} onValueChange={(v) => { setSubjectId(v); setChapterId("all"); }} disabled={!batchId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">— None —</SelectItem>
                {subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Chapter</Label>
            <Select value={chapterId} onValueChange={setChapterId} disabled={subjectId === "all"}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">— None —</SelectItem>
                {chapters.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kinematics Notes" /></div>
          <div>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="notes">Notes</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="ppt">PPT</SelectItem>
                <SelectItem value="assignment">Assignment</SelectItem>
                <SelectItem value="dpp">DPP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.webp,.zip"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
          />
          <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
          {file ? (
            <div className="text-sm"><p className="font-medium">{file.name}</p><p className="text-muted-foreground text-xs">{formatBytes(file.size)}</p></div>
          ) : (
            <div className="text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Drop file here or tap to browse</p>
              <p className="text-xs mt-1">PDF, PPT, DOC, JPG, PNG, WEBP, ZIP — up to 500 MB</p>
            </div>
          )}
        </div>

        {uploading && (
          <div>
            <div className="flex justify-between text-xs mb-1"><span>{coverStatus || "Uploading…"}</span><span>{progress}%</span></div>
            <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
        )}

        <Button onClick={handleUpload} disabled={uploading || !file || !batchId} className="w-full md:w-auto">
          {uploading ? <><Loader2 className="size-4 mr-2 animate-spin" />{coverStatus || "Uploading…"}</> : <><Upload className="size-4 mr-2" />Upload Note</>}
        </Button>
      </div>

      {batchId && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Search className="size-4 text-muted-foreground" />
            <Input placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No notes yet.</p>}
            {filtered.map((n: any) => (
              <div key={n.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/30">
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-muted grid place-items-center shrink-0">
                  {n.cover_url ? (
                    <img src={n.cover_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <FileText className="size-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{n.file_name} · {formatBytes(n.file_size)} · {n.category}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {new Date(n.created_at).toLocaleDateString()} · <Download className="size-3 inline -mt-0.5" /> {n.download_count ?? 0}
                    {n.cover_source ? ` · cover: ${n.cover_source}` : " · no cover"}
                  </p>
                </div>
                {rowBusy === n.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                <label title="Replace cover image" className="inline-flex">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) replaceCover(n, f); }} />
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted cursor-pointer"><ImageIcon className="size-4" /></span>
                </label>
                <Button size="sm" variant="ghost" title="Auto-detect cover" disabled={rowBusy === n.id} onClick={() => redetectCover(n)}><RefreshCw className="size-4" /></Button>
                <label title="Replace file" className="inline-flex">
                  <input type="file" className="hidden" accept=".pdf,.ppt,.pptx,.doc,.docx,.jpg,.jpeg,.png,.webp,.zip" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) replacePdf(n, f); }} />
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted cursor-pointer"><Upload className="size-4" /></span>
                </label>
                <Button size="sm" variant="ghost" onClick={() => setEditing(n)}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this note?")) delNote.mutate(n); }}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
            ))}
          </div>
        </div>

      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-card border border-border rounded-2xl p-5 max-w-lg w-full space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg">Edit Note</h3>
            <div><Label>Title</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Subject</Label>
                <Select value={editing.subject_id || "none"} onValueChange={(v) => setEditing({ ...editing, subject_id: v === "none" ? null : v, chapter_id: null })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={editing.category} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notes">Notes</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="ppt">PPT</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                    <SelectItem value="dpp">DPP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
