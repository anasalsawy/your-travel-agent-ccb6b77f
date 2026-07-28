// Add-on layers stacked on top of the Dual-Lobe base runtime.
// Every add-on is optional; removing any leaves a working dual-lobe agent.
//
//   persistentSession → resume prior rolling_summary for (agent, thread_key)
//   fixedMemory       → inject pinned long-term facts into Strategist prompt
//   activeSensory     → run bounded env scan, cache brief by env hash
//   cerebellum        → surface previously-compiled skills matching task
//
// The memory-lifecycle worker (separate cron) promotes/retires episodic
// memories; this file only reads them.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = () => createClient(SUPABASE_URL, SERVICE_ROLE);

export type AddonFlags = {
  persistentSession?: boolean;
  fixedMemory?: boolean;
  activeSensory?: boolean;
  cerebellum?: boolean;
};

export type PreflightBundle = {
  agentId: string;
  threadKey: string;
  addons: AddonFlags;
  fixedFacts: string[];
  sessionSummary: string;
  envBrief: string;
  skillHints: string[];
};

const ENV_HASH_V = "v1"; // bump when the built-in env-scan surface changes

// ── Preflight (before first Strategist turn) ────────────────────────
export async function preflight(
  agentId: string,
  threadKey: string,
  task: string,
  addons: AddonFlags,
): Promise<PreflightBundle> {
  const bundle: PreflightBundle = {
    agentId, threadKey, addons,
    fixedFacts: [], sessionSummary: "", envBrief: "", skillHints: [],
  };
  const s = sb();

  if (addons.fixedMemory) {
    try {
      const { data } = await s.from("fixed_memories")
        .select("key,value").eq("agent_id", agentId).eq("pinned", true).limit(20);
      bundle.fixedFacts = (data ?? []).map((r: any) => `- ${r.key}: ${r.value}`);
    } catch { /* soft-fail */ }
  }

  if (addons.persistentSession) {
    try {
      const { data } = await s.from("persistent_sessions")
        .select("rolling_summary,turn_count").eq("agent_id", agentId).eq("thread_key", threadKey).maybeSingle();
      bundle.sessionSummary = data?.rolling_summary ?? "";
    } catch { /* soft-fail */ }
  }

  if (addons.activeSensory) {
    try {
      const { data } = await s.from("env_briefs")
        .select("brief").eq("agent_id", agentId).eq("environment_hash", ENV_HASH_V).maybeSingle();
      if (data?.brief) {
        bundle.envBrief = typeof data.brief === "string" ? data.brief : JSON.stringify(data.brief);
      } else {
        // First run for this agent: perform a bounded scan and cache it.
        const brief = await scanEnvironment();
        bundle.envBrief = JSON.stringify(brief);
        await s.from("env_briefs").upsert({
          agent_id: agentId, environment_hash: ENV_HASH_V, brief,
        }, { onConflict: "agent_id,environment_hash" });
      }
    } catch { /* soft-fail */ }
  }

  if (addons.cerebellum) {
    try {
      const tokens = task.toLowerCase().split(/\W+/).filter(w => w.length > 4).slice(0, 6);
      if (tokens.length) {
        const { data } = await s.from("episodic_memories")
          .select("content,tags,hit_count")
          .eq("agent_id", agentId)
          .is("retired_at", null)
          .overlaps("tags", tokens)
          .order("hit_count", { ascending: false })
          .limit(5);
        bundle.skillHints = (data ?? []).map((r: any) => `- ${r.content}`);
      }
    } catch { /* soft-fail */ }
  }

  return bundle;
}

// Compose add-on sections that Strategist system prompt should carry.
export function buildAddonPrompt(b: PreflightBundle): string {
  const parts: string[] = [];
  if (b.addons.fixedMemory && b.fixedFacts.length) {
    parts.push("PINNED FACTS (long-term memory — always true):\n" + b.fixedFacts.join("\n"));
  }
  if (b.addons.persistentSession && b.sessionSummary) {
    parts.push("PRIOR SESSION SUMMARY (continue from here):\n" + b.sessionSummary);
  }
  if (b.addons.activeSensory && b.envBrief) {
    parts.push("ENVIRONMENT BRIEF (cached scan):\n" + b.envBrief.slice(0, 2000));
  }
  if (b.addons.cerebellum && b.skillHints.length) {
    parts.push("CEREBELLUM — matching skills from prior successes:\n" + b.skillHints.join("\n"));
  }
  return parts.length ? "\n\n" + parts.join("\n\n") + "\n" : "";
}

// ── Postflight (after run completes) ────────────────────────────────
export async function postflight(
  b: PreflightBundle,
  outcome: { runId: string; ok: boolean; summary: string; task: string; ledger: any[] },
): Promise<void> {
  const s = sb();

  if (b.addons.persistentSession) {
    try {
      const nextSummary = (b.sessionSummary + "\n" + `[${new Date().toISOString().slice(0, 16)}] ${outcome.ok ? "OK" : "FAIL"}: ${outcome.summary}`).slice(-2000);
      await s.from("persistent_sessions").upsert({
        agent_id: b.agentId, thread_key: b.threadKey,
        last_run_id: outcome.runId, rolling_summary: nextSummary,
        turn_count: (outcome.ledger?.length ?? 0),
        updated_at: new Date().toISOString(),
      }, { onConflict: "agent_id,thread_key" });
    } catch { /* soft-fail */ }
  }

  if (b.addons.cerebellum && outcome.ok) {
    try {
      const tags = outcome.task.toLowerCase().split(/\W+/).filter(w => w.length > 4).slice(0, 6);
      const successfulTools = (outcome.ledger ?? [])
        .filter((e: any) => e.kind === "tool_executed" && e.ok !== false)
        .map((e: any) => e.tool).filter(Boolean).slice(0, 8);
      if (successfulTools.length) {
        await s.from("episodic_memories").insert({
          agent_id: b.agentId,
          content: `Task pattern: "${outcome.task.slice(0, 120)}" — solved via [${successfulTools.join(" → ")}]`,
          tags,
          hit_count: 1,
          score: 1,
        });
      }
    } catch { /* soft-fail */ }
  }
}

// ── Bounded environment scan ─────────────────────────────────────────
async function scanEnvironment(): Promise<any> {
  const s = sb();
  const brief: any = { at: new Date().toISOString(), tables: {}, functions: [] };
  const probes = [
    "war_room_messages", "war_room_tasks", "war_room_heartbeats",
    "agent_room_messages", "documents",
  ];
  for (const t of probes) {
    try {
      const { count } = await s.from(t).select("*", { count: "exact", head: true });
      brief.tables[t] = { exists: true, approx_rows: count ?? 0 };
    } catch { brief.tables[t] = { exists: false }; }
  }
  brief.functions = [
    "duffel-search", "send-notification", "chat",
    "dual-lobe-agent", "single-lobe-agent",
    "sensory-scan", "memory-lifecycle-tick",
  ];
  return brief;
}
