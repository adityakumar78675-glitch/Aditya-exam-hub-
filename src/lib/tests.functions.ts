import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ---------------- deterministic shuffle helpers ---------------- */

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const rnd = mulberry32(hashSeed(seed));
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Permutation of option indices used for a given attempt+question. */
function optionPermutation(count: number, attemptId: string, questionId: string): number[] {
  return seededShuffle(
    Array.from({ length: count }, (_, i) => i),
    `${attemptId}:${questionId}`,
  );
}

/* ---------------- types ---------------- */

export type SafeQuestion = {
  id: string;
  index: number;
  type: "mcq" | "numerical" | "truefalse" | "subjective";
  question_en: string;
  question_hi: string | null;
  image_url: string | null;
  options_en: string[];
  options_hi: string[];
  positive_marks: number;
  negative_marks: number;
};

type AnswerValue = number | string | boolean | null;

/** Payload sent only after a student legitimately reveals an answer. */
export type Reveal = {
  verdict: boolean | null;
  correctIndex: number | null;
  correctNumeric: number | null;
  correctBool: boolean | null;
  solution_en: string | null;
  solution_hi: string | null;
};


export type SolutionItem = {
  number: number;
  id: string;
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
  your_answer: AnswerValue;
  verdict: boolean | null;
  marked: boolean;
  positive_marks: number;
  negative_marks: number;
};

/* ---------------- public (guest) test list ---------------- */

export const listPublicTests = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  const { data: tests, error } = await client
    .from("tests")
    .select(
      "id, title, subject, batch_id, duration_minutes, positive_marks, negative_marks, languages, start_at, end_at, is_published, leaderboard_enabled",
    )
    .eq("is_published", true)
    .is("batch_id", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ids = (tests ?? []).map((t: { id: string }) => t.id);
  const counts: Record<string, number> = {};
  if (ids.length) {
    const { data: qs } = await supabaseAdmin.from("test_questions").select("test_id").in("test_id", ids);
    for (const q of qs ?? []) counts[q.test_id] = (counts[q.test_id] ?? 0) + 1;
  }

  type PublicTest = NonNullable<typeof tests>[number];
  return (tests ?? []).map((t: PublicTest) => ({
    ...(t as PublicTest),
    question_count: counts[t.id] ?? 0,
    attempt_count: 0,
    attempt: null as null | { submitted: boolean; score: number | null; total_marks: number | null },
  }));
});

/* ---------------- list tests ---------------- */

export const listTests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: tests, error } = await supabase
      .from("tests")
      .select(
        "id, title, subject, batch_id, duration_minutes, positive_marks, negative_marks, languages, start_at, end_at, is_published, leaderboard_enabled",
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const { data: attempts } = await supabase
      .from("test_attempts")
      .select("test_id, attempt_number, submitted_at, score, total_marks")
      .eq("student_id", userId)
      .order("attempt_number", { ascending: true });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = (tests ?? []).map((t) => t.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: qs } = await supabaseAdmin.from("test_questions").select("test_id").in("test_id", ids);
      for (const q of qs ?? []) counts[q.test_id] = (counts[q.test_id] ?? 0) + 1;
    }

    return (tests ?? []).map((t) => {
      const mine = (attempts ?? []).filter((x) => x.test_id === t.id);
      const submitted = mine.filter((x) => x.submitted_at);
      const active = mine.find((x) => !x.submitted_at) ?? null;
      const best = submitted.length
        ? submitted.reduce((b, a) => (Number(a.score ?? 0) > Number(b.score ?? 0) ? a : b))
        : null;
      return {
        ...t,
        question_count: counts[t.id] ?? 0,
        attempt_count: submitted.length,
        attempt: best
          ? { submitted: true, score: best.score, total_marks: best.total_marks }
          : active
            ? { submitted: false, score: null, total_marks: null }
            : null,
      };
    });
  });

