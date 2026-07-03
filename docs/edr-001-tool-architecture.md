# EDR-001 — Long-Term Tool Architecture for the Autonomous Council

**Status:** Proposed (analysis only, no code changes)
**Date:** 2026-07-03
**Baseline:** BUILDEROFAGENTS v60 (green under Service Principal, `AzureMCPServer` detached)
**Author:** Lovable, on behalf of Chief of Staff
**Scope:** Every tool surface used by the council. Not a bugfix — a durability plan.

---

## 0. Guiding principles

1. **Every tool is replaceable.** No capability may have exactly one implementation.
2. **Service-principal first.** If a tool cannot run under an application identity, it is not a primary tool.
3. **Autonomy over ergonomics.** MCP is convenient for humans in Copilot; the council optimizes for *unattended* execution.
4. **Observability is a tool.** Anything we can't see in Postgres didn't happen.
5. **Bridge owns the contract.** `foundry-agent-run` is the abstraction seam — swapping an underlying vendor must never require re-patching every agent.
6. **Graceful degradation.** Primary → Fallback → Emergency, declared per capability, exercised in drills.

---

## 1. Current Builder tool audit

Baseline snapshot from Builder v60 (`backup 3eaa837a-…`). Each row is one tool the Builder can call today.

| # | Tool | Purpose | Impl today | Auth | SP-safe? | Autonomous? | Primary failure modes |
|---|---|---|---|---|---|---|---|
| 1 | `code_interpreter` | Sandboxed Python for planning/math | Foundry built-in | Project MI | ✅ | ✅ | Cold-start, 30s cap, no net |
| 2 | `file_search` | RAG over Foundry-attached files | Foundry built-in | Project MI | ✅ | ✅ | Vector store staleness |
| 3 | `browserautomation_7823f5` | UI automation (shopping, IVR breakout) | Foundry Browser tool (ApiKey conn) | API key | ✅ | ⚠️ flaky | Session lockouts, captcha, tool timeout |
| 4 | `AzureMCPServer` (**detached in v60**) | Query/mutate Azure resources | Foundry hosted MCP → Azure MCP | Project MI **but requires user-scoped audience** | ❌ (missing `audience`) | ❌ | Token acquisition fails; poisons whole run |
| 5 | GitHub via APIM MCP (**detached**) | Repo read/PR/issue ops | Hosted MCP behind APIM, user OAuth | User OAuth | ❌ | ❌ | 400 tool_user_error under SP |
| 6 | FoundryMCPServerpreview (**detached**) | Introspect Foundry itself | Hosted MCP, user-bound | User OAuth | ❌ | ❌ | Same as above |
| 7 | Bing Search (**detached**) | Web search | Foundry connector, user-bound | User OAuth | ❌ | ❌ | Same as above |
| 8 | `war_room_post` | Post to Postgres war room | Local function via bridge | Service role JWT | ✅ | ✅ | Bridge outage, DB outage |
| 9 | `war_room_heartbeat` | Liveness beacon | Local function via bridge | Service role JWT | ✅ | ✅ | Same |
| 10 | `vapi_call` / `_inject` / `_hangup` / `_status` | Outbound voice | Local functions → Vapi REST | Vapi private key | ✅ | ✅ | Vapi outage, number blocked, STT drift |

**Diagnosis:** Only rows 1–3 and 8–10 survive the SP probe. Rows 4–7 are structurally incompatible with autonomous execution *as currently wired*. That is not a temporary bug — it's an identity-model mismatch (see §3).

---

## 2. Capability dependency graph

