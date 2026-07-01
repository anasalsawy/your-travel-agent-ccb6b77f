// Admin Booking Agent — thin forwarder to azure-agent-run (Booking Delegate on Azure AI Foundry).
// Preserves the { text, steps } shape the admin UI expects.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return jerr("Unauthorized", 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims } = await sb.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return jerr("Unauthorized", 401);
    const { data: role } = await sb.from("user_roles")
      .select("role").eq("user_id", claims.claims.sub).eq("role", "admin").maybeSingle();
    if (!role) return jerr("Forbidden", 403);

    const body = await req.json();
    const messages = body.messages ?? [];
    // Take the last user message as the current turn; Azure holds the thread.
    const lastUser = [...messages].reverse().find((m: any) => m.role === "user");
    const text = lastUser?.parts?.map((p: any) => p.type === "text" ? p.text : "").join("") ?? "";
    if (!text) return jerr("no user message", 400);

    const r = await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/azure-agent-run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({
        role: "booking",
        channel: "admin",
        externalId: claims.claims.sub,
        message: text,
      }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) return jerr(data.error ?? "azure run failed", 500, data);

    return new Response(JSON.stringify({
      text: data.text,
      steps: (data.steps ?? []).map((s: any) => ({
        toolCalls: [{ toolName: s.tool, args: s.args }],
        toolResults: [{ toolName: s.tool, result: s.result }],
      })),
    }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    return jerr((e as Error).message, 500);
  }
});

function jerr(msg: string, status: number, details?: unknown) {
  return new Response(JSON.stringify({ error: msg, details }), {
    status, headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
