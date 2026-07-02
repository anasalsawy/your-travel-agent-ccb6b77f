// vapi-webhook: receives Vapi server messages (transcripts, end-of-call, tool-calls)
// and writes them to vapi_call_events so the live cockpit updates in real time.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const msg = body?.message ?? body;
    const type: string = msg?.type ?? "unknown";
    const vapiCallId: string | undefined = msg?.call?.id ?? body?.call?.id;
    // We stashed our internal call_id in assistantOverrides.serverUrlSecret at start
    const secret: string | undefined = msg?.call?.serverUrlSecret ?? msg?.assistantOverrides?.serverUrlSecret;

    const db = createClient(SUPABASE_URL, SERVICE_ROLE);
    let call_id: string | null = null;
    if (secret) call_id = secret;
    else if (vapiCallId) {
      const { data } = await db.from("vapi_calls").select("id").eq("vapi_call_id", vapiCallId).maybeSingle();
      call_id = data?.id ?? null;
    }
    if (!call_id) return new Response(JSON.stringify({ ok: true, ignored: "no call_id" }), { headers: { ...corsHeaders, "content-type": "application/json" } });

    // Route by type
    if (type === "transcript") {
      const role = msg.role ?? "assistant"; // "user" | "assistant"
      const status = msg.transcriptType ?? "partial"; // "partial" | "final"
      const text = msg.transcript ?? "";
      if (status === "final" && text) {
        await db.from("vapi_call_events").insert({ call_id, role, content: text, meta: { final: true } });
      }
    } else if (type === "status-update") {
      const status = msg.status;
      await db.from("vapi_call_events").insert({ call_id, role: "system", content: "status: " + status });
      if (status === "ended") await db.from("vapi_calls").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", call_id);
    } else if (type === "end-of-call-report") {
      const summary = msg.summary ?? msg?.analysis?.summary ?? "";
      const transcript = msg.transcript ?? "";
      await db.from("vapi_calls").update({ status: "ended", ended_at: new Date().toISOString(), summary }).eq("id", call_id);
      await db.from("vapi_call_events").insert({ call_id, role: "system", content: "── END OF CALL ──\n" + (summary || transcript.slice(-500)) });
    } else if (type === "tool-calls" || type === "function-call") {
      const t = JSON.stringify(msg.toolCalls ?? msg.functionCall ?? {}).slice(0, 1000);
      await db.from("vapi_call_events").insert({ call_id, role: "tool", content: t });
    } else if (type === "hang" || type === "speech-update") {
      // ignore — too noisy
    } else {
      await db.from("vapi_call_events").insert({ call_id, role: "system", content: type });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e) {
    console.error("vapi-webhook error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200, headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
