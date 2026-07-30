// MODEL ROUTER — vendor-neutral LLM routing with automatic model selection
// and automatic model *change* on error.
//
//   Primary   : Featherless (any active model in their catalog, OpenAI-compatible)
//   Fallback  : next-best healthy Featherless model (auto-picked by score)
//   Emergency : Lovable AI Gateway (always-on safety net)
//
// Every call records health (latency, errors, cooldown) so the auto-selector
// stops choosing models that are failing and re-tries them after a cooldown.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FEATHERLESS_KEY = Deno.env.get("FEATHERLESS_API_KEY") ?? "";
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

export const FEATHERLESS_BASE = "https://api.featherless.ai/v1";
export const LOVABLE_BASE = "https://ai.gateway.lovable.dev/v1";

const sb = () => createClient(SUPABASE_URL, SERVICE_ROLE);

export type Provider = "featherless" | "lovable";
export type RouterSettings = {
  auto_select: boolean;
  primary_provider: string;
  default_model: string | null;
  fallback_models: string[];
  emergency_model: string;
  cooldown_seconds: number;
  max_attempts: number;
};

const DEFAULTS: RouterSettings = {
  auto_select: true,
  primary_provider: "featherless",
  default_model: null,
  fallback_models: [],
  emergency_model: "google/gemini-2.5-flash",
  cooldown_seconds: 600,
  max_attempts: 4,
};

export function hasFeatherless() {
  return FEATHERLESS_KEY.length > 0;
}

export async function getSettings(): Promise<RouterSettings> {
  try {
    const { data } = await sb().from("ai_router_settings").select("*").eq("id", "default").maybeSingle();
    return { ...DEFAULTS, ...(data ?? {}) } as RouterSettings;
  } catch {
    return DEFAULTS;
  }
}

