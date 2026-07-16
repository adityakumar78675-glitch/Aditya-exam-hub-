import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { getMasterJiVoiceToken } from "@/lib/elevenlabs.functions";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, X, PhoneOff, Radio, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

type VoiceStatus = "disconnected" | "connecting" | "connected";

function Orb({ state }: { state: "idle" | "listening" | "speaking" | "thinking" }) {
  // Animated Jarvis-style orb, purely CSS/SVG. Reacts to state.
  const ring =
    state === "speaking"
      ? "animate-[pulse_0.9s_ease-in-out_infinite]"
      : state === "listening"
      ? "animate-[pulse_1.4s_ease-in-out_infinite]"
      : state === "thinking"
      ? "animate-[spin_3s_linear_infinite]"
      : "animate-[pulse_3s_ease-in-out_infinite]";

  const glow =
    state === "speaking"
      ? "shadow-[0_0_80px_20px_hsl(var(--primary)/0.55)]"
      : state === "listening"
      ? "shadow-[0_0_60px_15px_hsl(var(--primary)/0.4)]"
      : "shadow-[0_0_40px_10px_hsl(var(--primary)/0.25)]";

  return (
    <div className="relative grid place-items-center">
      {/* outer rings */}
      <div className={`absolute size-64 rounded-full border border-primary/20 ${ring}`} />
      <div
        className={`absolute size-48 rounded-full border border-primary/30 ${
          state === "listening" ? "animate-[ping_1.8s_ease-out_infinite]" : ""
        }`}
      />
      {/* core */}
      <div
        className={`relative size-36 rounded-full bg-gradient-to-br from-primary via-primary/70 to-accent grid place-items-center transition-shadow duration-500 ${glow}`}
      >
        <div className="absolute inset-3 rounded-full bg-background/20 backdrop-blur-sm" />
        <Sparkles className="relative size-10 text-primary-foreground drop-shadow" />
        {/* animated waveform bars when speaking/listening */}
        {(state === "speaking" || state === "listening") && (
          <div className="absolute -bottom-8 flex items-end gap-1 h-8">
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
      <style>{`@keyframes mj-bar { from { height: 15%; } to { height: 95%; } }`}</style>
    </div>
  );
}

function MasterJiLiveDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<{ role: "user" | "agent"; text: string }[]>([]);
  const startedRef = useRef(false);
  const navigate = useNavigate();
  const fetchToken = useServerFn(getMasterJiVoiceToken);

  const conversation = useConversation({
    onConnect: () => setStatus("connected"),
    onDisconnect: () => setStatus("disconnected"),
    onError: (err: unknown) => {
      console.error("[MasterJiLive]", err);
      toast.error(typeof err === "string" ? err : "Voice connection lost");
      setStatus("disconnected");
    },
    onMessage: (msg: { source?: string; message?: string }) => {
      // ElevenLabs surfaces messages as { source: 'user' | 'ai', message: string }
      const role = msg.source === "user" ? "user" : "agent";
      if (msg.message) setTranscript((t) => [...t, { role, text: msg.message! }]);
    },
    clientTools: {
      navigate_to: (params: { page: string }) => {
        const map: Record<string, string> = {
          dashboard: "/dashboard",
          batches: "/batches",
          "my batch": "/batches",
          live: "/live",
          "live class": "/live",
          tests: "/tests",
          community: "/community",
          notes: "/notes",
          "extra notes": "/notes",
          profile: "/profile",
        };
        const key = params.page?.toLowerCase().trim() ?? "";
        const to = map[key];
        if (to) {
          navigate({ to });
          return `Opened ${params.page}`;
        }
        return `I couldn't find ${params.page}`;
      },
    },
  });

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStatus("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { token } = await fetchToken({ data: {} });
      await conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
      });
    } catch (err) {
      startedRef.current = false;
      setStatus("disconnected");
      const msg = err instanceof Error ? err.message : "Could not start Master Ji Live";
      toast.error(msg);
    }
  }, [conversation, fetchToken]);

  const end = useCallback(async () => {
    await conversation.endSession().catch(() => {});
    startedRef.current = false;
    setStatus("disconnected");
  }, [conversation]);

  useEffect(() => {
    return () => {
      conversation.endSession().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const orbState = useMemo<"idle" | "listening" | "speaking" | "thinking">(() => {
    if (status !== "connected") return "idle";
    if (conversation.isSpeaking) return "speaking";
    return "listening";
  }, [status, conversation.isSpeaking]);

  return (
    <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-xl grid place-items-center p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-md rounded-3xl border border-border bg-card shadow-2xl p-6 animate-in zoom-in-95 duration-300">
        <button
          onClick={() => {
            void end();
            onClose();
          }}
          className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>

        <div className="text-center mb-2">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Master Ji Live
          </h2>
          <p className="text-xs text-muted-foreground">Aapka Personal AI Teacher</p>
        </div>

        <div className="py-10 grid place-items-center">
          <Orb state={orbState} />
        </div>

        <p className="text-center text-sm text-muted-foreground min-h-5">
          {status === "disconnected" && "Tap the mic to start talking"}
          {status === "connecting" && (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-3 animate-spin" /> Connecting...
            </span>
          )}
          {status === "connected" && orbState === "listening" && (
            <span className="inline-flex items-center gap-2 text-primary">
              <Radio className="size-3 animate-pulse" /> Listening
            </span>
          )}
          {status === "connected" && orbState === "speaking" && (
            <span className="text-primary">Master Ji is speaking…</span>
          )}
        </p>

        {transcript.length > 0 && (
          <div className="mt-4 max-h-32 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2 text-xs space-y-1">
            {transcript.slice(-6).map((m, i) => (
              <p key={i} className={m.role === "user" ? "text-foreground" : "text-primary"}>
                <span className="font-semibold">{m.role === "user" ? "You" : "Master Ji"}:</span>{" "}
                {m.text}
              </p>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-center gap-3">
          {status === "disconnected" ? (
            <Button size="lg" onClick={start} className="rounded-full h-14 w-14 p-0">
              <Mic className="size-6" />
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="lg"
                className="rounded-full h-12 w-12 p-0"
                onClick={async () => {
                  const next = !muted;
                  setMuted(next);
                  await conversation.setVolume({ volume: next ? 0 : 1 }).catch(() => {});
                }}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
              </Button>
              <Button
                variant="destructive"
                size="lg"
                className="rounded-full h-14 w-14 p-0"
                onClick={() => {
                  void end();
                  onClose();
                }}
                aria-label="End call"
              >
                <PhoneOff className="size-6" />
              </Button>
            </>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground text-center mt-4">
          Microphone is only active while this window is open.
        </p>
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
