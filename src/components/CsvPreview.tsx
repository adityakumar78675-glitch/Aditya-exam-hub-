import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, FileSpreadsheet, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { downloadCsv, downloadExcel, parseCsv, reviewRows, splitRows } from "@/lib/csv";

/**
 * Renders a ```csv block produced by Master Ji as an editable preview table
 * with CSV / Excel download.
 */
export function CsvPreview({ code }: { code: string }) {
  const parsed = useMemo(() => parseCsv(code), [code]);
  const [rows, setRows] = useState<string[][]>(parsed);
  const [editing, setEditing] = useState(false);

  useEffect(() => setRows(parsed), [parsed]);

  const head = rows[0] ?? [];
  const body = rows.slice(1);
  const flags = useMemo(() => reviewRows(rows), [rows]);

  if (head.length === 0) {
    return (
      <pre className="bg-muted p-3 rounded-lg overflow-x-auto text-xs">
        <code>{code}</code>
      </pre>
    );
  }

  function updateCell(r: number, c: number, value: string) {
    setRows((prev) => {
      const next = prev.map((row) => [...row]);
      const target = next[r + 1];
      if (target) target[c] = value;
      return next;
    });
  }
  function deleteRow(r: number) {
    setRows((prev) => prev.filter((_, i) => i !== r + 1));
  }
  function addRow() {
    setRows((prev) => [...prev, head.map(() => "")]);
    setEditing(true);
  }

  function download(kind: "csv" | "xls") {
    const chunks = splitRows(rows, 500);
    chunks.forEach((chunk, i) => {
      const suffix = chunks.length > 1 ? `_${String(i + 1).padStart(3, "0")}` : "";
      const name = `AdityaExamHub_Questions${suffix}.${kind === "csv" ? "csv" : "xls"}`;
      if (kind === "csv") downloadCsv(chunk, name);
      else downloadExcel(chunk, name);
    });
    toast.success(chunks.length > 1 ? `${chunks.length} files downloaded` : "Download started");
  }

  return (
    <div className="my-3 rounded-xl border border-border overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/60 border-b border-border">
        <FileSpreadsheet className="size-4 text-primary" />
        <span className="text-sm font-semibold">CSV Ready</span>
        <span className="text-xs text-muted-foreground">
          {body.length} rows · {head.length} columns
        </span>
        {flags.size > 0 && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="size-3" /> {flags.size} need review
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? <X className="size-3.5 mr-1" /> : <Pencil className="size-3.5 mr-1" />}
            {editing ? "Done" : "Edit"}
          </Button>
          {editing && (
            <Button size="sm" variant="outline" onClick={addRow}>
              <Plus className="size-3.5 mr-1" /> Row
            </Button>
          )}
          <Button size="sm" onClick={() => download("csv")}>
            <Download className="size-3.5 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => download("xls")}>
            <Download className="size-3.5 mr-1" /> Excel
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[26rem]">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="px-2 py-2 text-left font-semibold border-b border-border w-8">#</th>
              {head.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-semibold border-b border-border whitespace-nowrap">
                  {h}
                </th>
              ))}
              {editing && <th className="border-b border-border w-8" />}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => {
              const flag = flags.get(r);
              return (
                <tr key={r} className={flag ? "bg-amber-500/10" : undefined}>
                  <td className="px-2 py-1.5 border-b border-border/60 text-muted-foreground align-top">
                    {r + 1}
                    {flag && (
                      <span title={flag}>
                        <AlertTriangle className="size-3 text-amber-600 mt-1" />
                      </span>
                    )}
                  </td>
                  {head.map((_, c) => (
                    <td key={c} className="px-3 py-1.5 border-b border-border/60 align-top min-w-[8rem]">
                      {editing ? (
                        <textarea
                          value={row[c] ?? ""}
                          onChange={(e) => updateCell(r, c, e.target.value)}
                          rows={1}
                          className="w-full min-w-[8rem] resize-y rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      ) : (
                        <span className="whitespace-pre-wrap">{row[c] ?? ""}</span>
                      )}
                    </td>
                  ))}
                  {editing && (
                    <td className="px-1 border-b border-border/60 align-top">
                      <button
                        onClick={() => deleteRow(r)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Delete row ${r + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {flags.size > 0 && (
        <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
          ⚠️ Highlighted rows need review — check missing answers, duplicates or broken text before importing.
        </p>
      )}
    </div>
  );
}
