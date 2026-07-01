# Dual-Lobe Interdependent Agent OS — Builder Spec v1

> One agent with bilateral motor control. Two lobes, one mind, one task identity, one final report. Cooperation is **enforced by architecture, not by prompt**.

---

## 1. First Principles (non-negotiable)

1. **Two lobes, one task-run.** Not a team of agents. Two halves of one mind sharing one task identity.
2. **Tool asymmetry is the architecture.** No tool is ever callable by both lobes. Attempts are hard-rejected by the Tool Router.
3. **Shared memory + shared workspace only.** Everything else is separated: models, contexts, tool surfaces, judgment loops.
4. **No unilateral completion.** Executor cannot declare success. Strategist cannot change the world.
5. **Ask the other lobe before asking the user.** User escalation is gated by the Strategist's exhaustion check.
6. **Structured JSON only** for inter-lobe messages. Free-text degrades over runs.
7. **Enforce with code, don't micromanage with code.** Router / ledger / watchdog are code. Reasoning stays in the model.

---

## 2. Component Inventory

| # | Component | Purpose |
|---|-----------|---------|
| 1 | **Task Orchestrator** | Owns run state, drives the lobe cycle, checkpoints. |
| 2 | **Executor Lobe** | LLM + action-only tool surface. |
| 3 | **Strategist Lobe** | LLM + sense/judge/verify-only tool surface. |
| 4 | **Tool Router** | Enforces non-overlap. Rejects illegal calls with a typed error. |
| 5 | **Shared Workspace** | Task state, files, browser observations, screenshots, artifacts, per-run scratch. |
| 6 | **Shared Memory** | Long-lived: user prefs, prior lessons, reusable procedures, known identities, past failures. |
| 7 | **Permission Ledger** | Append-only record of every intent, permit, denial, action, verification. Source of truth for the report. |
| 8 | **Watchdog** | Detects stall / loop / silence / heartbeat loss and triggers recovery. |
| 9 | **Final Report Generator** | Compiles the required final report from the ledger. |

---

## 3. Tool Distribution (v1)

### Executor-only (change-the-world)
`browser_action`, `form_fill`, `click`, `submit`, `file_write`, `file_edit`, `code_modify`, `shell_execute`, `api_write`, `send_draft`, `create_calendar_event`, `deploy_function`, `run_browser_automation`, `create_artifact`, `book`, `pay`, `delete`.

### Strategist-only (see / judge / validate / gate)
`web_research`, `memory_search`, `task_decomposition`, `risk_classifier`, `policy_checker`, `source_verifier`, `test_runner`, `artifact_validator`, `plan_critic`, `tool_registry_auditor`, `approval_gate`, `stall_detector`, `memory_curator`.

**Rule:** every tool declared in the registry carries an exclusive `owner: "executor" | "strategist"`. The Tool Router hard-rejects any call whose caller does not match `owner`.

### Shared (state, not action)
Read/write to Shared Workspace and Shared Memory only. These are not "tools" — they are the substrate both lobes stand on.

---

## 4. The Four Dependency Locks

| Lock | Gate | Who releases it |
|------|------|-----------------|
| **Planning lock** | Draft plan → active plan | Strategist signs |
| **Action lock** | Intent → external action | Strategist permits |
| **Verification lock** | Action result → success | Strategist verifies |
| **User-escalation lock** | Internal loop → user question | Strategist confirms exhaustion |

If any lock is bypassed in code review, the build is rejected.

---

## 5. Forced Communication Protocol

Every inter-lobe message is a typed JSON envelope validated against a schema before dispatch. Reject on schema failure — do not "best-effort parse".

### Message envelope

```json
{
  "task_id": "string",
  "run_id": "string",
  "seq": 42,
  "from_lobe": "executor | strategist",
  "to_lobe": "strategist | executor",
  "message_type": "action_intent | permit | verify_request | verify_result | plan_draft | plan_review | escalation_request | escalation_verdict | stall_report",
  "payload": { }
}
```

### Payloads

**`action_intent`** (Executor → Strategist)
```json
{
  "proposed_action": "fill booking form passenger details",
  "tool_requested": "browser_action",
  "expected_result": "form completed, not submitted",
  "risk_level_guess": "low | medium | high",
  "needs_external_change": true,
  "executor_confidence": 0.74,
  "evidence_pointers": ["ws://obs/2025-11-30T14:12Z/screenshot-3.png"],
  "question_for_strategist": "Do we have verified passenger names?"
}
```