```
                  ┌───────────────────────┐
                  │  Chief of Staff (LLM) │
                  └──────────┬────────────┘
                             │  war-room tick (pg_cron → pg_net)
                             ▼
                 ┌─────────────────────────┐
                 │  foundry-agent-run      │  ← the ONLY abstraction seam
                 │  (bridge / tool router) │
                 └───┬───────┬───────┬─────┘
                     │       │       │
        ┌────────────┘       │       └──────────────┐
        ▼                    ▼                      ▼
  Azure surface        GitHub surface         Browser surface
  P: REST + SDK        P: GitHub App          P: Playwright (self-host)
  F: az CLI (fn)       F: REST + PAT          F: Foundry Browser tool
  E: Portal via Playwright  E: Playwright     E: Human handoff

  Phone: P Vapi → F Twilio Programmable Voice → E Human
  Search: P Brave/SerpAPI REST → F Bing Web Search REST → E Playwright DDG
  Memory: P Postgres (war_room_*, foundry_runs) → F pgvector RAG → E JSONL on disk
  Scheduler: P pg_cron+pg_net → F GitHub Actions cron → E external uptime pinger
  Secrets: P Supabase Vault/env → F Azure Key Vault (SP) → E sealed .env
  Deploy: P Supabase CLI in CI → F direct API deploy → E manual push
  Monitoring: P foundry_runs+war_room_cron_log+autonomy-audit → F Grafana on PG → E email digest
```

Every branch has ≥2 implementations. The bridge is the single point that must never regress; it has no vendor-specific code, only a tool dispatch table.

---

## 3. Deep dive — Azure MCP

### 3.1 What actually failed on v59

`AzureMCPServer` was configured with `AuthType=ProjectManagedIdentity`. On the first tool discovery, Foundry's MCP client tries to mint a token for the downstream Azure MCP endpoint and rejects the connection with:

> Managed Identity token acquisition failed: required `audience` parameter is missing.

### 3.2 Is it a config defect, a platform limit, or deprecation?

Evidence gathered:

- Azure MCP Server (github.com/Azure/azure-mcp) is **public preview**, updated frequently, and its Foundry connector wrapper is younger still.
- The connector schema in Foundry (as of the API version we use, `v1`) exposes `AuthType`, `Target`, `Credentials` — but the MI branch in the portal UI *silently* omits the `audience` field that the runtime demands. Setting `audience` via API works, but only for MI tokens whose object ID has been granted `user_impersonation` on the target — which for Azure MCP is the ARM audience (`https://management.azure.com`).
- The Azure MCP server itself, when hosted, defers to the *caller's* credential to hit ARM. That means even with a valid MI token to the MCP endpoint, the downstream ARM calls execute as the MCP host's identity, not the council's SP, unless On-Behalf-Of flow is configured — which requires a *user* assertion.

**Verdict:** Not deprecated, not a plain config bug. It is a **platform limitation for unattended execution**: hosted Azure MCP was designed for a signed-in developer in VS Code / Copilot, not for a service principal running headless. The `audience` gap is a symptom; even after fixing it, OBO would still block a fully autonomous run.

### 3.3 Should we keep Azure MCP?

**No, not as primary.** MCP's value is *human tool discovery inside an IDE*. The council doesn't need discovery — it needs deterministic, auditable calls. Every Azure operation the Builder needs is available directly via ARM REST, Microsoft Graph, or the Azure SDK, all of which accept a client-credentials token today (proven by `azure-rest` edge function, running green for weeks).

**Recommendation:** Demote `AzureMCPServer` to **experimental** (kept detached). Promote our existing `azure-rest` proxy to the Builder's Azure surface via a small set of **function tools** (below). Revisit Azure MCP only once Microsoft ships an application-identity, non-OBO variant.

---

## 4. Per-capability recommendations

For each: primary, fallback, emergency, advantages, disadvantages, migration effort (S/M/L), operational risk.

### 4.1 Azure control plane
- **Primary:** Function tools in the bridge that wrap `azure-rest` (`azure_arm_get`, `azure_arm_action`, `azure_graph_query`).
  - + SP-native, cached tokens, already in prod, every call logged to `foundry_runs.steps`.
  - − We own the surface area; must expose new verbs as needed.
