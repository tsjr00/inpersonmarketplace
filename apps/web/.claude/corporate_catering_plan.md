# Corporate Catering — Food Trucks for Business
## Persistent Planning Guide

_Last updated: 2026-03-07 | Add ideas, notes, and refinements below as they develop._

---

## The Opportunity

Companies hire food trucks through our app instead of caterers. Each corporate event brings 20-100+ employees onto the platform in one shot — solving the chicken-and-egg problem of needing trucks to attract buyers and buyers to attract trucks. Trucks love guaranteed revenue (committed headcount vs hoping for walk-ups). Employees who discover the app through work events become regular personal-use buyers.

## Three Payment Models (in order of implementation complexity)

| Model | Who Pays | Complexity | Phase |
|-------|----------|-----------|-------|
| **Facilitator** | Employees pay for their own food | Zero checkout changes | Phase 1 |
| **Subsidized** | Company pays up to $X, employee pays rest | Split charge logic | Phase 2 |
| **Full coverage** | Company pays all meals | Stripe Invoice API | Phase 2 |

## Phase 1: Pre-Launch MVP (~5-7 days)

### The Flow

1. **Company visits `/food-trucks/catering`** — public request form (company name, contact, date, headcount, address, cuisine preferences, setup instructions)
2. **Admin reviews** on `/food-trucks/admin/catering` — approves → auto-creates event market at company address
3. **Admin invites trucks** — selects vendors, sends `catering_vendor_invited` notifications (email + in-app). Trucks see estimated headcount per truck.
4. **Trucks respond** — accept/decline via vendor catering detail page. See headcount, date, location, preferences.
5. **Trucks set limited event menu** — add specific listings to the event market via existing `listing_markets`. Don't add everything — just their event menu.
6. **Admin sets cutoff** — e.g., 48h before event so trucks can prep from pre-orders
7. **Admin shares event URL** — company distributes `/{vertical}/markets/{marketId}` to employees
8. **Employees pre-order** — browse trucks, order 1-2 days ahead, pick a time slot (11:00, 11:30, 12:00, 12:30)
9. **Day of event** — trucks arrive with prep done (exact order lists). Employees pick up in waves by time slot.
10. **Booking fee** — manual Stripe invoice until volume justifies automation

### What Already Exists (Reused Directly)

| Mechanic | How It Works | Existing Infrastructure |
|----------|-------------|------------------------|
| **Pre-orders** | Event markets use FM-style advance ordering. `cutoff_hours` configurable per market. Trucks see exact orders before event day. | `get_available_pickup_dates()` function |
| **Limited menu** | Trucks add only specific listings to event market via `listing_markets`. Regular menu stays at regular markets. | `listing_markets` many-to-many |
| **Pickup time slots** | Employees select `preferred_pickup_time` when ordering. Orders grouped by time window. | `preferred_pickup_time` on `order_items` |
| **Invitation-only** | Admin creates `market_vendors` rows. Trucks can't self-add. | `market_vendors` table |
| **Headcount per truck** | `headcount / accepted_vendor_count` — simple math. | New calculation only |
| **Event dates** | `event_start_date`, `event_end_date` on markets. Past events auto-filtered. | Migration 039 |
| **Standard checkout** | Employees order and pay normally (Stripe or external). | Full checkout pipeline |

### Database Changes: 1 Migration

**New table: `catering_requests`**
```
catering_requests
  id                  UUID PK
  vertical_id         TEXT FK→verticals (default 'food_trucks')
  status              TEXT (new, reviewing, approved, declined, cancelled, completed)
  company_name        TEXT NOT NULL
  contact_name        TEXT NOT NULL
  contact_email       TEXT NOT NULL
  contact_phone       TEXT
  event_date          DATE NOT NULL
  event_end_date      DATE (NULL = single day)
  event_start_time    TIME
  event_end_time      TIME
  headcount           INTEGER NOT NULL
  address             TEXT NOT NULL
  city, state, zip    TEXT NOT NULL
  cuisine_preferences TEXT
  dietary_notes       TEXT
  budget_notes        TEXT
  vendor_count        INTEGER DEFAULT 2
  setup_instructions  TEXT (parking, power, where to set up)
  additional_notes    TEXT
  market_id           UUID FK→markets (set when admin approves → creates event)
  admin_notes         TEXT
  created_at, updated_at  TIMESTAMPTZ
```

**New columns on existing tables:**
```
markets:
  + catering_request_id  UUID FK→catering_requests  (links event back to request)
  + headcount            INTEGER                     (visible to vendors + employees)

market_vendors:
  + response_status      TEXT (invited, accepted, declined)
  + response_notes       TEXT
  + invited_at           TIMESTAMPTZ
```

### New Notification Types (3)

| Type | Audience | Channels | Message |
|------|----------|----------|---------|
| `catering_request_received` | Admin | email + in-app | "{companyName} submitted a catering request for {headcount} people on {eventDate}" |
| `catering_vendor_invited` | Vendor | email + in-app | "New catering opportunity: {companyName} needs food trucks for {headcount} people on {eventDate}" |
| `catering_vendor_responded` | Admin | email + in-app | "{vendorName} accepted/declined the invitation for {eventName}" |

