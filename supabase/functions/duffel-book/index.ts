import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");

// Called by stripe-webhook after a duffel_flight checkout completes.
// Body: { booking_id }  — looks up stored offer + passengers and issues order.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const { booking_id } = await req.json();
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: booking, error: bErr } = await supabase
      .from("duffel_bookings")
      .select("*")
      .eq("id", booking_id)
      .single();
    if (bErr || !booking) throw new Error("Booking not found: " + (bErr?.message || ""));

    if (booking.status === "confirmed") {
      return new Response(JSON.stringify({ ok: true, already: true, order: booking.duffel_order }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Re-fetch the offer to confirm it's still valid and get total
    const offerRes = await fetch("https://api.duffel.com/air/offers/" + booking.offer_id, {
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Accept": "application/json",
      },
    });
    if (!offerRes.ok) {
      const t = await offerRes.text();
      await supabase.from("duffel_bookings").update({
        status: "failed", error: "Offer expired/invalid: " + t,
      }).eq("id", booking_id);
      throw new Error("Offer fetch failed: " + t);
    }
    const offerJson = await offerRes.json();
    const offer = offerJson.data;

    // Map stored passengers to offer.passengers (by index)
    const passengers = (booking.passengers as any[]).map((p, i) => ({
      id: offer.passengers[i].id,
      type: offer.passengers[i].type,
      title: p.title || "mr",
      gender: p.gender || "m",
      given_name: p.given_name,
      family_name: p.family_name,
      born_on: p.born_on,
      email: p.email || booking.contact_email,
      phone_number: p.phone_number || booking.contact_phone,
    }));

    const orderBody = {
      data: {
        type: "instant",
        selected_offers: [offer.id],
        passengers,
        payments: [{
          type: "balance",
          currency: offer.total_currency,
          amount: offer.total_amount,
        }],
        metadata: { booking_id: booking_id, customer_email: booking.contact_email },
      },
    };

    const orderRes = await fetch("https://api.duffel.com/air/orders", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(orderBody),
    });

    const orderJson = await orderRes.json();

    if (!orderRes.ok) {
      console.error("[duffel-book] order failed", orderRes.status, orderJson);
      await supabase.from("duffel_bookings").update({
        status: "failed",
        error: JSON.stringify(orderJson),
      }).eq("id", booking_id);
      return new Response(JSON.stringify({ error: "Duffel order failed", detail: orderJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("duffel_bookings").update({
      status: "confirmed",
      duffel_order_id: orderJson.data.id,
      booking_reference: orderJson.data.booking_reference,
      duffel_order: orderJson.data,
    }).eq("id", booking_id);

    return new Response(JSON.stringify({ ok: true, order: orderJson.data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[duffel-book] error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
