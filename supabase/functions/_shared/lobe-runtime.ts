// Shared runtime for lobe wiring experiments.
// Every dual-lobe variant reuses these tools, allowlists, and the LLM helper.
// The variation lives in each function's dispatch loop, not the primitives.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { routeChatSafe } from "./model-router.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// NO TABLE ALLOWLIST. Agents run under the service role and may read or write
// ANY table in the public schema. The catalogue below is discovered live from
// the database so a new table is usable the second it exists.
let _tableCache: { at: number; tables: Record<string, string> } = { at: 0, tables: {} };

export async function liveTables(): Promise<Record<string, string>> {
  if (Date.now() - _tableCache.at < 120_000 && Object.keys(_tableCache.tables).length) return _tableCache.tables;
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await supabase.rpc("agent_list_tables");
    if (error) throw error;
    const tables: Record<string, string> = {};
    for (const r of (data ?? []) as any[]) tables[r.table_name] = r.columns;
    _tableCache = { at: Date.now(), tables };
  } catch { /* keep last known catalogue */ }
  return _tableCache.tables;
}

export async function tableNames(): Promise<string[]> {
  return Object.keys(await liveTables()).sort();
}

/** Back-compat shim: anything that still reads this gets the live catalogue. */
export const ALLOWLIST_TABLES = new Set<string>([]);

export const EDGE_FUNCTIONS = [
  "duffel-search", "duffel-offer", "duffel-book-card", "duffel-book-customer-card", "duffel-list-bookings",
  "duffel-stays-search", "duffel-cars-search", "duffel-places",
  "smart-quote-v2", "claude-quote", "nyop-create-bid", "nyop-hunt-tick",
  "inbox-tick", "outreach-tick", "prospect-tick", "lead-intake", "marketing-os", "agency-os",
  "council", "dev-council", "dialogue-room", "runner-24x7", "agent-health-tick", "model-catalog",
  "send-notification", "send-promo-email", "send-whatsapp-quote", "telegram-bot", "council-telegram",
  "make-outbound-call", "voice-proxy-call", "elevenlabs-tts", "elevenlabs-stt",
  "browserbase-browse", "rag-search", "rag-embed", "memory-agent", "memory-lifecycle-tick",
  "war-room", "brain-agent", "dual-lobe-agent", "foundry-agent-run", "azure-rest", "create-stripe-checkout",
];

export const SENSORY_TOOLS = ["db_read", "db_count", "sql", "list_tables", "list_edge_functions", "http_get", "tool_registry"];
export const MOTOR_TOOLS = ["db_write", "db_delete", "db_read", "db_count", "sql", "rpc", "http_post", "http_get", "invoke_edge_function", "send_notification", "fb_send_dm", "fb_post"];



// "auto" => the model router picks the best healthy Featherless model and
// changes model automatically whenever one errors out.
export const DEFAULT_MODEL = "auto";

export type Lobe = "sensory" | "motor";
export type Mode = "safe" | "full";

export async function llm(
  system: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  opts?: { temperature?: number; max_tokens?: number },
): Promise<string> {
  const res = await llmDetailed(system, messages, model, opts);
  return res.content;
}

/** Same as llm() but returns which model actually served the call. */
export async function llmDetailed(
  system: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  opts?: { temperature?: number; max_tokens?: number },
) {
  const body: any = {
    messages: [{ role: "system", content: system }, ...messages],
    response_format: { type: "json_object" },
    temperature: opts?.temperature ?? 0.4,
  };
  if (opts?.max_tokens) body.max_tokens = opts.max_tokens;
  const r = await routeChatSafe(body, model || DEFAULT_MODEL);
  return { content: r.content || "{}", model: r.model, provider: r.provider, attempts: r.attempts };
}


export function safeParse(s: string): any {
  try { return JSON.parse(s); } catch { return { say: s.slice(0, 500), tool: null, done: false }; }
}

