// vapi-chat is now a thin forwarder to azure-agent-run (Public Concierge on Azure AI Foundry).
// Kept at the same URL/shape so the website frontend needs no changes.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { input, sessionId, previousChatId } = await req.json();
    if (!input) {
      return new Response(JSON.stringify({ error: "input is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const externalId = sessionId || previousChatId || "anon";
    const r = await fetch(Deno.env.get("SUPABASE_URL")! + "/functions/v1/azure-agent-run", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: "Bearer " + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify({ role: "concierge", channel: "web", externalId, message: input }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) {
      return new Response(JSON.stringify({ error: data.error ?? "Azure agent failed", details: data }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Preserve legacy response shape: { text, chatId }
    return new Response(JSON.stringify({ text: data.text, chatId: data.threadId, raw: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("vapi-chat forwarder error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
