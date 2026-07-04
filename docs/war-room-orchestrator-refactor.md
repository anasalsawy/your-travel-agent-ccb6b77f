# War Room Orchestrator Refactor

## What changed

The Supabase `war-room` edge function now preserves the existing public API while replacing the old roleplay-heavy Chief of Staff internals with a lean YTA Orchestrator.

Preserved actions:

- `post`
- `tick`
- `assign`
- `task_update`
- `heartbeat`
- `reset`

Preserved tables:

- `war_room_messages`
- `war_room_tasks`
- `war_room_heartbeats`

## Removed behavior

The new implementation removes or bypasses the old theatrical orchestration patterns:

- fake ephemeral child workers
- `[MANAGER:PLAN]`, `[MANAGER:CREATE_CHILD]`, `[MANAGER:DELEGATE]`, `[MANAGER:SUPERVISE]`, `[MANAGER:VERIFY]`, `[MANAGER:CLEANUP]` stage spam
- lifecycle tasks created only to narrate management
- readiness/capability/heartbeat sweep loops
- coach loops that only re-prompt workers
- LLM-to-LLM verification theater

## New behavior

The Chief still appears externally as `chief-of-staff`, but internally behaves as `YTA Orchestrator`:

1. Load recent transcript, open tasks, and heartbeats.
2. Classify the next concrete action.
3. Route to one worker.
4. Create/update a real task only when useful.
5. Call the worker through the existing `foundry-agent-run` runtime.
6. Use one normal attempt and one fallback attempt.
7. Escalate to `internal-app-test-buildrunner` after repeated failures.
8. Log only meaningful events into `war_room_messages`.

## Provider adapter

Model calls are isolated in:

```text
supabase/functions/_shared/reasoner.ts
```

The orchestrator can run without provider credentials. Without credentials, it uses deterministic keyword/task routing.

Optional Azure OpenAI env vars:

```text
AZURE_OPENAI_ENDPOINT
AZURE_OPENAI_API_KEY
AZURE_OPENAI_DEPLOYMENT
AZURE_OPENAI_API_VERSION
```

Optional OpenAI fallback env vars:

```text
OPENAI_API_KEY
OPENAI_MODEL
```

## Deploy

```bash
supabase db push
supabase functions deploy war-room
```

## Validation checklist

- `post` inserts a user/agent message and triggers one orchestrator tick.
- `tick` returns structured JSON with `action_taken`, `next_speaker`, and `task_id`.
- repeated identical directives are suppressed and escalated instead of looped.
- no fake child worker messages are posted.
- no manager lifecycle stage messages are posted.
- missing Azure/OpenAI secrets do not break `post`, `assign`, `task_update`, `heartbeat`, or deterministic `tick`.
