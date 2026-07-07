# Independent Orchestration Core

This folder is a Lovable-independent runtime foundation for the YTA system.

Goals:
- Deterministic mission lifecycle and state transitions.
- Lead/worker model enforced by code, not prompts.
- Bounded retries and automatic escalation.
- Provider-neutral orchestration with Azure Foundry as primary.
- Observable execution artifacts for QA and audits.

## Architecture

- `src/domain/`: mission/task models + state machine.
- `src/engine/`: orchestration loop and policies.
- `src/adapters/`: external systems (Foundry, persistence).
- `src/server.ts`: HTTP API for mission intake/control.

## What Is Implemented Here (v1)

- Mission state machine:
  - `queued -> planning -> delegating -> executing -> verifying -> completed`
  - failure lanes: `blocked`, `escalated`, `failed`
- Task state machine:
  - `todo -> assigned -> running -> review -> done`
  - failure lanes: `retrying`, `blocked`, `failed`, `escalated`
- Retry policy with cap + exponential backoff metadata.
- Escalation policy:
  - repeated directive >2 times
  - retry exhaustion
  - high-authority-required errors
- Lead behavior:
  - lead never does long-running execution directly
  - lead delegates to workers and supervises
- Foundry adapter interface and Azure Foundry HTTP implementation.

## Run

```bash
cd orchestration
npm install
npm run dev
```

Default API:
- `GET /health`
- `POST /missions`
- `POST /missions/:id/tick`
- `GET /missions/:id`

Environment:
- `PORT` (default `8790`)
- `AZURE_AI_PROJECT_ENDPOINT`
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

## Next Migration Steps

1. Replace current `war-room` tick logic with calls into this service.
2. Move `foundry-agent-run` routing logic into worker execution adapters.
3. Shift mission/task storage from in-memory to Postgres tables.
4. Mirror all war-room messages/events as immutable execution logs.
5. Route UI admin pages to this runtime API.