/* ---------------- attempt helpers ---------------- */

type AttemptRow = {
  id: string;
  attempt_number: number;
  score: number | null;
  total_marks: number | null;
  correct_count: number | null;
  incorrect_count: number | null;
  unattempted_count: number | null;
  time_taken_seconds: number | null;
  started_at: string;
  submitted_at: string | null;
};

export type AttemptSummary = {
  id: string;
  attempt_number: number;
  score: number;
  total_marks: number;
  percentage: number;
  accuracy: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  time_taken_seconds: number;
  started_at: string;
  submitted_at: string;
};

function summarize(a: AttemptRow): AttemptSummary {
  const score = Number(a.score ?? 0);
  const total = Number(a.total_marks ?? 0);
  const correct = a.correct_count ?? 0;
  const incorrect = a.incorrect_count ?? 0;
  const attempted = correct + incorrect;
  return {
    id: a.id,
    attempt_number: a.attempt_number,
    score,
    total_marks: total,
    percentage: total ? Math.round((score / total) * 1000) / 10 : 0,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
    correct,
    incorrect,
    unattempted: a.unattempted_count ?? 0,
    time_taken_seconds: a.time_taken_seconds ?? 0,
    started_at: a.started_at,
    submitted_at: a.submitted_at ?? "",
  };
}

const ATTEMPT_COLS =
  "id, attempt_number, score, total_marks, correct_count, incorrect_count, unattempted_count, time_taken_seconds, started_at, submitted_at";

/** All attempts for a student on a test, oldest first. */
async function loadAttempts(
  admin: { from: (t: string) => any },
  testId: string,
  userId: string,
): Promise<AttemptRow[]> {
  const { data } = await admin
    .from("test_attempts")
    .select(ATTEMPT_COLS)
    .eq("test_id", testId)
    .eq("student_id", userId)
    .order("attempt_number", { ascending: true });
  return (data ?? []) as AttemptRow[];
}

function attemptsLeft(
  test: { allow_reattempts: boolean | null; max_attempts: number | null },
  submittedCount: number,
): { canStartNew: boolean; limit: number | null } {
  const limit = test.allow_reattempts === false ? 1 : test.max_attempts && test.max_attempts > 0 ? test.max_attempts : null;
  if (limit === null) return { canStartNew: true, limit: null };
  return { canStartNew: submittedCount < limit, limit };
}

/* ---------------- test meta (instructions screen) ---------------- */

export const getTestMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test, error } = await supabase
      .from("tests")
      .select(
        "id, title, subject, instructions, batch_id, duration_minutes, positive_marks, negative_marks, languages, start_at, end_at, show_solutions, leaderboard_enabled, allow_reattempts, max_attempts",
      )
      .eq("id", data.testId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!test) throw new Error("Test not found or not available");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const all = await loadAttempts(supabaseAdmin as never, data.testId, userId);
    const active = all.find((a) => !a.submitted_at) ?? null;
    const submitted = all.filter((a) => a.submitted_at);
    const { canStartNew, limit } = attemptsLeft(test, submitted.length);

    const { count } = await supabaseAdmin
      .from("test_questions")
      .select("id", { count: "exact", head: true })
      .eq("test_id", data.testId);

    return {
      test,
      attempt: active
        ? { id: active.id, started_at: active.started_at, submitted_at: null }
        : submitted.length
          ? { id: submitted[submitted.length - 1]!.id, started_at: submitted[submitted.length - 1]!.started_at, submitted_at: submitted[submitted.length - 1]!.submitted_at }
          : null,
      hasActive: !!active,
      attempts: submitted.map(summarize),
      attemptLimit: limit,
      canStartNew,
      question_count: count ?? 0,
    };
  });

/* ---------------- start / resume attempt ---------------- */

