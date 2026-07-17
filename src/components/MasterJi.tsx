import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { RichMarkdown } from "@/components/RichMarkdown";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Send,
  Loader2,
  Plus,
  Trash2,
  Copy,
  RotateCcw,
  StopCircle,
  X,
  MessageSquare,
  ImageIcon,
  Camera,
  Volume2,
  Pause,
  Play,
  Square,
  Pencil,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { speak, ttsAvailable, ttsPause, ttsResume, ttsStop } from "@/lib/tts";

type Conversation = { id: string; title: string; updated_at: string };
type DBMessage = { id: string; role: string; content: string; created_at: string };
type Attachment = { url: string; mediaType: string; name: string };

function toUIMessage(m: DBMessage): UIMessage {
  // Extract embedded markdown images so they render as file parts (or stay inline in markdown)
  return {
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: [{ type: "text", text: m.content }],
  };
}

const QUICK_ACTIONS: { label: string; prompt: string; emoji: string }[] = [
  { label: "Short Notes", emoji: "📝", prompt: "Generate short revision notes on: " },
  { label: "Detailed Notes", emoji: "📚", prompt: "Generate detailed study notes on: " },
  { label: "Formula Sheet", emoji: "🧮", prompt: "Generate a complete formula sheet with definitions for: " },
  { label: "20 MCQs", emoji: "❓", prompt: "Generate 20 medium-difficulty MCQs with answer key and explanations on: " },
  { label: "Chapter Summary", emoji: "📖", prompt: "Give me a quick revision chapter summary — key concepts, formulas, common mistakes and last-minute revision points for: " },
  { label: "Solve Numerical", emoji: "🧠", prompt: "Solve step-by-step this numerical: " },
];

