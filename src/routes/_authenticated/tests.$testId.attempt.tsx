import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getAttemptState, saveAnswers, submitTest, type SafeQuestion } from "@/lib/tests.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RichMarkdown } from "@/components/RichMarkdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Grid3X3, Monitor, X, ZoomIn, WifiOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tests/$testId/attempt")({
  ssr: false,
  component: AttemptPage,
  head: () => ({
    meta: [
      { title: "Test in Progress | Aditya Exam Hub" },
      { name: "description", content: "Live objective test interface with question palette, timer and auto-save." },
      { property: "og:title", content: "Test in Progress | Aditya Exam Hub" },
      { property: "og:description", content: "Live objective test interface with question palette, timer and auto-save." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type AnswerValue = number | string | boolean | null;
type Answers = Record<string, AnswerValue>;
type Marks = Record<string, boolean>;

type Status = "not-visited" | "answered" | "not-answered" | "marked" | "answered-marked";

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

function AttemptPage() {
  const { testId } = Route.useParams();
  const navigate = useNavigate();
  const fetchState = useServerFn(getAttemptState);
  const persist = useServerFn(saveAnswers);
  const doSubmit = useServerFn(submitTest);

  const { data, isLoading, error } = useQuery({
    queryKey: ["attempt", testId],
    queryFn: () => fetchState({ data: { testId } }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const [answers, setAnswers] = useState<Answers>({});
  const [marked, setMarked] = useState<Marks>({});
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState(0);
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dirty = useRef<{ answers: Answers; marked: Marks }>({ answers: {}, marked: {} });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(false);

  const active = data?.status === "active" ? data : null;
  const questions: SafeQuestion[] = useMemo(() => active?.questions ?? [], [active]);

  // hydrate saved state
  useEffect(() => {
    if (!active) return;
    setAnswers(active.answers ?? {});
    setMarked(active.marked ?? {});
    const drift = Date.now() - new Date(active.serverNow).getTime();
    const tick = () => {
      const left = (new Date(active.expiresAt).getTime() + drift - Date.now()) / 1000;
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active]);

  // restore any offline draft
  useEffect(() => {
    if (!active) return;
    const raw = localStorage.getItem(`test-draft:${testId}`);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { answers: Answers; marked: Marks };
      setAnswers((a) => ({ ...a, ...parsed.answers }));
      setMarked((m) => ({ ...m, ...parsed.marked }));
      dirty.current = { answers: { ...parsed.answers }, marked: { ...parsed.marked } };
      setPendingSync(true);
    } catch {
      /* ignore */
    }
  }, [active, testId]);

  const flush = useCallback(async () => {
    const payload = dirty.current;
    if (!Object.keys(payload.answers).length && !Object.keys(payload.marked).length) return;
    dirty.current = { answers: {}, marked: {} };
    try {
      await persist({ data: { testId, answers: payload.answers, marked: payload.marked } });
      localStorage.removeItem(`test-draft:${testId}`);
      setPendingSync(false);
    } catch {
      // keep for retry
      dirty.current = {
        answers: { ...payload.answers, ...dirty.current.answers },
        marked: { ...payload.marked, ...dirty.current.marked },
      };
      localStorage.setItem(`test-draft:${testId}`, JSON.stringify(dirty.current));
      setPendingSync(true);
    }
  }, [persist, testId]);

  const queue = useCallback(
    (patch: { answers?: Answers; marked?: Marks }) => {
      dirty.current = {
        answers: { ...dirty.current.answers, ...(patch.answers ?? {}) },
        marked: { ...dirty.current.marked, ...(patch.marked ?? {}) },
      };
      localStorage.setItem(`test-draft:${testId}`, JSON.stringify(dirty.current));
      setPendingSync(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), 700);
    },
    [flush, testId],
  );

  // periodic retry while offline
  useEffect(() => {
    const id = setInterval(() => void flush(), 15000);
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  const submit = useCallback(
    async (auto = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      await flush();
      try {
        await doSubmit({ data: { testId, auto } });
        localStorage.removeItem(`test-draft:${testId}`);
        navigate({ to: "/tests/$testId/result", params: { testId } });
      } catch (e) {
        submittedRef.current = false;
        setSubmitting(false);
        toast.error((e as Error).message || "Submission failed. Please try again.");
      }
    },
    [doSubmit, flush, navigate, testId],
  );

  // auto submit at zero
  useEffect(() => {
    if (remaining !== null && remaining <= 0 && active && !submittedRef.current) {
      toast.info("Time is up — submitting your test.");
      void submit(true);
    }
  }, [remaining, active, submit]);

  useEffect(() => {
    if (data?.status === "submitted") navigate({ to: "/tests/$testId/result", params: { testId } });
    if (data?.status === "not_started") navigate({ to: "/tests/$testId", params: { testId } });
  }, [data, navigate, testId]);

  const q = questions[current];
  useEffect(() => {
    if (q) setVisited((v) => (v[q.id] ? v : { ...v, [q.id]: true }));
  }, [q]);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !active || !q) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {(error as Error)?.message ?? "Loading test..."}
      </div>
    );
  }

  const langs = (active.test.languages ?? ["en"]) as string[];
  const showHi = lang === "hi" && langs.includes("hi");
  const qText = (showHi && q.question_hi) || q.question_en;
  const options = showHi && q.options_hi?.length ? q.options_hi : q.options_en;

  const statusOf = (qq: SafeQuestion): Status => {
    const a = answers[qq.id];
    const answered = a !== undefined && a !== null && a !== "";
    const m = !!marked[qq.id];
    if (answered && m) return "answered-marked";
    if (m) return "marked";
    if (answered) return "answered";
    if (visited[qq.id]) return "not-answered";
    return "not-visited";
  };

  const counts = questions.reduce(
    (acc, qq) => {
      const s = statusOf(qq);
      if (s === "answered" || s === "answered-marked") acc.answered++;
      else acc.unanswered++;
      if (s === "marked" || s === "answered-marked") acc.marked++;
      return acc;
    },
    { answered: 0, unanswered: 0, marked: 0 },
  );

  const setAnswer = (val: AnswerValue) => {
    setAnswers((a) => ({ ...a, [q.id]: val }));
    queue({ answers: { [q.id]: val } });
  };

  const clearAnswer = () => {
    setAnswers((a) => ({ ...a, [q.id]: null }));
    queue({ answers: { [q.id]: null } });
  };

  const toggleMark = () => {
    const next = !marked[q.id];
    setMarked((m) => ({ ...m, [q.id]: next }));
    queue({ marked: { [q.id]: next } });
  };

  const go = (i: number) => {
    setCurrent(Math.max(0, Math.min(questions.length - 1, i)));
    setPaletteOpen(false);
  };

  const paletteClass = (s: Status) =>
    ({
      "not-visited": "bg-muted text-muted-foreground border-border",
      "answered": "bg-primary text-primary-foreground border-primary",
      "not-answered": "bg-destructive/15 text-destructive border-destructive/40",
      "marked": "bg-accent text-accent-foreground border-accent",
      "answered-marked": "bg-accent text-accent-foreground border-accent ring-2 ring-primary",
    })[s];

  const Palette = (
    <div>
      <div className="grid grid-cols-6 sm:grid-cols-5 gap-2">
        {questions.map((qq, i) => (
          <button
            key={qq.id}
            type="button"
            onClick={() => go(i)}
            className={`size-10 rounded-md border text-sm font-semibold transition-transform hover:scale-105 ${paletteClass(
              statusOf(qq),
            )} ${i === current ? "outline outline-2 outline-offset-1 outline-foreground" : ""}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="mt-5 space-y-2 text-xs">
        <LegendRow className="bg-primary" label={`Attempted (${counts.answered})`} />
        <LegendRow className="bg-destructive/40" label={`Unattempted (${counts.unanswered})`} />
        <LegendRow className="bg-accent" label={`Marked for Review (${counts.marked})`} />
        <LegendRow className="bg-accent ring-2 ring-primary" label="Answered & Marked" />
        <LegendRow className="bg-muted border border-border" label="Not Visited" />
      </div>
    </div>
  );

  const isLast = current === questions.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setExitOpen(true)}
              className="shrink-0 p-2 rounded-lg hover:bg-muted"
              aria-label="Exit test"
            >
              <X className="size-5" />
            </button>
            <h1 className="truncate text-sm sm:text-base font-bold uppercase tracking-wide">
              {active.test.title}
              {active.test.subject ? ` (${active.test.subject})` : ""}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground`}
              title="System mode"
            >
              <Monitor className="size-3.5" /> Web
            </span>
            {pendingSync && (
              <span className="inline-flex items-center gap-1 text-xs text-destructive" title="Answers will sync automatically">
                <WifiOff className="size-3.5" />
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-bold tabular-nums ${
                (remaining ?? 0) < 300 ? "bg-destructive/15 text-destructive" : "bg-muted"
              }`}
            >
              <Clock className="size-4" /> {fmt(remaining ?? 0)}
            </span>
            {langs.length > 1 && (
              <Select value={lang} onValueChange={(v) => setLang(v as "en" | "hi")}>
                <SelectTrigger className="h-8 w-[92px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">हिन्दी</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              Submit
            </Button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 pb-24">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-bold text-lg">Question {current + 1}</h2>
              <div className="flex shrink-0 items-center gap-2">
                <Badge className="bg-primary/15 text-primary hover:bg-primary/15">+{q.positive_marks}</Badge>
                <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">
                  -{q.negative_marks}
                </Badge>
              </div>
            </div>

            <div className="mt-4">
              <RichMarkdown>{qText}</RichMarkdown>
            </div>

            {q.image_url && (
              <button
                type="button"
                onClick={() => setZoomSrc(q.image_url)}
                className="mt-4 relative block w-full rounded-lg border border-border overflow-hidden"
              >
                <img src={q.image_url} alt={`Diagram for question ${current + 1}`} loading="lazy" className="w-full" />
                <span className="absolute bottom-2 right-2 rounded-md bg-background/90 p-1.5">
                  <ZoomIn className="size-4" />
                </span>
              </button>
            )}

            <div className="mt-6 space-y-3">
              {q.type === "mcq" &&
                options.map((opt, i) => {
                  const selected = Number(answers[q.id]) === i && answers[q.id] !== null && answers[q.id] !== undefined;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAnswer(i)}
                      className={`w-full text-left rounded-xl border p-4 transition-colors flex gap-3 items-start ${
                        selected
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      <span
                        className={`shrink-0 size-7 rounded-full grid place-items-center text-sm font-bold ${
                          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <RichMarkdown>{opt}</RichMarkdown>
                      </span>
                    </button>
                  );
                })}

              {q.type === "truefalse" &&
                ["true", "false"].map((v) => {
                  const selected = String(answers[q.id]) === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAnswer(v === "true")}
                      className={`w-full text-left rounded-xl border p-4 font-medium capitalize transition-colors ${
                        selected
                          ? "border-primary bg-primary/10 ring-1 ring-primary"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      {v}
                    </button>
                  );
                })}

              {q.type === "numerical" && (
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="Enter your numerical answer"
                  value={answers[q.id] === null || answers[q.id] === undefined ? "" : String(answers[q.id])}
                  onChange={(e) => setAnswer(e.target.value === "" ? null : e.target.value)}
                  className="max-w-xs text-lg"
                />
              )}

              {q.type === "subjective" && (
                <Textarea
                  rows={7}
                  placeholder="Write your answer here..."
                  value={answers[q.id] === null || answers[q.id] === undefined ? "" : String(answers[q.id])}
                  onChange={(e) => setAnswer(e.target.value === "" ? null : e.target.value)}
                />
              )}
            </div>
          </div>
        </main>

        {/* Desktop palette */}
        <aside className="hidden lg:block w-72 shrink-0 border-l border-border bg-card overflow-y-auto p-4">
          <h3 className="font-semibold text-sm mb-3">Question Palette</h3>
          {Palette}
        </aside>
      </div>

      {/* Bottom nav */}
      <footer className="shrink-0 border-t border-border bg-card px-3 py-2">
        <div className="flex items-center gap-2">
          <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="lg:hidden shrink-0">
                <Grid3X3 className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Question Palette</SheetTitle>
              </SheetHeader>
              <div className="mt-4">{Palette}</div>
            </SheetContent>
          </Sheet>

          <Button variant="outline" size="sm" onClick={clearAnswer}>
            Clear
          </Button>
          <Button variant={marked[q.id] ? "default" : "outline"} size="sm" onClick={toggleMark} className="hidden sm:inline-flex">
            {marked[q.id] ? "Unmark" : "Mark for Review"}
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => go(current - 1)} disabled={current === 0}>
            Previous
          </Button>
          {isLast ? (
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              Submit Test
            </Button>
          ) : (
            <Button size="sm" onClick={() => go(current + 1)}>
              Save &amp; Next
            </Button>
          )}
        </div>
      </footer>

      {/* Submit confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit test?</DialogTitle>
            <DialogDescription>Once submitted you cannot change your answers.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 text-center">
            <SummaryBox label="Answered" value={counts.answered} tone="text-primary" />
            <SummaryBox label="Unanswered" value={counts.unanswered} tone="text-destructive" />
            <SummaryBox label="Marked" value={counts.marked} tone="text-accent-foreground" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Continue Test
            </Button>
            <Button onClick={() => void submit(false)} disabled={submitting}>
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exit confirmation */}
      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave the test?</AlertDialogTitle>
            <AlertDialogDescription>
              Your answers are saved and the timer keeps running. You can resume before time runs out.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await flush();
                navigate({ to: "/tests" });
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image zoom */}
      <Dialog open={!!zoomSrc} onOpenChange={(o) => !o && setZoomSrc(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Question diagram</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[75vh]">
            {zoomSrc && <img src={zoomSrc} alt="Question diagram enlarged" className="w-full min-w-[600px]" />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LegendRow({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`size-4 rounded ${className}`} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
