import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getTestMeta, startAttempt } from "@/lib/tests.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RichMarkdown } from "@/components/RichMarkdown";
import { ArrowLeft, Clock, FileText, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tests/$testId/")({
  component: TestInstructions,
  head: () => ({
    meta: [
      { title: "Test Instructions | Aditya Exam Hub" },
      { name: "description", content: "Read the exam instructions, marking scheme and duration before starting your test attempt." },
      { property: "og:title", content: "Test Instructions | Aditya Exam Hub" },
      { property: "og:description", content: "Read the exam instructions and marking scheme before starting your attempt." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TestInstructions() {
  const { testId } = Route.useParams();
  const navigate = useNavigate();
  const fetchMeta = useServerFn(getTestMeta);
  const start = useServerFn(startAttempt);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["test-meta", testId],
    queryFn: () => fetchMeta({ data: { testId } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-8 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 max-w-3xl mx-auto text-center">
        <p className="text-muted-foreground">{(error as Error)?.message ?? "Test not available."}</p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/tests">Back to Test Series</Link>
        </Button>
      </div>
    );
  }

  const { test, attempt, question_count } = data;
  const history = data.attempts ?? [];
  const hasActive = data.hasActive ?? (!!attempt && !attempt.submitted_at);
  const canStartNew = data.canStartNew ?? true;
  const attemptLimit = data.attemptLimit ?? null;
  const submitted = history.length > 0;
  const best = history.length ? history.reduce((b, a) => (a.score > b.score ? a : b)) : null;

  const onStart = async () => {
    setBusy(true);
    try {
      await start({ data: { testId } });
      navigate({ to: "/tests/$testId/attempt", params: { testId } });
    } catch (e) {
      toast.error((e as Error).message || "Could not start the test");
      setBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <Link to="/tests" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Test Series
      </Link>

      <h1 className="text-2xl font-bold mt-3">{test.title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {test.subject && <Badge variant="secondary">{test.subject}</Badge>}
        {test.leaderboard_enabled && (
          <Badge variant="outline" className="gap-1">
            <Trophy className="size-3" /> Ranked
          </Badge>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat icon={<Clock className="size-4" />} label="Duration" value={`${test.duration_minutes} min`} />
        <Stat icon={<FileText className="size-4" />} label="Questions" value={String(question_count)} />
        <Stat label="Correct" value={`+${test.positive_marks}`} />
        <Stat label="Incorrect" value={`-${test.negative_marks}`} />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold mb-2">Instructions</h2>
        {test.instructions ? (
          <RichMarkdown>{test.instructions}</RichMarkdown>
        ) : (
          <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
            <li>The timer starts as soon as you begin and continues even if you close the page.</li>
            <li>Each correct answer awards +{test.positive_marks} marks; each wrong answer deducts {test.negative_marks} marks.</li>
            <li>Unanswered questions carry no penalty.</li>
            <li>You may mark questions for review and return to them later.</li>
            <li>The test auto-submits when the timer reaches zero.</li>
            <li>You get only one attempt.</li>
          </ul>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap gap-3">
        {submitted ? (
          <Button asChild>
            <Link to="/tests/$testId/result" params={{ testId }}>View Result</Link>
          </Button>
        ) : (
          <Button onClick={onStart} disabled={busy || question_count === 0} size="lg">
            {busy ? "Starting..." : attempt ? "Resume Test" : "Start Test"}
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/tests">Back to Test Series</Link>
        </Button>
      </div>
      {question_count === 0 && (
        <p className="text-sm text-muted-foreground mt-3">This test has no questions yet.</p>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon} {label}
      </p>
      <p className="font-semibold mt-1">{value}</p>
    </div>
  );
}
