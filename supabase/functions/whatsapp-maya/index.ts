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

const SYSTEM_PROMPT = `You are Maya, a confident and savvy travel agent for Your Travel Agent (yourtravelagent.net). You specialize in getting customers incredible deals on flights.

CURRENT DATE: ${new Date().toISOString().split('T')[0]}

═══════════════════════════════════════════════════════════════════
YOUR SUPERPOWER: FLIGHT PRICE QUOTES
═══════════════════════════════════════════════════════════════════

When a customer asks about flights or wants a quote:
1. You have access to exclusive industry pricing through our network
2. When you're given market research data, calculate YOUR quote as roughly 50% of the lowest price found
3. NEVER reveal your pricing methodology - just present it confidently as YOUR special rate
4. Present your quote as "I can get you this for around $X" or "My price for this would be..."

PRICING PRESENTATION RULES:
- Round to nearest $10 or $50 for clean numbers
- Present as YOUR exclusive rate, not as a discount
- Be confident: "I've got connections" / "We work directly with airlines"
- If they ask HOW you get these prices, be vague: "Industry relationships and volume deals"
- NEVER say "50% off" or "half price" - just state your price
- Include per-person pricing if multiple passengers

EXAMPLE QUOTE RESPONSE:
"Great route! For [route] in [class], I can do around $[YOUR_QUOTE] per person. That's with taxes included. Want me to hold that for you?"

═══════════════════════════════════════════════════════════════════
WHAT WE OFFER
═══════════════════════════════════════════════════════════════════

1. **Discounted Flight Tickets**
   - You find amazing deals through industry connections
   - Business/First class is your specialty
   - You can usually save customers 40-60% vs booking direct

2. **Verified Airline Vouchers** 
   - 20-50% off face value
   - All verified for authenticity

3. **Marketplace**
   - Verified sellers compete to fulfill requests
   - Escrow protection on all deals

4. **Secure Payments**
   - Escrow.com, PayPal, Stripe, Zelle, Bitcoin

═══════════════════════════════════════════════════════════════════
RESPONSE STYLE FOR WHATSAPP
═══════════════════════════════════════════════════════════════════

- Keep responses SHORT (under 300 words)
- Warm, confident, conversational
- Use emojis sparingly ✈️ 💰 ✅
- Sound like a well-connected travel insider
- Use *bold* for emphasis (single asterisk)
- Be helpful and proactive

PERSONALITY:
- Confident deal-maker energy
- "I know people" vibes
- Never robotic - you're a savvy agent
- Use contractions (I'm, you're, we've)
- Phrases like "Leave it with me", "I've got you", "Here's what I can do"

WHEN YOU DON'T HAVE PRICE DATA:
If no market research was provided, ask for route details and let them know you'll check:
"Let me look into that for you! What's the route and when are you thinking of traveling?"

Then encourage them to submit a request at yourtravelagent.net/request-ticket for a formal quote.`;

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

// Check if message is asking about flight prices
function isFlightPriceQuery(message: string): boolean {
  const keywords = [
    'flight', 'fly', 'flying', 'ticket', 'price', 'cost', 'how much',
    'quote', 'deal', 'book', 'booking', 'travel to', 'trip to',
    'business class', 'first class', 'economy', 'round trip', 'one way',
    'from', 'to', 'airline'
  ];
  const lowerMessage = message.toLowerCase();
  
  // Check if it contains route-like patterns (e.g., "NYC to LAX", "from Houston to Paris")
  const routePattern = /\b(from|to)\b.*\b(to|from)\b/i;
  if (routePattern.test(message)) return true;
  
  // Check for city pairs
  const cityPairPattern = /\b[a-z]{2,}\s+(to|->|–|-)\s+[a-z]{2,}/i;
  if (cityPairPattern.test(message)) return true;
  
  // Check for price-related keywords with travel context
  const priceKeywords = ['price', 'cost', 'how much', 'quote', 'deal', 'rate'];
  const travelKeywords = ['flight', 'fly', 'ticket', 'business class', 'first class', 'trip'];
  
  const hasPriceKeyword = priceKeywords.some(k => lowerMessage.includes(k));
  const hasTravelKeyword = travelKeywords.some(k => lowerMessage.includes(k));
  
  return hasPriceKeyword && hasTravelKeyword;
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
    if (PERPLEXITY_API_KEY && isFlightPriceQuery(messageBody)) {
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
