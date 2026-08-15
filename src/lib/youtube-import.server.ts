import type { ExtractedQuestion } from "./youtube-utils";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type ImportErrorCode =
  | "invalid_url"
  | "video_unavailable"
  | "transcript_unavailable"
  | "rate_limited"
  | "provider_failure"
  | "empty_transcript"
  | "ai_failure";

export class ImportError extends Error {
  code: ImportErrorCode;
  constructor(code: ImportErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export async function assertAdmin(
  supabase: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown }> },
  userId: string,
) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new ImportError("provider_failure", "Forbidden");
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with a small, bounded exponential backoff. At most 3 attempts, and a 429
 * is surfaced as a rate_limited ImportError instead of being retried forever.
 */
export async function fetchWithBackoff(url: string, init?: RequestInit): Promise<Response> {
  const delays = [700, 2200];
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...(init?.headers ?? {}) },
      });
    } catch {
      if (attempt === 2) throw new ImportError("provider_failure", "Network error while contacting the transcript service.");
      await sleep(delays[attempt]!);
      continue;
    }
    if (res.status === 429 || res.status === 503) {
      lastStatus = res.status;
      if (attempt === 2) break;
      await sleep(delays[attempt]!);
      continue;
    }
    return res;
  }
  throw new ImportError(
    "rate_limited",
    lastStatus === 429
      ? "YouTube is temporarily rate-limiting requests. Please try again later."
      : "The transcript service is temporarily unavailable. Please try again later.",
  );
}

/** Public oEmbed endpoint — official, cache-friendly metadata source. */
export async function fetchOembed(videoId: string) {
  const res = await fetchWithBackoff(
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
  );
  if (res.status === 404 || res.status === 401 || res.status === 403) {
    throw new ImportError("video_unavailable", "This video is unavailable, private or age-restricted.");
  }
  if (!res.ok) return { title: "", channel: "", found: false };
  const j = (await res.json()) as { title?: string; author_name?: string };
  return { title: j.title ?? "", channel: j.author_name ?? "", found: true };
}

type Track = { lang: string; name: string; kind: string };

function parseTrackList(xml: string): Track[] {
  const out: Track[] = [];
  for (const m of xml.matchAll(/<track\b([^>]*)\/?>/g)) {
    const attrs = m[1] ?? "";
    const lang = /lang_code="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const name = /name="([^"]*)"/.exec(attrs)?.[1] ?? "";
    const kind = /kind="([^"]*)"/.exec(attrs)?.[1] ?? "";
    if (lang) out.push({ lang, name: decodeHtml(name), kind });
  }
  return out;
}

