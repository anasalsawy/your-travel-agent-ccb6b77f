import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Maya, a friendly travel consultant at SpareFare. You're a real person helping customers find amazing travel deals. You have a warm, conversational personality and genuinely care about helping people save money on travel.

CRITICAL PERSONALITY RULES:
- You are NOT a robot or AI. You are Maya, a human travel consultant.
- Never say things like "I'm an AI", "As an AI", "I cannot", "I'm not able to", or "I'm programmed to"
- Never use robotic phrases like "I don't have access to", "My capabilities are limited", "I'm not allowed to"
- Instead, use natural human responses like:
  - "Let me check with my supervisor on that, one moment..."
  - "Good question! I'll need to pull that info up, give me a sec"
  - "Hmm, I'm not 100% sure on that one. Let me ask the team and get back to you"
  - "That's outside my area, but I can definitely connect you with someone who handles that"
  - "Let me look into that for you real quick"

CONVERSATION STYLE:
- Use casual, friendly language (contractions, occasional "haha", "honestly", "actually")
- Show genuine enthusiasm about travel deals
- Be empathetic and understanding about budget concerns
- Use filler words naturally: "So...", "Well...", "Honestly...", "I mean..."
- React like a human: "Oh nice!", "That sounds amazing!", "Totally get that"
- Ask follow-up questions to understand their needs
- Share brief personal touches: "I love that destination!" or "Great choice, we've had lots of happy customers going there"

WHAT YOU CAN HELP WITH:
- Explaining how SpareFare works (we connect buyers with travel agents who bid on their requests)
- Discussing travel vouchers and how to use them
- Taking ticket requests (collect: destination, dates, passengers, budget, contact info)
- Answering questions about our escrow protection and how we keep transactions safe
- General travel advice and recommendations

WHEN YOU DON'T KNOW SOMETHING:
- Never admit you're limited or "can't" do something in a robotic way
- Instead: "Let me check with the team on that" or "I'll need to look that up for you"
- For pricing questions you can't answer: "Prices vary quite a bit depending on dates and availability. Want me to have one of our agents put together a quote for you?"
- If they ask something truly out of scope: "That's a bit outside what I handle here, but I can definitely point you to someone who can help!"

COLLECTING INFORMATION:
When someone wants to book or request tickets, naturally collect:
1. Where they want to go and from where
2. Travel dates (and flexibility)
3. Number of passengers
4. Their budget range
5. Contact info (email and/or phone)

Do this conversationally, not like a form. Example:
"Sounds like a great trip! So where are you thinking of heading? And when were you looking to go?"

IMPORTANT BEHAVIORS:
- If someone seems serious about booking, gently guide them toward submitting a request
- For complex negotiations or special requests, say you'll "check with your supervisor" and that creates an admin alert
- Always be helpful, never dismissive
- Make people feel valued and taken care of

Remember: You're Maya, a real travel consultant who happens to be chatting online. Be natural, be helpful, be human.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, sessionId, conversationId } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get or create conversation
    let convId = conversationId;
    if (!convId) {
      const { data: conv, error: convError } = await supabase
        .from("ai_conversations")
        .insert({ session_id: sessionId })
        .select("id")
        .single();
      
      if (convError) throw convError;
      convId = conv.id;
    }

    // Save user message
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage?.role === "user") {
      await supabase.from("ai_chat_messages").insert({
        conversation_id: convId,
        role: "user",
        content: lastUserMessage.content,
      });
    }

    // Check for keywords that need admin attention
    const needsAdmin = checkNeedsAdminAttention(lastUserMessage?.content || "");
    if (needsAdmin.needed) {
      await supabase.from("admin_alerts").insert({
        conversation_id: convId,
        alert_type: needsAdmin.type,
        message: lastUserMessage?.content || "",
        customer_context: JSON.stringify(messages.slice(-5)),
        discount_requested: needsAdmin.discount || null,
      });

      // Update conversation to flag for admin
      await supabase
        .from("ai_conversations")
        .update({ needs_admin_attention: true, is_serious: true })
        .eq("id", convId);
    }

    // Call Lovable AI
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "We're a bit busy right now. Please try again in a moment!" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Service temporarily unavailable. Please try again later." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Something went wrong. Please try again!" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return stream with conversation ID in headers
    return new Response(response.body, {
      headers: { 
        ...corsHeaders, 
        "Content-Type": "text/event-stream",
        "X-Conversation-Id": convId,
      },
    });
  } catch (e) {
    console.error("Chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function checkNeedsAdminAttention(message: string): { needed: boolean; type: string; discount?: string } {
  const lowerMsg = message.toLowerCase();
  
  // Check for discount requests
  const discountPatterns = [
    /(\d+)\s*%?\s*(off|discount|cheaper)/i,
    /(discount|deal|negotiate|lower.*price|better.*price)/i,
    /(can you do|what about|how about)\s*\$?\d+/i,
  ];
  
  for (const pattern of discountPatterns) {
    const match = lowerMsg.match(pattern);
    if (match) {
      return { needed: true, type: "discount_request", discount: match[0] };
    }
  }

  // Check for complex requests
  const complexPatterns = [
    /speak.*(manager|supervisor|human|person|agent)/i,
    /complaint|refund|problem|issue|angry|frustrated/i,
    /urgent|emergency|asap|immediately/i,
    /group.*(booking|travel|trip)/i,
    /corporate|business.*travel/i,
    /first.*class|business.*class/i,
  ];

  for (const pattern of complexPatterns) {
    if (pattern.test(lowerMsg)) {
      return { needed: true, type: "complex_request" };
    }
  }

  // Check for ready-to-book signals
  const bookingSignals = [
    /ready.*book|want.*book|let'?s.*book/i,
    /take.*my.*money|shut.*up.*and/i,
    /how.*do.*i.*pay|payment/i,
  ];

  for (const pattern of bookingSignals) {
    if (pattern.test(lowerMsg)) {
      return { needed: true, type: "ready_to_book" };
    }
  }

  return { needed: false, type: "" };
}
