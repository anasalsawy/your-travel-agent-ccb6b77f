// model-catalog — control plane for the Featherless-first model router.
// POST { action: "list" | "refresh" | "rank" | "health" | "settings" | "save" | "test" }
import { corsHeaders } from "../_shared/lobe-runtime.ts";
import {
  refreshCatalog, listCatalog, rankModels, getSettings, routeChat, buildChain, hasFeatherless,
} from "../_shared/model-router.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const sb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "list";

    if (action === "refresh") {
      const r = await refreshCatalog();
      return json({ ...r, models: await listCatalog(400) });
    }
    if (action === "list") {
      let models = await listCatalog(body.limit ?? 400, body.search);
      if (!models.length && hasFeatherless()) {
        await refreshCatalog();
        models = await listCatalog(body.limit ?? 400, body.search);
      }
      return json({ ok: true, configured: hasFeatherless(), models, settings: await getSettings() });
    }
    if (action === "rank") return json({ ok: true, ranked: await rankModels(body.limit ?? 25) });
    if (action === "health") {
      const { data } = await sb().from("ai_model_health").select("*").order("updated_at", { ascending: false }).limit(100);
      return json({ ok: true, health: data ?? [] });
    }
    if (action === "settings") return json({ ok: true, settings: await getSettings(), chain: await buildChain(body.model) });
    if (action === "save") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const k of ["auto_select", "default_model", "fallback_models", "emergency_model", "cooldown_seconds", "max_attempts", "primary_provider"]) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      const { data, error } = await sb().from("ai_router_settings").update(patch).eq("id", "default").select().single();
      if (error) throw error;
      return json({ ok: true, settings: data });
    }
    if (action === "test") {
      const t0 = Date.now();
      const r = await routeChat({
        messages: [
          { role: "system", content: 'Reply with ONE JSON object: {"pong":true,"model_says":"<short greeting>"}' },
          { role: "user", content: String(body.prompt ?? "ping") },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 200,
      }, body.model ?? "auto");
      return json({ ok: true, latency_ms: Date.now() - t0, served_by: r.model, provider: r.provider, attempts: r.attempts, content: r.content });
    }
    return json({ ok: false, error: "unknown action " + action }, 400);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
