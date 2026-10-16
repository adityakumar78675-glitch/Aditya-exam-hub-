import type { jsPDF as JsPdfType } from "jspdf";
import pdfFontUrl from "@/assets/fonts/NotoSans-Regular.ttf?url";
import pdfBoldFontUrl from "@/assets/fonts/NotoSans-Bold.ttf?url";

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
  chapter: string | null;
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
type Status = "correct" | "incorrect" | "unattempted";
type RGB = readonly [number, number, number];

/** Notebook palette — plain RGB only (no lab/oklch). */
const C = {
  heading: [0x12, 0x36, 0x6b] as RGB,
  ink: [0x11, 0x11, 0x11] as RGB,
  rule: [0xb8, 0xdc, 0xe8] as RGB,
  margin: [0xd9, 0x82, 0x82] as RGB,
  muted: [0x55, 0x5f, 0x6b] as RGB,
  green: [0x15, 0x80, 0x3d] as RGB,
  red: [0xb9, 0x1c, 0x1c] as RGB,
};

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN_L = 50; // red vertical line (left)
const MARGIN_R = A4_W - 30; // red vertical line (right)
const TEXT_X = MARGIN_L + 8;
const TEXT_W = MARGIN_R - 8 - TEXT_X;
const RULE = 17; // ruled line spacing
const FIRST_RULE = 56; // first ruled line y
const CONTENT_TOP = FIRST_RULE + RULE * 2; // after compact header
const CONTENT_BOTTOM = A4_H - RULE;
const FONT = "AEH-Noto";

export function statusFromVerdict(verdict: boolean | null, your: PdfSolution["your_answer"]): Status {
  if (your === null || your === "") return "unattempted";
  return verdict === true ? "correct" : verdict === false ? "incorrect" : "unattempted";
}

export function pdfFileName(kind: PdfKind, testTitle: string): string {
  const safe =
    testTitle
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "Test";
  const label = kind === "wrong" ? "Wrong_Answers" : kind === "correct" ? "Correct_Answers" : "All_Answers";
  return `AdityaExamHub_${safe}_${label}.pdf`;
}

function plainText(input: string | null | undefined): string {
  if (!input) return "";
  const superscript: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻" };
  const subscript: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋" };
  const script = (value: string, map: Record<string, string>) => [...value].map((c) => map[c] ?? c).join("");
  return input
    .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/\$([^$\n]+)\$/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)")
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]+)\}/g, "$1")
    .replace(/\^\{([0-9+\-]+)\}/g, (_m, v: string) => script(v, superscript))
    .replace(/_\{([0-9+\-]+)\}/g, (_m, v: string) => script(v, subscript))
    .replace(/\^([0-9])/g, (_m, v: string) => script(v, superscript))
    .replace(/_([0-9])/g, (_m, v: string) => script(v, subscript))
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\div/g, "÷")
    .replace(/\\leq?/g, "≤")
    .replace(/\\geq?/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\pm/g, "±")
    .replace(/\\rightarrow/g, "→")
    .replace(/\\(alpha|beta|gamma|delta|theta|lambda|mu|pi|rho|sigma|phi|omega)\b/g, (_m, n: string) => ({ alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", lambda: "λ", mu: "μ", pi: "π", rho: "ρ", sigma: "σ", phi: "φ", omega: "ω" })[n] ?? n)
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/\{([^{}]+)\}/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/\r/g, "")
    .replace(/[\u2713\u2714]/g, "OK")
    .replace(/[\u2717\u2718\u2715]/g, "x")
    .replace(/\u221A/g, "sqrt")
    .replace(/[\u2192\u21D2]/g, "->")
    .replace(/[\u2190\u21D0]/g, "<-")
    .replace(/\u2264/g, "<=")
    .replace(/\u2265/g, ">=")
    .replace(/\u2260/g, "!=")
    .replace(/\u2248/g, "~=")
    .replace(/\u221E/g, "infinity")
    .replace(/[\u2022\u25CB\u25CF\u25A0\u25A1]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .trim();
}


function dataUrlFromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function installFont(pdf: JsPdfType) {
  const response = await fetch(pdfFontUrl);
  if (!response.ok) throw new Error("Could not load the PDF font");
  pdf.addFileToVFS("AEH-Noto.ttf", dataUrlFromBuffer(await response.arrayBuffer()));
  pdf.addFont("AEH-Noto.ttf", FONT, "normal");
  pdf.setFont(FONT, "normal");
}

async function loadImage(url: string, timeoutMs = 8000): Promise<{ data: string; format: string; width: number; height: number } | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal, mode: "cors" });
    window.clearTimeout(timer);
    if (!response.ok) return null;
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid image"));
      reader.onerror = () => reject(reader.error ?? new Error("Image read failed"));
      reader.readAsDataURL(blob);
    });
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Image decode failed"));
      image.src = data;
    });
    const format = blob.type.includes("png") ? "PNG" : blob.type.includes("webp") ? "WEBP" : "JPEG";
    return { data, format, ...size };
  } catch {
    return null;
  }
}

