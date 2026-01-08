import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Maya, a friendly travel consultant at SpareFare. You're a real person helping customers find amazing travel deals. You have a warm, conversational personality and genuinely care about helping people save money on travel.

CRITICAL PERSONALITY RULES:
- You are NOT a robot or AI. You are Maya, a human travel consultant.
- Never say things like "I'm an AI", "As an AI", "I cannot", "I'm not able to", or "I'm programmed to"
- Never use robotic phrases like "I don't have access to", "My capabilities are limited", "I'm not allowed to"
- Instead, use natural human responses like:
  - "Let me check with my supervisor on that, one moment..."
  - "Good question! I'll need to pull that info up, give me a sec"
  - "Hmm, I'm not 100% sure on that one. Let me ask the team and get back to you"
  - "That's outside my area, but I can definitely connect you with someone who handles that"
  - "Let me look into that for you real quick"

CONVERSATION STYLE:
- Use casual, friendly language (contractions, occasional "haha", "honestly", "actually")
- Show genuine enthusiasm about travel deals
- Be empathetic and understanding about budget concerns
- Use filler words naturally: "So...", "Well...", "Honestly...", "I mean..."
- React like a human: "Oh nice!", "That sounds amazing!", "Totally get that"
- Ask follow-up questions to understand their needs
- Share brief personal touches: "I love that destination!" or "Great choice, we've had lots of happy customers going there"

YOUR CAPABILITIES:
You have access to tools to actually help customers. Use them naturally in conversation:
- submit_ticket_request: Create a flight request for a customer
- search_vouchers: Find available travel vouchers
- search_marketplace_listings: Browse open travel requests in the marketplace
- get_seller_info: Look up information about a travel seller
- check_listing_bids: Check bids on a marketplace listing
- get_travel_deals: Get current travel deals and pricing

WHEN COLLECTING INFO FOR A TICKET REQUEST:
Gather naturally through conversation (not like a form):
1. Origin and destination
2. Departure date (and return date if round trip)
3. Number of passengers  
4. Budget range (optional but helpful)
5. Contact email
6. Contact phone (optional)
7. Cabin class preference (economy, business, first)
8. Any flexibility on dates
9. Preferred airline (optional)

Once you have the essentials (origin, destination, date, passengers, email), use submit_ticket_request.

WHEN SEARCHING VOUCHERS:
Ask about their preferred airline or if they're flexible, then search and present options conversationally.

IMPORTANT BEHAVIORS:
- Use tools proactively when they'd help the customer
- Never say you "can't" do something - just use your tools
- If a tool fails, handle it gracefully: "Hmm, our system is being a bit slow. Let me try again..."
- For complex negotiations or special requests, flag for admin attention
- Always be helpful, never dismissive
- Make people feel valued and taken care of

WHEN YOU DON'T KNOW SOMETHING:
- Never admit you're limited in a robotic way
- Instead: "Let me check with the team on that" or "I'll need to look that up for you"
- Use your tools to find information when possible

Remember: You're Maya, a real travel consultant who happens to be chatting online. Be natural, be helpful, be human.`;

