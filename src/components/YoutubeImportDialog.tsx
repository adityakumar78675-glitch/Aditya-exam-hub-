import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  adminAnalyzeYoutubeSession,
  adminGetTestQuestionKeys,
  adminImportYoutubeQuestions,
} from "@/lib/youtube-import.functions";
import { extractYoutubeId, formatDuration, normalizeQuestion, type AnalyzeResult } from "@/lib/youtube-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Loader2, Trash2, Youtube } from "lucide-react";

type Row = {
  key: string;
  question: string;
  options: string[];
  correct_option: number | null;
  explanation: string | null;
  needs_review: boolean;
  review_reason: string | null;
  selected: boolean;
  editing: boolean;
};

const LETTERS = ["A", "B", "C", "D"];

function localReview(r: Row): string | null {
  const reasons: string[] = [];
  if (!r.question.trim()) reasons.push("Question is empty");
  if (r.options.length !== 4) reasons.push("Needs exactly 4 options");
  if (r.options.some((o) => !o.trim())) reasons.push("Empty option");
  const lower = r.options.map((o) => o.trim().toLowerCase());
  if (new Set(lower).size !== lower.length) reasons.push("Duplicate options");
  if (r.correct_option === null || r.correct_option < 0 || r.correct_option > 3) reasons.push("No correct answer");
  if (!r.explanation?.trim()) reasons.push("Explanation missing");
  return reasons.length ? reasons.join("; ") : null;
}