export const startAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // RLS-checked visibility of the test
    const { data: test } = await supabase
      .from("tests")
      .select("id, duration_minutes, randomize_questions, start_at, end_at, allow_reattempts, max_attempts")
      .eq("id", data.testId)
      .maybeSingle();
    if (!test) throw new Error("Test not available");
    const now = Date.now();
    if (test.start_at && now < new Date(test.start_at).getTime()) throw new Error("Test has not started yet");
    if (test.end_at && now > new Date(test.end_at).getTime()) throw new Error("Test window has closed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const all = await loadAttempts(supabaseAdmin as never, data.testId, userId);
    const active = all.find((a) => !a.submitted_at);
    if (active) return { attemptId: active.id, attemptNumber: active.attempt_number, resumed: true };

    const submittedCount = all.filter((a) => a.submitted_at).length;
    const { canStartNew, limit } = attemptsLeft(test, submittedCount);
    if (!canStartNew) {
      throw new Error(
        limit === 1
          ? "You have already submitted this test"
          : "You have reached the maximum number of attempts.",
      );
    }

    const attemptNumber = (all[all.length - 1]?.attempt_number ?? 0) + 1;

    const { data: qs } = await supabaseAdmin
      .from("test_questions")
      .select("id")
      .eq("test_id", data.testId)
      .order("order_index", { ascending: true });
    let order = (qs ?? []).map((q) => q.id);
    if (!order.length) throw new Error("This test has no questions yet");
    // Fresh randomization for every attempt so previous order can't be memorised.
    if (test.randomize_questions)
      order = seededShuffle(order, `${data.testId}:${userId}:${attemptNumber}:${now}`);

    const expires = new Date(now + test.duration_minutes * 60_000).toISOString();
    const { data: created, error } = await supabaseAdmin
      .from("test_attempts")
      .insert({
        test_id: data.testId,
        student_id: userId,
        attempt_number: attemptNumber,
        question_order: order,
        expires_at: expires,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { attemptId: created.id, attemptNumber, resumed: false };
  });


/* ---------------- attempt state (questions, no answers) ---------------- */

export const getAttemptState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test } = await supabase
      .from("tests")
      .select(
        "id, title, subject, duration_minutes, languages, positive_marks, negative_marks, randomize_options, allow_show_answer, practice_mode",
      )
      .eq("id", data.testId)
      .maybeSingle();
    if (!test) throw new Error("Test not available");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("test_attempts")
      .select("id, attempt_number, question_order, answers, marked, checked, started_at, expires_at, submitted_at")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .is("submitted_at", null)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!attempt) return { status: "not_started" as const, test };
    if (attempt.submitted_at) return { status: "submitted" as const, test };

    const { data: rows } = await supabaseAdmin
      .from("test_questions")
      .select(
        "id, type, question_en, question_hi, image_url, options_en, options_hi, positive_marks, negative_marks, correct_option, correct_numeric, correct_bool, solution_en, solution_hi",
      )
      .eq("test_id", data.testId);


    const byId = new Map((rows ?? []).map((r) => [r.id, r]));
    const questions: SafeQuestion[] = attempt.question_order
      .map((qid, i) => {
        const r = byId.get(qid);
        if (!r) return null;
        let en = (r.options_en as string[] | null) ?? [];
        let hi = (r.options_hi as string[] | null) ?? [];
        if (test.randomize_options && r.type === "mcq" && en.length > 1) {
          const perm = optionPermutation(en.length, attempt.id, r.id);
          en = perm.map((p) => en[p] ?? "");
          hi = hi.length === perm.length ? perm.map((p) => hi[p] ?? "") : hi;
        }
        return {
          id: r.id,
          index: i,
          type: r.type,
          question_en: r.question_en,
          question_hi: r.question_hi,
          image_url: r.image_url,
          options_en: en,
          options_hi: hi,
          positive_marks: Number(r.positive_marks ?? test.positive_marks),
          negative_marks: Number(r.negative_marks ?? test.negative_marks),
        } as SafeQuestion;
      })
      .filter(Boolean) as SafeQuestion[];

    const answersMap = (attempt.answers ?? {}) as Record<string, AnswerValue>;
    const checkedMap = (attempt.checked ?? {}) as Record<string, boolean>;
    const canShowAnswer = !!(test.allow_show_answer || test.practice_mode);

    // Only questions the student already revealed carry answer data.
    const reveals: Record<string, Reveal> = {};
    if (canShowAnswer) {
      for (const qid of Object.keys(checkedMap)) {
        if (!checkedMap[qid]) continue;
        const r = byId.get(qid);
        if (!r) continue;
        reveals[qid] = buildReveal(r, answersMap[qid] ?? null, permFor(test, r, attempt.id));
      }
    }

    return {
      status: "active" as const,
      test,
      canShowAnswer,
      practiceMode: !!test.practice_mode,
      attemptId: attempt.id,
      attemptNumber: attempt.attempt_number,
      answers: answersMap,
      marked: (attempt.marked ?? {}) as Record<string, boolean>,
      checked: checkedMap,
      reveals,
      startedAt: attempt.started_at,
      expiresAt: attempt.expires_at,
      serverNow: new Date().toISOString(),
      questions,
    };
  });

