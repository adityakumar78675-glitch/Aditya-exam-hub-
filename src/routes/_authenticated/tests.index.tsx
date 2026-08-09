import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listTests } from "@/lib/tests.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, FileText, Trophy, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tests/")({
  component: TestList,
  head: () => ({
    meta: [
      { title: "Practice Tests | Aditya Exam Hub" },
      { name: "description", content: "Attempt full-length objective tests with a real competitive-exam interface, instant results and detailed solutions." },
      { property: "og:title", content: "Practice Tests | Aditya Exam Hub" },
      { property: "og:description", content: "Attempt full-length objective tests with instant results and detailed solutions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function TestList() {
  const fetchTests = useServerFn(listTests);
  const { data, isLoading } = useQuery({
    queryKey: ["tests"],
    queryFn: () => fetchTests(),
  });

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Practice Tests</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Full-length objective tests with a real exam interface.
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <Card className="p-10 text-center text-muted-foreground">
          No tests published yet. Check back soon.
        </Card>
      ) : (
        <div className="space-y-3">
          {data.map((t) => (
            <Link
              key={t.id}
              to="/tests/$testId"
              params={{ testId: t.id }}
              className="block rounded-xl border border-border bg-card p-4 hover:border-primary/60 transition-colors"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold truncate">{t.title}</h2>
                    {t.subject && <Badge variant="secondary">{t.subject}</Badge>}
                    {t.leaderboard_enabled && (
                      <Badge variant="outline" className="gap-1">
                        <Trophy className="size-3" /> Ranked
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3.5" /> {t.duration_minutes} min
                    </span>
                    <span className="flex items-center gap-1">
                      <FileText className="size-3.5" /> {t.question_count} questions
                    </span>
                    <span>
                      +{t.positive_marks} / -{t.negative_marks}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {t.attempt?.submitted ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      <CheckCircle2 className="size-4" />
                      {t.attempt.score}/{t.attempt.total_marks}
                    </span>
                  ) : t.attempt ? (
                    <Badge>In progress</Badge>
                  ) : (
                    <Badge variant="outline">Not attempted</Badge>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
