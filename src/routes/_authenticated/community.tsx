import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/community")({ component: CommunityPage });

type Msg = { id: string; student_id: string; student_name: string; message: string; created_at: string };

function CommunityPage() {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name, blocked, community_blocked").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: messages = [] } = useQuery<Msg[]>({
    queryKey: ["community-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_messages")
        .select("id, student_id, student_name, message, created_at")
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("community-room")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_messages" }, () => {
        qc.invalidateQueries({ queryKey: ["community-messages"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const blocked = profile?.blocked || profile?.community_blocked;

  async function send() {
    const msg = text.trim();
    if (!msg || !user) return;
    if (blocked) { toast.error("You are blocked from community chat."); return; }
    setSending(true);
    const { error } = await supabase.from("community_messages").insert({
      student_id: user.id,
      student_name: profile?.full_name || (user.email?.split("@")[0] ?? "Student"),
      message: msg.slice(0, 2000),
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setText("");
  }

  async function del(id: string) {
    if (!confirm("Delete this message?")) return;
    const { error } = await supabase.from("community_messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-4 md:px-8 flex items-center gap-3">
        <Users className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">Community Chat</h1>
        <span className="ml-auto text-xs text-muted-foreground">{messages.length} messages</span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 max-w-3xl mx-auto w-full">
        {messages.length === 0 && <p className="text-center text-sm text-muted-foreground mt-10">Be the first to say hello 👋</p>}
        {messages.map((m) => {
          const mine = m.student_id === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${mine ? "bg-primary text-primary-foreground" : "bg-card border border-border"}`}>
                {!mine && <p className="text-xs font-bold mb-0.5 text-primary">{m.student_name}</p>}
                <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {isAdmin && (
                    <button onClick={() => del(m.id)} className={`text-[10px] inline-flex items-center gap-0.5 ${mine ? "text-primary-foreground/80" : "text-destructive"} hover:underline`}>
                      <Trash2 className="size-3" /> delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border bg-card p-3 md:p-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          {blocked ? (
            <p className="text-sm text-destructive flex-1 text-center py-2">You are blocked from community chat.</p>
          ) : (
            <>
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a message..."
                maxLength={2000}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <Button onClick={send} disabled={sending || !text.trim()}><Send className="size-4" /></Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
