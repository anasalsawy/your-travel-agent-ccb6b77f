import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS CONVERSATION TOKEN - HYBRID ARCHITECTURE
 * 
 * Generates a secure conversation token for ElevenLabs Conversational AI SDK
 * AND pre-loads customer context to inject as dynamic_variables.
 * 
 * This enables:
 * - Fast conversation using ElevenLabs native LLM (pre-loaded context)
 * - maya_brain tool calls only for critical actions (booking, quotes, payments)
 * - Near-instant responses for general chat
 */

interface CustomerContext {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  recent_requests: string;
  conversation_summary: string;
  preferences: string;
}

async function fetchCustomerContext(
  supabase: any,
  phoneNumber?: string,
  userId?: string
): Promise<CustomerContext> {
  const defaultContext: CustomerContext = {
    customer_name: "valued customer",
    customer_phone: "",
    customer_email: "",
    recent_requests: "No previous requests on file.",
    conversation_summary: "This is a new customer - be warm and welcoming!",
    preferences: "No known preferences yet.",
  };

  try {
    let customerId: string | null = null;

    // Try to find customer by phone or user ID
    if (phoneNumber) {
      const { data: customer } = await supabase
        .rpc("get_or_create_customer_by_phone", { p_phone: phoneNumber });
      if (customer) customerId = customer;
    } else if (userId) {
      const { data: customer } = await supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("user_id", userId)
        .single();
      if (customer) {
        customerId = customer.id;
        defaultContext.customer_name = customer.name || "valued customer";
        defaultContext.customer_email = customer.email || "";
        defaultContext.customer_phone = customer.phone || "";
      }
    }

    if (!customerId) {
      console.log("No customer found, using default context");
      return defaultContext;
    }

    // Fetch customer details
    const { data: customerData } = await supabase
      .from("customers")
      .select("name, email, phone, notes")
      .eq("id", customerId)
      .single();

    if (customerData) {
      defaultContext.customer_name = customerData.name || "valued customer";
      defaultContext.customer_email = customerData.email || "";
      defaultContext.customer_phone = customerData.phone || "";
      if (customerData.notes) {
        defaultContext.preferences = customerData.notes;
      }
    }

    // Fetch recent ticket requests (last 5)
    const { data: requests } = await supabase
      .from("ticket_requests")
      .select("id, origin, destination, travel_date, passengers, status, quoted_price, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (requests && requests.length > 0) {
      const requestSummaries = requests.map((r: any) => {
        const price = r.quoted_price ? `$${r.quoted_price}` : "pending quote";
        return `${r.origin} → ${r.destination} on ${r.travel_date} (${r.passengers} pax, ${r.status}, ${price})`;
      });
      defaultContext.recent_requests = requestSummaries.join("; ");
    }

    // Fetch recent conversation summary (last conversation)
    const { data: conversations } = await supabase
      .from("ai_conversations")
      .select("id, summary, updated_at")
      .eq("customer_id", customerId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (conversations && conversations.length > 0 && conversations[0].summary) {
      defaultContext.conversation_summary = conversations[0].summary;
    } else {
      // Try to build summary from recent messages
      const { data: messages } = await supabase
        .from("ai_chat_messages")
        .select("role, content")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (messages && messages.length > 0) {
        const topics = messages
          .filter((m: any) => m.role === "user")
          .map((m: any) => m.content.substring(0, 100))
          .join("; ");
        defaultContext.conversation_summary = `Recent topics discussed: ${topics}`;
      }
    }

    console.log("Loaded customer context:", {
      name: defaultContext.customer_name,
      hasRequests: defaultContext.recent_requests !== "No previous requests on file.",
      hasSummary: defaultContext.conversation_summary !== "This is a new customer - be warm and welcoming!",
    });

    return defaultContext;

  } catch (error) {
    console.error("Error fetching customer context:", error);
    return defaultContext;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
  const ELEVENLABS_AGENT_ID = Deno.env.get("ELEVENLABS_AGENT_ID");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_AGENT_ID) {
    console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID");
    return new Response(
      JSON.stringify({ error: "ElevenLabs not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse request body for customer identification
    let phoneNumber: string | undefined;
    let userId: string | undefined;

    try {
      const body = await req.json();
      phoneNumber = body.phone_number;
      userId = body.user_id;
    } catch {
      // No body provided, that's fine
    }

    // Initialize Supabase client
    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch customer context for dynamic variables
    const customerContext = await fetchCustomerContext(supabase, phoneNumber, userId);

    // Get signed URL from ElevenLabs
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs token error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to get conversation token" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("Got signed URL for agent:", ELEVENLABS_AGENT_ID);

    return new Response(
      JSON.stringify({ 
        signed_url: data.signed_url,
        agent_id: ELEVENLABS_AGENT_ID,
        // Pass customer context to be used as dynamic_variables
        customer_context: customerContext,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error getting conversation token:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
