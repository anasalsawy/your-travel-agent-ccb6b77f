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
import { withAiSlot, TrafficBusyError, unitsFor, trafficStatus } from "./ai-traffic.ts";

export { trafficStatus, unitsFor };

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
  /** Owner policy: when false the council runs on Featherless models ONLY. */
  allow_lovable_fallback?: boolean;
};

const DEFAULTS: RouterSettings = {
  auto_select: true,
  primary_provider: "featherless",
  default_model: null,
  fallback_models: [],
  emergency_model: "google/gemini-2.5-flash",
  cooldown_seconds: 600,
  max_attempts: 4,
  allow_lovable_fallback: false,
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
// Featherless exposes >20k HuggingFace repos. Most are 0.5B toys, swarm forks
// or base (non-instruct) checkpoints that cannot hold an agent loop. We cache
// only serviceable agent models so selection stays fast and safe.
const SIZE_OK = /(7b|8b|9b|12b|13b|14b|20b|22b|24b|27b|30b|32b|34b|65b|70b|72b|8x7b|8x22b|123b|235b|405b|480b)/i;
const FAMILY_OK = /(qwen|llama|mistral|mixtral|deepseek|gemma|phi|command|hermes|yi-|glm|kimi|minimax|nemotron|granite|olmo)/i;
const REJECT = /(gensyn|swarm|tiny|storygeneration|-0b5|0\.5b|1\.5b|-1b|-3b|-2b|draft|gguf|awq-|test|debug)/i;
const INSTRUCT = /(instruct|chat|-it\b|it$|thinking|reason|hermes|dolphin|openchat|nemo)/i;

function serviceable(m: { model_id: string; model_class: string | null; context_length: number | null }): boolean {
  const id = m.model_id;
  const cls = m.model_class ?? "";
  if (REJECT.test(id)) return false;
  if ((m.context_length ?? 0) < 8192) return false;
  if (!FAMILY_OK.test(id) && !FAMILY_OK.test(cls)) return false;
  if (!SIZE_OK.test(id) && !SIZE_OK.test(cls)) return false;
  if (!INSTRUCT.test(id)) return false;
  return true;
}

export async function refreshCatalog(): Promise<{ ok: boolean; count: number; scanned?: number; error?: string }> {
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
      raw: {},
      refreshed_at: new Date().toISOString(),
    })).filter((row) => row.model_id && serviceable(row)).slice(0, 1200);

    const s = sb();
    // Rebuild the cache so retired models disappear instead of lingering.
    await s.from("ai_model_registry").delete().eq("provider", "featherless");
    for (let i = 0; i < rows.length; i += 200) {
      await s.from("ai_model_registry").upsert(rows.slice(i, i + 200), { onConflict: "provider,model_id" });
    }
    return { ok: true, count: rows.length, scanned: list.length };
  } catch (e) {
    return { ok: false, count: 0, error: (e as Error).message };
  }
}

export async function listCatalog(limit = 1200, search?: string) {
  let q = sb().from("ai_model_registry")
    .select("provider,model_id,display_name,model_class,context_length,is_gated,available")
    .eq("available", true);
  if (search) q = q.ilike("model_id", "%" + search + "%");
  const { data } = await q.order("model_id").limit(limit);
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

// ── Proven pool ──────────────────────────────────────────────────────────────
// Featherless lists thousands of community fine-tunes. Most answer 503
// "temporarily at capacity" forever: ranking likes them (big, instruct-tuned)
// but they can never serve an agent. A model earns its place by SERVING, so
// the roster only ever runs on models with a proven success record.
const PROVEN_TTL_MS = 60_000;
let provenCache: { models: string[]; at: number } | null = null;

export async function provenModels(limit = 4): Promise<string[]> {
  if (provenCache && Date.now() - provenCache.at < PROVEN_TTL_MS) return provenCache.models.slice(0, limit);
  try {
    const { data } = await sb().from("ai_model_health")
      .select("model_id,ok_count,err_count,consecutive_errors,cooldown_until,avg_latency_ms")
      .eq("provider", "featherless").gte("ok_count", 3)
      .order("ok_count", { ascending: false }).limit(40);
    const now = Date.now();
    const good = (data ?? [])
      .filter((h: any) => (h.consecutive_errors ?? 0) < 3)
      .filter((h: any) => !h.cooldown_until || new Date(h.cooldown_until).getTime() < now)
      .filter((h: any) => (h.ok_count ?? 0) / Math.max((h.ok_count ?? 0) + (h.err_count ?? 0), 1) >= 0.5)
      .map((h: any) => h.model_id as string);
    if (good.length) { provenCache = { models: good, at: Date.now() }; return good.slice(0, limit); }
  } catch { /* fall through */ }
  return [];
}

// The plan also caps how many DIFFERENT models the account may switch between
// per minute. Spreading 16 agents over 16 models therefore guarantees a
// "model_switching_limit" rejection. The governor keeps the whole organization
// inside a small hot set: distinct models per minute stay under the cap.
export const MAX_DISTINCT_MODELS_PER_MIN = 3;

async function hotModels(): Promise<string[]> {
  try {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data } = await sb().from("ai_model_health")
      .select("model_id,last_used_at,consecutive_errors")
      .eq("provider", "featherless").gt("last_used_at", since)
      .order("last_used_at", { ascending: false }).limit(10);
    return (data ?? []).filter((h: any) => (h.consecutive_errors ?? 0) < 3).map((h: any) => h.model_id as string);
  } catch { return []; }
}

