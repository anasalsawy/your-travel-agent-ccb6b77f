# Move Both Agents to Azure AI Foundry — Live Cutover

Kill Vapi (customer concierge) and Gemini-via-Lovable-Gateway (booking agent). Both agents become **Azure AI Foundry Assistants** on your `anasalsawy-7430` project, using Azure's own LLM deployments. Same channels stay live: **website chat + WhatsApp**.

## What gets created in Azure (one-time)

1. **Assistant: `Public Concierge`** — customer-facing. System prompt = Maya's current customer prompt. Tools = search flights, get quote, create Stripe link, escalate to human.
2. **Assistant: `Booking Delegate`** — admin/ops. System prompt = current booking-agent prompt. Tools = full `openapi-booking.json` (Duffel search/book/cancel, DB reads).
3. Both point at an Azure model deployment in your Foundry project (gpt-4o-mini or gpt-4.1-mini — whichever you have deployed; I'll list them first and pick).

## What gets built in this project

### Backend (edge functions)
- **`azure-agent-run`** (new) — the single runtime bridge. Takes `{assistantId, threadId?, userMessage, channel}`, creates/reuses an Azure thread, posts the message, starts a run, polls to completion, executes any tool calls locally against our existing edge functions (Duffel, quotes, Stripe), submits tool outputs back to Azure, returns final text + threadId.
- **`whatsapp-maya`** — rewire to call `azure-agent-run` with the Public Concierge assistant instead of the current path.
- **`whatsapp-dev-agent`** — keep as-is (that's Frank, unrelated).
- **`vapi-chat`** — deprecate; keep the file but route through `azure-agent-run` so any old client keeps working.
- **`booking-agent`** — rewire to `azure-agent-run` with the Booking Delegate assistant.

### Thread mapping (so conversations have memory per channel)
New table `azure_agent_threads`:
- `channel` (`web` | `whatsapp` | `admin`)
- `external_id` (phone number, session id, or admin user id)
- `assistant_id`, `thread_id`, `updated_at`
- RLS: service-role only; edge functions read/write.

### Frontend
- **Homepage "Chat with our Concierge"** — no visual change, just talks to `azure-agent-run` (Public Concierge) instead of `vapi-chat`.
- **`/admin` + `/m` Booking Agent tab** — same UI, points at `azure-agent-run` (Booking Delegate).

### WhatsApp
- Twilio inbound webhook → `whatsapp-maya` (unchanged URL) → `azure-agent-run` (Public Concierge) → reply via Twilio.
- Thread keyed by sender phone → continuous memory per customer.

## Tools the Azure agents will call

Exposed via `public/openapi-concierge.json` (new, customer-safe subset) and existing `public/openapi-booking.json` (admin, full power). Azure calls them as OpenAPI tools; `azure-agent-run` executes the HTTP call to our edge functions and returns the JSON.

Concierge tools (customer-safe):
- `search_flights`, `get_quote`, `create_stripe_checkout`, `handoff_to_human`

Booking tools (admin):
- everything already in `openapi-booking.json`

## Cutover order (minimal customer disruption)

1. List Azure model deployments, pick one, store as `AZURE_AI_MODEL` secret.
2. Create both assistants via `azure-rest`, store their IDs as `AZURE_ASSISTANT_CONCIERGE` and `AZURE_ASSISTANT_BOOKING`.
3. Build `azure-agent-run` + `azure_agent_threads` table.
4. Publish `openapi-concierge.json`, attach both tool specs to the respective assistants.
5. Flip website chat to Azure. Test one flow end-to-end.
6. Flip WhatsApp to Azure. Test one message end-to-end.
7. Flip admin Booking Agent to Azure. Test one search + one (sandbox) book.
8. Leave Vapi/ElevenLabs voice untouched for now — voice is a separate cutover.

## Out of scope for this cutover
- Voice (ElevenLabs Maya, Vapi voice) — stays as-is. Text channels first.
- Frank / dev-agent — stays on its own runtime.
- Duffel Cars/Hotels — still provider-gated regardless of agent runtime.

## Two things I need from you before I start

1. **Confirm which Azure model deployment to use.** I'll list them via `azure-rest`; if there's only one, I'll just use it. If there are several, I'll ask.
2. **Confirm the customer-facing tool list above is what you want the concierge allowed to do.** (Search + quote + Stripe link + human handoff — no direct booking without your approval.)

Say "go" and I'll start with step 1 (list deployments) and drive straight through.