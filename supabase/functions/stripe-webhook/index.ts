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

        await supabase
          .from("vouchers")
          .update({ status: "sold" })
          .eq("id", voucherId);

        logStep("Voucher marked as sold");

      } else if (type === "ticket_deposit" && ticketRequestId) {
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

    } else if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = charge.payment_intent as string;
      logStep("Charge refunded", { chargeId: charge.id, paymentIntentId });

      // Find order by stripe_session_id via the payment intent's session
      // Or find by matching amount and recent orders
      const { data: orders } = await supabase
        .from("orders")
        .select("id, stripe_session_id")
        .eq("payment_method", "stripe")
        .eq("payment_status", "completed")
        .order("created_at", { ascending: false })
        .limit(20);

      if (orders) {
        for (const order of orders) {
          if (order.stripe_session_id) {
            // Check if this session's payment intent matches
            try {
              const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
              if (session.payment_intent === paymentIntentId) {
                await supabase
                  .from("orders")
                  .update({
                    payment_status: "failed",
                    order_status: "cancelled",
                    admin_notes: `Refunded via Stripe on ${new Date().toISOString()}. Amount: $${(charge.amount_refunded / 100).toFixed(2)}`,
                  })
                  .eq("id", order.id);
                logStep("Order marked as refunded", { orderId: order.id });
                break;
              }
            } catch (e) {
              logStep("Error checking session", { error: e });
            }
          }
        }
      }

    } else if (event.type === "charge.dispute.created") {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = dispute.charge as string;
      logStep("Dispute created", { disputeId: dispute.id, chargeId });

      // Find the charge to get the payment intent
      const charge = await stripe.charges.retrieve(chargeId);
      const paymentIntentId = charge.payment_intent as string;

      const { data: orders } = await supabase
        .from("orders")
        .select("id, stripe_session_id")
        .eq("payment_method", "stripe")
        .order("created_at", { ascending: false })
        .limit(20);

      if (orders) {
        for (const order of orders) {
          if (order.stripe_session_id) {
            try {
              const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
              if (session.payment_intent === paymentIntentId) {
                await supabase
                  .from("orders")
                  .update({
                    admin_notes: `⚠️ DISPUTE opened on ${new Date().toISOString()}. Reason: ${dispute.reason}. Amount: $${(dispute.amount / 100).toFixed(2)}. Respond in Stripe Dashboard.`,
                  })
                  .eq("id", order.id);
                logStep("Order flagged with dispute", { orderId: order.id });
                break;
              }
            } catch (e) {
              logStep("Error checking session", { error: e });
            }
          }
        }
      }

    } else if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      logStep("Payment failed", { 
        paymentIntentId: paymentIntent.id, 
        error: paymentIntent.last_payment_error?.message 
      });

      // Update any matching ticket request
      const ticketRequestId = paymentIntent.metadata?.ticket_request_id;
      if (ticketRequestId) {
        await supabase
          .from("ticket_requests")
          .update({
            payment_status: "failed",
            admin_notes: `Stripe payment failed: ${paymentIntent.last_payment_error?.message || "Unknown error"}`,
          })
          .eq("id", ticketRequestId);
        logStep("Ticket request marked as failed", { ticketRequestId });
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
