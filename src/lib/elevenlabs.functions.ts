import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Mints a single-use WebRTC conversation token for the ElevenLabs Conversational AI agent.
 * Requires:
 *   - ELEVENLABS_API_KEY (from ElevenLabs standard connector)
 *   - ELEVENLABS_AGENT_ID (set as secret; created in the ElevenLabs Agents dashboard)
 */
export const getMasterJiVoiceToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;

    if (!apiKey) {
      throw new Error(
        "ElevenLabs is not connected. Ask the admin to connect ElevenLabs in the project settings.",
      );
    }
    if (!agentId) {
      throw new Error(
        "Master Ji Live is not configured. Ask the admin to set ELEVENLABS_AGENT_ID (the Agent ID from your ElevenLabs Agents dashboard).",
      );
    }

    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
      { headers: { "xi-api-key": apiKey } },
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[elevenlabs] token failed", res.status, body);
      throw new Error(`Failed to start Master Ji Live (${res.status})`);
    }

    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new Error("ElevenLabs did not return a token");
    return { token: data.token, agentId };
  });
