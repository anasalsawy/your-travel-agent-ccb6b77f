// Google Flights Deals (SerpApi) -> our quoted price = fetched price x 0.7
// Caches results in public.flight_deals and serves them to the public site.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const DISCOUNT_MULTIPLIER = 0.7;
const DEFAULT_HUBS = ["JFK", "LAX", "ORD"];
const CACHE_MINUTES = 180;

interface SerpDeal {
  name?: string;
  country?: string;
  price?: number;
  average_price?: number;
  outbound_date?: string;
  return_date?: string;
  departure_airport_code?: string;
  arrival_airport_code?: string;
  flight_duration?: number;
  stops?: number;
  airline?: string;
  airline_code?: string;
  flight_link?: string;
  thumbnail?: string;
  image?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SERPAPI_API_KEY = Deno.env.get("SERPAPI_API_KEY");
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const hubs: string[] = Array.isArray(body.departure_ids) && body.departure_ids.length
      ? (body.departure_ids as string[]).slice(0, 5)
      : DEFAULT_HUBS;
    const currency = typeof body.currency === "string" ? body.currency : "USD";
    const limit = typeof body.limit === "number" ? body.limit : 12;
    const force = body.force === true;

    // 1. Serve cache when fresh
    const cutoff = new Date(Date.now() - CACHE_MINUTES * 60_000).toISOString();
    if (!force) {
      const { data: cached } = await supabase
        .from("flight_deals")
        .select("*")
        .eq("is_active", true)
        .gte("fetched_at", cutoff)
        .order("our_price", { ascending: true })
        .limit(limit);

      if (cached && cached.length > 0) {
        return json({ source: "cache", count: cached.length, deals: cached });
      }
    }

    if (!SERPAPI_API_KEY) {
      const { data: stale } = await supabase
        .from("flight_deals")
        .select("*")
        .eq("is_active", true)
        .order("our_price", { ascending: true })
        .limit(limit);
      return json({ source: "stale", error: "SERPAPI_API_KEY not configured", deals: stale ?? [] });
    }

    // 2. Fetch fresh deals per hub
    const rows: Record<string, unknown>[] = [];
    const errors: string[] = [];

    for (const hub of hubs) {
      const url =
        "https://serpapi.com/search.json?engine=google_flights_deals" +
        "&departure_id=" + encodeURIComponent(hub) +
        "&currency=" + encodeURIComponent(currency) +
        "&hl=en&gl=us" +
        "&api_key=" + encodeURIComponent(SERPAPI_API_KEY);

      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
          errors.push(hub + ": " + data.error);
          continue;
        }
        const deals: SerpDeal[] = Array.isArray(data.deals) ? data.deals : [];
        for (const d of deals) {
          const price = Number(d.price);
          if (!price || !isFinite(price) || price <= 0) continue;
          const from = d.departure_airport_code || hub;
          const to = d.arrival_airport_code || d.name || "";
          if (!to) continue;

          rows.push({
            deal_key: [from, to, d.outbound_date ?? "", d.return_date ?? "", d.airline_code ?? ""].join("|"),
            departure_id: hub,
            destination_name: d.name ?? to,
            country: d.country ?? null,
            departure_airport_code: from,
            arrival_airport_code: d.arrival_airport_code ?? null,
            airline: d.airline ?? null,
            airline_code: d.airline_code ?? null,
            stops: typeof d.stops === "number" ? d.stops : null,
            flight_duration: typeof d.flight_duration === "number" ? d.flight_duration : null,
            outbound_date: d.outbound_date ?? null,
            return_date: d.return_date ?? null,
            trip_type: d.return_date ? "round_trip" : "one_way",
            currency,
            source_price: price,
            our_price: Math.round(price * DISCOUNT_MULTIPLIER),
            flight_link: d.flight_link ?? null,
            image_url: d.thumbnail ?? d.image ?? null,
            is_active: true,
            fetched_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        errors.push(hub + ": " + (e as Error).message);
      }
    }

    // 3. Persist
    if (rows.length) {
      // de-duplicate by deal_key within this batch
      const seen = new Set<string>();
      const unique = rows.filter((r) => {
        const k = r.deal_key as string;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      const { error: upsertError } = await supabase
        .from("flight_deals")
        .upsert(unique, { onConflict: "deal_key" });
      if (upsertError) errors.push("upsert: " + upsertError.message);

      // retire deals not refreshed in this run
      const keys = unique.map((r) => r.deal_key as string);
      await supabase
        .from("flight_deals")
        .update({ is_active: false })
        .in("departure_id", hubs)
        .not("deal_key", "in", "(" + keys.map((k) => '"' + k.replace(/"/g, "") + '"').join(",") + ")");
    }

    const { data: fresh } = await supabase
      .from("flight_deals")
      .select("*")
      .eq("is_active", true)
      .order("our_price", { ascending: true })
      .limit(limit);

    return json({
      source: "live",
      fetched: rows.length,
      errors: errors.length ? errors : undefined,
      deals: fresh ?? [],
    });
  } catch (e) {
    return json({ error: (e as Error).message, deals: [] }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
