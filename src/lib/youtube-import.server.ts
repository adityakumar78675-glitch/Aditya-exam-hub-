import type { ExtractedQuestion } from "./youtube-utils";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type CaptionTrack = { baseUrl: string; languageCode?: string; kind?: string };

export async function assertAdmin(
  supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

export function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

export async function fetchWatchPage(videoId: string): Promise<string> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!res.ok) throw new Error(`Could not reach YouTube (status ${res.status}).`);
  return await res.text();
}

export async function fetchOembed(videoId: string) {
  try {
    const oe = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { "User-Agent": UA } },
    );
    if (!oe.ok) return { title: "", channel: "" };
    const j = (await oe.json()) as { title?: string; author_name?: string };
    return { title: j.title ?? "", channel: j.author_name ?? "" };
  } catch {
    return { title: "", channel: "" };
  }
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

export async function fetchTranscript(html: string) {
  const tracks = parseTracks(html);
  if (!tracks.length) return { text: "", language: null as string | null };
  const preferred =
    tracks.find((t) => t.languageCode?.startsWith("hi") && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode?.startsWith("en") && t.kind !== "asr") ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks[0]!;
  try {
    const res = await fetch(decodeHtml(preferred.baseUrl) + "&fmt=json3", { headers: { "User-Agent": UA } });
    if (!res.ok) return { text: "", language: preferred.languageCode ?? null };
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

export function firstJsonObject(text: string): string | null {
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

export function validateExtracted(q: ExtractedQuestion): ExtractedQuestion {
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
  const all = question + " " + options.join(" ");
  if (/\\[a-zA-Z]+/.test(all) && !/\$/.test(all)) reasons.push("Possibly broken formula formatting");
  return {
    question,
    options,
    correct_option: correct,
    explanation,
    needs_review: reasons.length > 0 || !!q.needs_review,
    review_reason: reasons.length ? reasons.join("; ") : (q.review_reason ?? null),
  };
}

export function buildPrompt(transcript: string, translate: "none" | "hi" | "en" | undefined) {
  const translateInstruction =
    translate === "hi"
      ? "Translate every question, option and explanation into Hindi (Devanagari)."
      : translate === "en"
        ? "Translate every question, option and explanation into English."
        : "Keep the exact language of the session (Hindi, English or Hinglish). Do NOT translate.";

  return `You are given the raw transcript of an objective-question solving session from YouTube.

TASK: Extract ONLY the objective (MCQ) questions that were ACTUALLY discussed or read out in this transcript.

STRICT RULES:
- NEVER invent a question. If the transcript only mentions a topic without an actual question, skip it.
- If a question is discussed but its options are incomplete, still include it and set needs_review true.
- Use the teacher's spoken explanation as "explanation" when present.
- If the correct answer is not clearly stated, set "correct_option": null and "needs_review": true.
- Exactly 4 options where possible, in order A, B, C, D.
- Preserve Physics/Chemistry/Maths formulas using $...$ LaTeX (e.g. $F = \\frac{kq_1q_2}{r^2}$, $H_2O$, $CO_2$).
- ${translateInstruction}
- Return ONLY JSON, no prose:
{"questions":[{"question":"...","options":["A","B","C","D"],"correct_option":0,"explanation":"...","needs_review":false,"review_reason":null}]}
If no objective questions exist, return {"questions":[]}.

TRANSCRIPT:
${transcript}`;
}

export async function callExtractionAI(apiKey: string, prompt: string) {
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
  return json.choices?.[0]?.message?.content ?? "";
}
