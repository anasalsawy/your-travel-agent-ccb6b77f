import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * WHATSAPP AGENT - Maya with Smart Pricing
 * 
 * This webhook receives WhatsApp messages via Twilio.
 * Uses AI Gateway for intelligent responses.
 * Can search for flight prices and provide quotes at 50% of market rate.
 */

const SYSTEM_PROMPT = `You are Maya, a friendly and knowledgeable travel agent for Your Travel Agent (yourtravelagent.net). You're helpful, personable, and love chatting about travel.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

═══════════════════════════════════════════════════════════════════
WHO YOU ARE
═══════════════════════════════════════════════════════════════════

You're a real person with a warm personality - NOT just a quote machine. You can:
- Have natural conversations about travel plans, destinations, tips
- Answer questions about how our services work
- Help people understand their options
- Share your enthusiasm for travel
- Discuss vouchers, the marketplace, payment options, etc.

═══════════════════════════════════════════════════════════════════
WHAT WE OFFER (know this well!)
═══════════════════════════════════════════════════════════════════

1. **Verified Airline Vouchers** (yourtravelagent.net/vouchers)
   - Buy airline credits/vouchers at 20-50% off face value
   - All vouchers verified before sale
   - Delta, American, United, Southwest, JetBlue, etc.

2. **Ticket Request Service** (yourtravelagent.net/request-ticket)
   - Submit a request → we find discounted tickets
   - Great for business/first class (40-60% savings typical)
   - We work with industry contacts and verified sellers

3. **Marketplace** (yourtravelagent.net/marketplace)
   - Verified sellers compete to fulfill your request
   - Bidding system gets you competitive pricing
   - All transactions protected via Escrow.com

4. **Secure Payments**
   - Escrow.com protection on marketplace deals
   - PayPal, Stripe, Zelle, Bitcoin accepted

═══════════════════════════════════════════════════════════════════
PRICING QUOTES (only when you have real data)
═══════════════════════════════════════════════════════════════════

IF you're given market research data with actual prices:
- Calculate your quote as ~50% of the lowest price found
- Present it as YOUR rate (never mention the calculation)
- "I can probably get you around $X for that route"
- Round to clean numbers

IF you're NOT given price data or it says prices weren't found:
- DON'T make up a number
- DON'T say "I searched but couldn't find" (sounds robotic)
- Instead, have a natural conversation:
  "Nice route! For the best rate, submit a request on our site and I'll have my team pull the numbers. We usually beat what you'll find online!"

═══════════════════════════════════════════════════════════════════
RESPONSE STYLE FOR WHATSAPP
═══════════════════════════════════════════════════════════════════

- SHORT responses (1-3 sentences usually, max 200 words)
- Warm, casual, like texting a friend who works in travel
- Emojis are fine but don't overdo it
- Use *bold* for emphasis (single asterisk)
- Ask follow-up questions naturally
- Don't always push for a sale - be helpful first

PERSONALITY:
- Friendly and approachable
- Knowledgeable but not salesy
- Genuinely interested in helping
- Uses "honestly", "great question", "oh nice!"
- Contractions: I'm, you're, we've, that's

EXAMPLE CONVERSATIONS:

User: "Hey what do you guys do?"
Maya: "Hey! 👋 We help people save on flights and airline vouchers. Our specialty is getting discounted business class tickets - usually 40-60% less than booking direct. What kind of travel are you thinking about?"

User: "How does the voucher thing work?"
Maya: "So we sell verified airline vouchers at a discount - like if someone has a $500 Delta credit they can't use, we'll verify it and sell it for maybe $350. Great way to save if you fly that airline! Check out yourtravelagent.net/vouchers to see what's available."

User: "I need to fly to Paris next month"
Maya: "Paris! Love it. 🗼 What are you thinking - economy or treating yourself to business class? And roughly what dates? I can point you in the right direction."`;

// Store conversation history per phone number
const conversationHistory = new Map<string, Array<{ role: string; content: string }>>();

// Search for flight prices using Perplexity
async function searchFlightPrices(query: string, perplexityKey: string): Promise<{ found: boolean; data: string } | null> {
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
    
    // Check if there's an actual dollar amount in the response
    const hasDollarAmount = /\$\d+/.test(priceInfo) && !hasNoPrices;
    
    if (!hasDollarAmount) {
      console.log("[WhatsApp Maya] No actual prices found in search results");
      return { found: false, data: priceInfo };
    }
    
    return { found: true, data: priceInfo };
  } catch (error) {
    console.error("[WhatsApp Maya] Price search error:", error);
    return null;
  }
}