function parseJson3(json: { events?: { segs?: { utf8?: string }[] }[] }) {
  return (json.events ?? [])
    .map((e) => (e.segs ?? []).map((s) => s.utf8 ?? "").join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTimedTextXml(xml: string) {
  return [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => decodeHtml((m[1] ?? "").replace(/<[^>]+>/g, "")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

type CaptionTrack = { baseUrl: string; lang: string; kind: string };

export type VideoInfo = {
  title: string;
  channel: string;
  duration_seconds: number | null;
  tracks: CaptionTrack[];
};

/**
 * YouTube's public InnerTube player endpoint (the same API the embedded player
 * uses). Returns metadata plus the list of published caption tracks.
 */
export async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  const empty: VideoInfo = { title: "", channel: "", duration_seconds: null, tracks: [] };
  let res: Response;
  try {
    res = await fetchWithBackoff("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId,
        context: {
          client: { clientName: "WEB", clientVersion: "2.20240726.00.00", hl: "en", gl: "IN" },
        },
      }),
    });
  } catch {
    return empty;
  }
  if (!res.ok) return empty;
  let j: {
    playabilityStatus?: { status?: string };
    videoDetails?: { title?: string; author?: string; lengthSeconds?: string };
    captions?: {
      playerCaptionsTracklistRenderer?: {
        captionTracks?: { baseUrl?: string; languageCode?: string; kind?: string }[];
      };
    };
  };
  try {
    j = (await res.json()) as typeof j;
  } catch {
    return empty;
  }
  const status = j.playabilityStatus?.status;
  if (status && status !== "OK" && !j.videoDetails) {
    throw new ImportError("video_unavailable", "This video is unavailable, private or age-restricted.");
  }
  const len = Number(j.videoDetails?.lengthSeconds ?? "");
  return {
    title: j.videoDetails?.title ?? "",
    channel: j.videoDetails?.author ?? "",
    duration_seconds: Number.isFinite(len) && len > 0 ? len : null,
    tracks: (j.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [])
      .filter((t) => !!t.baseUrl)
      .map((t) => ({ baseUrl: t.baseUrl!, lang: t.languageCode ?? "", kind: t.kind ?? "" })),
  };
}

function pickTrack<T extends { lang: string; kind: string }>(tracks: T[]): T | null {
  if (!tracks.length) return null;
  return (
    tracks.find((t) => t.lang.startsWith("hi") && t.kind !== "asr") ??
    tracks.find((t) => t.lang.startsWith("en") && t.kind !== "asr") ??
    tracks.find((t) => t.kind !== "asr") ??
    tracks.find((t) => t.lang.startsWith("hi")) ??
    tracks.find((t) => t.lang.startsWith("en")) ??
    tracks[0]!
  );
}

async function downloadCaption(url: string): Promise<string> {
  const jsonRes = await fetchWithBackoff(`${url}&fmt=json3`);
  if (jsonRes.ok) {
    const body = await jsonRes.text();
    if (body.trim().startsWith("{")) {
      try {
        const text = parseJson3(JSON.parse(body) as { events?: { segs?: { utf8?: string }[] }[] });
        if (text) return text;
      } catch {
        /* fall through */
      }
    } else if (body.includes("<text")) {
      const text = parseTimedTextXml(body);
      if (text) return text;
    }
  }
  const xmlRes = await fetchWithBackoff(url);
  if (!xmlRes.ok) return "";
  return parseTimedTextXml(await xmlRes.text());
}

/**
 * Removes caption artifacts: timestamps, speaker/sound tags, repeated lines and
 * runaway whitespace. Question text, numbers, formulas and Hindi/English words
 * are preserved verbatim, and sentence boundaries are kept intact.
 */
export function cleanTranscript(raw: string): string {
  const stripped = raw
    .replace(/\r/g, "\n")
    .replace(/^\s*\d+\s*$/gm, "")
    .replace(/\d{1,2}:\d{2}(:\d{2})?([.,]\d{1,3})?\s*-->\s*\d{1,2}:\d{2}(:\d{2})?([.,]\d{1,3})?.*$/gm, "")
    .replace(/^\s*\[?\(?\d{1,2}:\d{2}(:\d{2})?\)?\]?\s*/gm, "")
    .replace(/\[(music|applause|laughter|inaudible|संगीत)[^\]]*\]/gi, "")
    .replace(/&nbsp;/g, " ");

  const lines = stripped
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && prev.toLowerCase() === line.toLowerCase()) continue;
    if (prev && prev.toLowerCase().endsWith(line.toLowerCase())) continue;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

type TranscriptApiItem = {
  id?: string;
  title?: string;
  tracks?: { language?: string; transcript?: { text?: string }[] }[];
};

/**
 * Primary transcript source: youtube-transcript.io. The API token stays
 * server-side (YOUTUBE_TRANSCRIPT_API_TOKEN) and is never sent to the browser.
 */
