import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * ELEVENLABS CUSTOM LLM ENDPOINT
 * 
 * This is a proxy endpoint that ElevenLabs calls at /responses
 * It forwards everything to Maya's brain (ai-chat) and returns
 * the response in the format ElevenLabs expects.
 * 
 * ElevenLabs expects OpenAI Responses API format with streaming.
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
    console.log("[ElevenLabs /responses] Received request:", JSON.stringify(body, null, 2).substring(0, 500));

    // Extract messages from the request
    // ElevenLabs sends in OpenAI format: { messages: [...], model: "...", stream: true }
    const messages = body.messages || [];
    const stream = body.stream !== false; // Default to streaming

    // Get conversation ID from headers or generate one
    const conversationId = 
      req.headers.get("x-elevenlabs-conversation-id") ||
      body.conversation_id ||
      `el-${crypto.randomUUID()}`;

    const sessionId = `elevenlabs-${conversationId}`;

    console.log("[ElevenLabs /responses] Conversation:", conversationId, "Messages:", messages.length);

    // Forward to Maya's brain (ai-chat)
    const aiChatResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "x-elevenlabs-agent-id": req.headers.get("x-elevenlabs-agent-id") || "",
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
      console.error("[ElevenLabs /responses] ai-chat error:", aiChatResponse.status, errorText);
      
      // Return error in OpenAI format
      return new Response(JSON.stringify({
        error: {
          message: "Maya is having trouble right now. Please try again.",
          type: "server_error",
        }
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For streaming, pass through the SSE stream directly
    if (stream) {
      return new Response(aiChatResponse.body, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // For non-streaming, parse and reformat
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

    // Return in OpenAI non-streaming format
    return new Response(JSON.stringify({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "maya-custom",
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
    console.error("[ElevenLabs /responses] Error:", error);
    
    return new Response(JSON.stringify({
      error: {
        message: "Something went wrong. Please try again.",
        type: "server_error",
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
