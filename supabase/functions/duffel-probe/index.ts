// Temporary probe: tests if Duffel live account has Cards + secure_corporate_payment approved.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const token = Deno.env.get("DUFFEL_API_TOKEN")!;
  const results: any = { token_prefix: token.slice(0, 12) };

  // Probe 1: list cards (proves Cards entitlement)
  const r1 = await fetch("https://api.duffel.com/payments/cards", {
    headers: { "Authorization": "Bearer " + token, "Duffel-Version": "v2", "Accept": "application/json" },
  });
  results.list_cards = { status: r1.status, body: await r1.json() };

  // Probe 2: try creating a 3DS session with bogus card_id — error type tells us approval state
  const r2 = await fetch("https://api.duffel.com/payments/three_d_secure_sessions", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Duffel-Version": "v2", "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ data: { card_id: "tcd_does_not_exist", resource_id: "off_does_not_exist", currency: "USD", amount: "100.00", services: [], exception: "secure_corporate_payment" } }),
  });
  results.three_ds_probe = { status: r2.status, body: await r2.json() };

  return new Response(JSON.stringify(results, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
