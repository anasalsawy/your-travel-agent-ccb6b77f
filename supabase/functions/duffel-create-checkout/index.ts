import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");

function applyMarkup(amount: number): number {
  const pct = amount * 0.10;
  return Math.round((amount + Math.max(pct, 25)) * 100) / 100;
}

// Creates a pending duffel_bookings row + Stripe checkout session for a Duffel offer.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const { offer_id, passengers, contact_email, contact_phone } = await req.json();
    if (!offer_id || !passengers?.length || !contact_email) {
      return new Response(JSON.stringify({ error: "offer_id, passengers, contact_email required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate offer is still live
    const offerRes = await fetch("https://api.duffel.com/air/offers/" + offer_id, {
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Accept": "application/json",
      },
    });
    if (!offerRes.ok) {
      const t = await offerRes.text();
      return new Response(JSON.stringify({ error: "Offer no longer available", detail: t }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const offer = (await offerRes.json()).data;
    const customerAmount = applyMarkup(parseFloat(offer.total_amount));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Optional: identify the user
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data } = await supabase.auth.getUser(token);
        userId = data.user?.id ?? null;
      } catch (_) { /* guest */ }
    }

    const { data: booking, error: bErr } = await supabase
      .from("duffel_bookings")
      .insert({
        user_id: userId,
        offer_id,
        passengers,
        contact_email,
        contact_phone,
        wholesale_amount: parseFloat(offer.total_amount),
        wholesale_currency: offer.total_currency,
        customer_amount: customerAmount,
        customer_currency: offer.total_currency,
        status: "pending_payment",
      })
      .select()
      .single();
    if (bErr) throw bErr;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || "https://your-travel-agent.net";

    const firstSlice = offer.slices?.[0];
    const lastSlice = offer.slices?.[offer.slices.length - 1];
    const routeDesc = firstSlice
      ? firstSlice.origin?.iata_code + " → " + firstSlice.destination?.iata_code +
        (offer.slices.length > 1 ? " (round-trip)" : "")
      : "Flight booking";

    const session = await stripe.checkout.sessions.create({
      customer_email: contact_email,
      line_items: [{
        price_data: {
          currency: (offer.total_currency || "USD").toLowerCase(),
          product_data: {
            name: "Flight: " + routeDesc,
            description: "Departing " + (firstSlice?.segments?.[0]?.departing_at || ""),
          },
          unit_amount: Math.round(customerAmount * 100),
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: origin + "/dashboard?duffel_success=true&booking=" + booking.id,
      cancel_url: origin + "/flights?duffel_canceled=true",
      metadata: {
        type: "duffel_flight",
        booking_id: booking.id,
        offer_id,
        user_email: contact_email,
      },
      payment_intent_data: {
        metadata: {
          type: "duffel_flight",
          booking_id: booking.id,
          offer_id,
        },
      },
    });

    await supabase.from("duffel_bookings").update({
      stripe_session_id: session.id,
    }).eq("id", booking.id);

    return new Response(JSON.stringify({ url: session.url, booking_id: booking.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[duffel-create-checkout] error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
