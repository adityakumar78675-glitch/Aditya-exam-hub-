import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { RichMarkdown } from "@/components/RichMarkdown";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Bot, Send, Loader2, Plus, Trash2, Copy, RotateCcw, StopCircle, X, MessageSquare } from "lucide-react";
import { toast } from "sonner";

type Conversation = { id: string; title: string; updated_at: string };
type DBMessage = { id: string; role: string; content: string; created_at: string };

function toUIMessage(m: DBMessage): UIMessage {
  return {
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: [{ type: "text", text: m.content }],
  };
}

export function MasterJiChat({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [loadingConv, setLoadingConv] = useState(false);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    onFinish: () => {
      loadConversations();
    },
  });

  const isStreaming = status === "streaming" || status === "submitted";

  async function loadConversations() {
    if (!user) return;
    const { data } = await supabase
      .from("ai_conversations")
      .select("id,title,updated_at")
      .order("updated_at", { ascending: false })
      .limit(50);
    setConversations((data ?? []) as Conversation[]);
  }

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function openConversation(id: string) {
    setLoadingConv(true);
    setSidebarOpen(false);
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
    setInitialMessages([]);
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  }

  async function deleteConv(id: string) {
    await supabase.from("ai_conversations").delete().eq("id", id);
    if (id === activeId) newChat();
    loadConversations();
  }

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    await sendMessage({ text });
    // capture conversationId from response header via a fresh fetch of the latest conv
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

  const suggestions = [
    "Explain Newton's third law with an example",
    "Solve: derivative of x² sin(x)",
    "Make 5 MCQs on photosynthesis",
    "Create a 7-day revision plan for JEE Physics",
  ];

  return (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static inset-y-0 left-0 z-10 w-72 bg-card border-r border-border flex flex-col transition-transform`}
      >
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Button onClick={newChat} className="flex-1 justify-start" variant="outline" size="sm">
            <Plus className="size-4 mr-2" /> New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">No previous chats yet</p>
          )}
          {conversations.map((c) => (
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
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                <div className="size-14 rounded-2xl bg-primary/10 text-primary grid place-items-center mx-auto mb-4">
                  <Bot className="size-7" />
                </div>
                <h2 className="text-2xl font-bold">Namaste! I'm Master Ji 🙏</h2>
                <p className="text-muted-foreground mt-1">Ask me anything about your studies.</p>
                <div className="grid sm:grid-cols-2 gap-2 mt-6 text-left">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage({ text: s })}
                      className="border border-border rounded-xl p-3 text-sm hover:bg-muted transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, idx) => {
                const text = m.parts?.map((p) => (p.type === "text" ? p.text : "")).join("") ?? "";
                const isUser = m.role === "user";
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
                        <div className="inline-block max-w-full bg-primary text-primary-foreground rounded-2xl px-4 py-2 whitespace-pre-wrap break-words">
                          {text}
                        </div>
                      ) : (
                        <div>
                          <RichMarkdown>{text || " "}</RichMarkdown>

                          {!isStreaming || idx !== messages.length - 1 ? (
                            <div className="flex gap-1 mt-2">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(text);
                                  toast.success("Copied");
                                }}
                                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              >
                                <Copy className="size-3" /> Copy
                              </button>
                              {idx === messages.length - 1 && (
                                <button
                                  onClick={() => regenerate()}
                                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 ml-2"
                                >
                                  <RotateCcw className="size-3" /> Regenerate
                                </button>
                              )}
                            </div>
                          ) : null}
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

        <form onSubmit={onSubmit} className="border-t border-border p-3 bg-card/60">
          <div className="max-w-3xl mx-auto flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e as unknown as React.FormEvent);
                }
              }}
              rows={1}
              placeholder="Ask Master Ji anything..."
              className="flex-1 resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary max-h-40"
              disabled={isStreaming}
            />
            {isStreaming ? (
              <Button type="button" onClick={() => stop()} size="icon" variant="destructive">
                <StopCircle className="size-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!input.trim()}>
                <Send className="size-4" />
              </Button>
            )}
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