// ── Catalog ────────────────────────────────────────────────────────────────
export async function refreshCatalog(): Promise<{ ok: boolean; count: number; error?: string }> {
  if (!hasFeatherless()) return { ok: false, count: 0, error: "FEATHERLESS_API_KEY not configured" };
  try {
    const r = await fetch(FEATHERLESS_BASE + "/models", {
      headers: { Authorization: "Bearer " + FEATHERLESS_KEY },
    });
    if (!r.ok) return { ok: false, count: 0, error: "featherless " + r.status + ": " + (await r.text()).slice(0, 200) };
    const j = await r.json();
    const list: any[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
    const rows = list.map((m: any) => ({
      provider: "featherless",
      model_id: String(m.id ?? m.model ?? ""),
      display_name: String(m.name ?? m.id ?? ""),
      model_class: m.model_class ?? m.owned_by ?? null,
      context_length: Number(m.context_length ?? m.max_context_length ?? 0) || null,
      max_completion_tokens: Number(m.max_completion_tokens ?? 0) || null,
      is_gated: Boolean(m.is_gated ?? false),
      available: m.available_on_current_plan !== false && m.status !== "unavailable",
      capabilities: { json: true },
      raw: m,
      refreshed_at: new Date().toISOString(),
    })).filter((r) => r.model_id);

    const s = sb();
    for (let i = 0; i < rows.length; i += 200) {
      await s.from("ai_model_registry").upsert(rows.slice(i, i + 200), { onConflict: "provider,model_id" });
    }
    return { ok: true, count: rows.length };
  } catch (e) {
    return { ok: false, count: 0, error: (e as Error).message };
  }
}

export async function listCatalog(limit = 2000) {
  const { data } = await sb().from("ai_model_registry")
    .select("provider,model_id,display_name,model_class,context_length,is_gated,available")
    .eq("available", true).order("model_id").limit(limit);
  return data ?? [];
}

async function healthMap(): Promise<Record<string, any>> {
  const { data } = await sb().from("ai_model_health").select("*");
  const out: Record<string, any> = {};
  for (const h of data ?? []) out[h.provider + "|" + h.model_id] = h;
  return out;
}

// Heuristic quality bias: instruction-tuned, well-known, large-context models
// first. Purely a starting order — health data takes over once traffic flows.
const BIAS = [
  [/qwen.*(2\.5|3).*(72|32|30)b.*instruct/i, 60],
  [/llama-?3\.[13]-?70b.*instruct/i, 58],
  [/deepseek.*(v3|r1)/i, 55],
  [/mistral.*large/i, 48],
  [/mixtral.*8x22/i, 45],
  [/instruct|chat|-it$/i, 25],
  [/base|raw|pretrain/i, -40],
  [/uncensored|erp|rp-|roleplay/i, -25],
] as Array<[RegExp, number]>;

function score(model: any, h: any, cooldownSec: number): number {
  let s = 0;
  for (const [re, w] of BIAS) if (re.test(model.model_id)) s += w;
  s += Math.min((model.context_length ?? 0) / 8192, 8) * 2;
  if (model.is_gated) s -= 15;
  if (h) {
    const total = (h.ok_count ?? 0) + (h.err_count ?? 0);
    if (total > 0) s += ((h.ok_count ?? 0) / total) * 40 - 20;
    s -= (h.consecutive_errors ?? 0) * 15;
    if (h.avg_latency_ms) s -= Math.min(h.avg_latency_ms / 1000, 15);
    if (h.cooldown_until && new Date(h.cooldown_until).getTime() > Date.now()) s -= 1000;
  }
  void cooldownSec;
  return s;
}

/** Rank every active Featherless model, best first. */
export async function rankModels(limit = 25): Promise<Array<{ model_id: string; score: number }>> {
  const [models, health, settings] = await Promise.all([listCatalog(), healthMap(), getSettings()]);
  return models
    .map((m: any) => ({ model_id: m.model_id, score: score(m, health["featherless|" + m.model_id], settings.cooldown_seconds) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function recordHealth(provider: string, model: string, ok: boolean, latency: number, status?: number, error?: string) {
  try {
    const s = sb();
    const { data: cur } = await s.from("ai_model_health").select("*").eq("provider", provider).eq("model_id", model).maybeSingle();
    const okCount = (cur?.ok_count ?? 0) + (ok ? 1 : 0);
    const errCount = (cur?.err_count ?? 0) + (ok ? 0 : 1);
    const consec = ok ? 0 : (cur?.consecutive_errors ?? 0) + 1;
    const prevAvg = cur?.avg_latency_ms ?? 0;
    const settings = await getSettings();
    await s.from("ai_model_health").upsert({
      provider, model_id: model,
      ok_count: okCount, err_count: errCount, consecutive_errors: consec,
      avg_latency_ms: ok ? Math.round(prevAvg ? prevAvg * 0.7 + latency * 0.3 : latency) : prevAvg,
      last_error: ok ? cur?.last_error ?? null : (error ?? "").slice(0, 500),
      last_status: status ?? null,
      last_used_at: new Date().toISOString(),
      cooldown_until: consec >= 2 ? new Date(Date.now() + settings.cooldown_seconds * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "provider,model_id" });
  } catch { /* health tracking must never break a call */ }
}

function providerOf(model: string): Provider {
  // Lovable gateway ids are vendor-prefixed (openai/…, google/…).
  return /^(openai|google|anthropic)\//i.test(model) ? "lovable" : "featherless";
}

async function callOnce(model: string, body: any): Promise<{ ok: boolean; status: number; text: string; content?: string }> {
  const provider = providerOf(model);
  const url = (provider === "featherless" ? FEATHERLESS_BASE : LOVABLE_BASE) + "/chat/completions";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider === "featherless") headers["Authorization"] = "Bearer " + FEATHERLESS_KEY;
  else headers["Lovable-API-Key"] = LOVABLE_KEY;

  const payload: any = { ...body, model };
  // OpenAI-family models on the gateway reject temperature/max_tokens tuning.
  if (provider === "lovable" && /^openai\//i.test(model)) {
    delete payload.temperature;
    delete payload.max_tokens;
  }
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await r.text();
  if (!r.ok) return { ok: false, status: r.status, text: text.slice(0, 400) };
  try {
    const j = JSON.parse(text);
    return { ok: true, status: r.status, text, content: j.choices?.[0]?.message?.content ?? "" };
  } catch {
    return { ok: false, status: r.status, text: text.slice(0, 400) };
  }
}

/** Build the ordered attempt list: requested → auto-picked → emergency. */
export async function buildChain(requested?: string): Promise<string[]> {
  const settings = await getSettings();
  const chain: string[] = [];
  const push = (m?: string | null) => { if (m && !chain.includes(m)) chain.push(m); };

  const explicit = requested && requested !== "auto" ? requested : null;
  if (explicit) push(explicit);
  if (hasFeatherless()) {
    if (!explicit) push(settings.default_model);
    if (settings.auto_select || !explicit) {
      const ranked = await rankModels(6);
      for (const r of ranked) push(r.model_id);
    }
    for (const f of settings.fallback_models ?? []) push(f);
  }
  push(settings.emergency_model);
  push("google/gemini-2.5-flash");
  return chain.slice(0, Math.max(2, settings.max_attempts + 1));
}

export type RouteResult = { content: string; model: string; provider: Provider; attempts: Array<{ model: string; ok: boolean; status?: number; error?: string }> };

/** OpenAI-compatible chat completion with automatic model change on failure. */
export async function routeChat(
  body: { messages: any[]; response_format?: any; temperature?: number; max_tokens?: number },
  requested?: string,
): Promise<RouteResult> {
  const chain = await buildChain(requested);
  const attempts: RouteResult["attempts"] = [];
  let lastErr = "no model available";

  for (const model of chain) {
    const provider = providerOf(model);
    if (provider === "featherless" && !hasFeatherless()) continue;
    if (provider === "lovable" && !LOVABLE_KEY) continue;
    const t0 = Date.now();
    try {
      const res = await callOnce(model, body);
      const latency = Date.now() - t0;
      await recordHealth(provider, model, res.ok, latency, res.status, res.ok ? undefined : res.text);
      if (res.ok) {
        attempts.push({ model, ok: true, status: res.status });
        return { content: res.content ?? "", model, provider, attempts };
      }
      attempts.push({ model, ok: false, status: res.status, error: res.text });
      lastErr = model + " → " + res.status + ": " + res.text;
    } catch (e) {
      await recordHealth(provider, model, false, Date.now() - t0, 0, (e as Error).message);
      attempts.push({ model, ok: false, error: (e as Error).message });
      lastErr = model + " → " + (e as Error).message;
    }
  }
  throw new Error("all models failed (" + chain.length + " tried). last: " + lastErr);
}
