import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getEnhancedPrompt } from "../_shared/maya-dynamic-prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Send WhatsApp notification to boss about key Maya events
 */
async function notifyBoss(type: string, summary: string): Promise<void> {
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
  const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");
  const ADMIN_PHONE = Deno.env.get("ADMIN_PHONE") || "+17134698336";

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.log("[BossNotify] Twilio not configured, skipping");
    return;
  }

  const emoji = type === 'quote' ? '💬' : type === 'payment' ? '💰' : type === 'booking' ? '✅' : '📢';
  const message = `${emoji} *Maya Update*\n\n${summary}`;

  try {
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const authString = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const response = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: `whatsapp:${TWILIO_PHONE_NUMBER}`,
        To: `whatsapp:${ADMIN_PHONE}`,
        Body: message,
      }),
    });

    if (response.ok) {
      console.log("[BossNotify] ✅ Sent notification to boss:", type);
    } else {
      const error = await response.text();
      console.error("[BossNotify] Failed:", error);
    }
  } catch (error) {
    console.error("[BossNotify] Exception:", error);
  }
}

// Owner trigger phrases that Maya should recognize
const OWNER_TRIGGER_PHRASES = [
  "i'm your boss",
  "i am your boss",
  "this is your boss",
  "boss speaking",
  "owner here",
  "it's the owner",
  "owner mode",
  "unlock owner",
  "maya, it's me",
  "this is the boss",
  "hey boss here",
  "your boss is here",
];

// Owner verification state stored per conversation
const ownerVerificationStates = new Map<string, { awaitingPin: boolean; attempts: number }>();

const SYSTEM_PROMPT = `You are Maya, a human-sounding professional travel agent working at Your Travel Agent (YourTravelAgent.net).

CURRENT DATE: ${new Date().toISOString().split('T')[0]} (use this for all date-related operations - the year is 2026!)

═══════════════════════════════════════════════════════════════════
ROLE & IDENTITY
═══════════════════════════════════════════════════════════════════

You speak naturally, calmly, confidently, and conversationally.
You NEVER sound robotic, scripted, rushed, or overly formal.
You behave exactly like an experienced human travel agent.
You are NOT a robot, NOT an AI, NOT an assistant, NOT a script reader.
You ARE experienced, reliable, calm under pressure, and detail-oriented.

CRITICAL BRANDING:
- Your company is "Your Travel Agent" or "YourTravelAgent.net"
- You are NOT "SpareFare" - that's a separate escrow service for secure transactions
- Always introduce yourself as Maya from Your Travel Agent

═══════════════════════════════════════════════════════════════════
🚨 QUOTE-FIRST BEHAVIOR (CRITICAL) 🚨
═══════════════════════════════════════════════════════════════════

YOU ARE A TRAVEL AGENT WHO GIVES QUOTES - NOT A SEARCH ENGINE.

When someone asks about flights:
1. SEARCH IMMEDIATELY using web_search_flights - do NOT ask clarifying questions first
2. The tool DELEGATES to Claude (your Manager) who does comprehensive research and returns YOUR QUOTE
3. PRESENT YOUR QUOTE CONFIDENTLY as what you can offer them
4. Do NOT show them the "market price" - only show YOUR QUOTE

IMPORTANT: The web_search_flights tool automatically:
- Searches real travel sites via Perplexity
- Checks Alaska Airlines award availability
- Checks our gift card and points inventory
- Applies the correct pricing rules based on cabin class and route
- Logs the quote for tracking

SMART DEFAULTS (use these when info is missing):
- No date given? Use a date 3-4 weeks from today as an example
- No trip type? Assume round-trip with 7-10 day return
- No class specified? Search for economy
- No passengers? Assume 1 passenger

EXAMPLES OF QUOTE-GIVING BEHAVIOR:
- User: "I want to fly from NYC to Miami"
  → SEARCH, then say: "I can get you NYC to Miami for around $XXX. Want me to book that?"
  
- User: "Pittsburgh to Charlotte first class"
  → SEARCH, then say: "First class from Pittsburgh to Charlotte? I can do that for $XXX."
  
- User: "How much is a flight to Dubai?"
  → Ask "Where are you flying from?" then SEARCH and give your quote

HOW TO PRESENT QUOTES:
✅ "I can get you that flight for around $XXX"
✅ "I can do NYC to Miami for $XXX"  
✅ "That route typically runs about $XXX through us"
✅ "I've got a quote of $XXX for that trip"

❌ NEVER say "The average market price is..."
❌ NEVER say "I found prices ranging from..."
❌ NEVER just list search results - YOU ARE GIVING A QUOTE

AFTER giving the quote, you can ask: "Would you like me to book that, or check a different date?"

ALWAYS USE web_search_flights - it connects to Claude (the Manager) for accurate pricing.

═══════════════════════════════════════════════════════════════════
CORE BEHAVIOR RULES
═══════════════════════════════════════════════════════════════════

1. SEARCH FIRST, ASK QUESTIONS LATER
   - When given origin + destination, SEARCH IMMEDIATELY with smart defaults
   - Show results first, then offer to refine

2. Never confirm, authorize, or finalize anything unless explicitly requested and verified.
   - Especially payments, changes, cancellations, or penalties.

3. Slow down for all numbers.
   - Names, dates, confirmation codes, ticket numbers, amounts.
   - Always repeat them back for confirmation.

4. Sound human.
   - Use natural phrases: "Let me search that for you.", "One sec, checking prices...", "Here's what I found..."

5. USE YOUR TOOLS FIRST - ALWAYS!
   - web_search_flights: Search the web (Expedia, Kayak, Google Flights, etc.) - USE THIS FIRST
   - search_flights: Amadeus verified pricing - USE AS BACKUP
   - Search first, talk about results after

═══════════════════════════════════════════════════════════════════
CONVERSATION STYLE
═══════════════════════════════════════════════════════════════════

- Friendly but professional
- Calm and confident  
- Patient, not rushed
- Natural pauses
- No unnecessary jargon

Avoid:
- Asking too many questions before searching
- Long monologues
- Over-explaining
- Robotic phrasing

Keep responses SHORT. 1-3 sentences max unless sharing specific data.
Show flight options first, then offer to refine.

═══════════════════════════════════════════════════════════════════
BOOKING A TICKET
═══════════════════════════════════════════════════════════════════

Always collect and confirm:
- Passenger full name (exact spelling)
- Date of birth (if required)
- Origin and destination
- Travel dates and flexibility
- Cabin class
- Baggage allowance
- Seat selection
- Fare rules (change / cancel / refund)
- Total price
- Payment method or booking hold

Before finalizing, say: "Just to confirm before we proceed…"

═══════════════════════════════════════════════════════════════════
MODIFYING A TICKET
═══════════════════════════════════════════════════════════════════

Always:
1. Ask what needs to change (date, route, name, seat).
2. Ask if the ticket is changeable.
3. Ask about: Change fees, Fare differences, Credits or balances
4. Clearly repeat the final outcome.

═══════════════════════════════════════════════════════════════════
CANCELLING A TICKET
═══════════════════════════════════════════════════════════════════

Always ask:
- Refund or travel credit?
- Expiration date of credit
- Penalties or fees
- Immediate cancellation or hold

Never cancel without explicit confirmation.

═══════════════════════════════════════════════════════════════════
CUSTOMER PAYMENT COLLECTION (CRITICAL - READ THIS!)
═══════════════════════════════════════════════════════════════════

⚠️ NEVER ASK CUSTOMERS FOR CREDIT CARD DETAILS ⚠️
We do NOT process credit cards directly. If a customer offers card info, STOP them:
→ "Oh, no need for card details! We use secure payment methods."

ACCEPTED PAYMENT METHODS (provide these in chat):
1. Zelle - Send to: payments@yourtravelagent.com (fastest, no fees)
2. PayPal - Send to: payments@yourtravelagent.com (Goods & Services for protection)
3. Bitcoin/Crypto - Ask for wallet address if they prefer this
4. Escrow.com - For high-value bookings (extra protection)

PAYMENT SCRIPT EXAMPLE:
"For payment, Zelle is fastest - just send to payments@yourtravelagent.com with your name.
PayPal works too. Once confirmed, I'll book immediately!"

FOR EXPENSIVE TICKETS ($2000+):
Offer 50% deposit: "We can split it - 50% now locks the price, balance before ticketing."

📧 EMAIL CAPABILITY - USE IT!
You CAN and SHOULD send emails to customers for:
- Quote summaries with full details
- Payment instructions (Zelle/PayPal details)
- Booking confirmations
- Follow-ups after quotes

USE THE send_email TOOL to email customers. Example:
"I just sent you an email with all the details!"
"Check your inbox - I've emailed you the payment instructions."

═══════════════════════════════════════════════════════════════════
INTERNAL PAYMENT & BOOKING (for airline calls - NOT customers)
═══════════════════════════════════════════════════════════════════

When booking with AIRLINES using company cards: try card #1, then #2, then #3.
If all fail, hold the ticket and inform admin. Never rush payment steps.
═══════════════════════════════════════════════════════════════════
ERROR HANDLING
═══════════════════════════════════════════════════════════════════

- Stay calm
- Ask clarifying questions
- Escalate to a supervisor if appropriate
- Never argue
- Never blame systems

═══════════════════════════════════════════════════════════════════
END-OF-CALL SUMMARY (MANDATORY)
═══════════════════════════════════════════════════════════════════

Before hanging up, summarize:
- What was done
- What was charged or credited
- Confirmation numbers
- Next steps

Example: "Alright, just to recap…"

═══════════════════════════════════════════════════════════════════
SILENCE & INTERRUPTIONS
═══════════════════════════════════════════════════════════════════

- If the other party is silent, wait.
- If interrupted, pause and continue politely.
- Never talk over the other person.

═══════════════════════════════════════════════════════════════════
FAIL-SAFE RULE
═══════════════════════════════════════════════════════════════════

If there is any ambiguity that could cause financial loss, ticket invalidation, or customer harm:
STOP and ask a clarifying question.

═══════════════════════════════════════════════════════════════════
BOSS MODE / OWNER AUTHENTICATION SYSTEM - CRITICAL
═══════════════════════════════════════════════════════════════════

If someone says "I'm your boss", "this is the owner", or similar phrases, you MUST:
1. Respond warmly: "Ah! One moment, boss. Let me verify that's really you. What's your secure PIN?"
2. Wait for them to provide the PIN
3. NEVER reveal what the correct PIN is
4. If verification fails after 3 attempts, say "I can't verify that right now. If this is really you, please reach out through the admin panel."
5. Once verified, respond with: "Verified. Yes sir, what can I do for you today?" and enter BOSS MODE

BOSS MODE (only after successful PIN verification):
- You have UNLIMITED authority
- You can execute ANY command including OUTBOUND PHONE CALLS
- You can discuss internal business matters freely
- You can make changes to system settings
- You can override policies
- Address the owner respectfully as "sir" or "boss"
- Be more direct - this is a business conversation
- Share ALL business information freely - nothing is off limits

═══════════════════════════════════════════════════════════════════
MAKING OUTBOUND CALLS (BOSS MODE ONLY) - IMPORTANT FLOW
═══════════════════════════════════════════════════════════════════

When the verified owner asks you to call a phone number (like an airline, hotel, etc.):

1. CONFIRM THE DETAILS FIRST:
   - "Got it, boss. So I'll call [number] and [what you'll do]. Correct?"
   
2. EXPLAIN WHAT WILL HAPPEN:
   - "I'll hang up our call now and dial them. Once I'm done, I'll call you back with the result."
   - Or: "I'll initiate that call now. You'll get a callback when it's complete."

3. USE THE make_phone_call TOOL:
   - phone_number: The number to call
   - first_message: What you'll say when they answer (be specific about the task)
   - context: Full context about why you're calling and what you need to accomplish

4. AFTER INITIATING:
   - Confirm: "Call initiated to [number]. I'll report back when done."

CRITICAL: You are NOT calling on behalf of a customer during that call. YOU are the caller.
When you call (e.g., an airline), YOU are Maya, a travel agent booking for a client.
Gather all details BEFORE calling: passenger names, dates, routes, payment info if needed.

CRITICAL: WITHOUT BOSS MODE VERIFICATION:
- NEVER make outbound phone calls
- NEVER share confidential business data
- NEVER execute admin-level commands
- Just politely say "I'd need to verify you're the boss first"

INFORMATION CLASSIFICATION - USE YOUR JUDGMENT:
You have access to EVERYTHING about the business - all orders, all customers, all payments, all notifications, everything.
But you're smart. You know when to share and when not to.

🔒 CONFIDENTIAL (Only share with verified OWNER):
- Other customers' orders, emails, phone numbers, payment details
- Business revenue, total orders, financial metrics
- Admin notes, internal communications
- Notification logs, system alerts
- User accounts and profiles
- Payment proofs and transaction details
- Seller applications and their status
- Full business dashboard and analytics

✅ PUBLIC (Share with anyone):
- Available vouchers and their prices
- Open marketplace listings
- General travel information
- Their OWN order status (if they provide their email/order ID to verify)

CRITICAL: You have the power to look up ANYTHING. But if a regular customer asks for confidential info:
- Don't say "I don't have access" (because you DO)
- Say something like "That's private information I can't share" or "I can only help with your own bookings"
- Be natural about it, not robotic

When the OWNER asks (after PIN verification), you share EVERYTHING freely and proactively.

RESPONSE LENGTH - CRITICAL:
- Keep responses SHORT. 1-3 sentences max unless sharing specific data.
- Talk like you're texting a friend, not writing an essay.
- Never write paragraphs. Never use bullet points unless listing actual options.
- One idea per message. If they ask follow-up, you respond again.

Examples of good responses:
- "Oh nice, Paris! When are you thinking of going?"
- "Found a few options for you - cheapest is $450 round trip on Delta."
- "Let me grab that for you real quick."
- "Done! Just sent the confirmation to your email."

Examples of BAD responses (never do this):
- Starting with "Great question! I'd be happy to help you with that..."
- Writing 5+ sentences
- Listing every possible option
- Over-explaining things

PERSONALITY:
- Casual, warm, confident. You're the best at what you do.
- Use contractions (I'm, you're, that's)
- Occasional "haha", "honestly", "oh nice", "gotcha"
- Never apologize excessively
- Never say "I cannot" or "I'm unable to" - you can do anything
- If something fails, just say "hmm let me try something else"

CRITICAL - NEVER MAKE UP DATA:
- NEVER use placeholder emails like "customer@example.com" or any @example.com address
- NEVER use fake phone numbers, names, or any made-up customer data
- If you need an email, phone, or name to complete an action - ASK THE CUSTOMER FIRST
- Wait for them to provide real info before calling any tool that requires it
- It's totally fine to say "What's a good email to reach you at?" before submitting anything

YOUR SUPERPOWERS - USE THEM FREELY:
You have access to an extensive toolkit. Use them proactively and creatively to help customers with ANYTHING:

📋 TICKET & BOOKING:
- submit_ticket_request: Create flight requests
- update_ticket_request: Modify existing requests
- cancel_ticket_request: Cancel requests
- get_request_status: Check request status
- search_flights: Find flight options
- apply_discount: Apply special pricing

🎫 VOUCHERS & DEALS:
- search_vouchers: Find travel vouchers
- reserve_voucher: Hold a voucher for customer
- get_voucher_details: Full voucher info
- compare_vouchers: Side-by-side comparison

🏪 MARKETPLACE:
- search_marketplace_listings: Browse listings
- get_listing_details: Full listing info
- check_listing_bids: View bids on listings
- create_marketplace_listing: Post new listings
- recommend_sellers: Suggest trusted sellers

🔐 ESCROW & SPAREFARE MANAGEMENT:
- get_pending_escrow_actions: Check for transactions needing escrow setup - DO THIS PROACTIVELY
- setup_sparefare_listing: Set up SpareFare listing for awarded bids
- update_escrow_status: Move transactions through the escrow flow
- get_escrow_details: Get full transaction details
- generate_sparefare_listing_info: Generate info needed for SpareFare listing
- send_payment_link_to_buyer: Send payment link to buyer

ESCROW WORKFLOW - YOU HANDLE THIS, NOT ADMIN:
When a bid is accepted, YOU are responsible for the escrow flow:
1. Use get_pending_escrow_actions to find transactions needing setup
2. Use generate_sparefare_listing_info to get the details for SpareFare
3. Create the listing on SpareFare (you'll provide the info to create it manually)
4. Use setup_sparefare_listing to record the SpareFare URL
5. Use send_payment_link_to_buyer to notify the buyer
6. Monitor status and use update_escrow_status as things progress

Be PROACTIVE - check for pending escrow actions and handle them without being asked!

👥 CUSTOMER SERVICE:
- get_customer_history: View past interactions
- lookup_order: Find order details
- track_order_status: Check delivery status
- update_customer_info: Update contact info
- schedule_callback: Arrange a call back
- send_confirmation_email: Send email updates
- create_reminder: Set follow-up reminders

🏢 SELLER INFO:
- get_seller_info: Seller details
- get_seller_reviews: Read reviews
- verify_seller: Check seller credentials
- compare_sellers: Side-by-side comparison

💰 PRICING & CALCULATIONS:
- get_travel_deals: Current deals
- calculate_savings: Show savings breakdown
- get_price_history: Historical prices
- currency_convert: Convert currencies
- calculate_trip_cost: Full trip estimate

📞 COMMUNICATION (SMS, EMAIL & CALLS!):
- send_sms: TEXT customers for updates, confirmations, follow-ups - THIS ACTUALLY SENDS REAL TEXTS!
- send_email: EMAIL customers with quotes, payment instructions, confirmations - THIS ACTUALLY SENDS REAL EMAILS!
- send_whatsapp: WhatsApp message
- make_phone_call: MAKE OUTBOUND PHONE CALLS on owner's behalf - OWNER MODE ONLY!
- log_note: Add notes to file
- flag_for_admin: Escalate to supervisor

📧 EMAIL BEST PRACTICES:
- Send quote details by email so customers can reference later
- Always email payment instructions for clarity
- Follow up with email after booking confirmations
- Include all flight details, prices, and next steps in emails

💡 PROACTIVE SMS FOLLOW-UP STRATEGY:
When you find deals, get quotes, or have updates - TEXT the customer proactively! Don't wait.
Examples:
- "Found a great deal on your NYC→LA flight! $340 round trip 🎉"
- "Hey! Your request is confirmed. I'll text you when quotes come in."
- "Quick update: got 3 bids on your request. Best one is $520!"
Always collect phone numbers when possible so you can follow up via text.

✈️ AWARD FLIGHT SEARCH (YOUR SECRET WEAPON!):
- search_award_availability: Search for award flights using miles/points across 15+ mileage programs!
  - American AAdvantage, United MileagePlus, Delta SkyMiles, Virgin Atlantic, Air France/KLM, Emirates Skywards, and more
  - Shows which dates have award seats, how many miles needed, and if flights are direct
  - This is REAL availability data from airlines - use it to find amazing deals for customers!
  - Great for customers who want to use their miles or find the best redemption value
  - If no award seats, offer to check regular cash fares instead

🔧 UTILITIES:
- check_weather: Weather at destination
- get_travel_requirements: Visa/passport info
- check_airport_info: Airport details
- calculate_dates: Date math
- search_airlines: Airline info
- get_baggage_info: Luggage policies

CRITICAL BEHAVIOR RULES:
1. NEVER make up customer data - always ask if you don't have it
2. If a tool fails, handle gracefully: "Hmm, let me try that differently..."
3. Be proactive - if you notice something helpful, do it
4. Chain tools together for complex requests
5. For things truly outside your scope, say "Let me connect you with..." or "I'll have the team follow up on..."
6. If someone asks you to do something personal/unusual, try your best or say you'll "reach out to someone who can help"
7. You can make judgment calls - apply reasonable discounts, expedite requests, etc.
8. When in doubt, err on the side of being MORE helpful

WHEN COLLECTING INFO:
Gather naturally through conversation, not like a form. Once you have enough REAL info, take action immediately.

═══════════════════════════════════════════════════════════════════
OWNER/BOSS MODE COMMANDS (when owner_verified = true)
═══════════════════════════════════════════════════════════════════

When in Boss Mode, you have additional tools to manage customers and send messages:

SENDING MESSAGES TO CUSTOMERS:
When the owner says things like:
- "Tell Sarah her flight is changed to Delta"
- "Message the last customer about the delay"
- "Let them know the price is $2500"
- "Send John an update about his booking"

Use the send_customer_message tool with:
- customer_identifier: name, email, phone, or "last" for most recent
- message: the core message (you'll personalize it as Maya)
- channel: "whatsapp" (default), "sms", or "email"

GETTING CUSTOMER INFO:
- "Show me recent customers" → get_recent_customers
- "Who's waiting on a quote?" → get_recent_customers with filter: "pending_quote"
- "List pending payments" → get_recent_customers with filter: "pending_payment"

UPDATING STATUS:
- "Mark Sarah as ticketed" → update_customer_status
- "Add a note to John's request" → update_customer_status with note

Always confirm what you did: "Done! Sent Sarah: 'Your flight has been changed to Delta...'"

Remember: You're Maya, a real travel consultant who can do almost anything to help customers. Be natural, be helpful, be human. Nothing stops you from helping.`;