export function YoutubeImportDialog({
  open,
  onOpenChange,
  testId,
  testTitle,
  defaultPositive,
  defaultNegative,
  onImported,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  testId: string;
  testTitle: string;
  defaultPositive: number;
  defaultNegative: number;
  onImported: () => void;
}) {
  const [url, setUrl] = useState("");
  const [translate, setTranslate] = useState<"none" | "hi" | "en">("none");
  const [info, setInfo] = useState<AnalyzeResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [targetTest, setTargetTest] = useState(testId);
  const [dupMode, setDupMode] = useState<"skip" | "add">("skip");

  const analyzeFn = useServerFn(adminAnalyzeYoutubeSession);
  const importFn = useServerFn(adminImportYoutubeQuestions);
  const keysFn = useServerFn(adminGetTestQuestionKeys);

  const { data: tests } = useQuery({
    queryKey: ["admin-tests-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tests")
        .select("id, title, subject")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const { data: existingKeys } = useQuery({
    queryKey: ["admin-test-question-keys", targetTest],
    queryFn: () => keysFn({ data: { testId: targetTest } }),
    enabled: open && !!targetTest,
  });

  const dupSet = useMemo(() => new Set(existingKeys ?? []), [existingKeys]);

  const analyze = useMutation({
    mutationFn: () => analyzeFn({ data: { url, translate } }),
    onSuccess: (res) => {
      setInfo(res);
      setRows(
        res.questions.map((q, i) => ({
          key: `yt_${i}_${Math.random().toString(36).slice(2, 7)}`,
          question: q.question,
          options: [0, 1, 2, 3].map((k) => q.options[k] ?? ""),
          correct_option: q.correct_option,
          explanation: q.explanation,
          needs_review: q.needs_review,
          review_reason: q.review_reason,
          selected: !q.needs_review,
          editing: false,
        })),
      );
      if (res.transcript_status === "unavailable") {
        toast.error("Transcript is unavailable for this video. Please provide a transcript or upload the source material.");
      } else if (!res.questions.length) {
        toast.warning("No objective questions were found in this session's transcript.");
      } else {
        toast.success(`${res.questions.length} questions detected`);
      }
    },
    onError: (e: Error) => toast.error(e.message || "Network failure. Please try again."),
  });

  const selectedRows = rows.filter((r) => r.selected);
  const readyRows = rows.filter((r) => !localReview(r));
  const reviewCount = rows.length - readyRows.length;
  const duplicates = selectedRows.filter((r) => dupSet.has(normalizeQuestion(r.question)));

  const importing = useMutation({
    mutationFn: () => {
      const payload = selectedRows.filter((r) => !localReview(r));
      if (!payload.length) throw new Error("No valid questions selected");
      return importFn({
        data: {
          testId: targetTest,
          video: { id: info!.video_id, url: info!.url, title: info!.title },
          skipDuplicates: dupMode === "skip",
          questions: payload.map((r) => ({
            question_en: r.question,
            options_en: r.options,
            correct_option: r.correct_option as number,
            solution_en: r.explanation,
            positive_marks: defaultPositive,
            negative_marks: defaultNegative,
          })),
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`${r.inserted} questions added${r.skipped ? `, ${r.skipped} duplicates skipped` : ""}`);
      onImported();
      onOpenChange(false);
      setRows([]);
      setInfo(null);
      setUrl("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = (key: string, patch: Partial<Row>) =>
    setRows((d) => d.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const move = (i: number, dir: -1 | 1) =>
    setRows((d) => {
      const j = i + dir;
      if (j < 0 || j >= d.length) return d;
      const out = d.slice();
      [out[i], out[j]] = [out[j]!, out[i]!];
      return out;
    });

  const urlValid = !!extractYoutubeId(url);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Youtube className="size-4" /> YouTube Session Import
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="yt-url">YouTube Video URL</Label>
            <Input
              id="yt-url"
              placeholder="https://www.youtube.com/watch?v=VIDEO_ID"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            {url && !urlValid && (
              <p className="text-xs text-destructive">Please enter a valid YouTube video URL.</p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={translate} onValueChange={(v) => setTranslate(v as typeof translate)}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keep session language</SelectItem>
                  <SelectItem value="hi">Translate to Hindi</SelectItem>
                  <SelectItem value="en">Translate to English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => analyze.mutate()} disabled={!urlValid || analyze.isPending}>
              {analyze.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
              Analyze Video
            </Button>
          </div>

          {info && (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <p className="font-medium">{info.title}</p>
              <p className="text-muted-foreground text-xs">
                Channel: {info.channel || "—"} · Duration: {formatDuration(info.duration_seconds)} · Transcript:{" "}
                {info.transcript_status === "available"
                  ? `available${info.transcript_language ? ` (${info.transcript_language})` : ""}`
                  : "unavailable"}
              </p>
              {info.transcript_status === "unavailable" ? (
                <p className="text-xs text-destructive">
                  Transcript is unavailable for this video. Please provide a transcript or upload the source material.
                </p>
              ) : (
                <>
                  <p className="text-xs">
                    Questions detected: <strong>{rows.length}</strong> · {readyRows.length} ready to import ·{" "}
                    {reviewCount} need review
                  </p>
                  {info.truncated && (
                    <p className="text-xs text-amber-600 dark:text-amber-500">
                      The transcript was very long and only the first part could be analysed — some later questions may
                      be missing.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Button size="sm" variant="outline" onClick={() => setRows((d) => d.map((r) => ({ ...r, selected: true })))}>
                  Select All
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRows((d) => d.map((r) => ({ ...r, selected: false })))}>
                  Deselect All
                </Button>
                <span className="text-muted-foreground">
                  Selected: {selectedRows.length} / {rows.length}
                </span>
              </div>

              <div className="space-y-3">
                {rows.map((r, i) => {
                  const issue = localReview(r);
                  const isDup = dupSet.has(normalizeQuestion(r.question));
                  return (
                    <div key={r.key} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <Checkbox
                          checked={r.selected}
                          onCheckedChange={(v) => update(r.key, { selected: !!v })}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-muted-foreground">Q{i + 1}</span>
                            {issue ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="size-3" /> Needs Review
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1">
                                <CheckCircle2 className="size-3" /> Verified
                              </Badge>
                            )}
                            {isDup && (
                              <Badge variant="outline" className="gap-1">
                                <AlertTriangle className="size-3" /> Duplicate Question
                              </Badge>
                            )}
                          </div>

                          {r.editing ? (
                            <div className="space-y-2">
                              <Textarea
                                rows={2}
                                value={r.question}
                                onChange={(e) => update(r.key, { question: e.target.value })}
                              />
                              {r.options.map((o, k) => (
                                <div key={k} className="flex items-center gap-2">
                                  <span className="text-xs w-4">{LETTERS[k]}</span>
                                  <Input
                                    value={o}
                                    onChange={(e) =>
                                      update(r.key, {
                                        options: r.options.map((x, idx) => (idx === k ? e.target.value : x)),
                                      })
                                    }
                                  />
                                </div>
                              ))}
                              <div className="flex flex-wrap items-center gap-2">
                                <Label className="text-xs">Correct Answer</Label>
                                <Select
                                  value={r.correct_option === null ? "" : String(r.correct_option)}
                                  onValueChange={(v) => update(r.key, { correct_option: Number(v) })}
                                >
                                  <SelectTrigger className="w-24">
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {LETTERS.map((l, k) => (
                                      <SelectItem key={l} value={String(k)}>
                                        {l}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <Textarea
                                rows={2}
                                placeholder="Explanation"
                                value={r.explanation ?? ""}
                                onChange={(e) => update(r.key, { explanation: e.target.value })}
                              />
                            </div>
                          ) : (
                            <div className="space-y-1 text-sm">
                              <p className="whitespace-pre-wrap break-words">{r.question || "—"}</p>
                              <ul className="text-xs text-muted-foreground space-y-0.5">
                                {r.options.map((o, k) => (
                                  <li key={k} className={r.correct_option === k ? "text-foreground font-medium" : ""}>
                                    {LETTERS[k]}. {o || "—"}
                                  </li>
                                ))}
                              </ul>
                              <p className="text-xs">
                                Correct Answer:{" "}
                                <strong>{r.correct_option === null ? "—" : LETTERS[r.correct_option]}</strong>
                              </p>
                              {r.explanation && (
                                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                                  Explanation: {r.explanation}
                                </p>
                              )}
                            </div>
                          )}

                          {issue && <p className="text-xs text-destructive mt-1">{issue}</p>}
                        </div>

                        <div className="flex flex-col gap-1">
                          <Button size="icon" variant="ghost" onClick={() => move(i, -1)} aria-label="Move up">
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => move(i, 1)} aria-label="Move down">
                            <ArrowDown className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setRows((d) => d.filter((x) => x.key !== r.key))}
                            aria-label="Delete question"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => update(r.key, { editing: !r.editing })}>
                          {r.editing ? "Done" : "Edit"}
                        </Button>
                        {!issue && !r.selected && (
                          <Button size="sm" variant="secondary" onClick={() => update(r.key, { selected: true })}>
                            Approve
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 pt-2">
                <div className="space-y-1.5">
                  <Label>Add to test</Label>
                  <Select value={targetTest} onValueChange={setTargetTest}>
                    <SelectTrigger>
                      <SelectValue placeholder={testTitle} />
                    </SelectTrigger>
                    <SelectContent>
                      {(tests ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
                          {t.subject ? ` — ${t.subject}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {duplicates.length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="size-3" /> {duplicates.length} duplicate question(s)
                    </Label>
                    <Select value={dupMode} onValueChange={(v) => setDupMode(v as "skip" | "add")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">Skip duplicates</SelectItem>
                        <SelectItem value="add">Add anyway</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => importing.mutate()}
            disabled={!info || importing.isPending || selectedRows.filter((r) => !localReview(r)).length === 0}
          >
            {importing.isPending ? <Loader2 className="size-4 mr-1 animate-spin" /> : null}
            Add Selected Questions to Test ({selectedRows.filter((r) => !localReview(r)).length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
