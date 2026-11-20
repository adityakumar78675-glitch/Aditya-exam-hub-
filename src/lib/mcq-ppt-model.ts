import { correctScientific } from "./sci-symbols";

export type PptQuestion = { id: string; number: number; question: string; options: string[] };
export type PptTest = { id: string; title: string; subject: string | null };
export type PptPayload = { test: PptTest; questions: PptQuestion[] };
export const PPT_WIDTH = 13.333333;
export const PPT_HEIGHT = 7.5;
export const PPT_COLORS = { navy: "073B8C", blue: "1261C0", red: "E51B23", paper: "FFFFFF", mist: "F5F7FA", ink: "161D2A" };

export function requirePptAdmin(role: unknown) {
  if (role !== true) throw new Error("Only authenticated admins can generate PowerPoint files.");
}

// Explicit projection: do not spread a database row into export data.
export function projectPptQuestion(row: { id: string; question_en: string; question_hi: string | null; options_en: unknown; options_hi: unknown }, number: number, language: "en" | "hi"): PptQuestion {
  const en = Array.isArray(row.options_en) ? row.options_en : [];
  const hi = Array.isArray(row.options_hi) ? row.options_hi : [];
  const useHindi = language === "hi" && !!row.question_hi?.trim() && hi.length === 4 && hi.every((o) => typeof o === "string" && o.trim());
  const options = useHindi ? hi : en;
  if (options.length !== 4 || options.some((o) => typeof o !== "string" || !o.trim())) throw new Error(`Q${number} needs exactly four non-empty options before export.`);
  const question = useHindi ? row.question_hi ?? row.question_en : row.question_en;
  if (!question.trim()) throw new Error(`Q${number} has no question text.`);
  return { id: row.id, number, question: correctScientific(question), options: options.map((o) => correctScientific(String(o))) };
}

export type Measure = (text: string, size: number, bold: boolean) => number;
export type TextBlock = { text: string; lines: string[]; x: number; y: number; w: number; h: number; size: number; bold: boolean };
export type QuestionLayout = { question: TextBlock; options: TextBlock[] };

function wrap(text: string, width: number, size: number, bold: boolean, measure: Measure) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next, size, bold) <= width) { line = next; continue; }
      if (line) { lines.push(line); line = ""; }
      if (measure(word, size, bold) <= width) { line = word; continue; }
      // Break very long tokens at Unicode codepoints, without deleting text.
      for (const c of word) {
        if (line && measure(line + c, size, bold) > width) { lines.push(line); line = ""; }
        line += c;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function layoutQuestion(q: PptQuestion, measure: Measure): QuestionLayout {
  if (q.options.length !== 4) throw new Error(`Q${q.number} must contain four options.`);
  for (let size = 32; size >= 18; size--) {
    const questionLines = wrap(q.question, 11.8 * 72, size + 2, true, measure);
    const optionLines = q.options.map((o) => wrap(o, 10.65 * 72, size, false, measure));
    const questionHeight = questionLines.length * (size + 2) * 1.25 / 72 + 0.12;
    const heights = optionLines.map((lines) => Math.max(0.59, lines.length * size * 1.25 / 72 + 0.16));
    if (questionHeight + heights.reduce((a, b) => a + b, 0) + 0.75 > 5.85) continue;
    let y = 1.04 + questionHeight + 0.25;
    return {
      question: { text: q.question, lines: questionLines, x: 0.78, y: 1.04, w: 11.8, h: questionHeight, size: size + 2, bold: true },
      options: q.options.map((text, i) => {
        const h = heights[i] ?? 0.59;
        const block = { text, lines: optionLines[i] ?? [], x: 1.8, y, w: 10.65, h, size, bold: false };
        y += h + 0.13;
        return block;
      }),
    };
  }
  throw new Error(`Q${q.number} is too long to fit legibly on one slide. Shorten the question or its options before exporting.`);
}

export function pptFilename(title: string) {
  const clean = title.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 100) || "Test";
  return `AdityaExamHub_${clean}_MCQs.pptx`;
}