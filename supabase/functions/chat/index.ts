import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * ELEVENLABS CUSTOM LLM - CHAT COMPLETIONS ENDPOINT
 * 
 * ElevenLabs calls: {Server URL}/chat/completions
 * This function handles /chat/* paths
 * 
 * It proxies to Maya's brain (ai-chat) and returns
 * OpenAI-compatible streaming responses.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-elevenlabs-agent-id, x-elevenlabs-conversation-id",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const body = await req.json();
    console.log("[ElevenLabs /chat/completions] Request received");
    console.log("[ElevenLabs /chat/completions] Model:", body.model);
    console.log("[ElevenLabs /chat/completions] Messages:", body.messages?.length || 0);
    console.log("[ElevenLabs /chat/completions] Stream:", body.stream);

    // Extract messages - ElevenLabs sends standard OpenAI format
    const messages = body.messages || [];
    const shouldStream = body.stream !== false;

    // Get conversation ID from headers
    const conversationId = 
      req.headers.get("x-elevenlabs-conversation-id") ||
      body.conversation_id ||
      `el-${crypto.randomUUID()}`;

    const sessionId = `elevenlabs-${conversationId}`;

    console.log("[ElevenLabs /chat/completions] Forwarding to ai-chat...");

    // Forward to Maya's brain
    const aiChatResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "User-Agent": "ElevenLabs-CustomLLM",
        "x-elevenlabs-conversation-id": conversationId,
      },
      body: JSON.stringify({
        messages,
        sessionId,
        conversationId,
      }),
    });

    if (!aiChatResponse.ok) {
      const errorText = await aiChatResponse.text();
      console.error("[ElevenLabs /chat/completions] ai-chat error:", aiChatResponse.status, errorText);
      
      return new Response(JSON.stringify({
        error: {
          message: "Maya is having trouble right now",
          type: "server_error",
          code: "internal_error"
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For streaming, pass through directly
    if (shouldStream) {
      console.log("[ElevenLabs /chat/completions] Streaming response...");
      
      return new Response(aiChatResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // For non-streaming, parse SSE and return complete response
    const responseText = await aiChatResponse.text();
    let content = "";
    
    for (const line of responseText.split("\n")) {
      if (line.startsWith("data: ") && !line.includes("[DONE]")) {
        try {
          const data = JSON.parse(line.substring(6));
          if (data.choices?.[0]?.delta?.content) {
            content += data.choices[0].delta.content;
          }
        } catch (e) {
          // Skip non-JSON lines
        }
      }
    }

    console.log("[ElevenLabs /chat/completions] Response:", content.substring(0, 100));

    return new Response(JSON.stringify({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model || "maya-custom",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: content,
        },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[ElevenLabs /chat/completions] Error:", error);
    
    return new Response(JSON.stringify({
      error: {
        message: "Something went wrong",
        type: "server_error",
        code: "internal_error"
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