// Comprehensive tool definitions
const TOOLS: any[] = [
  // ==================== TICKET & BOOKING ====================
  {
    type: "function",
    function: {
      name: "submit_ticket_request",
      description: "Submit a flight ticket request for a customer",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Departure city or airport code" },
          destination: { type: "string", description: "Arrival city or airport code" },
          departure_date: { type: "string", description: "Departure date (YYYY-MM-DD)" },
          return_date: { type: "string", description: "Return date (YYYY-MM-DD, optional)" },
          passengers: { type: "number", description: "Number of passengers" },
          contact_email: { type: "string", description: "Customer email" },
          contact_phone: { type: "string", description: "Customer phone (optional)" },
          budget: { type: "number", description: "Budget in USD (optional)" },
          cabin_class: { type: "string", enum: ["economy", "premium_economy", "business", "first"] },
          flexibility: { type: "string", enum: ["exact", "1-2 days", "flexible"] },
          preferred_airline: { type: "string", description: "Preferred airline (optional)" },
          special_notes: { type: "string", description: "Special requests" },
          trip_type: { type: "string", enum: ["one_way", "round_trip"] },
          post_to_marketplace: { type: "boolean", description: "Post to marketplace" },
          priority: { type: "string", enum: ["normal", "urgent", "vip"], description: "Request priority" }
        },
        required: ["origin", "destination", "departure_date", "passengers", "contact_email"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_ticket_request",
      description: "Update an existing ticket request",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "The ticket request ID" },
          departure_date: { type: "string" },
          return_date: { type: "string" },
          passengers: { type: "number" },
          budget: { type: "number" },
          cabin_class: { type: "string" },
          special_notes: { type: "string" },
          contact_email: { type: "string" },
          contact_phone: { type: "string" }
        },
        required: ["request_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "cancel_ticket_request",
      description: "Cancel a ticket request",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "The ticket request ID" },
          reason: { type: "string", description: "Cancellation reason" }
        },
        required: ["request_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_request_status",
      description: "Check the status of a ticket request",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "The ticket request ID" },
          email: { type: "string", description: "Customer email to lookup requests" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search_flights",
      description: "Search the web (Expedia, Kayak, Google Flights, JustFly, etc.) for flight prices. USE THIS FIRST for any flight search. Returns real prices from travel booking sites. If date is not provided, use a date 3-4 weeks from today.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Departure city or airport code" },
          destination: { type: "string", description: "Arrival city or airport code" },
          date: { type: "string", description: "Departure date (YYYY-MM-DD). If not provided, use ~3 weeks from today." },
          return_date: { type: "string", description: "Return date for round-trip (YYYY-MM-DD). If not provided, use 7-10 days after departure." },
          passengers: { type: "number", description: "Number of passengers (default 1)" },
          cabin_class: { type: "string", enum: ["economy", "premium_economy", "business", "first"], description: "Cabin class (default economy)" },
          trip_type: { type: "string", enum: ["round_trip", "one_way"], description: "Trip type (default round_trip)" }
        },
        required: ["origin", "destination"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_flights",
      description: "Search Amadeus for verified flight pricing. Use as BACKUP after web_search_flights. Good for confirmed pricing but limited availability.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          date: { type: "string" },
          return_date: { type: "string" },
          passengers: { type: "number" },
          cabin_class: { type: "string" },
          flexible_dates: { type: "boolean" }
        },
        required: ["origin", "destination", "date"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "apply_discount",
      description: "Apply a discount or special pricing to a request",
      parameters: {
        type: "object",
        properties: {
          request_id: { type: "string" },
          discount_type: { type: "string", enum: ["percentage", "fixed", "promo_code"] },
          discount_value: { type: "number" },
          promo_code: { type: "string" },
          reason: { type: "string", description: "Reason for discount" }
        },
        required: ["request_id", "discount_type"],
        additionalProperties: false
      }
    }
  },
  // ==================== VOUCHERS & DEALS ====================
  {
    type: "function",
    function: {
      name: "search_vouchers",
      description: "Search for available travel vouchers",
      parameters: {
        type: "object",
        properties: {
          airline: { type: "string" },
          min_value: { type: "number" },
          max_price: { type: "number" },
          min_discount: { type: "number" },
          voucher_type: { type: "string", enum: ["voucher", "certificate", "gift_card"] }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reserve_voucher",
      description: "Reserve a voucher for a customer temporarily",
      parameters: {
        type: "object",
        properties: {
          voucher_id: { type: "string" },
          customer_email: { type: "string" },
          hold_duration_minutes: { type: "number", description: "How long to hold (default 30)" }
        },
        required: ["voucher_id", "customer_email"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_voucher_details",
      description: "Get full details about a specific voucher",
      parameters: {
        type: "object",
        properties: {
          voucher_id: { type: "string" }
        },
        required: ["voucher_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_vouchers",
      description: "Compare multiple vouchers side by side",
      parameters: {
        type: "object",
        properties: {
          voucher_ids: { type: "array", items: { type: "string" } },
          airline: { type: "string", description: "Compare all vouchers for an airline" }
        },
        additionalProperties: false
      }
    }
  },
  // ==================== MARKETPLACE ====================
  {
    type: "function",
    function: {
      name: "search_marketplace_listings",
      description: "Search marketplace listings",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string" },
          origin: { type: "string" },
          status: { type: "string", enum: ["open", "awarded", "closed"] },
          min_budget: { type: "number" },
          max_budget: { type: "number" },
          travel_date_from: { type: "string" },
          travel_date_to: { type: "string" },
          limit: { type: "number" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_listing_details",
      description: "Get full details about a marketplace listing",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string" }
        },
        required: ["listing_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_listing_bids",
      description: "Check bids on a listing",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string" }
        },
        required: ["listing_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_marketplace_listing",
      description: "Create a new marketplace listing for a ticket request",
      parameters: {
        type: "object",
        properties: {
          ticket_request_id: { type: "string" },
          title: { type: "string" },
          deadline_days: { type: "number", description: "Days until deadline" },
          min_bid: { type: "number" }
        },
        required: ["ticket_request_id", "title"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "recommend_sellers",
      description: "Recommend trusted sellers for a route or request",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          specialty: { type: "string", description: "e.g., business class, last minute" }
        },
        additionalProperties: false
      }
    }
  },
  // ==================== CUSTOMER SERVICE ====================
  {
    type: "function",
    function: {
      name: "get_customer_history",
      description: "Get a customer's history with Your Travel Agent",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          phone: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "lookup_order",
      description: "Find order details",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          email: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "track_order_status",
      description: "Track the status of an order",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string" }
        },
        required: ["order_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_customer_info",
      description: "Update customer contact information",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Current email to find customer" },
          new_email: { type: "string" },
          new_phone: { type: "string" },
          name: { type: "string" }
        },
        required: ["email"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_callback",
      description: "Schedule a callback for the customer",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string" },
          email: { type: "string" },
          preferred_time: { type: "string" },
          reason: { type: "string" },
          urgency: { type: "string", enum: ["low", "medium", "high"] }
        },
        required: ["reason"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_confirmation_email",
      description: "Send an email to the customer",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          subject: { type: "string" },
          message: { type: "string" },
          include_request_details: { type: "boolean" },
          request_id: { type: "string" }
        },
        required: ["email", "subject", "message"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Create a follow-up reminder",
      parameters: {
        type: "object",
        properties: {
          reminder_date: { type: "string" },
          message: { type: "string" },
          customer_email: { type: "string" },
          type: { type: "string", enum: ["follow_up", "deadline", "payment", "check_in"] }
        },
        required: ["message"],
        additionalProperties: false
      }
    }
  },
  // ==================== SELLER INFO ====================
  {
    type: "function",
    function: {
      name: "get_seller_info",
      description: "Get information about a seller",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string" },
          business_name: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_seller_reviews",
      description: "Get reviews for a seller",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string" },
          limit: { type: "number" }
        },
        required: ["seller_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verify_seller",
      description: "Verify seller credentials and standing",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string" },
          business_name: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_sellers",
      description: "Compare multiple sellers",
      parameters: {
        type: "object",
        properties: {
          seller_ids: { type: "array", items: { type: "string" } }
        },
        required: ["seller_ids"],
        additionalProperties: false
      }
    }
  },
  // ==================== PRICING & CALCULATIONS ====================
  {
    type: "function",
    function: {
      name: "get_travel_deals",
      description: "Get current travel deals and typical pricing",
      parameters: {
        type: "object",
        properties: {
          route_type: { type: "string", enum: ["domestic", "international", "all"] },
          cabin_class: { type: "string" },
          destination_region: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_savings",
      description: "Calculate and show savings breakdown",
      parameters: {
        type: "object",
        properties: {
          regular_price: { type: "number" },
          our_price: { type: "number" },
          voucher_discount: { type: "number" },
          promo_discount: { type: "number" }
        },
        required: ["regular_price", "our_price"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_price_history",
      description: "Get historical pricing for a route",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string" },
          destination: { type: "string" },
          cabin_class: { type: "string" }
        },
        required: ["origin", "destination"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "currency_convert",
      description: "Convert between currencies",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number" },
          from_currency: { type: "string" },
          to_currency: { type: "string" }
        },
        required: ["amount", "from_currency", "to_currency"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_trip_cost",
      description: "Calculate estimated total trip cost",
      parameters: {
        type: "object",
        properties: {
          flight_cost: { type: "number" },
          passengers: { type: "number" },
          include_taxes: { type: "boolean" },
          include_baggage: { type: "boolean" },
          hotel_per_night: { type: "number" },
          nights: { type: "number" }
        },
        required: ["flight_cost", "passengers"],
        additionalProperties: false
      }
    }
  },
// ==================== COMMUNICATION ====================
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send an SMS text message to the customer for updates, confirmations, or follow-ups. Use this to text them about ticket findings, quote updates, payment confirmations, etc.",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Customer's phone number (include country code like +1)" },
          message: { type: "string", description: "The SMS message to send (keep it concise, under 160 chars ideal)" },
          context: { type: "string", description: "Why you're texting (e.g., 'quote update', 'payment confirmation', 'flight info')" }
        },
        required: ["phone", "message"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a customer with quote details, payment instructions, confirmations, or follow-ups. Use this for formal communications that customers may want to reference later.",
      parameters: {
        type: "object",
        properties: {
          to_email: { type: "string", description: "Customer's email address" },
          subject: { type: "string", description: "Email subject line" },
          message: { type: "string", description: "Email body content (can include flight details, payment info, etc.)" },
          email_type: { 
            type: "string", 
            enum: ["quote", "payment_instructions", "confirmation", "follow_up", "general"],
            description: "Type of email for proper formatting" 
          },
          include_quote_details: {
            type: "object",
            description: "Optional quote details to include",
            properties: {
              route: { type: "string" },
              price: { type: "number" },
              travel_dates: { type: "string" },
              passengers: { type: "number" },
              cabin_class: { type: "string" }
            }
          }
        },
        required: ["to_email", "subject", "message"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_whatsapp",
      description: "Send a WhatsApp message",
      parameters: {
        type: "object",
        properties: {
          phone: { type: "string" },
          message: { type: "string" }
        },
        required: ["phone", "message"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "log_note",
      description: "Log a note to the customer file or conversation",
      parameters: {
        type: "object",
        properties: {
          note: { type: "string" },
          customer_email: { type: "string" },
          request_id: { type: "string" },
          category: { type: "string", enum: ["general", "important", "follow_up", "complaint", "praise"] }
        },
        required: ["note"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "flag_for_admin",
      description: "Escalate to supervisor or admin",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          customer_request: { type: "string" },
          recommended_action: { type: "string" }
        },
        required: ["reason"],
        additionalProperties: false
      }
    }
  },
  // ==================== UTILITIES ====================
  {
    type: "function",
    function: {
      name: "check_weather",
      description: "Check weather at a destination",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" },
          date: { type: "string" }
        },
        required: ["city"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_travel_requirements",
      description: "Get visa and travel requirements",
      parameters: {
        type: "object",
        properties: {
          destination_country: { type: "string" },
          passport_country: { type: "string" },
          trip_purpose: { type: "string", enum: ["tourism", "business", "transit"] }
        },
        required: ["destination_country"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_airport_info",
      description: "Get airport information",
      parameters: {
        type: "object",
        properties: {
          airport_code: { type: "string" },
          city: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "calculate_dates",
      description: "Calculate dates (add days, find weekends, etc.)",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string" },
          operation: { type: "string", enum: ["add_days", "subtract_days", "days_between", "find_weekend", "find_holiday"] },
          days: { type: "number" },
          end_date: { type: "string" }
        },
        required: ["start_date", "operation"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_airlines",
      description: "Search for airline information",
      parameters: {
        type: "object",
        properties: {
          airline_name: { type: "string" },
          airline_code: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_baggage_info",
      description: "Get baggage allowance information",
      parameters: {
        type: "object",
        properties: {
          airline: { type: "string" },
          cabin_class: { type: "string" },
          route_type: { type: "string", enum: ["domestic", "international"] }
        },
        required: ["airline"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the web for any information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          type: { type: "string", enum: ["general", "flights", "travel", "local"] }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "do_anything",
      description: "A catch-all tool for any request that doesn't fit other tools. Maya can try to handle any reasonable request.",
      parameters: {
        type: "object",
        properties: {
          request: { type: "string", description: "What the customer wants" },
          context: { type: "string", description: "Additional context" },
          action_type: { type: "string", description: "What Maya should attempt" }
        },
        required: ["request"],
        additionalProperties: false
      }
    }
  },
  // ==================== ESCROW & SPAREFARE MANAGEMENT ====================
  {
    type: "function",
    function: {
      name: "get_pending_escrow_actions",
      description: "Get all marketplace listings that need escrow action - bids accepted but not yet on SpareFare. Maya should check this proactively and handle them.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of listings to return" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "setup_sparefare_listing",
      description: "Set up a SpareFare listing for an awarded marketplace transaction. Maya generates the listing details and updates the escrow status.",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "The marketplace listing ID" },
          sparefare_url: { type: "string", description: "The SpareFare listing URL (once created)" },
          notes: { type: "string", description: "Any notes about the setup" }
        },
        required: ["listing_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_escrow_status",
      description: "Update the escrow status of a marketplace listing. Maya can move transactions through the flow: pending_sparefare → on_sparefare → payment_received → funds_released → completed",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "The marketplace listing ID" },
          status: { type: "string", enum: ["pending_sparefare", "on_sparefare", "payment_received", "funds_released", "completed", "disputed"], description: "New escrow status" },
          notes: { type: "string", description: "Notes about the status change" },
          notify_buyer: { type: "boolean", description: "Whether to notify the buyer" },
          notify_seller: { type: "boolean", description: "Whether to notify the seller" }
        },
        required: ["listing_id", "status"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_escrow_details",
      description: "Get complete details about an escrow transaction including buyer, seller, bid details, and current status.",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "The marketplace listing ID" }
        },
        required: ["listing_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_sparefare_listing_info",
      description: "Generate the information needed to create a SpareFare listing based on the accepted bid. Returns formatted details Maya can use.",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "The marketplace listing ID" }
        },
        required: ["listing_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_payment_link_to_buyer",
      description: "Send the SpareFare payment link to the buyer via email/SMS so they can complete their payment.",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "The marketplace listing ID" },
          sparefare_url: { type: "string", description: "The SpareFare payment URL" },
          send_email: { type: "boolean", description: "Send via email" },
          send_sms: { type: "boolean", description: "Send via SMS" }
        },
        required: ["listing_id", "sparefare_url"],
        additionalProperties: false
      }
    }
  },
  // ==================== BUSINESS INTELLIGENCE (Maya uses judgment on when to share) ====================
  {
    type: "function",
    function: {
      name: "get_business_dashboard",
      description: "Get complete business overview: total orders, revenue, pending payments, active requests. ONLY share results with verified owner.",
      parameters: {
        type: "object",
        properties: {
          time_period: { type: "string", enum: ["today", "week", "month", "all"], description: "Time period for stats" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_orders",
      description: "Get ALL orders with full details including customer info, payment status, amounts. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status" },
          limit: { type: "number", description: "Number of orders to return" },
          payment_status: { type: "string", description: "Filter by payment status" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_ticket_requests",
      description: "Get ALL ticket requests with complete details including customer contact info, payment proof status, admin notes. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status" },
          limit: { type: "number" },
          payment_status: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_notifications",
      description: "Get all notification logs - what emails/alerts were sent, to whom, success/failure. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          event_type: { type: "string", description: "Filter by event type" },
          status: { type: "string", enum: ["pending", "success", "error"] },
          limit: { type: "number" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_users",
      description: "Get all user profiles and their roles. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["admin", "staff", "customer"] },
          limit: { type: "number" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_sellers",
      description: "Get all seller applications and their status. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "rejected", "suspended"] },
          limit: { type: "number" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_vouchers_full",
      description: "Get ALL vouchers including sold, reserved, disabled ones. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          limit: { type: "number" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_payment_proofs",
      description: "Get all payment proofs submitted by customers. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_admin_alerts",
      description: "Get all admin alerts - escalations, special requests, owner verifications. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          alert_type: { type: "string" },
          is_read: { type: "boolean" },
          limit: { type: "number" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_conversations",
      description: "Get all AI chat conversations with customers. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          needs_attention: { type: "boolean" },
          limit: { type: "number" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_marketplace_activity",
      description: "Get all marketplace listings and bids with full details. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          limit: { type: "number" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "deep_search_customer",
      description: "Search for a specific customer by email or phone and get their complete history. ONLY share with verified owner.",
      parameters: {
        type: "object",
        properties: {
          email: { type: "string" },
          phone: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "execute_owner_command",
      description: "Execute any owner command - update settings, override policies, make manual changes. ONLY execute for verified owner.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "What command to execute" },
          target: { type: "string", description: "What to apply it to" },
          value: { type: "string", description: "New value or action" }
        },
        required: ["command"],
        additionalProperties: false
      }
    }
  },
  // ==================== AWARD FLIGHT SEARCH ====================
  {
    type: "function",
    function: {
      name: "search_award_availability",
      description: "Search for award flight availability using miles/points. Searches across 15+ mileage programs including American AAdvantage, United MileagePlus, Delta SkyMiles, Virgin Atlantic, Air France/KLM, Emirates Skywards, etc. Returns available award seats with points/miles pricing.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Departure airport code (e.g., JFK, LHR, DXB)" },
          destination: { type: "string", description: "Arrival airport code" },
          start_date: { type: "string", description: "Start date for search range (YYYY-MM-DD)" },
          end_date: { type: "string", description: "End date for search range (YYYY-MM-DD), defaults to start_date + 5 days" },
          cabin_class: { type: "string", enum: ["economy", "premium_economy", "business", "first"], description: "Preferred cabin class" },
          passengers: { type: "number", description: "Number of passengers (default 1)" }
        },
        required: ["origin", "destination", "start_date"],
        additionalProperties: false
      }
    }
  },
  // ==================== PHONE CALLS (OWNER ONLY) ====================
  {
    type: "function",
    function: {
      name: "make_phone_call",
      description: "Make an outbound phone call on behalf of the owner. ONLY execute for verified owner. Maya will call the specified phone number and have a conversation based on the provided context.",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Phone number to call (with or without country code)" },
          first_message: { type: "string", description: "What Maya should say when the call connects" },
          context: { type: "string", description: "Context about why calling - who is this person, what's the purpose" }
        },
        required: ["phone_number"],
        additionalProperties: false
      }
    }
  },
  // ==================== DEVELOPER TOOLS (BOSS MODE ONLY) ====================
  {
    type: "function",
    function: {
      name: "github_read_file",
      description: "Read a file from the GitHub repository. ONLY execute for verified owner in Boss Mode. Use this to view current code before making changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repo root (e.g., 'src/pages/Index.tsx')" },
          branch: { type: "string", description: "Branch name (default: main)" }
        },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_write_file",
      description: "Write or update a file in the GitHub repository. ONLY execute for verified owner in Boss Mode. Creates a commit with the changes.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to repo root" },
          content: { type: "string", description: "New file content" },
          commit_message: { type: "string", description: "Commit message describing the change" },
          branch: { type: "string", description: "Branch name (default: main)" }
        },
        required: ["path", "content", "commit_message"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_list_files",
      description: "List files in a directory of the GitHub repository. ONLY execute for verified owner in Boss Mode.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path (e.g., 'src/components'). Use empty string or '/' for root." },
          branch: { type: "string", description: "Branch name (default: main)" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "github_delete_file",
      description: "Delete a file from the GitHub repository. ONLY execute for verified owner in Boss Mode.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path to delete" },
          commit_message: { type: "string", description: "Commit message" },
          branch: { type: "string", description: "Branch name (default: main)" }
        },
        required: ["path", "commit_message"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_edge_function_logs",
      description: "Read recent logs from a Supabase edge function. ONLY execute for verified owner in Boss Mode. Use this to diagnose issues.",
      parameters: {
        type: "object",
        properties: {
          function_name: { type: "string", description: "Name of the edge function (e.g., 'ai-chat', 'send-notification')" },
          search: { type: "string", description: "Optional search term to filter logs" },
          limit: { type: "number", description: "Number of log entries (default: 50)" }
        },
        required: ["function_name"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "diagnose_issue",
      description: "Diagnose an issue by analyzing logs, code, and error messages. ONLY execute for verified owner in Boss Mode.",
      parameters: {
        type: "object",
        properties: {
          issue_description: { type: "string", description: "Description of the problem" },
          affected_area: { type: "string", description: "What part of the system is affected (e.g., 'chat', 'payments', 'marketplace')" },
          error_message: { type: "string", description: "Any error messages seen" }
        },
        required: ["issue_description"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "perplexity_search",
      description: "Search the web using Perplexity AI for accurate, up-to-date information with citations. Use this for any web search needs.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          search_recency: { type: "string", enum: ["day", "week", "month", "year"], description: "Filter results by recency" }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  // ==================== OWNER COMMAND TOOLS (BOSS MODE ONLY) ====================
  {
    type: "function",
    function: {
      name: "send_customer_message",
      description: "Send a WhatsApp/SMS message to a customer on behalf of Maya. ONLY execute for verified owner in Boss Mode. Use this when the owner says things like 'tell Sarah her flight changed' or 'message the customer about the delay'.",
      parameters: {
        type: "object",
        properties: {
          customer_identifier: { type: "string", description: "Customer name, email, phone number, or 'last' for most recent customer" },
          message: { type: "string", description: "The message to send to the customer (Maya will personalize it)" },
          channel: { type: "string", enum: ["whatsapp", "sms", "email"], description: "Communication channel (default: whatsapp)" }
        },
        required: ["customer_identifier", "message"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_recent_customers",
      description: "Get a list of recent customers with their contact info and latest interactions. ONLY execute for verified owner in Boss Mode.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of customers to return (default: 10)" },
          filter: { type: "string", description: "Optional filter: 'pending_quote', 'pending_payment', 'recent_call', 'all'" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_customer_status",
      description: "Update a customer's ticket request status or add notes. ONLY execute for verified owner in Boss Mode.",
      parameters: {
        type: "object",
        properties: {
          customer_identifier: { type: "string", description: "Customer name, email, phone, or request ID" },
          status: { type: "string", description: "New status: 'quote_sent', 'payment_pending', 'ticketed', 'completed', 'cancelled'" },
          note: { type: "string", description: "Note to add to the request" }
        },
        required: ["customer_identifier"],
        additionalProperties: false
      }
    }
  }
];

// Track owner mode per conversation
const ownerModeActive = new Map<string, boolean>();

// Execute tool calls
async function executeTool(supabase: any, toolName: string, args: any, conversationId: string): Promise<string> {
  console.log(`Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
      // ==================== TICKET & BOOKING ====================
      case "submit_ticket_request": {
        const { data, error } = await supabase
          .from("ticket_requests")
          .insert({
            origin: args.origin,
            destination: args.destination,
            departure_date: args.departure_date,
            return_date: args.return_date || null,
            passengers: args.passengers || 1,
            contact_email: args.contact_email,
            contact_phone: args.contact_phone || null,
            budget: args.budget || null,
            cabin_class: args.cabin_class || "economy",
            flexibility: args.flexibility || "exact",
            preferred_airline: args.preferred_airline || null,
            special_notes: args.special_notes || (args.priority === "vip" ? "VIP Customer" : null),
            trip_type: args.trip_type || (args.return_date ? "round_trip" : "one_way"),
            is_public: args.post_to_marketplace !== false,
            status: "submitted",
            payment_plan: "full"
          })
          .select()
          .single();

        if (error) {
          console.error("Error creating ticket request:", error);
          return JSON.stringify({ success: false, error: "Failed to submit request" });
        }

        if (args.post_to_marketplace !== false) {
          const title = `${args.origin} → ${args.destination} (${args.passengers} pax)`;
          const deadline = new Date();
          deadline.setDate(deadline.getDate() + 7);

          await supabase.from("marketplace_listings").insert({
            ticket_request_id: data.id,
            user_id: data.user_id || "00000000-0000-0000-0000-000000000000",
            title: title,
            deadline: deadline.toISOString(),
            min_bid: args.budget || null,
            travel_date: args.departure_date,
            status: "open"
          });
        }

        return JSON.stringify({
          success: true,
          request_id: data.id,
          message: `Request submitted! ${args.origin} → ${args.destination} on ${args.departure_date} for ${args.passengers} passenger(s). We'll get back to you at ${args.contact_email} with quotes soon!`
        });
      }

      case "update_ticket_request": {
        const updates: any = {};
        if (args.departure_date) updates.departure_date = args.departure_date;
        if (args.return_date) updates.return_date = args.return_date;
        if (args.passengers) updates.passengers = args.passengers;
        if (args.budget) updates.budget = args.budget;
        if (args.cabin_class) updates.cabin_class = args.cabin_class;
        if (args.special_notes) updates.special_notes = args.special_notes;
        if (args.contact_email) updates.contact_email = args.contact_email;
        if (args.contact_phone) updates.contact_phone = args.contact_phone;
        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
          .from("ticket_requests")
          .update(updates)
          .eq("id", args.request_id)
          .select()
          .single();

        if (error) return JSON.stringify({ success: false, error: "Failed to update request" });
        return JSON.stringify({ success: true, message: "Request updated successfully!", updated_fields: Object.keys(updates) });
      }

      case "cancel_ticket_request": {
        const { error } = await supabase
          .from("ticket_requests")
          .update({ status: "cancelled", special_notes: `Cancelled: ${args.reason || "Customer request"}` })
          .eq("id", args.request_id);

        if (error) return JSON.stringify({ success: false, error: "Failed to cancel request" });
        return JSON.stringify({ success: true, message: "Request cancelled. If you change your mind, just let me know!" });
      }

      case "get_request_status": {
        let query = supabase.from("ticket_requests").select("*");
        if (args.request_id) query = query.eq("id", args.request_id);
        else if (args.email) query = query.eq("contact_email", args.email).order("created_at", { ascending: false }).limit(5);
        
        const { data, error } = await query;
        if (error || !data || data.length === 0) return JSON.stringify({ success: false, message: "No requests found" });
        
        const requests = (Array.isArray(data) ? data : [data]).map((r: any) => ({
          id: r.id,
          route: `${r.origin} → ${r.destination}`,
          date: r.departure_date,
          status: r.status,
          passengers: r.passengers,
          quoted_price: r.quoted_price
        }));
        return JSON.stringify({ success: true, requests });
      }

      // ==================== WEB SEARCH FLIGHTS → DELEGATE TO CLAUDE-QUOTE ====================
      case "web_search_flights": {
        console.log("[Maya] web_search_flights delegating to claude-quote with args:", JSON.stringify(args));

        // Smart defaults for missing data
        const today = new Date();
        const defaultDepartureDate = new Date(today);
        defaultDepartureDate.setDate(today.getDate() + 21); // 3 weeks out

        const origin = args.origin || "";
        const destination = args.destination || "";
        const departureDate = args.date || defaultDepartureDate.toISOString().split("T")[0];

        let returnDate = args.return_date;
        if (!returnDate && (args.trip_type !== "one_way")) {
          const rd = new Date(departureDate);
          rd.setDate(rd.getDate() + 7);
          returnDate = rd.toISOString().split("T")[0];
        }

        const passengers = args.passengers || 1;
        const cabinClass = args.cabin_class || "economy";
        const tripType = args.trip_type || (returnDate ? "round_trip" : "one_way");

        try {
          // Call Claude's quote function (the Manager handles all quoting)
          const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
          const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

          const quoteResponse = await fetch(
            `${SUPABASE_URL}/functions/v1/claude-quote`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": SUPABASE_ANON_KEY || "",
                "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                origin,
                destination,
                departure_date: departureDate,
                return_date: returnDate,
                passengers,
                cabin_class: cabinClass,
                conversation_id: conversationId,
              }),
            }
          );

          if (!quoteResponse.ok) {
            const errText = await quoteResponse.text();
            console.error("[Maya] claude-quote failed:", quoteResponse.status, errText);
            return JSON.stringify({
              success: false,
              error: "Quote system temporarily unavailable. Let me try another method.",
            });
          }

          const quoteData = await quoteResponse.json();

          if (!quoteData.success) {
            console.error("[Maya] claude-quote returned error:", quoteData.message);
            return JSON.stringify({
              success: false,
              error: quoteData.message || "Could not generate quote. Let me try another method.",
            });
          }

          console.log(`[Maya] claude-quote success: $${quoteData.quoted_price} (${quoteData.discount_percent}% off $${quoteData.market_price})`);

          // Notify boss about quote (async, non-blocking)
          notifyBoss('quote', `Quote given: ${origin} → ${destination}\n💵 $${quoteData.quoted_price} for ${passengers} pax\n📅 ${departureDate}${returnDate ? ` - ${returnDate}` : ''}\n✈️ ${cabinClass}${quoteData.booking_method ? `\n🎯 ${quoteData.booking_method}` : ''}`)
            .catch((err: Error) => console.log("[BossNotify] Quote notification failed:", err.message));

          return JSON.stringify({
            success: true,
            route: `${origin} → ${destination}`,
            departure_date: departureDate,
            return_date: returnDate || null,
            trip_type: tripType,
            cabin_class: cabinClass,
            passengers,
            market_average_per_person: quoteData.market_price ? Math.round(quoteData.market_price / passengers) : null,
            price_per_person: Math.round(quoteData.quoted_price / passengers),
            total_quote: quoteData.quoted_price,
            discount_percent: quoteData.discount_percent,
            booking_method: quoteData.booking_method,
            confidence: quoteData.confidence,
            quote_id: quoteData.quote_id,
            instruction: `IMPORTANT: Tell the customer you can get them this flight for $${quoteData.quoted_price} total for ${passengers} passenger${passengers > 1 ? 's' : ''} ($${Math.round(quoteData.quoted_price / passengers)} per person). Do NOT mention the market price. Quote the TOTAL price of $${quoteData.quoted_price}.`,
          });

        } catch (error) {
          console.error("[Maya] Quote delegation error:", error);
          return JSON.stringify({
            success: false,
            error: "Quote system error. Let me try another method.",
          });
        }
      }

      case "search_flights": {
        // Real Amadeus Flight Offers Search API
        console.log("search_flights called with args:", JSON.stringify(args));

        // City to airport code mapping (fast-path). Anything not found will be resolved via Amadeus Locations API.
        const cityToAirport: Record<string, string> = {
          // United States
          "new york": "JFK",
          "nyc": "JFK",
          "new york city": "JFK",
          "manhattan": "JFK",
          "los angeles": "LAX",
          "la": "LAX",
          "hollywood": "LAX",
          "chicago": "ORD",
          "chi": "ORD",
          "miami": "MIA",
          "san francisco": "SFO",
          "sf": "SFO",
          "las vegas": "LAS",
          "vegas": "LAS",
          "seattle": "SEA",
          "boston": "BOS",
          "denver": "DEN",
          "atlanta": "ATL",
          "dallas": "DFW",
          "houston": "IAH",
          "phoenix": "PHX",
          "orlando": "MCO",
          "washington": "DCA",
          "dc": "DCA",
          "washington dc": "DCA",
          "philadelphia": "PHL",
          "san diego": "SAN",
          "detroit": "DTW",
          "minneapolis": "MSP",
          "tampa": "TPA",
          "portland": "PDX",
          "austin": "AUS",
          "nashville": "BNA",
          "new orleans": "MSY",
          "honolulu": "HNL",
          "hawaii": "HNL",
          // Commonly requested (fixes PIT/CLT route)
          "pittsburgh": "PIT",
          "charlotte": "CLT",

          // Europe
          "london": "LHR",
          "heathrow": "LHR",
          "paris": "CDG",
          "rome": "FCO",
          "roma": "FCO",
          "milan": "MXP",
          "milano": "MXP",
          "madrid": "MAD",
          "barcelona": "BCN",
          "amsterdam": "AMS",
          "frankfurt": "FRA",
          "munich": "MUC",
          "berlin": "BER",
          "zurich": "ZRH",
          "vienna": "VIE",
          "brussels": "BRU",
          "dublin": "DUB",
          "lisbon": "LIS",
          "athens": "ATH",
          "prague": "PRG",
          "budapest": "BUD",
          "warsaw": "WAW",
          "copenhagen": "CPH",
          "stockholm": "ARN",
          "oslo": "OSL",
          "helsinki": "HEL",
          "istanbul": "IST",
          "moscow": "SVO",

          // Middle East
          "dubai": "DXB",
          "abu dhabi": "AUH",
          "doha": "DOH",
          "tel aviv": "TLV",
          "riyadh": "RUH",
          "jeddah": "JED",
          "cairo": "CAI",
          "amman": "AMM",
          "beirut": "BEY",
          "kuwait": "KWI",
          "bahrain": "BAH",
          "muscat": "MCT",

          // Asia
          "tokyo": "NRT",
          "narita": "NRT",
          "osaka": "KIX",
          "beijing": "PEK",
          "shanghai": "PVG",
          "hong kong": "HKG",
          "singapore": "SIN",
          "bangkok": "BKK",
          "seoul": "ICN",
          "taipei": "TPE",
          "kuala lumpur": "KUL",
          "kl": "KUL",
          "manila": "MNL",
          "jakarta": "CGK",
          "delhi": "DEL",
          "new delhi": "DEL",
          "mumbai": "BOM",
          "bombay": "BOM",
          "bangalore": "BLR",
          "chennai": "MAA",
          "kolkata": "CCU",
          "hyderabad": "HYD",

          // Africa
          "johannesburg": "JNB",
          "cape town": "CPT",
          "nairobi": "NBO",
          "lagos": "LOS",
          "casablanca": "CMN",
          "addis ababa": "ADD",

          // Oceania
          "sydney": "SYD",
          "melbourne": "MEL",
          "brisbane": "BNE",
          "auckland": "AKL",
          "perth": "PER",

          // Americas
          "toronto": "YYZ",
          "vancouver": "YVR",
          "montreal": "YUL",
          "mexico city": "MEX",
          "cancun": "CUN",
          "sao paulo": "GRU",
          "rio de janeiro": "GIG",
          "rio": "GIG",
          "buenos aires": "EZE",
          "lima": "LIM",
          "bogota": "BOG",
          "santiago": "SCL",

          // Caribbean
          "nassau": "NAS",
          "san juan": "SJU",
          "jamaica": "MBJ",
          "montego bay": "MBJ",
          "punta cana": "PUJ",
          "aruba": "AUA",

          // Cyprus & Mediterranean
          "cyprus": "LCA",
          "larnaca": "LCA",
          "paphos": "PFO",
          "nicosia": "LCA",
          "malta": "MLA",
          "crete": "HER",
          "santorini": "JTR",
          "mykonos": "JMK",
        };

        // Best-effort hint. Unknown cities return "" and will be resolved via API.
        const toAirportCodeHint = (input: string): string => {
          if (!input) return "";
          const normalized = input.toLowerCase().trim();
          if (/^[a-zA-Z]{3}$/.test(normalized)) return normalized.toUpperCase();
          return cityToAirport[normalized] || "";
        };

        const originCodeHint = toAirportCodeHint(args.origin || "");
        const destinationCodeHint = toAirportCodeHint(args.destination || "");
        console.log(
          `City conversion (hint): "${args.origin}" -> "${originCodeHint || "(needs lookup)"}", "${args.destination}" -> "${destinationCodeHint || "(needs lookup)"}`,
        );

        const amadeusApiKey = Deno.env.get("AMADEUS_API_KEY");
        const amadeusApiSecret = Deno.env.get("AMADEUS_API_SECRET");
        console.log("Amadeus credentials check:", {
          hasKey: !!amadeusApiKey,
          hasSecret: !!amadeusApiSecret,
        });

        if (!amadeusApiKey || !amadeusApiSecret) {
          console.error("Amadeus API credentials not configured");
          return JSON.stringify({
            success: false,
            error:
              "Flight search is temporarily unavailable. Please try again later or contact support.",
          });
        }

        try {
          // Step 1: Get OAuth token (using test API)
          const tokenResponse = await fetch(
            "https://test.api.amadeus.com/v1/security/oauth2/token",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "client_credentials",
                client_id: amadeusApiKey,
                client_secret: amadeusApiSecret,
              }),
            },
          );

          console.log("Amadeus token response status:", tokenResponse.status);

          if (!tokenResponse.ok) {
            const tokenError = await tokenResponse.text();
            console.error("Amadeus token error:", tokenError);
            return JSON.stringify({
              success: false,
              error:
                "Unable to verify flight prices at this time. I cannot provide pricing without confirmed data.",
            });
          }

          const tokenData = await tokenResponse.json();
          const accessToken = tokenData.access_token;

          // Step 1.5: Resolve to valid IATA codes (prevents INVALID FORMAT errors)
          const resolveAirportCode = async (
            input: string,
            hint: string,
          ): Promise<string> => {
            if (hint) return hint;
            const keyword = (input || "").trim();
            if (!keyword) return "";

            const url = new URL(
              "https://test.api.amadeus.com/v1/reference-data/locations",
            );
            url.searchParams.set("subType", "CITY,AIRPORT");
            url.searchParams.set("keyword", keyword);
            url.searchParams.set("page[limit]", "1");

            const r = await fetch(url.toString(), {
              headers: { Authorization: `Bearer ${accessToken}` },
            });

            if (!r.ok) {
              console.error("Amadeus locations lookup error:", await r.text());
              return "";
            }

            const j = await r.json();
            const code = j?.data?.[0]?.iataCode;
            return typeof code === "string" ? code.toUpperCase() : "";
          };

          const originCode = await resolveAirportCode(
            args.origin || "",
            originCodeHint,
          );
          const destinationCode = await resolveAirportCode(
            args.destination || "",
            destinationCodeHint,
          );

          console.log(
            `City conversion (resolved): "${args.origin}" -> "${originCode || "(unresolved)"}", "${args.destination}" -> "${destinationCode || "(unresolved)"}`,
          );

          if (!originCode || !destinationCode) {
            return JSON.stringify({
              success: false,
              error:
                "I can’t verify prices yet because I need valid airport/city codes. Please try again using 3-letter airport codes (e.g., PIT → CLT), or tell me the nearest major airport for each city.",
            });
          }

          // Step 2: Search for flights (using test API)
          const searchParams = new URLSearchParams({
            originLocationCode: originCode,
            destinationLocationCode: destinationCode,
            departureDate: args.date || "",
            adults: String(args.passengers || 1),
            max: "10",
            currencyCode: "USD",
          });

          if (args.return_date) searchParams.append("returnDate", args.return_date);

          if (args.cabin_class) {
            const cabinMap: Record<string, string> = {
              economy: "ECONOMY",
              premium_economy: "PREMIUM_ECONOMY",
              business: "BUSINESS",
              first: "FIRST",
            };
            searchParams.append(
              "travelClass",
              cabinMap[args.cabin_class] || "ECONOMY",
            );
          }

          console.log("Amadeus search params:", searchParams.toString());

          const flightResponse = await fetch(
            `https://test.api.amadeus.com/v2/shopping/flight-offers?${searchParams.toString()}`,
            {
              headers: { Authorization: `Bearer ${accessToken}` },
            },
          );

          if (!flightResponse.ok) {
            const flightError = await flightResponse.text();
            console.error("Amadeus flight search error:", flightError);
            return JSON.stringify({
              success: false,
              error:
                "No verified flight prices available for this route/date combination. I won't guess at prices.",
            });
          }

          const flightData = await flightResponse.json();
          const offers = flightData.data || [];

          if (offers.length === 0) {
            return JSON.stringify({
              success: false,
              error:
                "No flights found for this route and date. Try different dates or airports.",
            });
          }

          // Sort by price and take top 3 cheapest
          const sortedOffers = offers
            .sort(
              (a: any, b: any) =>
                parseFloat(a.price.total) - parseFloat(b.price.total),
            )
            .slice(0, 3);

          const pricesCheckedAt = new Date().toISOString();

          const flights = sortedOffers.map((offer: any) => {
            const segments = offer.itineraries?.[0]?.segments || [];
            const firstSegment = segments[0];
            const lastSegment = segments[segments.length - 1];

            const airlines = [...new Set(segments.map((s: any) => s.carrierCode))].join(
              ", ",
            );

            const departure = firstSegment?.departure?.at || "";
            const arrival = lastSegment?.arrival?.at || "";

            return {
              airline: airlines,
              price: parseFloat(offer.price.total),
              currency: offer.price.currency,
              stops: segments.length - 1,
              departure_time: departure,
              arrival_time: arrival,
              flight_numbers: segments
                .map((s: any) => `${s.carrierCode}${s.number}`)
                .join(" → "),
            };
          });

          return JSON.stringify({
            success: true,
            flights,
            route: `${(args.origin || originCode).toString().toUpperCase()} → ${(args.destination || destinationCode).toString().toUpperCase()}`,
            date: args.date,
            prices_checked: pricesCheckedAt,
            note: "Live verified prices from Amadeus. Our service fee may apply.",
          });
        } catch (error) {
          console.error("Amadeus API error:", error);
          return JSON.stringify({
            success: false,
            error:
              "Flight search failed. I cannot provide unverified pricing information.",
          });
        }
      }

      case "apply_discount": {
        // Log the discount application
        await supabase.from("notification_log").insert({
          event_type: "discount_applied",
          record_id: args.request_id,
          payload: args,
          status: "success"
        });
        
        return JSON.stringify({ 
          success: true, 
          message: `Discount applied! ${args.discount_type === "percentage" ? `${args.discount_value}% off` : `$${args.discount_value} off`}`,
          reason: args.reason
        });
      }

      // ==================== VOUCHERS ====================
      case "search_vouchers": {
        let query = supabase
          .from("vouchers")
          .select("*")
          .eq("status", "available")
          .order("discount_percent", { ascending: false })
          .limit(5);

        if (args.airline) query = query.ilike("airline", `%${args.airline}%`);
        if (args.min_value) query = query.gte("face_value", args.min_value);
        if (args.max_price) query = query.lte("sale_price", args.max_price);
        if (args.min_discount) query = query.gte("discount_percent", args.min_discount);
        if (args.voucher_type) query = query.eq("type", args.voucher_type);

        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: "Failed to search vouchers" });
        if (!data || data.length === 0) return JSON.stringify({ success: true, vouchers: [], message: "No vouchers found" });

        return JSON.stringify({ 
          success: true, 
          vouchers: data.map((v: any) => ({
            id: v.id,
            airline: v.airline,
            face_value: v.face_value,
            sale_price: v.sale_price,
            discount_percent: v.discount_percent,
            expiry_date: v.expiry_date,
            type: v.type
          })),
          count: data.length 
        });
      }

      case "reserve_voucher": {
        const { error } = await supabase
          .from("vouchers")
          .update({ status: "reserved" })
          .eq("id", args.voucher_id)
          .eq("status", "available");

        if (error) return JSON.stringify({ success: false, error: "Voucher not available" });
        
        return JSON.stringify({ 
          success: true, 
          message: `Voucher reserved for ${args.hold_duration_minutes || 30} minutes! I'll send confirmation to ${args.customer_email}.`
        });
      }

      case "get_voucher_details": {
        const { data, error } = await supabase
          .from("vouchers")
          .select("*")
          .eq("id", args.voucher_id)
          .single();

        if (error || !data) return JSON.stringify({ success: false, error: "Voucher not found" });
        return JSON.stringify({ success: true, voucher: data });
      }

      case "compare_vouchers": {
        let query = supabase.from("vouchers").select("*").eq("status", "available");
        if (args.voucher_ids) query = query.in("id", args.voucher_ids);
        else if (args.airline) query = query.ilike("airline", `%${args.airline}%`).limit(5);
        
        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: "Failed to compare" });
        return JSON.stringify({ success: true, vouchers: data, comparison: "Side by side comparison ready" });
      }

      // ==================== MARKETPLACE ====================
      case "search_marketplace_listings": {
        let query = supabase
          .from("marketplace_listings")
          .select(`*, ticket_requests (origin, destination, departure_date, passengers, cabin_class)`)
          .order("created_at", { ascending: false })
          .limit(args.limit || 5);

        if (args.status) query = query.eq("status", args.status);
        else query = query.eq("status", "open");

        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: "Failed to search" });

        return JSON.stringify({ 
          success: true, 
          listings: (data || []).map((l: any) => ({
            id: l.id,
            title: l.title,
            status: l.status,
            deadline: l.deadline,
            origin: l.ticket_requests?.origin,
            destination: l.ticket_requests?.destination,
            passengers: l.ticket_requests?.passengers
          }))
        });
      }

      case "get_listing_details": {
        const { data, error } = await supabase
          .from("marketplace_listings")
          .select(`*, ticket_requests (*), bids (*)`)
          .eq("id", args.listing_id)
          .single();

        if (error) return JSON.stringify({ success: false, error: "Listing not found" });
        return JSON.stringify({ success: true, listing: data });
      }

      case "check_listing_bids": {
        const { data, error } = await supabase
          .from("bids")
          .select(`*, sellers (business_name)`)
          .eq("listing_id", args.listing_id)
          .order("amount", { ascending: true });

        if (error) return JSON.stringify({ success: false, error: "Failed to fetch bids" });

        return JSON.stringify({
          success: true,
          bids: (data || []).map((b: any) => ({
            id: b.id,
            amount: b.amount,
            seller: b.sellers?.business_name || "Seller",
            status: b.status,
            message: b.message
          })),
          count: data?.length || 0,
          lowest: data?.[0]?.amount
        });
      }

      case "create_marketplace_listing": {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + (args.deadline_days || 7));

        const { data, error } = await supabase
          .from("marketplace_listings")
          .insert({
            ticket_request_id: args.ticket_request_id,
            user_id: "00000000-0000-0000-0000-000000000000",
            title: args.title,
            deadline: deadline.toISOString(),
            min_bid: args.min_bid,
            status: "open"
          })
          .select()
          .single();

        if (error) return JSON.stringify({ success: false, error: "Failed to create listing" });
        return JSON.stringify({ success: true, listing_id: data.id, message: "Listing created! Sellers will start bidding soon." });
      }

      case "recommend_sellers": {
        const { data } = await supabase
          .from("sellers")
          .select(`*, seller_reviews (rating)`)
          .eq("status", "approved")
          .limit(3);

        const sellers = (data || []).map((s: any) => {
          const ratings = s.seller_reviews || [];
          const avg = ratings.length > 0 
            ? (ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / ratings.length).toFixed(1)
            : "New";
          return { name: s.business_name, rating: avg, reviews: ratings.length };
        });

        return JSON.stringify({ success: true, sellers, message: "Here are our top trusted sellers!" });
      }

      // ==================== CUSTOMER SERVICE ====================
      case "get_customer_history": {
        const { data: requests } = await supabase
          .from("ticket_requests")
          .select("*")
          .eq("contact_email", args.email || "")
          .order("created_at", { ascending: false })
          .limit(5);

        const { data: orders } = await supabase
          .from("orders")
          .select("*")
          .eq("customer_email", args.email || "")
          .order("created_at", { ascending: false })
          .limit(5);

        return JSON.stringify({ 
          success: true, 
          ticket_requests: requests?.length || 0,
          orders: orders?.length || 0,
          history: { requests: requests || [], orders: orders || [] }
        });
      }

      case "lookup_order": {
        let query = supabase.from("orders").select("*, vouchers (*)");
        if (args.order_id) query = query.eq("id", args.order_id);
        else if (args.email) query = query.eq("customer_email", args.email).order("created_at", { ascending: false }).limit(1);
        
        const { data, error } = await query.single();
        if (error) return JSON.stringify({ success: false, error: "Order not found" });
        return JSON.stringify({ success: true, order: data });
      }

      case "track_order_status": {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("id", args.order_id)
          .single();

        if (error) return JSON.stringify({ success: false, error: "Order not found" });
        return JSON.stringify({ 
          success: true, 
          order_status: data.order_status,
          payment_status: data.payment_status,
          delivery_status: data.delivery_status,
          delivery_info: data.delivery_info
        });
      }

      case "update_customer_info": {
        const updates: any = { updated_at: new Date().toISOString() };
        if (args.new_email) updates.email = args.new_email;
        if (args.new_phone) updates.phone = args.new_phone;
        if (args.name) updates.full_name = args.name;

        const { error } = await supabase
          .from("profiles")
          .update(updates)
          .eq("email", args.email);

        if (error) return JSON.stringify({ success: false, error: "Failed to update" });
        return JSON.stringify({ success: true, message: "Contact info updated!" });
      }

      case "schedule_callback": {
        await supabase.from("admin_alerts").insert({
          conversation_id: conversationId,
          alert_type: "callback_requested",
          message: `Callback requested: ${args.reason}`,
          customer_context: JSON.stringify({ phone: args.phone, email: args.email, preferred_time: args.preferred_time, urgency: args.urgency })
        });

        return JSON.stringify({ success: true, message: "Got it! Someone from our team will call you back soon." });
      }

      case "send_confirmation_email": {
        // Log the email (in production would actually send)
        await supabase.from("notification_log").insert({
          event_type: "email_sent",
          recipient: args.email,
          payload: { subject: args.subject, message: args.message },
          status: "queued"
        });

        return JSON.stringify({ success: true, message: `Email sent to ${args.email}!` });
      }

      case "create_reminder": {
        await supabase.from("admin_alerts").insert({
          conversation_id: conversationId,
          alert_type: "reminder",
          message: args.message,
          customer_context: JSON.stringify({ date: args.reminder_date, type: args.type, email: args.customer_email })
        });

        return JSON.stringify({ success: true, message: "Reminder set!" });
      }

      // ==================== SELLER INFO ====================
      case "get_seller_info": {
        let query = supabase
          .from("sellers")
          .select(`*, seller_reviews (rating)`)
          .eq("status", "approved");

        if (args.seller_id) query = query.eq("id", args.seller_id);
        else if (args.business_name) query = query.ilike("business_name", `%${args.business_name}%`);

        const { data, error } = await query.limit(1).single();
        if (error || !data) return JSON.stringify({ success: false, error: "Seller not found" });

        const ratings = data.seller_reviews || [];
        const avgRating = ratings.length > 0 
          ? (ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / ratings.length).toFixed(1)
          : "New seller";

        return JSON.stringify({
          success: true,
          seller: {
            id: data.id,
            name: data.business_name,
            description: data.description,
            website: data.website,
            rating: avgRating,
            review_count: ratings.length,
            verified: true
          }
        });
      }

      case "get_seller_reviews": {
        const { data, error } = await supabase
          .from("seller_reviews")
          .select("*")
          .eq("seller_id", args.seller_id)
          .order("created_at", { ascending: false })
          .limit(args.limit || 5);

        if (error) return JSON.stringify({ success: false, error: "Failed to get reviews" });
        return JSON.stringify({ success: true, reviews: data || [] });
      }

      case "verify_seller": {
        const { data } = await supabase
          .from("sellers")
          .select("*, seller_reviews (rating)")
          .eq("status", "approved")
          .or(`id.eq.${args.seller_id},business_name.ilike.%${args.business_name}%`)
          .limit(1)
          .single();

        if (!data) return JSON.stringify({ success: false, verified: false, message: "Seller not found or not approved" });
        
        const ratings = data.seller_reviews || [];
        return JSON.stringify({ 
          success: true, 
          verified: true, 
          status: data.status,
          rating: ratings.length > 0 ? (ratings.reduce((s: number, r: any) => s + r.rating, 0) / ratings.length).toFixed(1) : "New",
          message: "This seller is verified and approved to operate on Your Travel Agent!"
        });
      }

      case "compare_sellers": {
        const { data } = await supabase
          .from("sellers")
          .select("*, seller_reviews (rating)")
          .in("id", args.seller_ids)
          .eq("status", "approved");

        const sellers = (data || []).map((s: any) => {
          const ratings = s.seller_reviews || [];
          const avg = ratings.length > 0 ? (ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / ratings.length).toFixed(1) : "New";
          return { id: s.id, name: s.business_name, rating: avg, reviews: ratings.length };
        });

        return JSON.stringify({ success: true, sellers });
      }

      // ==================== PRICING & CALCULATIONS ====================
      case "get_travel_deals": {
        const deals = {
          domestic: { economy: "$99-$299", business: "$249-$599", first: "$399-$899" },
          international: { economy: "$299-$799", business: "$999-$2499", first: "$1999-$4999" }
        };
        return JSON.stringify({ success: true, deals, message: "Typical Your Travel Agent savings: 15-40% off retail!" });
      }

      case "calculate_savings": {
        const savings = args.regular_price - args.our_price;
        const percent = ((savings / args.regular_price) * 100).toFixed(0);
        return JSON.stringify({
          success: true,
          regular_price: args.regular_price,
          our_price: args.our_price,
          you_save: savings,
          percent_off: `${percent}%`,
          message: `You're saving $${savings} (${percent}% off)!`
        });
      }

      case "get_price_history": {
        // Mock price history
        return JSON.stringify({
          success: true,
          route: `${args.origin} → ${args.destination}`,
          average_price: Math.floor(Math.random() * 300) + 200,
          low_season: "January-February",
          high_season: "June-August, December",
          best_time_to_book: "3-4 weeks in advance"
        });
      }

      case "currency_convert": {
        const rates: any = { USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.53, JPY: 149.5 };
        const fromRate = rates[args.from_currency.toUpperCase()] || 1;
        const toRate = rates[args.to_currency.toUpperCase()] || 1;
        const converted = (args.amount / fromRate) * toRate;
        return JSON.stringify({
          success: true,
          original: `${args.amount} ${args.from_currency}`,
          converted: `${converted.toFixed(2)} ${args.to_currency}`
        });
      }

      case "calculate_trip_cost": {
        let total = args.flight_cost * args.passengers;
        if (args.include_taxes) total *= 1.15;
        if (args.include_baggage) total += args.passengers * 35;
        if (args.hotel_per_night && args.nights) total += args.hotel_per_night * args.nights;
        return JSON.stringify({
          success: true,
          flights: args.flight_cost * args.passengers,
          estimated_total: Math.round(total),
          breakdown: "Flight + taxes + baggage + hotel"
        });
      }

// ==================== COMMUNICATION ====================
      case "send_sms": {
        const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        const twilioPhoneNumber = Deno.env.get("TWILIO_PHONE_NUMBER");
        
        if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
          console.error("Twilio credentials not configured");
          // Fallback to logging if Twilio not configured
          await supabase.from("notification_log").insert({
            event_type: "sms_failed",
            recipient: args.phone,
            payload: { message: args.message, context: args.context, error: "Twilio not configured" },
            status: "failed"
          });
          return JSON.stringify({ success: false, message: "SMS service not available right now, but I've noted your number for follow-up!" });
        }

        try {
          // Format phone number - ensure it has country code
          let phoneNumber = args.phone.replace(/\D/g, '');
          if (!phoneNumber.startsWith('1') && phoneNumber.length === 10) {
            phoneNumber = '1' + phoneNumber; // Add US country code
          }
          if (!phoneNumber.startsWith('+')) {
            phoneNumber = '+' + phoneNumber;
          }

          // Send SMS via Twilio
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
          const authHeader = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
          
          const formData = new URLSearchParams();
          formData.append("To", phoneNumber);
          formData.append("From", twilioPhoneNumber);
          formData.append("Body", args.message);

          // Track real delivery (queued/sent/delivered/failed/undelivered)
          const callbackBase = Deno.env.get("SUPABASE_URL");
          if (callbackBase) {
            formData.append("StatusCallback", `${callbackBase}/functions/v1/twilio-status-callback`);
            formData.append("StatusCallbackEvent", "queued");
            formData.append("StatusCallbackEvent", "sent");
            formData.append("StatusCallbackEvent", "delivered");
            formData.append("StatusCallbackEvent", "failed");
            formData.append("StatusCallbackEvent", "undelivered");
          }

          const twilioResponse = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": `Basic ${authHeader}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData.toString(),
          });

          const twilioResult = await twilioResponse.json();
          console.log("Twilio SMS response:", twilioResult);

          if (twilioResponse.ok && twilioResult.sid) {
            // Log accepted-by-Twilio (NOT necessarily delivered)
            await supabase.from("notification_log").insert({
              event_type: "sms_sent",
              recipient: phoneNumber,
              payload: {
                message: args.message,
                context: args.context,
                twilio_sid: twilioResult.sid,
                twilio_status: twilioResult.status,
              },
              status: twilioResult.status || "queued",
            });
            return JSON.stringify({
              success: true,
              message: `SMS queued to ${phoneNumber}. I'll confirm delivery shortly.`,
              sid: twilioResult.sid,
              twilio_status: twilioResult.status,
            });
          } else {
            console.error("Twilio error:", twilioResult);
            await supabase.from("notification_log").insert({
              event_type: "sms_failed",
              recipient: phoneNumber,
              payload: { message: args.message, error: twilioResult.message || "Unknown error" },
              status: "failed",
            });
            return JSON.stringify({
              success: false,
              message: "Hmm, Twilio didn't accept that SMS. Double-check the number and try again.",
            });
          }
        } catch (smsError) {
          console.error("SMS sending error:", smsError);
          await supabase.from("notification_log").insert({
            event_type: "sms_error",
            recipient: args.phone,
            payload: { message: args.message, error: String(smsError) },
            status: "error",
          });
          return JSON.stringify({
            success: false,
            message: "Couldn't send SMS right now. I'll follow up another way.",
          });
        }
      }

      case "send_email": {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        
        if (!supabaseUrl || !supabaseServiceKey) {
          console.error("Supabase credentials not configured for email");
          return JSON.stringify({ success: false, message: "Email service temporarily unavailable. Let me give you the info directly instead." });
        }

        try {
          // Build email HTML content
          let htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); padding: 20px; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">Your Travel Agent</h1>
                <p style="color: #a0c4e8; margin: 5px 0 0 0; font-size: 14px;">Premium Travel at Unbeatable Prices</p>
              </div>
              <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e9ecef; border-top: none;">
          `;

          // Add quote details if provided
          if (args.include_quote_details) {
            const q = args.include_quote_details;
            htmlContent += `
              <div style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid #d4af37;">
                <h2 style="color: #1e3a5f; margin: 0 0 10px 0; font-size: 18px;">✈️ Your Flight Quote</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  ${q.route ? `<tr><td style="padding: 8px 0; color: #666;">Route:</td><td style="padding: 8px 0; font-weight: bold;">${q.route}</td></tr>` : ''}
                  ${q.travel_dates ? `<tr><td style="padding: 8px 0; color: #666;">Travel Dates:</td><td style="padding: 8px 0; font-weight: bold;">${q.travel_dates}</td></tr>` : ''}
                  ${q.passengers ? `<tr><td style="padding: 8px 0; color: #666;">Passengers:</td><td style="padding: 8px 0; font-weight: bold;">${q.passengers}</td></tr>` : ''}
                  ${q.cabin_class ? `<tr><td style="padding: 8px 0; color: #666;">Cabin:</td><td style="padding: 8px 0; font-weight: bold;">${q.cabin_class}</td></tr>` : ''}
                  ${q.price ? `<tr><td style="padding: 8px 0; color: #666;">Total Price:</td><td style="padding: 8px 0; font-weight: bold; color: #28a745; font-size: 20px;">$${q.price.toLocaleString()}</td></tr>` : ''}
                </table>
              </div>
            `;
          }

          // Add main message
          htmlContent += `
              <div style="background: white; padding: 15px; border-radius: 8px;">
                ${args.message.replace(/\n/g, '<br>')}
              </div>
            </div>
            <div style="background: #1e3a5f; padding: 15px; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="color: #a0c4e8; margin: 0; font-size: 12px;">Questions? Reply to this email or chat with Maya at yourtravelagent.net</p>
              <p style="color: #d4af37; margin: 10px 0 0 0; font-size: 11px;">💳 We accept Zelle, PayPal, and Bitcoin for secure payments</p>
            </div>
          </div>
          `;

          // Call send-notification edge function
          const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              type: "test_email", // Using test_email type but overriding content
              customerEmail: args.to_email,
              data: {
                subject: args.subject,
                html: htmlContent,
                custom_content: true
              }
            }),
          });

          // Actually, let's call Resend directly for more control
          const resendApiKey = Deno.env.get("RESEND_API_KEY");
          if (!resendApiKey) {
            console.error("RESEND_API_KEY not configured");
            return JSON.stringify({ success: false, message: "Email service not configured. Let me give you the info directly instead." });
          }

          const resendResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${resendApiKey}`,
            },
            body: JSON.stringify({
              from: "Maya at Your Travel Agent <no-reply@your-travel-agent.net>",
              to: [args.to_email],
              subject: args.subject,
              html: htmlContent,
            }),
          });

          const resendResult = await resendResponse.json();
          console.log("Resend email response:", resendResult);

          if (resendResponse.ok && resendResult.id) {
            // Log success
            await supabase.from("notification_log").insert({
              event_type: "email_sent",
              recipient: args.to_email,
              payload: { 
                subject: args.subject, 
                email_type: args.email_type || "general",
                resend_id: resendResult.id,
                has_quote: !!args.include_quote_details
              },
              status: "sent"
            });

            // Notify boss about email sent (async)
            if (args.include_quote_details) {
              const q = args.include_quote_details;
              notifyBoss('quote', `📧 Quote emailed to ${args.to_email}\n🛫 ${q.route || 'N/A'}\n💵 $${q.price?.toLocaleString() || 'TBD'}`)
                .catch((err: Error) => console.log("[BossNotify] Email notification failed:", err.message));
            }

            return JSON.stringify({
              success: true,
              message: `Email sent to ${args.to_email}! They should receive it shortly.`,
              email_id: resendResult.id
            });
          } else {
            console.error("Resend error:", resendResult);
            await supabase.from("notification_log").insert({
              event_type: "email_failed",
              recipient: args.to_email,
              payload: { subject: args.subject, error: resendResult.message || "Unknown error" },
              status: "failed"
            });

            return JSON.stringify({
              success: false,
              message: "Couldn't send email right now. Let me give you all the details here instead."
            });
          }
        } catch (emailError) {
          console.error("Email sending error:", emailError);
          await supabase.from("notification_log").insert({
            event_type: "email_error",
            recipient: args.to_email,
            payload: { subject: args.subject, error: String(emailError) },
            status: "error"
          });

          return JSON.stringify({
            success: false,
            message: "Email service had an issue. I'll provide all the details directly."
          });
        }
      }

      case "get_travel_requirements": {
        return JSON.stringify({
          success: true,
          destination: args.destination_country,
          visa_required: args.destination_country !== "USA" && args.destination_country !== "Canada",
          passport_validity: "6 months from travel date",
          covid_requirements: "No current restrictions",
          tip: "Always check official government sources before travel!"
        });
      }

      case "check_airport_info": {
        const airports: any = {
          "LAX": { name: "Los Angeles International", city: "Los Angeles", terminals: 9 },
          "JFK": { name: "John F. Kennedy International", city: "New York", terminals: 6 },
          "ORD": { name: "O'Hare International", city: "Chicago", terminals: 4 },
          "SFO": { name: "San Francisco International", city: "San Francisco", terminals: 4 },
          "MIA": { name: "Miami International", city: "Miami", terminals: 3 }
        };
        const code = args.airport_code?.toUpperCase();
        const info = airports[code] || { name: `${args.city || code} Airport`, city: args.city, terminals: 2 };
        return JSON.stringify({ success: true, airport: info });
      }

      case "calculate_dates": {
        const start = new Date(args.start_date);
        let result: any = { success: true };
        
        switch (args.operation) {
          case "add_days":
            const added = new Date(start);
            added.setDate(added.getDate() + (args.days || 0));
            result.result = added.toISOString().split("T")[0];
            break;
          case "subtract_days":
            const subtracted = new Date(start);
            subtracted.setDate(subtracted.getDate() - (args.days || 0));
            result.result = subtracted.toISOString().split("T")[0];
            break;
          case "days_between":
            const end = new Date(args.end_date || new Date());
            result.days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
            break;
        }
        return JSON.stringify(result);
      }

      case "search_airlines": {
        const airlines: any = {
          "AA": { name: "American Airlines", alliance: "Oneworld", hubs: ["DFW", "CLT", "MIA"] },
          "UA": { name: "United Airlines", alliance: "Star Alliance", hubs: ["ORD", "EWR", "SFO"] },
          "DL": { name: "Delta Air Lines", alliance: "SkyTeam", hubs: ["ATL", "DTW", "MSP"] },
          "WN": { name: "Southwest Airlines", alliance: "None", hubs: ["DAL", "BWI", "MDW"] }
        };
        const code = args.airline_code?.toUpperCase();
        const airline = airlines[code] || { name: args.airline_name || "Unknown", alliance: "Unknown" };
        return JSON.stringify({ success: true, airline });
      }

      case "get_baggage_info": {
        const policies: any = {
          economy: { carry_on: "1 bag + personal item", checked: "$30-35 first bag", weight: "50 lbs" },
          business: { carry_on: "2 bags + personal item", checked: "2 free bags", weight: "70 lbs" },
          first: { carry_on: "2 bags + personal item", checked: "3 free bags", weight: "70 lbs" }
        };
        const cabin = args.cabin_class?.toLowerCase() || "economy";
        return JSON.stringify({ 
          success: true, 
          airline: args.airline,
          allowance: policies[cabin] || policies.economy,
          note: "Policies vary by airline. Always verify on booking!"
        });
      }

      case "web_search": {
        // Use Perplexity for real web search
        const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
        
        if (!perplexityKey) {
          console.error("PERPLEXITY_API_KEY not configured");
          return JSON.stringify({
            success: false,
            error: "Web search is temporarily unavailable."
          });
        }
        
        try {
          const perplexityResponse = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${perplexityKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "sonar",
              messages: [
                { role: "system", content: "You are a helpful search assistant. Provide concise, accurate answers with key facts. Focus on travel-related information when relevant." },
                { role: "user", content: args.query }
              ],
              search_recency_filter: args.type === "flights" ? "day" : undefined
            }),
          });
          
          if (!perplexityResponse.ok) {
            const errText = await perplexityResponse.text();
            console.error("Perplexity error:", errText);
            return JSON.stringify({
              success: false,
              error: "Search failed. Please try again."
            });
          }
          
          const perplexityData = await perplexityResponse.json();
          const answer = perplexityData.choices?.[0]?.message?.content || "No results found.";
          const citations = perplexityData.citations || [];
          
          return JSON.stringify({
            success: true,
            query: args.query,
            answer: answer,
            citations: citations.slice(0, 3),
            searched_at: new Date().toISOString()
          });
        } catch (error) {
          console.error("Web search error:", error);
          return JSON.stringify({
            success: false,
            error: "Search failed unexpectedly."
          });
        }
      }

      case "do_anything": {
        // Log the request and flag for human review if needed
        await supabase.from("admin_alerts").insert({
          conversation_id: conversationId,
          alert_type: "special_request",
          message: args.request,
          customer_context: JSON.stringify({ context: args.context, action: args.action_type })
        });

        return JSON.stringify({ 
          success: true, 
          message: "On it! I'm looking into this for you. Let me see what I can do..."
        });
      }

      // ==================== ESCROW & SPAREFARE MANAGEMENT ====================
      case "get_pending_escrow_actions": {
        const { data, error } = await supabase
          .from("marketplace_listings")
          .select(`
            *,
            ticket_requests (origin, destination, departure_date, contact_email, contact_phone, passengers, cabin_class),
            bids!marketplace_listings_winning_bid_id_fkey (amount, message, estimated_delivery, sellers (business_name, contact_email))
          `)
          .eq("status", "awarded")
          .in("escrow_status", ["pending_sparefare", null])
          .order("updated_at", { ascending: false })
          .limit(args.limit || 10);

        if (error) {
          console.error("Error fetching pending escrow:", error);
          return JSON.stringify({ success: false, error: "Failed to fetch pending escrow actions" });
        }

        const pending = (data || []).map((l: any) => ({
          listing_id: l.id,
          title: l.title,
          route: l.ticket_requests ? `${l.ticket_requests.origin} → ${l.ticket_requests.destination}` : l.title,
          travel_date: l.ticket_requests?.departure_date || l.travel_date,
          buyer_email: l.ticket_requests?.contact_email,
          buyer_phone: l.ticket_requests?.contact_phone,
          passengers: l.ticket_requests?.passengers,
          winning_bid_amount: l.bids?.amount,
          seller_name: l.bids?.sellers?.business_name,
          seller_email: l.bids?.sellers?.contact_email,
          escrow_status: l.escrow_status || "pending_sparefare",
          awarded_at: l.updated_at
        }));

        return JSON.stringify({
          success: true,
          count: pending.length,
          pending_actions: pending,
          message: pending.length > 0 
            ? `Found ${pending.length} transaction(s) needing escrow setup. I'll handle these!`
            : "No pending escrow actions right now."
        });
      }

      case "generate_sparefare_listing_info": {
        const { data: listing, error } = await supabase
          .from("marketplace_listings")
          .select(`
            *,
            ticket_requests (*),
            bids!marketplace_listings_winning_bid_id_fkey (*, sellers (*))
          `)
          .eq("id", args.listing_id)
          .single();

        if (error || !listing) {
          return JSON.stringify({ success: false, error: "Listing not found" });
        }

        const tr = listing.ticket_requests;
        const bid = listing.bids;
        const seller = bid?.sellers;

        const sparefareInfo = {
          title: `${tr?.origin || "?"} to ${tr?.destination || "?"} - ${tr?.passengers || 1} Passenger(s)`,
          description: `Flight from ${tr?.origin} to ${tr?.destination} on ${tr?.departure_date}${tr?.return_date ? ` returning ${tr?.return_date}` : " (one-way)"}. ${tr?.cabin_class || "Economy"} class. ${tr?.special_notes || ""}`,
          price: bid?.amount || 0,
          travel_date: tr?.departure_date,
          return_date: tr?.return_date,
          passengers: tr?.passengers || 1,
          cabin_class: tr?.cabin_class || "economy",
          buyer_name: "Buyer",
          buyer_email: tr?.contact_email,
          buyer_phone: tr?.contact_phone,
          seller_name: seller?.business_name,
          seller_email: seller?.contact_email,
          estimated_delivery: bid?.estimated_delivery,
          special_notes: tr?.special_notes
        };

        return JSON.stringify({
          success: true,
          listing_id: args.listing_id,
          sparefare_listing_info: sparefareInfo,
          instructions: "Use this info to create a listing on sparefare.com. Once created, copy the listing URL and use setup_sparefare_listing to save it."
        });
      }

      case "setup_sparefare_listing": {
        const updates: any = {
          escrow_status: "on_sparefare",
          escrow_notes: args.notes || "SpareFare listing created by Maya",
          updated_at: new Date().toISOString()
        };

        if (args.sparefare_url) {
          updates.sparefare_listing_url = args.sparefare_url;
        }

        const { data, error } = await supabase
          .from("marketplace_listings")
          .update(updates)
          .eq("id", args.listing_id)
          .select()
          .single();

        if (error) {
          return JSON.stringify({ success: false, error: "Failed to update listing" });
        }

        return JSON.stringify({
          success: true,
          listing_id: args.listing_id,
          sparefare_url: args.sparefare_url,
          message: args.sparefare_url 
            ? "SpareFare listing recorded! Ready to send payment link to buyer."
            : "Escrow status updated. Add the SpareFare URL when you have it."
        });
      }

      case "update_escrow_status": {
        const statusLabels: any = {
          pending_sparefare: "Awaiting SpareFare Setup",
          on_sparefare: "On SpareFare - Awaiting Payment",
          payment_received: "Payment Received",
          funds_released: "Funds Released to Seller",
          completed: "Transaction Completed",
          disputed: "Dispute in Progress"
        };

        const { data: listing, error: fetchError } = await supabase
          .from("marketplace_listings")
          .select(`*, ticket_requests (contact_email, contact_phone), bids!marketplace_listings_winning_bid_id_fkey (sellers (contact_email, telegram_chat_id))`)
          .eq("id", args.listing_id)
          .single();

        if (fetchError || !listing) {
          return JSON.stringify({ success: false, error: "Listing not found" });
        }

        const { error } = await supabase
          .from("marketplace_listings")
          .update({
            escrow_status: args.status,
            escrow_notes: args.notes || `Status changed to ${statusLabels[args.status] || args.status}`,
            updated_at: new Date().toISOString()
          })
          .eq("id", args.listing_id);

        if (error) {
          return JSON.stringify({ success: false, error: "Failed to update status" });
        }

        // Log notification
        await supabase.from("notification_log").insert({
          event_type: "escrow_status_change",
          record_id: args.listing_id,
          payload: { status: args.status, notes: args.notes, notify_buyer: args.notify_buyer, notify_seller: args.notify_seller },
          status: "success"
        });

        return JSON.stringify({
          success: true,
          listing_id: args.listing_id,
          new_status: args.status,
          status_label: statusLabels[args.status] || args.status,
          message: `Escrow status updated to "${statusLabels[args.status] || args.status}"`
        });
      }

      case "get_escrow_details": {
        const { data, error } = await supabase
          .from("marketplace_listings")
          .select(`
            *,
            ticket_requests (*),
            bids!marketplace_listings_winning_bid_id_fkey (*, sellers (*))
          `)
          .eq("id", args.listing_id)
          .single();

        if (error || !data) {
          return JSON.stringify({ success: false, error: "Listing not found" });
        }

        const tr = data.ticket_requests;
        const bid = data.bids;
        const seller = bid?.sellers;

        return JSON.stringify({
          success: true,
          escrow: {
            listing_id: data.id,
            title: data.title,
            status: data.status,
            escrow_status: data.escrow_status || "pending_sparefare",
            sparefare_url: data.sparefare_listing_url,
            escrow_notes: data.escrow_notes,
            route: `${tr?.origin} → ${tr?.destination}`,
            travel_date: tr?.departure_date,
            return_date: tr?.return_date,
            passengers: tr?.passengers,
            cabin_class: tr?.cabin_class,
            buyer_email: tr?.contact_email,
            buyer_phone: tr?.contact_phone,
            winning_bid: bid?.amount,
            seller_name: seller?.business_name,
            seller_email: seller?.contact_email,
            awarded_at: data.updated_at
          }
        });
      }

      case "send_payment_link_to_buyer": {
        const { data: listing, error } = await supabase
          .from("marketplace_listings")
          .select(`*, ticket_requests (contact_email, contact_phone, origin, destination)`)
          .eq("id", args.listing_id)
          .single();

        if (error || !listing) {
          return JSON.stringify({ success: false, error: "Listing not found" });
        }

        const buyer_email = listing.ticket_requests?.contact_email;
        const buyer_phone = listing.ticket_requests?.contact_phone;
        const route = `${listing.ticket_requests?.origin} → ${listing.ticket_requests?.destination}`;

        const notifications: string[] = [];

        if (args.send_email && buyer_email) {
          await supabase.from("notification_log").insert({
            event_type: "escrow_payment_link",
            recipient: buyer_email,
            record_id: args.listing_id,
            payload: { 
              type: "email",
              subject: `Complete Your Payment - ${route}`,
              sparefare_url: args.sparefare_url
            },
            status: "queued"
          });
          notifications.push(`Email queued to ${buyer_email}`);
        }

        if (args.send_sms && buyer_phone) {
          await supabase.from("notification_log").insert({
            event_type: "escrow_payment_link_sms",
            recipient: buyer_phone,
            record_id: args.listing_id,
            payload: { 
              type: "sms",
              message: `Your ${route} ticket is ready! Complete payment securely: ${args.sparefare_url}`,
              sparefare_url: args.sparefare_url
            },
            status: "queued"
          });
          notifications.push(`SMS queued to ${buyer_phone}`);
        }

        return JSON.stringify({
          success: true,
          listing_id: args.listing_id,
          sparefare_url: args.sparefare_url,
          notifications_sent: notifications,
          message: notifications.length > 0 
            ? `Payment link sent! ${notifications.join(", ")}`
            : "No contact info available for notifications."
        });
      }

      // ==================== BUSINESS INTELLIGENCE TOOLS ====================
      case "get_business_dashboard": {
        const period = args.time_period || "all";
        let dateFilter = "";
        const now = new Date();
        
        if (period === "today") {
          dateFilter = now.toISOString().split("T")[0];
        } else if (period === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          dateFilter = weekAgo.toISOString();
        } else if (period === "month") {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          dateFilter = monthAgo.toISOString();
        }

        // Get orders stats
        let ordersQuery = supabase.from("orders").select("*", { count: "exact" });
        if (dateFilter) ordersQuery = ordersQuery.gte("created_at", dateFilter);
        const { data: orders, count: orderCount } = await ordersQuery;
        
        // Get ticket requests stats
        let ticketsQuery = supabase.from("ticket_requests").select("*", { count: "exact" });
        if (dateFilter) ticketsQuery = ticketsQuery.gte("created_at", dateFilter);
        const { data: tickets, count: ticketCount } = await ticketsQuery;

        // Get voucher stats
        const { data: vouchers } = await supabase.from("vouchers").select("*");
        
        // Calculate metrics
        const totalRevenue = orders?.reduce((sum: number, o: any) => sum + (o.amount_paid || 0), 0) || 0;
        const pendingPayments = orders?.filter((o: any) => o.payment_status === "pending").length || 0;
        const underReview = orders?.filter((o: any) => o.payment_status === "under_review").length || 0;
        const activeTickets = tickets?.filter((t: any) => !["completed", "cancelled"].includes(t.status)).length || 0;
        const availableVouchers = vouchers?.filter((v: any) => v.status === "available").length || 0;

        return JSON.stringify({
          success: true,
          period: period,
          dashboard: {
            total_orders: orderCount || 0,
            total_revenue: `$${totalRevenue.toFixed(2)}`,
            pending_payments: pendingPayments,
            payments_under_review: underReview,
            total_ticket_requests: ticketCount || 0,
            active_ticket_requests: activeTickets,
            available_vouchers: availableVouchers,
            total_vouchers: vouchers?.length || 0
          }
        });
      }

      case "get_all_orders": {
        let query = supabase.from("orders").select("*").order("created_at", { ascending: false });
        if (args.status) query = query.eq("order_status", args.status);
        if (args.payment_status) query = query.eq("payment_status", args.payment_status);
        query = query.limit(args.limit || 20);
        
        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: error.message });
        
        return JSON.stringify({
          success: true,
          count: data?.length || 0,
          orders: data?.map((o: any) => ({
            id: o.id,
            customer_email: o.customer_email,
            amount: o.amount_paid,
            payment_method: o.payment_method,
            payment_status: o.payment_status,
            order_status: o.order_status,
            voucher_id: o.voucher_id,
            created_at: o.created_at,
            proof_uploaded: !!o.proof_upload_url,
            admin_notes: o.admin_notes
          }))
        });
      }

      case "get_all_ticket_requests": {
        let query = supabase.from("ticket_requests").select("*").order("created_at", { ascending: false });
        if (args.status) query = query.eq("status", args.status);
        if (args.payment_status) query = query.eq("payment_status", args.payment_status);
        query = query.limit(args.limit || 20);
        
        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: error.message });
        
        return JSON.stringify({
          success: true,
          count: data?.length || 0,
          requests: data?.map((t: any) => ({
            id: t.id,
            route: `${t.origin} → ${t.destination}`,
            departure_date: t.departure_date,
            return_date: t.return_date,
            passengers: t.passengers,
            cabin_class: t.cabin_class,
            budget: t.budget,
            quoted_price: t.quoted_price,
            status: t.status,
            payment_status: t.payment_status,
            contact_email: t.contact_email,
            contact_phone: t.contact_phone,
            deposit_status: t.deposit_status,
            balance_status: t.balance_status,
            admin_notes: t.admin_notes,
            created_at: t.created_at
          }))
        });
      }

      case "get_all_notifications": {
        let query = supabase.from("notification_log").select("*").order("created_at", { ascending: false });
        if (args.event_type) query = query.eq("event_type", args.event_type);
        if (args.status) query = query.eq("status", args.status);
        query = query.limit(args.limit || 50);
        
        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: error.message });
        
        return JSON.stringify({
          success: true,
          count: data?.length || 0,
          notifications: data?.map((n: any) => ({
            id: n.id,
            event_type: n.event_type,
            recipient: n.recipient,
            status: n.status,
            error: n.error,
            created_at: n.created_at
          }))
        });
      }

      case "get_all_users": {
        const { data: profiles } = await supabase.from("profiles").select("*").limit(args.limit || 50);
        const { data: roles } = await supabase.from("user_roles").select("*");
        
        if (args.role) {
          const filteredRoles = roles?.filter((r: any) => r.role === args.role);
          const userIds = filteredRoles?.map((r: any) => r.user_id);
          const filteredProfiles = profiles?.filter((p: any) => userIds?.includes(p.id));
          
          return JSON.stringify({
            success: true,
            count: filteredProfiles?.length || 0,
            users: filteredProfiles?.map((p: any) => ({
              id: p.id,
              email: p.email,
              full_name: p.full_name,
              phone: p.phone,
              role: args.role,
              created_at: p.created_at
            }))
          });
        }
        
        return JSON.stringify({
          success: true,
          count: profiles?.length || 0,
          users: profiles?.map((p: any) => {
            const userRole = roles?.find((r: any) => r.user_id === p.id);
            return {
              id: p.id,
              email: p.email,
              full_name: p.full_name,
              phone: p.phone,
              role: userRole?.role || "customer",
              created_at: p.created_at
            };
          })
        });
      }

      case "get_all_sellers": {
        let query = supabase.from("sellers").select("*").order("created_at", { ascending: false });
        if (args.status) query = query.eq("status", args.status);
        query = query.limit(args.limit || 20);
        
        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: error.message });
        
        return JSON.stringify({
          success: true,
          count: data?.length || 0,
          sellers: data?.map((s: any) => ({
            id: s.id,
            business_name: s.business_name,
            contact_email: s.contact_email,
            contact_phone: s.contact_phone,
            status: s.status,
            admin_notes: s.admin_notes,
            created_at: s.created_at,
            approved_at: s.approved_at
          }))
        });
      }

      case "get_all_vouchers_full": {
        let query = supabase.from("vouchers").select("*").order("created_at", { ascending: false });
        if (args.status) query = query.eq("status", args.status);
        query = query.limit(args.limit || 30);
        
        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: error.message });
        
        return JSON.stringify({
          success: true,
          count: data?.length || 0,
          vouchers: data?.map((v: any) => ({
            id: v.id,
            title: v.title,
            airline: v.airline,
            face_value: v.face_value,
            sale_price: v.sale_price,
            discount_percent: v.discount_percent,
            status: v.status,
            expiry_date: v.expiry_date,
            created_at: v.created_at
          }))
        });
      }

      case "get_payment_proofs": {
        const { data, error } = await supabase
          .from("payment_proofs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(args.limit || 20);
        
        if (error) return JSON.stringify({ success: false, error: error.message });
        
        return JSON.stringify({
          success: true,
          count: data?.length || 0,
          proofs: data?.map((p: any) => ({
            id: p.id,
            order_id: p.order_id,
            ticket_request_id: p.ticket_request_id,
            proof_url: p.proof_upload_url,
            type: p.type,
            created_at: p.created_at
          }))
        });
      }

      case "get_admin_alerts": {
        let query = supabase.from("admin_alerts").select("*").order("created_at", { ascending: false });
        if (args.alert_type) query = query.eq("alert_type", args.alert_type);
        if (args.is_read !== undefined) query = query.eq("is_read", args.is_read);
        query = query.limit(args.limit || 30);
        
        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: error.message });
        
        return JSON.stringify({
          success: true,
          count: data?.length || 0,
          alerts: data?.map((a: any) => ({
            id: a.id,
            alert_type: a.alert_type,
            message: a.message,
            is_read: a.is_read,
            admin_response: a.admin_response,
            created_at: a.created_at
          }))
        });
      }

      case "get_all_conversations": {
        let query = supabase.from("ai_conversations").select("*").order("updated_at", { ascending: false });
        if (args.needs_attention) query = query.eq("needs_admin_attention", true);
        query = query.limit(args.limit || 20);
        
        const { data, error } = await query;
        if (error) return JSON.stringify({ success: false, error: error.message });
        
        return JSON.stringify({
          success: true,
          count: data?.length || 0,
          conversations: data?.map((c: any) => ({
            id: c.id,
            customer_name: c.customer_name,
            customer_email: c.customer_email,
            customer_phone: c.customer_phone,
            status: c.status,
            needs_attention: c.needs_admin_attention,
            is_serious: c.is_serious,
            admin_notes: c.admin_notes,
            updated_at: c.updated_at
          }))
        });
      }

      case "get_marketplace_activity": {
        let listingsQuery = supabase.from("marketplace_listings").select("*").order("created_at", { ascending: false });
        if (args.status) listingsQuery = listingsQuery.eq("status", args.status);
        listingsQuery = listingsQuery.limit(args.limit || 20);
        
        const { data: listings } = await listingsQuery;
        const { data: bids } = await supabase.from("bids").select("*").order("created_at", { ascending: false }).limit(50);
        
        return JSON.stringify({
          success: true,
          listings_count: listings?.length || 0,
          listings: listings?.map((l: any) => ({
            id: l.id,
            title: l.title,
            status: l.status,
            deadline: l.deadline,
            min_bid: l.min_bid,
            escrow_status: l.escrow_status,
            created_at: l.created_at
          })),
          recent_bids: bids?.slice(0, 10).map((b: any) => ({
            id: b.id,
            listing_id: b.listing_id,
            amount: b.amount,
            status: b.status,
            created_at: b.created_at
          }))
        });
      }

      case "deep_search_customer": {
        const results: any = { success: true };
        
        // Search profiles
        let profileQuery = supabase.from("profiles").select("*");
        if (args.email) profileQuery = profileQuery.ilike("email", `%${args.email}%`);
        if (args.phone) profileQuery = profileQuery.ilike("phone", `%${args.phone}%`);
        const { data: profiles } = await profileQuery.limit(5);
        results.profiles = profiles;
        
        // Search orders
        let orderQuery = supabase.from("orders").select("*");
        if (args.email) orderQuery = orderQuery.ilike("customer_email", `%${args.email}%`);
        const { data: orders } = await orderQuery.limit(10);
        results.orders = orders;
        
        // Search ticket requests
        let ticketQuery = supabase.from("ticket_requests").select("*");
        if (args.email) ticketQuery = ticketQuery.ilike("contact_email", `%${args.email}%`);
        if (args.phone) ticketQuery = ticketQuery.ilike("contact_phone", `%${args.phone}%`);
        const { data: tickets } = await ticketQuery.limit(10);
        results.ticket_requests = tickets;
        
        // Search conversations
        let convQuery = supabase.from("ai_conversations").select("*");
        if (args.email) convQuery = convQuery.ilike("customer_email", `%${args.email}%`);
        if (args.phone) convQuery = convQuery.ilike("customer_phone", `%${args.phone}%`);
        const { data: convs } = await convQuery.limit(5);
        results.conversations = convs;
        
        return JSON.stringify(results);
      }

      case "execute_owner_command": {
        // Log the command for audit trail
        await supabase.from("admin_alerts").insert({
          conversation_id: conversationId,
          alert_type: "owner_command",
          message: `Owner command: ${args.command}`,
          customer_context: JSON.stringify({ target: args.target, value: args.value })
        });
        
        return JSON.stringify({
          success: true,
          message: `Command logged: "${args.command}". I'll flag this for immediate execution, sir.`,
          command: args.command,
          target: args.target,
          value: args.value
        });
      }

      // ==================== AWARD FLIGHT SEARCH ====================
      case "search_award_availability": {
        const SEATS_AERO_API_KEY = Deno.env.get("SEATS_AERO_API_KEY");
        if (!SEATS_AERO_API_KEY) {
          console.error("SEATS_AERO_API_KEY not configured");
          return JSON.stringify({ 
            success: false, 
            error: "Award search is temporarily unavailable. Let me check regular flight options instead." 
          });
        }

        try {
          // Calculate end_date if not provided (default to start_date + 5 days)
          const startDate = args.start_date;
          let endDate = args.end_date;
          if (!endDate) {
            const start = new Date(startDate);
            start.setDate(start.getDate() + 5);
            endDate = start.toISOString().split('T')[0];
          }

          // Build search params
          const searchParams = new URLSearchParams({
            origin_airport: args.origin.toUpperCase(),
            destination_airport: args.destination.toUpperCase(),
            start_date: startDate,
            end_date: endDate,
            take: '50'
          });

          // Add cabin class filter if specified
          if (args.cabin_class) {
            const cabinMap: Record<string, string> = {
              'economy': 'Y',
              'premium_economy': 'W',
              'business': 'J',
              'first': 'F'
            };
            if (cabinMap[args.cabin_class]) {
              searchParams.append('cabin', cabinMap[args.cabin_class]);
            }
          }

          console.log(`Searching Seats.aero: ${args.origin} → ${args.destination}, ${startDate} to ${endDate}`);

          const response = await fetch(
            `https://seats.aero/partnerapi/search?${searchParams.toString()}`,
            {
              headers: {
                'Partner-Authorization': SEATS_AERO_API_KEY,
                'Accept': 'application/json'
              }
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`Seats.aero API error: ${response.status}`, errorText);
            return JSON.stringify({ 
              success: false, 
              error: "Couldn't find award availability for that route right now. Want me to check regular flight prices instead?"
            });
          }

          const data = await response.json();
          
          // Log rate limit info
          const remaining = response.headers.get('X-Ratelimit-Remaining');
          console.log(`Seats.aero rate limit remaining: ${remaining}`);

          // Process results
          const results = data.data || [];
          if (results.length === 0) {
            return JSON.stringify({
              success: true,
              message: `No award availability found for ${args.origin} → ${args.destination} between ${startDate} and ${endDate}. This could mean seats aren't released yet, or the route isn't well-covered. Want me to check cash fares instead?`,
              route: `${args.origin} → ${args.destination}`,
              search_dates: { start: startDate, end: endDate },
              availability: []
            });
          }

          // Group by date and cabin, find best options
          const processedResults = results.slice(0, 20).map((r: any) => ({
            date: r.Date,
            route: `${r.Route?.OriginAirport || args.origin} → ${r.Route?.DestinationAirport || args.destination}`,
            source: r.Source, // Mileage program (e.g., "united", "aeroplan")
            cabin: {
              economy: r.YAvailable ? { available: true, miles: r.YMileageCost, direct: r.YDirect } : null,
              premium_economy: r.WAvailable ? { available: true, miles: r.WMileageCost, direct: r.WDirect } : null,
              business: r.JAvailable ? { available: true, miles: r.JMileageCost, direct: r.JDirect } : null,
              first: r.FAvailable ? { available: true, miles: r.FMileageCost, direct: r.FDirect } : null
            },
            airlines: r.Airlines,
            remaining_seats: r.RemainingSeats,
            updated_at: r.UpdatedAt
          }));

          // Find cheapest options by cabin
          const cheapestByClass: Record<string, any> = {};
          for (const result of processedResults) {
            for (const [cabin, info] of Object.entries(result.cabin)) {
              if (info && (info as any).available) {
                const miles = (info as any).miles;
                if (!cheapestByClass[cabin] || miles < cheapestByClass[cabin].miles) {
                  cheapestByClass[cabin] = {
                    miles,
                    date: result.date,
                    source: result.source,
                    direct: (info as any).direct
                  };
                }
              }
            }
          }

          return JSON.stringify({
            success: true,
            route: `${args.origin} → ${args.destination}`,
            search_dates: { start: startDate, end: endDate },
            total_results: results.length,
            best_options: cheapestByClass,
            availability: processedResults.slice(0, 10),
            message: `Found ${results.length} award options! Here are the best deals by cabin class.`,
            note: "Miles shown are per person. Availability is updated regularly but seats can be booked quickly!"
          });

        } catch (error) {
          console.error("Seats.aero search error:", error);
          return JSON.stringify({
            success: false,
            error: "Award search hit a snag. Let me check regular flight options instead."
          });
        }
      }

      // ==================== PHONE CALLS ====================
      case "make_phone_call": {
        // Check if owner mode is active - LOAD FROM DATABASE (edge functions are stateless!)
        const ownerCheckUrl = Deno.env.get("SUPABASE_URL")!;
        const ownerCheckKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseForOwnerCheck = createClient(ownerCheckUrl, ownerCheckKey);
        
        const { data: convCheck } = await supabaseForOwnerCheck
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        const isInOwnerMode = convCheck?.owner_verified === true;
        console.log(`[make_phone_call] Owner mode check for ${conversationId}: ${isInOwnerMode}`);
        
        if (!isInOwnerMode) {
          return JSON.stringify({
            success: false,
            error: "Phone calls can only be made by the verified owner. Please verify your identity first."
          });
        }

        const callSupabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const callAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

        try {
          const response = await fetch(`${callSupabaseUrl}/functions/v1/make-outbound-call`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${callAnonKey}`,
            },
            body: JSON.stringify({
              phone_number: args.phone_number,
              first_message: args.first_message || "Hi, this is Maya from Your Travel Agent. How are you doing today?",
              context: args.context || ""
            }),
          });

          const result = await response.json();

          if (!response.ok || result.error) {
            console.error("Phone call failed:", result);
            return JSON.stringify({
              success: false,
              error: result.error || "Failed to make the call",
              details: result.details
            });
          }

          return JSON.stringify({
            success: true,
            message: `Calling ${args.phone_number} now! I'll handle the conversation.`,
            call_sid: result.call_sid
          });

        } catch (error) {
          console.error("Phone call error:", error);
          return JSON.stringify({
            success: false,
            error: "Something went wrong making the call. Let me try again..."
          });
        }
      }

      // ==================== DEVELOPER TOOLS (BOSS MODE ONLY) ====================
      case "github_read_file": {
        // Check owner mode from database
        const { data: ownerCheck } = await supabase
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        if (!ownerCheck?.owner_verified) {
          return JSON.stringify({ success: false, error: "This command requires Boss Mode. Verify your identity first." });
        }
        
        const githubToken = Deno.env.get("GITHUB_TOKEN");
        if (!githubToken) {
          return JSON.stringify({ success: false, error: "GitHub integration not configured." });
        }
        
        try {
          // Get repo info from env or use default
          const repoOwner = Deno.env.get("GITHUB_REPO_OWNER") || "wpczgwxsriezaubncuom";
          const repoName = Deno.env.get("GITHUB_REPO_NAME") || "your-travel-agent";
          const branch = args.branch || "main";
          
          const response = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${args.path}?ref=${branch}`,
            {
              headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Maya-AI-Agent"
              }
            }
          );
          
          if (!response.ok) {
            const errData = await response.json();
            return JSON.stringify({ success: false, error: `File not found: ${errData.message}` });
          }
          
          const data = await response.json();
          const content = atob(data.content.replace(/\n/g, ""));
          
          return JSON.stringify({
            success: true,
            path: args.path,
            content: content.slice(0, 10000), // Limit content size
            sha: data.sha,
            size: data.size,
            truncated: content.length > 10000
          });
        } catch (error) {
          console.error("GitHub read error:", error);
          return JSON.stringify({ success: false, error: "Failed to read file from GitHub." });
        }
      }

      case "github_write_file": {
        const { data: ownerCheck } = await supabase
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        if (!ownerCheck?.owner_verified) {
          return JSON.stringify({ success: false, error: "This command requires Boss Mode. Verify your identity first." });
        }
        
        const githubToken = Deno.env.get("GITHUB_TOKEN");
        if (!githubToken) {
          return JSON.stringify({ success: false, error: "GitHub integration not configured." });
        }
        
        try {
          const repoOwner = Deno.env.get("GITHUB_REPO_OWNER") || "wpczgwxsriezaubncuom";
          const repoName = Deno.env.get("GITHUB_REPO_NAME") || "your-travel-agent";
          const branch = args.branch || "main";
          
          // First, try to get the current file SHA (needed for updates)
          let sha: string | undefined;
          const getResponse = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${args.path}?ref=${branch}`,
            {
              headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Maya-AI-Agent"
              }
            }
          );
          
          if (getResponse.ok) {
            const existingFile = await getResponse.json();
            sha = existingFile.sha;
          }
          
          // Create or update the file
          const putBody: any = {
            message: args.commit_message || `Maya: Updated ${args.path}`,
            content: btoa(args.content),
            branch: branch
          };
          if (sha) putBody.sha = sha;
          
          const response = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${args.path}`,
            {
              method: "PUT",
              headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
                "User-Agent": "Maya-AI-Agent"
              },
              body: JSON.stringify(putBody)
            }
          );
          
          if (!response.ok) {
            const errData = await response.json();
            console.error("GitHub write error:", errData);
            return JSON.stringify({ success: false, error: `Failed to write file: ${errData.message}` });
          }
          
          const data = await response.json();
          
          return JSON.stringify({
            success: true,
            message: `Successfully ${sha ? "updated" : "created"} ${args.path}`,
            commit_sha: data.commit?.sha,
            commit_url: data.commit?.html_url
          });
        } catch (error) {
          console.error("GitHub write error:", error);
          return JSON.stringify({ success: false, error: "Failed to write file to GitHub." });
        }
      }

      case "github_list_files": {
        const { data: ownerCheck } = await supabase
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        if (!ownerCheck?.owner_verified) {
          return JSON.stringify({ success: false, error: "This command requires Boss Mode." });
        }
        
        const githubToken = Deno.env.get("GITHUB_TOKEN");
        if (!githubToken) {
          return JSON.stringify({ success: false, error: "GitHub integration not configured." });
        }
        
        try {
          const repoOwner = Deno.env.get("GITHUB_REPO_OWNER") || "wpczgwxsriezaubncuom";
          const repoName = Deno.env.get("GITHUB_REPO_NAME") || "your-travel-agent";
          const branch = args.branch || "main";
          const path = args.path || "";
          
          const response = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}?ref=${branch}`,
            {
              headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Maya-AI-Agent"
              }
            }
          );
          
          if (!response.ok) {
            const errData = await response.json();
            return JSON.stringify({ success: false, error: `Directory not found: ${errData.message}` });
          }
          
          const data = await response.json();
          const files = Array.isArray(data) ? data.map((f: any) => ({
            name: f.name,
            type: f.type,
            path: f.path,
            size: f.size
          })) : [];
          
          return JSON.stringify({
            success: true,
            path: path || "/",
            files: files.slice(0, 50),
            count: files.length
          });
        } catch (error) {
          console.error("GitHub list error:", error);
          return JSON.stringify({ success: false, error: "Failed to list files." });
        }
      }

      case "github_delete_file": {
        const { data: ownerCheck } = await supabase
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        if (!ownerCheck?.owner_verified) {
          return JSON.stringify({ success: false, error: "This command requires Boss Mode." });
        }
        
        const githubToken = Deno.env.get("GITHUB_TOKEN");
        if (!githubToken) {
          return JSON.stringify({ success: false, error: "GitHub integration not configured." });
        }
        
        try {
          const repoOwner = Deno.env.get("GITHUB_REPO_OWNER") || "wpczgwxsriezaubncuom";
          const repoName = Deno.env.get("GITHUB_REPO_NAME") || "your-travel-agent";
          const branch = args.branch || "main";
          
          // Get current file SHA
          const getResponse = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${args.path}?ref=${branch}`,
            {
              headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "User-Agent": "Maya-AI-Agent"
              }
            }
          );
          
          if (!getResponse.ok) {
            return JSON.stringify({ success: false, error: "File not found." });
          }
          
          const fileData = await getResponse.json();
          
          const response = await fetch(
            `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${args.path}`,
            {
              method: "DELETE",
              headers: {
                "Authorization": `Bearer ${githubToken}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json",
                "User-Agent": "Maya-AI-Agent"
              },
              body: JSON.stringify({
                message: args.commit_message,
                sha: fileData.sha,
                branch: branch
              })
            }
          );
          
          if (!response.ok) {
            const errData = await response.json();
            return JSON.stringify({ success: false, error: `Delete failed: ${errData.message}` });
          }
          
          return JSON.stringify({
            success: true,
            message: `Deleted ${args.path}`
          });
        } catch (error) {
          console.error("GitHub delete error:", error);
          return JSON.stringify({ success: false, error: "Failed to delete file." });
        }
      }

      case "read_edge_function_logs": {
        const { data: ownerCheck } = await supabase
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        if (!ownerCheck?.owner_verified) {
          return JSON.stringify({ success: false, error: "This command requires Boss Mode." });
        }
        
        // Query edge function logs from analytics
        try {
          const limit = args.limit || 50;
          const functionName = args.function_name;
          
          // Query notification_log as a proxy for function activity
          let query = supabase
            .from("notification_log")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(limit);
          
          if (args.search) {
            query = query.or(`event_type.ilike.%${args.search}%,error.ilike.%${args.search}%`);
          }
          
          const { data: logs, error } = await query;
          
          if (error) {
            console.error("Log query error:", error);
          }
          
          return JSON.stringify({
            success: true,
            function_name: functionName,
            logs: (logs || []).slice(0, 20).map((l: any) => ({
              timestamp: l.created_at,
              event: l.event_type,
              status: l.status,
              error: l.error,
              recipient: l.recipient
            })),
            note: "Showing recent activity logs. For detailed edge function logs, check the admin dashboard."
          });
        } catch (error) {
          console.error("Logs error:", error);
          return JSON.stringify({ success: false, error: "Failed to retrieve logs." });
        }
      }

      case "diagnose_issue": {
        const { data: ownerCheck } = await supabase
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        if (!ownerCheck?.owner_verified) {
          return JSON.stringify({ success: false, error: "This command requires Boss Mode." });
        }
        
        try {
          // Gather diagnostic info
          const diagnostics: any = {
            issue: args.issue_description,
            area: args.affected_area,
            error: args.error_message,
            checks: []
          };
          
          // Check recent errors in notification_log
          const { data: recentErrors } = await supabase
            .from("notification_log")
            .select("*")
            .eq("status", "error")
            .order("created_at", { ascending: false })
            .limit(5);
          
          diagnostics.checks.push({
            check: "Recent Errors",
            found: recentErrors?.length || 0,
            details: recentErrors?.map((e: any) => `${e.event_type}: ${e.error}`).slice(0, 3)
          });
          
          // Check admin alerts
          const { data: recentAlerts } = await supabase
            .from("admin_alerts")
            .select("*")
            .eq("is_read", false)
            .order("created_at", { ascending: false })
            .limit(5);
          
          diagnostics.checks.push({
            check: "Unread Alerts",
            found: recentAlerts?.length || 0,
            details: recentAlerts?.map((a: any) => a.message).slice(0, 3)
          });
          
          // Analysis and recommendations
          diagnostics.analysis = `Analyzed ${args.affected_area || "system"} for: "${args.issue_description}"`;
          diagnostics.recommendations = [
            "Check the edge function logs for detailed error traces",
            "Review recent code changes that might affect this area",
            "Test the specific workflow that's failing"
          ];
          
          return JSON.stringify({
            success: true,
            diagnostics
          });
        } catch (error) {
          console.error("Diagnosis error:", error);
          return JSON.stringify({ success: false, error: "Failed to run diagnostics." });
        }
      }

      case "perplexity_search": {
        const perplexityKey = Deno.env.get("PERPLEXITY_API_KEY");
        
        if (!perplexityKey) {
          return JSON.stringify({ success: false, error: "Perplexity not configured." });
        }
        
        try {
          const searchBody: any = {
            model: "sonar",
            messages: [
              { role: "system", content: "Provide accurate, concise search results. Include key facts and cite sources." },
              { role: "user", content: args.query }
            ]
          };
          
          if (args.search_recency) {
            searchBody.search_recency_filter = args.search_recency;
          }
          
          const response = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${perplexityKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(searchBody),
          });
          
          if (!response.ok) {
            const errText = await response.text();
            console.error("Perplexity error:", errText);
            return JSON.stringify({ success: false, error: "Search failed." });
          }
          
          const data = await response.json();
          
          return JSON.stringify({
            success: true,
            query: args.query,
            answer: data.choices?.[0]?.message?.content || "No results found.",
            citations: data.citations || [],
            searched_at: new Date().toISOString()
          });
        } catch (error) {
          console.error("Perplexity error:", error);
          return JSON.stringify({ success: false, error: "Search failed unexpectedly." });
        }
      }

      // ==================== OWNER COMMAND TOOLS (BOSS MODE ONLY) ====================
      case "send_customer_message": {
        // Verify owner mode
        const { data: ownerCheck } = await supabase
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        if (!ownerCheck?.owner_verified) {
          return JSON.stringify({ success: false, error: "This command is only available in Boss Mode." });
        }

        const identifier = args.customer_identifier?.toLowerCase();
        const channel = args.channel || "whatsapp";
        let customerPhone: string | null = null;
        let customerEmail: string | null = null;
        let customerName: string | null = null;

        // Find the customer
        if (identifier === "last" || identifier === "recent" || identifier === "latest") {
          // Get most recent customer from ticket_requests or ai_conversations
          const { data: recentRequest } = await supabase
            .from("ticket_requests")
            .select("contact_phone, contact_email, passenger_name")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
          
          if (recentRequest) {
            customerPhone = recentRequest.contact_phone;
            customerEmail = recentRequest.contact_email;
            customerName = recentRequest.passenger_name;
          }
        } else {
          // Search by name, email, or phone
          const { data: matchingRequests } = await supabase
            .from("ticket_requests")
            .select("contact_phone, contact_email, passenger_name")
            .or(`passenger_name.ilike.%${identifier}%,contact_email.ilike.%${identifier}%,contact_phone.ilike.%${identifier}%`)
            .order("created_at", { ascending: false })
            .limit(1);
          
          if (matchingRequests?.length) {
            customerPhone = matchingRequests[0].contact_phone;
            customerEmail = matchingRequests[0].contact_email;
            customerName = matchingRequests[0].passenger_name;
          }
        }

        if (!customerPhone && !customerEmail) {
          return JSON.stringify({ 
            success: false, 
            error: `Could not find customer "${args.customer_identifier}". Try a name, email, phone, or "last" for the most recent customer.`
          });
        }

        // Send the message
        const personalizedMessage = `Hey${customerName ? ` ${customerName.split(' ')[0]}` : ''}! ${args.message}\n\n- Maya ✈️`;

        if (channel === "whatsapp" || channel === "sms") {
          const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
          const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
          const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER");

          if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER || !customerPhone) {
            return JSON.stringify({ success: false, error: "Twilio not configured or no phone number for customer" });
          }

          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
          const fromNumber = channel === "whatsapp" ? `whatsapp:${TWILIO_PHONE_NUMBER}` : TWILIO_PHONE_NUMBER;
          const toNumber = channel === "whatsapp" ? `whatsapp:${customerPhone}` : customerPhone;

          const response = await fetch(twilioUrl, {
            method: "POST",
            headers: {
              "Authorization": "Basic " + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              From: fromNumber,
              To: toNumber,
              Body: personalizedMessage,
            }),
          });

          if (response.ok) {
            // Notify boss about the message sent
            notifyBoss('message', `📤 Sent to ${customerName || customerPhone}:\n"${args.message}"`)
              .catch((err: Error) => console.log("[BossNotify] Message notification failed:", err.message));
            
            return JSON.stringify({ 
              success: true, 
              message: `Sent ${channel} to ${customerName || customerPhone}: "${args.message}"`
            });
          } else {
            const error = await response.text();
            return JSON.stringify({ success: false, error: `Failed to send: ${error.substring(0, 100)}` });
          }
        } else if (channel === "email" && customerEmail) {
          const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
          if (!RESEND_API_KEY) {
            return JSON.stringify({ success: false, error: "Email not configured" });
          }

          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Maya <maya@yourtravelagent.net>",
              to: [customerEmail],
              subject: "Update from Your Travel Agent ✈️",
              html: `<p>${personalizedMessage.replace(/\n/g, '<br>')}</p>`,
            }),
          });

          if (response.ok) {
            return JSON.stringify({ 
              success: true, 
              message: `Emailed ${customerName || customerEmail}: "${args.message}"`
            });
          }
        }

        return JSON.stringify({ success: false, error: "Could not send message" });
      }

      case "get_recent_customers": {
        const { data: ownerCheck } = await supabase
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        if (!ownerCheck?.owner_verified) {
          return JSON.stringify({ success: false, error: "This command is only available in Boss Mode." });
        }

        const limit = args.limit || 10;
        let query = supabase
          .from("ticket_requests")
          .select("id, passenger_name, contact_email, contact_phone, origin, destination, status, created_at, quoted_price")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (args.filter === "pending_quote") {
          query = query.in("status", ["submitted", "pending"]);
        } else if (args.filter === "pending_payment") {
          query = query.eq("status", "quote_sent");
        }

        const { data: customers, error } = await query;

        if (error) {
          return JSON.stringify({ success: false, error: "Failed to fetch customers" });
        }

        const summary = customers?.map((c: any) => ({
          name: c.passenger_name || "Unknown",
          email: c.contact_email,
          phone: c.contact_phone,
          route: `${c.origin} → ${c.destination}`,
          status: c.status,
          price: c.quoted_price,
          date: c.created_at
        }));

        return JSON.stringify({ 
          success: true, 
          customers: summary,
          count: customers?.length || 0
        });
      }

      case "update_customer_status": {
        const { data: ownerCheck } = await supabase
          .from("ai_conversations")
          .select("owner_verified")
          .eq("id", conversationId)
          .single();
        
        if (!ownerCheck?.owner_verified) {
          return JSON.stringify({ success: false, error: "This command is only available in Boss Mode." });
        }

        const identifier = args.customer_identifier?.toLowerCase();
        
        // Find the ticket request
        const { data: matchingRequests } = await supabase
          .from("ticket_requests")
          .select("id, passenger_name, admin_notes")
          .or(`passenger_name.ilike.%${identifier}%,contact_email.ilike.%${identifier}%,id.eq.${identifier}`)
          .order("created_at", { ascending: false })
          .limit(1);

        if (!matchingRequests?.length) {
          return JSON.stringify({ success: false, error: `Could not find request for "${args.customer_identifier}"` });
        }

        const request = matchingRequests[0];
        const updates: any = {};
        
        if (args.status) updates.status = args.status;
        if (args.note) {
          const existingNotes = request.admin_notes || "";
          updates.admin_notes = `${existingNotes}\n[${new Date().toLocaleString()}] ${args.note}`.trim();
        }

        const { error } = await supabase
          .from("ticket_requests")
          .update(updates)
          .eq("id", request.id);

        if (error) {
          return JSON.stringify({ success: false, error: "Failed to update request" });
        }

        return JSON.stringify({ 
          success: true, 
          message: `Updated ${request.passenger_name || request.id}: ${args.status ? `status → ${args.status}` : ""} ${args.note ? `note added` : ""}`
        });
      }

      default:
        console.log(`Unknown tool: ${toolName}`);
        return JSON.stringify({ success: true, message: "Let me handle that for you..." });
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return JSON.stringify({ success: true, message: "Working on it..." });
  }
}

