import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Download, Eye, Loader2, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { getPptQuestions, listPptTests } from "@/lib/mcq-ppt.functions";
import { PPT_HEIGHT, PPT_WIDTH, pptFilename, type PptPayload, type QuestionLayout, type TextBlock } from "@/lib/mcq-ppt-model";
import { buildMcqPpt, downloadPpt, makePptBackground, pptFont, preparePptLayout } from "@/lib/mcq-ppt";

type Generated = { payload: PptPayload; layouts: QuestionLayout[]; background: string; blob: Blob; cover: boolean; chapter: string };

export function McqPptGenerator() {
  const { role } = useAuth();
  const list = useServerFn(listPptTests);
  const fetchQuestions = useServerFn(getPptQuestions);
  const [testId, setTestId] = useState("");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [selected, setSelected] = useState<string[]>([]);
  const [cover, setCover] = useState(false);
  const [chapter, setChapter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [preview, setPreview] = useState(false);
  const [slide, setSlide] = useState(0);
  const tests = useQuery({ queryKey: ["ppt-tests"], queryFn: () => list(), enabled: role === "admin" });
  const questions = useQuery({ queryKey: ["ppt-questions", testId, language], queryFn: () => fetchQuestions({ data: { testId, language } }), enabled: role === "admin" && !!testId });
  useEffect(() => { setSelected(questions.data?.questions.map((q) => q.id) ?? []); setGenerated(null); setError(""); }, [questions.data]);
  useEffect(() => { setGenerated(null); }, [selected, cover, chapter]);
  if (role !== "admin") return null;
  const rows = questions.data?.questions ?? [];
  const byId = new Map(rows.map((q) => [q.id, q]));
  function move(index: number, direction: number) {
    setSelected((ids) => {
      const next = [...ids]; const a = next[index]; const b = next[index + direction];
      if (!a || !b) return ids;
      next[index] = b; next[index + direction] = a; return next;
    });
  }
  async function generate() {
    setBusy(true); setError(""); setGenerated(null);
    try {
      // Re-authorize and read the current database version before generating.
      const fresh = await fetchQuestions({ data: { testId, language } });
      const map = new Map(fresh.questions.map((q) => [q.id, q]));
      const ordered = selected.map((id) => { const q = map.get(id); if (!q) throw new Error("A selected question changed or was deleted. Reload the test and select again."); return q; });
      const payload = { test: fresh.test, questions: ordered };
      const layouts = await preparePptLayout(ordered);
      const background = makePptBackground();
      const blob = await buildMcqPpt(payload, layouts, background, cover, chapter);
      setGenerated({ payload, layouts, background, blob, cover, chapter });
      setSlide(0);
    } catch (e) { setError(e instanceof Error ? e.message : "PowerPoint generation failed."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5">
    <h2 className="text-lg font-semibold">MCQ to PowerPoint</h2>
    <fieldset disabled={busy} className="space-y-5 min-w-0">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label>Select Test</Label><Select value={testId} onValueChange={(id) => { setTestId(id); setSelected([]); setGenerated(null); }}><SelectTrigger aria-label="Select Test"><SelectValue placeholder={tests.isLoading ? "Loading tests…" : "Select a test"} /></SelectTrigger><SelectContent>{tests.data?.map((test) => <SelectItem key={test.id} value={test.id}>{test.title}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label>Question language</Label><Select value={language} onValueChange={(v) => { setLanguage(v === "hi" ? "hi" : "en"); setGenerated(null); }}><SelectTrigger aria-label="Question language"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="hi">Hindi (English if unavailable)</SelectItem></SelectContent></Select></div>
      </div>
      {(error || tests.error || questions.error) && <p role="alert" className="text-destructive text-sm">{error || tests.error?.message || questions.error?.message}</p>}
      {questions.isFetching && <p className="text-muted-foreground text-sm">Loading questions…</p>}
      {!!questions.data?.skipped && <p className="text-sm text-muted-foreground">{questions.data.skipped} non-MCQ questions excluded.</p>}
      {testId && !questions.isFetching && !questions.error && rows.length === 0 && <p className="text-muted-foreground">No four-option MCQs in this test.</p>}
      {rows.length > 0 && <>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setSelected(rows.map((q) => q.id))}>Select All Questions</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear selection</Button>
          <Label htmlFor="ppt-count">Number of questions</Label><Input id="ppt-count" className="w-24" type="number" min={0} max={rows.length} value={selected.length} onChange={(e) => { const count = Math.max(0, Math.min(rows.length, Number(e.target.value) || 0)); setSelected((ids) => count < ids.length ? ids.slice(0, count) : [...ids, ...rows.filter((q) => !ids.includes(q.id)).slice(0, count - ids.length).map((q) => q.id)]); }} />
          <span className="text-sm text-muted-foreground">{selected.length} / {rows.length} selected</span>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div><h3 className="font-medium mb-2">Select Specific Questions</h3><div className="max-h-[480px] overflow-y-auto divide-y divide-border border-y border-border">
            {rows.map((q) => <label key={q.id} className="flex gap-3 py-4 pr-3 cursor-pointer"><Checkbox aria-label={`Select Q${q.number}`} className="mt-1 shrink-0" checked={selected.includes(q.id)} onCheckedChange={(v) => setSelected((ids) => v ? [...ids, q.id] : ids.filter((id) => id !== q.id))} /><div className="min-w-0"><p className="text-sm font-semibold break-words">Q.{q.number} {q.question}</p><ol className="mt-2 space-y-1 text-sm text-muted-foreground">{q.options.map((o, i) => <li key={i} className="break-words">[{String.fromCharCode(65 + i)}] {o}</li>)}</ol></div></label>)}
          </div></div>
          <div><div className="flex flex-wrap justify-between gap-2 mb-2"><h3 className="font-medium">Question Order</h3><Button variant="ghost" size="sm" onClick={() => setSelected(rows.filter((q) => selected.includes(q.id)).map((q) => q.id))}>Original order</Button></div><div className="max-h-[480px] overflow-y-auto divide-y divide-border border-y border-border">
            {selected.map((id, i) => { const q = byId.get(id); return q ? <div key={id} className="flex items-center gap-2 py-2"><span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}</span><p className="flex-1 min-w-0 text-sm line-clamp-2">Q.{q.number} {q.question}</p><Button size="icon" variant="ghost" title="Move up" aria-label={`Move Q${q.number} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button><Button size="icon" variant="ghost" title="Move down" aria-label={`Move Q${q.number} down`} disabled={i === selected.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button></div> : null; })}
          </div></div>
        </div>
      </>}
      <label className="flex items-center gap-2"><Checkbox checked={cover} onCheckedChange={(v) => setCover(v === true)} /> <span className="text-sm">Add Cover Slide</span></label>
      {cover && <div className="max-w-md space-y-2"><Label htmlFor="ppt-chapter">Chapter name (optional)</Label><Input id="ppt-chapter" maxLength={200} value={chapter} onChange={(e) => setChapter(e.target.value)} /></div>}
      <div className="flex flex-wrap gap-3"><Button onClick={generate} disabled={busy || !selected.length || questions.isFetching}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Presentation className="size-4" />} {busy ? "Generating…" : "Generate PowerPoint"}</Button><Button variant="outline" disabled={!generated} onClick={() => setPreview(true)}><Eye className="size-4" /> Preview PPT</Button><Button variant="secondary" disabled={!generated} onClick={() => { if (generated) downloadPpt(generated.blob, pptFilename(generated.payload.test.title)); }}><Download className="size-4" /> Download PowerPoint</Button></div>
      {generated && <p role="status" className="text-sm text-muted-foreground">{generated.payload.questions.length + Number(generated.cover)} slides ready · {pptFilename(generated.payload.test.title)}</p>}
    </fieldset>
    <Dialog open={preview} onOpenChange={setPreview}><DialogContent className="max-w-6xl w-[96vw]"><DialogHeader><DialogTitle>PowerPoint Preview</DialogTitle></DialogHeader>{generated && <>
      <PptPreview generated={generated} index={slide} onStep={(delta) => setSlide((n) => Math.max(0, Math.min(generated.payload.questions.length - 1 + Number(generated.cover), n + delta)))} />
      <div className="flex items-center justify-between"><Button variant="outline" size="icon" aria-label="Previous slide" disabled={slide === 0} onClick={() => setSlide((n) => n - 1)}><ArrowLeft className="size-4" /></Button><span className="text-sm">Slide {slide + 1} / {generated.payload.questions.length + Number(generated.cover)}</span><Button variant="outline" size="icon" aria-label="Next slide" disabled={slide >= generated.payload.questions.length - 1 + Number(generated.cover)} onClick={() => setSlide((n) => n + 1)}><ArrowRight className="size-4" /></Button></div>
    </>}</DialogContent></Dialog>
  </section>;
}

function PptPreview({ generated, index, onStep }: { generated: Generated; index: number; onStep: (delta: number) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const touchX = useRef(0);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const node = container.current; if (!node) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setScale(entry.contentRect.width / 1920); });
    observer.observe(node); return () => observer.disconnect();
  }, []);
  const qIndex = index - Number(generated.cover);
  const q = generated.payload.questions[qIndex];
  const layout = generated.layouts[qIndex];
  const px = 1920 / PPT_WIDTH;
  const text = (block: TextBlock, color: string) => <div className={`absolute whitespace-pre-wrap ${color}`} style={{ left: block.x * px, top: (block.y + 0.07) * px, width: block.w * px, height: block.h * px, fontSize: block.size * px / 72, lineHeight: 1.15, fontWeight: block.bold ? 700 : 400, fontFamily: pptFont(block.text) }}>{block.lines.join("\n")}</div>;
  return <div ref={container} className="relative w-full aspect-video overflow-hidden" onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? 0; }} onTouchEnd={(e) => { const delta = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current; if (Math.abs(delta) > 50) onStep(delta < 0 ? 1 : -1); }}>
    <div className="absolute left-0 top-0 origin-top-left ppt-slide" style={{ width: 1920, height: PPT_HEIGHT * px, transform: `scale(${scale})`, backgroundImage: `url(${generated.background})`, backgroundSize: "100% 100%" }}>
      {q && layout ? <><div className="absolute ppt-heading font-bold" style={{ left: 0.78 * px, top: 0.42 * px, fontSize: 32 * px / 72 }}>Q.{q.number}</div>{text(layout.question, "ppt-heading")}{layout.options.map((option, i) => <div key={i}><div className="absolute ppt-option" style={{ left: 0.78 * px, top: option.y * px, width: 11.8 * px, height: option.h * px, borderRadius: 12 }} /><div className="absolute ppt-label flex items-center justify-center font-bold" style={{ left: 0.78 * px, top: option.y * px, width: 0.8 * px, height: option.h * px, fontSize: 28 * px / 72, borderRadius: 12 }}>{String.fromCharCode(65 + i)}</div>{text(option, "ppt-ink")}</div>)}</> : <div className="absolute ppt-heading" style={{ left: 0.85 * px, top: 1.8 * px, width: 11.5 * px }}><p style={{ fontSize: 28 * px / 72 }}>{generated.payload.test.subject}</p><h2 className="font-bold mt-12" style={{ fontSize: 40 * px / 72 }}>{generated.payload.test.title}</h2>{generated.chapter && <p className="mt-12 ppt-ink" style={{ fontSize: 26 * px / 72 }}>{generated.chapter}</p>}</div>}
    </div>
  </div>;
}