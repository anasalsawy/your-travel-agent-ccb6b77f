import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { resolveFlightProvider, shouldFallbackToDuffel } from "../_shared/provider-router.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function invokeFunction(fnName: string, body: any, authHeader: string | null) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${serviceRole}`,
  };

  if (authHeader) headers["x-client-authorization"] = authHeader;

  const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const txt = await res.text();
  let data: any = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }

  return { ok: res.ok, status: res.status, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const payload = await req.json();
    const authHeader = req.headers.get("Authorization");
    const provider = resolveFlightProvider(payload?.provider_preference);

    if (provider === "duffel") {
      const result = await invokeFunction("duffel-search", payload, authHeader);
      return new Response(JSON.stringify({ provider: "duffel", ...result.data }), {
        status: result.ok ? 200 : 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const trawex = await invokeFunction("trawex-flight-search", payload, authHeader);
    if (trawex.ok) {
      return new Response(JSON.stringify({ provider: "trawex", ...trawex.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!shouldFallbackToDuffel(payload)) {
      return new Response(JSON.stringify({
        provider: "trawex",
        error: "Trawex search failed and fallback disabled",
        detail: trawex.data,
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const duffel = await invokeFunction("duffel-search", payload, authHeader);
    return new Response(JSON.stringify({
      provider: "duffel",
      fallback_from: "trawex",
      trawex_error: trawex.data,
      ...duffel.data,
    }), {
      status: duffel.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