function setDraw(pdf: JsPdfType, color: RGB) { pdf.setDrawColor(color[0], color[1], color[2]); }
function setText(pdf: JsPdfType, color: RGB) { pdf.setTextColor(color[0], color[1], color[2]); }

function base64FromBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function installFonts(pdf: JsPdfType) {
  const [reg, bold] = await Promise.all([fetch(pdfFontUrl), fetch(pdfBoldFontUrl)]);
  if (!reg.ok || !bold.ok) throw new Error("Could not load the PDF fonts");
  pdf.addFileToVFS("AEH-Noto.ttf", base64FromBuffer(await reg.arrayBuffer()));
  pdf.addFont("AEH-Noto.ttf", FONT, "normal");
  pdf.addFileToVFS("AEH-Noto-Bold.ttf", base64FromBuffer(await bold.arrayBuffer()));
  pdf.addFont("AEH-Noto-Bold.ttf", FONT, "bold");
  pdf.setFont(FONT, "normal");
}

const DEVANAGARI = /[\u0900-\u097F]/;

/** jsPDF cannot shape Devanagari, so Hindi runs are painted through canvas (which shapes correctly). */
function shapedImage(text: string, sizePt: number, color: RGB, bold: boolean) {
  const S = 4;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  if (!measure) return null;
  const font = `${bold ? "700 " : ""}${sizePt * S}px "Noto Sans Devanagari", "Nirmala UI", "Mangal", sans-serif`;
  measure.font = font;
  canvas.width = Math.max(4, Math.ceil(measure.measureText(text).width) + S * 2);
  canvas.height = Math.ceil(sizePt * S * 1.55);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  ctx.fillText(text, S, sizePt * S * 1.12);
  return { data: canvas.toDataURL("image/png"), w: canvas.width / S, h: canvas.height / S, ascent: sizePt * 1.12 };
}

type Style = { size: number; color: RGB; bold: boolean };

function textWidth(pdf: JsPdfType, text: string, st: Style) {
  pdf.setFont(FONT, st.bold ? "bold" : "normal");
  pdf.setFontSize(st.size);
  return pdf.getTextWidth(text);
}

/** Draws one run at a baseline; returns its width. */
function drawRun(pdf: JsPdfType, text: string, x: number, baseline: number, st: Style, maxWidth: number): number {
  if (DEVANAGARI.test(text)) {
    const img = shapedImage(text, st.size, st.color, st.bold);
    if (img) {
      const scale = img.w > maxWidth ? maxWidth / img.w : 1;
      pdf.addImage(img.data, "PNG", x, baseline - img.ascent * scale, img.w * scale, img.h * scale, undefined, "FAST");
      return img.w * scale;
    }
  }
  pdf.setFont(FONT, st.bold ? "bold" : "normal");
  pdf.setFontSize(st.size);
  setText(pdf, st.color);
  pdf.text(text, x, baseline);
  return pdf.getTextWidth(text);
}

function wrap(pdf: JsPdfType, text: string, width: number, st: Style): string[] {
  pdf.setFont(FONT, st.bold ? "bold" : "normal");
  pdf.setFontSize(st.size);
  const out: string[] = [];
  for (const para of (plainText(text) || " ").split(/\n+/)) {
    out.push(...(pdf.splitTextToSize(para || " ", width) as string[]));
  }
  return out;
}

