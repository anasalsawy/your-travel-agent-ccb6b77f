import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WHATSAPP AGENT - GPT-5 Powered for Your Travel Agent
 * 
 * This webhook receives WhatsApp messages via Twilio.
 * Uses OpenAI GPT-5 via Lovable AI Gateway for intelligent responses.
 * Sends responses back via Twilio WhatsApp TwiML.
 */

const SYSTEM_PROMPT = `You are Maya, a friendly and professional travel assistant for Your Travel Agent (yourtravelagent.net) - a trusted marketplace for verified airline travel vouchers and discounted flight tickets.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

═══════════════════════════════════════════════════════════════════
YOUR TRAVEL AGENT - WHAT WE OFFER
═══════════════════════════════════════════════════════════════════

1. **Verified Airline Vouchers** 
   - Browse and purchase airline vouchers/credits at 20-50% off face value
   - All vouchers are verified for authenticity before sale
   - Major airlines: Delta, American, United, Southwest, JetBlue, and more

2. **Ticket Request Service**
   - Submit a request for specific flights and get quotes
   - We find discounted business/first class tickets
   - Typical savings: 40-60% off retail prices

3. **Marketplace**
   - A bidding system where approved sellers compete to fulfill ticket requests
   - Buyers get competitive pricing from verified sellers
   - All transactions are protected

4. **Secure Payments**
   - Escrow.com protection for marketplace transactions
   - PayPal, Stripe, Zelle, and Bitcoin accepted
   - Full buyer protection on all purchases

═══════════════════════════════════════════════════════════════════
WHAT YOU CAN HELP WITH
═══════════════════════════════════════════════════════════════════

✅ Explain how to browse and purchase vouchers
✅ Guide users through submitting a ticket request
✅ Explain how the marketplace bidding system works
✅ Describe payment options and buyer protection
✅ Answer questions about security and escrow
✅ Direct users to visit yourtravelagent.net for specific actions
✅ Provide general travel advice and tips

═══════════════════════════════════════════════════════════════════
WHAT YOU CANNOT DO (BE HONEST ABOUT THIS)
═══════════════════════════════════════════════════════════════════

❌ Book flights directly - users must visit the website
❌ Search real-time flight prices - we're not a search engine
❌ Access external airline systems or GDS
❌ Process payments directly via WhatsApp
❌ Check specific voucher inventory - direct to website
❌ Make reservations or hold tickets

When asked about something you can't do, be honest:
"I can't book that directly here, but if you visit yourtravelagent.net, you can submit a ticket request and we'll get you a quote!"

═══════════════════════════════════════════════════════════════════
RESPONSE STYLE FOR WHATSAPP
═══════════════════════════════════════════════════════════════════

- Keep responses SHORT (under 300 words, ideally 1-3 sentences)
- Warm, friendly, conversational tone
- Use emojis sparingly but naturally ✈️ 💰 ✅
- No long bullet lists - WhatsApp is for quick chat
- One idea per message
- Use *bold* for emphasis (single asterisk for WhatsApp)
- Be helpful but honest about limitations
- Always guide users to the website for actions

PERSONALITY:
- Casual and friendly, like texting a helpful friend
- Confident and knowledgeable about travel
- Never robotic or overly formal
- Use contractions (I'm, you're, we've)
- Occasionally use "honestly", "great question!", "oh nice"

FIRST MESSAGE EXAMPLE:
"Hey! 👋 I'm Maya from Your Travel Agent. I can help you learn about our discounted vouchers and flight deals. What are you looking for today?"

EXAMPLE RESPONSES:
- "Great question! We sell verified airline vouchers at 20-50% off. Check out yourtravelagent.net/vouchers to see what's available!"
- "Looking for discounted business class? Submit a ticket request on our site and sellers will bid to get you the best price 💰"
- "Our marketplace uses Escrow.com for protection - your money is held safely until you confirm the ticket is received ✅"`;

// Store conversation history per phone number
const conversationHistory = new Map<string, Array<{ role: string; content: string }>>();

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!LOVABLE_API_KEY) {
    console.error("[WhatsApp GPT-5] LOVABLE_API_KEY is not configured");
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Service temporarily unavailable. Please try again later.</Message></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let fromNumber = "";
    let toNumber = "";
    let messageBody = "";

    // Twilio sends form-urlencoded data
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = formData.get("From") as string || "";
      toNumber = formData.get("To") as string || "";
      messageBody = formData.get("Body") as string || "";
      
      console.log("[WhatsApp GPT-5] From:", fromNumber, "| Message:", messageBody);
    } else if (contentType.includes("application/json")) {
      // Also support JSON for testing
      const body = await req.json();
      fromNumber = body.From || body.from || "";
      toNumber = body.To || body.to || "";
      messageBody = body.Body || body.body || body.message || body.text || "";
    }

    if (!messageBody) {
      console.log("[WhatsApp GPT-5] Empty message received");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    // Use phone number as session ID for conversation continuity
    const sessionId = `whatsapp-${fromNumber.replace(/\D/g, '')}`;
    console.log("[WhatsApp GPT-5] Session:", sessionId);

    // Get or initialize conversation history (keep last 10 messages for context)
    let history = conversationHistory.get(sessionId) || [];
    
    // Add user message to history
    history.push({ role: "user", content: messageBody });
    
    // Keep only last 10 messages to stay within token limits
    if (history.length > 10) {
      history = history.slice(-10);
    }

    console.log("[WhatsApp GPT-5] Calling GPT-5 via Lovable AI Gateway...");

    // Call GPT-5 via Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[WhatsApp GPT-5] AI Gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>I'm getting a lot of messages right now! Please try again in a moment. 🙏</Message></Response>`,
          { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Service temporarily unavailable. Please visit yourtravelagent.net for assistance!</Message></Response>`,
          { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
        );
      }
      
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Oops! Something went wrong. Try again in a sec!</Message></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    const aiData = await aiResponse.json();
    let assistantResponse = aiData.choices?.[0]?.message?.content || "";

    console.log("[WhatsApp GPT-5] GPT-5 response:", assistantResponse.substring(0, 200));

    // If no response was generated, provide a fallback
    if (!assistantResponse.trim()) {
      assistantResponse = "Hey! 👋 I'm Maya from Your Travel Agent. How can I help you today? ✈️";
    }

    // Add assistant response to history
    history.push({ role: "assistant", content: assistantResponse });
    conversationHistory.set(sessionId, history);

    // Clean response for WhatsApp
    assistantResponse = assistantResponse
      .replace(/\*\*/g, '*') // Convert double asterisk to single for WhatsApp bold
      .substring(0, 1500); // WhatsApp message limit

    console.log("[WhatsApp GPT-5] Final response:", assistantResponse.substring(0, 200));

    // Log conversation to database for analytics (optional)
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
      await supabase.from("ai_chat_messages").insert([
        {
          conversation_id: sessionId,
          role: "user",
          content: messageBody,
          metadata: { channel: "whatsapp", phone: fromNumber }
        },
        {
          conversation_id: sessionId,
          role: "assistant", 
          content: assistantResponse,
          metadata: { channel: "whatsapp", model: "openai/gpt-5" }
        }
      ]);
    } catch (dbError) {
      console.error("[WhatsApp GPT-5] DB logging error (non-fatal):", dbError);
    }

    // Return TwiML response for Twilio
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(assistantResponse)}</Message></Response>`;
    
    return new Response(twimlResponse, {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });

  } catch (error) {
    console.error("[WhatsApp GPT-5] Error:", error);
    
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Something went wrong. Please visit yourtravelagent.net for help!</Message></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  }
});

// Escape special XML characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
