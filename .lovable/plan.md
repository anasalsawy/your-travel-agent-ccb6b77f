## Goal
Roll the uploaded 6,096-line Autonomous SWE Agent prompt onto every Foundry agent, then layer per-agent role/tools/teammates on top. Add a shared `vapi_call` toolset that any agent can use, with an inline live-transcript + steer panel that pops in whenever a call is active.

## Deliverables

### 1. Shared prompt + role composer
- `supabase/functions/_shared/agent-core-prompt.ts` — the full 6,096-line prompt as a `const CORE_PROMPT` string.
- `supabase/functions/_shared/agent-roster.ts` — per-agent metadata: `role`, `responsibilities[]`, `teammates[]` (who they may delegate to), `tools[]` (Foundry tool descriptors), `handoff_targets[]`.
- Composer `buildInstructions(agentName)` returns `CORE_PROMPT + "\n\n────── AGENT IDENTITY ──────\n" + role block`.

### 2. PATCH all 8 agents on Azure Foundry
Via existing `azure-agents-v1` edge function (`action: "update"`):

| Agent | Role | Delegates to | Adds tools |
|---|---|---|---|
| `Public Concierge` (assistant) | Front desk on web/WhatsApp | Booking Delegate | vapi_call, find_customer_booking, search_flights, get_quote |
| `YTA-ASSISTANT` (Booking Delegate) | Autonomous booker | — | full travel suite + vapi_call, lookup_reservation, browser |
| `BUILDEROFAGENTS` | Master builder / planner | builder-helper-1/2/3 | MCP, code_interpreter, browser, azure-rest, vapi_call |
| `builder-helper-1/2/3` | Parallel executors | — | code_interpreter, browser, MCP, vapi_call |
| `shopper-lead` | Autonomous shopper planner | shopper-helper-1/2/3 | browser_automation_preview, web_search, code_interpreter, MCP, vapi_call |
| `shopper-helper-1/2/3` | Parallel checkout executors | — | same set |

Hierarchy is enforced in the prompt addendum ("You may only delegate to: X, Y, Z"). No peer mesh.

### 3. Shared Vapi tool

New edge functions:
- `vapi-call-start` — POST `{ number, goal, assistantId?, agent }` → creates outbound Vapi call, inserts row in `vapi_calls`, returns `call_id`.
- `vapi-call-inject` — POST `{ call_id, message }` → sends `add-message` control to Vapi mid-call.
- `vapi-call-hangup` — POST `{ call_id }` → ends call.
- `vapi-webhook` — receives Vapi server messages (transcript deltas, tool-calls, end-of-call). Writes to `vapi_call_events` (Realtime-enabled).

Registered as function tools in every agent's tool list so any agent can dial, inject, or hang up.

### 4. Database
Migration:
- `vapi_calls` — id, agent_name, room_id?, phone_number, goal, status, vapi_call_id, started_at, ended_at, summary.
- `vapi_call_events` — id, call_id, role (assistant|user|system|tool), content, at.
- Realtime + admin-only RLS. GRANTs for authenticated + service_role.

### 5. Inline live-transcript + steer panel
Extend `src/pages/AdminAgentRooms.tsx`:
- Subscribes to `vapi_calls` for rows where `status='active'`.
- When active call detected → expand an inline `VapiLivePanel` above the composer showing:
  - Header: agent name, callee number, elapsed timer, hangup button.
  - Live transcript stream (Realtime on `vapi_call_events`).
  - Steer input: text box → `vapi-call-inject`.
- Panel auto-collapses when call ends; final summary written to room as a system message.

Also add a `<VapiLivePanel />` mount inside `src/pages/mobile-admin/MobileHome.tsx` so mobile PWA gets the same cockpit when a call runs.

### 6. Config
- `supabase/config.toml`: register `vapi-call-start`, `vapi-call-inject`, `vapi-call-hangup`, `vapi-webhook` (webhook = `verify_jwt=false`, others require auth).
- Vapi phone number ID + webhook URL: user needs to point Vapi server URL to `.../functions/v1/vapi-webhook` (I'll surface the exact URL after deploy).

### 7. Validation
- `azure-agents-v1 action:"summary"` — confirm all 8 agents show new tool counts.
- `curl vapi-call-start` with a test number → verify row created + webhook fires transcript rows.
- Load `/admin/agent-rooms` → open Builders room → dispatch a task that includes "call +1XXX and confirm X"; verify inline panel appears with live transcript and inject works.

## Technical notes
- The 6k-line prompt (~200KB) is within Azure Foundry's per-agent instruction cap. If any specific agent rejects the size, I'll fall back to a slim "See core-prompt document" reference and attach the full text as an agent-side file — I'll flag it if it happens.
- `vapi_call` on customer-facing Concierge is gated behind an approval step in the prompt (Concierge asks the user before dialing).
- Transcript inserts are batched (250ms debounce) to avoid Realtime spam on long calls.
- Hangup + inject both use Vapi's `/call/:id/control` endpoint with the private API key.

## Secrets needed
- `VAPI_API_KEY` (private) — already present.
- `VAPI_PHONE_NUMBER_ID` — need this from you (Vapi dashboard → Phone Numbers). Without it outbound calls won't dispatch; inject/hangup/webhook still work for calls initiated elsewhere.