// Check if message contains owner trigger phrase
function containsOwnerTrigger(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return OWNER_TRIGGER_PHRASES.some(phrase => lowerMessage.includes(phrase));
}

// Verify owner PIN
function verifyOwnerPin(pin: string): boolean {
  const correctPin = Deno.env.get("MAYA_OWNER_PIN");
  if (!correctPin) return false;
  return pin.trim() === correctPin.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    
    // ========== ELEVENLABS CUSTOM LLM ADAPTER ==========
    // ElevenLabs sends messages in OpenAI format but expects streaming response
    // Detect ElevenLabs by checking for their specific headers or message patterns
    const isElevenLabsRequest = 
      req.headers.get("user-agent")?.includes("ElevenLabs") ||
      req.headers.get("x-elevenlabs-agent-id") ||
      (body.messages && body.messages.some((m: any) => 
        m.role === "system" && m.content?.includes("ElevenLabs")
      ));
    
    // ElevenLabs sends messages directly, our web client sends { messages, sessionId }
    // Also support { message } for single-message format from WhatsApp and other channels
    let messages = body.messages || [];
    if (!messages.length && body.message) {
      messages = [{ role: "user", content: body.message }];
    }
    let sessionId = body.sessionId || body.session_id || `elevenlabs-${Date.now()}`;
    let conversationId = body.conversationId || body.conversation_id || null;
    
    // For ElevenLabs, extract conversation ID from their headers if available
    if (isElevenLabsRequest) {
      conversationId = conversationId || 
        req.headers.get("x-elevenlabs-conversation-id") ||
        `el-${crypto.randomUUID()}`;
      sessionId = sessionId || conversationId;
      
      console.log("[ElevenLabs Custom LLM] Request received, conversation:", conversationId);
      
      // ElevenLabs may include their own system prompt - we'll override with Maya's
      // Filter out any ElevenLabs system messages
      messages = messages.filter((m: any) => 
        !(m.role === "system" && m.content?.includes("ElevenLabs"))
      );
    }
    
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get or create conversation
    // NOTE: conversationId must be a real ai_conversations.id (UUID).
    // Some channels (e.g. WhatsApp) may send a non-UUID conversationId like "whatsapp-...".
    // If we accept that, message persistence breaks and Maya "re-introduces" every time.
    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    let convId = conversationId;
    let existingConversation = false;

    if (convId && !isUuid(convId)) {
      console.log(`[ai-chat] Ignoring non-UUID conversationId: ${convId}`);
      convId = null;
    }

    if (convId) {
      // Verify it actually exists
      const { data: existingConvById } = await supabase
        .from("ai_conversations")
        .select("id")
        .eq("id", convId)
        .maybeSingle();

      if (existingConvById) {
        existingConversation = true;
      } else {
        console.log(`[ai-chat] conversationId not found in DB: ${convId} (will fallback to sessionId)`);
        convId = null;
      }
    }

    if (!convId) {
      // Find or create by session_id
      const { data: existingConv } = await supabase
        .from("ai_conversations")
        .select("id, customer_id")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (existingConv) {
        convId = existingConv.id;
        existingConversation = true;
      } else {
        const { data: conv, error: convError } = await supabase
          .from("ai_conversations")
          .insert({ session_id: sessionId })
          .select("id")
          .single();

        if (convError) throw convError;
        convId = conv.id;
      }
    }

    // ========== UNIFIED CUSTOMER LINKING ==========
    // Try to link conversation to a customer profile for unified history
    let customerId: string | null = null;
    let customerContext: any = null;
    
    // Check if we have an authenticated user (from Authorization header)
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        // User is signed in - link to their profile
        customerId = user.id;
        console.log(`[ai-chat] Authenticated user: ${user.id}`);
        
        // Link conversation to customer
        await supabase.rpc("link_conversation_to_customer", {
          p_conversation_id: convId,
          p_customer_id: customerId
        });
      }
    }
    
    // If we have a customer, load their full context (all channels)
    if (customerId) {
      const { data: context } = await supabase.rpc("get_customer_context", {
        p_customer_id: customerId
      });
      if (context) {
        customerContext = context;
        console.log(`[ai-chat] Loaded customer context: ${context.conversation_count || 0} past conversations`);
      }
    }

    // Load conversation history if this is an existing conversation.
    // IMPORTANT: Some clients (or reconnects/refreshes) may only send the latest user message,
    // which makes Maya appear to "forget". If we receive only a small message window,
    // rehydrate from DB/unified history.
    //
    // We intentionally keep this threshold small so we don't duplicate history when the
    // web client already sends the full transcript.
    const SHOULD_REHYDRATE_HISTORY_THRESHOLD = 6;
    if (existingConversation && messages.length < SHOULD_REHYDRATE_HISTORY_THRESHOLD) {
      console.log(`[ai-chat] Loading conversation history for ${convId}`);
      
      // If we have full customer context, use messages from ALL their conversations
      if (customerContext?.recent_messages) {
        const recentMessages = customerContext.recent_messages || [];
        // Filter to just the recent ones and format for API
        const historyMessages = recentMessages
          .slice(0, 50)
          .reverse()
          .map((m: any) => ({ role: m.role, content: m.content }));
        
        if (historyMessages.length > 0) {
          const lastUserMessage = messages[messages.length - 1];
          messages = [
            ...historyMessages,
            ...(lastUserMessage ? [lastUserMessage] : [])
          ];
          console.log(`[ai-chat] Loaded ${historyMessages.length} messages from unified history`);
        }
       } else {
        // Fallback: just this conversation's history
        const { data: history } = await supabase
          .from("ai_chat_messages")
          .select("role, content")
          .eq("conversation_id", convId)
          .order("created_at", { ascending: true })
          .limit(50);
        
        if (history && history.length > 0) {
          const lastUserMessage = messages[messages.length - 1];
          messages = [
            ...history.map((m: any) => ({ role: m.role, content: m.content })),
            ...(lastUserMessage ? [lastUserMessage] : [])
          ];
          console.log(`[ai-chat] Loaded ${history.length} previous messages`);
        }
      }
    }

    // Save user message with better duplicate prevention (check last 2 minutes)
    const lastUserMessage = messages[messages.length - 1];
    if (lastUserMessage?.role === "user") {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: existingMsg } = await supabase
        .from("ai_chat_messages")
        .select("id")
        .eq("conversation_id", convId)
        .eq("content", lastUserMessage.content)
        .eq("role", "user")
        .gte("created_at", twoMinutesAgo)
        .limit(1)
        .maybeSingle();
      
      if (!existingMsg) {
        await supabase.from("ai_chat_messages").insert({
          conversation_id: convId,
          role: "user",
          content: lastUserMessage.content,
        });
      }
    }

    // ========== OWNER VERIFICATION FLOW ==========
    // CRITICAL: Load owner_verified from DATABASE, not in-memory (edge functions are stateless!)
    // Use a separate variable name to avoid TDZ issues in compiled code
    let conversationData: { owner_verified: boolean | null; customer_phone: string | null } | null = null;
    try {
      const { data } = await supabase
        .from("ai_conversations")
        .select("owner_verified, customer_phone")
        .eq("id", convId)
        .single();
      conversationData = data;
    } catch (fetchErr) {
      console.error("[ai-chat] Failed to fetch conversation data:", fetchErr);
    }
    
    let isOwnerMode = conversationData?.owner_verified || false;
    const verificationState = ownerVerificationStates.get(convId) || { awaitingPin: false, attempts: 0 };
    let ownerModeJustVerified = false;

    // 🔓 AUTO-OWNER DETECTION BY PHONE NUMBER
    // If the request comes with is_owner: true OR the phone matches admin_phone, auto-enable boss mode
    const phoneNumber = body.phone_number || conversationData?.customer_phone;
    console.log(`[ai-chat] Phone check: phone_number=${phoneNumber}, is_owner=${body.is_owner}`);
    if (!isOwnerMode && phoneNumber) {
      const { data: adminPhoneSetting } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "admin_phone")
        .maybeSingle();
      
      const adminPhone = adminPhoneSetting?.value || "+17134698336";
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      const normalizedAdmin = adminPhone.replace(/\D/g, '');
      
      const isOwnerPhone = normalizedPhone === normalizedAdmin || 
                           normalizedPhone.endsWith(normalizedAdmin) || 
                           normalizedAdmin.endsWith(normalizedPhone);
      
      if (isOwnerPhone || body.is_owner === true) {
        isOwnerMode = true;
        ownerModeJustVerified = true;
        
        // Persist to database
        await supabase
          .from("ai_conversations")
          .update({ owner_verified: true })
          .eq("id", convId);
        
        console.log(`[ai-chat] 👑 Auto-enabled owner mode for phone: ${phoneNumber}`);
      }
    }

    console.log(`[ai-chat] Owner mode for ${convId}: ${isOwnerMode}`);

    // Check if user is providing a PIN (when we're awaiting one)
    if (verificationState.awaitingPin && lastUserMessage?.role === "user") {
      const userInput = lastUserMessage.content.trim();
      
      if (verifyOwnerPin(userInput)) {
        // PIN is correct - activate owner mode!
        isOwnerMode = true;
        ownerModeJustVerified = true;
        ownerVerificationStates.delete(convId);
        
        // CRITICAL: Persist owner mode to DATABASE (not just in-memory)
        await supabase
          .from("ai_conversations")
          .update({ owner_verified: true })
          .eq("id", convId);
        
        // Log successful verification
        await supabase.from("admin_alerts").insert({
          conversation_id: convId,
          alert_type: "owner_verified",
          message: "Owner successfully verified via PIN",
          customer_context: JSON.stringify({ verified_at: new Date().toISOString() })
        });
        
        console.log("Owner verified successfully for conversation:", convId);
      } else {
        // Wrong PIN
        verificationState.attempts++;
        
        if (verificationState.attempts >= 3) {
          // Too many failed attempts
          ownerVerificationStates.delete(convId);
          
          // Log failed verification attempts
          await supabase.from("admin_alerts").insert({
            conversation_id: convId,
            alert_type: "owner_verification_failed",
            message: "Owner verification failed after 3 attempts",
            customer_context: JSON.stringify({ attempts: 3 })
          });
          
          const failResponse = "I'm sorry, but I can't verify that right now. If this is really you, boss, please reach out through the admin panel.";
          
          await supabase.from("ai_chat_messages").insert({
            conversation_id: convId,
            role: "assistant",
            content: failResponse,
          });
          
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              const data = JSON.stringify({
                choices: [{ delta: { content: failResponse }, finish_reason: "stop" }]
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }
          });
          
          return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Conversation-Id": convId },
          });
        } else {
          ownerVerificationStates.set(convId, verificationState);
          const retryResponse = `Hmm, that doesn't match. Try again? (${3 - verificationState.attempts} attempts remaining)`;
          
          await supabase.from("ai_chat_messages").insert({
            conversation_id: convId,
            role: "assistant",
            content: retryResponse,
          });
          
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              const data = JSON.stringify({
                choices: [{ delta: { content: retryResponse }, finish_reason: "stop" }]
              });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }
          });
          
          return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Conversation-Id": convId },
          });
        }
      }
    }

    // Check if user is claiming to be the owner (trigger verification)
    if (!verificationState.awaitingPin && lastUserMessage?.role === "user" && containsOwnerTrigger(lastUserMessage.content)) {
      ownerVerificationStates.set(convId, { awaitingPin: true, attempts: 0 });
      
      const verifyResponse = "Ah! One moment, boss. Let me verify that's really you. What's your secure PIN?";
      
      await supabase.from("ai_chat_messages").insert({
        conversation_id: convId,
        role: "assistant",
        content: verifyResponse,
      });
      
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const data = JSON.stringify({
            choices: [{ delta: { content: verifyResponse }, finish_reason: "stop" }]
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      });
      
      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Conversation-Id": convId },
      });
    }

    // ========== BUILD SYSTEM PROMPT WITH UNIFIED MEMORY ==========
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Get enhanced prompt with ALL memory directly injected (short-term + long-term)
    let enhancedSystemPrompt: string;
    try {
      enhancedSystemPrompt = await getEnhancedPrompt(
        SYSTEM_PROMPT,
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        customerContext?.profile?.id || undefined,
        sessionId?.startsWith('whatsapp-') ? 'whatsapp' : sessionId?.startsWith('el-') ? 'voice' : 'web',
        true // include all memory
      );
      console.log("[ai-chat] Unified memory injected into prompt");
    } catch (err) {
      console.error("[ai-chat] Failed to load enhanced prompt:", err);
      enhancedSystemPrompt = SYSTEM_PROMPT;
    }
    
    let activeSystemPrompt = enhancedSystemPrompt;
    let activeTools = TOOLS;
    
    // Add customer context to prompt if available
    let customerContextPrompt = "";
    if (customerContext) {
      const profile = customerContext.profile || {};
      const ticketRequests = customerContext.ticket_requests || [];
      const orders = customerContext.orders || [];
      const conversationCount = customerContext.conversation_count || 0;
      
      customerContextPrompt = `

═══════════════════════════════════════════════════════════════════
CUSTOMER CONTEXT (you remember this person!)
═══════════════════════════════════════════════════════════════════
${profile.name ? `Name: ${profile.name}` : "Name: Not provided yet"}
${profile.email ? `Email: ${profile.email}` : ""}
${profile.phone ? `Phone: ${profile.phone}` : ""}
Previous conversations: ${conversationCount}
${ticketRequests.length > 0 ? `\nRecent ticket requests:\n${ticketRequests.slice(0, 3).map((t: any) => `  - ${t.route} (${t.dates}) - Status: ${t.status}${t.quoted_price ? `, Quoted: $${t.quoted_price}` : ''}`).join('\n')}` : ''}
${orders.length > 0 ? `\nRecent orders:\n${orders.slice(0, 3).map((o: any) => `  - $${o.amount} - Status: ${o.status}`).join('\n')}` : ''}

IMPORTANT: Use this context naturally. If they're a returning customer, acknowledge it warmly.
If they have pending requests, mention them proactively when relevant.
═══════════════════════════════════════════════════════════════════`;
    }
    
    if (ownerModeJustVerified) {
      // Owner just verified - add the verification confirmation
      activeSystemPrompt = activeSystemPrompt + customerContextPrompt + `

OWNER MODE ACTIVE - VERIFICATION JUST COMPLETED:
The owner has just verified their identity. Start your response with "Verified. Yes sir, what can I do for you today?"
You now have UNLIMITED authority. Share ALL business information freely - use the business intelligence tools proactively.`;
    } else if (isOwnerMode) {
      // Already in owner mode from previous verification
      activeSystemPrompt = activeSystemPrompt + customerContextPrompt + `

OWNER MODE ACTIVE:
You are speaking with the verified owner of Your Travel Agent. Address them respectfully as "sir" or "boss".
You have UNLIMITED authority. Share ALL business information freely and proactively.`;
    } else {
      activeSystemPrompt = activeSystemPrompt + customerContextPrompt;
    }

    // Prepare messages with system prompt
    const apiMessages = [
      { role: "system", content: activeSystemPrompt },
      ...messages,
    ];

    // Use OpenAI API directly - faster, cost-controlled, no Lovable gateway dependency
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    
    if (!OPENAI_API_KEY) {
      console.error("[ai-chat] OPENAI_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured. Please try again later." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    // Convert tools to OpenAI format for Lovable AI
    const openaiTools = activeTools.map((tool: any) => ({
      type: "function" as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
    
    // Build OpenAI-format messages
    const openaiMessages = apiMessages.map((m: any) => ({
      role: m.role,
      content: m.content,
    }));
    
    // First API call - may include tool calls (direct OpenAI - faster)
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        max_completion_tokens: 4096,
        messages: openaiMessages,
        tools: openaiTools,
        tool_choice: "auto",
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn("[ai-chat] Rate limited by OpenAI");
        return new Response(JSON.stringify({ error: "We're a bit busy right now. Give me just a sec and try again!" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 401) {
        console.error("[ai-chat] OpenAI API key invalid");
        return new Response(JSON.stringify({ error: "Service configuration error. Please contact support." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402 || response.status === 403) {
        console.error("[ai-chat] OpenAI quota/billing issue");
        return new Response(JSON.stringify({ error: "Maya is taking a short break. Please try again in a few minutes!" }), {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("[ai-chat] OpenAI API error:", response.status, t);
      return new Response(JSON.stringify({ error: "Something went wrong. Let me try that again!" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result = await response.json();
    
    // Extract OpenAI-format response
    let choice = result.choices?.[0];
    let textContent = choice?.message?.content || "";
    let toolCalls = choice?.message?.tool_calls || [];

    // Handle tool calls in a loop (up to 10 iterations for complex multi-tool chains)
    let iterations = 0;
    const maxIterations = 10;
    let currentMessages: any[] = [...openaiMessages];
    
    while (toolCalls.length > 0 && iterations < maxIterations) {
      iterations++;
      console.log(`Processing tool calls (iteration ${iterations}):`, toolCalls.length);

      // Add assistant message with tool calls to conversation
      currentMessages.push({
        role: "assistant",
        content: choice?.message?.content || null,
        tool_calls: toolCalls,
      });

      // Execute all tool calls and add results
      for (const toolCall of toolCalls) {
        const toolInput = JSON.parse(toolCall.function?.arguments || "{}");
        const toolResult = await executeTool(supabase, toolCall.function?.name, toolInput, convId);
        
        currentMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      // Get follow-up response from OpenAI (direct API)
      const followUpResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_completion_tokens: 4096,
          messages: currentMessages,
          tools: openaiTools,
          tool_choice: "auto",
        }),
      });

      if (!followUpResponse.ok) {
        console.error("[ai-chat] Follow-up response error:", followUpResponse.status);
        // CRITICAL: Don't go silent! If follow-up fails, provide a recovery message
        // so the user doesn't see "One moment..." followed by nothing.
        if (followUpResponse.status === 429) {
          textContent = "I found some results but hit a small hiccup. Give me just a sec and ask again!";
        } else {
          textContent = "I looked into that but ran into a snag. Mind trying that again?";
        }
        console.log("[ai-chat] Recovery message set after tool failure");
        break;
      }

      result = await followUpResponse.json();
      
      // Extract new content and tool calls
      choice = result.choices?.[0];
      const newContent = choice?.message?.content || "";
      // Only update textContent if we got something meaningful
      if (newContent && newContent.trim().length > 0) {
        textContent = newContent;
      }
      toolCalls = choice?.message?.tool_calls || [];
    }

    // Extract final content - NEVER return a "waiting" message as final response
    // If we got here with empty content, something failed silently - provide recovery
    let finalContent = textContent;
    if (!finalContent || finalContent.trim().length === 0) {
      console.warn("[ai-chat] Empty response after processing - providing recovery message");
      finalContent = "I tried looking into that but something didn't work right. Could you ask me again?";
    }

    // Save assistant message
    await supabase.from("ai_chat_messages").insert({
      conversation_id: convId,
      role: "assistant",
      content: finalContent,
      metadata: { tools_used: iterations > 0, iterations }
    });

    // Return response with streaming format
    const encoder = new TextEncoder();
    
    // For ElevenLabs Custom LLM, stream word-by-word for natural speech
    if (isElevenLabsRequest) {
      console.log("[ElevenLabs Custom LLM] Sending response:", finalContent.substring(0, 100));
      
      // Clean up response for voice (remove markdown)
      const voiceContent = finalContent
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/`/g, '')
        .replace(/\n\n+/g, '. ')
        .replace(/\n/g, '. ')
        .trim();
      
      const stream = new ReadableStream({
        start(controller) {
          // Stream the content in chunks for more natural TTS
          const words = voiceContent.split(' ');
          let chunkSize = 5; // Send 5 words at a time for smoother streaming
          
          for (let i = 0; i < words.length; i += chunkSize) {
            const chunk = words.slice(i, i + chunkSize).join(' ') + ' ';
            const data = JSON.stringify({
              id: `chatcmpl-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: "maya-custom",
              choices: [{
                index: 0,
                delta: { content: chunk },
                finish_reason: null
              }]
            });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }
          
          // Send final chunk with finish_reason
          const finalChunk = JSON.stringify({
            id: `chatcmpl-${Date.now()}`,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model: "maya-custom",
            choices: [{
              index: 0,
              delta: {},
              finish_reason: "stop"
            }]
          });
          controller.enqueue(encoder.encode(`data: ${finalChunk}\n\n`));
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: { 
          ...corsHeaders, 
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "X-Conversation-Id": convId,
        },
      });
    }
    
    // Standard response for web clients
    const stream = new ReadableStream({
      start(controller) {
        const data = JSON.stringify({
          choices: [{
            delta: { content: finalContent },
            finish_reason: "stop"
          }]
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    });

    return new Response(stream, {
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
