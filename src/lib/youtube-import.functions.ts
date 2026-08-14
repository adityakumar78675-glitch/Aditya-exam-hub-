import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ExtractedQuestion = {
  question: string;
  options: string[];
  correct_option: number | null;
  explanation: string | null;
  needs_review: boolean;
  review_reason: string | null;
};

export type AnalyzeResult = {
  video_id: string;
  url: string;
  title: string;
  channel: string;
  duration_seconds: number | null;
  transcript_status: "available" | "unavailable";
  transcript_language: string | null;
  transcript_chars: number;
  truncated: boolean;
  questions: ExtractedQuestion[];
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function extractYoutubeId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;
  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0] ?? "";
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host !== "youtube.com" && host !== "music.youtube.com" && host !== "youtube-nocookie.com") return null;
  const v = u.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;
  const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/);
  return m?.[2] ?? null;
}

async function assertAdmin(
  supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string; name?: { simpleText?: string } };

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

async function fetchWatchPage(videoId: string): Promise<string> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) throw new Error(`Could not reach YouTube (status ${res.status}).`);
  return await res.text();
}

function parseTracks(html: string): CaptionTrack[] {
  const m = html.match(/"captionTracks":(\[.*?\])/);
  if (!m?.[1]) return [];
  try {
    return JSON.parse(m[1].replace(/\\u0026/g, "&")) as CaptionTrack[];
  } catch {
    return [];
  }
}

async function fetchTranscript(videoId: string, html: string) {
  const tracks = parseTracks(html);
  if (!tracks.length) return { text: "", language: null as string | null };
  const preferred =
    tracks.find((t) => t.languageCode?.startsWith("hi") && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0]!;
  const url = decodeHtml(preferred.baseUrl) + "&fmt=json3";
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return { text: "", language: preferred.languageCode ?? null };
  try {
    const json = (await res.json()) as { events?: { segs?: { utf8?: string }[] }[] };
    const text = (json.events ?? [])
      .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? "").join(""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return { text, language: preferred.languageCode ?? null };
  } catch {
    return { text: "", language: preferred.languageCode ?? null };
  }
}

function firstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function validate(q: ExtractedQuestion): ExtractedQuestion {
  const reasons: string[] = [];
  const question = String(q.question ?? "").trim();
  const options = (q.options ?? []).map((o) => String(o ?? "").trim());
  const explanation = q.explanation ? String(q.explanation).trim() : null;
  if (!question) reasons.push("Question text is empty");
  if (options.length !== 4) reasons.push("Must have exactly 4 options");
  if (options.some((o) => !o)) reasons.push("One or more options are empty");
  const lower = options.map((o) => o.toLowerCase());
  if (new Set(lower).size !== lower.length) reasons.push("Duplicate options");
  const correct = typeof q.correct_option === "number" ? q.correct_option : null;
  if (correct === null || correct < 0 || correct >= options.length) reasons.push("Correct answer not determined");
  if (!explanation) reasons.push("Explanation missing");
  if (/\\[a-zA-Z]+/.test(question + options.join(" ")) && !/\$/.test(question + options.join(" ")))
    reasons.push("Possibly broken formula formatting");
  return {
    question,
    options,
    correct_option: correct,
    explanation,
    needs_review: reasons.length > 0 || !!q.needs_review,
    review_reason: reasons.length ? reasons.join("; ") : (q.review_reason ?? null),
  };
}

export const adminAnalyzeYoutubeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; translate?: "none" | "hi" | "en" }) => d)
  .handler(async ({ data, context }): Promise<AnalyzeResult> => {
    await assertAdmin(context.supabase as never, context.userId);

    const videoId = extractYoutubeId(data.url);
    if (!videoId) throw new Error("Please enter a valid YouTube video URL.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured");

    let html: string;
    try {
      html = await fetchWatchPage(videoId);
    } catch (e) {
      throw new Error((e as Error).message || "Network failure while reaching YouTube.");
    }
    if (/"status":"ERROR"|Video unavailable/.test(html) && !/"captionTracks"/.test(html)) {
      throw new Error("This video is unavailable or private.");
    }

    let title = "";
    let channel = "";
    try {
      const oe = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
        { headers: { "User-Agent": UA } },
      );
      if (oe.ok) {
        const j = (await oe.json()) as { title?: string; author_name?: string };
        title = j.title ?? "";
        channel = j.author_name ?? "";
      }
    } catch {
      /* metadata is best-effort */
    }
    if (!title) title = decodeHtml(html.match(/"title":"(.*?)"/)?.[1] ?? "") || "YouTube video";
    const durationSeconds = Number(html.match(/"lengthSeconds":"(\d+)"/)?.[1] ?? "") || null;

    const { text: transcript, language } = await fetchTranscript(videoId, html);
    if (!transcript || transcript.length < 200) {
      return {
        video_id: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        channel,
        duration_seconds: durationSeconds,
        transcript_status: "unavailable",
        transcript_language: language,
        transcript_chars: transcript.length,
        truncated: false,
        questions: [],
      };
    }

    const MAX = 90000;
    const truncated = transcript.length > MAX;
    const usable = truncated ? transcript.slice(0, MAX) : transcript;

    const translateInstruction =
      data.translate === "hi"
        ? "Translate every question, option and explanation into Hindi (Devanagari)."
        : data.translate === "en"
          ? "Translate every question, option and explanation into English."
          : "Keep the exact language of the session (Hindi, English or Hinglish). Do NOT translate.";

    const prompt = `You are given the raw transcript of an objective-question solving session from YouTube.

TASK: Extract ONLY the objective (MCQ) questions that were ACTUALLY discussed/read out in this transcript.

STRICT RULES:
- NEVER invent a question. If the transcript only mentions a topic without an actual question, skip it.
- If a question is discussed but its options are incomplete, still include it with the options available and set needs_review true.
- Use the teacher's spoken explanation as "explanation" when present.
- If the correct answer is not clearly stated, set "correct_option": null and "needs_review": true.
- Exactly 4 options where possible, in order A, B, C, D.
- Preserve Physics/Chemistry/Maths formulas correctly using $...$ LaTeX (e.g. $F = \\frac{kq_1q_2}{r^2}$, $H_2O$, $CO_2$).
- ${translateInstruction}
- Return ONLY JSON, no prose:
{"questions":[{"question":"...","options":["A","B","C","D"],"correct_option":0,"explanation":"...","needs_review":false,"review_reason":null}]}
If no objective questions exist, return {"questions":[]}.

TRANSCRIPT:
${usable}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You extract exam questions from lecture transcripts. You never fabricate questions. You always reply with valid JSON only.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (res.status === 429) throw new Error("AI rate limit reached. Please try again shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please add credits to continue.");
    if (!res.ok) throw new Error(`AI extraction failed [${res.status}].`);

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "";
    const objText = firstJsonObject(content);
    if (!objText) throw new Error("AI returned an unexpected response. Please try again.");
    let parsed: { questions?: ExtractedQuestion[] };
    try {
      parsed = JSON.parse(objText) as { questions?: ExtractedQuestion[] };
    } catch {
      throw new Error("AI returned invalid JSON. Please try again.");
    }

    return {
      video_id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      channel,
      duration_seconds: durationSeconds,
      transcript_status: "available",
      transcript_language: language,
      transcript_chars: transcript.length,
      truncated,
      questions: (parsed.questions ?? []).map(validate),
    };
  });

/* ---------------- import into an existing test ---------------- */

export function normalizeQuestion(s: string) {
  return s
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const adminImportYoutubeQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      testId: string;
      video: { id: string; url: string; title: string };
      skipDuplicates: boolean;
      questions: {
        question_en: string;
        options_en: string[];
        correct_option: number;
        solution_en?: string | null;
        positive_marks?: number | null;
        negative_marks?: number | null;
      }[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (!data.questions.length) throw new Error("No questions selected");
    if (data.questions.length > 500) throw new Error("Maximum 500 questions per import");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("test_questions")
      .select("order_index, question_en")
      .eq("test_id", data.testId);
    if (exErr) throw new Error(exErr.message);

    const seen = new Set((existing ?? []).map((r) => normalizeQuestion(r.question_en)));
    let next = Math.max(0, ...(existing ?? []).map((r) => r.order_index ?? 0)) + 1;
    const importedAt = new Date().toISOString();

    let skipped = 0;
    const rows: Record<string, unknown>[] = [];
    for (const q of data.questions) {
      const question = q.question_en.trim();
      const opts = q.options_en.map((o) => String(o ?? "").trim());
      if (!question) throw new Error("A question has no text");
      if (opts.length !== 4 || opts.some((o) => !o)) throw new Error("A question does not have 4 valid options");
      if (q.correct_option < 0 || q.correct_option > 3) throw new Error("A question has an invalid answer");
      const key = normalizeQuestion(question);
      if (data.skipDuplicates && seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      rows.push({
        test_id: data.testId,
        order_index: next++,
        type: "mcq",
        question_en: question,
        options_en: opts,
        options_hi: [],
        correct_option: q.correct_option,
        solution_en: q.solution_en?.trim() || null,
        positive_marks: q.positive_marks ?? null,
        negative_marks: q.negative_marks ?? null,
        source_type: "youtube",
        youtube_video_id: data.video.id,
        youtube_url: data.video.url,
        youtube_title: data.video.title,
        imported_at: importedAt,
        imported_by: context.userId,
      });
    }

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabaseAdmin.from("test_questions").insert(rows.slice(i, i + 200) as never);
      if (error) throw new Error(error.message);
    }
    return { inserted: rows.length, skipped };
  });

/** Normalized question texts of a test, for client-side duplicate detection. */
export const adminGetTestQuestionKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("test_questions")
      .select("question_en")
      .eq("test_id", data.testId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => normalizeQuestion(r.question_en));
  });
