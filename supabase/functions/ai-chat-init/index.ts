import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * AI CHAT INIT - Session Bootstrap Endpoint
 * 
 * Called when the chat widget opens to:
 * 1. Resolve/create conversation from sessionId
 * 2. Return conversation history (last N messages)
 * 
 * This enables Maya to remember users across sessions.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const sessionId = body.sessionId || body.session_id;
    const limit = Math.min(body.limit || 20, 50); // Default 20, max 50

    if (!sessionId) {
      return new Response(JSON.stringify({ 
        error: "sessionId is required" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[ai-chat-init] Looking up session: ${sessionId}`);

    // Find existing conversation by session_id
    const { data: existingConv, error: lookupError } = await supabase
      .from("ai_conversations")
      .select("id, customer_id, customer_name, customer_email, created_at")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (lookupError) {
      console.error("[ai-chat-init] Lookup error:", lookupError);
    }

    let conversationId: string;
    let isReturning = false;
    let customerName: string | null = null;

    if (existingConv) {
      conversationId = existingConv.id;
      isReturning = true;
      customerName = existingConv.customer_name;
      console.log(`[ai-chat-init] Found existing conversation: ${conversationId}`);
    } else {
      // Create new conversation
      const { data: newConv, error: createError } = await supabase
        .from("ai_conversations")
        .insert({ session_id: sessionId })
        .select("id")
        .single();

      if (createError) {
        console.error("[ai-chat-init] Create error:", createError);
        throw createError;
      }

      conversationId = newConv.id;
      console.log(`[ai-chat-init] Created new conversation: ${conversationId}`);
    }

    // Load message history for existing conversations
    let messages: { role: string; content: string; created_at: string }[] = [];

    if (isReturning) {
      const { data: history, error: historyError } = await supabase
        .from("ai_chat_messages")
        .select("role, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (historyError) {
        console.error("[ai-chat-init] History error:", historyError);
      } else if (history && history.length > 0) {
        messages = history;
        console.log(`[ai-chat-init] Loaded ${messages.length} messages`);
      }
    }

    // Calculate time since last message for context
    let lastMessageAge: string | null = null;
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const lastTime = new Date(lastMsg.created_at).getTime();
      const now = Date.now();
      const diffMs = now - lastTime;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffDays > 0) {
        lastMessageAge = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      } else if (diffHours > 0) {
        lastMessageAge = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else {
        lastMessageAge = "recently";
      }
    }

    return new Response(JSON.stringify({
      conversationId,
      isReturning,
      customerName,
      lastMessageAge,
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[ai-chat-init] Error:", error);
    return new Response(JSON.stringify({ 
      error: "Failed to initialize chat session" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
