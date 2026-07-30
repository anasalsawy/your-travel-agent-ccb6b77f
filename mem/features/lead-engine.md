---
name: Autonomous Lead Engine
description: Facebook lead intake, governed outreach cadence, persistent browser identity, and the 24/7 runner heartbeat.
type: feature
---
# Lead Engine (Agency OS growth layer)

- UI: `/admin/leads` (paste leads, pipeline, conversation, heartbeat).
- Tables: `ao_leads`, `ao_outreach`, `ao_channel_sessions`, `ao_runner_beats`.
- Functions: `lead-intake` (LLM parses raw pasted text → leads + `ao_missions`),
  `outreach-tick` (strategist/writer lobes → governor → channel ladder),
  `fb-session` (persistent Facebook profile via Browserbase context + raw CDP),
  `runner-24x7` (cron every minute: session keep-warm, outreach, agency tick, memory).

## Rules
- **Communication Governor is deterministic**: quiet hours 21:00–08:00 (UTC-5),
  min 90 min between outbound messages, max 2/lead/day, duplicate-body block.
- **Never abandon**: cadence hours [0,3,24,72,168,336,720]; last rung repeats as `nurture`.
- **Channel ladder**: Facebook → Email (Resend) → SMS (Twilio). Agents request
  "reach this person", never a vendor.
- **No Facebook password is stored** — the human logs in once in the live browser
  view; the Browserbase context persists cookies. Facebook driving uses
  mbasic.facebook.com over a dependency-free CDP driver (`_shared/cdp.ts`).
- **Memory fill-then-finetune**: episodic cap 300/agent; over cap the coldest 40
  are distilled into one pinned `fixed_memories` lesson and their rows freed.
