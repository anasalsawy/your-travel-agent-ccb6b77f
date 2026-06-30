# AGENT MEMORY (Website Track)

## Scope
- Repo: `your-travel-agent-ccb6b77f`
- Production site target: `your-travel-agent.net`
- This track is customer-facing self-service OTA experience.

## Continuity Mode
Enabled: **AUTONOMOUS_BATCH_MODE**

Rules:
1. Work in batches without waiting for per-task approvals.
2. Only interrupt user for true blockers (missing credentials/spec conflicts/deployment access).
3. Persist progress to this file after each meaningful change set.
4. Keep changes API-first (official suppliers only).

## Current State (Audit Snapshot)
- React + Vite frontend exists with flights page.
- Supabase edge functions already include Duffel + Stripe components.
- Trawex integration is not yet present.
- Repo had a tracked `.env` file; security hardening initiated.

## Batch Plan (Phase 1)
1. Security baseline + env templates
2. Provider orchestration (Duffel/Trawex switch)
3. Customer booking flow hardening
4. Admin approval gates for risky actions
5. Audit trail and reconciliation views

## Completed Checkpoints
- Added autonomous continuity docs and env baseline.
- Added provider router shared utility.
- Added `flight-search-router` function to orchestrate provider selection and fallback.
- Added `trawex-flight-search` function scaffold with official API request pattern.
- Updated flights UI to route searches through `flight-search-router`.
- Added DB migration baseline for `approval_requests` and `booking_action_audit`.

## Recovery After Refresh
Prompt to assistant:
"Continue autonomous mode from latest docs/AGENT_MEMORY.md in your-travel-agent-ccb6b77f and yta-assistant-travel-memory."
