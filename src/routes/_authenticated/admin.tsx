import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Users, BookOpen, Video, IndianRupee, Play } from "lucide-react";


export const Route = createFileRoute("/_authenticated/admin")({ component: AdminPage });

const CLASSES = ["Class 11th", "Class 12th", "JEE", "NEET", "Bihar Board", "Dropper"];

function AdminPage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (!loading && role !== "admin") navigate({ to: "/dashboard", replace: true }); }, [role, loading, navigate]);
  if (loading || role !== "admin") return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="flex flex-col">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-8 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Admin Panel</h1>
        <span className="text-xs uppercase font-bold text-accent bg-accent/10 px-3 py-1 rounded-full">Admin</span>
      </header>
      <div className="p-8 max-w-6xl mx-auto w-full">
        <Tabs defaultValue="overview">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="lectures">Curriculum</TabsTrigger>
            <TabsTrigger value="notes">Extra Notes</TabsTrigger>
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="banners">Banners</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
            <TabsTrigger value="community">Community</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-6"><Overview /></TabsContent>
          <TabsContent value="batches" className="mt-6"><BatchesAdmin /></TabsContent>
          <TabsContent value="lectures" className="mt-6"><LecturesAdmin /></TabsContent>
          <TabsContent value="notes" className="mt-6"><ExtraNotesAdmin /></TabsContent>
          <TabsContent value="live" className="mt-6"><LiveAdmin /></TabsContent>
          <TabsContent value="banners" className="mt-6"><BannersAdmin /></TabsContent>
          <TabsContent value="students" className="mt-6"><StudentsAdmin /></TabsContent>
          <TabsContent value="community" className="mt-6"><CommunityAdmin /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: any) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-primary" />
      </div>
      <p className="text-3xl font-extrabold mt-2">{value}</p>
    </div>
  );
}

function Overview() {
  const { data } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [students, batches, lectures, enrolls] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("batches").select("id, price, discount_price", { count: "exact" }),
        supabase.from("lectures").select("id", { count: "exact", head: true }),
        supabase.from("enrollments").select("batch_id"),
      ]);
      const revenue = (enrolls.data ?? []).reduce((sum, e) => {
        const b = (batches.data ?? []).find((x) => x.id === e.batch_id);
        return sum + (b ? Number(b.discount_price ?? b.price ?? 0) : 0);
      }, 0);
      return {
        students: students.count ?? 0,
        batches: batches.count ?? 0,
        lectures: lectures.count ?? 0,
        revenue,
      };
    },
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Stat icon={Users} label="Total Students" value={data?.students ?? "—"} />
      <Stat icon={BookOpen} label="Active Batches" value={data?.batches ?? "—"} />
      <Stat icon={Video} label="Total Lectures" value={data?.lectures ?? "—"} />
      <Stat icon={IndianRupee} label="Est. Revenue" value={`₹${data?.revenue ?? 0}`} />
    </div>
  );
}

