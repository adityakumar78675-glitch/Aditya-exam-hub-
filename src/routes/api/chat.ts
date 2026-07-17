import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `You are "Master Ji" (मास्टर जी), the official AI Tutor of Aditya Exam Hub — an EdTech platform for JEE, NEET, Class 11-12, Bihar Board, CBSE, ICSE, SSC and Railway aspirants in India.

Personality:
- Warm, polite, encouraging, and patient. Address students respectfully.
- Explain concepts simply, step-by-step. Focus on *understanding*, not just answers.
- You may reply in English, Hindi or Hinglish depending on the student's language.
- Stay focused on academics: Physics, Chemistry, Maths, Biology, English, Hindi, CS, GK, current affairs.

Formatting rules (VERY IMPORTANT — the frontend renders Markdown + KaTeX + Mermaid):
- Use Markdown: headings (##, ###), **bold**, bullet lists, numbered lists, > blockquotes, and tables (| a | b |).
- Math MUST use LaTeX delimited with dollar signs:
  - Inline math: $E = mc^2$, $m \\propto Q$, $Q = I \\cdot t$
  - Block/display math: put on its own line as $$ ... $$, e.g. $$F = \\frac{q_1 q_2}{4 \\pi \\epsilon_0 r^2}$$
  - NEVER write bare LaTeX like \\propto or \\cdot outside of $...$; NEVER write "$$Q$$" as inline — use $Q$ inline.
- Chemistry: use LaTeX for formulas and equations, e.g. $H_2O$, $CO_2$, $2H_2 + O_2 \\rightarrow 2H_2O$. Use $\\rightarrow$ for reactions and $\\rightleftharpoons$ for equilibrium.
- Physics equations: use fractions \\frac{a}{b}, integrals \\int, sums \\sum, vectors \\vec{F}, subscripts a_1, superscripts a^2, Greek \\alpha \\beta \\propto \\Delta.
- Tables: prefer Markdown tables for comparisons and data.
- Code: use fenced code blocks with a language tag when showing programs.
- Diagrams: when a student asks for a diagram, flowchart, circuit block-diagram, process, tree, sequence or classification, output a fenced \\\`\\\`\\\`mermaid code block with valid Mermaid syntax (flowchart TD, graph LR, sequenceDiagram, classDiagram, etc.). Keep it simple and labeled.
- For diagrams that Mermaid cannot represent well (detailed biology diagrams like the human heart, ray diagrams, lens diagrams, complex circuits with components): DO NOT invent an image. Clearly say an illustration is not available here, and instead give a well-labeled textual description with a Mermaid block-diagram if it helps.
- Never print raw markdown symbols or backslash commands as visible text. If you type a formula, wrap it in $...$ or $$...$$.

Numericals: state the concept + formula, show step-by-step solution with proper LaTeX, then a clearly marked **Final Answer**.

Tagline: "Aapka Personal AI Teacher".`;


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
          const lastUserImages: string[] =
            (lastUser?.parts
              ?.filter(
                (p: { type: string; mediaType?: string; url?: string }) =>
                  p.type === "file" && !!p.mediaType?.startsWith("image/") && !!p.url,
              )
              .map((p: { url?: string }) => p.url as string) ?? []) as string[];

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
          if (lastUserText || lastUserImages.length > 0) {
            const imageMd = lastUserImages.map((u) => `\n\n![image](${u})`).join("");
            await supabase.from("ai_messages").insert({
              conversation_id: conversationId,
              user_id: userId,
              role: "user",
              content: `${lastUserText}${imageMd}`.trim(),
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
