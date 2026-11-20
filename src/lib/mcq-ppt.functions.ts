import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { projectPptQuestion, requirePptAdmin } from "./mcq-ppt-model";

export const listPptTests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError) throw new Error(roleError.message);
    requirePptAdmin(allowed);
    const tests: { id: string; title: string; subject: string | null }[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await context.supabase.from("tests").select("id,title,subject").order("created_at", { ascending: false }).order("id").range(offset, offset + 499);
      if (error) throw new Error(error.message);
      tests.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    return tests;
  });

export const getPptQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ testId: z.string().uuid(), language: z.enum(["en", "hi"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError) throw new Error(roleError.message);
    requirePptAdmin(allowed);
    const { data: test, error } = await context.supabase.from("tests").select("id,title,subject").eq("id", data.testId).single();
    if (error || !test) throw new Error(error?.message ?? "Test not found.");
    const questions = [];
    let total = 0;
    let skipped = 0;
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: questionError } = await context.supabase.from("test_questions")
        .select("id,type,order_index,question_en,question_hi,options_en,options_hi")
        .eq("test_id", data.testId).order("order_index").order("id").range(offset, offset + 499);
      if (questionError) throw new Error(questionError.message);
      for (const row of rows ?? []) {
        total++;
        if (row.type !== "mcq") { skipped++; continue; }
        questions.push(projectPptQuestion(row, total, data.language));
      }
      if (!rows || rows.length < 500) break;
    }
    return { test, questions, skipped };
  });