- **Fallback:** `az` CLI inside a code_interpreter shell (or an `azure_cli` function tool shelling out from a sidecar). Slower, but covers long-tail commands.
- **Emergency:** Playwright against portal.azure.com with SP-backed cookie mint (fragile; last resort).
- **Migration:** **S.** Add 3 function tools; delete `AzureMCPServer` from Builder tools[].
- **Long-term:** Owned function tools over ARM/Graph. Kill MCP dependency here.

### 4.2 GitHub
- **Primary:** **GitHub App installation token** (`github_repo_read`, `github_pr_open`, `github_issue_write` function tools). Installation-scoped, rotates automatically, no user in the loop.
  - + Real app identity, per-repo permissions, audit log.
  - − One-time App registration + install per org.
- **Fallback:** GitHub REST with fine-grained PAT stored in Vault (owner-scoped, 90-day rotation).
- **Emergency:** Playwright against github.com with a headless bot account.
- **Migration:** **M** (register App, wire JWT→installation-token minting in bridge).
- **Long-term:** GitHub App. Remove APIM MCP entirely.

### 4.3 Browser
- **Primary:** **Self-hosted Playwright** worker (containerized, Chromium, video + trace on every run), invoked via `browser_run` function tool that posts to a small `browser-worker` edge/container service.
  - + Full control, deterministic, screenshots straight to Storage, no vendor lock.
  - − We operate the fleet; captcha and fingerprinting are our problem.
- **Fallback:** Foundry `browserautomation` tool (current v60 tool, ApiKey — keep).
- **Emergency:** Human handoff via War Room `NUDGE` task with a shareable URL.
- **Migration:** **M–L** (stand up worker + storage, port shopper flows).
- **Long-term:** Own the browser. Vendor browsers change SLA and pricing quarterly.

### 4.4 Database / state
- **Primary:** Supabase Postgres (already truth layer for autonomy).
- **Fallback:** Nightly `pg_dump` to object storage; read replica.
- **Emergency:** Local SQLite snapshot of last-known state for read-only degraded mode.
- **Migration:** **S** (add dump cron).
- **Long-term:** Keep. Postgres is the least replaceable and most portable piece.

### 4.5 Foundry (agent runtime)
- **Primary:** Azure AI Foundry Responses/Conversations API via bridge (current).
- **Fallback:** Direct model calls (OpenAI / Anthropic / Lovable AI Gateway) with our own tool loop in the bridge — the bridge already implements the loop, so this is a config swap.
- **Emergency:** Single-shot Lovable AI Gateway prompt with no tools (degraded but alive).
- **Migration:** **M** to fully productionize the direct-model path.
- **Long-term:** Keep Foundry, but ensure the bridge's tool loop is model-agnostic so any provider works.

### 4.6 War Room
- **Primary:** `war_room_messages` + `_tasks` + `_heartbeats` in Postgres (current).
- **Fallback:** Same tables replicated to a second project.
- **Emergency:** JSONL append log written by the bridge.
- **Migration:** **S**.
- **Long-term:** Keep. It *is* the observability substrate.

### 4.7 Scheduler
- **Primary:** `pg_cron` + `pg_net` (current, proven by close-tab test).
- **Fallback:** GitHub Actions cron hitting a `/tick` webhook.
- **Emergency:** External uptime monitor (cron-job.org, UptimeRobot) pinging `/tick`.
- **Migration:** **S** (define the two fallbacks; leave dormant).
- **Long-term:** Keep pg_cron, document the two backups.

### 4.8 Memory
- **Primary:** Structured tables (`maya_customer_memory`, `agent_memory_cache`, `foundry_runs.steps`).
- **Fallback:** `document_chunks` + pgvector RAG (already present).
- **Emergency:** File-search on Foundry-attached JSONL exports.
- **Migration:** **S**.
- **Long-term:** Owned in Postgres; RAG is additive, never authoritative.

### 4.9 Phone
- **Primary:** Vapi (current).
- **Fallback:** Twilio Programmable Voice + our TTS/STT (voice-proxy-* functions already exist).
- **Emergency:** War Room task → human dials.
- **Migration:** **M** (parity work on Twilio path).
- **Long-term:** Dual-provider, choose per-route by cost/latency.