/* ---------------- show answer (practice / show-answer mode) ---------------- */

type QuestionRow = {
  id: string;
  type: string;
  options_en: unknown;
  correct_option: number | null;
  correct_numeric: number | null;
  correct_bool: boolean | null;
  solution_en?: string | null;
  solution_hi?: string | null;
};

function permFor(
  test: { randomize_options: boolean | null },
  q: QuestionRow,
  attemptId: string,
): number[] | null {
  const count = ((q.options_en as string[] | null) ?? []).length;
  return test.randomize_options && q.type === "mcq" && count > 1
    ? optionPermutation(count, attemptId, q.id)
    : null;
}

function buildReveal(q: QuestionRow, raw: AnswerValue, perm: number[] | null): Reveal {
  // For a shuffled attempt the stored correct index must be mapped into the
  // option order the student is actually looking at.
  let correctIndex: number | null = q.correct_option;
  if (q.type === "mcq" && perm && q.correct_option !== null) {
    const shown = perm.indexOf(q.correct_option);
    correctIndex = shown >= 0 ? shown : null;
  }
  return {
    verdict: isCorrect(q as never, raw, perm),
    correctIndex: q.type === "mcq" ? correctIndex : null,
    correctNumeric: q.correct_numeric === null ? null : Number(q.correct_numeric),
    correctBool: q.correct_bool,
    solution_en: q.solution_en ?? null,
    solution_hi: q.solution_hi ?? null,
  };
}

export const revealAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string; questionId: string; answer: AnswerValue }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test } = await supabase
      .from("tests")
      .select("id, randomize_options, allow_show_answer, practice_mode")
      .eq("id", data.testId)
      .maybeSingle();
    if (!test) throw new Error("Test not available");
    if (!test.allow_show_answer && !test.practice_mode)
      throw new Error("Show Answer is not enabled for this test");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("test_attempts")
      .select("id, question_order, answers, checked, submitted_at, expires_at")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .is("submitted_at", null)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!attempt) throw new Error("No active attempt");
    if (!attempt.question_order.includes(data.questionId)) throw new Error("Question not in this attempt");
    if (Date.now() > new Date(attempt.expires_at).getTime()) throw new Error("Time is up");

    const answers = { ...((attempt.answers ?? {}) as Record<string, AnswerValue>) };
    const checked = { ...((attempt.checked ?? {}) as Record<string, boolean>) };

    // Answer is locked once checked: a previously revealed question keeps its saved answer.
    if (!checked[data.questionId]) answers[data.questionId] = data.answer;
    const raw = answers[data.questionId] ?? null;
    if (raw === null || raw === "") throw new Error("Select an answer first");
    checked[data.questionId] = true;

    const { data: q } = await supabaseAdmin
      .from("test_questions")
      .select("id, type, options_en, correct_option, correct_numeric, correct_bool, solution_en, solution_hi")
      .eq("id", data.questionId)
      .eq("test_id", data.testId)
      .maybeSingle();
    if (!q) throw new Error("Question not found");

    const { error } = await supabaseAdmin
      .from("test_attempts")
      .update({ answers, checked })
      .eq("id", attempt.id)
      .is("submitted_at", null);
    if (error) throw new Error(error.message);

    return { questionId: data.questionId, answer: raw, reveal: buildReveal(q, raw, permFor(test, q, attempt.id)) };
  });


