// Dialogue Bus — the PARALLEL LANE.
//
// Orchestration has two lanes that must never block each other:
//
//   EXECUTION LANE   sense → decide → act → patch state.  Latency-critical.
//   DIALOGUE LANE    narration, peer critique, telemetry, memory write-back.
//                    Valuable, but nobody should wait on it.
//
// Every dialogue/event write is buffered in memory, coalesced into batch
// inserts, and flushed off the critical path (microtask + EdgeRuntime.waitUntil
// so the isolate stays alive until the buffer drains). If the bus fails, the
// execution lane is unaffected — talk is cheap and never fatal.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const client = createClient(SUPABASE_URL, SERVICE_ROLE);

type Row = Record<string, unknown>;

const keepAlive = (p: Promise<unknown>) => {
  try {
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(p);
  } catch { /* local runtime: the microtask is enough */ }
  return p;
};

class Bus {
  private dialogue: Row[] = [];
  private events: Row[] = [];
  private scheduled = false;
  private inflight: Promise<void> = Promise.resolve();
  /** Counters so the orchestrator can prove the lanes stayed separated. */
  public stats = { queued: 0, flushed: 0, failed: 0, flushes: 0 };

  say(
    missionId: string | null,
    from: string,
    content: string,
    opts: { to?: string; lobe?: string; kind?: string; meta?: Record<string, unknown> } = {},
  ) {
    this.dialogue.push({
      mission_id: missionId,
      from_agent: from,
      to_agent: opts.to ?? null,
      lobe: opts.lobe ?? null,
      kind: opts.kind ?? "say",
      content: String(content ?? "").slice(0, 4000),
      meta: opts.meta ?? {},
    });
    this.stats.queued++;
    this.schedule();
  }

  emit(
    missionId: string | null,
    agentKey: string | null,
    type: string,
    summary: string,
    detail: Record<string, unknown> = {},
  ) {
    this.events.push({
      mission_id: missionId,
      agent_key: agentKey,
      event_type: type,
      summary: String(summary ?? "").slice(0, 500),
      detail,
    });
    this.stats.queued++;
    this.schedule();
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    // Fire on the next microtask: the caller returns immediately.
    queueMicrotask(() => {
      this.scheduled = false;
      this.inflight = keepAlive(this.inflight.then(() => this.flush())) as Promise<void>;
    });
  }

  private async flush() {
    const d = this.dialogue.splice(0);
    const e = this.events.splice(0);
    if (!d.length && !e.length) return;
    this.stats.flushes++;
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < d.length; i += 100) jobs.push(client.from("ao_dialogue").insert(d.slice(i, i + 100)));
    for (let i = 0; i < e.length; i += 100) jobs.push(client.from("ao_events").insert(e.slice(i, i + 100)));
    const out = await Promise.allSettled(jobs);
    for (const r of out) {
      if (r.status === "rejected" || (r.value as { error?: unknown })?.error) this.stats.failed++;
    }
    this.stats.flushed += d.length + e.length;
  }

  /** Drain before the response is returned so the UI sees a consistent bus. */
  async drain() {
    await this.inflight;
    await this.flush();
    await this.inflight;
  }
}

export const bus = new Bus();

/** Bounded-concurrency map: run missions/agents in parallel without stampeding. */
export async function pool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Start work now, hand back a getter — used to overlap dialogue with execution. */
export function spawn<T>(p: Promise<T>): Promise<T> {
  const guarded = p.catch((e) => ({ __error: (e as Error).message } as unknown as T));
  keepAlive(guarded);
  return guarded;
}
