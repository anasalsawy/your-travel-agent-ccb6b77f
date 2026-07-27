// Books a Duffel order paying with a CUSTOMER-provided card via a 3DS session
// created by the DuffelPayments component in the browser. Public endpoint —
// no admin gate. This is the first-line payment path for the public flight
// search. Falls back to Stripe-hosted checkout (`duffel-create-checkout`) if
// customer-card entitlement is off for the account.
//
// Body: {
//   offer_id, passengers, contact_email, contact_phone,
//   duffel_card_id, three_d_secure_session_id, mode?: "test"|"live"
// }
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-duffel-mode",
};

function applyMarkup(amount: number): number {
  const pct = amount * 0.10;
  return Math.round((amount + Math.max(pct, 25)) * 100) / 100;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const {
      offer_id, passengers, contact_email, contact_phone,
      three_d_secure_session_id, mode,
    } = await req.json();

    const useTest = (mode || req.headers.get("x-duffel-mode") || "test") === "test";
    const token = useTest
      ? Deno.env.get("DUFFEL_TEST_API_TOKEN") || Deno.env.get("DUFFEL_API_TOKEN")
      : Deno.env.get("DUFFEL_API_TOKEN");
    if (!token) throw new Error("Duffel token missing");
    if (!offer_id || !passengers?.length || !three_d_secure_session_id || !contact_email) {
      return new Response(JSON.stringify({ error: "offer_id, passengers, contact_email, three_d_secure_session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional user linkage
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        userId = data.user?.id ?? null;
      } catch (_) { /* guest */ }
    }

    // Re-price the offer just before booking (Duffel best practice)
    const offerRes = await fetch("https://api.duffel.com/air/offers/" + offer_id, {
      headers: { "Authorization": "Bearer " + token, "Duffel-Version": "v2", "Accept": "application/json" },
    });
    if (!offerRes.ok) {
      const t = await offerRes.text();
      return new Response(JSON.stringify({ error: "offer_expired", detail: t }), {
        status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const offer = (await offerRes.json()).data;
    if (!offer.passengers || offer.passengers.length !== passengers.length) {
      return new Response(JSON.stringify({ error: "passenger_count_mismatch" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerAmount = applyMarkup(parseFloat(offer.total_amount));

    // Pre-insert pending booking so we always have a record even on failure
    const { data: booking, error: bErr } = await supabase.from("duffel_bookings").insert({
      user_id: userId,
      offer_id,
      passengers,
      contact_email,
      contact_phone,
      wholesale_amount: parseFloat(offer.total_amount),
      wholesale_currency: offer.total_currency,
      customer_amount: customerAmount,
      customer_currency: offer.total_currency,
      status: "processing",
    }).select().single();
    if (bErr) throw bErr;

    const mappedPax = passengers.map((p: any, i: number) => ({
      id: offer.passengers[i].id,
      type: offer.passengers[i].type,
      title: p.title || "mr",
      gender: p.gender || "m",
      given_name: p.given_name,
      family_name: p.family_name,
      born_on: p.born_on,
      email: p.email || contact_email,
      phone_number: p.phone_number || contact_phone,
    }));

    const orderBody = {
      data: {
        type: "instant",
        selected_offers: [offer.id],
        passengers: mappedPax,
        payments: [{
          type: "card",
          currency: offer.total_currency,
          amount: offer.total_amount,
          three_d_secure_session_id,
        }],
        metadata: {
          booked_by: userId || "guest",
          channel: "public_customer_card",
          booking_id: booking.id,
        },
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
      console.error("[duffel-book-customer-card] failed", orderRes.status, orderJson);
      await supabase.from("duffel_bookings").update({
        status: "failed",
        error: JSON.stringify(orderJson).slice(0, 2000),
      }).eq("id", booking.id);
      return new Response(JSON.stringify({ error: "duffel_order_failed", detail: orderJson, booking_id: booking.id }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("duffel_bookings").update({
      status: "confirmed",
      duffel_order_id: orderJson.data.id,
      booking_reference: orderJson.data.booking_reference,
      duffel_order: orderJson.data,
    }).eq("id", booking.id);

    return new Response(JSON.stringify({
      ok: true,
      booking_id: booking.id,
      order_id: orderJson.data.id,
      booking_reference: orderJson.data.booking_reference,
      order: orderJson.data,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
