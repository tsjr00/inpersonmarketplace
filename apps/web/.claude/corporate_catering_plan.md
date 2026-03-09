# Events System — Private Events (FT) & Pop-Up Markets (FM)
## Persistent Planning Guide

_Last updated: 2026-03-08 | Add ideas, notes, and refinements below as they develop._
_Rebranded from "Corporate Catering" to "Private Events" (FT) and extended to "Pop-Up Markets" (FM) in Session 53._

---

## The Opportunity

### Food Trucks: Private Events
Companies and organizations hire food trucks through our app instead of caterers. Each event brings 20-100+ employees onto the platform in one shot — solving the chicken-and-egg problem of needing trucks to attract buyers and buyers to attract trucks. Trucks love guaranteed revenue (committed headcount vs hoping for walk-ups). Guests who discover the app through events become regular personal-use buyers.

### Farmers Market: Pop-Up Markets
Companies, neighborhoods, and community groups host pop-up markets featuring local vendors. Organizers submit a request, vendors are invited, and guests browse and buy directly — just like a farmers market, but at a curated location. Vendors get access to new customers outside their regular market area.

### Key Difference
- **FT Private Events**: Pre-order focused. Guests order ahead, pick up by time slot. No walk-up browsing.
- **FM Pop-Up Markets**: Browse-and-buy focused. Part of the allure is the in-person browsing experience. Pre-orders optional but not the primary flow.

---

## Multi-Vertical Architecture

The system is built **extend-not-fork**: one `catering_requests` table (with `vertical_id`), one set of API routes, one admin UI — with vertical-aware terminology via `term()`.

### Terminology Mapping

| Key | FT Value | FM Value |
|-----|----------|----------|
| `event_feature_name` | Private Events | Pop-Up Markets |
| `event_request_heading` | Book Food Trucks for Your Event | Host a Pop-Up Market |
| `event_vendor_count_label` | Number of Food Trucks | Number of Vendors |
| `event_vendor_unit` | truck | vendor |
| `event_preference_label` | Cuisine Preferences | Vendor Type Preferences |
| `event_preference_placeholder` | BBQ, Mexican, Asian fusion, etc. | Produce, baked goods, artisan crafts, etc. |
| `event_hero_subtitle` | Bring food trucks to your office... | Host a pop-up market at your... |
| `event_submit_button` | Submit Event Request | Submit Pop-Up Request |
| `event_success_message` | food truck options | vendor options |

### `is_private` Flag (Migration 072)

Most events are private — hidden from the public browse page but accessible via direct URL sharing.

- `markets.is_private` — BOOLEAN, defaults `false`
- Admin approve API sets `is_private: true` on event markets
- Browse page filters: `.or('is_private.eq.false,is_private.is.null')`
- Direct URL always works — private events are shared by the host
- Share button on all event market pages for easy URL distribution

---

## Two Payment Models (in order of implementation complexity)

| Model | Who Pays | Complexity | Phase |
|-------|----------|-----------|-------|
| **Facilitator** | Guests pay for their own food | Zero checkout changes | Phase 1 ✅ |
| **Company Tab (Tickets)** | Company pays all meals via post-event settlement | Settlement report + manual process only | Phase 1.5 ✅ |
| **Subsidized** | Company pays up to $X, guest pays rest | Split charge logic | Phase 2 |
| **Full coverage** | Company pays all meals digitally | Stripe Invoice API | Phase 2 |

## Phase 1: MVP — COMPLETE ✅

### The Flow

1. **Organizer visits `/{vertical}/catering`** — public request form. FT sees "Private Events" heading; FM sees "Pop-Up Markets" heading.
2. **Admin reviews** on `/{vertical}/admin/catering` — approves → auto-creates event market with `is_private: true`
3. **Admin invites vendors** — selects vendors, sends `catering_vendor_invited` notifications (email + in-app). Vendors see estimated headcount.
4. **Vendors respond** — accept/decline via vendor catering detail page. See headcount, date, location, preferences.
5. **Vendors add products** — add specific listings to the event market via existing `listing_markets`.
6. **Admin shares event URL** — host distributes `/{vertical}/markets/{marketId}` to guests (share button available)
7. **Guests order** — FT: pre-order with time slots. FM: browse and buy at the event.
8. **Day of event** — FT: trucks arrive with exact order lists. FM: vendors set up booths, guests browse.
9. **Post-event** — Admin marks completed → buyers receive `event_feedback_request` notification prompting reviews.
10. **Booking fee** — manual Stripe invoice until volume justifies automation

### Database Changes

