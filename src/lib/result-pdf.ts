import type { jsPDF as JsPdfType } from "jspdf";
import pdfFontUrl from "@/assets/fonts/NotoSans-Regular.ttf?url";

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

const C = {
  navy: [20, 54, 96] as RGB,
  blue: [27, 104, 180] as RGB,
  bluePale: [236, 246, 255] as RGB,
  ink: [25, 35, 49] as RGB,
  muted: [91, 106, 124] as RGB,
  line: [210, 220, 231] as RGB,
  white: [255, 255, 255] as RGB,
  green: [22, 128, 76] as RGB,
  greenPale: [232, 247, 238] as RGB,
  greenLine: [164, 218, 185] as RGB,
  red: [190, 53, 61] as RGB,
  redPale: [253, 237, 239] as RGB,
  redLine: [239, 184, 188] as RGB,
  greyPale: [241, 245, 249] as RGB,
  greyLine: [198, 210, 222] as RGB,
  gold: [239, 177, 42] as RGB,
};

const A4_W = 595.28;
const A4_H = 841.89;
const M = 34;
const BODY_W = A4_W - M * 2;
const HEADER_H = 42;
const FOOTER_H = 28;
const BODY_TOP = M + HEADER_H;
const BODY_BOTTOM = A4_H - M - FOOTER_H;
const FONT = "AEH-Noto";

export function statusFromVerdict(verdict: boolean | null, your: PdfSolution["your_answer"]): Status {
  if (your === null || your === "") return "unattempted";
  return verdict === true ? "correct" : verdict === false ? "incorrect" : "unattempted";
}

export function pdfFileName(kind: PdfKind, testTitle: string): string {
  const safe = testTitle.replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60) || "Test";
  const label = kind === "wrong" ? "WrongAnswers" : kind === "correct" ? "CorrectAnswers" : "AllAnswers";
  return `AdityaExamHub_${label}_${safe}.pdf`;
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

function setFill(pdf: JsPdfType, color: RGB) { pdf.setFillColor(color[0], color[1], color[2]); }
function setDraw(pdf: JsPdfType, color: RGB) { pdf.setDrawColor(color[0], color[1], color[2]); }
function setText(pdf: JsPdfType, color: RGB) { pdf.setTextColor(color[0], color[1], color[2]); }

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

function drawLogo(pdf: JsPdfType, x: number, y: number, scale = 1) {
  setFill(pdf, C.navy);
  pdf.rect(x, y + 3 * scale, 20 * scale, 11 * scale, "F");
  setFill(pdf, C.gold);
  pdf.triangle(x - 2 * scale, y + 3 * scale, x + 10 * scale, y - 2 * scale, x + 22 * scale, y + 3 * scale, "F");
  setFill(pdf, C.blue);
  pdf.rect(x + 4 * scale, y + 14 * scale, 12 * scale, 3 * scale, "F");
}

function drawStatusMark(pdf: JsPdfType, status: Status, cx: number, cy: number, color: RGB) {
  setDraw(pdf, color);
  pdf.setLineWidth(1.2);
  if (status === "correct") {
    pdf.line(cx - 3.2, cy, cx - 1, cy + 2.6);
    pdf.line(cx - 1, cy + 2.6, cx + 3.4, cy - 3);
  } else if (status === "incorrect") {
    pdf.line(cx - 3, cy - 3, cx + 3, cy + 3);
    pdf.line(cx + 3, cy - 3, cx - 3, cy + 3);
  } else {
    pdf.circle(cx, cy, 3, "S");
  }
  pdf.setLineWidth(0.8);
}

function kindLabel(kind: PdfKind) {
  return kind === "wrong" ? "WRONG ANSWERS" : kind === "correct" ? "CORRECT ANSWERS" : "ALL ANSWERS";
}

function pageHeader(pdf: JsPdfType, meta: PdfMeta, kind: PdfKind, page: number) {
  if (page === 1) return;
  drawLogo(pdf, M, 22, 0.7);
  pdf.setFontSize(11);
  setText(pdf, C.navy);
  pdf.text("ADITYA EXAM HUB", M + 19, 31);
  pdf.setFontSize(8);
  setText(pdf, C.muted);
  pdf.text(kindLabel(kind), A4_W - M, 25, { align: "right" });
  pdf.text(plainText(meta.testTitle), A4_W - M, 35, { align: "right", maxWidth: 250 });
  setDraw(pdf, C.line);
  pdf.line(M, 46, A4_W - M, 46);
}

