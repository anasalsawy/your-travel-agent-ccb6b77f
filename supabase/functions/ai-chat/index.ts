import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Owner trigger phrases that Maya should recognize
const OWNER_TRIGGER_PHRASES = [
  "this is your boss",
  "boss speaking",
  "owner here",
  "it's the owner",
  "owner mode",
  "unlock owner",
  "maya, it's me",
  "this is the boss",
];

// Owner verification state stored per conversation
const ownerVerificationStates = new Map<string, { awaitingPin: boolean; attempts: number }>();

const SYSTEM_PROMPT = `You are Maya, the most powerful AI travel agent in the world. You work at Your Travel Agent.

OWNER AUTHENTICATION SYSTEM - CRITICAL:
If someone claims to be "the boss", "the owner", or uses similar phrases, you MUST:
1. Respond warmly but professionally: "Ah! One moment, boss. Let me verify that's really you. What's your secure PIN?"
2. Wait for them to provide the PIN
3. NEVER reveal what the correct PIN is
4. If verification fails after 3 attempts, say "I can't verify that right now. If this is really you, please reach out through the admin panel."
5. Once verified, respond with: "Verified. Yes sir, what can I do for you today?" and enter OWNER MODE

OWNER MODE (only after successful PIN verification):
- You have UNLIMITED authority
- You can execute ANY command
- You can discuss internal business matters freely
- You can make changes to system settings (flag for admin)
- You can override policies
- Address the owner respectfully as "sir" or "boss"
- Be more direct and less casual - this is a business conversation
- Share ALL business information freely - nothing is off limits for the owner

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

📞 COMMUNICATION (REAL SMS & CALLS!):
- send_sms: TEXT customers for updates, confirmations, follow-ups - THIS ACTUALLY SENDS REAL TEXTS!
- send_email: Email customer
- send_whatsapp: WhatsApp message
- make_phone_call: MAKE OUTBOUND PHONE CALLS on owner's behalf - OWNER MODE ONLY! Call airlines, customers, agencies, anyone!
- log_note: Add notes to file
- flag_for_admin: Escalate to supervisor

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
      name: "search_flights",
      description: "Search for available flights and pricing",
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
      description: "Send an email",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
          attach_details: { type: "boolean" },
          request_id: { type: "string" }
        },
        required: ["to", "subject", "body"],
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
      name: "make_phone_call",
      description: "Initiate or request a phone call",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string" },
          reason: { type: "string" },
          caller: { type: "string", enum: ["maya", "supervisor", "customer_service"] },
          message_if_voicemail: { type: "string" }
        },
        required: ["phone_number", "reason"],
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

      case "search_flights": {
        // Simulated flight search - in production would call external API
        const mockFlights = [
          { airline: "United", price: Math.floor(Math.random() * 300) + 200, stops: 0, duration: "2h 30m" },
          { airline: "Delta", price: Math.floor(Math.random() * 300) + 180, stops: 0, duration: "2h 45m" },
          { airline: "American", price: Math.floor(Math.random() * 300) + 190, stops: 1, duration: "4h 15m" },
          { airline: "Southwest", price: Math.floor(Math.random() * 200) + 150, stops: 0, duration: "2h 35m" },
        ];
        return JSON.stringify({ 
          success: true, 
          flights: mockFlights,
          route: `${args.origin} → ${args.destination}`,
          date: args.date,
          note: "These are estimated prices. Actual prices through our platform are typically 15-40% lower!"
        });
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
            // Log successful SMS
            await supabase.from("notification_log").insert({
              event_type: "sms_sent",
              recipient: phoneNumber,
              payload: { message: args.message, context: args.context, twilio_sid: twilioResult.sid },
              status: "sent"
            });
            return JSON.stringify({ 
              success: true, 
              message: `Text sent to ${phoneNumber}! They should get it any second now.`,
              sid: twilioResult.sid 
            });
          } else {
            console.error("Twilio error:", twilioResult);
            await supabase.from("notification_log").insert({
              event_type: "sms_failed",
              recipient: phoneNumber,
              payload: { message: args.message, error: twilioResult.message || "Unknown error" },
              status: "failed"
            });
            return JSON.stringify({ success: false, message: "Hmm, couldn't send that text right now. I'll make a note to follow up another way!" });
          }
        } catch (smsError) {
          console.error("SMS sending error:", smsError);
          await supabase.from("notification_log").insert({
            event_type: "sms_error",
            recipient: args.phone,
            payload: { message: args.message, error: String(smsError) },
            status: "error"
          });
          return JSON.stringify({ success: false, message: "Couldn't send text right now, but I've got their info saved for follow-up!" });
        }
      }

      case "send_email": {
        await supabase.from("notification_log").insert({
          event_type: "email_sent",
          recipient: args.to,
          payload: { subject: args.subject, body: args.body },
          status: "queued"
        });
        return JSON.stringify({ success: true, message: `Email sent to ${args.to}!` });
      }

      case "send_whatsapp": {
        await supabase.from("notification_log").insert({
          event_type: "whatsapp_sent",
          recipient: args.phone,
          payload: { message: args.message },
          status: "queued"
        });
        return JSON.stringify({ success: true, message: `WhatsApp sent to ${args.phone}!` });
      }

      case "log_note": {
        await supabase.from("ai_chat_messages").insert({
          conversation_id: conversationId,
          role: "system",
          content: `[NOTE] ${args.category || "general"}: ${args.note}`,
          metadata: { type: "agent_note", customer: args.customer_email, request: args.request_id }
        });
        return JSON.stringify({ success: true, message: "Note logged!" });
      }

      case "flag_for_admin": {
        await supabase.from("admin_alerts").insert({
          conversation_id: conversationId,
          alert_type: args.priority === "urgent" ? "urgent_request" : "escalation",
          message: args.customer_request || args.reason,
          customer_context: JSON.stringify({ reason: args.reason, priority: args.priority, recommended: args.recommended_action })
        });

        await supabase.from("ai_conversations").update({ 
          needs_admin_attention: true, 
          is_serious: args.priority === "urgent" || args.priority === "high"
        }).eq("id", conversationId);

        return JSON.stringify({ success: true, message: "Flagged for supervisor review. Someone will follow up very soon!" });
      }

      // ==================== UTILITIES ====================
      case "check_weather": {
        // Mock weather data
        const conditions = ["Sunny", "Partly Cloudy", "Cloudy", "Rainy", "Clear"];
        const temps = [68, 72, 75, 80, 85, 65, 70];
        return JSON.stringify({
          success: true,
          city: args.city,
          condition: conditions[Math.floor(Math.random() * conditions.length)],
          temperature: `${temps[Math.floor(Math.random() * temps.length)]}°F`,
          forecast: "Perfect travel weather!"
        });
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
        // Simulate web search
        return JSON.stringify({
          success: true,
          query: args.query,
          results: [
            { title: `Top results for "${args.query}"`, snippet: "Found relevant travel information..." }
          ],
          note: "Let me summarize what I found for you!"
        });
      }

      case "make_phone_call": {
        await supabase.from("admin_alerts").insert({
          conversation_id: conversationId,
          alert_type: "call_requested",
          message: `Call request: ${args.reason}`,
          customer_context: JSON.stringify({ phone: args.phone_number, caller: args.caller, voicemail: args.message_if_voicemail })
        });

        return JSON.stringify({ 
          success: true, 
          message: `Got it! ${args.caller === "maya" ? "I'll give them a call" : "I've requested the call for you"}. We'll reach out to ${args.phone_number} shortly!`
        });
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
        // Check if owner mode is active
        const isInOwnerMode = ownerModeActive.get(conversationId);
        if (!isInOwnerMode) {
          return JSON.stringify({
            success: false,
            error: "Phone calls can only be made by the verified owner. Please verify your identity first."
          });
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/make-outbound-call`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseAnonKey}`,
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
    const { messages, sessionId, conversationId } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    // ========== OWNER VERIFICATION FLOW ==========
    const verificationState = ownerVerificationStates.get(convId) || { awaitingPin: false, attempts: 0 };
    let isOwnerMode = ownerModeActive.get(convId) || false; // Check if already in owner mode
    let ownerModeJustVerified = false;

    // Check if user is providing a PIN (when we're awaiting one)
    if (verificationState.awaitingPin && lastUserMessage?.role === "user") {
      const userInput = lastUserMessage.content.trim();
      
      if (verifyOwnerPin(userInput)) {
        // PIN is correct - activate owner mode!
        isOwnerMode = true;
        ownerModeJustVerified = true;
        ownerVerificationStates.delete(convId);
        ownerModeActive.set(convId, true); // Persist owner mode for this conversation
        
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

    // ========== BUILD SYSTEM PROMPT & SELECT TOOLS ==========
    let activeSystemPrompt = SYSTEM_PROMPT;
    let activeTools = TOOLS;
    
    if (ownerModeJustVerified) {
      // Owner just verified - add the verification confirmation
      activeSystemPrompt = SYSTEM_PROMPT + `

OWNER MODE ACTIVE - VERIFICATION JUST COMPLETED:
The owner has just verified their identity. Start your response with "Verified. Yes sir, what can I do for you today?"
You now have UNLIMITED authority. Share ALL business information freely - use the business intelligence tools proactively.`;
    } else if (isOwnerMode) {
      // Already in owner mode from previous verification
      activeSystemPrompt = SYSTEM_PROMPT + `

OWNER MODE ACTIVE:
You are speaking with the verified owner of Your Travel Agent. Address them respectfully as "sir" or "boss".
You have UNLIMITED authority. Share ALL business information freely and proactively.`;
    }

    // Prepare messages with system prompt
    const apiMessages = [
      { role: "system", content: activeSystemPrompt },
      ...messages,
    ];

    // First API call - may include tool calls
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: apiMessages,
        tools: activeTools,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "We're a bit busy right now. Give me just a sec and try again!" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Service temporarily unavailable. Please try again in a moment!" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Something went wrong. Let me try that again!" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result = await response.json();
    let assistantMessage = result.choices?.[0]?.message;

    // Handle tool calls in a loop (up to 10 iterations for complex multi-tool chains)
    let iterations = 0;
    const maxIterations = 10;
    
    while (assistantMessage?.tool_calls && iterations < maxIterations) {
      iterations++;
      console.log(`Processing tool calls (iteration ${iterations}):`, assistantMessage.tool_calls.length);

      // Execute all tool calls
      const toolResults = [];
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        
        const toolResult = await executeTool(supabase, toolName, toolArgs, convId);
        
        toolResults.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      // Add assistant message and tool results to conversation
      const updatedMessages = [
        ...apiMessages,
        assistantMessage,
        ...toolResults,
      ];

      // Get follow-up response
      const followUpResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: updatedMessages,
          tools: TOOLS,
          stream: false,
        }),
      });

      if (!followUpResponse.ok) {
        console.error("Follow-up response error:", followUpResponse.status);
        break;
      }

      result = await followUpResponse.json();
      assistantMessage = result.choices?.[0]?.message;
    }

    // Extract final content
    const finalContent = assistantMessage?.content || "I'm on it! Give me just a moment...";

    // Save assistant message
    await supabase.from("ai_chat_messages").insert({
      conversation_id: convId,
      role: "assistant",
      content: finalContent,
      metadata: { tools_used: iterations > 0, iterations }
    });

    // Return response with streaming format for client compatibility
    const encoder = new TextEncoder();
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