**Table: `catering_requests`** (Migration 070)
```
catering_requests
  id                  UUID PK
  vertical_id         TEXT FK→verticals
  status              TEXT (new, reviewing, approved, declined, cancelled, completed)
  company_name, contact_name, contact_email, contact_phone
  event_date, event_end_date, event_start_time, event_end_time
  headcount           INTEGER NOT NULL
  address, city, state, zip
  cuisine_preferences, dietary_notes, budget_notes
  vendor_count        INTEGER DEFAULT 2
  setup_instructions, additional_notes
  market_id           UUID FK→markets (set when admin approves → creates event)
  admin_notes         TEXT
  created_at, updated_at  TIMESTAMPTZ
```

**New columns on existing tables:** (Migrations 070, 072)
```
markets:
  + catering_request_id  UUID FK→catering_requests
  + headcount            INTEGER
  + is_private           BOOLEAN DEFAULT false  (Migration 072)

market_vendors:
  + response_status      TEXT (invited, accepted, declined)
  + response_notes       TEXT
  + invited_at           TIMESTAMPTZ
```

### Notification Types (4)

| Type | Audience | Message |
|------|----------|---------|
| `catering_request_received` | Admin | Vertical-aware: "Private event request" (FT) or "Pop-up market request" (FM) |
| `catering_vendor_invited` | Vendor | Vertical-aware: "food trucks" (FT) or "vendors" (FM) |
| `catering_vendor_responded` | Admin | "{vendorName} accepted/declined..." |
| `event_feedback_request` | Buyer | "The {eventName} event has ended! Leave a review..." |

### Features Built

| Feature | Status | Notes |
|---------|--------|-------|
| Public request form | ✅ | `/{vertical}/catering` — vertical-aware labels via `term()` |
| Admin management | ✅ | `/{vertical}/admin/catering` — review, approve, invite, manage |
| Vendor invitation flow | ✅ | Email + in-app notification, accept/decline page |
| Event market creation | ✅ | Auto-created on admin approve, `is_private: true` |
| Private event filtering | ✅ | Hidden from browse, accessible by direct URL |
| Share button | ✅ | On all event market pages for URL distribution |
| Repeat event creation | ✅ | Admin can clone request with new dates (status='new') |
| Post-event feedback | ✅ | Notification to buyers when admin marks completed |
| FM "How It Works" copy | ✅ | Browse-and-buy language (no time slots) |
| FT "How It Works" copy | ✅ | Pre-order/pickup language |
| Nav labels | ✅ | Header, Footer, AdminNav all use `term()` |
| Help articles | ✅ | 6 FT articles ("Private Events"), 6 FM articles ("Pop-Up Markets") |
| Settlement report | ✅ | `/{vertical}/admin/catering/{id}/settlement` — printable, CSV export |

### URLs

| Page | URL | Access |
|------|-----|--------|
| FT public form | `/food_trucks/catering` | Public |
| FM public form | `/farmers_market/catering` | Public |
| FT admin | `/food_trucks/admin/catering` | Admin |
| FM admin | `/farmers_market/admin/catering` | Admin |
| Vendor invitation | `/{vertical}/vendor/catering/{marketId}` | Invited vendor |
| Event market (guests) | `/{vertical}/markets/{marketId}` | Anyone with URL |
| Settlement report | `/{vertical}/admin/catering/{id}/settlement` | Admin |

### Intentionally Skipped in Phase 1

- Event pricing (vendors use regular prices)
- Company-paid meals (guests pay themselves)
- Access codes / guest verification (URL is enough)
- Automated invoicing (manual Stripe invoice)
- Vendor bidding (admin hand-picks)
- Real-time messaging (phone + email is fine)

---

## Phase 1.5: Company-Paid Events via Ticket System — COMPLETE ✅

_Bridges Phase 1 (guests pay) → Phase 2 (full digital company payment). Zero checkout changes required._

### The Concept

Instead of building company-paid checkout (Stripe Invoice API, split charges, access codes), use a **physical ticket + external payment** workflow:

1. All event vendors set their event payment method to **external/cash**
2. Company distributes physical **meal tickets** to guests before the event
3. Guests pre-order through the app (selecting external payment), bring their ticket to pickup
4. Vendor collects the ticket and writes the **order number** on the back
5. After the event, admin generates an **Event Settlement Report** showing all orders
6. Company writes **one check** to the platform covering: all meals + booking fee
7. Platform pays out each vendor from that check, minus standard platform fees
8. Tickets serve as physical audit trail matching electronic records

### Event Settlement Report (Built)

Admin page at `/{vertical}/admin/catering/{id}/settlement` showing:

| Section | Contents |
|---------|----------|
| **Event Header** | Company name, event date, location, headcount, participating vendors |
| **Per-Vendor Breakdown** | Each order: shopper name, email, items, meal price, pickup time, fulfillment status |
| **Vendor Subtotals** | Orders served, gross revenue, platform fee (6.5% + $0.15/order), net payout |
| **Grand Total** | Total orders, total revenue, total platform fees, total vendor payouts, booking fee line |
| **Ticket Reconciliation** | Tickets distributed (headcount) vs orders placed vs orders fulfilled |

