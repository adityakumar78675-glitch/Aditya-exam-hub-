import katex from "katex";

/* ---------------- types ---------------- */

export type PdfSolution = {
  number: number;
  type: "mcq" | "numerical" | "truefalse" | "subjective";
  question_en: string;
  question_hi: string | null;
  image_url: string | null;
  options_en: string[];
  options_hi: string[];
  correct_option: number | null;
  correct_numeric: number | null;
  correct_bool: boolean | null;
  solution_en: string | null;
  solution_hi: string | null;
  your_answer: number | string | boolean | null;
  positive_marks: number;
  negative_marks: number;
  marked: boolean;
};

export type PdfMeta = {
  testTitle: string;
  subject: string | null;
  studentName: string;
  date: string;
  score: number;
  totalMarks: number;
  accuracy: number;
  totalQuestions: number;
  attempted: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  attemptNumber: number;
};

export type PdfKind = "wrong" | "correct" | "all";

/** Status derived the same way the result page derives it (verdict-driven). */
export function statusFromVerdict(verdict: boolean | null, your: PdfSolution["your_answer"]) {
  const empty = your === null || your === "";
  if (empty) return "unattempted" as const;
  return verdict === true ? ("correct" as const) : verdict === false ? ("incorrect" as const) : ("unattempted" as const);
}

/* ---------------- text -> html (math aware) ---------------- */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function tex(src: string, display: boolean): string {
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: false, output: "html" });
  } catch {
    return esc(src);
  }
}

/**
 * Converts light markdown + LaTeX ($...$, $$...$$, \(...\), \[...\]) into HTML
 * so formulas render as real notation instead of raw source.
 */
export function toHtml(input: string | null | undefined): string {
  if (!input) return "";
  const normalized = input
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, g) => `$$${g}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, g) => `$${g}$`);

  const parts = normalized.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  const html = parts
    .map((chunk) => {
      if (chunk.startsWith("$$") && chunk.endsWith("$$") && chunk.length > 4) {
        return tex(chunk.slice(2, -2), true);
      }
      if (chunk.startsWith("$") && chunk.endsWith("$") && chunk.length > 2) {
        return tex(chunk.slice(1, -1), false);
      }
      return esc(chunk)
        .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
        .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>")
        .replace(/`([^`]+)`/g, '<code style="font-family:monospace">$1</code>')
        .replace(/\n/g, "<br/>");
    })
    .join("");
  return html;
}

/* ---------------- images ---------------- */

async function toDataUrl(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, mode: "cors" });
    clearTimeout(t);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/* ---------------- html blocks ---------------- */

const INK = "#14181f";
const MUTED = "#5b6472";
const LINE = "#d9dee6";
const GREEN = "#0f7b4f";
const GREEN_BG = "#eaf7f0";
const RED = "#b4231f";
const RED_BG = "#fdeceb";

function headerBlock(meta: PdfMeta, kind: PdfKind, count: number): string {
  const label =
    kind === "wrong" ? "Incorrect Answers" : kind === "correct" ? "Correct Answers" : "All Answers";
  const cell = (l: string, v: string | number) =>
    `<div style="border:1px solid ${LINE};border-radius:6px;padding:6px 8px">
       <div style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED}">${esc(l)}</div>
       <div style="font-size:13px;font-weight:700;color:${INK};margin-top:2px">${esc(String(v))}</div>
     </div>`;
  return `
  <div style="border-bottom:2px solid ${INK};padding-bottom:10px;margin-bottom:12px">
    <div style="display:flex;align-items:baseline;justify-content:space-between">
      <div style="font-size:20px;font-weight:800;letter-spacing:-.01em;color:${INK}">Aditya Exam Hub</div>
      <div style="font-size:11px;color:${MUTED}">${esc(label)} · Attempt ${meta.attemptNumber}</div>
    </div>
    <div style="font-size:14px;font-weight:700;margin-top:6px;color:${INK}">${esc(meta.testTitle)}</div>
    <div style="font-size:11px;color:${MUTED};margin-top:2px">
      ${esc(meta.studentName)}${meta.subject ? " · " + esc(meta.subject) : ""} · ${esc(meta.date)}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px">
    ${cell("Score", `${meta.score} / ${meta.totalMarks}`)}
    ${cell("Accuracy", `${meta.accuracy}%`)}
    ${cell("Total Questions", meta.totalQuestions)}
    ${cell("Attempted", meta.attempted)}
    ${cell("Correct", meta.correct)}
    ${cell("Incorrect", meta.incorrect)}
    ${cell("Unattempted", meta.unattempted)}
    ${cell("In this PDF", count)}
  </div>`;
}

function answerText(s: PdfSolution, opts: string[], value: PdfSolution["your_answer"]): string {
  if (value === null || value === "") return "Not attempted";
  if (s.type === "mcq") {
    const i = Number(value);
    const letter = Number.isFinite(i) ? String.fromCharCode(65 + i) : "?";
    return `${letter}. ${opts[i] ?? ""}`;
  }
  return String(value);
}

