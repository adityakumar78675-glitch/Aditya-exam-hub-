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

export function normalizeQuestion(s: string) {
  return s
    .toLowerCase()
    .replace(/\$/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function formatDuration(sec: number | null) {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