Features:
- **Printable** — print-optimized CSS, clean layout for physical records
- **CSV Export** — downloadable spreadsheet for accounting
- **Linked from admin catering page** — "Settlement Report" button on approved/completed requests

### Manual Process Requirements

#### Before the Event
- [ ] **Event Agreement signed** — company and platform agree on: ticket process, headcount, booking fee, payment terms
- [ ] **Vendor Agreement** — each participating vendor acknowledges: external payment mode, ticket collection process, payout timeline
- [ ] **Tickets printed** — company prints meal tickets (template provided by platform, or plain numbered tickets)
- [ ] **Ticket distribution** — company distributes tickets to guests (1 ticket per person, or per meal if multi-day)
- [ ] **Vendors set external payment** — admin confirms all event vendors have external/cash payment enabled for this market

#### During the Event
- [ ] Guests show ticket at pickup, hand it to the vendor
- [ ] Vendor writes the **order number** (from the app) on the back of the ticket
- [ ] Vendor keeps all collected tickets
- [ ] If guest doesn't have a ticket → they can still order and pay normally via the app (card payment)

#### After the Event
- [ ] Admin generates **Event Settlement Report**
- [ ] Admin sends report to company contact with total amount owed (meals + booking fee)
- [ ] Company sends one payment (check, wire, or manual Stripe invoice) within agreed terms (e.g., Net 15)
- [ ] Platform receives payment
- [ ] Platform pays out each vendor their net amount (gross - platform fees)
- [ ] Vendors can reconcile their payout against their collected tickets

---

## Phase 2: When Demand Proves Out

_Only build if Phase 1 generates real event requests._

### Company-Paid Meals
- Company pre-pays via Stripe Invoice API
- Guests order without payment — charged to company account
- New checkout mode: "Your employer is covering this meal"
- Requires: `catering_payment_plans` table, Stripe Customer for company

### Subsidized Meals
- Company pays up to $X per guest, guest pays rest
- Split charge: company card + guest card
- "Your employer covers up to $15. Your portion: $4.50"
- Requires: `catering_access_codes` table, subsidy logic in checkout

### Event Pricing
- `event_price_cents` on `listing_markets`
- Vendors set event-specific prices per listing per event
- Possible volume discounts (100+ orders = 10% off)

### Auto-Invoicing
- Post-event invoice: order count, total spend, vendor breakdown, participation rate
- Company contact dashboard with event stats

### Auto-Recurring Events
- "Book every Tuesday" for companies wanting weekly events
- Auto-creates event markets on schedule
- Vendors accept the series
- (Note: manual repeat event creation already built in Phase 1)

---

## Open Questions & Future Ideas

_Scratchpad — add ideas here as they come up._

- [ ] What should the booking fee structure be? Flat fee per event? Per-head fee? Percentage of orders?
- [ ] Different tiers of event service? (basic = just show up, premium = full coordination + follow-up)
- [ ] Could vendors bid on events (auction model) instead of admin hand-picking?
- [ ] How to handle vendor no-shows? Penalty? Insurance deposit?
- [ ] Should public catering page show gallery of past events / testimonials?
- [ ] Partner with office property managers for regular food truck rotations?
- [ ] Minimum headcount to make it worth a vendor's time? (Probably 25-30 at avg $12-15/order)
- [ ] Should we offer an "event menu builder" where vendors can quickly create a simplified event menu?
- [ ] Post-event survey for companies — "Would you book again? What could be better?"
- [ ] Referral program — companies that refer other companies get a discount on booking fee?
- [ ] Pop-up Market Box: curated bundle exclusive to pop-up events (FM-specific upsell)
- [ ] Tier priority for event invitations — higher-tier vendors get first pick
- [ ] Location-based alerts when events are nearby (opt-in, not pushed to outsiders)

---

## Revenue Model Notes

_Track revenue thinking here._

**Phase 1 Revenue:**
- Booking fee from organizer (manual invoice — TBD amount)
- Standard platform fees on every guest order (6.5% + $0.15)
- Standard vendor platform fees

**Phase 2 Revenue (additional):**
- Higher booking fee for "company pays" events (more coordination required)
- Subsidy processing fee
- Premium tier: dedicated account manager, post-event reports, priority vendor selection

**Unit Economics (rough):**
- 50-person event × $15 avg order = $750 total orders
- Platform fee at 6.5% + $0.15/order = ~$56 from orders
- Booking fee (TBD) = $100-300?
- Total per event = $150-350
- Monthly recurring (1 company × weekly) = $600-1400/mo
- 10 companies × monthly = $6,000-14,000/mo

---

_This document is a living plan. Update it as the feature evolves._
