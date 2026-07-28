// Creates a Name-Your-Own-Price bid. Public endpoint.
// Body: { origin, destination, departure_date, return_date?, trip_type,
//         passengers, cabin_class, bid_amount, currency?,
//         flex_dates_days?, flex_airline?, flex_stops?,
//         wait_window_hours?, contact_email, contact_phone?, special_notes? }
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const required = ["origin", "destination", "departure_date", "bid_amount", "contact_email"];
    for (const k of required) {
      if (!body[k]) {
        return new Response(JSON.stringify({ error: k + " required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
    if (parseFloat(body.bid_amount) < 50) {
      return new Response(JSON.stringify({ error: "Bid must be at least $50" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let userId: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth) {
      try {
        const { data } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
        userId = data.user?.id ?? null;
      } catch (_) { /* guest */ }
    }

    const waitHours = Math.min(Math.max(parseInt(body.wait_window_hours || "24"), 1), 168);
    const expiresAt = new Date(Date.now() + waitHours * 3600 * 1000).toISOString();

    const { data: bid, error } = await supabase.from("nyop_bids").insert({
      user_id: userId,
      contact_email: body.contact_email,
      contact_phone: body.contact_phone || null,
      origin: body.origin.toUpperCase(),
      destination: body.destination.toUpperCase(),
      departure_date: body.departure_date,
      return_date: body.return_date || null,
      trip_type: body.trip_type || (body.return_date ? "round-trip" : "one-way"),
      passengers: parseInt(body.passengers || "1"),
      cabin_class: body.cabin_class || "economy",
      bid_amount: parseFloat(body.bid_amount),
      currency: body.currency || "USD",
      flex_dates_days: parseInt(body.flex_dates_days || "0"),
      flex_airline: body.flex_airline !== false,
      flex_stops: body.flex_stops !== false,
      wait_window_hours: waitHours,
      expires_at: expiresAt,
      special_notes: body.special_notes || null,
      status: "hunting",
    }).select().single();

    if (error) throw error;

    // Fire and forget: kick off the first hunt right away
    supabase.functions.invoke("nyop-hunt-tick", { body: { bid_id: bid.id } }).catch(() => {});

    return new Response(JSON.stringify({ bid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