function newPage(pdf: JsPdfType, meta: PdfMeta, kind: PdfKind) {
  pdf.addPage();
  pageHeader(pdf, meta, kind, pdf.getNumberOfPages());
  return BODY_TOP;
}

function firstPage(pdf: JsPdfType, meta: PdfMeta, kind: PdfKind, count: number): number {
  setFill(pdf, C.navy);
  pdf.rect(0, 0, A4_W, 96, "F");
  drawLogo(pdf, M, 25, 1.25);
  setText(pdf, C.white);
  pdf.setFontSize(19);
  pdf.text("ADITYA EXAM HUB", M + 36, 39);
  pdf.setFontSize(8.5);
  pdf.text("Learn Today, Excel Tomorrow", M + 36, 55);
  pdf.setFontSize(15);
  pdf.text("TEST PERFORMANCE REPORT", A4_W - M, 37, { align: "right" });
  pdf.setFontSize(9);
  pdf.text(kindLabel(kind), A4_W - M, 54, { align: "right" });

  let y = 118;
  pdf.setFontSize(17);
  setText(pdf, C.ink);
  pdf.text(plainText(meta.testTitle), M, y, { maxWidth: BODY_W });
  y += 19;
  pdf.setFontSize(9);
  setText(pdf, C.muted);
  pdf.text(`Subject: ${plainText(meta.subject || "General")}`, M, y);
  pdf.text(`Chapter: ${plainText(meta.chapter || "All chapters")}`, A4_W / 2, y);

  y += 18;
  setFill(pdf, C.bluePale);
  setDraw(pdf, C.line);
  pdf.roundedRect(M, y, BODY_W, 48, 5, 5, "FD");
  pdf.setFontSize(8);
  setText(pdf, C.muted);
  pdf.text("STUDENT", M + 12, y + 14);
  pdf.text("ATTEMPT", M + 255, y + 14);
  pdf.text("ATTEMPT DATE", M + 345, y + 14);
  pdf.setFontSize(10.5);
  setText(pdf, C.ink);
  pdf.text(plainText(meta.studentName), M + 12, y + 32, { maxWidth: 225 });
  pdf.text(String(meta.attemptNumber), M + 255, y + 32);
  pdf.text(plainText(meta.date), M + 345, y + 32, { maxWidth: 150 });

  y += 64;
  pdf.setFontSize(11);
  setText(pdf, C.navy);
  pdf.text("PERFORMANCE SUMMARY", M, y);
  y += 10;
  const metrics = [
    ["TOTAL", meta.totalQuestions, C.blue, C.bluePale],
    ["ATTEMPTED", meta.attempted, C.navy, C.greyPale],
    ["CORRECT", meta.correct, C.green, C.greenPale],
    ["WRONG", meta.incorrect, C.red, C.redPale],
    ["UNATTEMPTED", meta.unattempted, C.muted, C.greyPale],
  ] as const;
  const gap = 7;
  const cardW = (BODY_W - gap * 4) / 5;
  metrics.forEach(([label, value, color, bg], i) => {
    const x = M + i * (cardW + gap);
    setFill(pdf, bg);
    setDraw(pdf, color);
    pdf.roundedRect(x, y, cardW, 53, 4, 4, "FD");
    pdf.setFontSize(7);
    setText(pdf, C.muted);
    pdf.text(label, x + cardW / 2, y + 16, { align: "center" });
    pdf.setFontSize(17);
    setText(pdf, color);
    pdf.text(String(value), x + cardW / 2, y + 39, { align: "center" });
  });

  y += 64;
  setFill(pdf, C.navy);
  pdf.roundedRect(M, y, BODY_W, 49, 5, 5, "F");
  setText(pdf, C.white);
  pdf.setFontSize(8);
  pdf.text("SCORE", M + 18, y + 16);
  pdf.text("ACCURACY", M + 205, y + 16);
  pdf.text("QUESTIONS IN THIS PDF", M + 370, y + 16);
  pdf.setFontSize(15);
  pdf.text(`${meta.score} / ${meta.totalMarks}`, M + 18, y + 37);
  pdf.text(`${meta.accuracy}%`, M + 205, y + 37);
  pdf.text(String(count), M + 370, y + 37);
  y += 67;
  setText(pdf, C.navy);
  pdf.setFontSize(11);
  pdf.text(kindLabel(kind), M, y);
  setDraw(pdf, kind === "wrong" ? C.red : kind === "correct" ? C.green : C.blue);
  pdf.setLineWidth(2);
  pdf.line(M, y + 7, M + 90, y + 7);
  return y + 20;
}

