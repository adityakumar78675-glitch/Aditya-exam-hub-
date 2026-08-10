export type DraftQuestion = {
  key: string;
  question_en: string;
  options_en: string[];
  correct_option: number | null;
  positive_marks: number | null;
  negative_marks: number | null;
  solution_en: string | null;
  image_url: string | null;
};

let counter = 0;
export function newKey() {
  counter += 1;
  return `q_${Date.now()}_${counter}`;
}

export function emptyDraft(): DraftQuestion {
  return {
    key: newKey(),
    question_en: "",
    options_en: ["", "", "", ""],
    correct_option: null,
    positive_marks: null,
    negative_marks: null,
    solution_en: null,
    image_url: null,
  };
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function letterToIndex(v: string): number | null {
  const s = v.trim().toUpperCase().replace(/[).:\s]/g, "");
  const i = LETTERS.indexOf(s);
  if (i >= 0) return i;
  const n = Number(s);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return n - 1;
  return null;
}

export function indexToLetter(i: number | null): string {
  return i === null || i === undefined ? "" : (LETTERS[i] ?? "");
}

/**
 * Parses pasted text of the form:
 *   Q1. Question text
 *   A. Option A
 *   ...
 *   Answer: B
 *   Marks: 4
 *   Negative: 1
 *   Explanation: ...
 */
export function parseBulkText(input: string): DraftQuestion[] {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const out: DraftQuestion[] = [];
  let cur: DraftQuestion | null = null;
  let lastField: "question" | "option" | "explanation" | null = null;
  let lastOption = -1;

  const push = () => {
    if (cur && (cur.question_en.trim() || cur.options_en.some((o) => o.trim()))) out.push(cur);
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      lastField = null;
      continue;
    }

    const qMatch = line.match(/^(?:q(?:uestion)?\s*)?(\d{1,4})\s*[).:\-]\s*(.*)$/i);
    const optMatch = line.match(/^\(?([A-Fa-f])\)?\s*[).:\-]\s+(.*)$/);
    const ansMatch = line.match(/^(?:ans(?:wer)?|correct(?:\s*answer)?)\s*[:\-]\s*(.+)$/i);
    const marksMatch = line.match(/^(?:marks?|positive(?:\s*marks?)?)\s*[:\-]\s*(-?[\d.]+)/i);
    const negMatch = line.match(/^(?:negative(?:\s*marks?)?|neg)\s*[:\-]\s*(-?[\d.]+)/i);
    const expMatch = line.match(/^(?:explanation|solution|sol|exp)\s*[:\-]\s*(.*)$/i);

    if (ansMatch) {
      if (cur) cur.correct_option = letterToIndex(ansMatch[1]!);
      lastField = null;
      continue;
    }
    if (negMatch) {
      if (cur) cur.negative_marks = Math.abs(Number(negMatch[1]));
      lastField = null;
      continue;
    }
    if (marksMatch) {
      if (cur) cur.positive_marks = Number(marksMatch[1]);
      lastField = null;
      continue;
    }
    if (expMatch) {
      if (cur) cur.solution_en = expMatch[1]!.trim();
      lastField = "explanation";
      continue;
    }
    if (optMatch && cur) {
      const idx = letterToIndex(optMatch[1]!);
      if (idx !== null) {
        while (cur.options_en.length <= idx) cur.options_en.push("");
        cur.options_en[idx] = optMatch[2]!.trim();
        lastOption = idx;
        lastField = "option";
        continue;
      }
    }
    if (qMatch && (!cur || cur.question_en.trim())) {
      push();
      cur = { ...emptyDraft(), key: newKey(), question_en: qMatch[2]!.trim() };
      lastField = "question";
      continue;
    }
    if (!cur) {
      cur = { ...emptyDraft(), key: newKey(), question_en: line };
      lastField = "question";
      continue;
    }
    // continuation line
    if (lastField === "option" && lastOption >= 0) {
      cur.options_en[lastOption] = `${cur.options_en[lastOption]} ${line}`.trim();
    } else if (lastField === "explanation") {
      cur.solution_en = `${cur.solution_en ?? ""} ${line}`.trim();
    } else {
      cur.question_en = `${cur.question_en} ${line}`.trim();
    }
  }
  push();
  return out.map((q) => ({ ...q, options_en: padOptions(q.options_en) }));
}

