// vapi-call-start: dial an outbound number via Vapi, record the call, return call_id.
// Body: { agent, number (E.164), goal, roomId?, assistantId? }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPI_API_KEY = Deno.env.get("VAPI_API_KEY")!;
const VAPI_ASSISTANT_ID_DEFAULT = Deno.env.get("VAPI_ASSISTANT_ID") ?? "b9b4545c-c322-4175-95ed-deda3f216c6c";
const VAPI_PHONE_NUMBER_ID = Deno.env.get("VAPI_PHONE_NUMBER_ID") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function pickMonitorUrl(payload: any): string | null {
  const candidates = [
    payload?.monitor?.listenUrl,
    payload?.monitor?.url,
    payload?.live?.url,
    payload?.stream?.url,
    payload?.transport?.streamUrl,
    payload?.webCallUrl,
    payload?.customer?.webCallUrl,
  ];
  const url = candidates.find((u) => typeof u === "string" && /^https?:\/\//i.test(u));
  return typeof url === "string" ? url : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { agent, number, goal, roomId, assistantId } = await req.json();
    if (!number || !agent) throw new Error("agent and number are required");
    const db = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: row, error: rowErr } = await db.from("vapi_calls").insert({
      agent_name: agent, room_id: roomId ?? null,
      phone_number: number, goal: goal ?? null, status: "dialing",
    }).select().single();
    if (rowErr) throw rowErr;

    if (!VAPI_PHONE_NUMBER_ID) {
      await db.from("vapi_calls").update({ status: "failed", summary: "VAPI_PHONE_NUMBER_ID missing" }).eq("id", row.id);
      throw new Error("VAPI_PHONE_NUMBER_ID not configured — add it in Cloud secrets");
    }

    const vapiRes = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: "Bearer " + VAPI_API_KEY },
      body: JSON.stringify({
        assistantId: assistantId ?? VAPI_ASSISTANT_ID_DEFAULT,
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        customer: { number },
        assistantOverrides: {
          variableValues: { mission_goal: goal ?? "", initiating_agent: agent },
          serverUrl: SUPABASE_URL + "/functions/v1/vapi-webhook",
          serverUrlSecret: row.id,
        },
      }),
    });
    const vapi = await vapiRes.json();
    if (!vapiRes.ok) {
      await db.from("vapi_calls").update({ status: "failed", summary: JSON.stringify(vapi).slice(0, 500) }).eq("id", row.id);
      throw new Error("Vapi error: " + JSON.stringify(vapi));
    }
    await db.from("vapi_calls").update({ vapi_call_id: vapi.id, status: "active" }).eq("id", row.id);
    await db.from("vapi_call_events").insert({
      call_id: row.id, role: "system", content: agent + " dialed " + number + " — goal: " + (goal ?? "(none)"),
    });
    const monitorUrl = pickMonitorUrl(vapi);
    if (monitorUrl) {
      await db.from("vapi_call_events").insert({
        call_id: row.id,
        role: "system",
        content: "Live audio monitor available.",
        meta: { event: "live_audio_monitor", monitor_url: monitorUrl },
      });
    }

    return new Response(JSON.stringify({ ok: true, call_id: row.id, vapi_call_id: vapi.id }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
