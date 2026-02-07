import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-STRIPE-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Parse request body first
    const body = await req.json();
    const { type, voucherId, ticketRequestId, amount, description, customerEmail } = body;
    logStep("Request body", { type, voucherId, ticketRequestId, amount });

    // Authenticate: support both user JWT and service-role key (for Maya/internal calls)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    let userEmail: string | undefined;
    let userId: string | undefined;

    // Try user JWT auth first
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (!userError && userData?.user?.email) {
      // Authenticated user flow
      userEmail = userData.user.email;
      userId = userData.user.id;
      logStep("User authenticated", { userId, email: userEmail });
    } else {
      // Service-role / internal call flow (e.g., Maya creating a link for a customer)
      // The customerEmail must be provided in the body
      if (customerEmail) {
        userEmail = customerEmail;
        userId = undefined; // No user ID for service-role calls
        logStep("Service-role call with customer email", { email: userEmail });
      } else {
        throw new Error("Authentication failed and no customerEmail provided");
      }
    }

    if (!type || !amount) {
      throw new Error("Missing required fields: type and amount");
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists in Stripe
    const customers = await stripe.customers.list({ email: userEmail!, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing Stripe customer", { customerId });
    }

    // Build line item with price_data (for dynamic pricing)
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        currency: "usd",
        product_data: {
          name: description || (type === "voucher" ? "Airline Voucher" : type === "custom" ? "Your Travel Agent Payment" : "Flight Ticket Deposit"),
        },
        unit_amount: Math.round(amount * 100), // Convert to cents
      },
      quantity: 1,
    };

    // Build metadata for tracking
    const metadata: Record<string, string> = {
      type,
      user_email: userEmail!,
    };

    if (userId) metadata.user_id = userId;
    if (voucherId) metadata.voucher_id = voucherId;
    if (ticketRequestId) metadata.ticket_request_id = ticketRequestId;

    const origin = req.headers.get("origin") || "https://your-travel-agent.lovable.app";

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userEmail,
      line_items: [lineItem],
      mode: "payment",
      success_url: `${origin}/dashboard?stripe_success=true&type=${type}`,
      cancel_url: `${origin}/dashboard?stripe_canceled=true`,
      metadata,
      payment_intent_data: {
        metadata,
      },
    });

    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    return new Response(JSON.stringify({ url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