function lines(pdf: JsPdfType, text: string, width: number, size: number): string[] {
  pdf.setFontSize(size);
  return pdf.splitTextToSize(plainText(text) || " ", width) as string[];
}

function answerText(s: PdfSolution, opts: string[], value: PdfSolution["your_answer"]): string {
  if (value === null || value === "") return "Not Attempted";
  if (s.type === "mcq") {
    const i = Number(value);
    return `${Number.isFinite(i) ? String.fromCharCode(65 + i) : "?"}. ${opts[i] ?? ""}`;
  }
  if (s.type === "truefalse") return value === true || value === "true" ? "True" : "False";
  return String(value);
}

function correctText(s: PdfSolution, opts: string[]): string {
  if (s.type === "mcq" && s.correct_option !== null) return `${String.fromCharCode(65 + s.correct_option)}. ${opts[s.correct_option] ?? ""}`;
  if (s.type === "numerical" && s.correct_numeric !== null) return String(s.correct_numeric);
  if (s.type === "truefalse" && s.correct_bool !== null) return s.correct_bool ? "True" : "False";
  return s.type === "subjective" ? "Evaluated manually" : "—";
}

function optionHeight(pdf: JsPdfType, text: string) {
  return Math.max(25, lines(pdf, text, BODY_W - 76, 9.2).length * 12 + 12);
}

function estimateQuestion(pdf: JsPdfType, s: PdfSolution, lang: "en" | "hi") {
  const question = (lang === "hi" && s.question_hi) || s.question_en;
  const opts = lang === "hi" && s.options_hi.length === s.options_en.length && s.options_hi.length ? s.options_hi : s.options_en;
  const explanation = (lang === "hi" && s.solution_hi) || s.solution_en || "Explanation not available.";
  const questionH = lines(pdf, question, BODY_W - 42, 10.5).length * 14;
  const optionsH = s.type === "mcq" ? opts.reduce((sum, o) => sum + optionHeight(pdf, o) + 4, 0) : 0;
  const explanationH = Math.max(42, lines(pdf, explanation, BODY_W - 48, 8.8).length * 12 + 29);
  return { question, opts, explanation, height: 53 + questionH + optionsH + 40 + explanationH };
}