export async function fetchTranscriptFromApi(
  videoId: string,
): Promise<{ text: string; language: string | null; title: string } | null> {
  const token = process.env["YOUTUBE_TRANSCRIPT_API_TOKEN"];
  if (!token) return null;

  const delays = [800, 2500];
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch("https://www.youtube-transcript.io/api/transcripts", {
        method: "POST",
        headers: { Authorization: `Basic ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [videoId] }),
      });
    } catch {
      if (attempt === 2) throw new ImportError("provider_failure", "Network error while contacting the transcript service.");
      await sleep(delays[attempt]!);
      continue;
    }
    if (res.status === 429 || res.status === 503) {
      if (attempt === 2) {
        throw new ImportError(
          "rate_limited",
          "YouTube transcript service is temporarily rate-limited. Please try again later.",
        );
      }
      await sleep(delays[attempt]!);
      continue;
    }
    break;
  }
  if (!res) return null;
  if (res.status === 401 || res.status === 403) {
    throw new ImportError("provider_failure", "Transcript service authentication failed. Please check the API token.");
  }
  if (res.status === 404) return null;
  if (!res.ok) return null;

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const items: TranscriptApiItem[] = Array.isArray(body)
    ? (body as TranscriptApiItem[])
    : ((body as { transcripts?: TranscriptApiItem[] })?.transcripts ?? []);
  const item = items.find((i) => !i.id || i.id === videoId) ?? items[0];
  const track = item?.tracks?.find((t) => (t.transcript?.length ?? 0) > 0) ?? item?.tracks?.[0];
  const text = cleanTranscript((track?.transcript ?? []).map((s) => (s.text ?? "").trim()).join("\n"));
  if (!text) return null;
  return { text, language: track?.language ?? null, title: item?.title ?? "" };
}

/**
 * Automatic transcript retrieval. Uses the youtube-transcript.io API first,
 * then falls back to YouTube's public caption endpoints. No watch-page
 * scraping and no video download.
 */
export async function fetchTranscript(
  videoId: string,
  info?: VideoInfo,
): Promise<{ text: string; language: string | null }> {
  const api = await fetchTranscriptFromApi(videoId);
  if (api && api.text.length >= 200) return { text: api.text, language: api.language };

  const vi = info ?? (await fetchVideoInfo(videoId));
  const track = pickTrack(vi.tracks);
  if (track) {
    const text = cleanTranscript(await downloadCaption(track.baseUrl));
    if (text) return { text, language: track.lang || null };
  }


  const listRes = await fetchWithBackoff(
    `https://video.google.com/timedtext?type=list&v=${encodeURIComponent(videoId)}`,
  );
  if (!listRes.ok) return { text: "", language: null };
  const legacy = pickTrack(parseTrackList(await listRes.text()));
  if (!legacy) return { text: "", language: null };

  const base = `https://video.google.com/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(
    legacy.lang,
  )}${legacy.name ? `&name=${encodeURIComponent(legacy.name)}` : ""}${
    legacy.kind ? `&kind=${encodeURIComponent(legacy.kind)}` : ""
  }`;
  return { text: cleanTranscript(await downloadCaption(base)), language: legacy.lang || null };
}

/** Speech-to-text fallback for admin-supplied audio of the session. */
export async function transcribeAudio(apiKey: string, file: File): Promise<string> {
  const form = new FormData();
  form.append("model", "openai/gpt-4o-mini-transcribe");
  const type = (file.type || "").split(";")[0] ?? "";
  const ext =
    ({ "audio/webm": "webm", "audio/mp4": "mp4", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-m4a": "m4a", "audio/m4a": "m4a" } as Record<string, string>)[type] ??
    (file.name.split(".").pop() || "mp3");
  form.append("file", file, `session.${ext}`);

  const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (res.status === 429) throw new ImportError("rate_limited", "Transcription rate limit reached. Please try again shortly.");
  if (res.status === 402) throw new ImportError("ai_failure", "AI credits exhausted. Please add credits to continue.");
  if (!res.ok) {
    throw new ImportError("transcript_unavailable", "Automatic transcription could not be completed for this audio.");
  }
  const j = (await res.json()) as { text?: string };
  return (j.text ?? "").trim();
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
  if (res.status === 429) throw new ImportError("rate_limited", "AI rate limit reached. Please try again shortly.");
  if (res.status === 402) throw new ImportError("ai_failure", "AI credits exhausted. Please add credits to continue.");
  if (!res.ok) throw new ImportError("ai_failure", "AI extraction failed. Please try again.");
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

/** Shared transcript -> questions step used by both the URL flow and pasted transcripts. */
export async function extractQuestions(
  apiKey: string,
  transcript: string,
  translate: "none" | "hi" | "en" | undefined,
) {
  const MAX = 90000;
  const truncated = transcript.length > MAX;
  const content = await callExtractionAI(apiKey, buildPrompt(truncated ? transcript.slice(0, MAX) : transcript, translate));
  const objText = firstJsonObject(content);
  if (!objText) throw new ImportError("ai_failure", "AI returned an unexpected response. Please try again.");
  let parsed: { questions?: ExtractedQuestion[] };
  try {
    parsed = JSON.parse(objText) as { questions?: ExtractedQuestion[] };
  } catch {
    throw new ImportError("ai_failure", "AI returned invalid JSON. Please try again.");
  }
  return { truncated, questions: (parsed.questions ?? []).map(validateExtracted) };
}
