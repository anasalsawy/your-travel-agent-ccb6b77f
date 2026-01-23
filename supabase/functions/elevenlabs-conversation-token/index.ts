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
  // New: Maya's learned insights
  customer_insights: string;
  proven_tactics: string;
}

async function fetchCustomerContext(
  supabase: any,
  phoneNumber?: string,
  userId?: string
): Promise<CustomerContext> {
  const defaultContext: CustomerContext = {
    customer_name: "valued customer",
    customer_phone: phoneNumber || "",
    customer_email: "",
    recent_requests: "No previous requests on file.",
    conversation_summary: "This is a new customer - be warm and welcoming!",
    preferences: "No known preferences yet.",
    customer_insights: "",
    proven_tactics: "",
  };

  try {
    let customerId: string | null = null;

    // Try to find customer by phone or user ID
    if (phoneNumber) {
      const { data: customer } = await supabase
        .rpc("get_or_create_customer_by_phone", { p_phone: phoneNumber });
      if (customer) customerId = customer;
    } else if (userId) {
      // Check profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone")
        .eq("id", userId)
        .single();
      if (profile) {
        customerId = profile.id;
        defaultContext.customer_name = profile.full_name || "valued customer";
        defaultContext.customer_email = profile.email || "";
        defaultContext.customer_phone = profile.phone || "";
      }
    }

    // Fetch global proven tactics (top 5 learnings)
    const { data: learnings } = await supabase
      .from("maya_global_learnings")
      .select("title, description")
      .eq("is_active", true)
      .gte("confidence_score", 6)
      .order("success_rate", { ascending: false })
      .limit(5);

    if (learnings && learnings.length > 0) {
      defaultContext.proven_tactics = learnings
        .map((l: any) => `• ${l.title}: ${l.description}`)
        .join("\n");
    }

    if (!customerId) {
      console.log("No customer found, using default context with global learnings");
      return defaultContext;
    }

    // Fetch customer profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", customerId)
      .single();

    if (profile) {
      defaultContext.customer_name = profile.full_name || "valued customer";
      defaultContext.customer_email = profile.email || "";
      defaultContext.customer_phone = profile.phone || "";
    }

    // Fetch Maya's learned customer memory
    const { data: memory } = await supabase
      .from("maya_customer_memory")
      .select("*")
      .eq("customer_id", customerId)
      .single();

    if (memory) {
      const insights: string[] = [];
      
      if (memory.preferred_tone) {
        insights.push(`Communication: ${memory.preferred_tone}`);
      }
      if (memory.response_style) {
        insights.push(`Decision style: ${memory.response_style}`);
      }
      if (memory.preferred_airlines?.length) {
        insights.push(`Prefers: ${memory.preferred_airlines.join(", ")}`);
      }
      if (memory.what_works?.length) {
        insights.push(`What works: ${memory.what_works.join("; ")}`);
      }
      if (memory.what_failed?.length) {
        insights.push(`Avoid: ${memory.what_failed.join("; ")}`);
      }
      if (memory.key_facts) {
        const facts = typeof memory.key_facts === "string" 
          ? memory.key_facts 
          : JSON.stringify(memory.key_facts);
        if (facts && facts !== "[]") {
          insights.push(`Key facts: ${facts}`);
        }
      }
      if (memory.rapport_level) {
        insights.push(`Rapport: ${memory.rapport_level}/10`);
      }
      if (memory.booking_history_count > 0) {
        insights.push(`${memory.booking_history_count} previous bookings ($${memory.total_spend || 0} total)`);
      }

      defaultContext.customer_insights = insights.join("\n");
      defaultContext.preferences = insights.slice(0, 3).join("; ") || "No known preferences yet.";
    }

    // Fetch recent ticket requests
    const { data: requests } = await supabase
      .from("ticket_requests")
      .select("origin, destination, departure_date, passengers, status, quoted_price")
      .or(`contact_email.eq.${defaultContext.customer_email},contact_phone.eq.${defaultContext.customer_phone}`)
      .order("created_at", { ascending: false })
      .limit(5);

    if (requests && requests.length > 0) {
      const requestSummaries = requests.map((r: any) => {
        const price = r.quoted_price ? `$${r.quoted_price}` : "pending";
        return `${r.origin} → ${r.destination} (${r.departure_date}, ${r.status}, ${price})`;
      });
      defaultContext.recent_requests = requestSummaries.join("; ");
    }

    // Fetch recent conversation summary
    const { data: conversations } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("customer_id", customerId)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (conversations && conversations.length > 0) {
      // Get recent messages to summarize
      const { data: messages } = await supabase
        .from("ai_chat_messages")
        .select("role, content")
        .eq("conversation_id", conversations[0].id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (messages && messages.length > 0) {
        const topics = messages
          .filter((m: any) => m.role === "user")
          .map((m: any) => m.content.substring(0, 80))
          .slice(0, 3)
          .join("; ");
        defaultContext.conversation_summary = `Recent: ${topics}`;
      }
    }

    console.log("Loaded customer context:", {
      name: defaultContext.customer_name,
      hasMemory: !!memory,
      hasRequests: requests?.length || 0,
      hasLearnings: learnings?.length || 0,
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
