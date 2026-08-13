// AI TRAFFIC ORGANIZER — the single intersection every model call must cross.
//
// Featherless (and any unit-capped provider) rejects work when the account is
// over its concurrency budget. An in-isolate queue cannot fix that: edge
// functions run in MANY isolates at once, each believing it is alone. So the
// traffic light lives in the database, where all isolates can see it.
//
//   1. Take a ticket   (ai_traffic_enqueue)  — fair, first-come-first-served.
//   2. Wait for green  (ai_traffic_claim)    — only the head of the line, and
//                                              only if units fit the budget.
//   3. Drive           (your fetch)          — lease is heart-beaten meanwhile.
//   4. Leave           (release_ai_slot)     — always, even on failure.
//
// Result: the account is never over budget, so "concurrency limit" stops being
// an error the router has to recover from — it simply never happens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const tsb = () => createClient(SB_URL, SR);

export class TrafficBusyError extends Error {
  constructor(public readonly waitedMs: number) {
    super("ai_traffic_busy: no green light after " + waitedMs + "ms");
  }
}

const HEAVY = /(70b|72b|123b|235b|405b|480b|8x22b)/i;
const MID = /(27b|30b|32b|34b|24b|22b)/i;

/** What one request of this model costs the account, in provider "units". */
export function unitsFor(model: string): number {
  if (HEAVY.test(model)) return 4;
  if (MID.test(model)) return 2;
  return 1;
}

let budgetCache: { budget: number; at: number } | null = null;
const BUDGET_TTL_MS = 60_000;

export async function unitBudget(): Promise<number> {
  if (budgetCache && Date.now() - budgetCache.at < BUDGET_TTL_MS) return budgetCache.budget;
  let budget = Number(Deno.env.get("AI_UNIT_BUDGET") ?? 0) || 0;
  if (!budget) {
    try {
      const { data } = await tsb().from("ai_router_settings").select("unit_budget").eq("id", "default").maybeSingle();
      budget = Number((data as any)?.unit_budget ?? 0) || 6;
    } catch { budget = 6; }
  }
  budgetCache = { budget, at: Date.now() };
  return budget;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type SlotOptions = {
  model: string;
  holder: string;          // who is asking (agent key / function name)
  lane?: string;           // logical lane, for observability
  units?: number;
  maxWaitMs?: number;      // how long to sit at the light before giving up
  ttlSeconds?: number;     // lease length; renewed while the call runs
};

/**
 * Run `fn` while holding a global slot. Never lets the account exceed budget.
 * Throws TrafficBusyError if the light never turned green in time.
 */
export async function withAiSlot<T>(opts: SlotOptions, fn: () => Promise<T>): Promise<T> {
  const s = tsb();
  const units = opts.units ?? unitsFor(opts.model);
  const budget = await unitBudget();
  const ttl = opts.ttlSeconds ?? 180;
  const maxWait = opts.maxWaitMs ?? 90_000;
  const started = Date.now();

  // 1. Take a ticket.
  let ticket: string | null = null;
  try {
    const { data } = await s.rpc("ai_traffic_enqueue", {
      p_holder: opts.holder, p_lane: opts.lane ?? null,
      p_units: Math.min(units, budget), p_model: opts.model,
    });
    ticket = (data as string) ?? null;
  } catch { /* if the organizer itself is down, do not block the business */ }

  if (!ticket) return await fn();

  // 2. Wait for green.
  let lease: string | null = null;
  let delay = 250;
  try {
    while (Date.now() - started < maxWait) {
      const { data } = await s.rpc("ai_traffic_claim", {
        p_ticket: ticket, p_model: opts.model,
        p_units: Math.min(units, budget), p_budget: budget,
        p_holder: opts.holder, p_ttl_seconds: ttl,
      });
      if (data) { lease = data as string; break; }
      await sleep(delay + Math.floor(Math.random() * 200));
      delay = Math.min(Math.round(delay * 1.6), 4000);
    }

    if (!lease) {
      await s.rpc("ai_traffic_dequeue", { p_id: ticket }).catch?.(() => {});
      throw new TrafficBusyError(Date.now() - started);
    }

    // 3. Drive, keeping the lease alive so a slow model never looks abandoned.
    const heartbeat = setInterval(() => {
      s.rpc("renew_ai_slot", { p_id: lease, p_ttl_seconds: ttl }).then(() => {}, () => {});
    }, Math.max((ttl * 1000) / 3, 20_000));
    try {
      return await fn();
    } finally {
      clearInterval(heartbeat);
    }
  } finally {
    // 4. Always leave the intersection.
    if (lease) { try { await s.rpc("release_ai_slot", { p_id: lease }); } catch { /* lease expires anyway */ } }
    else { try { await s.rpc("ai_traffic_dequeue", { p_id: ticket }); } catch { /* ticket expires anyway */ } }
  }
}

/** Live picture of the intersection: what is driving, what is waiting. */
export async function trafficStatus(): Promise<Record<string, unknown>> {
  try {
    const { data } = await tsb().rpc("ai_traffic_status");
    const budget = await unitBudget();
    return { ok: true, budget, ...(data as Record<string, unknown> ?? {}) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
