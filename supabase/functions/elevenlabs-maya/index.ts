import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * ELEVENLABS MAYA - DATA PROVIDER + ACTION EXECUTOR
 * 
 * This webhook provides structured data AND executes actions for the ElevenLabs agent.
 * The ElevenLabs agent is the BRAIN - it decides what to say and what actions to take.
 * This function provides data and executes the actions it requests.
 * 
 * DATA INTENTS (read-only):
 * - vouchers: Search/get available vouchers
 * - orders: Check order status
 * - ticket_requests: Check existing ticket requests
 * - general: General info about the service
 * 
 * ACTION INTENTS (write operations):
 * - create_ticket_request: Submit a new ticket/flight request
 * - reserve_voucher: Hold a voucher for a customer
 * - cancel_request: Cancel a ticket request
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

    // Extract user message and action parameters
    // IMPORTANT: Check userMessage first (from WhatsApp integration)
    const userMessage = (
      body.userMessage ||
      body.text ||
      body.message ||
      body.user_message ||
      body.input ||
      body.parameters?.text ||
      body.parameters?.message ||
      ""
    ).toLowerCase();

    // Check if this is an action request (parameters contain action data)
    const actionType = body.action || body.parameters?.action;
    const actionData = body.data || body.parameters?.data || body.parameters;

    console.log("[ElevenLabs Maya] User message:", userMessage);
    console.log("[ElevenLabs Maya] Action type:", actionType);
    console.log("[ElevenLabs Maya] Action data:", actionData);

    let responseData: any = {};
    let intent = "general";

    // ===== ACTION HANDLERS =====
    
    // CREATE TICKET REQUEST
    if (actionType === "create_ticket_request" || 
        (userMessage.includes("create") && userMessage.includes("request")) ||
        (userMessage.includes("book") && actionData?.origin)) {
      
      intent = "create_ticket_request";
      
      // Validate required fields
      const origin = actionData?.origin;
      const destination = actionData?.destination;
      const departureDate = actionData?.departure_date || actionData?.departureDate;
      const passengers = actionData?.passengers || 1;
      const cabinClass = actionData?.cabin_class || actionData?.cabinClass || "economy";
      const contactEmail = actionData?.contact_email || actionData?.contactEmail || actionData?.email;
      const contactPhone = actionData?.contact_phone || actionData?.contactPhone || actionData?.phone;
      const returnDate = actionData?.return_date || actionData?.returnDate;
      const budget = actionData?.budget;
      const specialNotes = actionData?.special_notes || actionData?.specialNotes || actionData?.notes;

      if (!origin || !destination || !departureDate || !contactEmail) {
        responseData = {
          success: false,
          missing_fields: [],
          message: "I need more information to create your ticket request."
        };
        if (!origin) responseData.missing_fields.push("origin (departure city/airport)");
        if (!destination) responseData.missing_fields.push("destination (arrival city/airport)");
        if (!departureDate) responseData.missing_fields.push("departure_date");
        if (!contactEmail) responseData.missing_fields.push("contact_email");
      } else {
        // Create the ticket request
        const { data: newRequest, error } = await supabase
          .from("ticket_requests")
          .insert({
            origin,
            destination,
            departure_date: departureDate,
            return_date: returnDate || null,
            passengers,
            cabin_class: cabinClass,
            contact_email: contactEmail,
            contact_phone: contactPhone || null,
            budget: budget || null,
            special_notes: specialNotes || null,
            status: "pending",
            payment_status: "pending"
          })
          .select()
          .single();

        if (error) {
          console.error("Create ticket request error:", error);
          responseData = {
            success: false,
            error: error.message,
            message: "Sorry, I couldn't create the ticket request. Please try again."
          };
        } else {
          responseData = {
            success: true,
            request: {
              id: newRequest.id,
              origin: newRequest.origin,
              destination: newRequest.destination,
              departure_date: newRequest.departure_date,
              return_date: newRequest.return_date,
              passengers: newRequest.passengers,
              cabin_class: newRequest.cabin_class
            },
            message: `I've created your ticket request from ${origin} to ${destination} on ${departureDate}. You'll receive a quote at ${contactEmail} soon.`
          };
        }
      }
    }
    
    // RESERVE VOUCHER
    else if (actionType === "reserve_voucher" || 
             (userMessage.includes("reserve") && userMessage.includes("voucher"))) {
      
      intent = "reserve_voucher";
      
      const voucherId = actionData?.voucher_id || actionData?.voucherId || actionData?.id;
      const customerEmail = actionData?.customer_email || actionData?.customerEmail || actionData?.email;
      
      if (!voucherId) {
        responseData = {
          success: false,
          message: "Which voucher would you like to reserve? Please provide the voucher ID or tell me more about what you're looking for."
        };
      } else {
        // Check if voucher is available
        const { data: voucher, error: fetchError } = await supabase
          .from("vouchers")
          .select("*")
          .eq("id", voucherId)
          .single();

        if (fetchError || !voucher) {
          responseData = {
            success: false,
            message: "I couldn't find that voucher. It may have been sold already."
          };
        } else if (voucher.status !== "available") {
          responseData = {
            success: false,
            message: `Sorry, this ${voucher.airline} voucher is no longer available. Would you like me to find similar options?`
          };
        } else {
          // Mark voucher as reserved (you could add a reserved_until timestamp)
          const { error: updateError } = await supabase
            .from("vouchers")
            .update({ 
              status: "reserved",
              updated_at: new Date().toISOString()
            })
            .eq("id", voucherId);

          if (updateError) {
            responseData = {
              success: false,
              message: "Sorry, I couldn't reserve this voucher right now. Please try again."
            };
          } else {
            responseData = {
              success: true,
              voucher: {
                id: voucher.id,
                airline: voucher.airline,
                title: voucher.title,
                face_value: voucher.face_value,
                sale_price: voucher.sale_price,
                discount_percent: voucher.discount_percent
              },
              message: `I've reserved the ${voucher.airline} voucher worth $${voucher.face_value} for you at just $${voucher.sale_price}. Would you like to proceed with payment?`
            };
          }
        }
      }
    }
    
    // CANCEL REQUEST
    else if (actionType === "cancel_request" || 
             (userMessage.includes("cancel") && (userMessage.includes("request") || userMessage.includes("booking")))) {
      
      intent = "cancel_request";
      
      const requestId = actionData?.request_id || actionData?.requestId || actionData?.id;
      const reason = actionData?.reason || "Customer requested cancellation";
      
      if (!requestId) {
        responseData = {
          success: false,
          message: "Which request would you like to cancel? Please provide the request ID or your email so I can look it up."
        };
      } else {
        const { data: request, error: fetchError } = await supabase
          .from("ticket_requests")
          .select("*")
          .eq("id", requestId)
          .single();

        if (fetchError || !request) {
          responseData = {
            success: false,
            message: "I couldn't find that request. Please check the ID and try again."
          };
        } else if (request.status === "cancelled") {
          responseData = {
            success: false,
            message: "This request has already been cancelled."
          };
        } else if (request.status === "ticketed" || request.status === "completed") {
          responseData = {
            success: false,
            message: "This ticket has already been issued. Please contact support for assistance with changes or refunds."
          };
        } else {
          const { error: updateError } = await supabase
            .from("ticket_requests")
            .update({ 
              status: "cancelled",
              admin_notes: reason,
              updated_at: new Date().toISOString()
            })
            .eq("id", requestId);

          if (updateError) {
            responseData = {
              success: false,
              message: "Sorry, I couldn't cancel this request right now. Please try again."
            };
          } else {
            responseData = {
              success: true,
              message: `I've cancelled your ticket request from ${request.origin} to ${request.destination}. Is there anything else I can help you with?`
            };
          }
        }
      }
    }

    // ===== DATA QUERIES (unchanged) =====
    
    // VOUCHERS
    else if (userMessage.includes("voucher") || userMessage.includes("credit") || userMessage.includes("deal")) {
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
      
      const customerEmail = actionData?.email || actionData?.customer_email;
      
      let query = supabase
        .from("orders")
        .select("id, amount_paid, payment_status, order_status, delivery_status, created_at, voucher_id, customer_email")
        .order("created_at", { ascending: false })
        .limit(5);
      
      if (customerEmail) {
        query = query.eq("customer_email", customerEmail);
      }

      const { data: orders, error } = await query;

      if (error) {
        console.error("Orders error:", error);
        responseData = { error: "Could not fetch orders", orders: [] };
      } else {
        responseData = {
          orders: orders || [],
          count: orders?.length || 0,
          message: orders?.length 
            ? `Found ${orders.length} orders` 
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
      
      if (userMessage.includes("new") || userMessage.includes("want") || userMessage.includes("need")) {
        responseData = {
          action: "create_ticket_request",
          required_fields: ["origin", "destination", "departure_date", "contact_email"],
          optional_fields: ["return_date", "passengers", "cabin_class", "budget", "special_notes", "contact_phone"],
          message: "I can help you book a flight! Tell me: Where are you flying from and to? What date? And your email for the quote."
        };
      } else {
        const customerEmail = actionData?.email || actionData?.contact_email;
        
        let query = supabase
          .from("ticket_requests")
          .select("id, origin, destination, departure_date, return_date, passengers, cabin_class, status, quoted_price, payment_status")
          .order("created_at", { ascending: false })
          .limit(5);
        
        if (customerEmail) {
          query = query.eq("contact_email", customerEmail);
        }

        const { data: requests, error } = await query;

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
        available_actions: ["create_ticket_request", "reserve_voucher", "cancel_request"],
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
