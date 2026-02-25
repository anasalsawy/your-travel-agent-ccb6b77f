import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS DEV AGENT - Voice webhook for the Dev Agent
 * 
 * This is the "agent_brain" tool for an ElevenLabs voice agent that connects
 * to the Dev Agent (GPT-4o with 21 tools). It allows the admin/CEO to talk
 * to the Dev Agent by phone — checking business data, giving instructions,
 * and managing the website hands-free.
 * 
 * The ElevenLabs agent handles conversation, and routes tool calls here
 * when it needs to execute actions or look up data.
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    console.log("[dev-agent-voice] Received:", JSON.stringify(body).substring(0, 500));

    // Extract the user's spoken message
    const userMessage = body.parameters?.query || body.parameters?.message || body.message || body.text || "";
    const phoneNumber = body.phone_number || body.phoneNumber || body.caller_id || "";
    const conversationId = body.conversation_id || body.conversationId || "";

    if (!userMessage) {
      return new Response(JSON.stringify({ 
        response: "I didn't catch that. Could you repeat?" 
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load recent conversation history for continuity
    let recentMessages: Array<{ role: string; content: string }> = [];
    const sessionId = `voice-dev-${phoneNumber.replace(/\D/g, '') || 'unknown'}`;

    // Find or create conversation
    let { data: voiceConvo } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (!voiceConvo) {
      const { data: newConvo } = await supabase
        .from("ai_conversations")
        .insert({
          session_id: sessionId,
          customer_phone: phoneNumber,
          owner_verified: true,
          status: "owner_mode"
        })
        .select("id")
        .single();
      voiceConvo = newConvo;
    }

    if (voiceConvo?.id) {
      const { data: prevMsgs } = await supabase
        .from("ai_chat_messages")
        .select("role, content")
        .eq("conversation_id", voiceConvo.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (prevMsgs && prevMsgs.length > 0) {
        recentMessages = prevMsgs.reverse().map((m: any) => ({ role: m.role, content: m.content }));
      }
    }

    // Call the Dev Agent with full tool access
    const devAgentResponse = await fetch(`${SUPABASE_URL}/functions/v1/dev-agent`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          ...recentMessages,
          { role: "user", content: `[VOICE CALL - Keep responses SHORT, 1-3 sentences max, conversational. No markdown, no code blocks, no bullet points. Speak naturally.]\n\n${userMessage}` }
        ],
      }),
    });

    const devResult = await devAgentResponse.json();
    let response = devResult?.content || "Hmm, I hit a snag. Try asking again?";

    // Strip ALL formatting for speech
    response = response
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/`{3}[\s\S]*?`{3}/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // links
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // Truncate for speech (keep it under ~30 seconds of speech)
    if (response.length > 500) {
      // Find a natural break point
      const cutoff = response.lastIndexOf('. ', 480);
      response = response.substring(0, cutoff > 200 ? cutoff + 1 : 497) + '...';
    }

    // Add action summary as brief verbal note
    const actionLog = devResult?.action_log || [];
    if (actionLog.length > 0) {
      const successCount = actionLog.filter((a: any) => a.success).length;
      const failCount = actionLog.length - successCount;
      if (failCount > 0) {
        response += ` By the way, ${successCount} actions succeeded and ${failCount} had issues.`;
      }
    }

    // Save to conversation history
    if (voiceConvo?.id) {
      await supabase.from("ai_chat_messages").insert([
        { conversation_id: voiceConvo.id, role: "user", content: userMessage, metadata: { channel: "voice", phone: phoneNumber, agent: "dev-agent" } },
        { conversation_id: voiceConvo.id, role: "assistant", content: response, metadata: { channel: "voice", agent: "dev-agent" } }
      ]);
    }

    return new Response(JSON.stringify({ response }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[dev-agent-voice] Error:", error);
    return new Response(JSON.stringify({ 
      response: "Sorry boss, something went wrong on my end. Try again in a sec." 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
