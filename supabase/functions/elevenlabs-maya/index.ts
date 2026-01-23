import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS MAYA - HYBRID ARCHITECTURE (maya_brain tool)
 * 
 * This webhook is ONLY called for critical actions requiring database access:
 * - get_quote: Get pricing for a route
 * - create_ticket_request: Submit a booking request
 * - process_payment: Handle payment operations
 * - check_order: Look up order status
 * - buy_voucher: Purchase a voucher
 * - get_customer_history: Fetch detailed customer history
 * 
 * For general conversation, ElevenLabs uses its native LLM with pre-loaded context.
 * This reduces latency from ~1500-2500ms to ~400-700ms for most turns.
 */

interface MayaBrainRequest {
  action: "get_quote" | "create_ticket_request" | "process_payment" | "check_order" | "buy_voucher" | "get_customer_history";
  origin?: string;
  destination?: string;
  travel_date?: string;
  return_date?: string;
  passengers?: number;
  cabin_class?: "economy" | "premium_economy" | "business" | "first";
  message?: string;
  order_id?: string;
  voucher_id?: string;
  customer_email?: string;
  customer_phone?: string;
}

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
    console.log("[maya_brain] Received request:", JSON.stringify(body, null, 2));

    // Extract action parameters - can come from tool call or direct request
    const params: MayaBrainRequest = body.parameters || body;
    const action = params.action;
    
    // Context from ElevenLabs
    const phoneNumber = body.phone_number || body.phoneNumber || body.caller_id;
    const conversationId = body.conversation_id || body.conversationId;

    if (!action) {
      // Fallback to legacy full-routing mode if no action specified
      return await handleLegacyFullRouting(req, body, supabase, SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    console.log("[maya_brain] Action:", action);

    // Handle each action type
    switch (action) {
      case "get_quote":
        return await handleGetQuote(params, supabase, SUPABASE_URL, SUPABASE_ANON_KEY);
      
      case "create_ticket_request":
        return await handleCreateTicketRequest(params, phoneNumber, supabase);
      
      case "check_order":
        return await handleCheckOrder(params, phoneNumber, supabase);
      
      case "buy_voucher":
        return await handleBuyVoucher(params, phoneNumber, supabase);
      
      case "get_customer_history":
        return await handleGetCustomerHistory(phoneNumber, supabase);
      
      case "process_payment":
        return await handleProcessPayment(params, supabase);
      
      default:
        return new Response(
          JSON.stringify({
            response: `I don't recognize that action. Let me help you differently.`,
            success: false
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

  } catch (error) {
    console.error("[maya_brain] Error:", error);

    return new Response(
      JSON.stringify({
        response: "I hit a small snag there. Could you try that again?",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Get a quote using our smart-quote system
 */
async function handleGetQuote(
  params: MayaBrainRequest,
  supabase: any,
  supabaseUrl: string,
  anonKey: string
): Promise<Response> {
  console.log("[maya_brain] Getting quote for:", params);

  // Call our smart-quote function
  const quoteResponse = await fetch(`${supabaseUrl}/functions/v1/smart-quote-v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      origin: params.origin,
      destination: params.destination,
      travel_date: params.travel_date,
      return_date: params.return_date,
      passengers: params.passengers || 1,
      cabin_class: params.cabin_class || "economy",
      message: params.message,
    }),
  });

  if (!quoteResponse.ok) {
    console.error("[maya_brain] Quote error:", await quoteResponse.text());
    return new Response(
      JSON.stringify({
        response: "I couldn't get pricing right now. Let me take your details and get back to you with an exact quote. What's your email?",
        success: false
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const quoteData = await quoteResponse.json();
  console.log("[maya_brain] Quote result:", quoteData);

  // Format a voice-friendly response
  let response = "";
  if (quoteData.price || quoteData.quoted_price) {
    const price = quoteData.price || quoteData.quoted_price;
    response = `I found ${params.cabin_class || "economy"} class from ${params.origin} to ${params.destination} for around $${price} per person. `;
    
    if (quoteData.savings) {
      response += `That's about ${quoteData.savings}% below retail. `;
    }
    
    response += "Would you like me to lock this in for you?";
  } else if (quoteData.message) {
    response = quoteData.message;
  } else {
    response = `I'm checking rates for ${params.origin} to ${params.destination}. To get you an exact quote, I'll need your email so I can send the details. What's your email address?`;
  }

  return new Response(
    JSON.stringify({
      response,
      success: true,
      quote_data: quoteData
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Create a new ticket request
 */
async function handleCreateTicketRequest(
  params: MayaBrainRequest,
  phoneNumber: string | undefined,
  supabase: any
): Promise<Response> {
  console.log("[maya_brain] Creating ticket request:", params);

  // Get or create customer
  let customerId: string | null = null;
  if (phoneNumber) {
    const { data } = await supabase.rpc("get_or_create_customer_by_phone", {
      p_phone: phoneNumber
    });
    customerId = data;
  }

  // Create the ticket request
  const { data: request, error } = await supabase
    .from("ticket_requests")
    .insert({
      customer_id: customerId,
      origin: params.origin?.toUpperCase(),
      destination: params.destination?.toUpperCase(),
      travel_date: params.travel_date,
      return_date: params.return_date,
      passengers: params.passengers || 1,
      cabin_class: params.cabin_class || "economy",
      notes: params.message,
      status: "pending",
      contact_email: params.customer_email,
      contact_phone: phoneNumber,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[maya_brain] Ticket request error:", error);
    return new Response(
      JSON.stringify({
        response: "I couldn't submit that request. Let me try a different approach - what's the best email to reach you at?",
        success: false
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const response = `Perfect! I've submitted your request for ${params.origin} to ${params.destination}. ` +
    `Your reference number is ${request.id.substring(0, 8).toUpperCase()}. ` +
    `I'll have a confirmed quote for you within 24 hours. Is there anything else I can help with?`;

  return new Response(
    JSON.stringify({
      response,
      success: true,
      request_id: request.id
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Check order status
 */
async function handleCheckOrder(
  params: MayaBrainRequest,
  phoneNumber: string | undefined,
  supabase: any
): Promise<Response> {
  console.log("[maya_brain] Checking order:", params);

  let query = supabase
    .from("orders")
    .select("id, status, total_amount, created_at, ticket_requests(origin, destination, travel_date)")
    .order("created_at", { ascending: false })
    .limit(5);

  if (params.order_id) {
    query = query.eq("id", params.order_id);
  } else if (phoneNumber) {
    // Find customer by phone and get their orders
    const { data: customerId } = await supabase.rpc("get_or_create_customer_by_phone", {
      p_phone: phoneNumber
    });
    if (customerId) {
      query = query.eq("customer_id", customerId);
    }
  }

  const { data: orders, error } = await query;

  if (error || !orders || orders.length === 0) {
    return new Response(
      JSON.stringify({
        response: "I don't see any recent orders on file. Would you like me to help you with a new booking?",
        success: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const order = orders[0];
  const route = order.ticket_requests ? 
    `${order.ticket_requests.origin} to ${order.ticket_requests.destination}` : 
    "your trip";

  const statusMessages: Record<string, string> = {
    pending: `Your order for ${route} is pending. We're working on getting your tickets confirmed.`,
    confirmed: `Great news! Your order for ${route} is confirmed and tickets are being issued.`,
    completed: `Your order for ${route} is complete. Your tickets should be in your email.`,
    cancelled: `It looks like the order for ${route} was cancelled. Would you like to rebook?`,
  };

  const response = statusMessages[order.status] || `Your order status is ${order.status}.`;

  return new Response(
    JSON.stringify({
      response,
      success: true,
      order_data: order
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Handle voucher purchase
 */
async function handleBuyVoucher(
  params: MayaBrainRequest,
  phoneNumber: string | undefined,
  supabase: any
): Promise<Response> {
  console.log("[maya_brain] Buying voucher:", params);

  // Get available vouchers
  const { data: vouchers } = await supabase
    .from("vouchers")
    .select("id, title, route, price, expiry_date, quantity")
    .gt("quantity", 0)
    .gt("expiry_date", new Date().toISOString())
    .limit(5);

  if (!vouchers || vouchers.length === 0) {
    return new Response(
      JSON.stringify({
        response: "We don't have any vouchers available right now, but I can help you find a great deal on your specific route. Where are you looking to travel?",
        success: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // If specific voucher requested, find it
  if (params.voucher_id) {
    const voucher = vouchers.find((v: any) => v.id === params.voucher_id);
    if (voucher) {
      return new Response(
        JSON.stringify({
          response: `The ${voucher.title} voucher for ${voucher.route} is $${voucher.price}. To purchase, I'll need your email to send payment instructions. What's your email?`,
          success: true,
          voucher_data: voucher
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // List available vouchers
  const voucherList = vouchers
    .slice(0, 3)
    .map((v: any) => `${v.route} for $${v.price}`)
    .join(", ");

  return new Response(
    JSON.stringify({
      response: `I have some hot deals right now: ${voucherList}. Which one catches your eye?`,
      success: true,
      vouchers: vouchers.slice(0, 3)
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Get customer history
 */
async function handleGetCustomerHistory(
  phoneNumber: string | undefined,
  supabase: any
): Promise<Response> {
  if (!phoneNumber) {
    return new Response(
      JSON.stringify({
        response: "I don't have your phone number on file yet. But no worries - I'm here to help! What can I do for you today?",
        success: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const { data: customerId } = await supabase.rpc("get_or_create_customer_by_phone", {
    p_phone: phoneNumber
  });

  if (!customerId) {
    return new Response(
      JSON.stringify({
        response: "Looks like you're new here - welcome! What destination are you dreaming about?",
        success: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get recent requests
  const { data: requests } = await supabase
    .from("ticket_requests")
    .select("origin, destination, travel_date, status, quoted_price")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (!requests || requests.length === 0) {
    return new Response(
      JSON.stringify({
        response: "I don't see any previous trips on your account. Ready to plan your first adventure with us?",
        success: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const lastTrip = requests[0];
  const response = `I see you were looking at ${lastTrip.origin} to ${lastTrip.destination}` +
    (lastTrip.status === "completed" ? ". How was your trip?" : ". Want me to check on that, or are you thinking of somewhere new?");

  return new Response(
    JSON.stringify({
      response,
      success: true,
      history: requests
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Handle payment operations
 */
async function handleProcessPayment(
  params: MayaBrainRequest,
  supabase: any
): Promise<Response> {
  // Payment is always handled manually - we collect info and pass to admin
  return new Response(
    JSON.stringify({
      response: "For payment, we accept Zelle, Bitcoin, or Escrow.com for buyer protection. I'll send payment instructions to your email. What's the best email address?",
      success: true
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

/**
 * Legacy mode: route everything through ai-chat
 * Used when no specific action is provided (fallback)
 */
async function handleLegacyFullRouting(
  req: Request,
  body: any,
  supabase: any,
  supabaseUrl: string,
  anonKey: string
): Promise<Response> {
  console.log("[maya_brain] Legacy mode - routing to ai-chat");

  const userMessage = (
    body.text || body.message || body.user_message || body.input || body.transcript || ""
  ).trim();

  const phoneNumber = body.phone_number || body.phoneNumber || body.caller_id;
  const conversationId = body.conversation_id || body.conversationId;

  if (!userMessage) {
    return new Response(
      JSON.stringify({
        response: "I didn't catch that. Could you please repeat?",
        success: true
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Get customer ID
  let customerId: string | null = null;
  if (phoneNumber) {
    const { data } = await supabase.rpc("get_or_create_customer_by_phone", {
      p_phone: phoneNumber
    });
    customerId = data;
  }

  // Call ai-chat
  const aiChatResponse = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      message: userMessage,
      conversationId: conversationId,
      isVoiceCall: true,
      isElevenLabsRequest: true,
      phoneNumber: phoneNumber,
      customerId: customerId,
    }),
  });

  const responseText = await aiChatResponse.text();
  
  // Parse SSE response
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
        }
      } catch {
        // Skip non-JSON
      }
    }
  }

  // Clean for voice
  assistantResponse = assistantResponse
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .trim() || "I'm sorry, could you rephrase that?";

  return new Response(
    JSON.stringify({
      response: assistantResponse,
      success: true
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
