// Hunts Duffel for matching offers on active NYOP bids.
// If called with { bid_id }, hunts one bid. Otherwise hunts every active bid
// due for another attempt (called by pg_cron every ~5 min).
//
// A "match" = cheapest offer <= bid_amount AND margin (bid - wholesale) >= $25.
// On match: status -> matched, an email link is sent to the customer to accept
// & pay at their bid price via the existing Duffel/Stripe checkout.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_MARGIN = 25;

async function huntOne(bid: any, supabase: any, token: string) {
  // Build offer request for the exact bid parameters
  const slices: any[] = [{
    origin: bid.origin,
    destination: bid.destination,
    departure_date: bid.departure_date,
  }];
  if (bid.return_date) {
    slices.push({
      origin: bid.destination,
      destination: bid.origin,
      departure_date: bid.return_date,
    });
  }
  const passengers = Array.from({ length: bid.passengers }, () => ({ type: "adult" }));

  const orRes = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + token,
      "Duffel-Version": "v2",
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: {
        slices,
        passengers,
        cabin_class: bid.cabin_class || "economy",
      },
    }),
  });

  if (!orRes.ok) {
    const t = await orRes.text();
    await supabase.from("nyop_bids").update({
      last_hunt_at: new Date().toISOString(),
      attempts_count: (bid.attempts_count || 0) + 1,
    }).eq("id", bid.id);
    return { bid_id: bid.id, error: "duffel_search_failed", detail: t.slice(0, 200) };
  }

  const or = (await orRes.json()).data;
  const offers = or.offers || [];
  if (!offers.length) {
    await supabase.from("nyop_bids").update({
      last_hunt_at: new Date().toISOString(),
      attempts_count: (bid.attempts_count || 0) + 1,
    }).eq("id", bid.id);
    return { bid_id: bid.id, matched: false, reason: "no_offers" };
  }

  // Cheapest offer, optionally filter by airline flexibility
  offers.sort((a: any, b: any) => parseFloat(a.total_amount) - parseFloat(b.total_amount));
  const cheapest = offers[0];
  const wholesale = parseFloat(cheapest.total_amount);
  const margin = parseFloat(bid.bid_amount) - wholesale;

  const patch: any = {
    last_hunt_at: new Date().toISOString(),
    attempts_count: (bid.attempts_count || 0) + 1,
  };
  if (bid.best_offer_seen_amount == null || wholesale < parseFloat(bid.best_offer_seen_amount)) {
    patch.best_offer_seen_amount = wholesale;
    patch.best_offer_seen_id = cheapest.id;
  }

  if (wholesale <= parseFloat(bid.bid_amount) && margin >= MIN_MARGIN) {
    patch.status = "matched";
    patch.matched_offer_id = cheapest.id;
    patch.matched_offer_amount = wholesale;
    patch.matched_at = new Date().toISOString();
  }

  await supabase.from("nyop_bids").update(patch).eq("id", bid.id);

  // If matched, notify customer
  if (patch.status === "matched") {
    try {
      await supabase.functions.invoke("send-notification", {
        body: {
          event_type: "nyop_bid_matched",
          record: { ...bid, ...patch },
          recipient: bid.contact_email,
        },
      });
    } catch (_) { /* best effort */ }
  }

  return {
    bid_id: bid.id,
    matched: patch.status === "matched",
    wholesale,
    bid: parseFloat(bid.bid_amount),
    margin,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const token = Deno.env.get("DUFFEL_TEST_API_TOKEN") || Deno.env.get("DUFFEL_API_TOKEN");
    if (!token) throw new Error("DUFFEL_API_TOKEN not set");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const nowIso = new Date().toISOString();

    // Expire stale bids first
    await supabase.from("nyop_bids").update({
      status: "expired",
      resolved_at: nowIso,
    }).eq("status", "hunting").lt("expires_at", nowIso);

    let bids: any[] = [];
    if (body.bid_id) {
      const { data } = await supabase.from("nyop_bids").select("*").eq("id", body.bid_id).limit(1);
      bids = data || [];
    } else {
      const { data } = await supabase.from("nyop_bids")
        .select("*")
        .eq("status", "hunting")
        .order("last_hunt_at", { ascending: true, nullsFirst: true })
        .limit(10);
      bids = data || [];
    }

    const results = [];
    for (const bid of bids) {
      try {
        results.push(await huntOne(bid, supabase, token));
      } catch (e: any) {
        results.push({ bid_id: bid.id, error: e.message });
      }
    }

    return new Response(JSON.stringify({ hunted: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