async function drawQuestion(
  pdf: JsPdfType,
  meta: PdfMeta,
  kind: PdfKind,
  s: PdfSolution,
  status: Status,
  lang: "en" | "hi",
  startY: number,
): Promise<number> {
  const info = estimateQuestion(pdf, s, lang);
  let y = startY;
  const maxCard = BODY_BOTTOM - BODY_TOP;
  if (info.height <= maxCard && y + info.height > BODY_BOTTOM) y = newPage(pdf, meta, kind);

  const tone = status === "correct" ? C.green : status === "incorrect" ? C.red : C.muted;
  const pale = status === "correct" ? C.greenPale : status === "incorrect" ? C.redPale : C.greyPale;
  const border = status === "correct" ? C.greenLine : status === "incorrect" ? C.redLine : C.greyLine;
  const cardTop = y;
  const canSingleCard = info.height <= maxCard;
  if (canSingleCard) {
    setFill(pdf, C.white);
    setDraw(pdf, border);
    pdf.setLineWidth(0.8);
    pdf.roundedRect(M, y, BODY_W, info.height - 5, 5, 5, "FD");
    setFill(pdf, pale);
    pdf.roundedRect(M, y, BODY_W, 35, 5, 5, "F");
  }

  const ensure = (needed: number) => {
    if (y + needed <= BODY_BOTTOM) return;
    y = newPage(pdf, meta, kind);
  };

  ensure(48);
  setFill(pdf, tone);
  pdf.circle(M + 17, y + 17, 11, "F");
  setText(pdf, C.white);
  pdf.setFontSize(8.5);
  pdf.text(`Q${s.number}`, M + 17, y + 20, { align: "center" });
  setText(pdf, C.ink);
  pdf.setFontSize(8);
  pdf.text(`+${s.positive_marks} / -${s.negative_marks}`, A4_W - M - 104, y + 20, { align: "right" });
  setFill(pdf, pale);
  setDraw(pdf, tone);
  pdf.roundedRect(A4_W - M - 96, y + 8, 88, 19, 4, 4, "FD");
  drawStatusMark(pdf, status, A4_W - M - 85, y + 17.5, tone);
  setText(pdf, tone);
  pdf.setFontSize(8);
  const statusLabel = status === "correct" ? "CORRECT" : status === "incorrect" ? "WRONG" : "UNATTEMPTED";
  pdf.text(statusLabel, A4_W - M - 46, y + 20.5, { align: "center" });
  y += 42;

  const qLines = lines(pdf, info.question, BODY_W - 34, 10.5);
  setText(pdf, C.ink);
  pdf.setFontSize(10.5);
  pdf.text(qLines, M + 17, y, { lineHeightFactor: 1.3 });
  y += qLines.length * 14 + 7;

  if (s.image_url) {
    const image = await loadImage(s.image_url);
    if (image) {
      const maxW = Math.min(310, BODY_W - 34);
      const maxH = 190;
      const scale = Math.min(maxW / image.width, maxH / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      ensure(h + 12);
      pdf.addImage(image.data, image.format, M + 17, y, w, h, undefined, "FAST");
      y += h + 9;
    } else {
      ensure(18);
      pdf.setFontSize(8);
      setText(pdf, C.muted);
      pdf.text("Image unavailable", M + 17, y + 9);
      y += 18;
    }
  }

  if (s.type === "mcq") {
    const yourIndex = s.your_answer === null || s.your_answer === "" ? null : Number(s.your_answer);
    for (let i = 0; i < info.opts.length; i++) {
      const option = info.opts[i] ?? "";
      const isCorrect = s.correct_option === i;
      const isYours = yourIndex === i;
      const h = optionHeight(pdf, option);
      ensure(h + 5);
      const optionBg = isCorrect ? C.greenPale : isYours ? C.redPale : C.white;
      const optionBorder = isCorrect ? C.greenLine : isYours ? C.redLine : C.line;
      setFill(pdf, optionBg);
      setDraw(pdf, optionBorder);
      pdf.roundedRect(M + 16, y, BODY_W - 32, h, 4, 4, "FD");
      setFill(pdf, isCorrect ? C.green : isYours ? C.red : C.greyPale);
      pdf.circle(M + 31, y + h / 2, 8, "F");
      setText(pdf, isCorrect || isYours ? C.white : C.ink);
      pdf.setFontSize(8.5);
      pdf.text(String.fromCharCode(65 + i), M + 31, y + h / 2 + 3, { align: "center" });
      setText(pdf, C.ink);
      const optionLines = lines(pdf, option, BODY_W - 116, 9.2);
      pdf.setFontSize(9.2);
      pdf.text(optionLines, M + 45, y + 10, { lineHeightFactor: 1.25, baseline: "top" });
      if (isCorrect || isYours) {
        pdf.setFontSize(7.3);
        setText(pdf, isCorrect ? C.green : C.red);
        const badge = isCorrect && isYours ? "YOUR + CORRECT" : isCorrect ? "CORRECT ANSWER" : "YOUR ANSWER";
        pdf.text(badge, A4_W - M - 12, y + h / 2 + 2.5, { align: "right" });
      }
      y += h + 4;
    }
  }

  ensure(36);
  const your = plainText(answerText(s, info.opts, s.your_answer));
  const correct = plainText(correctText(s, info.opts));
  pdf.setFontSize(8.5);
  setText(pdf, status === "correct" ? C.green : status === "incorrect" ? C.red : C.muted);
  pdf.text(`Your Answer: ${your}`, M + 17, y + 12, { maxWidth: BODY_W / 2 - 20 });
  setText(pdf, C.green);
  pdf.text(`Correct Answer: ${correct}`, M + BODY_W / 2, y + 12, { maxWidth: BODY_W / 2 - 18 });
  y += 28;

  const explanationLines = lines(pdf, info.explanation, BODY_W - 52, 8.8);
  const chunks: string[][] = [];
  let remaining = [...explanationLines];
  while (remaining.length) {
    const availableLines = Math.max(1, Math.floor((BODY_BOTTOM - y - 30) / 12));
    chunks.push(remaining.splice(0, availableLines));
    if (remaining.length) y = newPage(pdf, meta, kind);
  }
  if (!chunks.length) chunks.push(["Explanation not available."]);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const h = Math.max(42, chunk.length * 12 + 28);
    ensure(h);
    setFill(pdf, C.bluePale);
    setDraw(pdf, C.line);
    pdf.roundedRect(M + 16, y, BODY_W - 32, h, 4, 4, "FD");
    setFill(pdf, C.blue);
    pdf.circle(M + 30, y + 14, 7, "F");
    setText(pdf, C.white);
    pdf.setFontSize(8);
    pdf.text("i", M + 30, y + 17, { align: "center" });
    setText(pdf, C.blue);
    pdf.setFontSize(8.3);
    pdf.text(i === 0 ? "EXPLANATION" : "EXPLANATION (CONTINUED)", M + 41, y + 17);
    setText(pdf, C.ink);
    pdf.setFontSize(8.8);
    pdf.text(chunk, M + 26, y + 31, { lineHeightFactor: 1.3 });
    y += h + 6;
  }

  if (canSingleCard) return cardTop + info.height + 5;
  return y + 4;
}

