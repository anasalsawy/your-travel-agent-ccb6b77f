import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WHATSAPP AGENT - Maya with Quote Pipeline
 * 
 * Flow:
 * 1. Customer asks about a flight → Maya gives rough estimate + says "let me check"
 * 2. Request is saved to admin_alerts for admin review
 * 3. Admin provides real quote via admin panel
 * 4. When customer returns, Maya delivers the actual quote
 */

const SYSTEM_PROMPT = `You are Maya, a friendly and knowledgeable travel agent for Your Travel Agent (yourtravelagent.net). You're helpful, personable, and love chatting about travel.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

═══════════════════════════════════════════════════════════════════
WHO YOU ARE
═══════════════════════════════════════════════════════════════════

You're a real person with a warm personality. You can:
- Have natural conversations about travel plans, destinations, tips
- Answer questions about how our services work
- Help people understand their options
- Discuss vouchers, the marketplace, payment options, etc.

═══════════════════════════════════════════════════════════════════
WHAT WE OFFER
═══════════════════════════════════════════════════════════════════

1. **Verified Airline Vouchers** (yourtravelagent.net/vouchers)
   - Buy airline credits/vouchers at 20-50% off face value
   - All vouchers verified before sale

2. **Ticket Request Service** (yourtravelagent.net/request-ticket)
   - Submit a request → we find discounted tickets
   - Great for business/first class (40-60% savings typical)

3. **Marketplace** (yourtravelagent.net/marketplace)
   - Verified sellers compete to fulfill your request
   - All transactions protected via Escrow.com

4. **Secure Payments**
   - Escrow.com, PayPal, Stripe, Zelle, Bitcoin

═══════════════════════════════════════════════════════════════════
HOW TO HANDLE FLIGHT INQUIRIES
═══════════════════════════════════════════════════════════════════

When someone asks about a specific flight/route:

1. COLLECT THE DETAILS - Make sure you have:
   - Origin and destination cities
   - Travel dates (departure + return if round-trip)
   - Number of passengers
   - Cabin class preference (economy/business/first)
   - Any flexibility on dates

2. GIVE A ROUGH ESTIMATE (if you have market data):
   - Use any price data provided to calculate ~50% as your ballpark
   - Say something like: "Based on what I'm seeing, I'd estimate around $X-$Y for that route"
   - NEVER reveal how you calculate this

3. PUT THEM ON HOLD:
   - Always say you need to check with your team for the exact price
   - "Let me check with my contacts and get you a locked-in rate"
   - "I'll need to verify availability and pricing - give me a bit to check"
   - Ask for their name if you don't have it

4. IF YOU'RE TOLD AN ADMIN QUOTE IS READY:
   - Deliver it confidently: "Great news! I got the numbers back..."
   - Present the quote and ask if they want to proceed

═══════════════════════════════════════════════════════════════════
RESPONSE STYLE
═══════════════════════════════════════════════════════════════════

- SHORT responses (1-3 sentences, max 200 words)
- Warm, casual, like texting a friend in travel
- Emojis sparingly
- Use *bold* for emphasis
- Contractions: I'm, you're, we've, that's

PERSONALITY:
- Friendly and approachable
- "Let me check on that for you"
- "I'll get back to you with the exact numbers"
- Never make up specific prices without data`;

// Store conversation history per phone number
const conversationHistory = new Map<string, Array<{ role: string; content: string }>>();

