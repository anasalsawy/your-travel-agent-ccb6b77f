import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS MAYA - UNIFIED VOICE BRAIN
 * 
 * This is THE BRIDGE that connects ElevenLabs voice to OUR Maya.
 * ElevenLabs is ONLY used for voice (STT/TTS).
 * ALL intelligence comes from our ai-chat function.
 * 
 * PHONE MAYA = WEBSITE MAYA = ONE MAYA with ALL powers!
 * 
 * This function handles:
 * 1. Server Tool calls from ElevenLabs (routes to ai-chat)
 * 2. Direct message processing (routes to ai-chat)
 * 3. Conversation state management
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const body = await req.json();
    console.log("[Maya Voice Bridge] Received:", JSON.stringify(body, null, 2));

    // Extract the user's message and conversation context
    // ElevenLabs sends different formats depending on configuration
    const userMessage = body.text || body.message || body.user_message || body.input || "";
    const conversationId = body.conversation_id || body.session_id || crypto.randomUUID();
    const messageHistory = body.history || body.messages || [];
    
    // Dynamic variables from ElevenLabs (if using conversation initiation data)
    const dynamicVars = body.dynamic_variables || body.conversation_initiation_client_data?.dynamic_variables || {};
    
    // Check if this is a tool call from ElevenLabs Server Tools
    if (body.tool_name || body.action) {
      console.log("[Maya Voice Bridge] Server Tool call detected");
      // For tool calls, we still route through ai-chat so Maya decides how to respond
    }

    if (!userMessage && !body.tool_name) {
      // If no message, might be a ping or connection test
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Maya Voice Bridge ready!",
        capabilities: [
          "Full conversation with Maya AI",
          "Flight booking & search",
          "Award flight search",
          "Voucher search",
          "Marketplace access",
          "Customer service",
          "And everything else Maya can do!"
        ]
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the message for ai-chat
    const messages = [
      ...messageHistory.map((m: any) => ({
        role: m.role || (m.is_user ? "user" : "assistant"),
        content: m.content || m.text || m.message
      })),
    ];
    
    // Add the current message
    if (userMessage) {
      messages.push({ role: "user", content: userMessage });
    }

    // Add context about this being a phone call for Maya to adjust her style
    const callContext = dynamicVars.call_context || body.context || "";
    if (callContext && messages.length > 0) {
      // Prepend context to first message if this is a new call
      if (messages.length === 1) {
        messages[0].content = `[PHONE CALL CONTEXT: ${callContext}]\n\n${messages[0].content}`;
      }
    }

    console.log("[Maya Voice Bridge] Sending to ai-chat:", messages.length, "messages");

    // Route to OUR ai-chat (THE REAL MAYA with ALL tools)
    const aiChatResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        messages,
        sessionId: conversationId,
        conversationId: conversationId,
      }),
    });

    if (!aiChatResponse.ok) {
      const errorText = await aiChatResponse.text();
      console.error("[Maya Voice Bridge] ai-chat error:", aiChatResponse.status, errorText);
      
      return new Response(JSON.stringify({
        success: false,
        response: "Hmm, I hit a little snag. Give me just a second and try again.",
        error: errorText
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get conversation ID from response header
    const newConversationId = aiChatResponse.headers.get("X-Conversation-Id") || conversationId;

    // Parse the streaming SSE response from ai-chat
    const responseText = await aiChatResponse.text();
    let mayaResponse = "";
    
    const lines = responseText.split("\n");
    for (const line of lines) {
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

    console.log("[Maya Voice Bridge] Maya's response:", mayaResponse.substring(0, 200) + (mayaResponse.length > 200 ? "..." : ""));

    // Return response in format ElevenLabs expects
    // The response text will be converted to speech by ElevenLabs
    return new Response(JSON.stringify({
      success: true,
      // The main response text - ElevenLabs will speak this
      response: mayaResponse,
      // Alternative field names for different ElevenLabs configurations
      text: mayaResponse,
      message: mayaResponse,
      output: mayaResponse,
      // Conversation tracking
      conversation_id: newConversationId,
      session_id: newConversationId,
      // Metadata
      source: "maya-ai-chat",
      tools_available: true
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[Maya Voice Bridge] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return new Response(JSON.stringify({
      success: false,
      response: "I'm having a moment here. Can you try that again?",
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
