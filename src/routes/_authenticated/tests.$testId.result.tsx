import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getResult, startAttempt } from "@/lib/tests.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { RichMarkdown } from "@/components/RichMarkdown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Trophy,
  Target,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/tests/$testId/result")({
  component: ResultPage,
  validateSearch: (s: Record<string, unknown>): { attempt?: number; solutions?: boolean } => ({
    ...(s['attempt'] ? { attempt: Number(s['attempt']) } : {}),
    ...(s['solutions'] ? { solutions: true } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Test Result | Aditya Exam Hub" },
      { name: "description", content: "Your score, accuracy, rank and question-wise solutions for the attempted test." },
      { property: "og:title", content: "Test Result | Aditya Exam Hub" },
      { property: "og:description", content: "Your score, accuracy, rank and question-wise solutions." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fmtTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

function ResultPage() {
  const { testId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const fetchResult = useServerFn(getResult);
  const start = useServerFn(startAttempt);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"summary" | "solutions">(search.solutions ? "solutions" : "summary");
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [current, setCurrent] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["test-result", testId, search.attempt ?? "latest"],
    queryFn: () => fetchResult({ data: { testId, attemptNumber: search.attempt } }),
    retry: false,
  });

  const solutions = data?.solutions ?? null;
  const statuses = useMemo(
    () =>
      (solutions ?? []).map((s) => {
        const unattempted = s.your_answer === null || s.your_answer === "";
        if (unattempted) return "unattempted" as const;
        return s.verdict === true ? ("correct" as const) : s.verdict === false ? ("incorrect" as const) : ("unattempted" as const);
      }),
    [solutions],
  );

  const onRetake = async () => {
    setBusy(true);
    try {
      await start({ data: { testId } });
      navigate({ to: "/tests/$testId/attempt", params: { testId } });
    } catch (e) {
      toast.error((e as Error).message || "Could not start a new attempt");
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <p className="text-muted-foreground">{(error as Error)?.message ?? "Result not available."}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/tests">Back to Test Series</Link>
        </Button>
      </div>
    );
  }

  const { test, attempt, rank, totalParticipants, history, best, canStartNew, attemptLimit } = data;
  const attempted = attempt.correct + attempt.incorrect;
  const totalQuestions = attempt.total_questions || attempted + attempt.unattempted;
  const accuracy = attempted ? Math.round((attempt.correct / attempted) * 100) : 0;
  const percentage = attempt.total_marks ? Math.round((attempt.score / attempt.total_marks) * 1000) / 10 : 0;
  const sol = solutions?.[current] ?? null;

  return (
    <div className="pb-10">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-lg font-bold truncate">{test.title}</h1>
            <p className="text-xs text-muted-foreground">
              {test.subject ? `${test.subject} · ` : ""}Attempt {attempt.attempt_number}
              {attemptLimit ? ` of ${attemptLimit}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1">
              <Clock className="size-3.5" /> {fmtTime(attempt.time_taken_seconds)}
            </span>
            <span className="rounded-md bg-primary/15 text-primary font-semibold px-2 py-1">
              Score: {attempt.score}
            </span>
            <span className="rounded-md bg-accent/15 text-accent-foreground font-semibold px-2 py-1">
              Acc: {accuracy}%
            </span>
            {solutions && (
              <Select value={lang} onValueChange={(v) => setLang(v as "en" | "hi")}>
                <SelectTrigger className="h-8 w-[92px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">हिन्दी</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* Score card */}
        <Card className="p-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">Your score</p>
              <p className="text-4xl font-black">
                {attempt.score}
                <span className="text-lg font-medium text-muted-foreground"> / {attempt.total_marks}</span>
              </p>
              <Progress value={Math.max(0, percentage)} className="mt-3 h-2" />
              <p className="text-xs text-muted-foreground mt-1">{percentage}%</p>
            </div>
            {rank && (
              <div className="shrink-0 text-center rounded-xl border border-border p-4">
                <Trophy className="size-5 mx-auto text-accent" />
                <p className="text-2xl font-bold mt-1">#{rank}</p>
                <p className="text-[11px] text-muted-foreground">of {totalParticipants}</p>
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
            <Cell label="Total" value={totalQuestions} />
            <Cell label="Attempted" value={attempted} />
            <Cell label="Correct" value={attempt.correct} tone="text-emerald-600 dark:text-emerald-400" />
            <Cell label="Incorrect" value={attempt.incorrect} tone="text-destructive" />
            <Cell label="Unattempted" value={attempt.unattempted} tone="text-muted-foreground" />
            <Cell label="Accuracy" value={`${accuracy}%`} />
            <Cell label="Time" value={fmtTime(attempt.time_taken_seconds)} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Marking: +{test.positive_marks} correct · −{test.negative_marks} incorrect · 0 unattempted
          </p>
        </Card>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant={tab === "summary" ? "default" : "outline"} onClick={() => setTab("summary")}>
            View Performance
          </Button>
          {solutions && (
            <Button variant={tab === "solutions" ? "default" : "outline"} onClick={() => setTab("solutions")}>
              View Solutions
            </Button>
          )}
          {canStartNew && (
            <Button variant="secondary" onClick={onRetake} disabled={busy}>
              {busy ? "Starting..." : "Attempt Again"}
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/tests">Back to Test Series</Link>
          </Button>
        </div>

        {tab === "summary" ? (
          <>
            <Card className="mt-4 p-6 space-y-4">
              <Bar label="Correct" value={attempt.correct} total={totalQuestions} className="bg-emerald-500" />
              <Bar label="Incorrect" value={attempt.incorrect} total={totalQuestions} className="bg-destructive" />
              <Bar label="Unattempted" value={attempt.unattempted} total={totalQuestions} className="bg-muted-foreground" />
            </Card>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric icon={<Trophy className="size-4 text-accent" />} label="Best score" value={`${best.score}/${best.total_marks}`} />
              <Metric icon={<Target className="size-4 text-accent" />} label="Best %" value={`${best.percentage}%`} />
              <Metric icon={<CheckCircle2 className="size-4 text-primary" />} label="Best accuracy" value={`${best.accuracy}%`} />
              <Metric icon={<Clock className="size-4" />} label="Total attempts" value={best.total_attempts} />
            </div>

            <Card className="mt-4 p-5">
              <h2 className="font-semibold">My Attempts</h2>
              <ul className="mt-2 divide-y divide-border">
                {[...history].reverse().map((a) => (
                  <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">
                      Attempt {a.attempt_number}
                      {a.attempt_number === best.attempt_number && <Badge className="ml-2" variant="secondary">Best</Badge>}
                    </span>
                    <span className="text-muted-foreground">
                      {a.score}/{a.total_marks} · {a.percentage}% · {a.accuracy}% acc ·{" "}
                      {Math.floor(a.time_taken_seconds / 60)}m {a.time_taken_seconds % 60}s ·{" "}
                      {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : ""}
                    </span>
                    <Link
                      to="/tests/$testId/result"
                      params={{ testId }}
                      search={{ attempt: a.attempt_number }}
                      className="text-primary hover:underline"
                    >
                      View Result
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
            {/* Review */}
            <div>
              {sol ? (
                <ReviewCard sol={sol} lang={lang} status={statuses[current]!} />
              ) : (
                <Card className="p-6 text-sm text-muted-foreground">No questions to review.</Card>
              )}

              <div className="mt-4 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                  disabled={current === 0}
                >
                  <ChevronLeft className="size-4" /> Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {current + 1} / {solutions?.length ?? 0}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="lg:hidden"
                    onClick={() => setPaletteOpen(true)}
                  >
                    <LayoutGrid className="size-4" /> Palette
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrent((c) => Math.min((solutions?.length ?? 1) - 1, c + 1))}
                    disabled={current >= (solutions?.length ?? 1) - 1}
                  >
                    Next <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Palette (desktop) */}
            <aside className="hidden lg:block">
              <Card className="p-4 sticky top-24">
                <Palette
                  statuses={statuses}
                  marked={(solutions ?? []).map((s) => s.marked)}
                  current={current}
                  onPick={setCurrent}
                />
              </Card>
            </aside>
          </div>
        )}
      </div>

      {/* Palette (mobile sheet) */}
      {paletteOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close palette"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setPaletteOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Question Palette</h3>
              <Button size="icon" variant="ghost" onClick={() => setPaletteOpen(false)} aria-label="Close">
                <X className="size-4" />
              </Button>
            </div>
            <Palette
              statuses={statuses}
              marked={(solutions ?? []).map((s) => s.marked)}
              current={current}
              onPick={(i) => {
                setCurrent(i);
                setPaletteOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

type Status = "correct" | "incorrect" | "unattempted";

function Palette({
  statuses,
  marked,
  current,
  onPick,
}: {
  statuses: Status[];
  marked: boolean[];
  current: number;
  onPick: (i: number) => void;
}) {
  const cls = (s: Status) =>
    s === "correct"
      ? "bg-emerald-500 text-white border-emerald-500"
      : s === "incorrect"
        ? "bg-destructive text-destructive-foreground border-destructive"
        : "bg-muted text-muted-foreground border-border";
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 hidden lg:block">Question Palette</h3>
      <div className="grid grid-cols-6 lg:grid-cols-5 gap-2">
        {statuses.map((s, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            aria-label={`Question ${i + 1} ${s}`}
            className={`relative h-9 rounded-md border text-sm font-semibold transition ${cls(s)} ${
              i === current ? "ring-2 ring-offset-2 ring-primary ring-offset-background" : ""
            }`}
          >
            {i + 1}
            {marked[i] && (
              <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-orange-500 border border-card" />
            )}
          </button>
        ))}
      </div>
      <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
        <Legend className="bg-emerald-500" label="Correct" />
        <Legend className="bg-destructive" label="Incorrect" />
        <Legend className="bg-muted border border-border" label="Unattempted" />
        <Legend className="bg-orange-500" label="Marked for review" />
      </ul>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`size-3 rounded ${className}`} /> {label}
    </li>
  );
}

type Sol = NonNullable<Awaited<ReturnType<typeof getResult>>["solutions"]>[number];

function ReviewCard({ sol: s, lang, status }: { sol: Sol; lang: "en" | "hi"; status: Status }) {
  const text = (lang === "hi" && s.question_hi) || s.question_en;
  const opts = lang === "hi" && s.options_hi?.length ? s.options_hi : s.options_en;
  const explanation = (lang === "hi" && s.solution_hi) || s.solution_en;
  const yourIdx = s.your_answer === null || s.your_answer === "" ? null : Number(s.your_answer);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-semibold">
          Question {s.number}
          {s.marked && (
            <Badge variant="outline" className="ml-2 border-orange-500 text-orange-600 dark:text-orange-400">
              Marked
            </Badge>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            +{s.positive_marks} / −{s.negative_marks}
          </span>
          {status === "correct" ? (
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15">
              ✓ Correct Answer
            </Badge>
          ) : status === "incorrect" ? (
            <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">✗ Incorrect</Badge>
          ) : (
            <Badge variant="outline">Not Attempted</Badge>
          )}
        </div>
      </div>

      <div className="mt-3">
        <RichMarkdown>{text}</RichMarkdown>
      </div>
      {s.image_url && (
        <img
          src={s.image_url}
          alt={`Diagram for question ${s.number}`}
          loading="lazy"
          className="mt-3 rounded-lg border border-border w-full"
        />
      )}

      {s.type === "mcq" ? (
        <ul className="mt-4 space-y-2">
          {opts.map((o, i) => {
            const isCorrectOpt = s.correct_option === i;
            const isYours = yourIdx === i;
            return (
              <li
                key={i}
                className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${
                  isCorrectOpt
                    ? "border-emerald-500 bg-emerald-500/10"
                    : isYours
                      ? "border-destructive bg-destructive/10"
                      : "border-border"
                }`}
              >
                <span className="font-semibold">{String.fromCharCode(65 + i)}.</span>
                <span className="flex-1">{o}</span>
                {isYours && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">your answer</span>
                )}
                {isCorrectOpt && (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                )}
                {isYours && !isCorrectOpt && <XCircle className="size-4 shrink-0 text-destructive" />}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-4 text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Your answer: </span>
            {yourIdx === null && (s.your_answer === null || s.your_answer === "")
              ? "—"
              : String(s.your_answer)}
          </p>
          {s.type === "numerical" && s.correct_numeric !== null && (
            <p>
              <span className="text-muted-foreground">Correct answer: </span>
              {String(s.correct_numeric)}
            </p>
          )}
          {s.type === "truefalse" && s.correct_bool !== null && (
            <p>
              <span className="text-muted-foreground">Correct answer: </span>
              {String(s.correct_bool)}
            </p>
          )}
        </div>
      )}

      {status !== "correct" && s.type === "mcq" && s.correct_option !== null && (
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">Correct Answer: </span>
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {String.fromCharCode(65 + s.correct_option)}. {opts[s.correct_option]}
          </span>
        </p>
      )}

      <div className="mt-4 rounded-lg bg-muted/50 p-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Explanation</p>
        {explanation ? (
          <RichMarkdown>{explanation}</RichMarkdown>
        ) : (
          <p className="text-sm text-muted-foreground">Explanation not available.</p>
        )}
      </div>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="font-bold text-lg mt-1">{value}</p>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-bold mt-0.5 ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function Bar({ label, value, total, className }: { label: string; value: number; total: number; className: string }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span>{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${className}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