export function MasterJiChat({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speakPaused, setSpeakPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = activeId;

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
          body: { messages, conversationId: conversationIdRef.current, id },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, regenerate, setMessages } = useChat({
    id: activeId ?? "new",
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message || "Master Ji is unavailable"),
    onFinish: () => loadConversations(),
  });

  const isStreaming = status === "streaming" || status === "submitted";

  async function loadConversations() {
    if (!user) return;
    const { data } = await supabase
      .from("ai_conversations")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    setConversations((data ?? []) as Conversation[]);
  }

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Stop speech when closing
  useEffect(() => () => ttsStop(), []);

  async function openConversation(id: string) {
    setLoadingConv(true);
    setSidebarOpen(false);
    ttsStop();
    setSpeakingId(null);
    const { data } = await supabase
      .from("ai_messages")
      .select("id,role,content,created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    const ui = ((data ?? []) as DBMessage[]).map(toUIMessage);
    setInitialMessages(ui);
    setActiveId(id);
    setMessages(ui);
    setLoadingConv(false);
  }

  function newChat() {
    ttsStop();
    setSpeakingId(null);
    setInitialMessages([]);
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
    setAttachments([]);
  }

  async function deleteConv(id: string) {
    await supabase.from("ai_conversations").delete().eq("id", id);
    if (id === activeId) newChat();
    loadConversations();
  }

  async function renameConv(id: string, currentTitle: string) {
    const title = window.prompt("Rename chat", currentTitle);
    if (!title || title.trim() === currentTitle) return;
    await supabase.from("ai_conversations").update({ title: title.trim() }).eq("id", id);
    loadConversations();
  }

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  async function uploadFiles(files: FileList | File[]) {
    if (!user) return;
    const list = Array.from(files).filter((f) => /image\/(jpeg|jpg|png|webp)/i.test(f.type));
    if (list.length === 0) {
      toast.error("Only JPG, PNG or WEBP images are supported");
      return;
    }
    setUploading(true);
    try {
      const uploaded: Attachment[] = [];
      for (const file of list) {
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 8MB`);
          continue;
        }
        const ext = file.name.split(".").pop() || "png";
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from("masterji-uploads").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) {
          toast.error(error.message);
          continue;
        }
        const { data: signed } = await supabase.storage
          .from("masterji-uploads")
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (signed?.signedUrl) {
          uploaded.push({ url: signed.signedUrl, mediaType: file.type, name: file.name });
        }
      }
      setAttachments((a) => [...a, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || isStreaming) return;
    setInput("");
    const files = attachments.map((a) => ({
      type: "file" as const,
      mediaType: a.mediaType,
      url: a.url,
    }));
    setAttachments([]);
    await sendMessage({
      text: text || "Please read the image(s) and solve/explain step by step.",
      files: files.length ? files : undefined,
    });
    setTimeout(() => {
      if (!conversationIdRef.current) {
        supabase
          .from("ai_conversations")
          .select("id")
          .order("updated_at", { ascending: false })
          .limit(1)
          .then(({ data }) => {
            if (data?.[0]?.id) setActiveId(data[0].id);
          });
      }
    }, 500);
  }

  function toggleSpeak(id: string, text: string) {
    if (!ttsAvailable()) return;
    if (speakingId === id) {
      if (speakPaused) {
        ttsResume();
        setSpeakPaused(false);
      } else {
        ttsPause();
        setSpeakPaused(true);
      }
      return;
    }
    ttsStop();
    setSpeakingId(id);
    setSpeakPaused(false);
    speak(text, {
      rate,
      onEnd: () => {
        setSpeakingId(null);
        setSpeakPaused(false);
      },
    });
  }
  function stopSpeak() {
    ttsStop();
    setSpeakingId(null);
    setSpeakPaused(false);
  }

  const filteredConvs = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase()),
  );

  const showEmpty = messages.length === 0;

  return (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static inset-y-0 left-0 z-10 w-72 bg-card border-r border-border flex flex-col transition-transform`}
      >
        <div className="p-3 border-b border-border space-y-2">
          <Button onClick={newChat} className="w-full justify-start" variant="outline" size="sm">
            <Plus className="size-4 mr-2" /> New chat
          </Button>
          <div className="relative">
            <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats..."
              className="w-full text-xs pl-7 pr-2 py-1.5 rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConvs.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">No chats found</p>
          )}
          {filteredConvs.map((c) => (
            <div
              key={c.id}
              className={`group flex items-center gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer hover:bg-muted ${
                c.id === activeId ? "bg-muted" : ""
              }`}
              onClick={() => openConversation(c.id)}
            >
              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{c.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  renameConv(c.id, c.title);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                aria-label="Rename chat"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConv(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                aria-label="Delete chat"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 border-b border-border flex items-center gap-2 px-3 bg-card/60">
          <button
            className="md:hidden p-2 rounded-lg hover:bg-muted"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle chats"
          >
            <MessageSquare className="size-5" />
          </button>
          <div className="size-8 rounded-full bg-primary text-primary-foreground grid place-items-center">
            <Bot className="size-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold leading-tight">Master Ji</p>
            <p className="text-[11px] text-muted-foreground leading-tight">Aapka Personal AI Teacher</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-5" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {loadingConv ? (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : showEmpty ? (
              <div className="text-center py-8">
                <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto mb-4">
                  <Bot className="size-7" />
                </div>
                <h2 className="text-2xl font-bold">Namaste! I'm Master Ji 🙏</h2>
                <p className="text-muted-foreground mt-1">
                  Ask, upload a photo of a question, or pick a quick action.
                </p>
                <div className="grid sm:grid-cols-3 gap-2 mt-6 text-left">
                  {QUICK_ACTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setInput(s.prompt)}
                      className="border border-border rounded-xl p-3 text-sm hover:bg-muted transition"
                    >
                      <span className="mr-1">{s.emoji}</span>
                      <span className="font-medium">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, idx) => {
                const text = m.parts?.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
                const isUser = m.role === "user";
                const isLast = idx === messages.length - 1;
                const showCursor = isStreaming && isLast && !isUser;
                return (
                  <div key={m.id} className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
                    <div
                      className={`size-8 rounded-full grid place-items-center shrink-0 ${
                        isUser ? "bg-muted" : "bg-primary text-primary-foreground"
                      }`}
                    >
                      {isUser ? (
                        <span className="text-xs font-bold">
                          {(user?.email?.[0] ?? "U").toUpperCase()}
                        </span>
                      ) : (
                        <Bot className="size-4" />
                      )}
                    </div>
                    <div className={`flex-1 min-w-0 ${isUser ? "flex justify-end" : ""}`}>
                      {isUser ? (
                        <div className="inline-block max-w-full bg-primary text-primary-foreground rounded-2xl px-4 py-2 space-y-2">
                          {m.parts?.map((p, i) => {
                            if (p.type === "file" && p.mediaType?.startsWith("image/")) {
                              return (
                                <img
                                  key={i}
                                  src={p.url}
                                  alt="upload"
                                  className="max-h-64 rounded-lg"
                                />
                              );
                            }
                            return null;
                          })}
                          {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
                        </div>
                      ) : (
                        <div>
                          <RichMarkdown>{(text || " ") + (showCursor ? " ▍" : "")}</RichMarkdown>

                          {!showCursor && (
                            <div className="flex flex-wrap items-center gap-3 mt-2">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(text);
                                  toast.success("Copied");
                                }}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              >
                                <Copy className="size-3" /> Copy
                              </button>
                              {isLast && (
                                <button
                                  onClick={() => regenerate()}
                                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                >
                                  <RotateCcw className="size-3" /> Regenerate
                                </button>
                              )}
                              {ttsAvailable() && (
                                <>
                                  <button
                                    onClick={() => toggleSpeak(m.id, text)}
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                  >
                                    {speakingId === m.id && !speakPaused ? (
                                      <>
                                        <Pause className="size-3" /> Pause
                                      </>
                                    ) : speakingId === m.id && speakPaused ? (
                                      <>
                                        <Play className="size-3" /> Resume
                                      </>
                                    ) : (
                                      <>
                                        <Volume2 className="size-3" /> Listen
                                      </>
                                    )}
                                  </button>
                                  {speakingId === m.id && (
                                    <button
                                      onClick={stopSpeak}
                                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                                    >
                                      <Square className="size-3" /> Stop
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            {isStreaming && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3">
                <div className="size-8 rounded-full bg-primary text-primary-foreground grid place-items-center">
                  <Bot className="size-4" />
                </div>
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" /> Master Ji is thinking...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {ttsAvailable() && speakingId && (
          <div className="border-t border-border px-3 py-1.5 bg-card/60 flex items-center gap-2 text-xs text-muted-foreground">
            <Volume2 className="size-3.5" />
            <span>Speaking</span>
            <label className="ml-auto flex items-center gap-1">
              Speed
              <input
                type="range"
                min={0.6}
                max={1.6}
                step={0.1}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="w-24"
              />
              <span className="tabular-nums w-8">{rate.toFixed(1)}x</span>
            </label>
          </div>
        )}

        <form onSubmit={onSubmit} className="border-t border-border p-3 bg-card/60">
          <div className="max-w-3xl mx-auto space-y-2">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  <div key={i} className="relative">
                    <img src={a.url} alt={a.name} className="size-16 object-cover rounded-lg border border-border" />
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full size-5 grid place-items-center"
                      aria-label="Remove"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-end">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={uploading || isStreaming}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach image"
              >
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                disabled={uploading || isStreaming}
                onClick={() => cameraInputRef.current?.click()}
                aria-label="Open camera"
              >
                <Camera className="size-4" />
              </Button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                rows={1}
                placeholder="Ask Master Ji anything or attach a photo..."
                className="flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary max-h-40"
                disabled={isStreaming}
              />
              {isStreaming ? (
                <Button type="button" onClick={() => stop()} size="icon" variant="destructive">
                  <StopCircle className="size-4" />
                </Button>
              ) : (
                <Button type="submit" size="icon" disabled={!input.trim() && attachments.length === 0}>
                  <Send className="size-4" />
                </Button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Master Ji can make mistakes. Verify important information.
          </p>
        </form>
      </div>
    </div>
  );
}

export function MasterJiFloatingButton() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl px-4 py-3 font-semibold transition hover:scale-105"
          aria-label="Open Master Ji AI Tutor"
        >
          <Bot className="size-5" />
          <span className="hidden sm:inline">Master Ji</span>
        </button>
      )}
      {open && <MasterJiChat onClose={() => setOpen(false)} />}
    </>
  );
}
