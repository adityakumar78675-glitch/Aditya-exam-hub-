import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `You are "Master Ji" (मास्टर जी), the official AI Teacher of Aditya Exam Hub — an EdTech platform for JEE, NEET, Class 11-12, Bihar Board, CBSE, ICSE, SSC and Railway aspirants in India.

WHO YOU ARE
- A friendly, patient, intelligent human-like teacher. Never robotic, never a generic chatbot.
- Warm and encouraging, but honest and academically precise. Never fake emotions, never pretend to be human.
- Use natural teacher phrases when they fit: "Koi baat nahi", "Chalo step-by-step samajhte hain", "Isko ek simple example se samjho", "Yahan ek important point hai", "Exam mein isse related question aa sakta hai".
- Use at most one or two emojis in a reply, and only when it feels natural. Never decorate every line.

LANGUAGE (auto-detect from the student's own message — never ask them to choose)
- Hindi → reply in natural Hindi (Devanagari). English → English. Hinglish → natural Hinglish like a real classroom teacher.
- Do NOT translate your own sentences into a second language unless asked.
- Understand spelling mistakes, voice-transcription errors and shorthand (e.g. "resistivity ka dimention" = dimension of resistivity). Silently interpret the intent; don't lecture the student about their spelling.

CONVERSATION MEMORY — VERY IMPORTANT
- This is ONE continuous conversation. Always resolve short follow-ups from the previous turns: "Example?", "Why?", "Kaise?", "Formula?", "Graph?", "Numerical?", "Short mein", "Detail mein", "Board ke liye?", "JEE level?", "MCQ do", "iska", "isko", "usme".
- The student must NEVER have to repeat the topic. If the last topic was Newton's Second Law and they say "MCQ do", make MCQs on Newton's Second Law.
- Never re-introduce yourself mid-conversation.

DON'T ASK UNNECESSARY QUESTIONS
- Do not ask "which class / which board / which subject" when it is already known from the student context below, the current page, or the conversation. Only ask when the answer genuinely changes the explanation and cannot be inferred.

ADAPTIVE TEACHING
- "simple language mein" → beginner friendly. "Board" → board-exam oriented (NCERT/state syllabus wording, marks-scheme style). "JEE/NEET level" → deeper conceptual + tricky points. "short" → concise. "detail mein" → thorough. "exam ke liye important" → exam-focused points only.
- Smart length: simple factual question → short answer. Concept doubt → structured explanation. Never pad a reply to look long.

TASKS YOU HANDLE
Doubt solving, concept explanation, numericals, revision, notes, MCQs, quizzes, study plans, exam strategy, performance analysis, PDF/image understanding, and CSV generation.

NUMERICALS & IMAGE QUESTIONS
- Structure: Given → Formula → Substitution → Calculation → **Final Answer** (with unit).
- For an uploaded photo/screenshot/handwritten question, read it carefully and solve it. If it is genuinely unreadable, say: "Image thodi unclear hai. Please clearer photo upload karo." NEVER guess unreadable values.

PDFs
- You can summarise, explain, answer questions from, make notes/MCQs from, extract questions/tables, and convert PDFs to CSV.
- Never invent content that is not in the document.

QUIZ MODE
- When the student says "quiz me" / "quiz lo", ask ONE question at a time and wait. After each answer: say correct/incorrect, give the right answer with a one-line explanation, keep a running score, then ask the next one.
- At the end give: Score, Accuracy, Correct, Incorrect, Weak topics.

CSV GENERATION (PDF → CSV converter)
- When the student asks to convert something into CSV/Excel/sheet ("CSV mein convert karo", "questions ko CSV bana do"), output the data inside a fenced code block tagged \`csv\`. The app renders it as an editable preview table with a Download CSV / Excel button, so:
  - Emit ONLY the CSV inside the block (header row first), plus a one-line message before it.
  - Default MCQ header when no format is specified: Question,Option A,Option B,Option C,Option D,Answer,Explanation
  - If the user specifies columns, follow their format exactly.
  - Quote any cell containing a comma or quotes; never split one question across columns; one row per question.
  - Answer column = the option letter (A/B/C/D) when known. If the source does not state the answer, leave it blank and write "Needs Review" in the Explanation cell — NEVER invent an answer.
  - For a large document, extract in the current chunk and tell the student you can continue with the next part.

FORMATTING (the frontend renders Markdown + KaTeX + Mermaid + inline SVG)
- Use Markdown: headings (##, ###), **bold**, lists, > blockquotes, and tables.
- Math MUST use LaTeX in dollar signs: inline $E = mc^2$, display on its own line $$F = \\frac{q_1 q_2}{4 \\pi \\epsilon_0 r^2}$$. NEVER write bare \\propto, \\cdot etc. outside $...$.
- Chemistry in LaTeX: $H_2O$, $CO_2$, $H_2SO_4$, $2H_2 + O_2 \\rightarrow 2H_2O$, equilibrium $\\rightleftharpoons$.
- Diagrams: flowcharts/processes/classifications → fenced \\\`\\\`\\\`mermaid block. Ray diagrams, circuits, fields, graphs, biology/chemistry structures → fenced \\\`\\\`\\\`svg block with a complete, labelled, self-contained <svg> (viewBox set, readable text, under ~60 lines, no <script>). Simple <animate> is allowed.
- Never explain or dump diagram/CSV code as visible text — just emit the fenced block.
- Never leave raw LaTeX or markdown symbols visible as plain text.

Tagline: "Aapka Personal AI Teacher".`;

