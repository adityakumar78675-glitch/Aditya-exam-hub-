import { supabase } from "@/integrations/supabase/client";
import {
  getVapidPublicKey,
  savePushSubscription,
  removePushSubscription,
} from "@/lib/push.functions";

const PROMPTED_KEY = "aeh_push_prompted_v1";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

async function getOrRegisterSW() {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function subscribeAndSave() {
  const reg = await getOrRegisterSW();
  await navigator.serviceWorker.ready;
  const { key } = await getVapidPublicKey();
  if (!key) throw new Error("Push service is not configured");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  const json = sub.toJSON();
  await savePushSubscription({
    data: {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      userAgent: navigator.userAgent,
    },
  });
  return sub;
}

// Called on login: prompt once if permission is 'default'.
// If already 'granted', silently make sure a subscription is saved.
export async function ensurePushOnLogin() {
  if (!pushSupported()) return;
  try {
    if (Notification.permission === "granted") {
      await subscribeAndSave();
      return;
    }
    if (Notification.permission === "denied") return;
    // 'default' — prompt only once per browser
    if (localStorage.getItem(PROMPTED_KEY)) return;
    localStorage.setItem(PROMPTED_KEY, "1");
    const perm = await Notification.requestPermission();
    if (perm === "granted") await subscribeAndSave();
  } catch (e) {
    console.warn("[push] ensurePushOnLogin failed", e);
  }
}

// Called from a Settings toggle / bell menu
export async function enablePush() {
  if (!pushSupported()) throw new Error("Push not supported in this browser");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permission denied");
  localStorage.setItem(PROMPTED_KEY, "1");
  await subscribeAndSave();
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    try {
      await removePushSubscription({ data: { endpoint: sub.endpoint } });
    } catch {}
    await sub.unsubscribe();
  }
}

// Wire notification clicks that arrive while the tab is open (from the SW)
export function wireSWMessages(navigate: (url: string) => void) {
  if (!pushSupported()) return () => {};
  const handler = (ev: MessageEvent) => {
    const data = ev.data as { type?: string; url?: string } | undefined;
    if (data?.type === "aeh_navigate" && data.url) navigate(data.url);
  };
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}

// Realtime subscribe to notification_recipients inserts for the current user
export function subscribeInAppNotifications(userId: string, onInsert: () => void) {
  const channel = supabase
    .channel(`notif:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notification_recipients",
        filter: `user_id=eq.${userId}`,
      },
      () => onInsert(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
