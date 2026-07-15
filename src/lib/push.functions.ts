import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Public: expose VAPID public key to browser
export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env.VAPID_PUBLIC_KEY || "" };
});

// Save (upsert) a push subscription for the current user
export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        endpoint: z.string().url(),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
        userAgent: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.userAgent ?? null,
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Remove a subscription (e.g. when user disables notifications)
export const removePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ endpoint: z.string().url() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// List notifications for the current user (bell/history)
export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notification_recipients")
      .select(
        "id, read_at, deleted_at, created_at, notification:notifications(id, title, body, image_url, redirect_url, button_text, type, created_at)",
      )
      .eq("user_id", context.userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ recipientId: z.string().uuid().optional(), all: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("notification_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (data.recipientId) q = q.eq("id", data.recipientId);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMyNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ recipientId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notification_recipients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.recipientId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const NotificationTypeSchema = z.enum([
  "new_lecture",
  "live_class",
  "new_pdf",
  "extra_notes",
  "community",
  "master_ji",
  "test_series",
  "assignment",
  "general",
]);

// Admin: send broadcast
export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(500),
        imageUrl: z.string().url().optional().nullable(),
        redirectUrl: z.string().optional().nullable(),
        buttonText: z.string().max(40).optional().nullable(),
        type: NotificationTypeSchema.default("general"),
        targetType: z.enum(["all_students", "batch", "class_level", "user"]).default("all_students"),
        batchId: z.string().uuid().optional().nullable(),
        classLevel: z.string().optional().nullable(),
        targetUserId: z.string().uuid().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve recipients (student user_ids)
    let recipientIds: string[] = [];
    if (data.targetType === "user" && data.targetUserId) {
      recipientIds = [data.targetUserId];
    } else if (data.targetType === "batch" && data.batchId) {
      const { data: rows, error } = await supabaseAdmin
        .from("enrollments")
        .select("student_id")
        .eq("batch_id", data.batchId);
      if (error) throw new Error(error.message);
      recipientIds = [...new Set((rows ?? []).map((r) => r.student_id))];
    } else if (data.targetType === "class_level" && data.classLevel) {
      const { data: rows, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("class_level", data.classLevel);
      if (error) throw new Error(error.message);
      recipientIds = (rows ?? []).map((r) => r.id);
    } else {
      // all_students: everyone with role 'student'
      const { data: rows, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "student");
      if (error) throw new Error(error.message);
      recipientIds = [...new Set((rows ?? []).map((r) => r.user_id))];
    }

    // Insert notification row
    const { data: notif, error: nErr } = await supabaseAdmin
      .from("notifications")
      .insert({
        title: data.title,
        body: data.body,
        image_url: data.imageUrl ?? null,
        redirect_url: data.redirectUrl ?? null,
        button_text: data.buttonText ?? null,
        type: data.type,
        target_type: data.targetType,
        batch_id: data.batchId ?? null,
        class_level: data.classLevel ?? null,
        target_user_id: data.targetUserId ?? null,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (nErr) throw new Error(nErr.message);

    // Insert recipient rows
    if (recipientIds.length > 0) {
      const rows = recipientIds.map((uid) => ({ notification_id: notif.id, user_id: uid }));
      // chunk to avoid huge single insert
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabaseAdmin.from("notification_recipients").insert(chunk);
        if (error) console.error("[notif] recipient insert failed", error.message);
      }
    }

    // Send web push in the background
    let sent = 0;
    let failed = 0;
    if (recipientIds.length > 0) {
      const { data: subs, error: sErr } = await supabaseAdmin
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, user_id")
        .in("user_id", recipientIds);
      if (sErr) console.error("[notif] load subs failed", sErr.message);

      if (subs && subs.length > 0) {
        const webpush = (await import("web-push")).default;
        webpush.setVapidDetails(
          process.env.VAPID_SUBJECT || "mailto:admin@adityaexamhub.com",
          process.env.VAPID_PUBLIC_KEY!,
          process.env.VAPID_PRIVATE_KEY!,
        );
        const payload = JSON.stringify({
          title: data.title,
          body: data.body,
          image: data.imageUrl ?? undefined,
          url: data.redirectUrl || "/dashboard",
          buttonText: data.buttonText ?? undefined,
          notificationId: notif.id,
        });

        await Promise.all(
          subs.map(async (s) => {
            try {
              await webpush.sendNotification(
                { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                payload,
                { TTL: 60 * 60 * 24 },
              );
              sent++;
            } catch (err: unknown) {
              failed++;
              const statusCode = (err as { statusCode?: number })?.statusCode;
              // 404/410 = gone; drop the subscription
              if (statusCode === 404 || statusCode === 410) {
                await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
              } else {
                console.error("[notif] push failed", statusCode, (err as Error)?.message);
              }
            }
          }),
        );
      }
    }

    return { notificationId: notif.id, recipients: recipientIds.length, sent, failed };
  });
