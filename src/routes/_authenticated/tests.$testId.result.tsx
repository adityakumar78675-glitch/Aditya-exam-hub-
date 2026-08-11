import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getResult, startAttempt } from "@/lib/tests.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { RichMarkdown } from "@/components/RichMarkdown";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, MinusCircle, Clock, Trophy, Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tests/$testId/result")({
  component: ResultPage,
  validateSearch: (s: Record<string, unknown>) => ({
    attempt: s['attempt'] ? Number(s['attempt']) : undefined,
    solutions: s['solutions'] ? true : undefined,
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

function ResultPage() {
  const { testId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const fetchResult = useServerFn(getResult);
  const start = useServerFn(startAttempt);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"summary" | "solutions">(search.solutions ? "solutions" : "summary");
  const [lang, setLang] = useState<"en" | "hi">("en");

  const { data, isLoading, error } = useQuery({
    queryKey: ["test-result", testId, search.attempt ?? "latest"],
    queryFn: () => fetchResult({ data: { testId, attemptNumber: search.attempt } }),
    retry: false,
  });

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
      <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-4">
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

  const { test, attempt, rank, totalParticipants, solutions, history, best, canStartNew, attemptLimit } = data;
  const attempted = attempt.correct + attempt.incorrect;
  const accuracy = attempted ? Math.round((attempt.correct / attempted) * 100) : 0;
  const percentage = attempt.total_marks ? Math.round((attempt.score / attempt.total_marks) * 1000) / 10 : 0;
  const mins = Math.floor(attempt.time_taken_seconds / 60);
  const secs = attempt.time_taken_seconds % 60;

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">{test.title}</h1>
      <p className="text-sm text-muted-foreground mt-1">
        {test.subject ? `${test.subject} · ` : ""}Result · Attempt {attempt.attempt_number}
        {attemptLimit ? ` of ${attemptLimit}` : ""}
      </p>

      <Card className="mt-5 p-6">
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
      </Card>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Metric icon={<CheckCircle2 className="size-4 text-primary" />} label="Correct" value={attempt.correct} />
        <Metric icon={<XCircle className="size-4 text-destructive" />} label="Incorrect" value={attempt.incorrect} />
        <Metric icon={<MinusCircle className="size-4 text-muted-foreground" />} label="Unattempted" value={attempt.unattempted} />
        <Metric icon={<Target className="size-4 text-accent" />} label="Accuracy" value={`${accuracy}%`} />
        <Metric icon={<Clock className="size-4" />} label="Time taken" value={`${mins}m ${secs}s`} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
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
        {tab === "solutions" && (
          <Select value={lang} onValueChange={(v) => setLang(v as "en" | "hi")}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="hi">हिन्दी</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {tab === "summary" ? (
        <Card className="mt-4 p-6 space-y-4">
          <Bar label="Correct" value={attempt.correct} total={attempt.correct + attempt.incorrect + attempt.unattempted} className="bg-primary" />
          <Bar label="Incorrect" value={attempt.incorrect} total={attempt.correct + attempt.incorrect + attempt.unattempted} className="bg-destructive" />
          <Bar label="Unattempted" value={attempt.unattempted} total={attempt.correct + attempt.incorrect + attempt.unattempted} className="bg-muted-foreground" />
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {solutions?.map((s) => {
            const text = (lang === "hi" && s.question_hi) || s.question_en;
            const opts = lang === "hi" && s.options_hi?.length ? s.options_hi : s.options_en;
            const sol = (lang === "hi" && s.solution_hi) || s.solution_en;
            return (
              <Card key={s.id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">Question {s.number}</h3>
                  {s.verdict === true ? (
                    <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Correct</Badge>
                  ) : s.verdict === false ? (
                    <Badge className="bg-destructive/15 text-destructive hover:bg-destructive/15">Incorrect</Badge>
                  ) : (
                    <Badge variant="outline">Not graded</Badge>
                  )}
                </div>
                <div className="mt-2">
                  <RichMarkdown>{text}</RichMarkdown>
                </div>
                {s.image_url && (
                  <img src={s.image_url} alt={`Diagram for question ${s.number}`} loading="lazy" className="mt-3 rounded-lg border border-border w-full" />
                )}
                {s.type === "mcq" && (
                  <ul className="mt-3 space-y-2">
                    {opts.map((o, i) => {
                      const isCorrectOpt = s.correct_option === i;
                      const isYours = Number(s.your_answer) === i && s.your_answer !== null;
                      return (
                        <li
                          key={i}
                          className={`rounded-lg border p-3 text-sm ${
                            isCorrectOpt
                              ? "border-primary bg-primary/10"
                              : isYours
                                ? "border-destructive bg-destructive/10"
                                : "border-border"
                          }`}
                        >
                          <span className="font-semibold mr-2">{String.fromCharCode(65 + i)}.</span>
                          {o}
                          {isYours && <span className="ml-2 text-xs text-muted-foreground">(your answer)</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {s.type !== "mcq" && (
                  <div className="mt-3 text-sm space-y-1">
                    <p>
                      <span className="text-muted-foreground">Your answer: </span>
                      {s.your_answer === null || s.your_answer === "" ? "—" : String(s.your_answer)}
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
                {sol && (
                  <div className="mt-4 rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Solution</p>
                    <RichMarkdown>{sol}</RichMarkdown>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
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