function addFooters(pdf: JsPdfType, meta: PdfMeta) {
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    pdf.setPage(page);
    setDraw(pdf, C.line);
    pdf.setLineWidth(0.5);
    pdf.line(M, A4_H - 36, A4_W - M, A4_H - 36);
    pdf.setFontSize(7.5);
    setText(pdf, C.muted);
    pdf.text(plainText(meta.testTitle), M, A4_H - 22, { maxWidth: 220 });
    pdf.text("Small Steps. Big Results.", A4_W / 2, A4_H - 22, { align: "center" });
    pdf.text(`Page ${page} of ${total}`, A4_W - M, A4_H - 22, { align: "right" });
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function generateResultPdf(opts: {
  kind: PdfKind;
  meta: PdfMeta;
  items: { sol: PdfSolution; status: Status }[];
  lang: "en" | "hi";
  onProgress?: (done: number, total: number) => void;
}): Promise<void> {
  console.info("[result-pdf] generator v2 (native jsPDF) called", {
    kind: opts.kind,
    questions: opts.items.length,
    test: opts.meta.testTitle,
    attemptNumber: opts.meta.attemptNumber,
  });
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true, putOnlyUsedFonts: true });
  await installFont(pdf);
  pdf.setProperties({
    title: `${kindLabel(opts.kind)} - ${opts.meta.testTitle}`,
    subject: "Aditya Exam Hub test performance report",
    author: "Aditya Exam Hub",
    creator: "Aditya Exam Hub",
  });

  let y = firstPage(pdf, opts.meta, opts.kind, opts.items.length);
  for (let i = 0; i < opts.items.length; i++) {
    const item = opts.items[i]!;
    y = await drawQuestion(pdf, opts.meta, opts.kind, item.sol, item.status, opts.lang, y);
    opts.onProgress?.(i + 1, opts.items.length);
    if ((i + 1) % 5 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  addFooters(pdf, opts.meta);
  const blob = pdf.output("blob");
  if (!blob.size) throw new Error("The generated PDF was empty");
  const filename = pdfFileName(opts.kind, opts.meta.testTitle);
  console.info("[result-pdf] generation completed", { filename, bytes: blob.size, pages: pdf.getNumberOfPages() });
  downloadBlob(blob, filename);
  console.info("[result-pdf] download started", filename);
}