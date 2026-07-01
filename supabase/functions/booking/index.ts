// Unified booking endpoint. One function, five actions, three products.
// Foundry agents call this via OpenAPI. Admin chat calls this via tools.
import { pickAdapter, type Product } from "../_shared/booking-adapters.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "search" | "create" | "cancel" | "modify" | "get";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action, product, provider, params } = body ?? {};

    if (!action || !product) {
      return json({ error: "action and product required" }, 400);
    }
    if (!["flights", "hotels", "cars"].includes(product)) {
      return json({ error: "product must be flights|hotels|cars" }, 400);
    }
    if (!["search", "create", "cancel", "modify", "get"].includes(action)) {
      return json({ error: "action must be search|create|cancel|modify|get" }, 400);
    }

    const adapter = pickAdapter(product as Product, provider);
    const result = await adapter[action as Action](product as Product, params ?? {});
    return json({ provider: adapter.name, action, product, ...(result as Record<string, unknown>) }, 200);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
