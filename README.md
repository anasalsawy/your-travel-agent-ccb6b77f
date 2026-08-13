# Your-travel-agent

Build a full‑stack web platform (mobile‑first, responsive) for my travel business that sells travel vouchers/certificates and also takes paid requests for flight tickets. Name: “Your Travel Agent” (can be editable later). Core goals: 1) Customers can browse available vouchers, see clear redemption terms, and purchase them securely. 2) Customers can submit a ticket request (route/date/cabin/notes) and pay a quoted amount. 3) Admin can manage inventory, pricing, orders, and requests.

TECH STACK
- Use a modern React/Next.js style UI with Tailwind.
- Backend with database + authentication.
- Payments: integrate Stripe Checkout for card payments; also allow a manual “Pay by Bitcoin” option (display BTC address + upload proof + status tracking). Keep it modular.

ROLES & AUTH
- Public visitor: browse vouchers and FAQ.
- Customer account: sign up/login, purchase vouchers, submit ticket requests, view order/request status, messages.
- Admin account: inventory CRUD, set discounts, mark vouchers as sold/disabled, manage ticket request quotes, update statuses, messaging, view analytics.

KEY PAGES
1) Landing/Home
- Hero: “Verified Travel Vouchers & Discounted Tickets”
- 3-step how it works
- Trust blocks: verification, escrow/secure checkout, fast delivery
- CTA buttons: “Browse Vouchers” “Request a Ticket”
- Testimonials section (placeholder)

2) Vouchers Catalog
- Filters: airline, type (voucher/certificate), value range, discount %, expiry date, refundable/transferable, redemption method.
- Cards show: airline logo placeholder, face value, your price, discount %, expiry, notes, “Verified balance” badge.
- Voucher detail page with full terms, redemption steps, limitations, delivery method, refund policy, and purchase button.

3) Checkout
- Stripe Checkout for card.
- For Bitcoin option: show invoice amount in USD + BTC equivalent (static field, admin can update rate manually), customer uploads transaction hash/screenshot.
- After purchase: order confirmation page + email notification.

4) Ticket Request
- Form fields: origin, destination, departure date, return date (optional), one-way/round-trip, passengers, cabin (economy/first), flexibility, preferred airline, budget, contact info, special notes.
- Flow: submit request → admin reviews → admin sets quote + payment link → customer pays → admin marks as ticket issued and attaches confirmation details.

5) Customer Dashboard
- Orders list (vouchers)
- Ticket requests list with statuses: Submitted, Quoted, Paid, Ticketed, Completed, Cancelled
- Messaging thread per request/order
- Download/see delivery info

6) Admin Dashboard
- Inventory management
  - Voucher model: id, airline, title, type, face_value, currency, expiry_date, discount_percent, sale_price, redemption_notes, terms, verified_balance (bool), verification_method (text), status (available/sold/disabled), created_at.
- Ticket request management
  - TicketRequest model: id, user_id, itinerary fields, status, quoted_price, payment_status, admin_notes, issued_ticket_info, created_at.
- Orders management
  - Order model: id, user_id, voucher_id, amount_paid, payment_method, payment_status, delivery_status, proof_upload_url, created_at.
- Admin actions: set quote, send message, attach documents, mark delivered, refund/cancel (status only).

DESIGN
- Dark + blue modern, edgy aesthetic.
- Clean typography, large price blocks, high contrast CTAs.
- Include airline logo placeholders (generic).
- Add a “Verified & Compliant” style banner and clear disclaimers.

CONTENT SECTIONS
- FAQ: What are travel vouchers vs gift cards? How verification works? Delivery time? Refund policy? What if flight changes/cancellation?
- Policies: Terms of Service, Privacy, Refund & Dispute Policy (draft placeholders).

NON‑FUNCTIONAL
- Basic email notifications for signup, order confirmation, quote sent, payment received, ticket issued.
- Prevent overselling: when an order is paid, reserve voucher; on failure/cancel release it.
- Admin seed account and simple role guard.

DELIVERABLE
- Deployable web app that also works like an app on phones (PWA). Add “Add to Home Screen” support.
- Include sample data for 8–12 vouchers and 3 sample testimonials.

Make sure the app is usable end‑to‑end with mock payment mode enabled for testing.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://your-travel-agent.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d93f984c-f5b2-4696-9b3d-3f7ba4214773).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
