// Creates a Duffel 3DS Session for a stored card + offer.
// Admin-only. With Duffel's "secure_corporate_payment" exception enabled on the
// account, the resulting session can be marked ready without a customer challenge.
// Docs: POST https://api.duffel.com/payments/three_d_secure_sessions
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const useTest = (req.headers.get("x-duffel-mode") || "test") === "test";
    const token = useTest
      ? Deno.env.get("DUFFEL_TEST_API_TOKEN") || Deno.env.get("DUFFEL_API_TOKEN")
      : Deno.env.get("DUFFEL_API_TOKEN");
    if (!token) throw new Error("Duffel token missing");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!u.user) return new Response(JSON.stringify({ error: "auth required" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!role) return new Response(JSON.stringify({ error: "admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { card_id, resource_id, services, currency, amount, exception } = await req.json();
    if (!card_id || !resource_id || !amount || !currency) {
      return new Response(JSON.stringify({ error: "card_id, resource_id, amount, currency required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload: any = {
      data: {
        card_id,
        resource_id,
        currency,
        amount: String(amount),
        services: services || [],
        // "secure_corporate_payment" tells Duffel this is a B2B-trusted env;
        // requires explicit account approval — otherwise Duffel returns 422.
        exception: exception || "secure_corporate_payment",
      },
    };

    const res = await fetch("https://api.duffel.com/payments/three_d_secure_sessions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
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
    return new Response(JSON.stringify({ session: json.data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