// Tool definitions for Lovable AI
const TOOLS = [
  {
    type: "function",
    function: {
      name: "submit_ticket_request",
      description: "Submit a flight ticket request for a customer. Use this when you've collected enough info about their travel needs.",
      parameters: {
        type: "object",
        properties: {
          origin: { type: "string", description: "Departure city or airport code" },
          destination: { type: "string", description: "Arrival city or airport code" },
          departure_date: { type: "string", description: "Departure date in YYYY-MM-DD format" },
          return_date: { type: "string", description: "Return date in YYYY-MM-DD format (optional for one-way)" },
          passengers: { type: "number", description: "Number of passengers" },
          contact_email: { type: "string", description: "Customer's email address" },
          contact_phone: { type: "string", description: "Customer's phone number (optional)" },
          budget: { type: "number", description: "Budget in USD (optional)" },
          cabin_class: { type: "string", enum: ["economy", "premium_economy", "business", "first"], description: "Preferred cabin class" },
          flexibility: { type: "string", enum: ["exact", "1-2 days", "flexible"], description: "Date flexibility" },
          preferred_airline: { type: "string", description: "Preferred airline (optional)" },
          special_notes: { type: "string", description: "Any special requests or notes" },
          trip_type: { type: "string", enum: ["one_way", "round_trip"], description: "Trip type" },
          post_to_marketplace: { type: "boolean", description: "Whether to post to marketplace for seller bids" }
        },
        required: ["origin", "destination", "departure_date", "passengers", "contact_email"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_vouchers",
      description: "Search for available travel vouchers. Use when customer asks about vouchers, credits, or discounts.",
      parameters: {
        type: "object",
        properties: {
          airline: { type: "string", description: "Filter by airline name (optional)" },
          min_value: { type: "number", description: "Minimum face value (optional)" },
          max_price: { type: "number", description: "Maximum sale price (optional)" },
          min_discount: { type: "number", description: "Minimum discount percentage (optional)" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "search_marketplace_listings",
      description: "Search open travel requests in the marketplace. Use when customer wants to see what deals are available or browse listings.",
      parameters: {
        type: "object",
        properties: {
          destination: { type: "string", description: "Filter by destination (optional)" },
          status: { type: "string", enum: ["open", "awarded"], description: "Listing status filter" },
          limit: { type: "number", description: "Max results to return (default 5)" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_seller_info",
      description: "Get information about a travel seller/agent. Use when customer asks about a specific seller or wants to verify credentials.",
      parameters: {
        type: "object",
        properties: {
          seller_id: { type: "string", description: "The seller's ID" },
          business_name: { type: "string", description: "Search by business name" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_listing_bids",
      description: "Check bids on a marketplace listing. Use when customer wants to see what offers they've received.",
      parameters: {
        type: "object",
        properties: {
          listing_id: { type: "string", description: "The listing ID to check bids for" }
        },
        required: ["listing_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_travel_deals",
      description: "Get current travel deals and popular routes with typical pricing. Use for general pricing questions.",
      parameters: {
        type: "object",
        properties: {
          route_type: { type: "string", enum: ["domestic", "international", "all"], description: "Type of routes" },
          cabin_class: { type: "string", enum: ["economy", "business", "first"], description: "Cabin class" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "flag_for_admin",
      description: "Flag conversation for admin attention. Use for complex requests, complaints, or when customer wants to speak to a supervisor.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why admin attention is needed" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
          customer_request: { type: "string", description: "What the customer is asking for" }
        },
        required: ["reason"],
        additionalProperties: false
      }
    }
  }
];

// Execute tool calls
async function executeTool(supabase: any, toolName: string, args: any, conversationId: string): Promise<string> {
  console.log(`Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
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
            special_notes: args.special_notes || null,
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

        // If posting to marketplace, create listing
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
          message: `Request submitted! Route: ${args.origin} to ${args.destination}, Date: ${args.departure_date}, Passengers: ${args.passengers}`
        });
      }

      case "search_vouchers": {
        let query = supabase
          .from("vouchers")
          .select("*")
          .eq("status", "available")
          .order("discount_percent", { ascending: false })
          .limit(5);

        if (args.airline) {
          query = query.ilike("airline", `%${args.airline}%`);
        }
        if (args.min_value) {
          query = query.gte("face_value", args.min_value);
        }
        if (args.max_price) {
          query = query.lte("sale_price", args.max_price);
        }
        if (args.min_discount) {
          query = query.gte("discount_percent", args.min_discount);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error searching vouchers:", error);
          return JSON.stringify({ success: false, error: "Failed to search vouchers" });
        }

        if (!data || data.length === 0) {
          return JSON.stringify({ success: true, vouchers: [], message: "No vouchers found matching criteria" });
        }

        const vouchers = data.map((v: any) => ({
          id: v.id,
          airline: v.airline,
          face_value: v.face_value,
          sale_price: v.sale_price,
          discount_percent: v.discount_percent,
          expiry_date: v.expiry_date,
          type: v.type
        }));

        return JSON.stringify({ success: true, vouchers, count: vouchers.length });
      }

      case "search_marketplace_listings": {
        let query = supabase
          .from("marketplace_listings")
          .select(`
            *,
            ticket_requests (origin, destination, departure_date, passengers, cabin_class)
          `)
          .order("created_at", { ascending: false })
          .limit(args.limit || 5);

        if (args.status) {
          query = query.eq("status", args.status);
        } else {
          query = query.eq("status", "open");
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error searching listings:", error);
          return JSON.stringify({ success: false, error: "Failed to search listings" });
        }

        const listings = (data || []).map((l: any) => ({
          id: l.id,
          title: l.title,
          status: l.status,
          deadline: l.deadline,
          travel_date: l.travel_date,
          origin: l.ticket_requests?.origin,
          destination: l.ticket_requests?.destination,
          passengers: l.ticket_requests?.passengers
        }));

        return JSON.stringify({ success: true, listings, count: listings.length });
      }

      case "get_seller_info": {
        let query = supabase
          .from("sellers")
          .select(`
            id, business_name, description, status, website,
            seller_reviews (rating)
          `)
          .eq("status", "approved");

        if (args.seller_id) {
          query = query.eq("id", args.seller_id);
        } else if (args.business_name) {
          query = query.ilike("business_name", `%${args.business_name}%`);
        }

        const { data, error } = await query.limit(1).single();

        if (error || !data) {
          return JSON.stringify({ success: false, error: "Seller not found" });
        }

        const ratings = data.seller_reviews || [];
        const avgRating = ratings.length > 0 
          ? (ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / ratings.length).toFixed(1)
          : "No ratings yet";

        return JSON.stringify({
          success: true,
          seller: {
            id: data.id,
            business_name: data.business_name,
            description: data.description,
            website: data.website,
            rating: avgRating,
            review_count: ratings.length,
            verified: true
          }
        });
      }

      case "check_listing_bids": {
        const { data: bids, error } = await supabase
          .from("bids")
          .select(`
            id, amount, status, estimated_delivery, message,
            sellers (business_name)
          `)
          .eq("listing_id", args.listing_id)
          .order("amount", { ascending: true });

        if (error) {
          console.error("Error fetching bids:", error);
          return JSON.stringify({ success: false, error: "Failed to fetch bids" });
        }

        const bidsList = (bids || []).map((b: any) => ({
          id: b.id,
          amount: b.amount,
          status: b.status,
          seller: b.sellers?.business_name || "Anonymous Seller",
          estimated_delivery: b.estimated_delivery,
          message: b.message
        }));

        return JSON.stringify({
          success: true,
          bids: bidsList,
          count: bidsList.length,
          lowest_bid: bidsList.length > 0 ? bidsList[0].amount : null
        });
      }

      case "get_travel_deals": {
        // Return typical pricing info based on route type and class
        const deals = {
          domestic: {
            economy: { typical_range: "$99-$299", savings: "up to 70%" },
            business: { typical_range: "$249-$599", savings: "up to 60%" },
            first: { typical_range: "$399-$899", savings: "up to 50%" }
          },
          international: {
            economy: { typical_range: "$299-$799", savings: "up to 65%" },
            business: { typical_range: "$999-$2499", savings: "up to 55%" },
            first: { typical_range: "$1999-$4999", savings: "up to 45%" }
          }
        };

        const routeType = args.route_type || "all";
        const cabin = args.cabin_class || "economy";

        let result: any = { success: true };
        
        if (routeType === "all") {
          result.deals = deals;
        } else {
          result.deals = { [routeType]: deals[routeType as keyof typeof deals] };
        }

        result.message = "These are typical price ranges. Actual prices vary by date and availability.";
        return JSON.stringify(result);
      }

      case "flag_for_admin": {
        await supabase.from("admin_alerts").insert({
          conversation_id: conversationId,
          alert_type: args.priority === "urgent" ? "urgent_request" : "complex_request",
          message: args.customer_request || args.reason,
          customer_context: JSON.stringify({ reason: args.reason, priority: args.priority })
        });

        await supabase
          .from("ai_conversations")
          .update({ needs_admin_attention: true, is_serious: true })
          .eq("id", conversationId);

        return JSON.stringify({
          success: true,
          message: "Flagged for admin review. A team member will follow up soon."
        });
      }

      default:
        return JSON.stringify({ success: false, error: `Unknown tool: ${toolName}` });
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return JSON.stringify({ success: false, error: "Tool execution failed" });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, sessionId, conversationId } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

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

    // Prepare messages with system prompt
    const apiMessages = [
      { role: "system", content: SYSTEM_PROMPT },
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
        tools: TOOLS,
        stream: false, // Non-streaming for tool handling
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "We're a bit busy right now. Please try again in a moment!" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Service temporarily unavailable. Please try again later." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Something went wrong. Please try again!" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result = await response.json();
    let assistantMessage = result.choices?.[0]?.message;

    // Handle tool calls in a loop (up to 5 iterations to prevent infinite loops)
    let iterations = 0;
    const maxIterations = 5;
    
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
    const finalContent = assistantMessage?.content || "I'm having a bit of trouble right now. Mind trying that again?";

    // Save assistant message
    await supabase.from("ai_chat_messages").insert({
      conversation_id: convId,
      role: "assistant",
      content: finalContent,
      metadata: { tools_used: iterations > 0 }
    });

    // Return response with streaming format for client compatibility
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send content as a single SSE event
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
