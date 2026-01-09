import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ElevenLabs Maya Server Tool
 * 
 * This edge function allows the ElevenLabs conversational agent to access
 * the SAME Maya capabilities as the website chat. It acts as a bridge between
 * ElevenLabs and our backend tools.
 * 
 * Configure this in ElevenLabs Dashboard:
 * 1. Go to Agents → Your Agent → Tools
 * 2. Add a Server Tool with this URL
 * 3. Define the tools Maya can call (see tool definitions below)
 */

// Initialize Supabase client
function getSupabase() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, supabaseKey);
}

// Tool execution - same logic as ai-chat
async function executeTool(supabase: any, toolName: string, args: any): Promise<any> {
  console.log(`[ElevenLabs Maya] Executing tool: ${toolName}`, args);

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
            special_notes: args.special_notes || null,
            trip_type: args.trip_type || (args.return_date ? "round_trip" : "one_way"),
            is_public: true,
            status: "submitted",
            payment_plan: "full"
          })
          .select()
          .single();

        if (error) {
          console.error("Error creating ticket request:", error);
          return { success: false, error: "Failed to submit request" };
        }

        // Also create marketplace listing
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

        return {
          success: true,
          request_id: data.id,
          message: `Request submitted! ${args.origin} to ${args.destination} on ${args.departure_date} for ${args.passengers} passenger${args.passengers > 1 ? 's' : ''}. We'll get back to you at ${args.contact_email} with quotes soon!`
        };
      }

      case "get_request_status": {
        let query = supabase.from("ticket_requests").select("*");
        if (args.request_id) query = query.eq("id", args.request_id);
        else if (args.email) query = query.eq("contact_email", args.email).order("created_at", { ascending: false }).limit(5);
        
        const { data, error } = await query;
        if (error || !data || data.length === 0) return { success: false, message: "No requests found" };
        
        const requests = (Array.isArray(data) ? data : [data]).map((r: any) => ({
          id: r.id,
          route: `${r.origin} to ${r.destination}`,
          date: r.departure_date,
          status: r.status,
          passengers: r.passengers,
          quoted_price: r.quoted_price
        }));
        return { success: true, requests };
      }

      case "search_flights": {
        // Simulated flight search
        const mockFlights = [
          { airline: "United", price: Math.floor(Math.random() * 300) + 200, stops: 0, duration: "2h 30m" },
          { airline: "Delta", price: Math.floor(Math.random() * 300) + 180, stops: 0, duration: "2h 45m" },
          { airline: "American", price: Math.floor(Math.random() * 300) + 190, stops: 1, duration: "4h 15m" },
        ];
        return { 
          success: true, 
          flights: mockFlights,
          route: `${args.origin} to ${args.destination}`,
          date: args.date,
          note: "These are estimated prices. Our prices are typically 15-40% lower!"
        };
      }

      // ==================== AWARD FLIGHT SEARCH ====================
      case "search_award_availability": {
        const SEATS_AERO_API_KEY = Deno.env.get("SEATS_AERO_API_KEY");
        if (!SEATS_AERO_API_KEY) {
          return { 
            success: false, 
            error: "Award search is temporarily unavailable. Let me check regular flight options instead." 
          };
        }

        try {
          const startDate = args.start_date;
          let endDate = args.end_date;
          if (!endDate) {
            const start = new Date(startDate);
            start.setDate(start.getDate() + 5);
            endDate = start.toISOString().split('T')[0];
          }

          const searchParams = new URLSearchParams({
            origin_airport: args.origin.toUpperCase(),
            destination_airport: args.destination.toUpperCase(),
            start_date: startDate,
            end_date: endDate,
            take: '50'
          });

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

          console.log(`Searching Seats.aero: ${args.origin} → ${args.destination}`);

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
            return { 
              success: false, 
              error: "Couldn't find award availability for that route right now."
            };
          }

          const data = await response.json();
          const results = data.data || [];
          
          if (results.length === 0) {
            return {
              success: true,
              message: `No award availability found for ${args.origin} to ${args.destination}. Want me to check cash fares instead?`,
              availability: []
            };
          }

          // Process results
          const processedResults = results.slice(0, 10).map((r: any) => ({
            date: r.Date,
            source: r.Source,
            economy_miles: r.YAvailable ? r.YMileageCost : null,
            business_miles: r.JAvailable ? r.JMileageCost : null,
            first_miles: r.FAvailable ? r.FMileageCost : null,
          }));

          return {
            success: true,
            route: `${args.origin} to ${args.destination}`,
            total_results: results.length,
            availability: processedResults,
            message: `Found ${results.length} award options!`
          };

        } catch (error) {
          console.error("Seats.aero search error:", error);
          return {
            success: false,
            error: "Award search hit a snag. Let me check regular options."
          };
        }
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

        const { data, error } = await query;
        if (error) return { success: false, error: "Failed to search vouchers" };
        if (!data || data.length === 0) return { success: true, vouchers: [], message: "No vouchers found" };

        return { 
          success: true, 
          vouchers: data.map((v: any) => ({
            id: v.id,
            airline: v.airline,
            face_value: v.face_value,
            sale_price: v.sale_price,
            discount_percent: v.discount_percent,
            expiry_date: v.expiry_date
          })),
          count: data.length 
        };
      }

      case "get_voucher_details": {
        const { data, error } = await supabase
          .from("vouchers")
          .select("*")
          .eq("id", args.voucher_id)
          .single();

        if (error || !data) return { success: false, error: "Voucher not found" };
        return { success: true, voucher: data };
      }

      // ==================== MARKETPLACE ====================
      case "search_marketplace_listings": {
        let query = supabase
          .from("marketplace_listings")
          .select(`*, ticket_requests (origin, destination, departure_date, passengers, cabin_class)`)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(5);

        const { data, error } = await query;
        if (error) return { success: false, error: "Failed to search" };

        return { 
          success: true, 
          listings: (data || []).map((l: any) => ({
            id: l.id,
            title: l.title,
            origin: l.ticket_requests?.origin,
            destination: l.ticket_requests?.destination,
            passengers: l.ticket_requests?.passengers
          }))
        };
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

        return { 
          success: true, 
          ticket_requests: requests?.length || 0,
          orders: orders?.length || 0,
          recent_requests: (requests || []).map((r: any) => ({
            route: `${r.origin} to ${r.destination}`,
            date: r.departure_date,
            status: r.status
          }))
        };
      }

      case "lookup_order": {
        let query = supabase.from("orders").select("*, vouchers (*)");
        if (args.order_id) query = query.eq("id", args.order_id);
        else if (args.email) query = query.eq("customer_email", args.email).order("created_at", { ascending: false }).limit(1);
        
        const { data, error } = await query.single();
        if (error) return { success: false, error: "Order not found" };
        return { success: true, order: data };
      }

      case "schedule_callback": {
        await supabase.from("admin_alerts").insert({
          conversation_id: "elevenlabs-call",
          alert_type: "callback_requested",
          message: `Callback requested via phone: ${args.reason}`,
          customer_context: JSON.stringify({ phone: args.phone, email: args.email, preferred_time: args.preferred_time })
        });

        return { success: true, message: "Got it! Someone from our team will call you back soon." };
      }

      case "send_confirmation_email": {
        await supabase.from("notification_log").insert({
          event_type: "email_sent",
          recipient: args.email,
          payload: { subject: args.subject, message: args.message, source: "elevenlabs" },
          status: "queued"
        });

        return { success: true, message: `Email will be sent to ${args.email}!` };
      }

      // ==================== SELLER INFO ====================
      case "get_seller_info": {
        const { data, error } = await supabase
          .from("sellers")
          .select(`*, seller_reviews (rating)`)
          .eq("status", "approved");

        if (error) return { success: false, error: "Failed to get sellers" };

        const sellers = (data || []).map((s: any) => {
          const ratings = s.seller_reviews || [];
          const avg = ratings.length > 0 
            ? (ratings.reduce((sum: number, r: any) => sum + r.rating, 0) / ratings.length).toFixed(1)
            : "New";
          return { name: s.business_name, rating: avg, reviews: ratings.length };
        });

        return { success: true, sellers };
      }

      // ==================== UTILITIES ====================
      case "check_weather": {
        // Simple weather simulation
        const conditions = ["Sunny", "Partly Cloudy", "Cloudy", "Rainy"];
        const temp = Math.floor(Math.random() * 30) + 50;
        return {
          success: true,
          destination: args.destination,
          temperature: `${temp}°F`,
          conditions: conditions[Math.floor(Math.random() * conditions.length)],
          travel_tip: temp > 75 ? "Pack light clothes!" : "Bring a jacket!"
        };
      }

      case "calculate_dates": {
        const start = new Date(args.start_date);
        const end = args.end_date ? new Date(args.end_date) : null;
        const days = end ? Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) : null;
        
        return {
          success: true,
          start_date: args.start_date,
          end_date: args.end_date,
          trip_duration_days: days,
          day_of_week: start.toLocaleDateString('en-US', { weekday: 'long' })
        };
      }

      default:
        console.log(`Unknown tool: ${toolName}`);
        return { success: true, message: "Let me handle that for you..." };
    }
  } catch (error) {
    console.error(`Tool execution error (${toolName}):`, error);
    return { success: false, error: "Something went wrong, but I'll try another way." };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("[ElevenLabs Maya] Received request:", JSON.stringify(body, null, 2));

    const supabase = getSupabase();

    // ElevenLabs Server Tool format
    // The request will contain the tool name and arguments
    const { tool_name, tool_input, message, action } = body;

    // Handle different request formats from ElevenLabs
    if (tool_name && tool_input) {
      // Server Tool call format
      const result = await executeTool(supabase, tool_name, tool_input);
      
      console.log(`[ElevenLabs Maya] Tool result:`, result);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Alternative: Direct action format
    if (action) {
      const result = await executeTool(supabase, action, body.params || {});
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If just a message, log it and return acknowledgment
    if (message) {
      console.log(`[ElevenLabs Maya] Message received: ${message}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: "Message received",
        note: "Use tool_name and tool_input for tool calls"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      error: "Invalid request format. Expected tool_name and tool_input." 
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[ElevenLabs Maya] Error:", error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
