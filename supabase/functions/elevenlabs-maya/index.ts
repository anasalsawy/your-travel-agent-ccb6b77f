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
    // Priority: phone number > conversation_id from body > headers > generate new
    const callerPhone = 
      body.caller_phone ||
      body.phone_number ||
      body.from ||
      body.caller_id ||
      "";
    
    const headerConversationId =
      req.headers.get("x-elevenlabs-conversation-id") ||
      req.headers.get("x-conversation-id") ||
      "";

    // Use phone number as session ID for continuity, or fall back to other IDs
    const sessionId = callerPhone 
      ? `phone-${callerPhone.replace(/\D/g, '')}` 
      : body.conversation_id || body.session_id || headerConversationId || crypto.randomUUID();

    console.log("[Phone Maya] Session ID:", sessionId, "| Message:", userMessage.substring(0, 100));

    if (!userMessage) {
      return new Response(JSON.stringify({ 
        response: "Hi! This is Maya from Your Travel Agent. How can I help you today?",
        text: "Hi! This is Maya from Your Travel Agent. How can I help you today?",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      
      return new Response(JSON.stringify({
        response: "Hmm, I hit a little snag. Can you try that again?",
        text: "Hmm, I hit a little snag. Can you try that again?",
      }), {
        status: 200, // Return 200 so ElevenLabs can speak the error
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    return new Response(JSON.stringify({
      response: mayaResponse,
      text: mayaResponse,
      message: mayaResponse,
      session_id: sessionId,
      conversation_id: sessionId,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Phone Maya] Error:", error);
    
    return new Response(JSON.stringify({
      response: "I'm having a moment here. Can you try that again?",
      text: "I'm having a moment here. Can you try that again?",
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
