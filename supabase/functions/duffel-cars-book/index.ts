import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");
const CARS_BASE = "https://api.duffel.com/cars";

// Body: { quote_id, driver: { given_name, family_name, date_of_birth, email, phone_number }, user_approved: true }
// Back-compat: offer_id -> quote_id, born_on -> date_of_birth
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const b = await req.json();
    const { user_approved } = b;
    const quote_id = b.quote_id || b.offer_id;
    const d = b.driver || {};
    const driver = {
      given_name: d.given_name,
      family_name: d.family_name,
      date_of_birth: d.date_of_birth || d.born_on,
      email: d.email,
      phone_number: d.phone_number,
    };
    if (!user_approved) {
      return new Response(JSON.stringify({ error: "user_approved=true required for booking" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!quote_id || !driver.given_name || !driver.family_name || !driver.email) {
      return new Response(JSON.stringify({ error: "quote_id and driver (given_name, family_name, email) required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const r = await fetch(CARS_BASE + "/bookings", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ data: { quote_id, driver: [driver] } }),
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel cars booking failed", status: r.status, detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const x = j.data || j;
    return new Response(JSON.stringify({
      booking_id: x.id,
      reference: x.reference,
      confirmed_at: x.confirmed_at,
      driver: x.driver,
      car: x.car,
      total_amount: x.total_amount,
      total_currency: x.total_currency,
      pickup_location: x.pickup_location,
      dropoff_location: x.dropoff_location,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
