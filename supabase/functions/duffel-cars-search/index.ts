import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");
const CARS_BASE = "https://api.duffel.com/cars";

/**
 * Body (preferred — matches Duffel Cars API):
 * {
 *   pickup_date: "YYYY-MM-DD", pickup_time: "HH:MM",
 *   dropoff_date: "YYYY-MM-DD", dropoff_time: "HH:MM",
 *   pickup_location:  { radius?: number, geographic_coordinates: { latitude, longitude } } | { latitude, longitude, radius? },
 *   dropoff_location: same (optional, defaults to pickup),
 *   driver: { age: number, residence_country_code: string } | driver_age + residence_country_code at top level,
 *   currency?: "USD",
 *   prepaid_only?: boolean
 * }
 *
 * Back-compat: also accepts pickup_datetime / dropoff_datetime (ISO) and driver_age at top level.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const b = await req.json();

    // ---- Normalize date/time (accept ISO datetime or split date+time) ----
    const splitDT = (iso: string) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return { date: "", time: "" };
      const pad = (n: number) => String(n).padStart(2, "0");
      return {
        date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
        time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
      };
    };
    let pickup_date = b.pickup_date, pickup_time = b.pickup_time;
    let dropoff_date = b.dropoff_date, dropoff_time = b.dropoff_time;
    if ((!pickup_date || !pickup_time) && b.pickup_datetime) {
      const s = splitDT(b.pickup_datetime); pickup_date ||= s.date; pickup_time ||= s.time;
    }
    if ((!dropoff_date || !dropoff_time) && b.dropoff_datetime) {
      const s = splitDT(b.dropoff_datetime); dropoff_date ||= s.date; dropoff_time ||= s.time;
    }

    // ---- Normalize locations ----
    const normLoc = (loc: any) => {
      if (!loc) return null;
      if (typeof loc === "string") {
        // bare IATA / city code — Duffel Cars requires coordinates, so reject
        return { _err: `pickup/dropoff_location must be coordinates ({latitude, longitude}); got string "${loc}"` };
      }
      const coords = loc.geographic_coordinates || (loc.latitude !== undefined ? { latitude: loc.latitude, longitude: loc.longitude } : null);
      if (!coords) return { _err: "pickup/dropoff_location must include geographic_coordinates {latitude, longitude}" };
      return { radius: loc.radius ?? 5, geographic_coordinates: { latitude: Number(coords.latitude), longitude: Number(coords.longitude) } };
    };
    const pickup_location = normLoc(b.pickup_location);
    const dropoff_location = normLoc(b.dropoff_location) || pickup_location;

    if (!pickup_date || !pickup_time || !dropoff_date || !dropoff_time) {
      return new Response(JSON.stringify({ error: "pickup_date, pickup_time, dropoff_date, dropoff_time required (or pickup_datetime/dropoff_datetime ISO)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!pickup_location || (pickup_location as any)._err) {
      return new Response(JSON.stringify({ error: (pickup_location as any)?._err || "pickup_location required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const driver = b.driver || { age: b.driver_age ?? 30, residence_country_code: b.residence_country_code ?? "US" };
    const currency = b.currency || "USD";
    const prepaid_only = b.prepaid_only ?? true;

    const payload = {
      data: {
        pickup_date, pickup_time, dropoff_date, dropoff_time,
        pickup_location, dropoff_location,
        driver,
        currency,
      },
    };

    const r = await fetch(CARS_BASE + "/search", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let j: any; try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel cars search failed", status: r.status, detail: j, sent: payload.data }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawResults = j?.data?.results || j?.data?.offers || j?.data || [];
    const results = (Array.isArray(rawResults) ? rawResults : []).map((o: any) => ({
      id: o.id,
      supplier: o.supplier?.name || o.vendor?.name,
      car_type: o.vehicle?.category || o.vehicle?.type,
      model: o.vehicle?.model,
      seats: o.vehicle?.seats,
      transmission: o.vehicle?.transmission,
      total_amount: o.total_amount,
      total_currency: o.total_currency || currency,
      payment_type: o.payment_type || o.payment?.type,
      cancellation: o.cancellation_policy || o.cancellation,
      pickup_location: o.pickup_location,
      dropoff_location: o.dropoff_location,
    }));

    const filtered = prepaid_only
      ? results.filter((x: any) => {
          const p = (x.payment_type || "").toString().toLowerCase();
          return !p || p.includes("prepaid") || p.includes("online");
        })
      : results;

    return new Response(JSON.stringify({ search_id: j?.data?.id, count: filtered.length, results: filtered }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
