import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Mic, MicOff, X, Sparkles, Send, Pause, Play, Square, Volume2, Loader2,
} from "lucide-react";
import { toast } from "sonner";

// --- Web Speech typings (browser-only, prefixed on some vendors) ------------
type SRResultEvent = {
  resultIndex: number;
  results: ArrayLike<{
    0: { transcript: string };
    isFinal: boolean;
    length: number;
  }>;
};
type SRErrorEvent = { error: string; message?: string };
type SRInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SRResultEvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SRCtor = new () => SRInstance;

function getSpeechRecognitionCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// --- Animated orb ---------------------------------------------------------
function Orb({ state }: { state: "idle" | "listening" | "speaking" | "thinking" }) {
  const ring =
    state === "speaking" ? "animate-[pulse_0.9s_ease-in-out_infinite]"
    : state === "listening" ? "animate-[pulse_1.4s_ease-in-out_infinite]"
    : state === "thinking" ? "animate-[spin_3s_linear_infinite]"
    : "animate-[pulse_3s_ease-in-out_infinite]";

  const glow =
    state === "speaking" ? "shadow-[0_0_80px_20px_hsl(var(--primary)/0.55)]"
    : state === "listening" ? "shadow-[0_0_60px_15px_hsl(var(--primary)/0.4)]"
    : "shadow-[0_0_40px_10px_hsl(var(--primary)/0.25)]";

  return (
    <div className="relative grid place-items-center">
      <div className={`absolute size-48 rounded-full border border-primary/20 ${ring}`} />
      <div className={`absolute size-36 rounded-full border border-primary/30 ${state === "listening" ? "animate-[ping_1.8s_ease-out_infinite]" : ""}`} />
      <div className={`relative size-28 rounded-full bg-gradient-to-br from-primary via-primary/70 to-accent grid place-items-center transition-shadow duration-500 ${glow} ${state === "speaking" || state === "idle" ? "animate-[mj-breathe_3.5s_ease-in-out_infinite]" : ""}`}>
        <div className="absolute inset-3 rounded-full bg-background/20 backdrop-blur-sm" />
        <Sparkles className="relative size-8 text-primary-foreground drop-shadow" />
        {(state === "speaking" || state === "listening") && (
          <div className="absolute -bottom-7 flex items-end gap-1 h-7">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="w-1.5 rounded-full bg-primary"
                style={{
                  height: `${20 + ((i * 13) % 30)}%`,
                  animation: `mj-bar 0.9s ease-in-out ${i * 0.08}s infinite alternate`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      <style>{`
        @keyframes mj-bar { from { height: 15%; } to { height: 95%; } }
        @keyframes mj-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      `}</style>
    </div>
  );
}

// --- Extract plain text from a UIMessage ---------------------------------
function messageText(m: UIMessage): string {
  return (m.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

// Strip markdown/LaTeX symbols so TTS reads it naturally
function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/[#*_>~|]/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Dialog ---------------------------------------------------------------
function MasterJiLiveDialog({ onClose }: { onClose: () => void }) {
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [lang, setLang] = useState<"en-IN" | "hi-IN">("en-IN");
  const [sttSupported] = useState(() => !!getSpeechRecognitionCtor());
  const [ttsSupported] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);

  const recRef = useRef<SRInstance | null>(null);
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (url, init) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          const headers = new Headers(init?.headers);
          if (token) headers.set("Authorization", `Bearer ${token}`);
          headers.set("Content-Type", "application/json");
          return fetch(url, { ...init, headers });
        },
        prepareSendMessagesRequest: ({ messages, id }) => ({
          body: { messages, conversationId: null, id },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop } = useChat({
    id: "master-ji-live",
    transport,
    onError: (e) => toast.error(e.message || "Master Ji is unavailable"),
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // Auto-scroll transcript
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interim]);

  // Speak newly completed assistant messages
  useEffect(() => {
    if (!ttsSupported || isStreaming) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (spokenIdsRef.current.has(last.id)) return;
    const text = toSpeakable(messageText(last));
    if (!text) return;
    spokenIdsRef.current.add(last.id);
    speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isStreaming, ttsSupported]);

  const speak = useCallback((text: string) => {
    if (!ttsSupported) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = rate;
      utter.pitch = 1;
      utter.lang = /[\u0900-\u097F]/.test(text) ? "hi-IN" : lang;
      utter.onstart = () => { setSpeaking(true); setPaused(false); };
      utter.onend = () => { setSpeaking(false); setPaused(false); };
      utter.onerror = () => { setSpeaking(false); setPaused(false); };
      window.speechSynthesis.speak(utter);
    } catch { /* noop */ }
  }, [rate, lang, ttsSupported]);

  const stopSpeaking = useCallback(() => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false); setPaused(false);
  }, [ttsSupported]);

  const pauseSpeaking = useCallback(() => {
    if (!ttsSupported) return;
    if (paused) { window.speechSynthesis.resume(); setPaused(false); }
    else { window.speechSynthesis.pause(); setPaused(true); }
  }, [paused, ttsSupported]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    stopSpeaking();
    setInput("");
    setInterim("");
    void sendMessage({ text: trimmed });
  }, [isStreaming, sendMessage, stopSpeaking]);

  const startListening = useCallback(async () => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      toast.error("Voice recognition not available. Please type your question.");
      return;
    }
    try {
      // Ensure mic permission before starting SR (some browsers require this)
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Microphone access is required for voice chat.");
      return;
    }
    stopSpeaking();
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let interimStr = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimStr += r[0].transcript;
      }
      setInterim(finalText + interimStr);
    };
    rec.onerror = (ev) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        toast.error("Microphone access is required for voice chat.");
      } else if (ev.error !== "aborted" && ev.error !== "no-speech") {
        toast.error(`Voice error: ${ev.error}`);
      }
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      const said = (finalText || "").trim();
      setInterim("");
      if (said) send(said);
    };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }, [lang, send, stopSpeaking]);

  const stopListening = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      try { recRef.current?.abort(); } catch { /* noop */ }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const orbState: "idle" | "listening" | "speaking" | "thinking" =
    isStreaming ? "thinking" : speaking ? "speaking" : listening ? "listening" : "idle";

  return (
    <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-xl grid place-items-center p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl p-5 animate-in zoom-in-95 duration-300 max-h-[92vh] flex flex-col">
        <button
          onClick={() => { stopSpeaking(); stopListening(); onClose(); }}
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>

        <div className="text-center mb-1">
          <h2 className="text-xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Master Ji Live
          </h2>
          <p className="text-[11px] text-muted-foreground">Aapka Personal AI Teacher</p>
        </div>

        <div className="py-4 grid place-items-center">
          <Orb state={orbState} />
        </div>

        <p className="text-center text-xs text-muted-foreground min-h-4">
          {orbState === "thinking" && (<span className="inline-flex items-center gap-2"><Loader2 className="size-3 animate-spin" /> Master Ji is thinking…</span>)}
          {orbState === "listening" && "Listening… speak now"}
          {orbState === "speaking" && "Master Ji is speaking…"}
          {orbState === "idle" && (sttSupported ? "Tap the mic or type a question" : "Type a question below")}
        </p>

        {/* Transcript */}
        <div
          ref={scrollRef}
          className="mt-3 flex-1 min-h-[100px] max-h-56 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3 text-sm space-y-2"
        >
          {messages.length === 0 && !interim && (
            <p className="text-xs text-muted-foreground text-center">Namaste! Ask me anything — Physics, Maths, Chemistry, Biology…</p>
          )}
          {messages.map((m) => {
            const text = messageText(m);
            if (!text) return null;
            return (
              <p key={m.id} className={m.role === "user" ? "text-foreground" : "text-primary"}>
                <span className="font-semibold">{m.role === "user" ? "You" : "Master Ji"}:</span>{" "}
                <span className="whitespace-pre-wrap">{text}</span>
              </p>
            );
          })}
          {interim && (
            <p className="text-muted-foreground italic">
              <span className="font-semibold">You:</span> {interim}
            </p>
          )}
        </div>

        {/* TTS controls */}
        {ttsSupported && (speaking || paused) && (
          <div className="mt-2 flex items-center gap-2 justify-center text-xs">
            <button onClick={pauseSpeaking} className="p-1.5 rounded-full hover:bg-muted" aria-label={paused ? "Resume" : "Pause"}>
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            </button>
            <button onClick={stopSpeaking} className="p-1.5 rounded-full hover:bg-muted" aria-label="Stop speaking">
              <Square className="size-4" />
            </button>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Volume2 className="size-3" />
              <input
                type="range" min={0.6} max={1.6} step={0.1} value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-20 accent-primary"
                aria-label="Speech speed"
              />
              <span className="w-8 tabular-nums">{rate.toFixed(1)}x</span>
            </div>
          </div>
        )}

        {/* Input row */}
        <div className="mt-3 flex items-center gap-2">
          {sttSupported && (
            <Button
              type="button"
              variant={listening ? "destructive" : "default"}
              size="icon"
              className={`rounded-full h-11 w-11 shrink-0 ${listening ? "animate-pulse" : ""}`}
              onClick={listening ? stopListening : startListening}
              aria-label={listening ? "Stop listening" : "Start listening"}
              disabled={isStreaming}
            >
              {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
            </Button>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
            placeholder={listening ? "Listening…" : "Type your question…"}
            className="flex-1 h-11 rounded-full border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            disabled={listening || isStreaming}
          />
          {isStreaming ? (
            <Button size="icon" variant="outline" className="rounded-full h-11 w-11 shrink-0" onClick={() => stop()} aria-label="Stop">
              <Square className="size-5" />
            </Button>
          ) : (
            <Button size="icon" className="rounded-full h-11 w-11 shrink-0" onClick={() => send(input)} disabled={!input.trim()} aria-label="Send">
              <Send className="size-5" />
            </Button>
          )}
        </div>

        {/* Language toggle */}
        {sttSupported && (
          <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
            <span>Voice language:</span>
            {(["en-IN", "hi-IN"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-2 py-0.5 rounded-full ${lang === l ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted"}`}
              >
                {l === "en-IN" ? "English" : "हिन्दी"}
              </button>
            ))}
          </div>
        )}

        {!sttSupported && (
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Voice input not supported in this browser — text chat is fully available.
          </p>
        )}
      </div>
    </div>
  );
}

export function MasterJiLiveButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-24 right-5 z-50 group"
          aria-label="Open Master Ji Live voice tutor"
        >
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
          <span className="relative flex items-center gap-2 rounded-full bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-xl hover:shadow-2xl px-4 py-3 font-semibold transition group-hover:scale-105">
            <Mic className="size-5" />
            <span className="hidden sm:inline">Master Ji Live</span>
          </span>
        </button>
      )}
      {open && <MasterJiLiveDialog onClose={() => setOpen(false)} />}
    </>
  );
}