/* ---------------- save answers (batched, offline-safe) ---------------- */

export const saveAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string; answers: Record<string, AnswerValue>; marked: Record<string, boolean> }) => d)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("test_attempts")
      .select("id, answers, marked, submitted_at, expires_at")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .is("submitted_at", null)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!attempt) throw new Error("No active attempt");
    if (attempt.submitted_at) return { ok: false, submitted: true };

    const answers = { ...((attempt.answers ?? {}) as Record<string, AnswerValue>), ...data.answers };
    const marked = { ...((attempt.marked ?? {}) as Record<string, boolean>), ...data.marked };
    const { error } = await supabaseAdmin
      .from("test_attempts")
      .update({ answers, marked })
      .eq("id", attempt.id);
    if (error) throw new Error(error.message);
    return { ok: true, submitted: false };
  });

/* ---------------- submit + grade ---------------- */

function isCorrect(
  q: { type: string; correct_option: number | null; correct_numeric: number | null; correct_bool: boolean | null },
  raw: AnswerValue,
  perm: number[] | null,
): boolean | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (q.type === "mcq") {
    const shown = Number(raw);
    const original = perm ? perm[shown] : shown;
    return q.correct_option !== null && original === q.correct_option;
  }
  if (q.type === "truefalse") {
    const v = raw === true || raw === "true" || raw === 1 || raw === "1";
    return q.correct_bool !== null && v === q.correct_bool;
  }
  if (q.type === "numerical") {
    const v = Number(raw);
    if (Number.isNaN(v) || q.correct_numeric === null) return false;
    return Math.abs(v - Number(q.correct_numeric)) < 1e-6;
  }
  return null; // subjective — needs manual review, not auto-graded
}

export const submitTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string; auto?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test } = await supabase
      .from("tests")
      .select("id, positive_marks, negative_marks, randomize_options")
      .eq("id", data.testId)
      .maybeSingle();
    if (!test) throw new Error("Test not available");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("test_attempts")
      .select("id, question_order, answers, started_at, submitted_at")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .is("submitted_at", null)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!attempt) throw new Error("No active attempt");
    if (attempt.submitted_at) return { ok: true, alreadySubmitted: true };

    const { data: rows } = await supabaseAdmin
      .from("test_questions")
      .select("id, type, options_en, correct_option, correct_numeric, correct_bool, positive_marks, negative_marks")
      .eq("test_id", data.testId);
    const byId = new Map((rows ?? []).map((r) => [r.id, r]));
    const answers = (attempt.answers ?? {}) as Record<string, AnswerValue>;

    let score = 0;
    let total = 0;
    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;

    for (const qid of attempt.question_order) {
      const q = byId.get(qid);
      if (!q) continue;
      const pos = Number(q.positive_marks ?? test.positive_marks);
      const neg = Number(q.negative_marks ?? test.negative_marks);
      total += pos;
      const raw = answers[qid] ?? null;
      if (raw === null || raw === undefined || raw === "") {
        unattempted++;
        continue;
      }
      const optCount = ((q.options_en as string[] | null) ?? []).length;
      const perm =
        test.randomize_options && q.type === "mcq" && optCount > 1
          ? optionPermutation(optCount, attempt.id, q.id)
          : null;
      const res = isCorrect(q, raw, perm);
      if (res === true) {
        score += pos;
        correct++;
      } else if (res === false) {
        score -= neg;
        incorrect++;
      }
    }

    const now = new Date();
    const timeTaken = Math.max(0, Math.round((now.getTime() - new Date(attempt.started_at).getTime()) / 1000));
    const { error } = await supabaseAdmin
      .from("test_attempts")
      .update({
        submitted_at: now.toISOString(),
        score,
        total_marks: total,
        correct_count: correct,
        incorrect_count: incorrect,
        unattempted_count: unattempted,
        time_taken_seconds: timeTaken,
      })
      .eq("id", attempt.id)
      .is("submitted_at", null);
    if (error) throw new Error(error.message);
    return { ok: true, alreadySubmitted: false };
  });

