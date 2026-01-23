import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS MAYA - UNIFIED BRAIN (GPT-5.2)
 * 
 * This webhook routes ALL ElevenLabs voice agent requests through our ai-chat function.
 * This ensures voice callers get the SAME Maya (GPT-5.2) as web chat and WhatsApp users.
 * 
 * Flow:
 * 1. ElevenLabs agent calls this webhook with user's speech (transcribed)
 * 2. We forward to ai-chat (GPT-5.2) with full context
 * 3. Return the response for ElevenLabs to speak
 * 
 * This gives voice callers access to ALL Maya capabilities:
 * - Flight booking & ticket requests
 * - Award flight searches
 * - Voucher browsing & purchasing
 * - Order management
 * - Customer support
 * - Unified customer memory
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    console.log("[ElevenLabs Maya] Received request:", JSON.stringify(body, null, 2));

    // Extract user message from various possible fields
    const userMessage = (
      body.text ||
      body.message ||
      body.user_message ||
      body.userMessage ||
      body.input ||
      body.transcript ||
      body.parameters?.text ||
      body.parameters?.message ||
      body.parameters?.query ||
      ""
    ).trim();

    // Extract conversation/session ID for context continuity
    const conversationId = body.conversation_id || body.conversationId || body.session_id || body.sessionId;
    const phoneNumber = body.phone_number || body.phoneNumber || body.caller_id || body.callerId;

    console.log("[ElevenLabs Maya] User message:", userMessage);
    console.log("[ElevenLabs Maya] Conversation ID:", conversationId);
    console.log("[ElevenLabs Maya] Phone number:", phoneNumber);

    if (!userMessage) {
      return new Response(
        JSON.stringify({
          response: "I didn't catch that. Could you please repeat?",
          success: true
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to identify customer by phone number for unified memory
    let customerId: string | null = null;
    if (phoneNumber) {
      const { data: customerData } = await supabase.rpc("get_or_create_customer_by_phone", {
        p_phone: phoneNumber
      });
      if (customerData) {
        customerId = customerData;
        console.log("[ElevenLabs Maya] Identified customer:", customerId);
      }
    }

    // Get or create conversation for this voice call
    let dbConversationId = conversationId;
    if (!dbConversationId) {
      // Create a new conversation for this voice call
      const { data: newConv } = await supabase
        .from("ai_conversations")
        .insert({
          session_id: `voice-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          customer_id: customerId,
          customer_phone: phoneNumber,
          status: "active"
        })
        .select("id")
        .single();
      
      if (newConv) {
        dbConversationId = newConv.id;
      }
    }

    // Store the user's voice message
    if (dbConversationId) {
      await supabase.from("ai_chat_messages").insert({
        conversation_id: dbConversationId,
        role: "user",
        content: userMessage,
        metadata: { source: "voice", phone: phoneNumber }
      });
    }

    // Get conversation history for context
    let conversationHistory: Array<{ role: string; content: string }> = [];
    if (dbConversationId) {
      const { data: history } = await supabase
        .from("ai_chat_messages")
        .select("role, content")
        .eq("conversation_id", dbConversationId)
        .order("created_at", { ascending: true })
        .limit(20);
      
      if (history) {
        conversationHistory = history.map(m => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content
        }));
      }
    }

    // Call our ai-chat function (GPT-5.2) for the actual response
    console.log("[ElevenLabs Maya] Routing to ai-chat (GPT-5.2)...");
    
    const aiChatResponse = await fetch(`${SUPABASE_URL}/functions/v1/ai-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        message: userMessage,
        conversationId: dbConversationId,
        sessionId: conversationId || `voice-${Date.now()}`,
        isVoiceCall: true,
        isElevenLabsRequest: true,
        phoneNumber: phoneNumber,
        customerId: customerId,
        history: conversationHistory.slice(-10), // Last 10 messages for context
      }),
    });

    if (!aiChatResponse.ok) {
      const errorText = await aiChatResponse.text();
      console.error("[ElevenLabs Maya] ai-chat error:", aiChatResponse.status, errorText);
      
      return new Response(
        JSON.stringify({
          response: "I'm having a brief technical issue. Could you repeat that?",
          success: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle streaming response from ai-chat
    const responseText = await aiChatResponse.text();
    console.log("[ElevenLabs Maya] Raw response from ai-chat:", responseText.substring(0, 500));

    // Parse SSE response to extract the assistant message
    let assistantResponse = "";
    const lines = responseText.split("\n");
    
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.substring(6).trim();
        if (data === "[DONE]") continue;
        
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices?.[0]?.delta?.content) {
            assistantResponse += parsed.choices[0].delta.content;
          } else if (parsed.content) {
            assistantResponse += parsed.content;
          } else if (typeof parsed === "string") {
            assistantResponse += parsed;
          }
        } catch {
          // Not JSON, might be plain text
          if (data && data !== "[DONE]") {
            assistantResponse += data;
          }
        }
      }
    }

    // Fallback: if no streaming data, try parsing as regular JSON
    if (!assistantResponse) {
      try {
        const jsonResponse = JSON.parse(responseText);
        assistantResponse = jsonResponse.response || jsonResponse.message || jsonResponse.content || "";
      } catch {
        assistantResponse = responseText;
      }
    }

    // Clean up the response for voice output
    assistantResponse = assistantResponse
      .replace(/\*\*/g, "") // Remove markdown bold
      .replace(/\*/g, "")   // Remove markdown italic
      .replace(/#{1,6}\s/g, "") // Remove markdown headers
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Convert links to just text
      .replace(/```[\s\S]*?```/g, "") // Remove code blocks
      .replace(/`([^`]+)`/g, "$1") // Remove inline code
      .trim();

    // Ensure we have a response
    if (!assistantResponse) {
      assistantResponse = "I'm sorry, I didn't quite understand. Could you rephrase that?";
    }

    console.log("[ElevenLabs Maya] Final response:", assistantResponse.substring(0, 200));

    // Store the assistant's response
    if (dbConversationId) {
      await supabase.from("ai_chat_messages").insert({
        conversation_id: dbConversationId,
        role: "assistant",
        content: assistantResponse,
        metadata: { source: "voice", model: "gpt-5.2" }
      });
    }

    // Return response for ElevenLabs to speak
    return new Response(
      JSON.stringify({
        response: assistantResponse,
        success: true,
        conversation_id: dbConversationId,
        model: "gpt-5.2"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ElevenLabs Maya] Error:", error);

    return new Response(
      JSON.stringify({
        response: "I apologize, but I'm experiencing a technical issue. Please try again in a moment.",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 200, // Return 200 so ElevenLabs doesn't retry
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
