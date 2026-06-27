import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");
const DUFFEL_VERSION = "v2";

// Markup: 10% with $25 minimum
function applyMarkup(amount: number): number {
  const pct = amount * 0.10;
  const markup = Math.max(pct, 25);
  return Math.round((amount + markup) * 100) / 100;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");

    const body = await req.json();
    const {
      origin,
      destination,
      departure_date,
      return_date,
      adults = 1,
      cabin_class = "economy",
    } = body;

    if (!origin || !destination || !departure_date) {
      return new Response(
        JSON.stringify({ error: "origin, destination, departure_date required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const slices: any[] = [
      { origin: origin.toUpperCase(), destination: destination.toUpperCase(), departure_date },
    ];
    if (return_date) {
      slices.push({
        origin: destination.toUpperCase(),
        destination: origin.toUpperCase(),
        departure_date: return_date,
      });
    }

    const passengers = Array.from({ length: Number(adults) }, () => ({ type: "adult" }));

    const orReqRes = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": DUFFEL_VERSION,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        data: { slices, passengers, cabin_class },
      }),
    });

    if (!orReqRes.ok) {
      const errText = await orReqRes.text();
      console.error("[duffel-search] offer_request failed", orReqRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Duffel search failed", status: orReqRes.status, detail: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orData = await orReqRes.json();
    const offers = orData?.data?.offers || [];

    // Sort cheapest first, take top 25
    offers.sort((a: any, b: any) => parseFloat(a.total_amount) - parseFloat(b.total_amount));
    const top = offers.slice(0, 25).map((o: any) => {
      const rawAmount = parseFloat(o.total_amount);
      const customerAmount = applyMarkup(rawAmount);
      return {
        id: o.id,
        owner: o.owner,
        total_amount: o.total_amount,
        total_currency: o.total_currency,
        customer_amount: customerAmount,
        customer_currency: o.total_currency,
        expires_at: o.expires_at,
        passenger_count: o.passengers?.length || 1,
        slices: (o.slices || []).map((s: any) => ({
          origin: s.origin?.iata_code,
          destination: s.destination?.iata_code,
          duration: s.duration,
          segments: (s.segments || []).map((seg: any) => ({
            origin: seg.origin?.iata_code,
            destination: seg.destination?.iata_code,
            departing_at: seg.departing_at,
            arriving_at: seg.arriving_at,
            marketing_carrier: seg.marketing_carrier?.name,
            marketing_carrier_iata: seg.marketing_carrier?.iata_code,
            flight_number: seg.marketing_carrier_flight_number,
            duration: seg.duration,
            cabin_class: seg.passengers?.[0]?.cabin_class,
          })),
        })),
      };
    });

    return new Response(
      JSON.stringify({ offer_request_id: orData?.data?.id, offers: top }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[duffel-search] error", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