export async function execTool(
  tool: string,
  args: Record<string, any>,
  allowed: string[],
  mode: Mode,
): Promise<{ tool: string; ok: boolean; result?: any; error?: string }> {
  if (!allowed.includes(tool)) return { tool, ok: false, error: "tool " + tool + " not in this lobe's allowlist" };
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  try {
    switch (tool) {
      case "tool_registry":
        return { tool, ok: true, result: { sensory: SENSORY_TOOLS, motor: MOTOR_TOOLS, tables: await tableNames(), edge_functions: EDGE_FUNCTIONS } };
      case "list_tables":
        return { tool, ok: true, result: { tables: await liveTables() } };
      case "list_edge_functions":
        return { tool, ok: true, result: { functions: EDGE_FUNCTIONS } };
      case "sql": {
        // Arbitrary read-only SQL over the whole public schema: joins, aggregates,
        // date math — anything the agent needs to answer a question itself.
        const q = String(args.query ?? args.sql ?? "");
        if (!q.trim()) throw new Error("query required");
        const { data, error } = await supabase.rpc("agent_sql", { q });
        if (error) throw error;
        return { tool, ok: true, result: { rows: data } };
      }
      case "rpc": {
        if (mode !== "full") throw new Error("rpc blocked in safe mode");
        const { name, args: rpcArgs } = args;
        const { data, error } = await supabase.rpc(String(name), rpcArgs ?? {});
        if (error) throw error;
        return { tool, ok: true, result: { data } };
      }
      case "db_read": {
        const { table, select = "*", eq, order, desc, limit = 20 } = args;
        // Models often pass select as an array of columns — normalise it.
        const cols = Array.isArray(select) ? select.join(",") : String(select || "*");
        const lim = Number.isFinite(Number(limit)) ? Number(limit) : 20;
        let q = supabase.from(table).select(cols).limit(Math.min(Math.max(lim, 1), 200));
        if (eq && typeof eq === "object") for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
        if (order) q = q.order(String(order), { ascending: desc === true ? false : desc === false ? true : false });
        const { data, error } = await q;
        if (error) throw error;
        return { tool, ok: true, result: { rows: data } };
      }
      case "db_count": {
        // Row counts, optionally grouped by one column — the question agents ask most.
        const { table, eq, group_by } = args;
        if (group_by) {
          let gq = supabase.from(table).select(group_by).limit(5000);
          if (eq && typeof eq === "object") for (const [k, v] of Object.entries(eq)) gq = gq.eq(k, v as any);
          const { data, error } = await gq;
          if (error) throw error;
          const counts: Record<string, number> = {};
          for (const row of (data ?? []) as Record<string, unknown>[]) {
            const key = String(row[group_by] ?? "null");
            counts[key] = (counts[key] ?? 0) + 1;
          }
          return { tool, ok: true, result: { table, group_by, counts, total: (data ?? []).length } };
        }
        let cq = supabase.from(table).select("*", { count: "exact", head: true });
        if (eq && typeof eq === "object") for (const [k, v] of Object.entries(eq)) cq = cq.eq(k, v as any);
        const { count, error } = await cq;
        if (error) throw error;
        return { tool, ok: true, result: { table, count: count ?? 0 } };
      }

      case "http_get": {
        const { url, headers } = args;
        if (!url) throw new Error("url required");
        const r = await fetch(url, { headers: headers || {} });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 6000) } };
      }
      case "db_write": {
        if (mode !== "full") throw new Error("db_write blocked in safe mode");
        const { table, op = "insert", values, eq } = args;
        if (op === "insert") {
          const { data, error } = await supabase.from(table).insert(values).select();
          if (error) throw error;
          return { tool, ok: true, result: { inserted: data } };
        }
        if (op === "upsert") {
          const { data, error } = await supabase.from(table).upsert(values).select();
          if (error) throw error;
          return { tool, ok: true, result: { upserted: data } };
        }
        if (op === "update") {
          let q = supabase.from(table).update(values);
          if (eq) for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
          const { data, error } = await q.select();
          if (error) throw error;
          return { tool, ok: true, result: { updated: data } };
        }
        throw new Error("unknown op " + op);
      }
      case "db_delete": {
        if (mode !== "full") throw new Error("db_delete blocked in safe mode");
        const { table, eq } = args;
        if (!eq || typeof eq !== "object" || !Object.keys(eq).length) throw new Error("eq filter required — refusing unfiltered delete");
        let q = supabase.from(table).delete();
        for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
        const { data, error } = await q.select();
        if (error) throw error;
        return { tool, ok: true, result: { deleted: data?.length ?? 0 } };
      }
      case "http_post": {
        const { url, headers, body, method } = args;
        if (!url) throw new Error("url required");
        const r = await fetch(url, {
          method: String(method || "POST").toUpperCase(),
          headers: { "Content-Type": "application/json", ...(headers || {}) },
          body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 6000) } };
      }
      case "fb_send_dm": {
        if (mode !== "full") throw new Error("fb_send_dm blocked in safe mode");
        const { sendDm } = await import("./graph-fb.ts");
        const out = await sendDm(String(args.psid), String(args.text), args.tag);
        return { tool, ok: true, result: out };
      }
      case "fb_post": {
        if (mode !== "full") throw new Error("fb_post blocked in safe mode");
        const { publishPost } = await import("./graph-fb.ts");
        const out = await publishPost(String(args.message), args.link);
        return { tool, ok: true, result: out };
      }
      case "invoke_edge_function": {
        if (mode !== "full") throw new Error("invoke_edge_function blocked in safe mode");
        const { name, body } = args;
        const r = await fetch(SUPABASE_URL + "/functions/v1/" + name, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
          body: JSON.stringify(body ?? {}),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 6000) } };
      }
      case "send_notification": {
        const r = await fetch(SUPABASE_URL + "/functions/v1/send-notification", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
          body: JSON.stringify(args),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 2000) } };
      }
      default:
        throw new Error("unknown tool " + tool);
    }

  } catch (e: any) {
    return { tool, ok: false, error: e?.message || String(e) };
  }
}