function correctText(s: PdfSolution, opts: string[]): string {
  if (s.type === "mcq" && s.correct_option !== null) {
    return `${String.fromCharCode(65 + s.correct_option)}. ${opts[s.correct_option] ?? ""}`;
  }
  if (s.type === "numerical" && s.correct_numeric !== null) return String(s.correct_numeric);
  if (s.type === "truefalse" && s.correct_bool !== null) return s.correct_bool ? "True" : "False";
  return "—";
}

function questionBlock(
  s: PdfSolution,
  status: "correct" | "incorrect" | "unattempted",
  lang: "en" | "hi",
  imgData: string | null,
): string {
  const qText = (lang === "hi" && s.question_hi) || s.question_en;
  const opts = lang === "hi" && s.options_hi?.length ? s.options_hi : s.options_en;
  const explanation = (lang === "hi" && s.solution_hi) || s.solution_en;
  const yourIdx = s.your_answer === null || s.your_answer === "" ? null : Number(s.your_answer);

  const tag =
    status === "correct"
      ? `<span style="font-size:10px;font-weight:700;color:${GREEN};background:${GREEN_BG};border:1px solid ${GREEN};border-radius:999px;padding:2px 8px">CORRECT</span>`
      : status === "incorrect"
        ? `<span style="font-size:10px;font-weight:700;color:${RED};background:${RED_BG};border:1px solid ${RED};border-radius:999px;padding:2px 8px">INCORRECT</span>`
        : `<span style="font-size:10px;font-weight:700;color:${MUTED};border:1px solid ${LINE};border-radius:999px;padding:2px 8px">NOT ATTEMPTED</span>`;

  const optionsHtml =
    s.type === "mcq"
      ? `<div style="margin-top:8px">
          ${opts
            .map((o, i) => {
              const isCorrect = s.correct_option === i;
              const isYours = yourIdx === i;
              const bg = isCorrect ? GREEN_BG : isYours ? RED_BG : "#ffffff";
              const bd = isCorrect ? GREEN : isYours ? RED : LINE;
              const mark = isCorrect ? " ✓" : isYours ? " ✗" : "";
              return `<div style="border:1px solid ${bd};background:${bg};border-radius:6px;padding:6px 8px;margin-bottom:5px;font-size:12px;color:${INK}">
                        <b>${String.fromCharCode(65 + i)}.</b> ${toHtml(o)}<span style="font-weight:700">${mark}</span>
                      </div>`;
            })
            .join("")}
        </div>`
      : "";

  const yourColor = status === "correct" ? GREEN : status === "incorrect" ? RED : MUTED;

  return `
  <div style="border:1px solid ${LINE};border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#ffffff;color:${INK}">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
      <div style="font-size:13px;font-weight:800">Question ${s.number}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:10px;color:${MUTED}">+${s.positive_marks} / −${s.negative_marks}</span>
        ${tag}
      </div>
    </div>
    <div style="font-size:12.5px;line-height:1.5">${toHtml(qText)}</div>
    ${
      imgData
        ? `<img src="${imgData}" style="display:block;max-width:100%;margin-top:8px;border:1px solid ${LINE};border-radius:6px"/>`
        : s.image_url
          ? `<div style="font-size:10px;color:${MUTED};margin-top:6px">[ image unavailable ]</div>`
          : ""
    }
    ${optionsHtml}
    <div style="margin-top:8px;font-size:12px">
      <div style="color:${yourColor}"><b>${status === "correct" ? "✓" : status === "incorrect" ? "✗" : "○"} Your Answer:</b> ${toHtml(answerText(s, opts, s.your_answer))}</div>
      <div style="color:${GREEN};margin-top:3px"><b>✓ Correct Answer:</b> ${toHtml(correctText(s, opts))}</div>
    </div>
    <div style="margin-top:8px;border-top:1px dashed ${LINE};padding-top:6px">
      <div style="font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin-bottom:3px">Explanation</div>
      <div style="font-size:12px;line-height:1.5">${explanation ? toHtml(explanation) : `<span style="color:${MUTED}">Explanation not available.</span>`}</div>
    </div>
  </div>`;
}

/* ---------------- pdf-safe css sanitizing ---------------- */

/**
 * html2canvas cannot parse modern CSS color functions (lab/lch/oklab/oklch/color()).
 * The app's Tailwind theme resolves tokens to oklch(), and those values leak into the
 * offscreen PDF tree through inheritance and UA/base styles. This walks the tree and
 * pins every color-bearing property to a PDF-safe hex/rgb value.
 */
