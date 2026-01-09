import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS MAYA - PHONE VOICE BRIDGE
 * 
 * This webhook is called by ElevenLabs phone agent.
 * ElevenLabs handles the voice (STT/TTS).
 * We route ALL intelligence to our ai-chat function.
 * 
 * Phone Maya = Website Maya = ONE MAYA brain!
 * 
 * IMPORTANT: For conversation continuity, we use the caller's phone number
 * as a stable session identifier since ElevenLabs may not send conversation_id.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const body = await req.json();
    console.log("[Phone Maya] Received:", JSON.stringify(body, null, 2));

    // Extract user message - ElevenLabs sends various formats
    const userMessage =
      body.text ||
      body.message ||
      body.user_message ||
      body.input ||
      body.Mayabrain ||
      body.parameters?.text ||
      body.parameters?.message ||
      body.payload?.text ||
      body.payload?.message ||
      // Fallback: first non-empty string value
      (body && typeof body === "object" ? findFirstString(body) : "") ||
      "";

    // Get stable conversation identifier
    // Priority: phone number > explicit IDs from body > headers > deterministic fingerprint
    const callerPhone =
      body.caller_phone ||
      body.phone_number ||
      body.from ||
      body.caller_id ||
      "";

    const headerConversationId =
      req.headers.get("x-elevenlabs-conversation-id") ||
      req.headers.get("x-conversation-id") ||
      req.headers.get("x-conversationid") ||
      req.headers.get("x-session-id") ||
      "";

    const explicitBodyId =
      body.conversation_id ||
      body.conversationId ||
      body.session_id ||
      body.sessionId ||
      body.parameters?.conversation_id ||
      body.parameters?.conversationId ||
      body.parameters?.session_id ||
      body.parameters?.sessionId ||
      "";

    // Use phone number as session ID for continuity, otherwise use whatever stable IDs we can find.
    // If ElevenLabs doesn't provide IDs for tool calls, we fall back to a deterministic fingerprint
    // (good enough to preserve continuity during a single testing session).
    const sessionId = callerPhone
      ? `phone-${callerPhone.replace(/\D/g, "")}`
      : explicitBodyId || headerConversationId || (await getDeterministicSessionId(req));

    console.log("[Phone Maya] Session ID:", sessionId, "| Message:", userMessage.substring(0, 100));

    if (!userMessage) {
      const greeting = "Hi! This is Maya from Your Travel Agent. How can I help you today?";
      return new Response(
        JSON.stringify({
          // Common conventions various ElevenLabs tool runners look for
          result: greeting,
          output: greeting,

          // Backwards compatible keys
          response: greeting,
          text: greeting,
          message: greeting,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Add phone context to first message
    const contextPrefix = callerPhone 
      ? `[PHONE CALL from ${callerPhone}] ` 
      : "[PHONE CALL] ";

    // Route to OUR ai-chat (Maya's brain with ALL tools)
    const aiChatResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: contextPrefix + userMessage }],
        sessionId: sessionId,
        conversationId: sessionId, // Use same ID for both
      }),
    });

    if (!aiChatResponse.ok) {
      const errorText = await aiChatResponse.text();
      console.error("[Phone Maya] ai-chat error:", aiChatResponse.status, errorText);
      
      const fallback = "Hmm, I hit a little snag. Can you try that again?";

      return new Response(
        JSON.stringify({
          result: fallback,
          output: fallback,
          response: fallback,
          text: fallback,
          message: fallback,
        }),
        {
          status: 200, // Return 200 so ElevenLabs can speak the error
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse SSE response from ai-chat
    const responseText = await aiChatResponse.text();
    let mayaResponse = "";
    
    for (const line of responseText.split("\n")) {
      if (line.startsWith("data: ") && !line.includes("[DONE]")) {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.choices?.[0]?.delta?.content) {
            mayaResponse += data.choices[0].delta.content;
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    }

    // Clean up response for voice (remove markdown, etc.)
    mayaResponse = mayaResponse
      .replace(/\*\*/g, '') // Remove bold markdown
      .replace(/\*/g, '')   // Remove italic markdown
      .replace(/`/g, '')    // Remove code ticks
      .replace(/\n\n+/g, '. ') // Replace multiple newlines with pause
      .replace(/\n/g, '. ')    // Replace single newlines
      .trim();

    console.log("[Phone Maya] Response:", mayaResponse.substring(0, 200));

    // Return in format ElevenLabs expects
    return new Response(
      JSON.stringify({
        // Common conventions various ElevenLabs tool runners look for
        result: mayaResponse,
        output: mayaResponse,

        // Backwards compatible keys
        response: mayaResponse,
        text: mayaResponse,
        message: mayaResponse,

        // Helpful for continuity if ElevenLabs passes these through
        session_id: sessionId,
        conversation_id: sessionId,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[Phone Maya] Error:", error);

    const fallback = "I'm having a moment here. Can you try that again?";

    return new Response(
      JSON.stringify({
        result: fallback,
        output: fallback,
        response: fallback,
        text: fallback,
        message: fallback,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Helper to find first non-empty string in object
function findFirstString(obj: Record<string, unknown>): string {
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

async function getDeterministicSessionId(req: Request): Promise<string> {
  // When ElevenLabs tool calls don't include conversation_id/session_id, we still want
  // some continuity to avoid "identity verify" loops.
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const userAgent = req.headers.get("user-agent") || "";
  const acceptLanguage = req.headers.get("accept-language") || "";

  const raw = `${forwardedFor}|${userAgent}|${acceptLanguage}`.trim();
  if (!raw) return `anon-${crypto.randomUUID()}`;

  const hash = await sha256Hex(raw);
  return `fp-${hash.slice(0, 32)}`;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

