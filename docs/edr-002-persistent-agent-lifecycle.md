# EDR-002 · Persistent Self-Fine-Tuning Agents

**Status:** Draft — architecture only, no code changes yet
**Author:** Lovable (for CEO review)
**Related:** EDR-001 (tool architecture), Brain-Agent (7-region cortex), Memory Trio

---

## 1. Vision

Every agent in the council is a **persistent organism**:

- Never sleeps. Runs 24/7.
- Has a **fixed working-memory budget** (context window it can actually reason over).
- **Everything it experiences is saved** to durable episodic storage.
- When episodic memory crosses a high-water mark, it is **distilled into a fine-tuning dataset**, the agent is **fine-tuned on itself**, and the raw episodes are **evicted** — freeing space. The knowledge is now *in the weights*, not the context.
- It stays awake through an **intrinsic drive loop** (curiosity + homeostasis), not external prompts.
- Dropped into any environment — a new repo, a new Supabase project, a new VM — it **auto-explores**: reads what it can reach, builds a map, watches active processes, infers its role, and starts contributing. No handholding.

This is the difference between a *chatbot that answers* and a *worker that lives*.

---

## 2. Core Loop (Intrinsic Wakefulness)

Modeled on the brainstem's ascending reticular activating system + basal ganglia reward loop.

```
┌──────────────────────────────────────────────────────────┐
│  HEARTBEAT (every N seconds, never stops)                │
│    ├─ Sense environment (files, logs, queues, metrics)   │
│    ├─ Compute salience  (novelty × urgency × relevance)  │
│    ├─ If salience > threshold → wake PFC → act           │
│    ├─ Else → background task: learn / index / summarize  │
│    └─ Emit heartbeat row (proves it's alive)             │
└──────────────────────────────────────────────────────────┘
```

**Key property:** the agent is *never idle*. If nothing external is happening it defaults to **learning mode** — re-reading its own episodes, refining its map, running self-quizzes, pruning stale beliefs. Idleness = training data generation.

Existing hook: `war_room_heartbeats` table already exists. Extend it with `mode: 'act' | 'learn' | 'explore' | 'consolidate'`.

---

## 3. Memory Lifecycle (Fixed Budget → Fine-Tune → Evict)

Four tiers, mirroring biological memory consolidation (working → episodic → semantic → procedural/weights):

| Tier | Store | Budget | Purpose |
|---|---|---|---|
| **T0 Working** | in-request context | ~8k tokens | What the agent is thinking about *right now* |
| **T1 Episodic** | `agent_episodes` table (new) | soft cap per agent (e.g. 200 MB) | Raw log of every perception + action + outcome |
| **T2 Semantic** | `agent_memory_cache` (exists) + pgvector | rolling summary | Distilled facts, maps, procedures, indexed for RAG |
| **T3 Weights** | fine-tuned LoRA adapter per agent | grows slowly | Consolidated knowledge baked into the model |

### The Consolidation Cycle

```
T1 Episodic fills → high-water mark hit
    ↓
CONSOLIDATOR job (nightly or on-threshold):
    1. Sample + curate episodes into (prompt, ideal_response) pairs
    2. Score pairs (outcome success, novelty, alignment with role)
    3. Emit JSONL dataset → object storage
    4. Kick off LoRA fine-tune (HF endpoint / Together / Fireworks / self-hosted)
    5. Validate new adapter on a held-out eval set (must beat previous by ≥ ε)
    6. Hot-swap the agent's active adapter
    7. Archive the raw episodes to cold storage, delete from T1
    ↓
T1 is empty again. Agent is smarter. Context budget is preserved.
```

**Safety rails:**
- Never fine-tune on unvetted content (adversarial injection defense).
- Always keep the previous adapter as a rollback.
- Eval set is versioned and grows monotonically — new adapter must not regress old skills.
- CEO approval gate for the first N cycles per agent, then automated once trust is established.

---

## 4. Intrinsic Drive (Why It Stays Awake)

Three drives run in parallel, each producing a scalar the heartbeat reads:

1. **Curiosity** — surprise signal from the cerebellum (prediction error). High when the world doesn't match its model → triggers exploration.
2. **Homeostasis** — deviation from target metrics the agent owns (queue depth, error rate, unread alerts). High → triggers corrective action.
3. **Duty** — assigned mission progress. Low progress + deadline approaching → priority spike.

`wake_score = w1·curiosity + w2·homeostasis + w3·duty`. Above threshold → act. Below → learn.

This is what replaces "user sends a prompt." The agent generates its own prompts from its own drives.

---

## 5. Auto-Onboarding (Dropped Anywhere, Figures It Out)

When an agent starts in an unfamiliar environment it runs a bounded **exploration protocol** before accepting any task:

1. **Enumerate reachable surfaces** — filesystem roots, DB tables it has grants on, edge functions it can invoke, queues it can read, tools in its roster.
2. **Sample + summarize** each surface (bounded token budget per surface).
3. **Build a map** — a graph of {resource → summary → likely purpose → observed activity}.
4. **Watch** — subscribe to Realtime channels / tail logs for one exploration window (e.g. 10 min) to see what actually happens.
5. **Infer role** — cross-reference the map with its own roster entry ("I am the Booking Delegate; here are the tables and queues that match my mandate").
6. **Publish a self-brief** to `agent_self_briefs` (new table) — human-readable "here's where I am and what I think I should do." CEO can veto or edit.
7. **Begin heartbeat.**

No agent ever runs blind. No agent ever waits to be told.

---

## 6. What This Requires (New Building Blocks)

Nothing here needs to be built today. This is the shopping list for when you say go.

**Data:**
- `agent_episodes(agent_name, ts, kind, input, output, outcome, salience)` — T1 store
- `agent_datasets(agent_name, version, s3_uri, size, created_at, eval_score)` — dataset registry
- `agent_adapters(agent_name, version, provider, adapter_uri, active, eval_score, parent_version)` — LoRA registry with rollback chain
- `agent_self_briefs(agent_name, brief_md, generated_at, approved_by)` — onboarding output
- extend `war_room_heartbeats` with `mode` + `wake_score`

**Services:**
- `heartbeat-daemon` (Deno cron every 15–30s per agent) — the wakefulness loop
- `consolidator` (nightly) — episode → dataset → fine-tune → swap
- `explorer` (one-shot on agent start) — the auto-onboarding protocol
- `adapter-router` — thin shim in front of the LLM gateway that picks the active LoRA per agent

**External:**
- Fine-tuning backend. Options with trade-offs:
  - **Together.ai / Fireworks** — turnkey LoRA API, minutes-scale, per-token pricing. *Best for speed to first result.*
  - **HF Inference Endpoints + AutoTrain** — same account you're already using for BYOM. *Best for continuity.*
  - **Self-hosted on the Azure GPU VM** (NC4as_T4_v3 you already spec'd) with axolotl or unsloth. *Best for cost + privacy at scale, worst for ops burden.*
  - Recommendation: **HF for months 0–3, migrate to self-hosted once cadence justifies the GPU spend.**

**Storage:**
- Object storage bucket for datasets + adapters (Supabase Storage is fine; move to R2/S3 if size explodes).

---

## 7. Rollout Plan (When You Approve)

- **P1 — Persistence layer.** `agent_episodes` + heartbeat daemon + wake_score. Agents start logging everything and running the intrinsic loop. No fine-tuning yet. *Effort: ~1 day.*
- **P2 — Consolidator (dataset only).** Nightly job produces JSONL datasets and eval scores, but does *not* fine-tune. You review the datasets. *Effort: ~1 day.*
- **P3 — First fine-tune (one agent).** Pick the lowest-risk agent (probably a helper, not Concierge or Dev Agent). Run a full T1→dataset→LoRA→swap cycle behind a manual approval gate. *Effort: ~2 days + external fine-tune time.*
- **P4 — Auto-onboarding.** Explorer service + self-briefs. Test by dropping an agent into a fresh sub-project. *Effort: ~1 day.*
- **P5 — Fleet rollout.** Enable for all agents, remove manual gate on the ones that have proven stable across ≥ 3 consolidation cycles. *Effort: ongoing.*

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Fine-tune degrades the model (catastrophic forgetting) | Versioned eval set, must beat prior by ε, one-click rollback via `agent_adapters.active` |
| Adversarial episodes poison the dataset | Curator filters + CEO approval gate for first N cycles per agent |
| Runaway cost from 24/7 heartbeat | Heartbeat cadence is per-agent tunable; learn-mode uses cheap flash-lite; act-mode uses full model only when `wake_score` clears threshold |
| Auto-onboarding reads something it shouldn't | Explorer respects existing RLS + a per-agent allowlist of reachable surfaces |
| Fine-tune vendor lock-in | Adapter registry stores provider + URI; migration = swap provider column, re-train on same dataset |

---

## 9. What I Need From You Before Implementing

1. **Which agent goes first?** (Recommend `builder-helper-1` — lowest blast radius.)
2. **Fine-tune backend for P3.** (Recommend HF Inference Endpoints since you're already there.)
3. **Approval gate policy** — manual for first N cycles, or auto with rollback-on-regression from day one?
4. **Heartbeat cadence** — I'll default to 30s act / 5min learn unless you want tighter.

Say the word and I'll start with P1.