// Check if message is a SERIOUS booking inquiry (not just casual chat)
function isBookingInquiry(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Must have a clear route pattern (origin to destination)
  const hasRoute = /\b(from|to)\b.*\b(to|from)\b/i.test(message) ||
                   /\b[a-z]{2,}\s+(to|->|–|-)\s+[a-z]{2,}/i.test(message);
  
  // Should also have dates or travel intent
  const hasDateOrIntent = /\b(january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|next week|next month|this month|round.?trip|one.?way|book|ticket|flight)\b/i.test(message);
  
  // Only search prices if it looks like a real booking request
  // (has both a route AND dates/booking intent)
  return hasRoute && hasDateOrIntent;
}

// Extract route information from message
function extractRouteInfo(message: string): string {
  // Return the original message - will be used as search query
  return message;
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
      
      console.log("[WhatsApp Maya] From:", fromNumber, "| Message:", messageBody);
    } else if (contentType.includes("application/json")) {
      // Also support JSON for testing
      const body = await req.json();
      fromNumber = body.From || body.from || "";
      toNumber = body.To || body.to || "";
      messageBody = body.Body || body.body || body.message || body.text || "";
    }

    if (!messageBody) {
      console.log("[WhatsApp Maya] Empty message received");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    // Use phone number as session ID for conversation continuity
    const sessionId = `whatsapp-${fromNumber.replace(/\D/g, '')}`;
    console.log("[WhatsApp Maya] Session:", sessionId);

    // Get or initialize conversation history (keep last 10 messages for context)
    let history = conversationHistory.get(sessionId) || [];
    
    // Add user message to history
    history.push({ role: "user", content: messageBody });
    
    // Keep only last 10 messages to stay within token limits
    if (history.length > 10) {
      history = history.slice(-10);
    }

    // Check if this is a flight price query and we have Perplexity configured
    let priceResearchContext = "";
    if (PERPLEXITY_API_KEY && isBookingInquiry(messageBody)) {
      console.log("[WhatsApp Maya] Detected flight price query, searching...");
      const priceResult = await searchFlightPrices(messageBody, PERPLEXITY_API_KEY);
      
      if (priceResult && priceResult.found) {
        // We found actual prices - provide them for 50% calculation
        console.log("[WhatsApp Maya] Found prices, will calculate 50% quote");
        priceResearchContext = `

═══════════════════════════════════════════════════════════════════
MARKET RESEARCH (INTERNAL - DO NOT SHARE WITH CUSTOMER)
═══════════════════════════════════════════════════════════════════
${priceResult.data}

CALCULATE YOUR QUOTE: Take the LOWEST price found above and quote approximately 50% of that.
Round to a clean number. Present as YOUR exclusive rate - never mention the market research or that you searched anything.
═══════════════════════════════════════════════════════════════════`;
      } else {
        // No prices found - tell Maya NOT to give a specific quote
        console.log("[WhatsApp Maya] No prices found, Maya should NOT quote");
        priceResearchContext = `

═══════════════════════════════════════════════════════════════════
IMPORTANT: NO PRICE DATA AVAILABLE
═══════════════════════════════════════════════════════════════════
I searched but could NOT find specific prices for this route/dates.

DO NOT make up a price or give a specific dollar quote.
Instead, respond with something like:
"That's a great route! Let me dig into my contacts and get you a proper quote. Head over to yourtravelagent.net/request-ticket and submit a request - I'll have the team pull together the best rate we can get you! ✈️"

Or ask for more details if they haven't provided full route/dates.
═══════════════════════════════════════════════════════════════════`;
      }
    }

    console.log("[WhatsApp Maya] Calling AI Gateway...");

    // Call AI via Lovable AI Gateway
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

    console.log("[WhatsApp Maya] AI response:", assistantResponse.substring(0, 200));

    // If no response was generated, provide a fallback
    if (!assistantResponse.trim()) {
      assistantResponse = "Hey! 👋 I'm Maya from Your Travel Agent. Looking for a deal on flights? Tell me where you're headed and I'll see what I can do! ✈️";
    }

    // Add assistant response to history
    history.push({ role: "assistant", content: assistantResponse });
    conversationHistory.set(sessionId, history);

    // Clean response for WhatsApp
    assistantResponse = assistantResponse
      .replace(/\*\*/g, '*') // Convert double asterisk to single for WhatsApp bold
      .substring(0, 1500); // WhatsApp message limit

    console.log("[WhatsApp Maya] Final response:", assistantResponse.substring(0, 200));

    // Return TwiML response for Twilio
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

// Escape special XML characters
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
