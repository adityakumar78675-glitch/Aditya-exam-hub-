/** CSV helpers for Master Ji's PDF → CSV converter. */

/** RFC-4180 style parser (handles quotes, escaped quotes and newlines in cells). */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const text = input.replace(/\r\n?/g, "\n").trim();

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);

  return rows
    .map((r) => r.map((v) => v.trim()))
    .filter((r) => r.some((v) => v !== ""));
}

export function escapeCell(value: string): string {
  const v = value ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** UTF-8 with BOM so Excel shows Hindi (Devanagari) text correctly. */
export function downloadCsv(rows: string[][], filename: string) {
  triggerDownload(new Blob(["\uFEFF" + toCsv(rows)], { type: "text/csv;charset=utf-8;" }), filename);
}

/** Excel-readable export (HTML table workbook) — no extra dependency needed. */
export function downloadExcel(rows: string[][], filename: string) {
  const esc = (s: string) =>
    (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const [head, ...body] = rows;
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8" /></head><body><table border="1">
<thead><tr>${(head ?? []).map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
</table></body></html>`;
  triggerDownload(new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8;" }), filename);
}

/** Split large sheets into numbered files: _001, _002 ... */
export function splitRows(rows: string[][], chunkSize = 500): string[][][] {
  const [head, ...body] = rows;
  if (body.length <= chunkSize) return [rows];
  const out: string[][][] = [];
  for (let i = 0; i < body.length; i += chunkSize) {
    out.push([head ?? [], ...body.slice(i, i + chunkSize)]);
  }
  return out;
}

const MCQ_HEADS = ["question", "option a", "option b", "option c", "option d", "answer"];

/** Flags rows with missing/duplicate/uncertain data so nothing is silently invented. */
export function reviewRows(rows: string[][]): Map<number, string> {
  const flags = new Map<number, string>();
  const head = (rows[0] ?? []).map((h) => h.toLowerCase().trim());
  const isMcq = MCQ_HEADS.every((h) => head.includes(h));
  const qIdx = head.indexOf("question");
  const seen = new Map<string, number>();

  rows.slice(1).forEach((row, i) => {
    const reasons: string[] = [];
    if (row.some((c) => !c.trim())) reasons.push("Empty cell");
    if (row.length !== (rows[0]?.length ?? row.length)) reasons.push("Column count mismatch");
    if (isMcq) {
      const ans = (row[head.indexOf("answer")] ?? "").trim();
      if (!/^[A-Da-d]$/.test(ans) && !ans) reasons.push("Answer missing");
    }
    if (qIdx >= 0) {
      const key = (row[qIdx] ?? "").toLowerCase().replace(/\s+/g, " ").trim();
      if (key) {
        if (seen.has(key)) reasons.push("Duplicate question");
        else seen.set(key, i);
      }
    }
    if (/[�]|\?\?\?/.test(row.join(" "))) reasons.push("Broken/OCR text");
    if (reasons.length) flags.set(i, reasons.join("; "));
  });
  return flags;
}
