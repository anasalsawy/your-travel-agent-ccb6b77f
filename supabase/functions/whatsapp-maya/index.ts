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
    
    // Get or create customer by phone
    const { data: customerId } = await supabase.rpc("get_or_create_customer_by_phone", {
      p_phone: phoneNumber
    });
    console.log("[WhatsApp Maya] Customer ID:", customerId);
    
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
          customer_id: customerId, // Link to unified customer profile
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
      // Update existing conversation with phone, customer_id, and status
      const { error: updateError } = await supabase
        .from("ai_conversations")
        .update({ 
          customer_phone: phoneNumber,
          customer_id: customerId, // Link to unified customer profile
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

// Trigger fatwa callback - calls the fatwa-callback edge function
async function triggerFatwaCallback(question: string, phoneNumber: string, callerName?: string) {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    console.log("[WhatsApp Maya] 📿 Triggering fatwa callback for:", phoneNumber);
    
    const response = await fetch(`${SUPABASE_URL}/functions/v1/fatwa-callback`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        phone_number: phoneNumber,
        caller_name: callerName,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[WhatsApp Maya] Fatwa callback failed:", errorText);
      return false;
    }
    
    const data = await response.json();
    console.log("[WhatsApp Maya] ✅ Fatwa callback initiated:", data);
    return true;
  } catch (error) {
    console.error("[WhatsApp Maya] Error triggering fatwa callback:", error);
    return false;
  }
}

// Check if this is a fatwa question (Arabic religious question)
function isFatwaQuestion(message: string, fromNumber: string): boolean {
  const lowerMsg = message.toLowerCase();
  
  // Check for explicit fatwa triggers
  const fatwaKeywords = [
    "فتوى", "فتوي", "حكم", "هل يجوز", "ما حكم", "يا شيخ", "سؤال ديني",
    "حلال", "حرام", "جائز", "مباح", "مكروه", "واجب", "سنة", "فرض",
    "صلاة", "زكاة", "صيام", "حج", "عمرة", "طهارة", "وضوء", "غسل",
    "fatwa", "sheikh", "islamic", "ruling"
  ];
  
  // Check if message contains fatwa-related keywords
  for (const keyword of fatwaKeywords) {
    if (message.includes(keyword) || lowerMsg.includes(keyword)) {
      return true;
    }
  }
  
  // Check if it's primarily Arabic text (more than 50% Arabic characters)
  const arabicChars = (message.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = message.replace(/\s/g, '').length;
  const isArabic = totalChars > 0 && (arabicChars / totalChars) > 0.5;
  
  // If it's Arabic and contains question markers
  if (isArabic && (message.includes("؟") || message.includes("?"))) {
    return true;
  }
  
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const FATWA_AGENT_ID = Deno.env.get("FATWA_AGENT_ID"); // Check if fatwa service is configured
  const FATWA_TWILIO_NUMBER = Deno.env.get("FATWA_TWILIO_NUMBER"); // Dedicated fatwa phone number

  if (!ANTHROPIC_API_KEY) {
    console.error("[WhatsApp Maya] ANTHROPIC_API_KEY is not configured");
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Service temporarily unavailable. Please try again later.</Message></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Forward verification PINs to admin via WhatsApp
  async function forwardVerificationToAdmin(pin: string, fromNumber: string, originalMessage: string) {
    const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
    const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
    const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
    const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");
    
    // Get admin phone from site_settings or use a default
    let adminPhone = "+17134698336"; // Your phone number
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "admin_phone")
        .maybeSingle();
      if (data?.value) adminPhone = data.value;
    } catch (e) {
      console.log("[WhatsApp Maya] Could not fetch admin phone from settings");
    }

    console.log("[WhatsApp Maya] 🔐 Forwarding verification PIN to admin:", adminPhone);

    // Send via WhatsApp to admin
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
        const message = `🔐 VERIFICATION PIN RECEIVED\n\nPIN: ${pin}\n\nFrom: ${fromNumber}\n\nOriginal message:\n"${originalMessage}"\n\nThis is likely for Facebook/Meta verification.`;
        
        const formattedAdmin = adminPhone.includes("whatsapp:") ? adminPhone : `whatsapp:${adminPhone}`;
        const formattedFrom = TWILIO_PHONE_NUMBER.includes("whatsapp:") ? TWILIO_PHONE_NUMBER : `whatsapp:${TWILIO_PHONE_NUMBER}`;
        
        const response = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: formattedFrom,
            To: formattedAdmin,
            Body: message,
          }),
        });
        
        if (response.ok) {
          console.log("[WhatsApp Maya] ✅ PIN forwarded to admin via WhatsApp");
        } else {
          console.error("[WhatsApp Maya] Failed to forward PIN:", await response.text());
        }
      } catch (e) {
        console.error("[WhatsApp Maya] Error forwarding PIN:", e);
      }
    }

    // Also send via email if RESEND is configured
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY && ADMIN_EMAIL) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Maya <maya@yourtravelagent.net>",
            to: [ADMIN_EMAIL],
            subject: "🔐 WhatsApp Verification PIN Received",
            html: `
              <h2>Verification PIN Received</h2>
              <p><strong>PIN: ${pin}</strong></p>
              <p>From: ${fromNumber}</p>
              <p>Original message: "${originalMessage}"</p>
              <p>This is likely for Facebook/Meta WhatsApp verification.</p>
            `,
          }),
        });
        
        if (response.ok) {
          console.log("[WhatsApp Maya] ✅ PIN forwarded to admin via email");
        }
      } catch (e) {
        console.error("[WhatsApp Maya] Error sending email:", e);
      }
    }
  }

  // Check if message contains a verification PIN
  function isVerificationMessage(message: string): { isVerification: boolean; pin: string | null } {
    const lowerMsg = message.toLowerCase();
    
    // Common patterns for verification PINs from Facebook/Meta
    const patterns = [
      /(?:verification|verify|code|pin|otp)[\s:]*(\d{4,8})/i,
      /(\d{4,8})[\s]*(?:is your|is the|verification|code|pin)/i,
      /facebook[\s\S]*?(\d{4,8})/i,
      /meta[\s\S]*?(\d{4,8})/i,
      /whatsapp[\s\S]*?(\d{4,8})/i,
      /^\s*(\d{4,8})\s*$/,  // Just a PIN by itself
    ];
    
    // Check if it looks like a verification message
    const isFromMeta = lowerMsg.includes("facebook") || 
                       lowerMsg.includes("meta") || 
                       lowerMsg.includes("verification") ||
                       lowerMsg.includes("verify") ||
                       lowerMsg.includes("code") ||
                       /^\d{4,8}$/.test(message.trim());
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return { isVerification: true, pin: match[1] };
      }
    }
    
    // If it's just numbers (4-8 digits), treat as potential PIN
    const justNumbers = message.trim().match(/^(\d{4,8})$/);
    if (justNumbers) {
      return { isVerification: true, pin: justNumbers[1] };
    }
    
    return { isVerification: false, pin: null };
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let fromNumber = "";
    let toNumber = "";
    let messageBody = "";

    console.log("[WhatsApp Maya] Content-Type:", contentType);

    // Twilio sends form-urlencoded data
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      
      // Log ALL fields Twilio sends for debugging
      const allFields: Record<string, string> = {};
      for (const [key, value] of formData.entries()) {
        allFields[key] = String(value);
      }
      console.log("[WhatsApp Maya] ALL FORM FIELDS:", JSON.stringify(allFields));
      
      fromNumber = formData.get("From") as string || "";
      toNumber = formData.get("To") as string || "";
      // Try multiple possible body fields
      messageBody = formData.get("Body") as string || 
                    formData.get("SmsBody") as string || 
                    formData.get("body") as string ||
                    formData.get("text") as string || "";
      
      // Check for MMS media
      const numMedia = parseInt(formData.get("NumMedia") as string || "0", 10);
      if (numMedia > 0) {
        console.log("[WhatsApp Maya] MMS with", numMedia, "media attachments");
        for (let i = 0; i < numMedia; i++) {
          console.log(`[WhatsApp Maya] Media ${i}:`, formData.get(`MediaUrl${i}`));
        }
      }
      
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

    // Get admin phone number
    let adminPhone = "+17134698336";
    try {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "admin_phone")
        .maybeSingle();
      if (data?.value) adminPhone = data.value;
    } catch (e) {
      console.log("[WhatsApp Maya] Could not fetch admin phone");
    }
    
    // Normalize phone numbers for comparison
    const normalizedFrom = fromNumber.replace(/\D/g, '');
    const normalizedAdmin = adminPhone.replace(/\D/g, '');
    const isFromAdmin = normalizedFrom === normalizedAdmin || normalizedFrom.endsWith(normalizedAdmin) || normalizedAdmin.endsWith(normalizedFrom);
    
    console.log("[WhatsApp Maya] Is from admin?", isFromAdmin, "From:", normalizedFrom, "Admin:", normalizedAdmin);

    // 📿 CHECK FOR FATWA FIRST - Before any other routing!
    // Messages to the dedicated fatwa number ALWAYS go to fatwa service, regardless of sender
    const normalizedTo = toNumber.replace(/\D/g, '');
    const normalizedFatwaNumber = FATWA_TWILIO_NUMBER?.replace(/\D/g, '') || '';
    const isFatwaNumber = normalizedFatwaNumber && (normalizedTo === normalizedFatwaNumber || normalizedTo.endsWith(normalizedFatwaNumber) || normalizedFatwaNumber.endsWith(normalizedTo));
    
    console.log("[WhatsApp Maya] Fatwa number check - To:", normalizedTo, "Fatwa:", normalizedFatwaNumber, "Match:", isFatwaNumber);
    
    // Route to fatwa service ONLY if message was sent to the dedicated fatwa number
    if (FATWA_AGENT_ID && messageBody && isFatwaNumber) {
      console.log("[WhatsApp Maya] 📿 FATWA REQUEST - Message sent to dedicated fatwa number:", toNumber);
      
      const callbackSuccess = await triggerFatwaCallback(messageBody, fromNumber);
      
      if (callbackSuccess) {
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>السلام عليكم ورحمة الله وبركاته 📿

تم استلام سؤالك بنجاح. سيتصل بك الشيخ صلاح الصبي قريباً للإجابة على سؤالك ومناقشته معك بالتفصيل إن شاء الله.

جزاك الله خيراً على سؤالك.</Message></Response>`,
          { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
        );
      } else {
        // Fallback message if callback fails
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>السلام عليكم 📿

عذراً، حدث خطأ في ترتيب المكالمة. يرجى المحاولة مرة أخرى لاحقاً أو الاتصال مباشرة.</Message></Response>`,
          { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
        );
      }
    }

    // 🔓 AUTO-BOSS MODE FOR OWNER - If message is from admin phone, enable boss mode immediately
    // No PIN required - the phone number IS the verification
    if (isFromAdmin && messageBody && !messageBody.toLowerCase().startsWith("pin:")) {
      console.log("[WhatsApp Maya] 👑 OWNER DETECTED - Auto-enabling boss mode for:", fromNumber);
      
      // Check if this is a quote reply (contains specific patterns) or just a regular boss message
      const isQuoteReply = /^\$?\d+|quote|price|offer|deal/i.test(messageBody.trim().split(' ')[0]);
      
      // Find the most recent pending quote request ONLY if this looks like a quote reply
      if (isQuoteReply) {
        const { data: pendingAlert } = await supabase
          .from("admin_alerts")
          .select("id, conversation_id, customer_context")
          .eq("alert_type", "quote_request")
          .is("admin_response", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (pendingAlert) {
          // Get the customer's phone from the conversation
          const { data: conversation } = await supabase
            .from("ai_conversations")
            .select("customer_phone, session_id")
            .eq("id", pendingAlert.conversation_id)
            .single();
          
          if (conversation?.customer_phone) {
            const customerPhone = conversation.customer_phone;
            console.log("[WhatsApp Maya] 📤 Sending quote to customer:", customerPhone);
            
            // Send quote to customer via WhatsApp
            const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
            const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
            const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
            
            if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER) {
              const quoteMessage = `Hey! Great news! 🎉\n\n${messageBody}\n\nWant to proceed? Just reply here or visit yourtravelagent.net to book!\n\n- Maya ✈️`;
              
              const formattedCustomer = customerPhone.includes("whatsapp:") ? customerPhone : `whatsapp:${customerPhone}`;
              const formattedFrom = TWILIO_PHONE_NUMBER.includes("whatsapp:") ? TWILIO_PHONE_NUMBER : `whatsapp:${TWILIO_PHONE_NUMBER}`;
              
              const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
              const twilioResponse = await fetch(twilioUrl, {
                method: "POST",
                headers: {
                  "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  From: formattedFrom,
                  To: formattedCustomer,
                  Body: quoteMessage,
                }),
              });
              
              if (twilioResponse.ok) {
                console.log("[WhatsApp Maya] ✅ Quote sent to customer successfully!");
                
                // Update the alert and conversation
                await supabase
                  .from("admin_alerts")
                  .update({
                    admin_response: messageBody,
                    responded_at: new Date().toISOString(),
                    is_read: true,
                  })
                  .eq("id", pendingAlert.id);
                
                await supabase
                  .from("ai_conversations")
                  .update({ status: "quote_delivered", needs_admin_attention: false })
                  .eq("id", pendingAlert.conversation_id);
                
                // Also add to conversation history so Maya knows the quote was delivered
                const sessionId = conversation.session_id;
                let history = conversationHistory.get(sessionId) || [];
                history.push({ role: "assistant", content: `I sent the customer this quote: "${messageBody}"` });
                conversationHistory.set(sessionId, history);
                
                return new Response(
                  `<?xml version="1.0" encoding="UTF-8"?><Response><Message>✅ Quote sent to ${customerPhone}!</Message></Response>`,
                  { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
                );
              } else {
                const errorText = await twilioResponse.text();
                console.error("[WhatsApp Maya] Failed to send quote:", errorText);
                return new Response(
                  `<?xml version="1.0" encoding="UTF-8"?><Response><Message>❌ Failed to send quote. Error: ${errorText.substring(0, 100)}</Message></Response>`,
                  { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
                );
              }
            }
          }
        }
      }
      
      // Not a quote reply - route to DEV AGENT (the boss's right-hand man)
      const bossSessionId = `whatsapp-boss-${normalizedFrom}`;
      
      // Get or create conversation with owner_verified = true
      let { data: bossConvo } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("session_id", bossSessionId)
        .maybeSingle();
      
      if (!bossConvo) {
        const { data: newBossConvo } = await supabase
          .from("ai_conversations")
          .insert({
            session_id: bossSessionId,
            customer_phone: fromNumber,
            owner_verified: true,
            status: "owner_mode"
          })
          .select("id")
          .single();
        bossConvo = newBossConvo;
        console.log("[WhatsApp Maya] 👑 Created new boss mode conversation:", bossConvo?.id);
      } else {
        await supabase
          .from("ai_conversations")
          .update({ owner_verified: true, status: "owner_mode" })
          .eq("id", bossConvo.id);
      }
      
      // Load recent conversation history for context continuity
      let recentMessages: Array<{ role: string; content: string }> = [];
      if (bossConvo?.id) {
        const { data: prevMsgs } = await supabase
          .from("ai_chat_messages")
          .select("role, content")
          .eq("conversation_id", bossConvo.id)
          .order("created_at", { ascending: false })
          .limit(10);
        if (prevMsgs && prevMsgs.length > 0) {
          recentMessages = prevMsgs.reverse().map((m: any) => ({ role: m.role, content: m.content }));
        }
      }
      
      // Forward to DEV AGENT with full conversation context
      try {
        const devAgentResponse = await fetch(`${SUPABASE_URL}/functions/v1/dev-agent`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              ...recentMessages,
              { role: "user", content: messageBody }
            ],
          }),
        });
        
        const devResult = await devAgentResponse.json();
        let response = devResult?.content || "";
        
        // Format action log as a compact summary for WhatsApp
        const actionLog = devResult?.action_log || [];
        let actionSummary = "";
        if (actionLog.length > 0) {
          const logLines = actionLog.map((a: any) => `${a.success ? '✅' : '❌'} ${a.tool}: ${a.args_summary}`);
          actionSummary = `\n\n🔧 _Actions:_\n${logLines.join('\n')}`;
        }
        
        // Strip markdown for WhatsApp
        response = response
          .replace(/\*\*/g, '*')
          .replace(/#{1,6}\s/g, '')
          .replace(/`{3}[\s\S]*?`{3}/g, '[code block]')
          .replace(/`([^`]+)`/g, '$1')
          .trim();
        
        // WhatsApp 1600 char limit - leave room for action summary
        const maxContentLen = 1500 - actionSummary.length;
        if (response.length > maxContentLen) {
          response = response.substring(0, maxContentLen - 3) + '...';
        }
        
        response = response + actionSummary;
        
        if (response) {
          // Save to conversation history
          if (bossConvo?.id) {
            await supabase.from("ai_chat_messages").insert([
              { conversation_id: bossConvo.id, role: "user", content: messageBody, metadata: { channel: "whatsapp", phone: fromNumber, is_owner: true } },
              { conversation_id: bossConvo.id, role: "assistant", content: response, metadata: { channel: "whatsapp", agent: "dev-agent", owner_mode: true } }
            ]);
          }
          
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?><Response><Message>🤖 ${response}</Message></Response>`,
            { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
          );
        }
      } catch (error) {
        console.error("[WhatsApp Maya] Dev Agent error:", error);
      }
      
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>🤖 Hey boss! I'm here but hit a snag processing that. Try again?</Message></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    // 🔐 CHECK FOR VERIFICATION PINS
    const verificationCheck = isVerificationMessage(messageBody);
    if (verificationCheck.isVerification && verificationCheck.pin) {
      console.log("[WhatsApp Maya] 🔐 VERIFICATION PIN DETECTED:", verificationCheck.pin);
      
      // Forward to admin immediately
      await forwardVerificationToAdmin(verificationCheck.pin, fromNumber, messageBody);
      
      // Return acknowledgment
      return new Response(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Got it! I've forwarded this verification code to the admin. 👍</Message></Response>`,
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    if (!messageBody) {
      console.log("[WhatsApp Maya] Empty message received, fromNumber:", fromNumber);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
      );
    }

    const sessionId = `whatsapp-${fromNumber.replace(/\D/g, '')}`;
    console.log("[WhatsApp] Session:", sessionId);

    // ========== UNIFIED CUSTOMER LINKING ==========
    const { data: customerId } = await supabase.rpc("get_or_create_customer_by_phone", {
      p_phone: fromNumber
    });
    console.log("[WhatsApp] Customer ID:", customerId);
    
    // Find or create conversation
    let { data: conversation } = await supabase
      .from("ai_conversations")
      .select("id, customer_id")
      .eq("session_id", sessionId)
      .maybeSingle();
    
    if (!conversation) {
      const { data: newConv } = await supabase
        .from("ai_conversations")
        .insert({
          session_id: sessionId,
          customer_phone: fromNumber,
          customer_id: customerId
        })
        .select("id, customer_id")
        .single();
      conversation = newConv;
    } else if (!conversation.customer_id && customerId) {
      await supabase.rpc("link_conversation_to_customer", {
        p_conversation_id: conversation.id,
        p_customer_id: customerId
      });
    }
    
    const conversationId = conversation?.id;

    // Load recent conversation history for context
    let recentMessages: Array<{ role: string; content: string }> = [];
    if (conversationId) {
      const { data: prevMsgs } = await supabase
        .from("ai_chat_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (prevMsgs && prevMsgs.length > 0) {
        recentMessages = prevMsgs.reverse().map((m: any) => ({ role: m.role, content: m.content }));
      }
    }

    // ALL messages go to DEV AGENT now
    console.log("[WhatsApp] 🤖 Routing to Dev Agent for:", fromNumber);
    
    try {
      const devAgentResponse = await fetch(`${SUPABASE_URL}/functions/v1/dev-agent`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            ...recentMessages,
            { role: "user", content: messageBody }
          ],
        }),
      });
      
      const devResult = await devAgentResponse.json();
      let response = devResult?.content || "";
      
      // Format action log as a compact summary for WhatsApp
      const actionLog = devResult?.action_log || [];
      let actionSummary = "";
      if (actionLog.length > 0) {
        const logLines = actionLog.map((a: any) => `${a.success ? '✅' : '❌'} ${a.tool}: ${a.args_summary}`);
        actionSummary = `\n\n🔧 _Actions:_\n${logLines.join('\n')}`;
      }
      
      // Strip markdown for WhatsApp
      response = response
        .replace(/\*\*/g, '*')
        .replace(/#{1,6}\s/g, '')
        .replace(/`{3}[\s\S]*?`{3}/g, '[code block]')
        .replace(/`([^`]+)`/g, '$1')
        .trim();
      
      // WhatsApp 1600 char limit
      const maxContentLen = 1500 - actionSummary.length;
      if (response.length > maxContentLen) {
        response = response.substring(0, maxContentLen - 3) + '...';
      }
      
      response = response + actionSummary;
      
      if (response) {
        // Save to conversation history
        if (conversationId) {
          await supabase.from("ai_chat_messages").insert([
            { conversation_id: conversationId, role: "user", content: messageBody, metadata: { channel: "whatsapp", phone: fromNumber } },
            { conversation_id: conversationId, role: "assistant", content: response, metadata: { channel: "whatsapp", agent: "dev-agent" } }
          ]);
        }
        
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><Response><Message>🤖 ${escapeXml(response)}</Message></Response>`,
          { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
        );
      }
    } catch (error) {
      console.error("[WhatsApp] Dev Agent error:", error);
    }
    
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>🤖 Hit a snag processing that. Try again?</Message></Response>`,
      { headers: { ...corsHeaders, "Content-Type": "text/xml" } }
    );

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
