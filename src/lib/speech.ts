// Browser SpeechRecognition (STT) helper — free, no external API.
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SR) | null;
}

export function sttAvailable() {
  return !!getCtor();
}

export type SttHandle = { stop: () => void };

export function startListening(opts: {
  lang?: string;
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (msg: string) => void;
  onEnd?: () => void;
}): SttHandle | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  // hi-IN handles Hindi + Hinglish + most English well on Android/Chrome
  rec.lang = opts.lang ?? "hi-IN";
  rec.continuous = false;
  rec.interimResults = true;

  let finalText = "";
  rec.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    opts.onPartial?.((finalText + " " + interim).trim());
  };
  rec.onerror = (e: any) => {
    const code = e?.error as string;
    if (code === "no-speech") opts.onError?.("Kuch sunai nahi diya — dobara try karein.");
    else if (code === "not-allowed" || code === "service-not-allowed")
      opts.onError?.("Microphone permission denied.");
    else if (code !== "aborted") opts.onError?.("Voice input failed.");
  };
  rec.onend = () => {
    if (finalText.trim()) opts.onFinal(finalText.trim());
    opts.onEnd?.();
  };

  try {
    rec.start();
  } catch {
    return null;
  }
  return { stop: () => rec.stop() };
}
