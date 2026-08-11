import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminListQuestions, adminSaveQuestion, adminDeleteQuestion, type QuestionInput } from "@/lib/tests.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, ListChecks, ArrowLeft, Zap } from "lucide-react";
import { BulkQuestionsDialog } from "@/components/BulkQuestionsDialog";


type TestRow = {
  id: string;
  batch_id: string | null;
  title: string;
  subject: string | null;
  instructions: string | null;
  duration_minutes: number;
  positive_marks: number;
  negative_marks: number;
  languages: string[];
  randomize_questions: boolean;
  randomize_options: boolean;
  show_solutions: boolean;
  leaderboard_enabled: boolean;
  start_at: string | null;
  end_at: string | null;
  is_published: boolean;
  allow_reattempts: boolean;
  max_attempts: number | null;
  ranking_mode: "best" | "latest" | "average";
};

const emptyTest = (): Partial<TestRow> => ({
  title: "",
  subject: "",
  instructions: "",
  duration_minutes: 60,
  positive_marks: 4,
  negative_marks: 1,
  languages: ["en"],
  randomize_questions: false,
  randomize_options: false,
  show_solutions: true,
  leaderboard_enabled: false,
  is_published: false,
  batch_id: null,
  allow_reattempts: true,
  max_attempts: null,
  ranking_mode: "best",
});