/* ---------------- result + solutions ---------------- */

export const getResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string; attemptNumber?: number }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test } = await supabase
      .from("tests")
      .select(
        "id, title, subject, show_solutions, leaderboard_enabled, randomize_options, positive_marks, negative_marks, allow_reattempts, max_attempts, ranking_mode",
      )
      .eq("id", data.testId)
      .maybeSingle();
    if (!test) throw new Error("Test not available");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: mine } = await supabaseAdmin
      .from("test_attempts")
      .select("*")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .not("submitted_at", "is", null)
      .order("attempt_number", { ascending: true });
    const submittedAttempts = (mine ?? []) as (AttemptRow & {
      question_order: string[];
      answers: Record<string, AnswerValue> | null;
    })[];
    if (!submittedAttempts.length) throw new Error("Test not submitted yet");

    const attempt =
      (data.attemptNumber
        ? submittedAttempts.find((a) => a.attempt_number === data.attemptNumber)
        : submittedAttempts[submittedAttempts.length - 1]) ?? null;
    if (!attempt) throw new Error("Attempt not found");

    const history = submittedAttempts.map(summarize);
    const best = history.reduce((b, a) => (a.score > b.score ? a : b), history[0]!);
    const bestStats = {
      score: best.score,
      total_marks: best.total_marks,
      percentage: Math.max(...history.map((h) => h.percentage)),
      accuracy: Math.max(...history.map((h) => h.accuracy)),
      attempt_number: best.attempt_number,
      total_attempts: history.length,
    };
    const { canStartNew, limit } = attemptsLeft(test, history.length);

    let rank: number | null = null;
    let totalParticipants: number | null = null;
    if (test.leaderboard_enabled) {
      const { data: all } = await supabaseAdmin
        .from("test_attempts")
        .select("student_id, score")
        .eq("test_id", data.testId)
        .not("submitted_at", "is", null);
      const mode = (test.ranking_mode ?? "best") as "best" | "latest" | "average";
      const perStudent = new Map<string, number[]>();
      for (const a of all ?? []) {
        const arr = perStudent.get(a.student_id) ?? [];
        arr.push(Number(a.score ?? 0));
        perStudent.set(a.student_id, arr);
      }
      const reduce = (arr: number[]) =>
        mode === "latest"
          ? arr[arr.length - 1]!
          : mode === "average"
            ? arr.reduce((s, v) => s + v, 0) / arr.length
            : Math.max(...arr);
      const scores = [...perStudent.values()].map(reduce).sort((a, b) => b - a);
      const myScore = reduce(perStudent.get(userId) ?? [Number(attempt.score ?? 0)]);
      totalParticipants = scores.length;
      rank = scores.findIndex((s) => s <= myScore) + 1 || null;
    }


    let solutions: SolutionItem[] | null = null;
    if (test.show_solutions) {
      const { data: rows } = await supabaseAdmin
        .from("test_questions")
        .select("*")
        .eq("test_id", data.testId);
      const byId = new Map((rows ?? []).map((r) => [r.id, r]));
      const answers = (attempt.answers ?? {}) as Record<string, AnswerValue>;
      const markedMap = ((attempt as unknown as { marked: Record<string, boolean> | null }).marked ?? {}) as Record<string, boolean>;
      solutions = (attempt.question_order as string[])
        .map((qid, i) => {
          const q = byId.get(qid);
          if (!q) return null;
          const optCount = ((q.options_en as string[] | null) ?? []).length;
          const perm =
            test.randomize_options && q.type === "mcq" && optCount > 1
              ? optionPermutation(optCount, attempt.id, q.id)
              : null;
          const shownEn = perm
            ? perm.map((p) => ((q.options_en as string[]) ?? [])[p] ?? "")
            : ((q.options_en as string[] | null) ?? []);
          const shownHi = perm && ((q.options_hi as string[] | null) ?? []).length === perm.length
            ? perm.map((p) => ((q.options_hi as string[]) ?? [])[p] ?? "")
            : ((q.options_hi as string[] | null) ?? []);
          const correctShown =
            q.type === "mcq" && q.correct_option !== null
              ? perm
                ? perm.indexOf(q.correct_option)
                : q.correct_option
              : null;
          return {
            number: i + 1,
            id: q.id,
            type: q.type,
            question_en: q.question_en,
            question_hi: q.question_hi,
            image_url: q.image_url,
            options_en: shownEn,
            options_hi: shownHi,
            correct_option: correctShown,
            correct_numeric: q.correct_numeric,
            correct_bool: q.correct_bool,
            solution_en: q.solution_en,
            solution_hi: q.solution_hi,
            your_answer: answers[qid] ?? null,
            verdict: isCorrect(q, answers[qid] ?? null, perm),
            marked: !!markedMap[qid],
            positive_marks: Number(q.positive_marks ?? test.positive_marks ?? 0),
            negative_marks: Number(q.negative_marks ?? test.negative_marks ?? 0),
          };
        })
        .filter((s): s is SolutionItem => s !== null);
    }

    return {
      test,
      attempt: {
        attempt_number: attempt.attempt_number,
        total_questions: ((attempt.question_order as string[]) ?? []).length,
        score: Number(attempt.score ?? 0),
        total_marks: Number(attempt.total_marks ?? 0),
        correct: attempt.correct_count ?? 0,
        incorrect: attempt.incorrect_count ?? 0,
        unattempted: attempt.unattempted_count ?? 0,
        time_taken_seconds: attempt.time_taken_seconds ?? 0,
        submitted_at: attempt.submitted_at,
      },
      history,
      best: bestStats,
      canStartNew,
      attemptLimit: limit,
      rank,
      totalParticipants,
      solutions,
    };
  });