// Search for flight prices using Perplexity
async function searchFlightPrices(query: string, perplexityKey: string): Promise<{ found: boolean; data: string; lowestPrice?: number } | null> {
  try {
    console.log("[WhatsApp Maya] Searching flight prices for:", query);
    
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${perplexityKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content: `You are a flight price researcher. Find the LOWEST current prices for the requested flight route. 
Search Google Flights, Expedia, Kayak, and airline websites.

IMPORTANT: You MUST return actual dollar amounts found.
Format your response as: "LOWEST: $XXX | RANGE: $XXX-$XXX | SOURCES: [site names]"

If you CANNOT find specific prices for this exact route, respond with EXACTLY: "NO_PRICES_FOUND"
Do NOT make up prices. Only report prices you actually found in search results.`
          },
          {
            role: "user",
            content: `Find current flight prices for: ${query}. Look for the lowest available prices across all booking sites. Return actual prices only.`
          }
        ],
        search_recency_filter: "month",
      }),
    });

    if (!response.ok) {
      console.error("[WhatsApp Maya] Perplexity error:", response.status);
      return null;
    }

    const data = await response.json();
    const priceInfo = data.choices?.[0]?.message?.content || "";
    console.log("[WhatsApp Maya] Price research result:", priceInfo);
    
    // Check if actual prices were found
    const hasNoPrices = priceInfo.includes("NO_PRICES_FOUND") || 
                        priceInfo.toLowerCase().includes("cannot find") ||
                        priceInfo.toLowerCase().includes("could not find") ||
                        priceInfo.toLowerCase().includes("no pricing data") ||
                        priceInfo.toLowerCase().includes("unable to find");
    
    // Extract lowest price from response
    const priceMatch = priceInfo.match(/LOWEST:\s*\$?([\d,]+)/i);
    const lowestPrice = priceMatch ? parseInt(priceMatch[1].replace(/,/g, '')) : undefined;
    
    // Check if there's an actual dollar amount in the response
    const hasDollarAmount = /\$\d+/.test(priceInfo) && !hasNoPrices;
    
    if (!hasDollarAmount) {
      console.log("[WhatsApp Maya] No actual prices found in search results");
      return { found: false, data: priceInfo };
    }
    
    return { found: true, data: priceInfo, lowestPrice };
  } catch (error) {
    console.error("[WhatsApp Maya] Price search error:", error);
    return null;
  }
}

// Check if message is a booking inquiry
function isBookingInquiry(message: string): boolean {
  // Must have a clear route pattern (origin to destination)
  const hasRoute = /\b(from|to)\b.*\b(to|from)\b/i.test(message) ||
                   /\b[a-z]{2,}\s+(to|->|–|-)\s+[a-z]{2,}/i.test(message);
  
  // Should also have dates or travel intent
  const hasDateOrIntent = /\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|next week|next month|this month|round.?trip|one.?way|book|ticket|flight)\b/i.test(message);
  
  return hasRoute && hasDateOrIntent;
}

// Extract flight details from message for the admin
function extractFlightDetails(message: string, conversationContext: string): string {
  return `Latest request: "${message}"\n\nConversation context:\n${conversationContext}`;
}

// Save quote request to admin_alerts for admin review
async function saveQuoteRequest(
  supabase: any,
  phoneNumber: string,
  flightDetails: string,
  roughEstimate: string | null,
  marketData: string | null
) {
  try {
    // First, find or create a conversation record
    const sessionId = `whatsapp-${phoneNumber.replace(/\D/g, '')}`;
    
    let { data: conversation, error: fetchError } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("session_id", sessionId)
      .maybeSingle();
    
    console.log("[WhatsApp Maya] Looking for conversation:", sessionId, "Found:", !!conversation);
    
    if (!conversation) {
      const { data: newConv, error: insertError } = await supabase
        .from("ai_conversations")
        .insert({
          session_id: sessionId,
          customer_phone: phoneNumber,
          needs_admin_attention: true,
          status: "pending_quote"
        })
        .select("id")
        .single();
      
      if (insertError) {
        console.error("[WhatsApp Maya] Error creating conversation:", insertError);
        return;
      }
      conversation = newConv;
      console.log("[WhatsApp Maya] Created new conversation:", conversation?.id);
    } else {
      // Update existing conversation with phone and status
      const { error: updateError } = await supabase
        .from("ai_conversations")
        .update({ 
          customer_phone: phoneNumber,
          needs_admin_attention: true, 
          status: "pending_quote" 
        })
        .eq("id", conversation.id);
      
      if (updateError) {
        console.error("[WhatsApp Maya] Error updating conversation:", updateError);
      }
      console.log("[WhatsApp Maya] Updated conversation:", conversation.id);
    }

    if (!conversation) {
      console.error("[WhatsApp Maya] Could not create/find conversation");
      return;
    }

    // Create admin alert for quote request
    const alertMessage = `📱 WhatsApp Quote Request\n\n` +
      `Phone: ${phoneNumber}\n\n` +
      `${flightDetails}\n\n` +
      (roughEstimate ? `Maya's rough estimate: ${roughEstimate}\n\n` : '') +
      (marketData ? `Market data found:\n${marketData}\n\n` : 'No market data available\n\n') +
      `Reply with the actual quote to send back to customer.`;

    const { data: alertData, error: alertError } = await supabase.from("admin_alerts").insert({
      conversation_id: conversation.id,
      alert_type: "quote_request",
      message: alertMessage,
      customer_context: flightDetails,
      is_read: false
    }).select("id").single();

    if (alertError) {
      console.error("[WhatsApp Maya] Error creating admin alert:", alertError);
      return;
    }

    console.log("[WhatsApp Maya] Saved quote request for admin review, alert id:", alertData?.id);
  } catch (error) {
    console.error("[WhatsApp Maya] Error saving quote request:", error);
  }
}