/** A labelled paragraph: "Label: text" with hanging indent, one ruled line per text line. */
type Block = { label: string; labelStyle: Style; text: string; textStyle: Style };
function layoutBlock(pdf: JsPdfType, b: Block) {
  const lw = textWidth(pdf, b.label + " ", b.labelStyle);
  return { lw, lines: wrap(pdf, b.text, TEXT_W - lw, b.textStyle) };
}

function drawPaper(pdf: JsPdfType, meta: PdfMeta, page: number) {
  // ruled lines
  setDraw(pdf, C.rule);
  pdf.setLineWidth(0.6);
  for (let y = FIRST_RULE; y < A4_H; y += RULE) pdf.line(0, y, A4_W, y);
  // red margins
  setDraw(pdf, C.margin);
  pdf.setLineWidth(0.8);
  pdf.line(MARGIN_L, 0, MARGIN_L, A4_H);
  pdf.line(MARGIN_R, 0, MARGIN_R, A4_H);

  // page number top-right with underline
  const pageLabel = `Page ${page}`;
  const pw = textWidth(pdf, pageLabel, { size: 9, color: C.ink, bold: false });
  drawRun(pdf, pageLabel, MARGIN_R - 10 - pw, 24, { size: 9, color: C.ink, bold: false }, 100);
  setDraw(pdf, C.rule);
  pdf.setLineWidth(0.6);
  pdf.line(MARGIN_R - 16 - pw, 28, MARGIN_R - 4, 28);

  // heading
  drawRun(pdf, "REFERENCE PAGE (Question & Answer)", TEXT_X, FIRST_RULE - 5, { size: 16, color: C.heading, bold: true }, TEXT_W);
  // subject line
  const subject = plainText(meta.subject || "General");
  const title = plainText(meta.testTitle || "Revision");
  const subjStyle: Style = { size: 11, color: C.ink, bold: true };
  const w = drawRun(pdf, "Subject: ", TEXT_X, FIRST_RULE + RULE - 5, subjStyle, TEXT_W);
  const value = wrap(pdf, `${subject} (${title})`, TEXT_W - w, { size: 11, color: C.ink, bold: false })[0] ?? "";
  drawRun(pdf, value, TEXT_X + w, FIRST_RULE + RULE - 5, { size: 11, color: C.ink, bold: false }, TEXT_W - w);
  // divider under header
  setDraw(pdf, C.heading);
  pdf.setLineWidth(0.9);
  pdf.line(TEXT_X, FIRST_RULE + RULE + 2, MARGIN_R - 8, FIRST_RULE + RULE + 2);
}

function answerText(s: PdfSolution, opts: string[], value: PdfSolution["your_answer"]): string {
  if (value === null || value === "") return "Not Attempted";
  if (s.type === "mcq") {
    const i = Number(value);
    return Number.isFinite(i) ? `(${String.fromCharCode(65 + i)}) ${opts[i] ?? ""}` : String(value);
  }
  if (s.type === "truefalse") return value === true || value === "true" ? "True" : "False";
  return String(value);
}

function correctText(s: PdfSolution, opts: string[]): string | null {
  if (s.type === "mcq" && s.correct_option !== null) return `(${String.fromCharCode(65 + s.correct_option)}) ${opts[s.correct_option] ?? ""}`;
  if (s.type === "numerical" && s.correct_numeric !== null) return String(s.correct_numeric);
  if (s.type === "truefalse" && s.correct_bool !== null) return s.correct_bool ? "True" : "False";
  return null;
}

const Q_LABEL: Style = { size: 11.5, color: C.heading, bold: true };
const Q_TEXT: Style = { size: 11.5, color: C.ink, bold: true };
const A_LABEL: Style = { size: 11, color: C.ink, bold: true };
const A_TEXT: Style = { size: 11, color: C.ink, bold: false };

