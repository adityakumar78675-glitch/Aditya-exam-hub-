import { useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminBulkInsertQuestions,
  adminGenerateQuestions,
  adminUploadQuestionImage,
} from "@/lib/tests.functions";
import {
  emptyDraft,
  findDuplicateKeys,
  indexToLetter,
  newKey,
  parseBulkText,
  rowsToDrafts,
  validateDrafts,
  type DraftQuestion,
} from "@/lib/bulk-questions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  FileSpreadsheet,
  ImagePlus,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";

const SAMPLE = `Q1. What is the SI unit of force?
A. Joule
B. Newton
C. Watt
D. Pascal
Answer: B
Marks: 4
Negative: 1
Explanation: Force is measured in newtons (N).

Q2. Value of g on Earth is approximately?
A. 8.9 m/s²
B. 9.8 m/s²
C. 10.8 m/s²
D. 7.8 m/s²
Answer: B`;

export function BulkQuestionsDialog({
  open,
  onOpenChange,
  testId,
  defaultPositive,
  defaultNegative,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  testId: string;
  defaultPositive: number;
  defaultNegative: number;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const bulkInsert = useServerFn(adminBulkInsertQuestions);
  const generate = useServerFn(adminGenerateQuestions);

  const errors = useMemo(() => validateDrafts(drafts), [drafts]);
  const duplicates = useMemo(() => findDuplicateKeys(drafts), [drafts]);
  const errorsByKey = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of errors) m.set(e.key, [...(m.get(e.key) ?? []), e.message]);
    return m;
  }, [errors]);

  const [gen, setGen] = useState({
    subject: "",
    chapter: "",
    count: 10,
    difficulty: "Medium",
    language: "English",
    exam: "",
  });

  const parseText = () => {
    const parsed = parseBulkText(text);
    if (!parsed.length) {
      toast.error("Could not find any questions in the pasted text");
      return;
    }
    setDrafts((d) => [...d, ...parsed]);
    setText("");
    toast.success(`${parsed.length} questions parsed`);
  };

  const onFile = async (file: File) => {
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error("Empty file");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, { defval: "" });
      const parsed = rowsToDrafts(rows).filter((q) => q.question_en.trim());
      if (!parsed.length) {
        toast.error("No question rows found. Check the column headers.");
        return;
      }
      setDrafts((d) => [...d, ...parsed]);
      toast.success(`${parsed.length} rows loaded`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const generating = useMutation({
    mutationFn: () =>
      generate({
        data: {
          ...gen,
          count: Number(gen.count),
          positive_marks: defaultPositive,
          negative_marks: defaultNegative,
        },
      }),
    onSuccess: (qs) => {
      const parsed = qs.map((q) => ({ ...q, key: newKey() })) as DraftQuestion[];
      setDrafts((d) => [...d, ...parsed]);
      toast.success(`${parsed.length} questions generated`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importing = useMutation({
    mutationFn: () =>
      bulkInsert({
        data: {
          testId,
          questions: drafts.map((q) => ({
            question_en: q.question_en,
            options_en: q.options_en.slice(0, 4),
            correct_option: q.correct_option as number,
            positive_marks: q.positive_marks,
            negative_marks: q.negative_marks,
            solution_en: q.solution_en,
            image_url: q.image_url,
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.inserted} questions imported`);
      setDrafts([]);
      setText("");
      onImported();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (key: string, patch: Partial<DraftQuestion>) =>
    setDrafts((d) => d.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  const move = (i: number, dir: -1 | 1) =>
    setDrafts((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const out = d.slice();
      [out[i], out[j]] = [out[j]!, out[i]!];
      return out;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-4" /> Bulk Add Questions
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="paste">
          <TabsList className="w-full grid grid-cols-3 h-auto">
            <TabsTrigger value="paste" className="text-xs sm:text-sm">Paste Text</TabsTrigger>
            <TabsTrigger value="file" className="text-xs sm:text-sm">Excel / CSV</TabsTrigger>
            <TabsTrigger value="ai" className="text-xs sm:text-sm">Master Ji</TabsTrigger>
          </TabsList>

          <TabsContent value="paste" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Paste from WhatsApp, Word, Google Docs or anywhere. Numbering is automatic.
            </p>
            <Textarea
              rows={10}
              className="font-mono text-xs"
              placeholder={SAMPLE}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={parseText} disabled={!text.trim()}>
                Parse Questions
              </Button>
              <Button size="sm" variant="outline" onClick={() => setText(SAMPLE)}>
                <Copy className="size-4 mr-1" /> Use sample format
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="file" className="space-y-3 pt-3">
            <p className="text-xs text-muted-foreground">
              Columns: Question, Option A, Option B, Option C, Option D, Correct Answer, Marks, Negative Marks,
              Explanation, Question Image URL.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet className="size-4 mr-1" /> Import Excel/CSV
            </Button>
          </TabsContent>

          <TabsContent value="ai" className="space-y-3 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Subject</Label>
                <Input value={gen.subject} onChange={(e) => setGen({ ...gen, subject: e.target.value })} />
              </div>
              <div>
                <Label>Chapter / Topic</Label>
                <Input value={gen.chapter} onChange={(e) => setGen({ ...gen, chapter: e.target.value })} />
              </div>
              <div>
                <Label>Number of questions</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={gen.count}
                  onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Difficulty</Label>
                <Select value={gen.difficulty} onValueChange={(v) => setGen({ ...gen, difficulty: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Easy">Easy</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="Hard">Hard</SelectItem>
                    <SelectItem value="Mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Language</Label>
                <Select value={gen.language} onValueChange={(v) => setGen({ ...gen, language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="English">English</SelectItem>
                    <SelectItem value="Hindi">Hindi</SelectItem>
                    <SelectItem value="Hinglish">Hinglish</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Board / Exam</Label>
                <Input
                  placeholder="CBSE, JEE, NEET..."
                  value={gen.exam}
                  onChange={(e) => setGen({ ...gen, exam: e.target.value })}
                />
              </div>
            </div>
            <Button size="sm" onClick={() => generating.mutate()} disabled={generating.isPending || !gen.subject.trim()}>
              <Sparkles className="size-4 mr-1" />
              {generating.isPending ? "Generating..." : "Generate with Master Ji"}
            </Button>
          </TabsContent>
        </Tabs>

        {drafts.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Badge variant="secondary">{drafts.length} questions</Badge>
              {errors.length > 0 && (
                <Badge variant="destructive">{errors.length} issue{errors.length > 1 ? "s" : ""}</Badge>
              )}
              {duplicates.size > 0 && (
                <>
                  <Badge className="bg-amber-500 text-white">{duplicates.size} duplicate questions found</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDrafts((d) => d.filter((q) => !duplicates.has(q.key)))}
                  >
                    Remove Duplicates
                  </Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setDrafts([])}>
                Clear all
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDrafts((d) => [...d, emptyDraft()])}>
                Add blank
              </Button>
            </div>

            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
              {drafts.map((q, i) => (
                <DraftCard
                  key={q.key}
                  q={q}
                  number={i + 1}
                  duplicate={duplicates.has(q.key)}
                  issues={errorsByKey.get(q.key) ?? []}
                  defaultPositive={defaultPositive}
                  defaultNegative={defaultNegative}
                  onChange={(patch) => update(q.key, patch)}
                  onDelete={() => setDrafts((d) => d.filter((x) => x.key !== q.key))}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                />
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => importing.mutate()}
            disabled={!drafts.length || errors.length > 0 || importing.isPending}
          >
            {importing.isPending
              ? "Importing..."
              : errors.length > 0
                ? `Fix ${errors.length} error${errors.length > 1 ? "s" : ""} to import`
                : `✓ Import All Questions (${drafts.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DraftCard({
  q,
  number,
  issues,
  duplicate,
  defaultPositive,
  defaultNegative,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  q: DraftQuestion;
  number: number;
  issues: string[];
  duplicate: boolean;
  defaultPositive: number;
  defaultNegative: number;
  onChange: (patch: Partial<DraftQuestion>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const upload = useServerFn(adminUploadQuestionImage);
  const imgRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async (file: File) => {
    setUploading(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      const res = await upload({
        data: { fileName: file.name, contentType: file.type, dataBase64: btoa(bin) },
      });
      onChange({ image_url: res.url });
      toast.success("Image uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${issues.length ? "border-destructive/60" : "border-border"}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold shrink-0">Q{number}.</span>
        {duplicate && <Badge className="bg-amber-500 text-white text-[10px]">Duplicate</Badge>}
        <div className="ml-auto flex gap-1">
          <Button size="icon" variant="ghost" onClick={onMoveUp}><ArrowUp className="size-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onMoveDown}><ArrowDown className="size-4" /></Button>
          <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="size-4 text-destructive" /></Button>
        </div>
      </div>

      {issues.length > 0 && (
        <p className="text-xs text-destructive flex items-start gap-1">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          {issues.join(" · ")}
        </p>
      )}

      <Textarea rows={2} value={q.question_en} onChange={(e) => onChange({ question_en: e.target.value })} />

      <div className="space-y-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${q.key}`}
              checked={q.correct_option === i}
              onChange={() => onChange({ correct_option: i })}
            />
            <span className="text-xs w-4 text-muted-foreground">{indexToLetter(i)}</span>
            <Input
              value={q.options_en[i] ?? ""}
              onChange={(e) => {
                const arr = [...q.options_en];
                while (arr.length < 4) arr.push("");
                arr[i] = e.target.value;
                onChange({ options_en: arr });
              }}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          step="0.25"
          placeholder={`Marks (${defaultPositive})`}
          value={q.positive_marks ?? ""}
          onChange={(e) => onChange({ positive_marks: e.target.value === "" ? null : Number(e.target.value) })}
        />
        <Input
          type="number"
          step="0.25"
          placeholder={`Negative (${defaultNegative})`}
          value={q.negative_marks ?? ""}
          onChange={(e) => onChange({ negative_marks: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </div>

      <Textarea
        rows={2}
        placeholder="Explanation (optional)"
        value={q.solution_en ?? ""}
        onChange={(e) => onChange({ solution_en: e.target.value })}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Image URL (optional)"
          value={q.image_url ?? ""}
          onChange={(e) => onChange({ image_url: e.target.value })}
          className="flex-1 min-w-[12rem]"
        />
        <input
          ref={imgRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickImage(f);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" onClick={() => imgRef.current?.click()} disabled={uploading}>
          {uploading ? <Upload className="size-4 animate-pulse" /> : <ImagePlus className="size-4" />}
          <span className="ml-1">{uploading ? "Uploading" : "Upload"}</span>
        </Button>
      </div>
      {q.image_url && (
        <img src={q.image_url} alt={`Question ${number} illustration`} className="max-h-32 rounded border border-border" />
      )}
    </div>
  );
}
