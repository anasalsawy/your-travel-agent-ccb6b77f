import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Called by stripe-webhook after a duffel_flight checkout completes.
// Body: { booking_id, mode?: "test"|"live", duffel_card_id? }
// Pays Duffel with the default (or specified) admin-stored card via 3DS session
// using the secure_corporate_payment exception — no balance, no customer tap.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { booking_id, mode } = body;
    const useTest = (mode || "live") === "test";
    const token = useTest
      ? Deno.env.get("DUFFEL_TEST_API_TOKEN") || Deno.env.get("DUFFEL_API_TOKEN")
      : Deno.env.get("DUFFEL_API_TOKEN");
    if (!token) throw new Error("DUFFEL_API_TOKEN not set");
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
      .from("duffel_bookings").select("*").eq("id", booking_id).single();
    if (bErr || !booking) throw new Error("Booking not found: " + (bErr?.message || ""));

    if (booking.status === "confirmed") {
      return new Response(JSON.stringify({ ok: true, already: true, order: booking.duffel_order }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick the card to charge
    let cardId = body.duffel_card_id as string | undefined;
    if (!cardId) {
      const { data: card } = await supabase
        .from("admin_duffel_cards")
        .select("duffel_card_id, is_default, is_test")
        .eq("is_test", useTest)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (!card) throw new Error("No admin_duffel_cards configured for " + (useTest ? "test" : "live") + " mode");
      cardId = card.duffel_card_id;
    }

    // Re-fetch offer
    const offerRes = await fetch("https://api.duffel.com/air/offers/" + booking.offer_id, {
      headers: { "Authorization": "Bearer " + token, "Duffel-Version": "v2", "Accept": "application/json" },
    });
    if (!offerRes.ok) {
      const t = await offerRes.text();
      await supabase.from("duffel_bookings").update({ status: "failed", error: "Offer expired/invalid: " + t }).eq("id", booking_id);
      throw new Error("Offer fetch failed: " + t);
    }
    const offer = (await offerRes.json()).data;

    if (!offer.passengers || offer.passengers.length !== (booking.passengers as any[]).length) {
      throw new Error("Passenger count mismatch. offer.passengers=" + JSON.stringify(offer.passengers) + " booking has " + (booking.passengers as any[]).length);
    }
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

    // Create 3DS session with secure_corporate_payment exception
    const tdsRes = await fetch("https://api.duffel.com/payments/three_d_secure_sessions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        data: {
          card_id: cardId,
          resource_id: offer.id,
          currency: offer.total_currency,
          amount: String(offer.total_amount),
          services: [],
          exception: "secure_corporate_payment",
        },
      }),
    });
    const tdsJson = await tdsRes.json();
    if (!tdsRes.ok) {
      console.error("[duffel-book] 3DS failed", tdsRes.status, tdsJson);
      await supabase.from("duffel_bookings").update({
        status: "failed", error: "3DS failed: " + JSON.stringify(tdsJson),
      }).eq("id", booking_id);
      return new Response(JSON.stringify({ error: "3ds_failed", detail: tdsJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const tdsSessionId = tdsJson.data.id;

    const orderBody = {
      data: {
        type: "instant",
        selected_offers: [offer.id],
        passengers,
        payments: [{
          type: "card",
          currency: offer.total_currency,
          amount: offer.total_amount,
          three_d_secure_session_id: tdsSessionId,
        }],
        metadata: { booking_id, customer_email: booking.contact_email },
      },
    };

    const orderRes = await fetch("https://api.duffel.com/air/orders", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
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
        status: "failed", error: JSON.stringify(orderJson),
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