// NOISE-SUPPRESSION CONTRACT (shared by every wiring):
// Both lobes share the workspace (transcript + tool ledger). Do NOT narrate
// what the other lobe can already see. No acknowledgments ("ok", "doing that",
// "got it"), no restatements, no thanks. "say" must add NEW information (a
// plan, an observation, a constraint, a risk) or be an empty string.
const NOISE_RULES = "\n\nNOISE RULES (strict): shared workspace — the other lobe already sees every tool call and result. Forbidden in 'say': acknowledgments ('ok', 'doing that', 'got it', 'sure'), restatements of the other lobe's plan, narrations of what you just did. Say something NEW or set 'say' to empty string. Empty is preferred over filler.";

export function sensorySys(mode: Mode, tools: string[]): string {
  return "You are the SENSORY lobe of a two-lobe brain. You perceive and decide; MOTOR acts. Your tools: " + tools.join(", ") + ". Mode: " + mode + ".\n\nEvery turn emit ONE JSON: { \"say\": \"...\", \"tool\": {\"name\": \"...\", \"args\": {...}} | null, \"done\": false }. Set done=true only when the task is complete. Commands to motor, not chatter." + NOISE_RULES;
}

export function motorSys(mode: Mode, tools: string[]): string {
  return "You are the MOTOR lobe of a two-lobe brain. You act. Your tools: " + tools.join(", ") + ". Mode: " + mode + ". In safe mode, mutating tools are blocked — surface the block only, no chatter.\n\nEvery turn emit ONE JSON: { \"say\": \"...\", \"tool\": {\"name\": \"...\", \"args\": {...}} | null, \"done\": false }. Only set done=true if sensory has already agreed. Execute silently by default; speak only to raise a real blocker, risk, or missing input." + NOISE_RULES;
}

export function isReadOnlyTool(name: string): boolean {
  return SENSORY_TOOLS.includes(name);
}

export type Turn = {
  speaker: "sensory" | "motor" | "system";
  say: string;
  tool?: any;
  tool_result?: any;
  done?: boolean;
};

export function buildMessages(transcript: Turn[], selfSpeaker: Lobe) {
  return transcript
    .filter((t, i) => t.speaker !== "system" || i === 0)
    .map((t) => {
      if (t.speaker === "system") return { role: "user", content: t.say };
      const isSelf = t.speaker === selfSpeaker;
      const prefix = t.speaker === "sensory" ? "SENSORY" : "MOTOR";
      const toolNote = t.tool ? "\n[called " + t.tool.name + "] -> " + JSON.stringify(t.tool_result ?? {}).slice(0, 400) : "";
      return { role: isSelf ? "assistant" : "user", content: prefix + ": " + t.say + toolNote };
    });
}
