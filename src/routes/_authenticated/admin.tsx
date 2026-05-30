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
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="lectures">Lectures</TabsTrigger>
            <TabsTrigger value="students">Students</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-6"><Overview /></TabsContent>
          <TabsContent value="batches" className="mt-6"><BatchesAdmin /></TabsContent>
          <TabsContent value="lectures" className="mt-6"><LecturesAdmin /></TabsContent>
          <TabsContent value="students" className="mt-6"><StudentsAdmin /></TabsContent>
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

function LecturesAdmin() {
  const qc = useQueryClient();
  const [batchId, setBatchId] = useState<string>("");

  const { data: batches = [] } = useQuery({
    queryKey: ["admin-batches-min"],
    queryFn: async () => (await supabase.from("batches").select("id, title").order("created_at", { ascending: false })).data ?? [],
  });

  useEffect(() => { if (!batchId && batches[0]) setBatchId(batches[0].id); }, [batches, batchId]);

  const { data: lectures = [] } = useQuery({
    queryKey: ["admin-lectures", batchId],
    enabled: !!batchId,
    queryFn: async () => (await supabase.from("lectures").select("*, materials(*)").eq("batch_id", batchId).order("order_index")).data ?? [],
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("lectures").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["admin-lectures"] }); },
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
        {batchId && <LectureDialog batchId={batchId} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-lectures"] })} />}
      </div>
      <div className="space-y-2">
        {lectures.map((l: any) => (
          <div key={l.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="font-semibold flex items-center gap-2">
                {l.title}
                {l.is_free && <span className="bg-accent/10 text-accent font-bold px-2 py-0.5 rounded uppercase text-[10px]">Free</span>}
              </p>
              <p className="text-xs text-muted-foreground">{l.is_live ? "Live" : "Recorded"} • {l.duration_minutes ?? 0} min • {l.materials?.length ?? 0} materials</p>
            </div>
            <Link to="/lectures/$lectureId" params={{ lectureId: l.id }}>
              <Button size="sm" variant="outline"><Play className="size-4 mr-1" /> Preview</Button>
            </Link>
            <LectureDialog batchId={batchId} initial={l} onSaved={() => qc.invalidateQueries({ queryKey: ["admin-lectures"] })} trigger={<Button size="sm" variant="ghost"><Pencil className="size-4" /></Button>} />
            <Button size="sm" variant="ghost" onClick={() => { if (confirm("Delete?")) del.mutate(l.id); }}><Trash2 className="size-4 text-destructive" /></Button>
          </div>
        ))}

        {batchId && lectures.length === 0 && <p className="text-muted-foreground text-sm">No lectures yet.</p>}
      </div>
    </div>
  );
}

function LectureDialog({ batchId, initial, onSaved, trigger }: any) {
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
    queryFn: async () => (await supabase.from("profiles").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const toggleBlock = useMutation({
    mutationFn: async ({ id, blocked }: any) => {
      const { error } = await supabase.from("profiles").update({ blocked }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["admin-students"] }); },
  });

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground text-xs uppercase">
          <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Class</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr>
        </thead>
        <tbody>
          {students.map((s: any) => (
            <tr key={s.id} className="border-t border-border">
              <td className="p-3 font-medium">{s.full_name || "—"}</td>
              <td className="p-3">{s.class_level ?? "—"}</td>
              <td className="p-3">{s.phone ?? "—"}</td>
              <td className="p-3">{s.blocked ? <span className="text-destructive">Blocked</span> : <span className="text-accent">Active</span>}</td>
              <td className="p-3 text-right">
                <Button size="sm" variant="outline" onClick={() => toggleBlock.mutate({ id: s.id, blocked: !s.blocked })}>
                  {s.blocked ? "Unblock" : "Block"}
                </Button>
              </td>
            </tr>
          ))}
          {students.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No students yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
