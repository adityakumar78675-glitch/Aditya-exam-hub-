import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AnalyzeResult } from "@/lib/youtube-utils";
import { extractYoutubeId, normalizeQuestion } from "@/lib/youtube-utils";
import {
  ImportError,
  assertAdmin,
  cleanTranscript,
  extractQuestions,
  fetchOembed,
  fetchTranscript,
  fetchVideoInfo,
  transcribeAudio,
} from "@/lib/youtube-import.server";

function toClientError(e: unknown): Error {
  if (e instanceof ImportError) return new Error(e.message);
  console.error("[youtube-import]", e);
  return new Error("Something went wrong while importing. Please try again.");
}

export const adminAnalyzeYoutubeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string; translate?: "none" | "hi" | "en" }) => d)
  .handler(async ({ data, context }): Promise<AnalyzeResult> => {
    try {
      await assertAdmin(context.supabase as never, context.userId);

      const videoId = extractYoutubeId(data.url);
      if (!videoId) throw new ImportError("invalid_url", "Please enter a valid YouTube video URL.");

      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new ImportError("provider_failure", "AI is not configured.");

      const info = await fetchVideoInfo(videoId);
      let title = info.title;
      let channel = info.channel;
      if (!title) {
        try {
          const meta = await fetchOembed(videoId);
          title = meta.title || "YouTube video";
          channel = meta.channel;
        } catch {
          title = "YouTube video";
        }
      }
      const base = {
        video_id: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        channel,
        duration_seconds: info.duration_seconds,
        transcript_language: null as string | null,
      };

      const { text: transcript, language } = await fetchTranscript(videoId, info);
      if (!transcript || transcript.length < 200) {
        return {
          ...base,
          transcript_language: language,
          transcript_status: "unavailable" as const,
          transcript_chars: transcript.length,
          truncated: false,
          questions: [],
        };
      }

      const { truncated, questions } = await extractQuestions(apiKey, transcript, data.translate);
      return {
        ...base,
        transcript_language: language,
        transcript_status: "available" as const,
        transcript_chars: transcript.length,
        truncated,
        questions,
      };
    } catch (e) {
      throw toClientError(e);
    }
  });

/** Speech-to-text fallback: admin supplies the session audio when captions are missing. */
export const adminExtractFromAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Invalid upload");
    return d;
  })
  .handler(async ({ data, context }): Promise<AnalyzeResult> => {
    try {
      await assertAdmin(context.supabase as never, context.userId);
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new ImportError("provider_failure", "AI is not configured.");

      const file = data.get("file");
      if (!(file instanceof File) || file.size < 2048) {
        throw new ImportError("empty_transcript", "Please choose a valid audio file of the session.");
      }
      if (file.size > 24 * 1024 * 1024) {
        throw new ImportError("empty_transcript", "Audio must be under 24 MB. Please upload a shorter clip.");
      }
      const translate = (String(data.get("translate") ?? "none") as "none" | "hi" | "en") ?? "none";
      const urlRaw = String(data.get("url") ?? "");
      const videoId = urlRaw ? extractYoutubeId(urlRaw) : null;

      const transcript = await transcribeAudio(apiKey, file);
      if (transcript.length < 200) {
        throw new ImportError(
          "transcript_unavailable",
          "Automatic transcription could not be completed for this audio.",
        );
      }

      let title = "Transcribed session";
      let channel = "";
      if (videoId) {
        try {
          const info = await fetchVideoInfo(videoId);
          title = info.title || title;
          channel = info.channel;
        } catch {
          /* metadata is optional */
        }
      }

      const { truncated, questions } = await extractQuestions(apiKey, transcript, translate);
      return {
        video_id: videoId ?? "",
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
        title,
        channel,
        duration_seconds: null,
        transcript_language: null,
        transcript_status: "available" as const,
        transcript_chars: transcript.length,
        truncated,
        questions,
      };
    } catch (e) {
      throw toClientError(e);
    }
  });


/** Fallback path: admin pastes the transcript manually. */
export const adminExtractFromTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url?: string; transcript: string; translate?: "none" | "hi" | "en" }) => d)
  .handler(async ({ data, context }): Promise<AnalyzeResult> => {
    try {
      await assertAdmin(context.supabase as never, context.userId);
      const transcript = cleanTranscript(data.transcript);
      if (transcript.length < 200) {
        throw new ImportError("empty_transcript", "The transcript is too short to extract questions from.");
      }
      const apiKey = process.env["LOVABLE_API_KEY"];
      if (!apiKey) throw new ImportError("provider_failure", "AI is not configured.");

      const videoId = data.url ? extractYoutubeId(data.url) : null;
      let title = "Pasted transcript";
      let channel = "";
      if (videoId) {
        try {
          const meta = await fetchOembed(videoId);
          title = meta.title || title;
          channel = meta.channel;
        } catch {
          /* metadata is optional for the paste flow */
        }
      }

      const { truncated, questions } = await extractQuestions(apiKey, transcript, data.translate);
      return {
        video_id: videoId ?? "",
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : "",
        title,
        channel,
        duration_seconds: null,
        transcript_language: null,
        transcript_status: "available" as const,
        transcript_chars: transcript.length,
        truncated,
        questions,
      };
    } catch (e) {
      throw toClientError(e);
    }
  });


export const adminImportYoutubeQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      testId: string;
      video: { id: string; url: string; title: string };
      skipDuplicates: boolean;
      questions: {
        question_en: string;
        options_en: string[];
        correct_option: number;
        solution_en?: string | null;
        positive_marks?: number | null;
        negative_marks?: number | null;
      }[];
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    if (!data.questions.length) throw new Error("No questions selected");
    if (data.questions.length > 500) throw new Error("Maximum 500 questions per import");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("test_questions")
      .select("order_index, question_en")
      .eq("test_id", data.testId);
    if (exErr) throw new Error(exErr.message);

    const seen = new Set((existing ?? []).map((r) => normalizeQuestion(r.question_en)));
    let next = Math.max(0, ...(existing ?? []).map((r) => r.order_index ?? 0)) + 1;
    const importedAt = new Date().toISOString();

    let skipped = 0;
    const rows: Record<string, unknown>[] = [];
    for (const q of data.questions) {
      const question = q.question_en.trim();
      const opts = q.options_en.map((o) => String(o ?? "").trim());
      if (!question) throw new Error("A question has no text");
      if (opts.length !== 4 || opts.some((o) => !o)) throw new Error("A question does not have 4 valid options");
      if (q.correct_option < 0 || q.correct_option > 3) throw new Error("A question has an invalid answer");
      const key = normalizeQuestion(question);
      if (data.skipDuplicates && seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      rows.push({
        test_id: data.testId,
        order_index: next++,
        type: "mcq",
        question_en: question,
        options_en: opts,
        options_hi: [],
        correct_option: q.correct_option,
        solution_en: q.solution_en?.trim() || null,
        positive_marks: q.positive_marks ?? null,
        negative_marks: q.negative_marks ?? null,
        source_type: "youtube",
        youtube_video_id: data.video.id,
        youtube_url: data.video.url,
        youtube_title: data.video.title,
        imported_at: importedAt,
        imported_by: context.userId,
      });
    }

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabaseAdmin.from("test_questions").insert(rows.slice(i, i + 200) as never);
      if (error) throw new Error(error.message);
    }
    return { inserted: rows.length, skipped };
  });

/** Normalized question texts of a test, for client-side duplicate detection. */
export const adminGetTestQuestionKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { testId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("test_questions")
      .select("question_en")
      .eq("test_id", data.testId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => normalizeQuestion(r.question_en));
  });
