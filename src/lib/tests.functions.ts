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
      .select("test_id, submitted_at, score, total_marks")
      .eq("student_id", userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = (tests ?? []).map((t) => t.id);
    const counts: Record<string, number> = {};
    if (ids.length) {
      const { data: qs } = await supabaseAdmin.from("test_questions").select("test_id").in("test_id", ids);
      for (const q of qs ?? []) counts[q.test_id] = (counts[q.test_id] ?? 0) + 1;
    }

    return (tests ?? []).map((t) => {
      const a = (attempts ?? []).find((x) => x.test_id === t.id) ?? null;
      return {
        ...t,
        question_count: counts[t.id] ?? 0,
        attempt: a ? { submitted: !!a.submitted_at, score: a.score, total_marks: a.total_marks } : null,
      };
    });
  });

/* ---------------- test meta (instructions screen) ---------------- */

export const getTestMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test, error } = await supabase
      .from("tests")
      .select(
        "id, title, subject, instructions, batch_id, duration_minutes, positive_marks, negative_marks, languages, start_at, end_at, show_solutions, leaderboard_enabled",
      )
      .eq("id", data.testId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!test) throw new Error("Test not found or not available");

    const { data: attempt } = await supabase
      .from("test_attempts")
      .select("id, started_at, expires_at, submitted_at")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("test_questions")
      .select("id", { count: "exact", head: true })
      .eq("test_id", data.testId);

    return { test, attempt: attempt ?? null, question_count: count ?? 0 };
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
      .select("id, duration_minutes, randomize_questions, start_at, end_at")
      .eq("id", data.testId)
      .maybeSingle();
    if (!test) throw new Error("Test not available");
    const now = Date.now();
    if (test.start_at && now < new Date(test.start_at).getTime()) throw new Error("Test has not started yet");
    if (test.end_at && now > new Date(test.end_at).getTime()) throw new Error("Test window has closed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("test_attempts")
      .select("id, submitted_at")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .maybeSingle();
    if (existing) {
      if (existing.submitted_at) throw new Error("You have already submitted this test");
      return { attemptId: existing.id };
    }

    const { data: qs } = await supabaseAdmin
      .from("test_questions")
      .select("id")
      .eq("test_id", data.testId)
      .order("order_index", { ascending: true });
    let order = (qs ?? []).map((q) => q.id);
    if (!order.length) throw new Error("This test has no questions yet");
    if (test.randomize_questions) order = seededShuffle(order, `${data.testId}:${userId}`);

    const expires = new Date(now + test.duration_minutes * 60_000).toISOString();
    const { data: created, error } = await supabaseAdmin
      .from("test_attempts")
      .insert({
        test_id: data.testId,
        student_id: userId,
        question_order: order,
        expires_at: expires,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { attemptId: created.id };
  });

/* ---------------- attempt state (questions, no answers) ---------------- */

export const getAttemptState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test } = await supabase
      .from("tests")
      .select("id, title, subject, duration_minutes, languages, positive_marks, negative_marks, randomize_options")
      .eq("id", data.testId)
      .maybeSingle();
    if (!test) throw new Error("Test not available");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("test_attempts")
      .select("id, question_order, answers, marked, started_at, expires_at, submitted_at")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .maybeSingle();
    if (!attempt) return { status: "not_started" as const, test };
    if (attempt.submitted_at) return { status: "submitted" as const, test };

    const { data: rows } = await supabaseAdmin
      .from("test_questions")
      .select(
        "id, type, question_en, question_hi, image_url, options_en, options_hi, positive_marks, negative_marks",
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

    return {
      status: "active" as const,
      test,
      attemptId: attempt.id,
      answers: (attempt.answers ?? {}) as Record<string, AnswerValue>,
      marked: (attempt.marked ?? {}) as Record<string, boolean>,
      startedAt: attempt.started_at,
      expiresAt: attempt.expires_at,
      serverNow: new Date().toISOString(),
      questions,
    };
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
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: test } = await supabase
      .from("tests")
      .select("id, title, subject, show_solutions, leaderboard_enabled, randomize_options, positive_marks, negative_marks")
      .eq("id", data.testId)
      .maybeSingle();
    if (!test) throw new Error("Test not available");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin
      .from("test_attempts")
      .select("*")
      .eq("test_id", data.testId)
      .eq("student_id", userId)
      .maybeSingle();
    if (!attempt || !attempt.submitted_at) throw new Error("Test not submitted yet");

    let rank: number | null = null;
    let totalParticipants: number | null = null;
    if (test.leaderboard_enabled) {
      const { data: all } = await supabaseAdmin
        .from("test_attempts")
        .select("score")
        .eq("test_id", data.testId)
        .not("submitted_at", "is", null);
      const scores = (all ?? []).map((a) => Number(a.score ?? 0)).sort((a, b) => b - a);
      totalParticipants = scores.length;
      rank = scores.findIndex((s) => s <= Number(attempt.score ?? 0)) + 1 || null;
    }

    let solutions: unknown[] | null = null;
    if (test.show_solutions) {
      const { data: rows } = await supabaseAdmin
        .from("test_questions")
        .select("*")
        .eq("test_id", data.testId);
      const byId = new Map((rows ?? []).map((r) => [r.id, r]));
      const answers = (attempt.answers ?? {}) as Record<string, AnswerValue>;
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
          };
        })
        .filter(Boolean);
    }

    return {
      test,
      attempt: {
        score: Number(attempt.score ?? 0),
        total_marks: Number(attempt.total_marks ?? 0),
        correct: attempt.correct_count ?? 0,
        incorrect: attempt.incorrect_count ?? 0,
        unattempted: attempt.unattempted_count ?? 0,
        time_taken_seconds: attempt.time_taken_seconds ?? 0,
        submitted_at: attempt.submitted_at,
      },
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
