import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    
    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        logStep("Webhook signature verified");
      } catch (err) {
        logStep("Webhook signature verification failed", { error: err });
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Parse without verification (for testing)
      event = JSON.parse(body);
      logStep("Webhook parsed without signature verification");
    }

    logStep("Event type", { type: event.type });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      logStep("Checkout session completed", { 
        sessionId: session.id,
        metadata: session.metadata 
      });

      const metadata = session.metadata || {};
      const type = metadata.type;
      const userId = metadata.user_id;
      const voucherId = metadata.voucher_id;
      const ticketRequestId = metadata.ticket_request_id;
      const userEmail = metadata.user_email;

      if (type === "voucher" && voucherId) {
        // Create order for voucher purchase
        const { data: order, error: orderError } = await supabase
          .from("orders")
          .insert({
            user_id: userId,
            voucher_id: voucherId,
            amount_paid: (session.amount_total || 0) / 100,
            payment_method: "stripe",
            payment_status: "completed",
            order_status: "pending",
            stripe_session_id: session.id,
            customer_email: userEmail,
          })
          .select()
          .single();

        if (orderError) {
          logStep("Error creating order", { error: orderError });
          throw orderError;
        }

        logStep("Order created", { orderId: order.id });

        // Update voucher status
        await supabase
          .from("vouchers")
          .update({ status: "sold" })
          .eq("id", voucherId);

        logStep("Voucher marked as sold");

      } else if (type === "ticket_deposit" && ticketRequestId) {
        // Update ticket request with payment info
        const amountPaid = (session.amount_total || 0) / 100;
        
        const { error: updateError } = await supabase
          .from("ticket_requests")
          .update({
            payment_status: "completed",
            payment_method: "stripe",
            stripe_session_id: session.id,
            deposit_status: "paid",
            deposit_amount: amountPaid,
          })
          .eq("id", ticketRequestId);

        if (updateError) {
          logStep("Error updating ticket request", { error: updateError });
          throw updateError;
        }

        logStep("Ticket request updated", { ticketRequestId });
      }
    }

    return new Response(JSON.stringify({ received: true }), {
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