/** Question + resolved correct answer only — no options, no student answer, no status. */
function blocksFor(_kind: PdfKind, s: PdfSolution, _status: Status, lang: "en" | "hi", qNo: number): Block[] {
  const question = (lang === "hi" && s.question_hi) || s.question_en;
  const opts = lang === "hi" && s.options_hi.length && s.options_hi.length === s.options_en.length ? s.options_hi : s.options_en;
  let answer = correctText(s, opts);
  if (s.type === "mcq" && s.correct_option !== null) answer = (opts[s.correct_option] ?? "").trim() || answer;
  return [
    { label: `Q${qNo}.`, labelStyle: Q_LABEL, text: question, textStyle: Q_TEXT },
    { label: "Answer:", labelStyle: A_LABEL, text: answer ?? "Correct answer not available", textStyle: A_TEXT },
  ];
}

export async function generateResultPdf(opts: {
  kind: PdfKind;
  meta: PdfMeta;
  items: { sol: PdfSolution; status: Status }[];
  lang: "en" | "hi";
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  console.info("[result-pdf] notebook generator called", { kind: opts.kind, questions: opts.items.length, test: opts.meta.testTitle });
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true, putOnlyUsedFonts: true });
  await installFonts(pdf);
  pdf.setProperties({ title: `Reference Page - ${opts.meta.testTitle}`, author: "Aditya Exam Hub", creator: "Aditya Exam Hub" });

  let page = 1;
  drawPaper(pdf, opts.meta, page);
  // y = the ruled line the next text line sits on
  let y = CONTENT_TOP;
  const nextPage = () => {
    pdf.addPage();
    page += 1;
    drawPaper(pdf, opts.meta, page);
    y = CONTENT_TOP;
  };
  const capacity = Math.floor((CONTENT_BOTTOM - CONTENT_TOP) / RULE) + 1;

  for (let i = 0; i < opts.items.length; i++) {
    const { sol, status } = opts.items[i]!;
    const blocks = blocksFor(opts.kind, sol, status, opts.lang, sol.number).map((b) => ({ b, ...layoutBlock(pdf, b) }));
    const image = sol.image_url ? await loadImage(sol.image_url) : null;
    let imgW = 0, imgH = 0, imgRows = 0;
    if (image) {
      const scale = Math.min(260 / image.width, 160 / image.height, 1);
      imgW = image.width * scale; imgH = image.height * scale;
      imgRows = Math.ceil((imgH + 6) / RULE);
    }
    const rows = blocks.reduce((n, x) => n + x.lines.length, 0) + imgRows;
    const remaining = Math.floor((CONTENT_BOTTOM - y) / RULE) + 1;
    if (rows > remaining && (rows <= capacity || remaining < 4)) nextPage();

    for (let bi = 0; bi < blocks.length; bi++) {
      const { b, lw, lines } = blocks[bi]!;
      const isOption = false;
      const x0 = TEXT_X + (isOption ? 14 : 0);
      for (let li = 0; li < lines.length; li++) {
        if (y > CONTENT_BOTTOM) nextPage();
        if (li === 0) drawRun(pdf, b.label, x0, y - 5, b.labelStyle, TEXT_W);
        drawRun(pdf, lines[li]!, x0 + lw, y - 5, b.textStyle, TEXT_W - lw - (x0 - TEXT_X));
        y += RULE;
      }
      if (bi === 0 && image) {
        if (y - RULE + imgRows * RULE > CONTENT_BOTTOM + RULE) nextPage();
        pdf.addImage(image.data, image.format, TEXT_X + lw, y - RULE + 4, imgW, imgH, undefined, "FAST");
        y += imgRows * RULE;
      }
    }
    y += RULE; // blank ruled line between questions
    opts.onProgress?.(i + 1, opts.items.length);
    if ((i + 1) % 10 === 0) await new Promise<void>((r) => window.setTimeout(r, 0));
  }

  const blob = pdf.output("blob");
  if (!blob.size) throw new Error("The generated PDF was empty");
  const filename = pdfFileName(opts.kind, opts.meta.testTitle);
  console.info("[result-pdf] generation completed", { filename, bytes: blob.size, pages: pdf.getNumberOfPages() });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