const UNSUPPORTED_COLOR = /\b(?:ok)?l(?:ab|ch)\(|(?<![-\w])color\(/i;

const COLOR_PROPS: { prop: string; fallback: string }[] = [
  { prop: "color", fallback: INK },
  { prop: "background-color", fallback: "transparent" },
  { prop: "background-image", fallback: "none" },
  { prop: "border-top-color", fallback: LINE },
  { prop: "border-right-color", fallback: LINE },
  { prop: "border-bottom-color", fallback: LINE },
  { prop: "border-left-color", fallback: LINE },
  { prop: "outline-color", fallback: LINE },
  { prop: "text-decoration-color", fallback: INK },
  { prop: "column-rule-color", fallback: LINE },
  { prop: "caret-color", fallback: INK },
  { prop: "box-shadow", fallback: "none" },
  { prop: "fill", fallback: INK },
  { prop: "stroke", fallback: INK },
];

export function sanitizePdfHtml(root: HTMLElement): void {
  const all: HTMLElement[] = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  for (const el of all) {
    let cs: CSSStyleDeclaration;
    try {
      cs = getComputedStyle(el);
    } catch {
      continue;
    }
    for (const { prop, fallback } of COLOR_PROPS) {
      const value = cs.getPropertyValue(prop);
      if (value && UNSUPPORTED_COLOR.test(value)) {
        el.style.setProperty(prop, fallback, "important");
      }
    }
  }
}

/* ---------------- generation ---------------- */

export function pdfFileName(kind: PdfKind, testTitle: string): string {
  const safe = testTitle.replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60) || "Test";
  const label = kind === "wrong" ? "WrongAnswers" : kind === "correct" ? "CorrectAnswers" : "AllAnswers";
  return `AdityaExamHub_${label}_${safe}.pdf`;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 26;


export async function generateResultPdf(opts: {
  kind: PdfKind;
  meta: PdfMeta;
  items: { sol: PdfSolution; status: "correct" | "incorrect" | "unattempted" }[];
  lang: "en" | "hi";
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  const { kind, meta, items, lang, onProgress } = opts;
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // preload images (failures are skipped, never fatal)
  const images = await Promise.all(
    items.map((it) => (it.sol.image_url ? toDataUrl(it.sol.image_url) : Promise.resolve(null))),
  );

  const root = document.createElement("div");
  root.setAttribute("data-pdf-root", "");
  root.style.cssText =
    "position:fixed;left:-20000px;top:0;width:731px;padding:0;background:#ffffff;color:#14181f;" +
    'font-family:ui-sans-serif,system-ui,"Segoe UI",Roboto,"Noto Sans Devanagari",sans-serif;';
  document.body.appendChild(root);

  const blocks: HTMLElement[] = [];
  const add = (html: string) => {
    const el = document.createElement("div");
    el.style.background = "#ffffff";
    el.innerHTML = html;
    root.appendChild(el);
    blocks.push(el);
    return el;
  };

  add(headerBlock(meta, kind, items.length));
  items.forEach((it, i) => add(questionBlock(it.sol, it.status, lang, images[i] ?? null)));

  // let fonts/katex settle
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready?.catch?.(() => {});
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));

  // strip any lab()/lch()/oklab()/oklch()/color() that leaked in from app CSS
  sanitizePdfHtml(root);
  // html2canvas also reads <html>/<body> colors; pin them to PDF-safe values while capturing
  const restoreRootColors = lockDocumentColors();

  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
  let y = MARGIN;
  const bottom = PAGE_H - MARGIN - FOOTER_H;

  try {

    for (let i = 0; i < blocks.length; i++) {
      const canvas = await html2canvas(blocks[i]!, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
      });
      const ratio = CONTENT_W / canvas.width; // pt per px
      let srcY = 0;

      while (srcY < canvas.height) {
        const availPt = bottom - y;
        if (availPt < 60) {
          pdf.addPage();
          y = MARGIN;
          continue;
        }
        const slicePx = Math.min(canvas.height - srcY, Math.floor(availPt / ratio));
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = slicePx;
        const ctx = slice.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, srcY, canvas.width, slicePx, 0, 0, canvas.width, slicePx);
        pdf.addImage(
          slice.toDataURL("image/jpeg", 0.92),
          "JPEG",
          MARGIN,
          y,
          CONTENT_W,
          slicePx * ratio,
        );
        y += slicePx * ratio;
        srcY += slicePx;
        if (srcY < canvas.height) {
          pdf.addPage();
          y = MARGIN;
        }
      }
      onProgress?.(i + 1, blocks.length);
    }

    const total = pdf.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      pdf.setPage(p);
      pdf.setFontSize(8);
      pdf.setTextColor(120, 128, 140);
      pdf.text("Aditya Exam Hub", MARGIN, PAGE_H - 20);
      pdf.text(`Page ${p} of ${total}`, PAGE_W - MARGIN, PAGE_H - 20, { align: "right" });
    }

    pdf.save(pdfFileName(kind, meta.testTitle));
  } finally {
    restoreRootColors();
    root.remove();

  }
}