**`permit`** (Strategist → Executor)
```json
{
  "decision": "permit | revise | block | research_needed",
  "reason": "…",
  "required_evidence": ["shared_memory:passenger.name.verified"],
  "allowed_tools": ["browser_action"],
  "blocked_tools": ["submit_form", "pay"],
  "next_instruction": "…",
  "ttl_seconds": 120
}
```

**`verify_result`** (Strategist → Executor)
```json
{
  "outcome": "success | retry | repair | rollback",
  "evidence": ["…"],
  "notes": "…"
}
```

**`escalation_request`** (Executor → Strategist)
```json
{ "blocker": "…", "attempted_internal_paths": ["…"], "smallest_missing_piece": "…" }
```

**`escalation_verdict`** (Strategist → Executor)
```json
{ "verdict": "solve_internally | use_alternate_tool | create_tool | ask_user",
  "internal_workaround": "…",
  "user_question_if_needed": "…" }
```

---

## 6. The Loop

```text
USER TASK
  ↓
Executor.interpret → Strategist.check_interpretation
  ↓
Executor.plan_draft → Strategist.plan_review → Executor.revise → Strategist.sign
  ↓ (Planning lock released)
loop:
  Executor.action_intent → Strategist.permit / revise / block / research
  ↓ (Action lock released only on `permit`)
  Executor.execute (Tool Router enforces owner)
  ↓
  Strategist.verify → success | retry | repair | rollback
  ↓ (Verification lock released only on `success`)
  Shared Workspace + Memory updated
until Strategist marks run_complete OR watchdog escalates
  ↓
Final Report Generator (reads Permission Ledger)
```

Metaphor: **left step → right balance → left step → right balance.** Not think→act.

---

## 7. Tool Creation Rule

When Executor lacks a tool, it MUST NOT stop. Strategist evaluates in this order and issues a `create_tool` or `use_alternate` verdict:

1. Write a script (shell / node / python) via `code_modify` + `shell_execute`.
2. Deploy an ephemeral function via `deploy_function`.
3. Run in a sandbox VM.
4. Use browser automation as a manual-workflow substitute.
5. Create a temporary manual workaround with clear rollback.
6. Only if all five fail: request a missing **secret or approval** from the user (never a decision the lobes could have made).

---

## 8. Watchdog & Anti-Stall

**Stall signals** (any triggers recovery):
- No new workspace update for `T_stall` (default 90s).
- No inter-lobe message for `T_silence` (default 60s).
- Repeated identical plan hash (n ≥ 2).
- Repeated identical failed tool call (n ≥ 2).
- Executor waiting on a permit past `permit.ttl_seconds`.
- Long-running action missed heartbeat.

**Recovery routine** (code, not prompt):
1. Freeze current action; snapshot Workspace.
2. Summarize last known state into a `stall_report` envelope.
3. Ask opposite lobe: *"smallest recoverable next step?"*.
4. Executor stalled → Strategist issues a reduced action.
5. Strategist stalled → Executor issues a narrower decision request.
6. Both stalled → Watchdog reset-from-checkpoint (last verified ledger entry).
7. Only after internal recovery fails → user escalation.

Heartbeat pattern: model long-running actions as Temporal-style activities that emit periodic heartbeats; missing heartbeats fail the activity and trigger recovery.

---

## 9. Data Model (minimum)

```sql
runs(id pk, task_id, status, started_at, ended_at, final_report_id)
workspace_items(id pk, run_id fk, kind, uri, meta jsonb, created_at)
memory_items(id pk, scope, key, value jsonb, updated_at)     -- long-lived, cross-run
ledger(id pk, run_id fk, seq, from_lobe, to_lobe, message_type, payload jsonb, created_at)
tool_registry(name pk, owner check(owner in ('executor','strategist')), schema jsonb, side_effects bool)
checkpoints(id pk, run_id fk, seq, snapshot jsonb, created_at)
```

Ledger is **append-only**. Checkpoints are taken after every verified success.

---

## 10. Reference Stack (recommended, not mandatory)