### New Files (~8)

| File | Purpose | Pattern |
|------|---------|---------|
| `src/app/[vertical]/catering/page.tsx` | Public request form + marketing | `support/page.tsx` |
| `src/app/api/catering-requests/route.ts` | POST: submit request (public, rate-limited) | `api/vendor-leads/route.ts` |
| `src/app/[vertical]/admin/catering/page.tsx` | Admin: manage requests, approve, invite vendors | Admin patterns |
| `src/app/api/admin/catering/route.ts` | GET: list requests | `api/admin/markets/route.ts` |
| `src/app/api/admin/catering/[id]/route.ts` | PATCH: approve/update (auto-creates event market) | Admin pattern |
| `src/app/api/admin/catering/[id]/invite/route.ts` | POST: invite vendors + send notifications | New |
| `src/app/[vertical]/vendor/catering/[marketId]/page.tsx` | Vendor: view invitation, accept/decline | New |
| `src/app/api/vendor/catering/[marketId]/respond/route.ts` | PATCH: vendor response | New |

### Modified Files (~6)

| File | Change |
|------|--------|
| `src/lib/notifications/types.ts` | Add 3 notification types + template data |
| `src/app/[vertical]/dashboard/page.tsx` | Catering invitation card in vendor section |
| `src/app/[vertical]/admin/markets/page.tsx` | "Catering" badge on linked events |
| `src/components/admin/AdminNav.tsx` | "Catering" nav item |
| `src/app/[vertical]/markets/[id]/page.tsx` | Headcount + "Corporate Event" badge |
| Header nav component | "Catering" link in public nav |

### Intentionally Skipped in Phase 1

- Event pricing (trucks use regular prices)
- Company-paid meals (employees pay themselves)
- Access codes / employee verification (URL is enough)
- Automated invoicing (manual Stripe invoice)
- Vendor bidding (admin hand-picks)
- Real-time messaging (phone + email is fine)
- Recurring events (create new event each time)

---

## Phase 2: When Demand Proves Out

_Only build if Phase 1 generates real catering requests._

### Company-Paid Meals
- Company pre-pays via Stripe Invoice API
- Employees order without payment — charged to company account
- New checkout mode: "Your employer is covering this meal"
- Requires: `catering_payment_plans` table, Stripe Customer for company

### Subsidized Meals
- Company pays up to $X per employee, employee pays rest
- Split charge: company card + employee card
- "Your employer covers up to $15. Your portion: $4.50"
- Requires: `catering_access_codes` table, subsidy logic in checkout

### Event Pricing
- `event_price_cents` on `listing_markets`
- Vendors set catering-specific prices per listing per event
- Possible volume discounts (100+ orders = 10% off)

### Auto-Invoicing
- Post-event invoice: order count, total spend, vendor breakdown, participation rate
- Company contact dashboard with event stats

### Recurring Events
- "Book every Tuesday" for companies wanting weekly food truck visits
- Auto-creates event markets on schedule
- Trucks accept the series

### Post-Event Follow-Up
- Employees get "How was it?" prompt → ratings/reviews
- Company contact gets participation report (X of Y employees ordered)
- Drives reputation loop

**Phase 2 estimated: 15-20 days (payment system changes are the big lift)**

---

## Open Questions & Future Ideas

_Scratchpad — add ideas here as they come up._

- [ ] What should the booking fee structure be? Flat fee per event? Per-head fee? Percentage of orders?
- [ ] Different tiers of catering service? (basic = just show up, premium = full coordination + follow-up)
- [ ] Could food trucks bid on events (auction model) instead of admin hand-picking?
- [ ] How to handle truck no-shows? Penalty? Insurance deposit?
- [ ] Should public catering page show gallery of past events / testimonials?
- [ ] Partner with office property managers for regular food truck rotations?
- [ ] Minimum headcount to make it worth a truck's time? (Probably 25-30 at avg $12-15/order)
- [ ] Should we offer a "catering menu builder" where trucks can quickly create a simplified event menu?
- [ ] Post-event survey for companies — "Would you book again? What could be better?"
- [ ] Referral program — companies that refer other companies get a discount on booking fee?

---

## Revenue Model Notes

_Track revenue thinking here._

**Phase 1 Revenue:**
- Booking fee from company (manual invoice — TBD amount)
- Standard platform fees on every employee order (6.5% + $0.15)
- Standard vendor platform fees

**Phase 2 Revenue (additional):**
- Higher booking fee for "company pays" events (more coordination required)
- Subsidy processing fee
- Premium tier: dedicated account manager, post-event reports, priority truck selection

**Unit Economics (rough):**
- 50-person event × $15 avg order = $750 total orders
- Platform fee at 6.5% + $0.15/order = ~$56 from orders
- Booking fee (TBD) = $100-300?
- Total per event = $150-350
- Monthly recurring (1 company × weekly) = $600-1400/mo
- 10 companies × monthly = $6,000-14,000/mo

---

_This document is a living plan. Update it as the feature evolves._
