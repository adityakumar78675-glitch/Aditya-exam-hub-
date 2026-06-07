import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const curriculumInput = z.object({ batchId: z.string().uuid() });

async function safeAdminQuery<T>(label: string, run: () => PromiseLike<{ data: T | null; error: any }>, fallback: T): Promise<T> {
  try {
    const { data, error } = await run();
    if (error) {
      console.log(`[Curriculum] ${label} failed`, error);
      return fallback;
    }
    return data ?? fallback;
  } catch (error) {
    console.log(`[Curriculum] ${label} failed`, error);
    return fallback;
  }
}

export const getBatchCurriculum = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => curriculumInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const batchId = data.batchId;

    console.log("Checking blocked status");
    console.log("Curriculum loading...");

    const batch = await safeAdminQuery("batch", () =>
      supabaseAdmin.from("batches").select("*").eq("id", batchId).maybeSingle(), null as any);

    if (!batch) {
      return {
        batch: null,
        userId,
        isAdmin: false,
        hasAccess: false,
        isBlocked: false,
        subjects: [],
        chapters: [],
        lectures: [],
        materials: [],
        extraNotes: [],
        errors: ["Batch not found"],
      };
    }

    const [roles, enrollment, profile] = await Promise.all([
      safeAdminQuery("roles", () => supabaseAdmin.from("user_roles").select("role").eq("user_id", userId), [] as any[]),
      safeAdminQuery("enrollment", () => supabaseAdmin.from("enrollments").select("id").eq("student_id", userId).eq("batch_id", batchId).maybeSingle(), null as any),
      safeAdminQuery("blocked status", () => supabaseAdmin.from("profiles").select("blocked").eq("id", userId).maybeSingle(), null as any),
    ]);

    const isAdmin = roles.some((role: any) => role.role === "admin");
    const isBlocked = !!profile?.blocked;
    const batchPrice = Number(batch.discount_price ?? batch.price ?? 0);
    const isFreeBatch = batchPrice === 0;
    const hasPurchased = !!enrollment;
    const hasAccess = isAdmin || isFreeBatch || hasPurchased;

    console.log("Block check success/failure", { isBlocked });
    console.log("User:", userId);
    console.log("Batch:", batchId);
    console.log("Purchased:", hasAccess);

    if (!hasAccess || (isBlocked && !isAdmin)) {
      return {
        batch,
        userId,
        isAdmin,
        hasAccess: false,
        isBlocked,
        subjects: [],
        chapters: [],
        lectures: [],
        materials: [],
        extraNotes: [],
        errors: [],
      };
    }

    const subjects = await safeAdminQuery("subjects", () =>
      supabaseAdmin.from("subjects").select("*").eq("batch_id", batchId).order("sort_order", { ascending: true }), [] as any[]);
    const subjectIds = subjects.map((subject: any) => subject.id).filter(Boolean);

    const [chapters, lectures, extraNotes] = await Promise.all([
      subjectIds.length
        ? safeAdminQuery("chapters", () => supabaseAdmin.from("chapters").select("*").in("subject_id", subjectIds).order("sort_order", { ascending: true }), [] as any[])
        : Promise.resolve([]),
      safeAdminQuery("lectures", () => supabaseAdmin.from("lectures").select("*").eq("batch_id", batchId).order("order_index", { ascending: true }), [] as any[]),
      safeAdminQuery("extra notes", () => supabaseAdmin.from("extra_notes").select("*").eq("batch_id", batchId).order("sort_order", { ascending: true }), [] as any[]),
    ]);

    const lectureIds = lectures.map((lecture: any) => lecture.id).filter(Boolean);
    const materials = lectureIds.length
      ? await safeAdminQuery("materials", () => supabaseAdmin.from("materials").select("*").in("lecture_id", lectureIds).order("created_at", { ascending: true }), [] as any[])
      : [];

    console.log("Opening Batch");

    return {
      batch,
      userId,
      isAdmin,
      hasAccess: true,
      isBlocked,
      subjects,
      chapters,
      lectures,
      materials,
      extraNotes,
      errors: [],
    };
  });