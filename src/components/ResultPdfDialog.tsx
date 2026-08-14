import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Download, FileText, Loader2, CheckCircle2, XCircle, BookOpen } from "lucide-react";
import type { PdfKind, PdfMeta, PdfSolution } from "@/lib/result-pdf";

type Item = { sol: PdfSolution; status: "correct" | "incorrect" | "unattempted" };

export function ResultPdfDialog({
  meta,
  items,
  lang,
}: {
  meta: PdfMeta;
  items: Item[];
  lang: "en" | "hi";
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<PdfKind | null>(null);
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);

  const counts = {
    wrong: items.filter((i) => i.status === "incorrect").length,
    correct: items.filter((i) => i.status === "correct").length,
    all: items.length,
  };

  const run = async (kind: PdfKind) => {
    const selected =
      kind === "wrong"
        ? items.filter((i) => i.status === "incorrect")
        : kind === "correct"
          ? items.filter((i) => i.status === "correct")
          : items;
    if (!selected.length) return;

    setBusy(kind);
    setDone(false);
    setPct(0);
    try {
      const { generateResultPdf } = await import("@/lib/result-pdf");
      await generateResultPdf({
        kind,
        meta,
        items: selected,
        lang,
        onProgress: (d, t) => setPct(Math.round((d / t) * 100)),
      });
      setDone(true);
      toast.success("PDF ready ✓");
      setTimeout(() => {
        setOpen(false);
        setDone(false);
      }, 1200);
    } catch (e) {
      console.error("[result-pdf] generation failed", e);
      toast.error("PDF generation failed. Please try again.");

    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        setOpen(v);
        if (!v) setDone(false);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="size-4" /> Download Answer PDF
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose PDF</DialogTitle>
          <DialogDescription>
            Questions, options, your answer, the correct answer and explanations.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="py-6 text-center space-y-3">
            {done ? (
              <p className="font-semibold text-emerald-600 dark:text-emerald-400">PDF Ready ✓</p>
            ) : (
              <p className="flex items-center justify-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Preparing your PDF...
              </p>
            )}
            <Progress value={done ? 100 : pct} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {done ? "Your download should start automatically." : `${pct}%`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Row
              icon={<XCircle className="size-4 text-destructive" />}
              label="Wrong Answers"
              count={counts.wrong}
              onClick={() => run("wrong")}
            />
            <Row
              icon={<CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />}
              label="Correct Answers"
              count={counts.correct}
              onClick={() => run("correct")}
            />
            <Row
              icon={<BookOpen className="size-4 text-primary" />}
              label="All Answers"
              count={counts.all}
              onClick={() => run("all")}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon,
  label,
  count,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className="w-full flex items-center gap-3 rounded-lg border border-border p-3 text-left transition hover:bg-muted disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {icon}
      <span className="flex-1 font-medium text-sm">{label}</span>
      <span className="text-xs text-muted-foreground">{count} questions</span>
      <Download className="size-4 text-muted-foreground" />
    </button>
  );
}