export function TestsAdmin() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<TestRow> | null>(null);
  const [managing, setManaging] = useState<TestRow | null>(null);

  const { data: batches } = useQuery({
    queryKey: ["admin-batches-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("batches").select("id, title").order("title");
      if (error) throw error;
      return data;
    },
  });

  const { data: tests, isLoading } = useQuery({
    queryKey: ["admin-tests"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tests").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as TestRow[];
    },
  });

  const save = useMutation({
    mutationFn: async (t: Partial<TestRow>) => {
      const payload = {
        batch_id: t.batch_id || null,
        title: t.title ?? "",
        subject: t.subject || null,
        instructions: t.instructions || null,
        duration_minutes: Number(t.duration_minutes ?? 60),
        positive_marks: Number(t.positive_marks ?? 4),
        negative_marks: Number(t.negative_marks ?? 1),
        languages: t.languages?.length ? t.languages : ["en"],
        randomize_questions: !!t.randomize_questions,
        randomize_options: !!t.randomize_options,
        show_solutions: !!t.show_solutions,
        leaderboard_enabled: !!t.leaderboard_enabled,
        start_at: t.start_at || null,
        end_at: t.end_at || null,
        is_published: !!t.is_published,
        allow_reattempts: t.allow_reattempts !== false,
        max_attempts: t.allow_reattempts === false ? 1 : t.max_attempts && t.max_attempts > 0 ? Number(t.max_attempts) : null,
        ranking_mode: t.ranking_mode ?? "best",
      };
      if (t.id) {
        const { error } = await supabase.from("tests").update(payload).eq("id", t.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tests").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Test saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-tests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Test deleted");
      qc.invalidateQueries({ queryKey: ["admin-tests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (managing) {
    return <QuestionsManager test={managing} onBack={() => setManaging(null)} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold">Test Series</h2>
        <Button size="sm" onClick={() => setEditing(emptyTest())}>
          <Plus className="size-4 mr-1" /> New Test
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !tests?.length ? (
        <p className="text-sm text-muted-foreground">No tests yet.</p>
      ) : (
        <div className="space-y-2">
          {tests.map((t) => (
            <div key={t.id} className="rounded-lg border border-border p-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{t.title}</p>
                  {t.is_published ? <Badge>Published</Badge> : <Badge variant="outline">Draft</Badge>}
                  {t.subject && <Badge variant="secondary">{t.subject}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {t.duration_minutes} min · +{t.positive_marks}/-{t.negative_marks} ·{" "}
                  {t.languages.join(", ")} {t.leaderboard_enabled ? "· leaderboard" : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="outline" onClick={() => setManaging(t)}>
                  <ListChecks className="size-4 mr-1" /> Questions
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditing(t)}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(t.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit test" : "New test"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Subject</Label>
                  <Input value={editing.subject ?? ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} />
                </div>
                <div>
                  <Label>Batch (optional)</Label>
                  <Select
                    value={editing.batch_id ?? "none"}
                    onValueChange={(v) => setEditing({ ...editing, batch_id: v === "none" ? null : v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">All students</SelectItem>
                      {batches?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Instructions (markdown)</Label>
                <Textarea rows={4} value={editing.instructions ?? ""} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Duration (min)</Label>
                  <Input type="number" value={editing.duration_minutes ?? 60} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Correct marks</Label>
                  <Input type="number" step="0.25" value={editing.positive_marks ?? 4} onChange={(e) => setEditing({ ...editing, positive_marks: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Negative marks</Label>
                  <Input type="number" step="0.25" value={editing.negative_marks ?? 1} onChange={(e) => setEditing({ ...editing, negative_marks: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start at</Label>
                  <Input type="datetime-local" value={toLocal(editing.start_at)} onChange={(e) => setEditing({ ...editing, start_at: fromLocal(e.target.value) })} />
                </div>
                <div>
                  <Label>End at</Label>
                  <Input type="datetime-local" value={toLocal(editing.end_at)} onChange={(e) => setEditing({ ...editing, end_at: fromLocal(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-3">
                <Toggle label="Hindi language option" checked={!!editing.languages?.includes("hi")} onChange={(v) => setEditing({ ...editing, languages: v ? ["en", "hi"] : ["en"] })} />
                <Toggle label="Randomize question order" checked={!!editing.randomize_questions} onChange={(v) => setEditing({ ...editing, randomize_questions: v })} />
                <Toggle label="Randomize option order" checked={!!editing.randomize_options} onChange={(v) => setEditing({ ...editing, randomize_options: v })} />
                <Toggle label="Show solutions after submit" checked={!!editing.show_solutions} onChange={(v) => setEditing({ ...editing, show_solutions: v })} />
                <Toggle label="Enable leaderboard / rank" checked={!!editing.leaderboard_enabled} onChange={(v) => setEditing({ ...editing, leaderboard_enabled: v })} />
                <Toggle label="Published" checked={!!editing.is_published} onChange={(v) => setEditing({ ...editing, is_published: v })} />
                <Toggle
                  label="Allow reattempts"
                  checked={editing.allow_reattempts !== false}
                  onChange={(v) => setEditing({ ...editing, allow_reattempts: v, max_attempts: v ? editing.max_attempts ?? null : 1 })}
                />
              </div>
              {editing.allow_reattempts !== false && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Maximum attempts</Label>
                    <Select
                      value={editing.max_attempts && editing.max_attempts > 0 ? String(editing.max_attempts) : "unlimited"}
                      onValueChange={(v) => setEditing({ ...editing, max_attempts: v === "unlimited" ? null : Number(v) })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unlimited">Unlimited</SelectItem>
                        {[1, 2, 3, 5].map((n) => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      className="mt-2"
                      placeholder="Custom limit (blank = unlimited)"
                      value={editing.max_attempts ?? ""}
                      onChange={(e) => setEditing({ ...editing, max_attempts: e.target.value ? Number(e.target.value) : null })}
                    />
                  </div>
                  <div>
                    <Label>Ranking uses</Label>
                    <Select
                      value={editing.ranking_mode ?? "best"}
                      onValueChange={(v) => setEditing({ ...editing, ranking_mode: v as TestRow["ranking_mode"] })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="best">Best attempt</SelectItem>
                        <SelectItem value="latest">Latest attempt</SelectItem>
                        <SelectItem value="average">Average of attempts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.title}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function toLocal(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}
function fromLocal(v: string) {
  return v ? new Date(v).toISOString() : null;
}

/* ---------------- questions ---------------- */

type QState = QuestionInput & { id?: string };

const emptyQuestion = (testId: string, order: number): QState => ({
  test_id: testId,
  order_index: order,
  type: "mcq",
  question_en: "",
  question_hi: "",
  image_url: "",
  options_en: ["", "", "", ""],
  options_hi: ["", "", "", ""],
  correct_option: 0,
  correct_numeric: null,
  correct_bool: true,
  solution_en: "",
  solution_hi: "",
  positive_marks: null,
  negative_marks: null,
});

function QuestionsManager({ test, onBack }: { test: TestRow; onBack: () => void }) {
  const qc = useQueryClient();
  const list = useServerFn(adminListQuestions);
  const saveFn = useServerFn(adminSaveQuestion);
  const delFn = useServerFn(adminDeleteQuestion);
  const [editing, setEditing] = useState<QState | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);


  const { data: questions, isLoading } = useQuery({
    queryKey: ["admin-test-questions", test.id],
    queryFn: () => list({ data: { testId: test.id } }),
  });

  const save = useMutation({
    mutationFn: (q: QState) => saveFn({ data: q }),
    onSuccess: () => {
      toast.success("Question saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin-test-questions", test.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Question deleted");
      qc.invalidateQueries({ queryKey: ["admin-test-questions", test.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> All tests
        </button>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            <Zap className="size-4 mr-1" /> Bulk Add Questions
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(emptyQuestion(test.id, (questions?.length ?? 0) + 1))}>
            <Plus className="size-4 mr-1" /> Add Question
          </Button>
        </div>
      </div>
      <h2 className="font-semibold mb-3">{test.title} — Questions</h2>

      <BulkQuestionsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        testId={test.id}
        defaultPositive={test.positive_marks}
        defaultNegative={test.negative_marks}
        onImported={() => qc.invalidateQueries({ queryKey: ["admin-test-questions", test.id] })}
      />


      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !questions?.length ? (
        <p className="text-sm text-muted-foreground">No questions yet.</p>
      ) : (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={q.id} className="rounded-lg border border-border p-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
              <div className="min-w-0">
                <p className="text-sm truncate">
                  <span className="font-semibold mr-2">Q{i + 1}.</span>
                  {q.question_en}
                </p>
                <Badge variant="secondary" className="mt-1 uppercase text-[10px]">{q.type}</Badge>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(q as unknown as QState)}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(q.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit question" : "New question"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v as QState["type"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mcq">MCQ</SelectItem>
                      <SelectItem value="numerical">Numerical</SelectItem>
                      <SelectItem value="truefalse">True / False</SelectItem>
                      <SelectItem value="subjective">Subjective</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Order</Label>
                  <Input type="number" value={editing.order_index} onChange={(e) => setEditing({ ...editing, order_index: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Image URL</Label>
                  <Input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} />
                </div>
              </div>

              <div>
                <Label>Question (English) — supports $LaTeX$</Label>
                <Textarea rows={3} value={editing.question_en} onChange={(e) => setEditing({ ...editing, question_en: e.target.value })} />
              </div>
              {test.languages.includes("hi") && (
                <div>
                  <Label>Question (Hindi)</Label>
                  <Textarea rows={3} value={editing.question_hi ?? ""} onChange={(e) => setEditing({ ...editing, question_hi: e.target.value })} />
                </div>
              )}

              {editing.type === "mcq" && (
                <div className="space-y-2">
                  <Label>Options (select the correct one)</Label>
                  {(editing.options_en ?? ["", "", "", ""]).map((o, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correct"
                          checked={editing.correct_option === i}
                          onChange={() => setEditing({ ...editing, correct_option: i })}
                        />
                        <Input
                          placeholder={`Option ${String.fromCharCode(65 + i)}`}
                          value={o}
                          onChange={(e) => {
                            const arr = [...(editing.options_en ?? [])];
                            arr[i] = e.target.value;
                            setEditing({ ...editing, options_en: arr });
                          }}
                        />
                      </div>
                      {test.languages.includes("hi") && (
                        <Input
                          className="ml-6 w-[calc(100%-1.5rem)]"
                          placeholder={`विकल्प ${String.fromCharCode(65 + i)}`}
                          value={(editing.options_hi ?? [])[i] ?? ""}
                          onChange={(e) => {
                            const arr = [...(editing.options_hi ?? ["", "", "", ""])];
                            arr[i] = e.target.value;
                            setEditing({ ...editing, options_hi: arr });
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {editing.type === "numerical" && (
                <div>
                  <Label>Correct numerical answer</Label>
                  <Input
                    type="number"
                    step="any"
                    value={editing.correct_numeric ?? ""}
                    onChange={(e) => setEditing({ ...editing, correct_numeric: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </div>
              )}

              {editing.type === "truefalse" && (
                <div>
                  <Label>Correct answer</Label>
                  <Select value={String(editing.correct_bool ?? true)} onValueChange={(v) => setEditing({ ...editing, correct_bool: v === "true" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Marks (override)</Label>
                  <Input type="number" step="0.25" placeholder={String(test.positive_marks)} value={editing.positive_marks ?? ""} onChange={(e) => setEditing({ ...editing, positive_marks: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Negative (override)</Label>
                  <Input type="number" step="0.25" placeholder={String(test.negative_marks)} value={editing.negative_marks ?? ""} onChange={(e) => setEditing({ ...editing, negative_marks: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <Label>Solution (English)</Label>
                <Textarea rows={3} value={editing.solution_en ?? ""} onChange={(e) => setEditing({ ...editing, solution_en: e.target.value })} />
              </div>
              {test.languages.includes("hi") && (
                <div>
                  <Label>Solution (Hindi)</Label>
                  <Textarea rows={3} value={editing.solution_hi ?? ""} onChange={(e) => setEditing({ ...editing, solution_hi: e.target.value })} />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending || !editing?.question_en}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