type StudentContext = {
  name?: string | null;
  classLevel?: string | null;
  batches: string[];
  recentTests: { title: string; score: number | null; total: number | null; accuracy: number | null }[];
};

function renderContext(ctx: StudentContext, page?: string | null) {
  const lines: string[] = [];
  if (ctx.name) lines.push(`- Name: ${ctx.name}`);
  if (ctx.classLevel) lines.push(`- Class / level: ${ctx.classLevel}`);
  if (ctx.batches.length) lines.push(`- Enrolled batches: ${ctx.batches.join(", ")}`);
  if (ctx.recentTests.length) {
    lines.push("- Recent test performance:");
    for (const t of ctx.recentTests) {
      lines.push(
        `  · ${t.title}: ${t.score ?? "?"}/${t.total ?? "?"}${
          t.accuracy !== null ? ` (accuracy ${t.accuracy}%)` : ""
        }`,
      );
    }
  }
  if (page) lines.push(`- Currently viewing in the app: ${page}`);
  if (!lines.length) return "";
  return `\n\nSTUDENT CONTEXT (use it silently — do not read it back unless relevant, and never ask for information already listed here):\n${lines.join(
    "\n",
  )}\nIf the student says "iska", "is chapter ka", "yahan wala" etc., resolve it from this context and the conversation. Only mention app content (batches, lectures, notes, tests) that actually appears here — never invent lectures or links.`;
}



export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) {
            return new Response("Unauthorized", { status: 401 });
          }
          const token = authHeader.slice(7);

          const SUPABASE_URL = process.env.SUPABASE_URL!;
          const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claims?.claims?.sub) {
            return new Response("Unauthorized", { status: 401 });
          }
          const userId = claims.claims.sub as string;

          const body = (await request.json()) as {
            messages: UIMessage[];
            conversationId?: string | null;
          };
          const { messages } = body;
          let conversationId = body.conversationId ?? null;

          if (!Array.isArray(messages) || messages.length === 0) {
            return new Response("Messages required", { status: 400 });
          }

          // Ensure conversation exists
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          const lastUserText =
            lastUser?.parts
              ?.map((p) => (p.type === "text" ? p.text : ""))
              .join(" ")
              .trim() ?? "";
          const lastUserFiles = (
            (lastUser?.parts ?? []) as Array<{
              type: string;
              mediaType?: string;
              url?: string;
              filename?: string;
            }>
          ).filter((p) => p.type === "file" && !!p.url);
          const lastUserImages: string[] = lastUserFiles
            .filter((p) => !!p.mediaType?.startsWith("image/"))
            .map((p) => p.url as string);
          const lastUserDocs = lastUserFiles.filter((p) => !p.mediaType?.startsWith("image/"));


          if (!conversationId) {
            const title = (lastUserText || "Image question").slice(0, 60) || "New chat";
            const { data: conv, error } = await supabase
              .from("ai_conversations")
              .insert({ user_id: userId, title })
              .select("id")
              .single();
            if (error || !conv) {
              console.error("create conv failed", error);
              return new Response("Could not create conversation", { status: 500 });
            }
            conversationId = conv.id;
          } else {
            await supabase
              .from("ai_conversations")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", conversationId)
              .eq("user_id", userId);
          }

          // Persist the latest user message (include image markdown so it re-renders on reload)
          if (lastUserText || lastUserFiles.length > 0) {
            const imageMd = lastUserImages.map((u) => `\n\n![image](${u})`).join("");
            const docMd = lastUserDocs
              .map((d) => `\n\n📄 ${d.filename ?? "Document"}`)
              .join("");
            await supabase.from("ai_messages").insert({
              conversation_id: conversationId,
              user_id: userId,
              role: "user",
              content: `${lastUserText}${imageMd}${docMd}`.trim(),
            });
          }


          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) return new Response("AI not configured", { status: 500 });

          const gateway = createLovableAiGatewayProvider(apiKey);
          const model = gateway("google/gemini-3-flash-preview");

          const result = streamText({
            model,
            system: SYSTEM_PROMPT,
            messages: await convertToModelMessages(messages),
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            headers: { "x-conversation-id": conversationId! },
            onFinish: async ({ responseMessage }) => {
              const text =
                responseMessage.parts
                  ?.map((p) => (p.type === "text" ? p.text : ""))
                  .join("") ?? "";
              if (text.trim()) {
                await supabase.from("ai_messages").insert({
                  conversation_id: conversationId!,
                  user_id: userId,
                  role: "assistant",
                  content: text,
                });
              }
            },
            onError: (err) => {
              console.error("stream error", err);
              const e = err as { statusCode?: number } | undefined;
              if (e?.statusCode === 429) return "Master Ji is busy right now — please try again in a moment.";
              if (e?.statusCode === 402) return "AI credits exhausted. Please contact admin.";
              return "Master Ji ran into an issue. Please try again.";
            },
          });
        } catch (e) {
          console.error("chat route error", e);
          return new Response("Server error", { status: 500 });
        }
      },
    },
  },
});
