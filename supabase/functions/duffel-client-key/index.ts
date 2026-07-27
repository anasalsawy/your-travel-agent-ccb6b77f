// Mints a Duffel component client key (used by @duffel/components in the browser).
// Docs: POST https://api.duffel.com/identity/component_client_keys
// Public: any visitor booking a flight needs a short-lived key to run 3DS in
// the DuffelPayments component. Admins minting keys for the stored-card vault
// also come through here (unchanged).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-duffel-mode",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const useTest = (req.headers.get("x-duffel-mode") || "test") === "test";
    const token = useTest
      ? Deno.env.get("DUFFEL_TEST_API_TOKEN") || Deno.env.get("DUFFEL_API_TOKEN")
      : Deno.env.get("DUFFEL_API_TOKEN");
    if (!token) throw new Error("Duffel token missing");

    const body = await req.json().catch(() => ({}));

    // If an Authorization header is present, resolve the user (admins/customers
    // both fine). Guests are also allowed — the key is short-lived and scoped
    // to Duffel's component surface.
    let isAdmin = false;
    let userId: string | undefined;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      try {
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: u } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        if (u.user) {
          userId = u.user.id;
          const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
          isAdmin = !!role;
        }
      } catch (_) { /* treat as guest */ }
    }

    // Only admins can request live-mode keys. Guests are forced to test if
    // they somehow ask for live (defense in depth — the UI does not expose it).
    const effectiveTest = isAdmin ? useTest : true;
    const effectiveToken = effectiveTest
      ? (Deno.env.get("DUFFEL_TEST_API_TOKEN") || Deno.env.get("DUFFEL_API_TOKEN"))
      : Deno.env.get("DUFFEL_API_TOKEN");

    const payload: any = { data: {} };
    if (body.user_id) payload.data.user_id = body.user_id;
    else if (userId) payload.data.user_id = userId;

    const res = await fetch("https://api.duffel.com/identity/component_client_keys", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + effectiveToken,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "duffel_error", detail: json }), { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ client_key: json.data.component_client_key, mode: effectiveTest ? "test" : "live" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