function padOptions(o: string[]) {
  const arr = o.slice();
  while (arr.length < 4) arr.push("");
  return arr;
}

const HEADER_MAP: Record<string, keyof DraftQuestion | "optA" | "optB" | "optC" | "optD"> = {
  question: "question_en",
  questions: "question_en",
  "question text": "question_en",
  "option a": "optA",
  optiona: "optA",
  a: "optA",
  "option b": "optB",
  optionb: "optB",
  b: "optB",
  "option c": "optC",
  optionc: "optC",
  c: "optC",
  "option d": "optD",
  optiond: "optD",
  d: "optD",
  "correct answer": "correct_option",
  answer: "correct_option",
  correct: "correct_option",
  marks: "positive_marks",
  "positive marks": "positive_marks",
  "negative marks": "negative_marks",
  negative: "negative_marks",
  explanation: "solution_en",
  solution: "solution_en",
  "question image url": "image_url",
  "image url": "image_url",
  image: "image_url",
};

export function rowsToDrafts(rows: Record<string, unknown>[]): DraftQuestion[] {
  return rows.map((row) => {
    const d = emptyDraft();
    for (const [rawKey, rawVal] of Object.entries(row)) {
      const key = HEADER_MAP[rawKey.trim().toLowerCase()];
      if (!key) continue;
      const val = rawVal === null || rawVal === undefined ? "" : String(rawVal).trim();
      if (!val) continue;
      if (key === "optA") d.options_en[0] = val;
      else if (key === "optB") d.options_en[1] = val;
      else if (key === "optC") d.options_en[2] = val;
      else if (key === "optD") d.options_en[3] = val;
      else if (key === "correct_option") d.correct_option = letterToIndex(val);
      else if (key === "positive_marks") d.positive_marks = Number(val);
      else if (key === "negative_marks") d.negative_marks = Math.abs(Number(val));
      else if (key === "solution_en") d.solution_en = val;
      else if (key === "image_url") d.image_url = val;
      else if (key === "question_en") d.question_en = val;
    }
    return d;
  });
}

export type DraftError = { key: string; number: number; message: string };

export function validateDrafts(drafts: DraftQuestion[]): DraftError[] {
  const errs: DraftError[] = [];
  drafts.forEach((q, i) => {
    const n = i + 1;
    if (!q.question_en.trim()) errs.push({ key: q.key, number: n, message: "Question text missing" });
    const opts = q.options_en.slice(0, 4);
    opts.forEach((o, oi) => {
      if (!o.trim()) errs.push({ key: q.key, number: n, message: `Option ${indexToLetter(oi)} missing` });
    });
    if (q.correct_option === null || q.correct_option === undefined) {
      errs.push({ key: q.key, number: n, message: "Correct answer missing" });
    } else if (q.correct_option < 0 || q.correct_option >= q.options_en.length) {
      errs.push({ key: q.key, number: n, message: "Invalid correct answer" });
    }
    if (q.positive_marks !== null && !Number.isFinite(q.positive_marks))
      errs.push({ key: q.key, number: n, message: "Invalid marks" });
    if (q.negative_marks !== null && !Number.isFinite(q.negative_marks))
      errs.push({ key: q.key, number: n, message: "Invalid negative marks" });
  });
  return errs;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[^\w ]/g, "").trim();

export function findDuplicateKeys(drafts: DraftQuestion[]): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const q of drafts) {
    const sig = norm(q.question_en);
    if (!sig) continue;
    if (seen.has(sig)) dup.add(q.key);
    else seen.add(sig);
  }
  return dup;
}
