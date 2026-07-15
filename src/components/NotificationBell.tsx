import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, BellOff, Check, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  listMyNotifications,
  markNotificationRead,
  deleteMyNotification,
} from "@/lib/push.functions";
import {
  enablePush,
  pushSupported,
  subscribeInAppNotifications,
} from "@/lib/push-client";
import { toast } from "sonner";

type Row = Awaited<ReturnType<typeof listMyNotifications>>[number];

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["my-notifications"],
    queryFn: () => listMyNotifications(),
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!user) return;
    const off = subscribeInAppNotifications(user.id, () => {
      qc.invalidateQueries({ queryKey: ["my-notifications"] });
    });
    return off;
  }, [user, qc]);

  const rows = (data ?? []) as Row[];
  const unread = rows.filter((r) => !r.read_at).length;

  const markMut = useMutation({
    mutationFn: (recipientId?: string) =>
      markNotificationRead({ data: recipientId ? { recipientId } : { all: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });
  const delMut = useMutation({
    mutationFn: (recipientId: string) => deleteMyNotification({ data: { recipientId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notifications"] }),
  });

  const canEnablePush =
    pushSupported() && typeof Notification !== "undefined" && Notification.permission !== "granted";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative p-2 rounded-lg text-foreground hover:bg-muted transition-colors"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 max-h-[70vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-sm">Notifications</div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={() => markMut.mutate(undefined)}>
                <Check className="size-3.5 mr-1" /> Mark all
              </Button>
            )}
          </div>
        </div>

        {canEnablePush && (
          <div className="px-4 py-2 bg-muted/50 border-b border-border flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BellOff className="size-3.5" /> Push notifications are off
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await enablePush();
                  toast.success("Notifications enabled");
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Enable
            </Button>
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">You're all caught up.</div>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => {
                const n = r.notification;
                if (!n) return null;
                return (
                  <li
                    key={r.id}
                    className={`p-3 flex gap-3 hover:bg-muted/50 cursor-pointer ${!r.read_at ? "bg-primary/5" : ""}`}
                    onClick={() => {
                      if (!r.read_at) markMut.mutate(r.id);
                      if (n.redirect_url) {
                        setOpen(false);
                        navigate({ to: n.redirect_url });
                      }
                    }}
                  >
                    {n.image_url && (
                      <img src={n.image_url} alt="" className="size-10 rounded-md object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{n.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{n.body}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive p-1 self-start"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        delMut.mutate(r.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