function BatchesAdmin() {
  const qc = useQueryClient();
  const { data: batches = [] } = useQuery({
    queryKey: ["admin-batches"],
    queryFn: async () => (await supabase.from("batches").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("batches").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Batch deleted"); qc.invalidateQueries({ queryKey: ["admin-batches"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><BatchDialog onSaved={() => qc.invalidateQueries({ queryKey: ["admin-batches"] })} /></div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase">
            <tr><th className="text-left p-3">Title</th><th className="text-left p-3">Class</th><th className="text-left p-3">Price</th><th className="text-left p-3">Open</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {batches.map((b: any) => (
              <tr key={b.id} className="border-t border-border">
                <td className="p-3 font-medium">{b.title}</td>
                <td className="p-3">{b.class_level}</td>
                <td className="p-3">₹{b.discount_price ?? b.price}</td>
                <td className="p-3">{b.enrollment_open ? "Yes" : "No"}</td>
                <td className="p-3 text-right space-x-1">
                  <BatchDialog initial={b} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-batches"] })} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete batch?")) del.mutate(b.id); }}><Trash2 className="size-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No batches yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BatchDialog({ initial, onSaved, trigger }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: "", description: "", class_level: "JEE", subjects: "", mentors: "", price: 0, discount_price: "", thumbnail_url: "", enrollment_open: true });

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        ...initial,
        subjects: (initial.subjects ?? []).join(", "),
        discount_price: initial.discount_price ?? "",
      } : { title: "", description: "", class_level: "JEE", subjects: "", mentors: "", price: 0, discount_price: "", thumbnail_url: "", enrollment_open: true });
    }
  }, [open, initial]);

  async function save() {
    if (!form.title || !form.class_level) { toast.error("Title and class required"); return; }
    const payload = {
      title: form.title,
      description: form.description,
      class_level: form.class_level,
      subjects: form.subjects.split(",").map((s: string) => s.trim()).filter(Boolean),
      mentors: form.mentors,
      price: Number(form.price) || 0,
      discount_price: form.discount_price === "" ? null : Number(form.discount_price),
      thumbnail_url: form.thumbnail_url || null,
      enrollment_open: form.enrollment_open,
    };
    const q = initial ? supabase.from("batches").update(payload).eq("id", initial.id) : supabase.from("batches").insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "Updated" : "Created");
    setOpen(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus className="size-4 mr-1" /> New Batch</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit batch" : "Create batch"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Class</Label>
              <Select value={form.class_level} onValueChange={(v) => setForm({ ...form, class_level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Subjects (comma-separated)</Label><Input value={form.subjects} onChange={(e) => setForm({ ...form, subjects: e.target.value })} placeholder="Physics, Chemistry" /></div>
          </div>
          <div><Label>Mentors</Label><Input value={form.mentors} onChange={(e) => setForm({ ...form, mentors: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><Label>Discount price</Label><Input type="number" value={form.discount_price} onChange={(e) => setForm({ ...form, discount_price: e.target.value })} /></div>
          </div>
          <div><Label>Thumbnail URL</Label><Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} /></div>
          <div className="flex items-center justify-between"><Label>Enrollment open</Label>
            <Switch checked={form.enrollment_open} onCheckedChange={(v) => setForm({ ...form, enrollment_open: v })} />
          </div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type AdminSubject = { id: string; batch_id: string; name: string; sort_order: number; icon: string | null; chapters?: AdminChapter[] };
type AdminChapter = { id: string; subject_id: string; title: string; sort_order: number };

function LecturesAdmin() {
  const qc = useQueryClient();
  const [batchId, setBatchId] = useState<string>("");

  const { data: batches = [] } = useQuery({
    queryKey: ["admin-batches-min"],
    queryFn: async () => (await supabase.from("batches").select("id, title").order("created_at", { ascending: false })).data ?? [],
  });

  useEffect(() => { if (!batchId && batches[0]) setBatchId(batches[0].id); }, [batches, batchId]);

  const { data: subjects = [] } = useQuery({
    queryKey: ["admin-curriculum", batchId],
    enabled: !!batchId,
    queryFn: async () => (await supabase
      .from("subjects")
      .select("id, batch_id, name, icon, sort_order, chapters(id, subject_id, title, sort_order)")
      .eq("batch_id", batchId)
      .order("sort_order", { ascending: true })
      .order("sort_order", { referencedTable: "chapters", ascending: true })).data ?? [],
  });

  const { data: lectures = [] } = useQuery({
    queryKey: ["admin-curriculum-lectures", batchId],
    enabled: !!batchId,
    queryFn: async () => (await supabase.from("lectures").select("*, materials(*)").eq("batch_id", batchId).order("order_index", { ascending: true })).data ?? [],
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-curriculum"] });
    qc.invalidateQueries({ queryKey: ["admin-curriculum-lectures"] });
    qc.invalidateQueries({ queryKey: ["curriculum"] });
  };

  const deleteLecture = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("materials").delete().eq("lecture_id", id);
      const { error } = await supabase.from("lectures").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Lecture deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteChapter = useMutation({
    mutationFn: async (id: string) => {
      const lectureIds = lectures.filter((l: any) => l.chapter_id === id).map((l: any) => l.id);
      if (lectureIds.length) await supabase.from("materials").delete().in("lecture_id", lectureIds);
      await supabase.from("lectures").delete().eq("chapter_id", id);
      const { error } = await supabase.from("chapters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Chapter deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteSubject = useMutation({
    mutationFn: async (id: string) => {
      const lectureIds = lectures.filter((l: any) => l.subject_id === id).map((l: any) => l.id);
      if (lectureIds.length) await supabase.from("materials").delete().in("lecture_id", lectureIds);
      await supabase.from("lectures").delete().eq("subject_id", id);
      await supabase.from("chapters").delete().eq("subject_id", id);
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Subject deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-end justify-between">
        <div className="flex-1 max-w-xs">
          <Label>Batch</Label>
          <Select value={batchId} onValueChange={setBatchId}>
            <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
            <SelectContent>{batches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {batchId && <SubjectDialog batchId={batchId} onSaved={invalidate} />}
      </div>
      <div className="space-y-3">
        {(subjects as AdminSubject[]).map((subject) => {
          const chapters = (subject.chapters ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
          return (
            <div key={subject.id} className="bg-card border border-border rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-bold">{subject.name}</p>
                  <p className="text-xs text-muted-foreground">{chapters.length} chapters • {lectures.filter((l: any) => l.subject_id === subject.id).length} lectures</p>
                </div>
                <ChapterDialog subjectId={subject.id} onSaved={invalidate} />
                <SubjectDialog batchId={batchId} initial={subject} onSaved={invalidate} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
                <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this subject and its chapters/lectures?")) deleteSubject.mutate(subject.id); }}><Trash2 className="size-4 text-destructive" /></Button>
              </div>
              <div className="space-y-2 pl-0 md:pl-4">
                {chapters.map((chapter) => {
                  const chapterLectures = lectures.filter((l: any) => l.chapter_id === chapter.id);
                  return (
                    <div key={chapter.id} className="border border-border rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex-1 min-w-[180px]">
                          <p className="font-semibold">{chapter.title}</p>
                          <p className="text-xs text-muted-foreground">{chapterLectures.length} lectures</p>
                        </div>
                        <LectureDialog batchId={batchId} subjectId={subject.id} chapterId={chapter.id} onSaved={invalidate} />
                        <ChapterDialog subjectId={subject.id} initial={chapter} onSaved={invalidate} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete this chapter and its lectures?")) deleteChapter.mutate(chapter.id); }}><Trash2 className="size-4 text-destructive" /></Button>
                      </div>
                      <div className="space-y-2">
                        {chapterLectures.map((l: any) => (
                          <div key={l.id} className="bg-muted/40 rounded-lg p-3 flex items-center gap-3 flex-wrap">
                            <div className="flex-1 min-w-[180px]">
                              <p className="font-medium flex items-center gap-2 flex-wrap">{l.title}{l.is_free && <span className="bg-accent/10 text-accent font-bold px-2 py-0.5 rounded uppercase text-[10px]">Free</span>}</p>
                              <p className="text-xs text-muted-foreground">{l.is_live ? "Live" : "Recorded"} • {l.duration_minutes ?? 0} min • {l.materials?.length ?? 0} materials</p>
                            </div>
                            <Link to="/lectures/$lectureId" params={{ lectureId: l.id }}><Button size="sm" variant="outline"><Play className="size-4 mr-1" /> Preview</Button></Link>
                            <LectureDialog batchId={batchId} subjectId={subject.id} chapterId={chapter.id} initial={l} onSaved={invalidate} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
                            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete lecture?")) deleteLecture.mutate(l.id); }}><Trash2 className="size-4 text-destructive" /></Button>
                          </div>
                        ))}
                        {chapterLectures.length === 0 && <p className="text-xs text-muted-foreground">No lectures in this chapter yet.</p>}
                      </div>
                    </div>
                  );
                })}
                {chapters.length === 0 && <p className="text-sm text-muted-foreground">No Chapters Available Yet</p>}
              </div>
            </div>
          );
        })}
        {batchId && subjects.length === 0 && <p className="text-muted-foreground text-sm">No Chapters Available Yet</p>}
      </div>
    </div>
  );
}

function SubjectDialog({ batchId, initial, onSaved, trigger }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", icon: "", sort_order: 0 });

  useEffect(() => {
    if (open) setForm(initial ? { name: initial.name ?? "", icon: initial.icon ?? "", sort_order: initial.sort_order ?? 0 } : { name: "", icon: "", sort_order: 0 });
  }, [open, initial]);

  async function save() {
    if (!form.name.trim()) { toast.error("Subject name required"); return; }
    const payload = { batch_id: batchId, name: form.name.trim(), icon: form.icon.trim() || null, sort_order: Number(form.sort_order) || 0 };
    const { error } = initial
      ? await supabase.from("subjects").update(payload).eq("id", initial.id)
      : await supabase.from("subjects").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "Subject updated" : "Subject added");
    setOpen(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus className="size-4 mr-1" /> Add Subject</Button>}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? "Edit subject" : "Add subject"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Physics" /></div>
          <div><Label>Icon</Label><Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="Optional emoji or URL" /></div>
          <div><Label>Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChapterDialog({ subjectId, initial, onSaved, trigger }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", sort_order: 0 });

  useEffect(() => {
    if (open) setForm(initial ? { title: initial.title ?? "", sort_order: initial.sort_order ?? 0 } : { title: "", sort_order: 0 });
  }, [open, initial]);

  async function save() {
    if (!form.title.trim()) { toast.error("Chapter title required"); return; }
    const payload = { subject_id: subjectId, title: form.title.trim(), sort_order: Number(form.sort_order) || 0 };
    const { error } = initial
      ? await supabase.from("chapters").update(payload).eq("id", initial.id)
      : await supabase.from("chapters").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(initial ? "Chapter updated" : "Chapter added");
    setOpen(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm"><Plus className="size-4 mr-1" /> Add Chapter</Button>}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{initial ? "Edit chapter" : "Add chapter"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Electric Charges and Fields" /></div>
          <div><Label>Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LectureDialog({ batchId, subjectId, chapterId, initial, onSaved, trigger }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: "", description: "", video_url: "", thumbnail_url: "", duration_minutes: 0, order_index: 0, is_live: false, is_free: false, scheduled_at: "" });
  const [materials, setMaterials] = useState<any[]>([]);
  const [newMat, setNewMat] = useState({ title: "", file_url: "", file_type: "pdf" });

  useEffect(() => {
    if (open) {
      setForm(initial ? {
        ...initial,
        scheduled_at: initial.scheduled_at ? new Date(initial.scheduled_at).toISOString().slice(0, 16) : "",
      } : { title: "", description: "", video_url: "", thumbnail_url: "", duration_minutes: 0, order_index: 0, is_live: false, is_free: false, scheduled_at: "" });
      setMaterials(initial?.materials ?? []);
    }
  }, [open, initial]);


  async function save() {
    if (!form.title) { toast.error("Title required"); return; }
    const payload = {
      batch_id: batchId,
      subject_id: subjectId,
      chapter_id: chapterId,
      title: form.title,
      description: form.description,
      video_url: form.video_url || null,
      thumbnail_url: form.thumbnail_url || null,
      duration_minutes: Number(form.duration_minutes) || null,
      order_index: Number(form.order_index) || 0,
      is_live: form.is_live,
      is_free: !!form.is_free,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,

    };
    const res = initial
      ? await supabase.from("lectures").update(payload).eq("id", initial.id).select().single()
      : await supabase.from("lectures").insert(payload).select().single();
    if (res.error) { toast.error(res.error.message); return; }
    const lectureId = res.data.id;
    // Save new materials (existing ones aren't edited here for simplicity)
    if (newMat.title && newMat.file_url) {
      await supabase.from("materials").insert({ lecture_id: lectureId, ...newMat });
    }
    toast.success("Saved");
    setOpen(false);
    onSaved?.();
  }

  async function delMat(id: string) {
    await supabase.from("materials").delete().eq("id", id);
    setMaterials(materials.filter((m) => m.id !== id));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus className="size-4 mr-1" /> New Lecture</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? "Edit lecture" : "Add lecture"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Description</Label><Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Video URL (MP4, YouTube, Vimeo, Google Drive)</Label><Input value={form.video_url ?? ""} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://..." /></div>
          <div><Label>Thumbnail URL</Label><Input value={form.thumbnail_url ?? ""} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Duration (min)</Label><Input type="number" value={form.duration_minutes ?? 0} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></div>
            <div><Label>Order</Label><Input type="number" value={form.order_index ?? 0} onChange={(e) => setForm({ ...form, order_index: e.target.value })} /></div>
          </div>
          <div className="flex items-center justify-between"><Label>Free preview lecture</Label>
            <Switch checked={!!form.is_free} onCheckedChange={(v) => setForm({ ...form, is_free: v })} />
          </div>
          <div className="flex items-center justify-between"><Label>Live class</Label>
            <Switch checked={form.is_live} onCheckedChange={(v) => setForm({ ...form, is_live: v })} />
          </div>

          {form.is_live && (
            <div><Label>Scheduled at</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
          )}
          {initial && (
            <div className="border-t border-border pt-3">
              <Label className="mb-2 block">Materials</Label>
              {materials.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm py-1">
                  <span>{m.title} ({m.file_type})</span>
                  <Button size="sm" variant="ghost" onClick={() => delMat(m.id)}><Trash2 className="size-3 text-destructive" /></Button>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Input placeholder="Title" value={newMat.title} onChange={(e) => setNewMat({ ...newMat, title: e.target.value })} />
                <Input placeholder="File URL" value={newMat.file_url} onChange={(e) => setNewMat({ ...newMat, file_url: e.target.value })} />
                <Select value={newMat.file_type} onValueChange={(v) => setNewMat({ ...newMat, file_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="pdf">PDF</SelectItem><SelectItem value="notes">Notes</SelectItem><SelectItem value="ppt">PPT</SelectItem></SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground mt-1">New material added on Save.</p>
            </div>
          )}
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StudentsAdmin() {
  const qc = useQueryClient();
  const { data: students = [] } = useQuery({
    queryKey: ["admin-students"],
    queryFn: async () => {
      const [p, e, m] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("enrollments").select("student_id, batch_id"),
        supabase.from("community_messages").select("student_id"),
      ]);
      const enrollCount = new Map<string, number>();
      (e.data ?? []).forEach((r: any) => enrollCount.set(r.student_id, (enrollCount.get(r.student_id) ?? 0) + 1));
      const msgCount = new Map<string, number>();
      (m.data ?? []).forEach((r: any) => msgCount.set(r.student_id, (msgCount.get(r.student_id) ?? 0) + 1));
      return (p.data ?? []).map((s: any) => ({ ...s, batches: enrollCount.get(s.id) ?? 0, messages: msgCount.get(s.id) ?? 0 }));
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: "blocked" | "community_blocked"; value: boolean }) => {
      const update = field === "blocked" ? { blocked: value } : { community_blocked: value };
      const { error } = await supabase.from("profiles").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-students"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-x-auto">
      <table className="w-full text-sm min-w-[800px]">
        <thead className="bg-muted text-muted-foreground text-xs uppercase">
          <tr>
            <th className="text-left p-3">Name</th>
            <th className="text-left p-3">Class</th>
            <th className="text-left p-3">Phone</th>
            <th className="text-left p-3">Batches</th>
            <th className="text-left p-3">Msgs</th>
            <th className="text-left p-3">Status</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {students.map((s: any) => (
            <tr key={s.id} className="border-t border-border">
              <td className="p-3 font-medium">{s.full_name || "—"}</td>
              <td className="p-3">{s.class_level ?? "—"}</td>
              <td className="p-3">{s.phone ?? "—"}</td>
              <td className="p-3">{s.batches}</td>
              <td className="p-3">{s.messages}</td>
              <td className="p-3 space-x-1">
                {s.blocked && <span className="text-destructive text-xs">Batch blocked</span>}
                {s.community_blocked && <span className="text-destructive text-xs">Chat blocked</span>}
                {!s.blocked && !s.community_blocked && <span className="text-accent text-xs">Active</span>}
              </td>
              <td className="p-3 text-right space-x-2 whitespace-nowrap">
                <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: s.id, field: "blocked", value: !s.blocked })}>
                  {s.blocked ? "Unblock" : "Block batch"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: s.id, field: "community_blocked", value: !s.community_blocked })}>
                  {s.community_blocked ? "Unblock chat" : "Block chat"}
                </Button>
              </td>
            </tr>
          ))}
          {students.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No students yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ExtraNotesAdmin() {
  const qc = useQueryClient();
  const { data: batches = [] } = useQuery({
    queryKey: ["admin-batches-list"],
    queryFn: async () => (await supabase.from("batches").select("id, title").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: notes = [] } = useQuery({
    queryKey: ["admin-extra-notes"],
    queryFn: async () => (await supabase.from("extra_notes").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("extra_notes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-extra-notes"] }); },
  });
  const titleOf = (id: string) => batches.find((b: any) => b.id === id)?.title ?? "—";
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ExtraNoteDialog batches={batches} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-extra-notes"] })} />
      </div>
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase">
            <tr><th className="text-left p-3">Title</th><th className="text-left p-3">Batch</th><th className="text-left p-3">Category</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {notes.map((n: any) => (
              <tr key={n.id} className="border-t border-border">
                <td className="p-3 font-medium"><a href={n.pdf_url} target="_blank" rel="noreferrer" className="hover:underline">{n.title}</a></td>
                <td className="p-3">{titleOf(n.batch_id)}</td>
                <td className="p-3">{n.category}</td>
                <td className="p-3 text-right space-x-2">
                  <ExtraNoteDialog batches={batches} initial={n} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-extra-notes"] })}
                    trigger={<Button size="sm" variant="outline"><Pencil className="size-4" /></Button>} />
                  <Button size="sm" variant="outline" onClick={() => del.mutate(n.id)}><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
            {notes.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">No notes yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExtraNoteDialog({ batches, initial, onSaved, trigger }: any) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    title: initial?.title ?? "",
    batch_id: initial?.batch_id ?? "",
    category: initial?.category ?? "notes",
    pdf_url: initial?.pdf_url ?? "",
    sort_order: initial?.sort_order ?? 0,
  });
  async function save() {
    if (!f.title || !f.batch_id || !f.pdf_url) { toast.error("Title, batch and PDF URL required"); return; }
    const payload = { ...f, sort_order: Number(f.sort_order) || 0 };
    const { error } = initial
      ? await supabase.from("extra_notes").update(payload).eq("id", initial.id)
      : await supabase.from("extra_notes").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setOpen(false); onSaved?.();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus className="size-4 mr-1" /> Add Note</Button>}</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{initial ? "Edit" : "Add"} Extra Note</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><Label>Batch</Label>
            <Select value={f.batch_id} onValueChange={(v) => setF({ ...f, batch_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
              <SelectContent>{batches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Category</Label>
            <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="notes">Notes</SelectItem>
                <SelectItem value="handwritten">Handwritten Notes</SelectItem>
                <SelectItem value="formula">Formula Sheet</SelectItem>
                <SelectItem value="important-questions">Important Questions</SelectItem>
                <SelectItem value="dpp">DPP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>PDF URL</Label><Input value={f.pdf_url} onChange={(e) => setF({ ...f, pdf_url: e.target.value })} /></div>
          <div><Label>Sort order</Label><Input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} /></div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommunityAdmin() {
  const qc = useQueryClient();
  const { data: messages = [] } = useQuery({
    queryKey: ["admin-community"],
    queryFn: async () => (await supabase.from("community_messages").select("*").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  useEffect(() => {
    const ch = supabase.channel("admin-community-room")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_messages" },
        () => qc.invalidateQueries({ queryKey: ["admin-community"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("community_messages").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => toast.success("Deleted"),
  });
  return (
    <div className="bg-card border border-border rounded-2xl divide-y divide-border max-h-[70vh] overflow-y-auto">
      {messages.length === 0 && <p className="p-8 text-center text-muted-foreground text-sm">No messages</p>}
      {messages.map((m: any) => (
        <div key={m.id} className="p-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-primary">{m.student_name} <span className="text-muted-foreground font-normal ml-2">{new Date(m.created_at).toLocaleString()}</span></p>
            <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => del.mutate(m.id)}><Trash2 className="size-4" /></Button>
        </div>
      ))}
    </div>
  );
}


function LiveAdmin() {
  const qc = useQueryClient();
  const { data: batches = [] } = useQuery({
    queryKey: ["admin-batches-min-live"],
    queryFn: async () => (await supabase.from("batches").select("id, title").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: items = [] } = useQuery({
    queryKey: ["admin-live-classes"],
    queryFn: async () => (await supabase.from("live_classes")
      .select("id, batch_id, title, teacher, subject, thumbnail_url, status, scheduled_at, started_at, ended_at, created_at, updated_at")
      .order("created_at", { ascending: false })).data ?? [],
  });

  useEffect(() => {
    const ch = supabase.channel("admin-live-classes-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "live_classes" },
        () => qc.invalidateQueries({ queryKey: ["admin-live-classes"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === "live") patch.started_at = new Date().toISOString();
      if (status === "ended") patch.ended_at = new Date().toISOString();
      const { error } = await supabase.from("live_classes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-live-classes"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("live_classes").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-live-classes"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <LiveClassDialog batches={batches} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-live-classes"] })} />
      </div>
      <div className="space-y-2">
        {items.map((l: any) => {
          const batch = batches.find((b: any) => b.id === l.batch_id);
          return (
            <div key={l.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <p className="font-semibold flex items-center gap-2">
                  {l.title}
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${l.status === "live" ? "bg-destructive/10 text-destructive" : l.status === "ended" ? "bg-muted text-muted-foreground" : "bg-accent/10 text-accent"}`}>{l.status}</span>
                </p>
                <p className="text-xs text-muted-foreground">{batch?.title ?? "—"} • {l.teacher ?? "—"}{l.subject ? ` • ${l.subject}` : ""}</p>
                {l.scheduled_at && <p className="text-xs text-muted-foreground">Scheduled: {new Date(l.scheduled_at).toLocaleString()}</p>}
              </div>
              {l.status !== "live" && <Button size="sm" onClick={() => setStatus.mutate({ id: l.id, status: "live" })}>Start Live</Button>}
              {l.status === "live" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: l.id, status: "ended" })}>End</Button>}
              <LiveClassDialog batches={batches} initial={l} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-live-classes"] })} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
              <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) del.mutate(l.id); }}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          );
        })}
        {items.length === 0 && <p className="text-muted-foreground text-sm">No live classes yet.</p>}
      </div>
    </div>
  );
}

function LiveClassDialog({ batches, initial, onSaved, trigger }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ batch_id: "", title: "", teacher: "", subject: "", thumbnail_url: "", stream_url: "", status: "scheduled", scheduled_at: "" });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        ...initial,
        stream_url: "",
        scheduled_at: initial.scheduled_at ? new Date(initial.scheduled_at).toISOString().slice(0, 16) : "",
      });
      // stream_url is column-restricted; admins fetch it via RPC
      supabase.rpc("get_live_stream_url", { _class_id: initial.id }).then(({ data }) => {
        setForm((f: any) => ({ ...f, stream_url: (data as string | null) ?? "" }));
      });
    } else {
      setForm({ batch_id: batches?.[0]?.id ?? "", title: "", teacher: "", subject: "", thumbnail_url: "", stream_url: "", status: "scheduled", scheduled_at: "" });
    }
  }, [open, initial, batches]);

  async function save() {
    if (!form.title || !form.batch_id) { toast.error("Title and batch required"); return; }
    const payload = {
      batch_id: form.batch_id,
      title: form.title,
      teacher: form.teacher || null,
      subject: form.subject || null,
      thumbnail_url: form.thumbnail_url || null,
      stream_url: form.stream_url || null,
      status: form.status,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    };
    const q = initial
      ? supabase.from("live_classes").update(payload).eq("id", initial.id)
      : supabase.from("live_classes").insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setOpen(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus className="size-4 mr-1" /> New Live Class</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? "Edit live class" : "New live class"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Batch</Label>
            <Select value={form.batch_id} onValueChange={(v) => setForm({ ...form, batch_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select batch" /></SelectTrigger>
              <SelectContent>{batches.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Teacher</Label><Input value={form.teacher ?? ""} onChange={(e) => setForm({ ...form, teacher: e.target.value })} /></div>
            <div><Label>Subject</Label><Input value={form.subject ?? ""} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
          </div>
          <div><Label>Thumbnail URL</Label><Input value={form.thumbnail_url ?? ""} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} /></div>
          <div><Label>Stream URL (YouTube Live, MP4, etc.)</Label><Input value={form.stream_url ?? ""} onChange={(e) => setForm({ ...form, stream_url: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                  <SelectItem value="ended">Ended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Scheduled at</Label><Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BannersAdmin() {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["admin-banners"],
    queryFn: async () => (await supabase.from("homepage_banners").select("*").order("sort_order", { ascending: true })).data ?? [],
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("homepage_banners").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-banners"] }); qc.invalidateQueries({ queryKey: ["homepage-banners"] }); },
  });

  const reorder = useMutation({
    mutationFn: async ({ id, sort_order }: { id: string; sort_order: number }) => {
      const { error } = await supabase.from("homepage_banners").update({ sort_order }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-banners"] }); qc.invalidateQueries({ queryKey: ["homepage-banners"] }); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("homepage_banners").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-banners"] }); qc.invalidateQueries({ queryKey: ["homepage-banners"] }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <BannerDialog onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-banners"] }); qc.invalidateQueries({ queryKey: ["homepage-banners"] }); }} />
      </div>
      <div className="space-y-2">
        {items.map((b: any) => (
          <div key={b.id} className="bg-card border border-border rounded-xl p-3 flex items-center gap-3 flex-wrap">
            <div className="w-24 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
              {b.image_url && <img src={b.image_url} alt={b.title} className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-[180px]">
              <p className="font-semibold">{b.title}</p>
              <p className="text-xs text-muted-foreground">{b.subtitle ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground">Order: {b.sort_order} · {b.redirect_url ?? "no link"}</p>
            </div>
            <Input className="w-20" type="number" defaultValue={b.sort_order} onBlur={(e) => { const v = Number(e.target.value); if (v !== b.sort_order) reorder.mutate({ id: b.id, sort_order: v }); }} />
            <Switch checked={b.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: b.id, is_active: v })} />
            <BannerDialog initial={b} onSaved={() => { qc.invalidateQueries({ queryKey: ["admin-banners"] }); qc.invalidateQueries({ queryKey: ["homepage-banners"] }); }} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) del.mutate(b.id); }}><Trash2 className="size-4 text-destructive" /></Button>
          </div>
        ))}
        {items.length === 0 && <p className="text-muted-foreground text-sm">No banners yet.</p>}
      </div>
    </div>
  );
}

function BannerDialog({ initial, onSaved, trigger }: any) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ title: "", subtitle: "", image_url: "", button_text: "", redirect_url: "", is_active: true, sort_order: 0 });

  useEffect(() => {
    if (!open) return;
    if (initial) setForm({ ...initial });
    else setForm({ title: "", subtitle: "", image_url: "", button_text: "Explore", redirect_url: "/batches", is_active: true, sort_order: 0 });
  }, [open, initial]);

  async function save() {
    if (!form.title) { toast.error("Title required"); return; }
    const payload = {
      title: form.title,
      subtitle: form.subtitle || null,
      image_url: form.image_url || null,
      button_text: form.button_text || null,
      redirect_url: form.redirect_url || null,
      is_active: !!form.is_active,
      sort_order: Number(form.sort_order) || 0,
    };
    const q = initial
      ? supabase.from("homepage_banners").update(payload).eq("id", initial.id)
      : supabase.from("homepage_banners").insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setOpen(false);
    onSaved?.();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button><Plus className="size-4 mr-1" /> New Banner</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{initial ? "Edit banner" : "New banner"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Subtitle</Label><Input value={form.subtitle ?? ""} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></div>
          <div><Label>Image URL</Label><Input value={form.image_url ?? ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Button Text</Label><Input value={form.button_text ?? ""} onChange={(e) => setForm({ ...form, button_text: e.target.value })} /></div>
            <div><Label>Redirect URL</Label><Input value={form.redirect_url ?? ""} onChange={(e) => setForm({ ...form, redirect_url: e.target.value })} placeholder="/batches" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div><Label>Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          </div>
        </div>
        <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
