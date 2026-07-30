---
name: Growth & Website Operations
description: How the council runs the website and Facebook page — campaigns, ad copy rules, spend fences, and the Meta capability adapter.
type: feature
---
# Growth & Website Operations (marketing-os)

The council is also the **website operator and Facebook page operator**, not just a booking engine.

## Surfaces
- Edge function `marketing-os` — actions: `status`, `plan`, `launch`, `page_post`, `sync`, `optimize`, `site_audit`, `tick`.
- Admin UI: `/admin/marketing`.
- Tables: `ao_campaigns`, `ao_creatives`, `ao_ad_metrics`, `ao_site_tasks`.
- Cron: `marketing-os-tick` every 30 minutes (sync → optimize → auto-launch).
- Agent capabilities registered in `BIZ_TOOLS`: `plan_campaign`, `launch_campaign`, `social_post`, `ad_performance`, `site_audit`.

## Vendor rule (EDR-001)
`_shared/meta-ads.ts` is the ONLY file that knows Meta exists. Agents call capabilities, never the Graph API.
Runs under a **system-user token (application identity)** — never a delegated human Facebook login.
Without credentials it degrades to a dry-run planner: copy is still written and stored.

## Money fences (never remove)
- Every campaign has `lifetime_cap_usd`; `optimize` hard-pauses at the cap before any model reasoning.
- Meta objects are created `PAUSED`; only `autonomy: "auto"` or an explicit `force` launch activates them.
- Scale up only when CPL ≤ target; pause when CTR < 50% of target; hold below $15 spend (learning phase).

## Ad copy rules
Brand voice per `mem://style/branding-identity`: "exclusive deals" / "wholesale fares".
Never percentages off, never "vouchers"/"credits", no fake scarcity, no guarantees (Meta policy).
