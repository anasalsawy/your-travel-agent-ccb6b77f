import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS MAYA - DATA PROVIDER
 * 
 * This webhook returns STRUCTURED DATA for the ElevenLabs agent to use.
 * The ElevenLabs agent is the BRAIN - it decides what to say.
 * This function just provides the data it needs.
 * 
 * Supported intents:
 * - vouchers: Search/get available vouchers
 * - flights: Search award flights
 * - orders: Check order status
 * - ticket_request: Submit or check ticket requests
 * - general: General info about the service
 */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json();
    console.log("[ElevenLabs Maya] Received:", JSON.stringify(body, null, 2));

    // Extract user message
    const userMessage = (
      body.text ||
      body.message ||
      body.user_message ||
      body.input ||
      body.parameters?.text ||
      body.parameters?.message ||
      ""
    ).toLowerCase();

    console.log("[ElevenLabs Maya] User message:", userMessage);

    // Detect intent and get relevant data
    let responseData: any = {};
    let intent = "general";

    // VOUCHERS
    if (userMessage.includes("voucher") || userMessage.includes("credit") || userMessage.includes("deal")) {
      intent = "vouchers";
      
      const { data: vouchers, error } = await supabase
        .from("vouchers")
        .select("id, airline, title, face_value, sale_price, discount_percent, expiry_date, currency, type")
        .eq("status", "available")
        .order("discount_percent", { ascending: false })
        .limit(10);

      if (error) {
        console.error("Vouchers error:", error);
        responseData = { error: "Could not fetch vouchers", vouchers: [] };
      } else {
        responseData = {
          vouchers: vouchers || [],
          count: vouchers?.length || 0,
          message: vouchers?.length 
            ? `Found ${vouchers.length} available vouchers` 
            : "No vouchers available right now"
        };
      }
    }
    
    // ORDERS / ORDER STATUS
    else if (userMessage.includes("order") || userMessage.includes("status") || userMessage.includes("purchase")) {
      intent = "orders";
      
      // Get recent orders (in production, would filter by user)
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, amount_paid, payment_status, order_status, delivery_status, created_at, voucher_id")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        console.error("Orders error:", error);
        responseData = { error: "Could not fetch orders", orders: [] };
      } else {
        responseData = {
          orders: orders || [],
          count: orders?.length || 0,
          message: orders?.length 
            ? `Found ${orders.length} recent orders` 
            : "No orders found"
        };
      }
    }
    
    // TICKET REQUESTS / FLIGHT BOOKING
    else if (
      userMessage.includes("ticket") || 
      userMessage.includes("flight") || 
      userMessage.includes("book") ||
      userMessage.includes("fly") ||
      userMessage.includes("travel")
    ) {
      intent = "ticket_requests";
      
      // Check if they're asking about existing requests or want to create one
      if (userMessage.includes("request") || userMessage.includes("submit") || userMessage.includes("new")) {
        responseData = {
          action: "create_ticket_request",
          required_fields: ["origin", "destination", "departure_date", "passengers", "cabin_class", "contact_email"],
          optional_fields: ["return_date", "budget", "flexibility", "preferred_airline", "special_notes"],
          message: "To submit a ticket request, I need: origin, destination, travel date, number of passengers, cabin class, and your email."
        };
      } else {
        // Get recent ticket requests
        const { data: requests, error } = await supabase
          .from("ticket_requests")
          .select("id, origin, destination, departure_date, return_date, passengers, cabin_class, status, quoted_price, payment_status")
          .order("created_at", { ascending: false })
          .limit(5);

        if (error) {
          console.error("Ticket requests error:", error);
          responseData = { error: "Could not fetch requests", requests: [] };
        } else {
          responseData = {
            requests: requests || [],
            count: requests?.length || 0,
            message: requests?.length 
              ? `Found ${requests.length} ticket requests` 
              : "No ticket requests found"
          };
        }
      }
    }
    
    // AWARD FLIGHTS / MILES / POINTS
    else if (
      userMessage.includes("award") || 
      userMessage.includes("miles") || 
      userMessage.includes("points") ||
      userMessage.includes("redeem")
    ) {
      intent = "award_flights";
      responseData = {
        action: "search_award_flights",
        supported_programs: ["United MileagePlus", "American AAdvantage", "Delta SkyMiles", "Air Canada Aeroplan", "Alaska Mileage Plan", "British Airways Avios", "Emirates Skywards", "Singapore KrisFlyer"],
        required_fields: ["origin", "destination", "date"],
        message: "I can search award flight availability. Tell me where you want to go, when, and I'll check availability across major programs."
      };
    }
    
    // PRICING / COST
    else if (userMessage.includes("price") || userMessage.includes("cost") || userMessage.includes("how much")) {
      intent = "pricing";
      responseData = {
        pricing_info: {
          service_fee: "We charge a small service fee on bookings",
          voucher_discount: "Vouchers are sold at 10-30% below face value",
          payment_methods: ["Credit Card", "PayPal", "Bitcoin", "Bank Transfer"]
        },
        message: "Our vouchers are discounted 10-30% below face value. We accept multiple payment methods."
      };
    }
    
    // HELP / SUPPORT
    else if (userMessage.includes("help") || userMessage.includes("support") || userMessage.includes("contact")) {
      intent = "support";
      responseData = {
        support_options: {
          email: "support@yourtravelagent.com",
          chat: "Available 24/7",
          phone: "Callback available"
        },
        message: "I'm here to help! I can assist with vouchers, flight bookings, and orders."
      };
    }
    
    // GENERAL / GREETING
    else {
      intent = "general";
      
      // Get some stats to make it informative
      const { count: voucherCount } = await supabase
        .from("vouchers")
        .select("*", { count: "exact", head: true })
        .eq("status", "available");

      responseData = {
        services: [
          "Discounted airline vouchers and travel credits",
          "Flight booking assistance",
          "Award flight searches",
          "Order tracking and support"
        ],
        available_vouchers: voucherCount || 0,
        message: `Welcome! We have ${voucherCount || 0} vouchers available. I can help with vouchers, flight bookings, or order status.`
      };
    }

    // Build response
    const response = {
      intent,
      data: responseData,
      timestamp: new Date().toISOString()
    };

    console.log("[ElevenLabs Maya] Response:", JSON.stringify(response, null, 2));

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("[ElevenLabs Maya] Error:", error);

    return new Response(
      JSON.stringify({
        intent: "error",
        data: {
          error: "Something went wrong",
          message: "I'm having trouble processing that. Could you try again?"
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