/* ---------------- admin ---------------- */

async function assertAdmin(supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }> }, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export const adminListQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("test_questions")
      .select("*")
      .eq("test_id", data.testId)
      .order("order_index", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export type QuestionInput = {
  id?: string;
  test_id: string;
  order_index: number;
  type: "mcq" | "numerical" | "truefalse" | "subjective";
  question_en: string;
  question_hi?: string | null;
  image_url?: string | null;
  options_en?: string[];
  options_hi?: string[];
  correct_option?: number | null;
  correct_numeric?: number | null;
  correct_bool?: boolean | null;
  solution_en?: string | null;
  solution_hi?: string | null;
  positive_marks?: number | null;
  negative_marks?: number | null;
};

export const adminSaveQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: QuestionInput) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = { ...data };
    delete payload.id;
    if (data.id) {
      const { error } = await supabaseAdmin.from("test_questions").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await supabaseAdmin
      .from("test_questions")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const adminDeleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("test_questions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- bulk import ---------------- */

export type BulkQuestionInput = {
  question_en: string;
  options_en: string[];
  correct_option: number;
  positive_marks?: number | null;
  negative_marks?: number | null;
  solution_en?: string | null;
  image_url?: string | null;
};

export const adminBulkInsertQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string; questions: BulkQuestionInput[] }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (!data.questions.length) throw new Error("No questions to import");
    if (data.questions.length > 1000) throw new Error("Maximum 1000 questions per import");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("test_questions")
      .select("order_index")
      .eq("test_id", data.testId)
      .order("order_index", { ascending: false })
      .limit(1);
    let next = (existing?.[0]?.order_index ?? 0) + 1;

    const rows = data.questions.map((q) => {
      const opts = q.options_en.map((o) => String(o ?? "").trim());
      if (!q.question_en.trim()) throw new Error("A question has no text");
      if (opts.length < 2 || opts.some((o) => !o)) throw new Error("A question has empty options");
      if (q.correct_option < 0 || q.correct_option >= opts.length) throw new Error("A question has an invalid answer");
      return {
        test_id: data.testId,
        order_index: next++,
        type: "mcq" as const,
        question_en: q.question_en.trim(),
        options_en: opts,
        options_hi: [],
        correct_option: q.correct_option,
        solution_en: q.solution_en?.trim() || null,
        image_url: q.image_url?.trim() || null,
        positive_marks: q.positive_marks ?? null,
        negative_marks: q.negative_marks ?? null,
      };
    });

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabaseAdmin.from("test_questions").insert(rows.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    return { inserted: rows.length };
  });

