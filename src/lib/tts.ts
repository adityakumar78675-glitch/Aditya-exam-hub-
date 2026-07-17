// Browser Web Speech API helper. No paid APIs.
export function ttsAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Strip markdown/latex/code for cleaner speech
export function textForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (code snippet) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, " $1 ")
    .replace(/\$([^$]+)\$/g, " $1 ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`|]/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice(text: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const hasDevanagari = /[\u0900-\u097F]/.test(text);
  const preferLang = hasDevanagari ? "hi" : "en";
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith(preferLang + "-in")) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(preferLang)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith("en"))
  );
}

export function speak(text: string, opts: { rate?: number; onEnd?: () => void; onStart?: () => void }) {
  if (!ttsAvailable()) return;
  window.speechSynthesis.cancel();
  const clean = textForSpeech(text);
  if (!clean) return;
  const u = new SpeechSynthesisUtterance(clean);
  u.rate = opts.rate ?? 1;
  u.pitch = 1;
  const v = pickVoice(clean);
  if (v) u.voice = v;
  u.onstart = () => opts.onStart?.();
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  window.speechSynthesis.speak(u);
}
export const ttsPause = () => window.speechSynthesis?.pause();
export const ttsResume = () => window.speechSynthesis?.resume();
export const ttsStop = () => window.speechSynthesis?.cancel();