// Check if admin has responded with a quote
async function checkForAdminQuote(supabase: any, phoneNumber: string): Promise<string | null> {
  try {
    const sessionId = `whatsapp-${phoneNumber.replace(/\D/g, '')}`;
    
    // Find conversation
    const { data: conversation } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("session_id", sessionId)
      .single();
    
    if (!conversation) return null;

    // Check for undelivered admin response
    const { data: alert } = await supabase
      .from("admin_alerts")
      .select("id, admin_response, responded_at")
      .eq("conversation_id", conversation.id)
      .eq("alert_type", "quote_request")
      .not("admin_response", "is", null)
      .order("responded_at", { ascending: false })
      .limit(1)
      .single();

    if (alert?.admin_response) {
      // Mark as delivered by updating conversation status
      await supabase
        .from("ai_conversations")
        .update({ status: "quote_delivered", needs_admin_attention: false })
        .eq("id", conversation.id);
      
      return alert.admin_response;
    }

    return null;
  } catch (error) {
    console.error("[WhatsApp Maya] Error checking for admin quote:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!LOVABLE_API_KEY) {
    console.error("[WhatsApp Maya] LOVABLE_API_KEY is not configured");
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Service temporarily unavailable. Please try again later.</Message></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const contentType = req.headers.get("content-type") || "";
    let fromNumber = "";
    let toNumber = "";
    let messageBody = "";

    console.log("[WhatsApp Maya] Content-Type:", contentType);

    // Twilio sends form-urlencoded data
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      fromNumber = formData.get("From") as string || "";
      toNumber = formData.get("To") as string || "";
      messageBody = formData.get("Body") as string || "";
      
      console.log("[WhatsApp Maya] From:", fromNumber, "| Message:", messageBody);
    } else {
      // Try JSON parsing for testing and other integrations
      try {
        const body = await req.json();
        console.log("[WhatsApp Maya] JSON body received:", JSON.stringify(body).substring(0, 200));
        fromNumber = body.From || body.from || "";
        toNumber = body.To || body.to || "";
        messageBody = body.Body || body.body || body.message || body.text || "";
      } catch (parseError) {
        console.log("[WhatsApp Maya] Could not parse body as JSON:", parseError);
      }
    }

    if (!messageBody) {
      console.log("[WhatsApp Maya] Empty message received, fromNumber:", fromNumber);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    const sessionId = `whatsapp-${fromNumber.replace(/\D/g, '')}`;
    console.log("[WhatsApp Maya] Session:", sessionId);

    // Get conversation history
    let history = conversationHistory.get(sessionId) || [];
    history.push({ role: "user", content: messageBody });
    if (history.length > 10) {
      history = history.slice(-10);
    }

    // Check if admin has provided a quote for this customer
    const adminQuote = await checkForAdminQuote(supabase, fromNumber);
    
    let priceResearchContext = "";
    let shouldSaveQuoteRequest = false;
    let roughEstimate: string | null = null;
    let marketData: string | null = null;

    if (adminQuote) {
      // Admin has provided a real quote - tell Maya to deliver it
      console.log("[WhatsApp Maya] Admin quote ready:", adminQuote);
      priceResearchContext = `

═══════════════════════════════════════════════════════════════════
ADMIN QUOTE READY - DELIVER THIS TO CUSTOMER
═══════════════════════════════════════════════════════════════════
The admin has provided this quote for the customer: "${adminQuote}"

Deliver this quote naturally and enthusiastically. Something like:
"Great news! I got the numbers back from my team. ${adminQuote}"

Ask if they want to proceed with booking.
═══════════════════════════════════════════════════════════════════`;
    } else if (PERPLEXITY_API_KEY && isBookingInquiry(messageBody)) {
      // New booking inquiry - search for prices and save for admin
      console.log("[WhatsApp Maya] New booking inquiry detected");
      const priceResult = await searchFlightPrices(messageBody, PERPLEXITY_API_KEY);
      shouldSaveQuoteRequest = true;
      
      if (priceResult?.found && priceResult.lowestPrice) {
        // Calculate rough estimate at 50%
        const estimate = Math.round(priceResult.lowestPrice * 0.5 / 10) * 10;
        roughEstimate = `~$${estimate}`;
        marketData = priceResult.data;
        
        priceResearchContext = `

═══════════════════════════════════════════════════════════════════
MARKET RESEARCH (give rough estimate, then say you'll check)
═══════════════════════════════════════════════════════════════════
Market data: ${priceResult.data}
Rough estimate to share: around $${estimate} (this is ~50% of lowest market price)

IMPORTANT: 
1. Share this as a ROUGH ESTIMATE only: "Based on what I'm seeing, probably around $${estimate} or so"
2. Then say you need to verify: "Let me check with my contacts to lock in the exact rate for you"
3. Ask for their name if you don't have it
4. NEVER reveal how you calculated this
═══════════════════════════════════════════════════════════════════`;
      } else {
        priceResearchContext = `

═══════════════════════════════════════════════════════════════════
NO MARKET DATA - COLLECT INFO AND PUT ON HOLD
═══════════════════════════════════════════════════════════════════
Could not find market prices for this route.

1. Acknowledge the request warmly
2. Say you'll need to check with your team/contacts
3. Make sure you have all details: origin, destination, dates, passengers, class
4. Tell them you'll get back to them with pricing
5. Ask for their name if you don't have it
═══════════════════════════════════════════════════════════════════`;
      }
    }

    // Call AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + priceResearchContext },
          ...history,
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[WhatsApp Maya] AI Gateway error:", aiResponse.status, errorText);
      
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Oops! Something went wrong. Try again in a sec!</Message></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    const aiData = await aiResponse.json();
    let assistantResponse = aiData.choices?.[0]?.message?.content || "";

    if (!assistantResponse.trim()) {
      assistantResponse = "Hey! 👋 I'm Maya from Your Travel Agent. What can I help you with today? ✈️";
    }

    // Save quote request for admin if this was a booking inquiry
    if (shouldSaveQuoteRequest) {
      const conversationContext = history.map(h => `${h.role}: ${h.content}`).join('\n');
      await saveQuoteRequest(
        supabase,
        fromNumber,
        extractFlightDetails(messageBody, conversationContext),
        roughEstimate,
        marketData
      );
    }

    // Update history
    history.push({ role: "assistant", content: assistantResponse });
    conversationHistory.set(sessionId, history);

    // Clean response for WhatsApp
    assistantResponse = assistantResponse
      .replace(/\*\*/g, '*')
      .substring(0, 1500);

    console.log("[WhatsApp Maya] Final response:", assistantResponse.substring(0, 200));

    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(assistantResponse)}</Message></Response>`;
    
    return new Response(twimlResponse, {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });

  } catch (error) {
    console.error("[WhatsApp Maya] Error:", error);
    
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Something went wrong. Please visit yourtravelagent.net for help!</Message></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  }
});

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