/* ---------------- question image upload ---------------- */

export const adminUploadQuestionImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fileName: string; contentType: string; dataBase64: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (!data.contentType.startsWith("image/")) throw new Error("Only image files are allowed");
    const bytes = Buffer.from(data.dataBase64, "base64");
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Image must be under 10MB");

    const safe = data.fileName.replace(/[^\w.\-]/g, "_").slice(-60);
    const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("question-images")
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) throw new Error(error.message);

    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("question-images")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signErr || !signed) throw new Error(signErr?.message ?? "Could not create image URL");
    return { url: signed.signedUrl };
  });

/* ---------------- AI question generator ---------------- */

export const adminGenerateQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      subject: string;
      chapter?: string;
      count: number;
      difficulty: string;
      language: string;
      exam?: string;
      positive_marks?: number | null;
      negative_marks?: number | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const apiKey = process.env['LOVABLE_API_KEY'];
    if (!apiKey) throw new Error("AI is not configured");

    const count = Math.max(1, Math.min(30, Number(data.count) || 5));
    const prompt = `Generate ${count} multiple-choice questions.
Subject: ${data.subject}
Chapter/Topic: ${data.chapter || "any relevant topic"}
Difficulty: ${data.difficulty}
Language: ${data.language}
Board/Exam: ${data.exam || "general school exam"}

Rules:
- Exactly 4 options per question.
- "answer" is the 0-based index of the correct option.
- Include a short "explanation".
- Use $...$ LaTeX for any math.
- Return ONLY JSON: {"questions":[{"question":"...","options":["","","",""],"answer":0,"explanation":"..."}]}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert exam question setter. Always reply with valid JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached. Please try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
    if (!res.ok) throw new Error(`AI request failed [${res.status}]: ${await res.text()}`);

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI returned an unexpected response. Try again.");
    let parsed: { questions?: { question?: string; options?: string[]; answer?: number; explanation?: string }[] };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      throw new Error("AI returned invalid JSON. Try again.");
    }

    return (parsed.questions ?? []).slice(0, count).map((q) => ({
      question_en: String(q.question ?? "").trim(),
      options_en: (q.options ?? []).slice(0, 4).map((o) => String(o ?? "").trim()),
      correct_option: typeof q.answer === "number" ? q.answer : null,
      solution_en: q.explanation ? String(q.explanation) : null,
      positive_marks: data.positive_marks ?? null,
      negative_marks: data.negative_marks ?? null,
      image_url: null,
    }));
  });