- **Runtime:** TypeScript on Node 20 or Deno; long-running work as durable activities (Temporal, Inngest, or Trigger.dev).
- **Orchestration:** LangGraph or a hand-rolled state machine. Persistence: short-term checkpointer + long-term store (LangGraph pattern maps well).
- **LLMs:** two independent model calls per turn. Structured outputs via OpenAI/Gemini strict-schema mode. No "please format as JSON" prompting.
- **Storage:** Postgres for ledger + memory + workspace metadata; object store (S3-compatible) for artifacts and screenshots.
- **Router:** in-process middleware that validates `{caller_lobe, tool_name}` against `tool_registry.owner` before dispatch. Rejection returns a typed `ToolAccessDenied` error the calling lobe must handle in JSON.
- **Observability:** OpenTelemetry spans per ledger entry; single trace per `run_id`.

---

## 11. Final Report (required schema)

```json
{
  "task_requested": "…",
  "task_understood": "…",
  "plan_chosen": "…",
  "strategist_objections": ["…"],
  "actions_completed": [{ "tool": "…", "result": "…", "verified_by": "…" }],
  "tools_used": ["…"],
  "tools_created": ["…"],
  "blockers": ["…"],
  "user_approvals_required": ["…"],
  "next_recommended_move": "…"
}
```

Generator MUST derive every field from the Permission Ledger. No free-text summarization outside the ledger.

---

## 12. Build Milestones (hand to builder)

**M1 — Skeleton (3–4 days)**
- Postgres schema, tool_registry seeded, Tool Router with owner enforcement, ledger append + query.

**M2 — Two lobes online (3–5 days)**
- Executor + Strategist model calls with structured outputs.
- Envelope schemas + validator.
- Planning-lock + Action-lock end-to-end on a trivial task ("write file X with contents Y").

**M3 — Verification & recovery (4–6 days)**
- Verification-lock (Strategist `verify_result`).
- Checkpointer.
- Watchdog with stall signals + recovery routine.

**M4 — Real tool surface (1–2 weeks)**
- Wire actual action tools (browser_action, file ops, api_write, deploy_function).
- Wire actual sense tools (web_research, test_runner, risk_classifier, memory_search).
- Tool-creation rule implemented (Strategist can direct Executor to author + register a new tool at runtime; registration writes to `tool_registry` with an owner).

**M5 — Shared memory + report (3–5 days)**
- Memory curator (Strategist-only).
- Final Report Generator.
- User-escalation lock with exhaustion check.

**M6 — Hardening**
- Golden tests: for each locked path, prove Executor cannot bypass Strategist and vice-versa.
- Chaos tests: kill activities mid-flight; assert checkpoint recovery.
- Property test: no ledger entry exists where `caller_lobe != tool_registry.owner`.

---

## 13. Acceptance Criteria (definition of done for v1)

1. Any Executor call to a Strategist-owned tool returns `ToolAccessDenied` and is logged.
2. No task can reach `status=complete` without at least one Strategist `verify_result.outcome=success` entry per Executor action.
3. No `escalation_request` reaches the user without a preceding Strategist `escalation_verdict.verdict != solve_internally`.
4. Killing the process mid-run and restarting resumes from the last checkpoint without re-executing already-verified actions.
5. Final report is 100% reconstructible from the ledger.

---

## 14. Prior Art (learn, don't copy)

- **Evaluator–Optimizer pattern** (Anthropic "Building effective agents") — closest existing pattern; missing tool asymmetry.
- **ConAgents** (arXiv 2403.03031) — separates selection / execution / calibration across cooperative agents; adopt the separation, keep it to two lobes by folding selection + calibration + verification into Strategist.
- **Tool-RoCo** benchmarks — empirical evidence that "optional" cooperation collapses; motivates architectural enforcement.
- **LangGraph persistence** — short-term checkpoint vs long-term store maps directly to Workspace vs Memory.
- **Temporal activities & heartbeats** — model for durable long actions and stall detection.

---

## 15. What NOT to Build

- No shared tool surface "for convenience".
- No self-approval path for Executor.
- No free-text inter-lobe chat channel alongside the JSON channel.
- No graph so heavy it out-orchestrates the model on procedural tasks — keep code to permissions, checkpoints, gates.
- No third lobe. Two is the shape.

---

*Version 1.0 — hand this document, the schemas in §5, and the milestones in §12 to the builder.*