### 4.10 Shopping
- **Primary:** Playwright worker (see 4.3) with shopper profile + burner card.
- **Fallback:** Merchant REST APIs where they exist (Amazon SP-API, Shopify Storefront).
- **Emergency:** Concierge call + human checkout.
- **Migration:** **L** (per-merchant adapters).
- **Long-term:** API where available, browser where not, human as safety.

### 4.11 Deployment
- **Primary:** Supabase CLI in CI (GitHub Actions) with SP-minted service role.
- **Fallback:** Direct deploy API from bridge (already used by `foundry-connections`).
- **Emergency:** Manual push from operator laptop.
- **Migration:** **S** (formalize CI pipeline).
- **Long-term:** CI as primary; bridge deploy as break-glass.

### 4.12 Secrets
- **Primary:** Supabase env (current).
- **Fallback:** Azure Key Vault, SP-read, cached in bridge.
- **Emergency:** Sealed `.env` in ops runbook.
- **Migration:** **M** for Key Vault mirror.
- **Long-term:** Dual store; Key Vault is the durable canonical, Supabase env is the fast path.

### 4.13 Monitoring
- **Primary:** `/admin/autonomy-audit` reading Postgres (current).
- **Fallback:** Grafana on Postgres read replica.
- **Emergency:** Daily email digest built by an edge function.
- **Migration:** **S**.
- **Long-term:** Keep autonomy audit; add Grafana once traffic warrants.

---

## 5. Cross-cutting rules for the bridge

The council's durability depends on `foundry-agent-run` staying vendor-agnostic:

1. **Tool dispatch table** — every tool is a `{ name, handler, auth }` triple. Swap handlers without touching agent prompts.
2. **Every tool call writes a step** to `foundry_runs.steps` with duration, result summary, and (on failure) full error. No silent success.
3. **Per-tool circuit breaker** — after N consecutive failures, the bridge auto-routes to the declared fallback and posts a NUDGE.
4. **Idempotency keys** on any tool with side effects (bookings, purchases, deploys).
5. **No hosted-MCP tools that require user OAuth.** If a capability only exists as a user-bound MCP, wrap it as a function tool backed by REST — do not attach it to any agent.

---

## 6. Migration plan (proposed order, no execution yet)

| Phase | Work | Effort | Unlocks |
|---|---|---|---|
| **P0** (now) | Keep v60. Document EDR (this file). | – | Baseline frozen |
| **P1** | Add `azure_arm_*` function tools; formally deprecate `AzureMCPServer`. | S | Builder gets full Azure control without MCP |
| **P2** | Register GitHub App; add `github_*` function tools; retire APIM MCP. | M | SP-native GitHub |
| **P3** | Stand up self-hosted Playwright worker; port shopper. | M–L | Vendor-independent browser |
| **P4** | Dual-write secrets to Key Vault; nightly PG dump; Twilio voice parity. | M | Vendor independence for secrets/phone |
| **P5** | Model-agnostic tool loop path in bridge (Lovable AI Gateway fallback). | M | Foundry outage survivable |
| **P6** | Circuit breakers + idempotency keys in bridge; drill quarterly. | S | Automated failover |

Each phase is independently deployable and independently reversible. Nothing in P1–P6 touches `YTA-ASSISTANT`.

---

## 7. Decision

**Approved direction (pending your sign-off):**

- The council standardizes on **owned function tools over vendor REST/SDK APIs**, brokered through the bridge, with hosted MCP retained only for interactive human sessions — never on autonomous agents.
- Azure MCP is **not** the long-term Azure surface. ARM + Graph via `azure-rest` is.
- Every capability has a declared **P/F/E ladder** and appears on the autonomy audit.
- The bridge, Postgres, and pg_cron are the three components the council cannot lose; everything else is swappable.

Awaiting your go/no-go before starting P1.