/**
 * Switch-rate governor: if the account has already touched its quota of
 * distinct models this minute, reuse a model that is already hot instead of
 * paying a switch we are not allowed to make.
 */
export async function switchGoverned(desired: string): Promise<string> {
  if (providerOf(desired) !== "featherless") return desired;
  const hot = await hotModels();
  if (hot.includes(desired)) return desired;
  if (hot.length >= MAX_DISTINCT_MODELS_PER_MIN) return hot[0];
  return desired;
}

// ── Per-agent model spreading ────────────────────────────────────────────────
// Every agent on ONE model serialises the whole council behind that model's
// concurrency slot. So each agent gets its OWN model, deterministically derived
// from its key: same agent → same model across isolates (no switch churn),
// different agents → different models (parallel lanes).
const AGENT_MODEL_TTL_MS = 10 * 60_000;
let spreadCache: { models: string[]; at: number } | null = null;

function keyHash(k: string): number {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

let rosterCache: { keys: string[]; at: number } | null = null;

/** A distinct, healthy model for this agent. Falls back to "auto" if unknown. */
export async function modelForAgent(agentKey: string, pool = MAX_DISTINCT_MODELS_PER_MIN): Promise<string> {
  if (!hasFeatherless()) return "auto";
  try {
    if (!spreadCache || Date.now() - spreadCache.at > AGENT_MODEL_TTL_MS) {
      // Proven servers first; ranking is only used to seed an empty history.
      const proven = await provenModels(8);
      const models = proven.length
        ? proven
        : (await rankModels(Math.max(pool, 4))).map((r) => r.model_id);
      spreadCache = { models, at: Date.now() };
    }
    const models = spreadCache.models;
    if (models.length === 0) return "auto";

    // Assign by the agent's position in the (stable, alphabetical) roster, so
    // distinct agents get distinct models instead of colliding on a hash.
    if (!rosterCache || Date.now() - rosterCache.at > AGENT_MODEL_TTL_MS) {
      const { data } = await sb().from("ao_agents").select("agent_key").order("agent_key");
      rosterCache = { keys: (data ?? []).map((r: any) => r.agent_key), at: Date.now() };
    }
    const idx = rosterCache.keys.indexOf(agentKey);
    const slot = idx >= 0 ? idx : keyHash(agentKey);
    return models[slot % Math.min(models.length, pool)];
  } catch {
    return "auto";
  }
}

/** Resolve an agent's configured model: explicit pin wins, else spread. */
export async function resolveAgentModel(agentKey: string, configured?: string | null): Promise<string> {
  if (configured && configured !== "auto") return configured;
  return await modelForAgent(agentKey);
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

// ── Stickiness ─────────────────────────────────────────────────────────────
// Featherless plans cap how often you may SWITCH models (e.g. 4/min). A router
// that hops models per call therefore self-DDoSes, and parallel mission lanes
// amplify it. So: pick one good model and STAY on it. Switch only when that
// model actually fails, never for variety.
let sticky: { model: string; at: number } | null = null;
let switchLockUntil = 0; // set when the provider says we switched too often
const STICKY_TTL_MS = 15 * 60 * 1000;

function isSwitchLimit(text: string): boolean {
  return /model_switching_limit|switch models|too many model/i.test(text ?? "");
}

// Featherless plans also cap CONCURRENCY in "units", and a 70B request costs 4
// units on the small plans — so two parallel agent lanes cannot both run a 70B.
// Two defences: (a) serialize Featherless calls inside the isolate, (b) when the
// provider says we are over the unit budget, drop to light models for a while.
function isConcurrencyLimit(text: string): boolean {
  return /concurrency limit|over limit by|concurrent requests/i.test(text ?? "");
}

const HEAVY = /(70b|72b|123b|235b|405b|480b|8x22b)/i;
let lightOnlyUntil = 0;

let fxQueue: Promise<unknown> = Promise.resolve();
/** One Featherless request at a time per isolate (local half of the light). */
function withFeatherlessSlot<T>(fn: () => Promise<T>): Promise<T> {
  const run = fxQueue.then(fn, fn);
  fxQueue = run.then(() => undefined, () => undefined);
  return run;
}

/**
 * Global half of the light: the database-backed traffic organizer, shared by
 * every isolate, so the account budget can never be exceeded in the first place.
 */
function withGlobalSlot<T>(model: string, holder: string, fn: () => Promise<T>): Promise<T> {
  return withAiSlot({ model, holder, lane: holder, maxWaitMs: 90_000 }, () => withFeatherlessSlot(fn));
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Last model that actually worked, recovered across isolates from health data. */
async function stickyModel(): Promise<string | null> {
  if (sticky && Date.now() - sticky.at < STICKY_TTL_MS) return sticky.model;
  try {
    const { data } = await sb().from("ai_model_health")
      .select("model_id,consecutive_errors,cooldown_until,ok_count")
      .eq("provider", "featherless").gt("ok_count", 0).eq("consecutive_errors", 0)
      .order("last_used_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.model_id && (!data.cooldown_until || new Date(data.cooldown_until).getTime() < Date.now())) {
      sticky = { model: data.model_id, at: Date.now() };
      return data.model_id;
    }
  } catch { /* fall through to ranking */ }
  return null;
}

function providerOf(model: string): Provider {
  // Lovable gateway ids are vendor-prefixed (openai/…, google/…).
  return /^(openai|google|anthropic)\//i.test(model) ? "lovable" : "featherless";
}

async function callOnce(model: string, body: any, holder = "router"): Promise<{ ok: boolean; status: number; text: string; content?: string }> {
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
  const doFetch = async () => {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    return { res, body: await res.text() };
  };
  // Unit-capped provider → cross the global intersection first.
  const guarded = () => provider === "featherless" ? withGlobalSlot(model, holder, doFetch) : doFetch();

  let out = await guarded();
  // A switch-limit rejection is transient and is NOT the model's fault:
  // retrying the SAME model costs no switch quota, so wait it out.
  for (let i = 0; i < 2 && !out.res.ok && isSwitchLimit(out.body); i++) {
    await sleep(12000 * (i + 1));
    out = await guarded();
  }
  // With the organizer in place this should be unreachable; if the provider
  // still says "over budget", the real budget is lower than configured, so
  // shrink it for a while and retry politely.
  for (let i = 0; i < 2 && !out.res.ok && isConcurrencyLimit(out.body); i++) {
    lightOnlyUntil = Date.now() + 5 * 60_000;
    await sleep(2500 * (i + 1));
    out = await guarded();
  }

  const r = out.res;
  const text = out.body;
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

  const switchLocked = Date.now() < switchLockUntil;
  if (hasFeatherless()) {
    if (!explicit) {
      push(settings.default_model);          // operator pin wins
      const st = await stickyModel();        // then: whatever is already working
      if (st && !(Date.now() < lightOnlyUntil && HEAVY.test(st))) push(st);
    }
    if (settings.auto_select && !switchLocked) {
      // Only TWO exploratory candidates — switching is a rationed resource.
      const ranked = await rankModels(8);
      const light = Date.now() < lightOnlyUntil;
      const pickable = light ? ranked.filter((r) => !HEAVY.test(r.model_id)) : ranked;
      for (const r of pickable.slice(0, 2)) push(r.model_id);
    }
    if (!switchLocked) for (const f of settings.fallback_models ?? []) push(f);
  }
  // Featherless-only by owner policy. The other-provider safety net is used
  // ONLY when explicitly allowed, or when Featherless is not configured at all.
  const allowOther = settings.allow_lovable_fallback === true || !hasFeatherless();
  if (allowOther) {
    push(settings.emergency_model);          // different provider: no switch cost
    push("google/gemini-2.5-flash");
  } else if (chain.length < 2) {
    // Stay on Featherless: widen the in-provider candidate set instead.
    for (const r of await rankModels(6)) push(r.model_id);
  }
  return chain.slice(0, Math.max(2, settings.max_attempts + 1));
}

export type RouteResult = { content: string; model: string; provider: Provider; attempts: Array<{ model: string; ok: boolean; status?: number; error?: string }> };

/** OpenAI-compatible chat completion with automatic model change on failure. */
export async function routeChat(
  body: { messages: any[]; response_format?: any; temperature?: number; max_tokens?: number },
  requested?: string,
  holder = "router",
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
      const res = await callOnce(model, body, holder);
      const latency = Date.now() - t0;
      if (!res.ok && isConcurrencyLimit(res.text)) {
        lightOnlyUntil = Date.now() + 5 * 60_000;
        attempts.push({ model, ok: false, status: res.status, error: "concurrency_limit" });
        lastErr = model + " → concurrency limit";
        continue;
      }
      if (!res.ok && isSwitchLimit(res.text)) {
        // Account-level throttle, NOT a bad model. Do not blame the model, do
        // not keep hopping: lock switching for a minute and take the fallback
        // provider, which costs no switch quota.
        switchLockUntil = Date.now() + 60_000;
        attempts.push({ model, ok: false, status: res.status, error: "switch_limit" });
        lastErr = model + " → switch limit";
        continue;
      }
      await recordHealth(provider, model, res.ok, latency, res.status, res.ok ? undefined : res.text);
      if (res.ok) {
        if (provider === "featherless") sticky = { model, at: Date.now() };
        attempts.push({ model, ok: true, status: res.status });
        return { content: res.content ?? "", model, provider, attempts };
      }
      attempts.push({ model, ok: false, status: res.status, error: res.text });
      lastErr = model + " → " + res.status + ": " + res.text;
    } catch (e) {
      if (e instanceof TrafficBusyError) {
        // The intersection was full — the model is innocent, so do not punish
        // its health score. Fall through to the patient last-resort pass.
        attempts.push({ model, ok: false, error: "concurrency_limit" });
        lastErr = model + " → traffic organizer busy";
        continue;
      }
      await recordHealth(provider, model, false, Date.now() - t0, 0, (e as Error).message);
      attempts.push({ model, ok: false, error: (e as Error).message });
      lastErr = model + " → " + (e as Error).message;
    }
  }
  // Every candidate was refused for ACCOUNT concurrency, not model health.
  // The account budget drains within seconds, so a patient last-resort pass on
  // the smallest model is far more productive than failing the whole round.
  if (attempts.length && attempts.every((a) => a.error === "concurrency_limit" || a.error === "switch_limit")) {
    const settings = await getSettings();
    const ranked = (await rankModels(12)).filter((r) => !HEAVY.test(r.model_id));
    const lastResort = ranked[0]?.model_id ?? settings.default_model;
    if (lastResort) {
      for (let i = 0; i < 3; i++) {
        await sleep(8000 * (i + 1));
        const t0 = Date.now();
        const res = await callOnce(lastResort, body, holder);
        if (res.ok) {
          await recordHealth("featherless", lastResort, true, Date.now() - t0, res.status);
          sticky = { model: lastResort, at: Date.now() };
          attempts.push({ model: lastResort, ok: true, status: res.status });
          return { content: res.content ?? "", model: lastResort, provider: "featherless", attempts };
        }
        lastErr = lastResort + " → " + res.status + ": " + res.text;
      }
    }
  }
  throw new Error("all models failed (" + chain.length + " tried). last: " + lastErr);
}
