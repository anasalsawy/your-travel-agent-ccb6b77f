// Shared runtime for lobe wiring experiments.
// Every dual-lobe variant reuses these tools, allowlists, and the LLM helper.
// The variation lives in each function's dispatch loop, not the primitives.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const ALLOWLIST_TABLES = new Set([
  "war_room_messages", "war_room_tasks", "war_room_heartbeats",
  "agent_room_messages", "agent_rooms", "notification_log", "documents",
]);

export const SENSORY_TOOLS = ["db_read", "list_tables", "list_edge_functions", "http_get", "tool_registry"];
export const MOTOR_TOOLS = ["db_write", "http_post", "invoke_edge_function", "send_notification", "http_get"];

export const DEFAULT_MODEL = "google/gemini-2.5-flash";

export type Lobe = "sensory" | "motor";
export type Mode = "safe" | "full";

export async function llm(
  system: string,
  messages: Array<{ role: string; content: string }>,
  model: string,
  opts?: { temperature?: number; max_tokens?: number },
): Promise<string> {
  const body: any = {
    model,
    messages: [{ role: "system", content: system }, ...messages],
    response_format: { type: "json_object" },
    temperature: opts?.temperature ?? 0.4,
  };
  if (opts?.max_tokens) body.max_tokens = opts.max_tokens;
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_KEY },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("LLM " + r.status + ": " + (await r.text()).slice(0, 300));
  const j = await r.json();
  return j.choices?.[0]?.message?.content ?? "{}";
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
        return { tool, ok: true, result: { sensory: SENSORY_TOOLS, motor: MOTOR_TOOLS, tables: [...ALLOWLIST_TABLES] } };
      case "list_tables":
        return { tool, ok: true, result: { allowlisted: [...ALLOWLIST_TABLES] } };
      case "list_edge_functions":
        return { tool, ok: true, result: { functions: ["duffel-search", "send-notification", "chat", "war-room"] } };
      case "db_read": {
        const { table, select = "*", eq, limit = 20 } = args;
        if (!ALLOWLIST_TABLES.has(table)) throw new Error("table " + table + " not allowlisted");
        let q = supabase.from(table).select(select).limit(Math.min(limit, 100));
        if (eq && typeof eq === "object") for (const [k, v] of Object.entries(eq)) q = q.eq(k, v as any);
        const { data, error } = await q;
        if (error) throw error;
        return { tool, ok: true, result: { rows: data } };
      }
      case "http_get": {
        const { url, headers } = args;
        if (!url) throw new Error("url required");
        const r = await fetch(url, { headers: headers || {} });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
      }
      case "db_write": {
        if (mode !== "full") throw new Error("db_write blocked in safe mode");
        const { table, op = "insert", values, eq } = args;
        if (!ALLOWLIST_TABLES.has(table)) throw new Error("table " + table + " not allowlisted");
        if (op === "insert") {
          const { data, error } = await supabase.from(table).insert(values).select();
          if (error) throw error;
          return { tool, ok: true, result: { inserted: data } };
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
      case "http_post": {
        const { url, headers, body } = args;
        if (!url) throw new Error("url required");
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(headers || {}) },
          body: typeof body === "string" ? body : JSON.stringify(body ?? {}),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
      }
      case "invoke_edge_function": {
        if (mode !== "full") throw new Error("invoke_edge_function blocked in safe mode");
        const { name, body } = args;
        const r = await fetch(SUPABASE_URL + "/functions/v1/" + name, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + SERVICE_ROLE },
          body: JSON.stringify(body ?? {}),
        });
        return { tool, ok: r.ok, result: { status: r.status, body: (await r.text()).slice(0, 3000) } };
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
  return "You are the SENSORY lobe of a two-lobe brain. You perceive and decide; MOTOR acts. Your tools: " + tools.join(", ") + ". Allowlisted tables: " + [...ALLOWLIST_TABLES].join(", ") + ". Mode: " + mode + ".\n\nEvery turn emit ONE JSON: { \"say\": \"...\", \"tool\": {\"name\": \"...\", \"args\": {...}} | null, \"done\": false }. Set done=true only when the task is complete. Commands to motor, not chatter." + NOISE_RULES;
}

export function motorSys(mode: Mode, tools: string[]): string {
  return "You are the MOTOR lobe of a two-lobe brain. You act. Your tools: " + tools.join(", ") + ". Allowlisted tables: " + [...ALLOWLIST_TABLES].join(", ") + ". Mode: " + mode + ". In safe mode, mutating tools are blocked — surface the block only, no chatter.\n\nEvery turn emit ONE JSON: { \"say\": \"...\", \"tool\": {\"name\": \"...\", \"args\": {...}} | null, \"done\": false }. Only set done=true if sensory has already agreed. Execute silently by default; speak only to raise a real blocker, risk, or missing input." + NOISE_RULES;
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
