import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DUFFEL_TOKEN = Deno.env.get("DUFFEL_API_TOKEN");

// Two-step Duffel cancel: create order_cancellation -> confirm.
// Body: { booking_id, action: "quote" | "confirm", cancellation_id? }
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!DUFFEL_TOKEN) throw new Error("DUFFEL_API_TOKEN not set");
    const { booking_id, action, cancellation_id } = await req.json();
    if (!booking_id || !action) {
      return new Response(JSON.stringify({ error: "booking_id and action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const { data: booking, error: bErr } = await supabase
      .from("duffel_bookings").select("*").eq("id", booking_id).single();
    if (bErr || !booking) throw new Error("Booking not found");
    if (!booking.duffel_order_id) throw new Error("Booking has no Duffel order");

    if (action === "quote") {
      const r = await fetch("https://api.duffel.com/air/order_cancellations", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + DUFFEL_TOKEN,
          "Duffel-Version": "v2",
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({ data: { order_id: booking.duffel_order_id } }),
      });
      const j = await r.json();
      if (!r.ok) {
        return new Response(JSON.stringify({ error: "Cancel quote failed", detail: j }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ cancellation: j.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "confirm") {
      if (!cancellation_id) throw new Error("cancellation_id required for confirm");
      const r = await fetch(
        "https://api.duffel.com/air/order_cancellations/" + cancellation_id + "/actions/confirm",
        {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + DUFFEL_TOKEN,
            "Duffel-Version": "v2",
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({ data: {} }),
        }
      );
      const j = await r.json();
      if (!r.ok) {
        return new Response(JSON.stringify({ error: "Cancel confirm failed", detail: j }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await supabase.from("duffel_bookings").update({
        status: "cancelled",
        cancellation: j.data,
      }).eq("id", booking_id);
      return new Response(JSON.stringify({ cancellation: j.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
