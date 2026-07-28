## Goal

Extend the Dual-Lobe runtime with four stackable add-on layers, then run a head-to-head benchmark:

- **A** — Single LLM (baseline, no lobes)
- **B** — Dual-Lobe base (no add-ons)
- **C** — Dual-Lobe + selected add-ons

## Add-on modules (all optional, toggleable)

1. **Persistent Session** — every run resumes prior `foundry_runs` state for the same `(agent, thread)`; Strategist receives last N step summaries so plans continue mid-flight instead of restarting.
2. **Persistent Fixed Memory** — long-term facts pinned by the agent (`agent_id`, `key`, `value`, `pinned=true`). Never auto-decays. Injected verbatim into Strategist prompt.
3. **Memory Finetune & Retire** — background pass that:
   - promotes frequently-hit episodic memories into fixed memory (finetune),
   - demotes/archives stale or contradicted ones (retire),
   - runs on `pg_cron` every hour.
4. **Active Sensory Exploration** — before the first Strategist turn on an unfamiliar task, Executor runs a bounded "look around" loop: lists tables it can read, lists edge functions it can call, reads README-like rows/docs, and returns an *environment brief* the Strategist consumes. Cached per `(agent, environment_hash)`.

Cerebellum (skills store) from the previous turn stays as its own add-on — orthogonal to these four.

## Data model

```sql
persistent_sessions(agent_id, thread_key, last_run_id, rolling_summary, updated_at)
fixed_memories(id, agent_id, key, value, pinned bool, hit_count int, created_at, last_used_at)
episodic_memories(id, agent_id, content, embedding, hit_count, score, created_at, last_used_at, retired_at)
env_briefs(agent_id, environment_hash, brief jsonb, generated_at)
lobe_benchmark_runs(id, task_id, arm text CHECK (arm IN ('single','dual','dual_plus')),
                    addons text[], score jsonb, transcript jsonb, duration_ms, created_at)
```

All tables: GRANTs + RLS (admin read; service_role all).

## Runtime changes (`supabase/functions/_shared/lobe-runtime.ts`)

- New `LobeConfig` fields: `persistentSession`, `fixedMemory`, `memoryLifecycle`, `activeSensory`, `cerebellum` (all bool).
- New pipeline hooks:
  - `beforeStrategize` → load session summary + fixed memories + env brief.
  - `afterExecute` → write episodic memory + update session summary + record skill candidate.
- Single-LLM arm: bypass both lobes, one call with the raw task.

## Benchmark surface (`/admin/dual-lobe` new tab **"3-Way Arena"**)

For each of the existing 5 Scaling Suite tests, run all three arms in parallel and render:

- correctness, steps used, wall-clock, token cost
- diff view of Strategist plans A vs B vs C
- add-on toggle matrix so we can isolate which layer helped

Leaderboard aggregates across the suite; export CSV for the war-room.

## Edge functions

- `dual-lobe-agent` — accept `arm` + `addons[]`.
- `memory-lifecycle-tick` — hourly cron: finetune/retire pass.
- `sensory-scan` — internal helper the Executor calls when Active Sensory is on.

## Out of scope (this pass)

- Cross-agent memory sharing (per-agent only for now).
- Cerebellum skill compilation (already scaffolded; keep as separate toggle, no changes here).
- Rewriting Builder or v60 architecture — untouched per standing rule.

## Deliverable order

1. Migrations (5 tables + GRANTs/RLS + cron).
2. Runtime hooks + `arm` routing.
3. Sensory-scan + memory-lifecycle edge functions.
4. "3-Way Arena" tab with matrix toggles and leaderboard.
5. Seed the 5 Scaling tests into `lobe_benchmark_runs` and run once end-to-end to validate.

Approve and I'll build in that order.