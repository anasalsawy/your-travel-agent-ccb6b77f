# OTA Dual-Track Transformation Plan

## Two Parallel Tracks

### A) Internal Ops Agent (yta-assistant)
- Used by owner/admin only.
- Functions: quoting, booking operations, modifications, cancellations, payment checks, audit notes.
- Mandatory approval gates before high-risk actions.

### B) Customer Website (your-travel-agent.net)
- Self-service search/book/pay/manage.
- Uses same backend policies and supplier adapters.

## Architecture Contract
- Shared booking lifecycle states and policy checks.
- Shared supplier action log (Duffel/Trawex).
- Shared payment reconciliation model.

## Non-Negotiables
- Official APIs only (no scraping/browser automation for supplier booking).
- No secret hardcoding.
- Risky operations require explicit approval unless policy says auto.

## Website Immediate Deliverables
1. Flight search -> pricing -> passenger details -> checkout -> confirmation
2. Booking management view (lookup, status, modify/cancel request)
3. Admin review queue for approvals
4. Trawex API adapter integration

## Environment Variables (Website/Supabase)
- DUFFEL_API_TOKEN
- DUFFEL_VERSION
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- TRAWEX_BASE_URL
- TRAWEX_API_KEY
- TRAWEX_USERNAME
- TRAWEX_PASSWORD
- BOOKING_PROVIDER_DEFAULT (duffel|trawex)
- ENABLE_AUTO_TICKETING (true|false)
- REQUIRE_ADMIN_APPROVAL_TICKETING (true|false)
- REQUIRE_ADMIN_APPROVAL_REFUNDS (true|false)
