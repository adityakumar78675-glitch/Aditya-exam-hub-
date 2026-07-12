import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Send, Paperclip, Search, Pin, Reply, Pencil, Trash2, Copy, X, Users, Hash, FileText, Image as ImageIcon,
  LogIn, Ban, Shield, ChevronLeft
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/community")({ component: CommunityPage });

const BUCKET = "community-attachments";
const MAX_SIZE = 50 * 1024 * 1024;
const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

type Community = { id: string; name: string; description: string | null; icon: string | null; batch_id: string | null; rules: string | null; is_active: boolean };
type Message = {
  id: string; community_id: string; student_id: string; student_name: string; message: string;
  attachment_url: string | null; attachment_type: string | null; attachment_name: string | null;
  reply_to_id: string | null; pinned: boolean; edited_at: string | null; deleted_at: string | null;
  created_at: string;
};
type Member = { id: string; community_id: string; student_id: string; role: string; status: string };

function CommunityPage() {
  const { user, role } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  const { data: communities = [] } = useQuery({
    queryKey: ["communities"],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("communities").select("*").eq("is_active", true).order("created_at");
      if (error) throw error;
      return data as Community[];
    },
  });

  const { data: myMemberships = [] } = useQuery({
    queryKey: ["my-memberships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("community_members").select("*").eq("student_id", user!.id);
      if (error) throw error;
      return data as Member[];
    },
  });

  // Realtime for communities & memberships
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel("comm-meta")
      .on("postgres_changes", { event: "*", schema: "public", table: "communities" }, () => qc.invalidateQueries({ queryKey: ["communities"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "community_members" }, () => {
        qc.invalidateQueries({ queryKey: ["my-memberships"] });
        qc.invalidateQueries({ queryKey: ["members"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  useEffect(() => { if (!selected && communities.length) setSelected(communities[0].id); }, [communities, selected]);

  const current = communities.find((c) => c.id === selected) || null;

  return (
    <div className="flex h-[calc(100vh-3rem)] bg-background">
      {/* Sidebar */}
      <aside className={cn(
        "border-r border-border bg-card/50 flex-shrink-0 transition-all overflow-hidden",
        showSidebar ? "w-72" : "w-0 md:w-72"
      )}>
        <div className="p-4 border-b border-border">
          <h2 className="font-bold text-lg flex items-center gap-2"><Users className="size-5" /> Communities</h2>
        </div>
        <div className="p-2 space-y-1 overflow-y-auto h-[calc(100%-4rem)]">
          {communities.map((c) => {
            const membership = myMemberships.find((m) => m.community_id === c.id);
            const isActive = selected === c.id;
            return (
              <button
                key={c.id}
                onClick={() => { setSelected(c.id); if (window.innerWidth < 768) setShowSidebar(false); }}
                className={cn(
                  "w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors",
                  isActive ? "bg-primary/15 border border-primary/30" : "hover:bg-muted"
                )}
              >
                <span className="text-2xl">{c.icon || "💬"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                  {c.description && <p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                </div>
                {membership?.status === "banned" && <Ban className="size-4 text-destructive" />}
                {membership?.status === "active" && <span className="size-2 rounded-full bg-green-500" />}
              </button>
            );
          })}
          {communities.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No communities yet.</p>}
        </div>
      </aside>

      {/* Chat */}
      <main className="flex-1 flex flex-col min-w-0">
        {current ? (
          <CommunityChat
            community={current}
            membership={myMemberships.find((m) => m.community_id === current.id) || null}
            isAdmin={role === "admin"}
            onToggleSidebar={() => setShowSidebar((s) => !s)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">Select a community to start chatting.</div>
        )}
      </main>
    </div>
  );
}

function CommunityChat({ community, membership, isAdmin, onToggleSidebar }: {
  community: Community; membership: Member | null; isAdmin: boolean; onToggleSidebar: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showRules, setShowRules] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canWrite = isAdmin || (membership && membership.status === "active");
  const isBanned = membership?.status === "banned";

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", community.id],
    enabled: !!canWrite || isAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("community_messages")
        .select("*").eq("community_id", community.id).order("created_at", { ascending: true }).limit(500);
      if (error) throw error;
      return data as Message[];
    },
  });

  useEffect(() => {
    if (!canWrite && !isAdmin) return;
    const ch = supabase.channel(`msgs-${community.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_messages", filter: `community_id=eq.${community.id}` },
        () => qc.invalidateQueries({ queryKey: ["messages", community.id] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [community.id, canWrite, isAdmin, qc]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const filtered = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.toLowerCase();
    return messages.filter((m) =>
      m.message?.toLowerCase().includes(q) ||
      m.student_name?.toLowerCase().includes(q) ||
      m.attachment_name?.toLowerCase().includes(q)
    );
  }, [messages, search]);

  const pinnedMessages = messages.filter((m) => m.pinned && !m.deleted_at);

  const join = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("community_members").insert({
        community_id: community.id, student_id: user!.id, role: "student", status: "active"
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Joined community"); qc.invalidateQueries({ queryKey: ["my-memberships"] }); },
    onError: (e: any) => toast.error(e.message || "Cannot join this community"),
  });

  return (
    <>
      <header className="h-14 border-b border-border px-4 flex items-center gap-3 bg-card/50 backdrop-blur">
        <Button size="icon" variant="ghost" className="md:hidden" onClick={onToggleSidebar}><ChevronLeft className="size-5" /></Button>
        <span className="text-2xl">{community.icon || "💬"}</span>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold truncate flex items-center gap-2">
            <Hash className="size-4 text-muted-foreground" />{community.name}
          </h2>
          {community.description && <p className="text-xs text-muted-foreground truncate">{community.description}</p>}
        </div>
        <div className="relative hidden sm:block">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="pl-8 h-9 w-48" />
        </div>
        {community.rules && <Button size="sm" variant="ghost" onClick={() => setShowRules(true)}>Rules</Button>}
        <Button size="sm" variant="ghost" onClick={() => setShowMembers(true)}><Users className="size-4" /></Button>
      </header>

      {pinnedMessages.length > 0 && (
        <div className="border-b border-border bg-accent/5 px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs">
          <Pin className="size-3 text-accent shrink-0" />
          <span className="text-muted-foreground shrink-0">Pinned:</span>
          {pinnedMessages.map((m) => (
            <span key={m.id} className="bg-background border border-border rounded-full px-3 py-1 whitespace-nowrap max-w-xs truncate">
              <b>{m.student_name}:</b> {m.message || m.attachment_name}
            </span>
          ))}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {!canWrite && !isAdmin && (
          <div className="text-center p-6 bg-card border border-border rounded-2xl max-w-md mx-auto">
            {isBanned ? (
              <p className="text-destructive font-semibold">You have been removed from this community by the administrator.</p>
            ) : (
              <>
                <p className="mb-3 font-semibold">Join this community to chat</p>
                {community.rules && <p className="text-xs text-muted-foreground mb-3 whitespace-pre-wrap">{community.rules}</p>}
                <Button onClick={() => join.mutate()} disabled={join.isPending}><LogIn className="size-4 mr-2" />Join Community</Button>
              </>
            )}
          </div>
        )}
        {(canWrite || isAdmin) && filtered.map((m) => (
          <MessageItem
            key={m.id}
            msg={m}
            allMessages={messages}
            currentUserId={user?.id || ""}
            isAdmin={isAdmin}
          />
        ))}
        {(canWrite || isAdmin) && filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-sm py-8">No messages yet — start the conversation.</p>
        )}
      </div>

      {(canWrite || isAdmin) && <MessageComposer communityId={community.id} />}

      <Dialog open={showRules} onOpenChange={setShowRules}>
        <DialogContent>
          <DialogHeader><DialogTitle>Community Rules</DialogTitle></DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{community.rules}</p>
        </DialogContent>
      </Dialog>

      <MembersDialog open={showMembers} onOpenChange={setShowMembers} communityId={community.id} isAdmin={isAdmin} />
    </>
  );
}

function MessageItem({ msg, allMessages, currentUserId, isAdmin }: {
  msg: Message; allMessages: Message[]; currentUserId: string; isAdmin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(msg.message);
  const qc = useQueryClient();
  const isOwn = msg.student_id === currentUserId;
  const reply = msg.reply_to_id ? allMessages.find((m) => m.id === msg.reply_to_id) : null;

  const update = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await (supabase.from as any)("community_messages").update(patch).eq("id", msg.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", msg.community_id] }),
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("community_messages").delete().eq("id", msg.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["messages", msg.community_id] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const copy = () => { navigator.clipboard.writeText(msg.message || ""); toast.success("Copied"); };

  const setReplyTarget = () => { window.dispatchEvent(new CustomEvent("community-reply", { detail: msg })); };

  if (msg.deleted_at) {
    return <div className="text-xs italic text-muted-foreground pl-11">[message deleted]</div>;
  }

  return (
    <div id={`msg-${msg.id}`} className={cn("group flex gap-3", msg.pinned && "bg-accent/5 -mx-2 px-2 py-1 rounded-lg")}>
      <div className="size-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold shrink-0">
        {(msg.student_name || "?")[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-sm">{msg.student_name}</span>
          <span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleString()}</span>
          {msg.edited_at && <span className="text-xs text-muted-foreground italic">(edited)</span>}
          {msg.pinned && <Pin className="size-3 text-accent" />}
        </div>
        {reply && (
          <div className="mt-1 border-l-2 border-primary/50 pl-2 text-xs text-muted-foreground truncate">
            <b>{reply.student_name}:</b> {reply.message || reply.attachment_name}
          </div>
        )}
        {editing ? (
          <div className="mt-1 flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} className="h-8 text-sm" />
            <Button size="sm" onClick={() => { update.mutate({ message: text, edited_at: new Date().toISOString() }); setEditing(false); }}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => { setText(msg.message); setEditing(false); }}>Cancel</Button>
          </div>
        ) : (
          msg.message && <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{msg.message}</p>
        )}
        {msg.attachment_url && <Attachment url={msg.attachment_url} type={msg.attachment_type} name={msg.attachment_name} />}
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex gap-1 shrink-0 self-start transition">
        <Button size="icon" variant="ghost" className="size-7" onClick={setReplyTarget} title="Reply"><Reply className="size-3.5" /></Button>
        {msg.message && <Button size="icon" variant="ghost" className="size-7" onClick={copy} title="Copy"><Copy className="size-3.5" /></Button>}
        {isAdmin && <Button size="icon" variant="ghost" className="size-7" onClick={() => update.mutate({ pinned: !msg.pinned })} title="Pin"><Pin className={cn("size-3.5", msg.pinned && "text-accent")} /></Button>}
        {isOwn && msg.message && <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditing(true)} title="Edit"><Pencil className="size-3.5" /></Button>}
        {(isOwn || isAdmin) && <Button size="icon" variant="ghost" className="size-7" onClick={() => confirm("Delete message?") && del.mutate()} title="Delete"><Trash2 className="size-3.5 text-destructive" /></Button>}
      </div>
    </div>
  );
}

function Attachment({ url, type, name }: { url: string; type: string | null; name: string | null }) {
  const [signed, setSigned] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      // url stored is the storage path
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(url, 3600);
      setSigned(data?.signedUrl || null);
    })();
  }, [url]);

  const isImage = type?.startsWith("image/");
  if (!signed) return <div className="mt-2 text-xs text-muted-foreground">Loading attachment…</div>;

  if (isImage) {
    return <a href={signed} target="_blank" rel="noreferrer" className="block mt-2 max-w-sm"><img src={signed} alt={name || "image"} className="rounded-lg border border-border" /></a>;
  }
  return (
    <a href={signed} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 text-sm hover:bg-muted max-w-sm">
      <FileText className="size-4 text-primary" />
      <span className="truncate flex-1">{name || "Attachment"}</span>
    </a>
  );
}

function MessageComposer({ communityId }: { communityId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: any) => setReplyTo(e.detail);
    window.addEventListener("community-reply", h);
    return () => window.removeEventListener("community-reply", h);
  }, []);

  const send = async () => {
    if (!user) return;
    if (!text.trim() && !file) return;
    setUploading(true);
    try {
      let attachment_url: string | null = null;
      let attachment_type: string | null = null;
      let attachment_name: string | null = null;
      if (file) {
        if (file.size > MAX_SIZE) { toast.error("Max size is 50MB"); setUploading(false); return; }
        if (!ALLOWED.includes(file.type)) { toast.error("File type not allowed"); setUploading(false); return; }
        const path = `${user.id}/${communityId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
        if (upErr) throw upErr;
        attachment_url = path;
        attachment_type = file.type;
        attachment_name = file.name;
      }
      // Get name
      const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      const { error } = await (supabase.from as any)("community_messages").insert({
        community_id: communityId,
        student_id: user.id,
        student_name: profile?.full_name || user.email?.split("@")[0] || "Student",
        message: text.trim(),
        attachment_url, attachment_type, attachment_name,
        reply_to_id: replyTo?.id || null,
      });
      if (error) throw error;
      setText(""); setFile(null); setReplyTo(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["messages", communityId] });
    } catch (e: any) {
      toast.error(e.message || "Failed to send");
    } finally { setUploading(false); }
  };

  return (
    <div className="border-t border-border p-3 bg-card/50">
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 text-xs bg-muted rounded-lg px-3 py-1.5">
          <Reply className="size-3" />
          <span className="flex-1 truncate">Replying to <b>{replyTo.student_name}</b>: {replyTo.message || replyTo.attachment_name}</span>
          <button onClick={() => setReplyTo(null)}><X className="size-3" /></button>
        </div>
      )}
      {file && (
        <div className="flex items-center gap-2 mb-2 text-xs bg-muted rounded-lg px-3 py-1.5">
          {file.type.startsWith("image/") ? <ImageIcon className="size-3" /> : <FileText className="size-3" />}
          <span className="flex-1 truncate">{file.name} ({Math.round(file.size / 1024)} KB)</span>
          <button onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }}><X className="size-3" /></button>
        </div>
      )}
      <div className="flex gap-2 items-end">
        <input ref={fileRef} type="file" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" />
        <Button size="icon" variant="ghost" onClick={() => fileRef.current?.click()}><Paperclip className="size-4" /></Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message… (Shift+Enter for new line)"
          className="flex-1 resize-none min-h-[40px] max-h-32"
          rows={1}
        />
        <Button onClick={send} disabled={uploading || (!text.trim() && !file)}><Send className="size-4" /></Button>
      </div>
    </div>
  );
}

function MembersDialog({ open, onOpenChange, communityId, isAdmin }: {
  open: boolean; onOpenChange: (o: boolean) => void; communityId: string; isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const { data: members = [] } = useQuery({
    queryKey: ["members", communityId],
    enabled: open,
    queryFn: async () => {
      const { data: mem, error } = await (supabase.from as any)("community_members").select("*").eq("community_id", communityId);
      if (error) throw error;
      const ids = (mem as Member[]).map((m) => m.student_id);
      if (ids.length === 0) return [] as (Member & { full_name: string })[];
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map = new Map((profs || []).map((p: any) => [p.id, p.full_name]));
      return (mem as Member[]).map((m) => ({ ...m, full_name: map.get(m.student_id) || "Student" }));
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await (supabase.from as any)("community_members").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members", communityId] }); toast.success("Updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("community_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members", communityId] }); toast.success("Removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Members ({members.length})</DialogTitle></DialogHeader>
        <div className="max-h-96 overflow-y-auto space-y-2">
          {members.map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 p-2 border border-border rounded-xl">
              <div className="size-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white text-xs font-bold">
                {m.full_name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{m.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {m.role === "admin" && <Shield className="inline size-3 mr-1" />}
                  {m.status}
                </p>
              </div>
              {isAdmin && (
                <div className="flex gap-1">
                  {m.status !== "banned" ? (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: m.id, status: "banned" })}>Ban</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: m.id, status: "active" })}>Unban</Button>
                  )}
                  {m.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: m.id, status: "muted" })}>Mute</Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => confirm("Remove member?") && remove.mutate(m.id)}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              )}
            </div>
          ))}
          {members.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No members yet.</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
