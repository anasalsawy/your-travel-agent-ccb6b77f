import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");

// GET-style via POST: { booking_id }, also supports ?id=... cancellation if user_approved
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const url = new URL(req.url);
    let booking_id = url.searchParams.get("id") || "";
    let cancel = false, user_approved = false;
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      booking_id = b.booking_id || booking_id;
      cancel = !!b.cancel;
      user_approved = !!b.user_approved;
    }
    if (!booking_id) {
      return new Response(JSON.stringify({ error: "booking_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (cancel) {
      if (!user_approved) {
        return new Response(JSON.stringify({ error: "user_approved must be true to cancel" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const cr = await fetch(
        "https://api.duffel.com/stays/bookings/" + booking_id + "/actions/cancel",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + DUFFEL_TOKEN,
            "Duffel-Version": "v2",
            "Accept": "application/json",
          },
        },
      );
      const cj = await cr.json();
      return new Response(JSON.stringify({ ok: cr.ok, cancellation: cj?.data, error: cr.ok ? undefined : cj }),
        { status: cr.ok ? 200 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const r = await fetch("https://api.duffel.com/stays/bookings/" + booking_id, {
      headers: {
        "Authorization": "Bearer " + DUFFEL_TOKEN,
        "Duffel-Version": "v2",
        "Accept": "application/json",
      },
    });
    const j = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Duffel booking fetch failed", detail: j }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ booking: j?.data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
