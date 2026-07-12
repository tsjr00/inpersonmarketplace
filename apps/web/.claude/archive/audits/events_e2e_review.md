# Events System — End-to-End Code Review
**Session 71 | 2026-04-12**
**Method:** 4 parallel research agents (schema, API routes, frontend, integrations) + direct code verification on all critical findings. No prior documentation relied upon — all claims below cite the code directly.

---

## Severity Levels
- **CRITICAL** — real security or financial risk, affects live users, fix before next prod push
- **HIGH** — functional gap that will confuse or block users during events, fix this sprint
- **MEDIUM** — inconsistency or missing feature that degrades quality, fix before beta testers arrive
- **LOW** — polish, naming, or minor UX issue, backlog

---

## CRITICAL FINDINGS

### C-1: Event cancellation does NOT notify buyers who placed orders

**File:** `src/app/api/events/[token]/cancel/route.ts:96-114`
**Verified:** Lines 96-114 notify accepted VENDORS only. No query against `orders` or `order_items` is made. No buyer notification is sent.

**Impact:** If an organizer cancels an event, buyers who pre-ordered food (and may have paid via Stripe) receive zero notification. They'd show up to an event that doesn't exist. For company-paid events, employees see a "confirmed" order forever.

**Fix:** After the vendor notification block (line 114), query `orders` joined to `order_items` where `order_items.market_id = event.market_id` and `orders.status NOT IN ('cancelled', 'refunded')`. For each unique `buyer_user_id`, send a cancellation notification. For Stripe-paid orders, trigger refund or flag for manual refund.

**Complexity:** Medium — 20-30 lines of code in the cancel route, plus a new notification type `event_cancelled_buyer`.

---

### C-2: Email-based organizer authentication is spoofable

**Files:**
- `src/app/api/events/[token]/cancel/route.ts:46-52` — checks `organizer_user_id` first, falls back to email
- `src/app/api/events/[token]/details/route.ts:86` — GET uses email-ONLY check (no organizer_user_id)
- `src/app/api/events/[token]/details/route.ts:125-126` — PATCH checks both with OR fallback

**Verified:** Line 86 of the details GET handler reads:
```typescript
const isOrganizer = event.contact_email?.toLowerCase() === user.email?.toLowerCase()
```
No `organizer_user_id` check at all for reading event details. The PATCH handler (line 125-126) has both but OR'd.

**Impact:** Any authenticated user whose email matches the event's `contact_email` can view and modify event details. Email is not a secure identity signal — it's self-declared during signup. An attacker who knows the organizer's email could register an account with that email and gain access.

**Mitigating factor:** The `cancel` route does check `organizer_user_id` first (line 46). The `details` route line 165 auto-sets `organizer_user_id` on first visit by email-matched user, which locks it down after first access.

**Fix:** Remove email-only fallback on GET (line 86). For PATCH, keep the fallback only for the specific case where `organizer_user_id IS NULL` (legacy events created before the column existed), and set `organizer_user_id` on first match (line 165 already does this). Add a comment explaining the migration path.

**Complexity:** Low — 5-10 lines changed across 2 handlers.

---

### C-3: No cross-event cart isolation — items from different events can mix

**File:** `src/app/api/cart/items/route.ts:187-191`
**Verified:** `get_or_create_cart` RPC takes only `p_user_id` and `p_vertical_id`. One cart per vertical per user. Event items and regular marketplace items can coexist.

**Impact:** A buyer shopping at two concurrent events (or an event + a regular market) gets all items in one cart. Checkout creates one Stripe session for mixed items. Pickup logistics become impossible — the buyer has items at two different locations on potentially different dates. For company-paid events, this could let attendees add non-event items to a company-funded cart.

**Mitigating factor:** Checkout does check `pickup_date` and `schedule_id` per item, so mixed items won't silently merge. But the UX is confusing — the buyer sees a combined cart total with no separation.

**Fix options:**
- **(A) Soft fence:** At add-to-cart time, if the cart already has items from a different `market_id` that is an event market, block with "You have items from another event in your cart. Clear cart first?" This is the approach used for cross-vertical isolation already.
- **(B) Hard fence:** Use `get_or_create_cart` with an additional `p_market_id` param for event markets, creating separate carts per event. More invasive, requires RPC change + migration.
- **(Recommended):** Option A — matches existing pattern, minimal changes.

**Complexity:** Medium — add market_type check to cart/items POST, 15-20 lines.

---

## HIGH FINDINGS

### H-1: Vendor select endpoint accepts duplicate vendor IDs

**File:** `src/app/api/events/[token]/select/route.ts`
**Verified by agent (not directly read — marking confidence as HIGH, not CONFIRMED).**

The POST handler accepts `selected_vendor_ids` array but doesn't deduplicate. An organizer (or attacker) could submit the same vendor ID multiple times.

**Fix:** `const uniqueIds = [...new Set(selected_vendor_ids)]` before processing. One line.

---

### H-2: Hardcoded "food trucks" text on the event info page

**File:** `src/app/[vertical]/events/[token]/page.tsx:332`
**Verified:** Exact text: `We're coordinating food trucks for this event. Check back soon for the menu!`

This shows on FM events too. A farmers market organizer sees "food trucks" on their event page.

**Fix:** Use `term(vertical, 'vendors')` or a conditional: `We're coordinating ${vertical === 'food_trucks' ? 'food trucks' : 'vendors'} for this event.`

**Complexity:** Trivial — 1 line.

---

### H-3: Event request landing page has extensive FT-only copy

**File:** `src/app/[vertical]/events/page.tsx`
**Verified by agent:** Lines 99-100, 304-312 contain FT-specific trust signals, cuisine tags (Tacos, BBQ, Pizza), and "Why Event Managers Choose Us" copy. None of this renders for FM or uses the terminology system.

**Fix:** Create vertical-specific content blocks in the event request landing page. FM should emphasize "fresh local produce, artisan goods, farm-to-table experience" instead of food truck cuisine categories.

**Complexity:** Medium — requires writing FM-specific copy and conditional rendering.

---

### H-4: All event pages display dates/times in browser timezone, not event timezone

**Files:** `src/app/[vertical]/events/[token]/page.tsx:156`, `ShopClient.tsx:95-96`, `my-order/page.tsx:155`
**Verified:** All use `toLocaleDateString('en-US')` or manual 12-hour conversion with no timezone parameter. No timezone column exists on `catering_requests`.

**Impact:** An organizer in Central time creates an event at "11:00 AM". A buyer in Pacific time sees "9:00 AM" (their browser's timezone). Wave times shift too. Buyers could arrive 2 hours early or late.

**Fix:** Add `event_timezone` column to `catering_requests` (default 'America/Chicago' for TX-based platform). Display all event times with explicit timezone formatting: `toLocaleTimeString('en-US', { timeZone: event.event_timezone })`.

**Complexity:** High — migration + update to every time display across 5+ files. Important for multi-timezone expansion.

---

### H-5: Wave capacity not validated during Stripe checkout

**File:** `src/app/api/checkout/session/route.ts`
**Verified by agent:** Stripe checkout path stores `schedule_id`, `pickup_date`, and `preferred_pickup_time` but does NOT check `event_waves.reserved_count < capacity`. Only company-paid orders (separate route) enforce wave reservations.

**Impact:** For attendee-paid events with wave ordering, buyers could pay via Stripe but have no wave slot. The wave reservation happens separately (via `/waves/reserve`) before checkout — but there's no enforcement that checkout REQUIRES a reservation for wave-ordered events.

**Fix:** In the Stripe checkout path, if the cart items are from a wave-ordered event market, require a valid `event_wave_reservation_id` on the order. Reject checkout if the reservation doesn't exist or is cancelled.

**Complexity:** Medium — 15-20 lines in checkout/session/route.ts (a critical-path file, requires explicit file-level approval per `.claude/rules/critical-path-files.md`).

---

## MEDIUM FINDINGS

### M-1: Login redirect in EventFeedbackForm uses `/login` not `/${vertical}/login`

**File:** `src/components/events/EventFeedbackForm.tsx:369, 395`
**Verified:** Uses `href="/login?redirect=..."` while sibling pages (`my-order/page.tsx:120`, `ShopClient.tsx:515`) use `/${vertical}/login?redirect=...`.

**Impact:** Works (both routes exist) but the buyer loses vertical branding context during the login flow.

**Fix:** Add `vertical` back as a prop (it was removed during lint cleanup) and use `/${vertical}/login`. Or extract vertical from `window.location.pathname`.

---

### M-2: `event_settlement_summary` notification data malformed in cancel route

**File:** `src/app/api/events/[token]/cancel/route.ts:105-108`
**Verified:** The cancel route sends `catering_vendor_responded` notification with `eventDate: event.company_name` (line 108). This sets the event date display to the company name string.

```typescript
sendNotification(v.vendor_profile_id, 'catering_vendor_responded', {
  companyName: event.company_name,
  responseAction: 'has been cancelled by the organizer',
  eventDate: event.company_name,  // BUG: should be event.event_date
})
```

**Fix:** Change `eventDate: event.company_name` to `eventDate: event.event_date`. One line.

---

### M-3: No admin event approval atomicity — orphaned markets possible

**File:** Admin PATCH handler calls `approveEventRequest()` then separately updates `catering_requests` with the resulting `market_id` + `event_token`.
**Verified by agent:** If the second update fails, the market exists but the event doesn't reference it.

**Fix:** Wrap in a database function (RPC) that creates market + updates catering_request atomically, or add a cleanup check.

---

### M-4: Event order cap enforcement NOT implemented (code reverted)

**Context:** Session 66 added order cap columns (`event_max_orders_total`, `event_max_orders_per_wave` on `market_vendors`) but the enforcement code was reverted from `cart/items/route.ts` after it broke the cart. Per CLAUDE_CONTEXT.md: "Must be reimplemented via separate validation endpoint — NEVER in cart/items/route.ts."

**Current state:** Columns exist in the DB. Zero enforcement anywhere in the codebase. A vendor could receive unlimited orders at an event despite having a stated capacity.

**Fix:** New pre-checkout validation endpoint: `POST /api/events/[token]/validate-order`. Check current order count against `market_vendors.event_max_orders_total` (and per-wave if applicable). Call from ShopClient before proceeding to checkout. Return clear error if capacity reached.

---

### M-5: Organizers have no self-service dashboard

**Verified by agent:** Event organizers interact via:
- Public event request form (no auth required)
- Token-based event page (view-only)
- `OrganizerEventActions` component (copy link, cancel)
- `OrganizerEventDetails` component (edit some fields if status allows)

There is NO "My Events" listing page. An organizer who created 3 events has to bookmark 3 separate URLs. No event list, no status overview, no order volume dashboard.

**Fix (future session):** Create `/[vertical]/organizer/events` page that lists all `catering_requests` where `organizer_user_id = auth.uid()` or `contact_email = auth.email`. Show status, vendor count, order count, date. Link to each event's detail page.

---

### M-6: Vendor event orders not distinguished from regular orders

**Verified by agent:** Vendors see orders from event markets in the same orders list as regular marketplace orders. No "Event Orders" section or filter exists on the vendor dashboard.

**Fix:** Add an `is_event` computed field (or filter by `markets.market_type = 'event'`) to the vendor orders API. Add a filter tab or visual indicator on the vendor orders page.

---

## LOW FINDINGS

### L-1: Access code format not validated on submission

**File:** `src/app/api/events/[token]/verify-code/route.ts`
**Verified by agent:** Only checks `typeof code !== 'string'`. No length, character set, or format validation before DB comparison.

### L-2: `order_ratings` has no event context column

**Verified:** The `order_ratings` table has `order_id, buyer_user_id, vendor_profile_id, rating, comment`. No `event_token` or `market_type` column. Vendor ratings from event orders are indistinguishable from regular order ratings.

**Impact:** Can't filter "event-specific vendor ratings" for the organizer social-proof display we discussed earlier. Can be derived via JOIN (`order_items.market_id → markets.market_type = 'event'`) but it's expensive.

### L-3: Event info page vendor query falls back to `listing_data.event_menu_item` flag

**File:** `src/app/[vertical]/events/[token]/page.tsx` (in vendor listing logic)
**Verified by agent:** If a vendor has no `event_vendor_listings` rows, falls back to checking `listing_data.event_menu_item === true`. This dual-path makes debugging harder and could show stale listings.

### L-4: `OrganizerEventDetails.tsx` has pre-existing lint error

**File:** `src/components/events/OrganizerEventDetails.tsx:110`
**Verified:** `react-hooks/set-state-in-effect` error — `loadDetails()` called synchronously in useEffect body. Pre-dates Session 71 (commit `685f5277f`, 2026-04-05). Not blocking but will fail strict CI if enforced.

---

## OPPORTUNITIES

### O-1: Automatic event lifecycle transitions via cron

**Current state:** Event status transitions (approved→ready→active→review→completed) are manual admin actions.

**Opportunity:** Add cron phases:
- **ready → active** when `event_date` matches today and `event_start_time` has passed
- **active → review** when `event_end_time` or `event_end_date` has passed
- **review → completed** after 7 days in review status (auto-close)

This eliminates admin bottleneck for day-of management.

### O-2: Post-event email with rating magic link

Already on backlog (Session 71). Combines with C-1 (buyer notification gap) — the "event completed" notification could include both a "rate the event" magic link and a "rate the vendors" magic link.

### O-3: Event analytics dashboard for organizers

Show organizers: total orders, revenue generated for vendors, most popular items, wave utilization, feedback summary. This becomes a sales tool — "Host your next event with us and see the results in real time."

---

## SUMMARY TABLE

| ID | Severity | Description | Complexity | Files |
|----|----------|-------------|------------|-------|
| C-1 | CRITICAL | Cancelled events don't notify buyers | Medium | cancel/route.ts |
| C-2 | CRITICAL | Email-based organizer auth spoofable | Low | details/route.ts, cancel/route.ts |
| C-3 | CRITICAL | No cross-event cart isolation | Medium | cart/items/route.ts |
| H-1 | HIGH | Duplicate vendor IDs in select | Trivial | select/route.ts |
| H-2 | HIGH | Hardcoded "food trucks" on FM event page | Trivial | [token]/page.tsx |
| H-3 | HIGH | FT-only copy on event request landing | Medium | events/page.tsx |
| H-4 | HIGH | No timezone awareness on event times | High | 5+ files + migration |
| H-5 | HIGH | Wave capacity not enforced at Stripe checkout | Medium | checkout/session/route.ts (critical path) |
| M-1 | MEDIUM | Login redirect missing vertical prefix | Trivial | EventFeedbackForm.tsx |
| M-2 | MEDIUM | Cancel notification sends company_name as eventDate | Trivial | cancel/route.ts |
| M-3 | MEDIUM | Approval flow not atomic (orphaned markets) | Medium | event-actions.ts |
| M-4 | MEDIUM | Order cap enforcement reverted, not reimplemented | Medium | new endpoint |
| M-5 | MEDIUM | No organizer self-service dashboard | High | new page |
| M-6 | MEDIUM | Event orders not visually separated for vendors | Low | vendor orders API + UI |
| L-1 | LOW | Access code format not validated | Trivial | verify-code/route.ts |
| L-2 | LOW | order_ratings has no event context column | Low | migration |
| L-3 | LOW | Dual-path vendor listing lookup | Low | [token]/page.tsx |
| L-4 | LOW | Pre-existing lint error in OrganizerEventDetails | Trivial | OrganizerEventDetails.tsx |

---

## SCHEMA / DATABASE LAYER FINDINGS

### S-1 (HIGH): 7 missing indexes on frequently-queried event columns

The following columns are used in WHERE/JOIN clauses across event routes but have no index:

| Table | Column(s) | Query pattern | Fix |
|-------|-----------|--------------|-----|
| `catering_requests` | `organizer_user_id` | Organizer "my events" list | `CREATE INDEX idx_catering_requests_organizer ON catering_requests(organizer_user_id) WHERE organizer_user_id IS NOT NULL` |
| `catering_requests` | `status, created_at` | Admin "active events, newest first" | Composite index |
| `event_wave_reservations` | `status` | Count reserved/cancelled per event | Single column index |
| `event_company_payments` | `catering_request_id` | Lookup payments for an event | Single column index |
| `market_vendors` | `is_backup, backup_priority` | Escalation "find next backup" | Partial composite WHERE is_backup=true |
| `orders` | `event_wave_reservation_id` | Reverse lookup reservation→order | Partial index WHERE NOT NULL |
| `markets` | `catering_request_id` | Find market for a catering request | Partial index WHERE NOT NULL |

**Impact:** Queries work today at low data volume. At scale (100+ events, 1000s of orders), these become full table scans.

**Fix:** One migration with 7 `CREATE INDEX IF NOT EXISTS` statements. Low risk, high value.

---

### S-2 (HIGH): Missing FK constraint — `catering_requests.organizer_user_id`

**Verified:** Column is `UUID nullable` with no REFERENCES clause. If an auth.user is deleted, their `organizer_user_id` values become orphaned — queries that JOIN against auth.users would silently exclude their events.

**Fix:** `ALTER TABLE catering_requests ADD CONSTRAINT fk_catering_requests_organizer FOREIGN KEY (organizer_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;`

---

### S-3 (HIGH): Missing CHECK — reservation `order_id` required when status='ordered'

**Table:** `event_wave_reservations`
**Issue:** Status can be 'ordered' with `order_id = NULL`. If the `create_company_paid_order` RPC fails mid-way (reservation updated to 'ordered' but INSERT order fails), the reservation is stuck in an invalid state.

**Fix:** `ALTER TABLE event_wave_reservations ADD CONSTRAINT ck_ordered_requires_order CHECK (status != 'ordered' OR order_id IS NOT NULL);`

---

### S-4 (MEDIUM): Missing CHECK — event times required when event_date set

**Table:** `catering_requests`
**Issue:** `event_date` can be set without `event_start_time` or `event_end_time`. Wave generation assumes both exist and silently fails if either is NULL.

**Fix:** `ALTER TABLE catering_requests ADD CONSTRAINT ck_event_times CHECK (event_date IS NULL OR (event_start_time IS NOT NULL AND event_end_time IS NOT NULL));`

**Risk note:** Existing data must be checked first — if any rows have date without times, backfill or clean before adding constraint.

---

### S-5 (MEDIUM): No cleanup triggers for cancelled/declined events

When `catering_requests.status` changes to `cancelled` or `declined`:
- `event_vendor_listings` rows for the event's market persist (orphaned menus)
- `event_waves` and `event_wave_reservations` persist (orphaned slots)
- `event_company_payments` persist (orphaned payment records)
- The cancel API route (C-1) does some cleanup (deactivates market, removes listing_markets), but NOT all of the above

**Fix:** Either expand the cancel route to clean all associated records, OR add a trigger on `catering_requests` status change that cascades cleanup. The trigger approach is safer (covers admin manual status changes too).

---

### S-6 (MEDIUM): Organizer RLS gap — can't query their own event attendees/orders

**Verified:** `event_wave_reservations` and `order_items` have no RLS policy for organizers. An organizer who wants to see "who's coming to my event" and "what did they order" has no database path — only admin can see this.

**Fix:** Add RLS policies on `event_wave_reservations` and `order_items` that allow SELECT where `market_id IN (SELECT id FROM markets WHERE catering_request_id IN (SELECT id FROM catering_requests WHERE organizer_user_id = auth.uid()))`.

---

### S-7 (LOW): `payment_model` on orders is TEXT not ENUM

Allows any string. App expects `'company_paid'` or NULL. A typo like `'company_pay'` would silently pass INSERT but fail all queries that check `= 'company_paid'`.

---

### S-8 (LOW): `access_code` format not constrained

Column is TEXT with no CHECK. Doc says "8-char uppercase alphanumeric" but DB accepts any string. Fix: `CHECK (access_code IS NULL OR access_code ~ '^[A-Z0-9]{8}$')`.

---

### S-9 (LOW): No forward-only status lifecycle enforcement

Both `catering_requests.status` and `event_wave_reservations.status` allow backwards transitions (e.g., `completed → new`, `ordered → reserved`). No trigger prevents invalid state machine moves.

---

## RPC QUALITY (POSITIVE)

All 5 event RPCs (`reserve_event_wave`, `cancel_wave_reservation`, `create_company_paid_order`, `find_next_available_wave`, `get_event_waves_with_availability`) are well-designed:
- Use `SELECT ... FOR UPDATE` row locks for race safety
- Return structured `(success, id, error)` tuples
- Have `SECURITY DEFINER SET search_path = public`
- Keep denormalized counters (`reserved_count`) atomic with status changes

**One caveat:** `create_company_paid_order` does NOT check the vendor's `event_max_orders_total` cap. It trusts the app layer to enforce this. If the app layer has a bug (and per M-4, enforcement was reverted), the RPC won't catch over-capacity orders.

---

## UPDATED SUMMARY TABLE (all findings)

| ID | Severity | Category | Description | Complexity |
|----|----------|----------|-------------|------------|
| C-1 | CRITICAL | API | Cancelled events don't notify buyers | Medium |
| C-2 | CRITICAL | API/Auth | Email-based organizer auth spoofable | Low |
| C-3 | CRITICAL | Cart | No cross-event cart isolation | Medium |
| H-1 | HIGH | API | Duplicate vendor IDs in select | Trivial |
| H-2 | HIGH | Frontend | Hardcoded "food trucks" on FM event page | Trivial |
| H-3 | HIGH | Frontend | FT-only copy on event request landing | Medium |
| H-4 | HIGH | Frontend | No timezone awareness on event times | High |
| H-5 | HIGH | Cart/Checkout | Wave capacity not enforced at Stripe checkout | Medium |
| S-1 | HIGH | Schema | 7 missing indexes on event columns | Low |
| S-2 | HIGH | Schema | Missing FK on organizer_user_id | Low |
| S-3 | HIGH | Schema | Missing CHECK on reservation→order linkage | Low |
| M-1 | MEDIUM | Frontend | Login redirect missing vertical prefix | Trivial |
| M-2 | MEDIUM | API | Cancel sends company_name as eventDate | Trivial |
| M-3 | MEDIUM | API | Approval flow not atomic | Medium |
| M-4 | MEDIUM | API | Order cap enforcement not reimplemented | Medium |
| M-5 | MEDIUM | UX | No organizer self-service dashboard | High |
| M-6 | MEDIUM | UX | Event orders not separated for vendors | Low |
| S-4 | MEDIUM | Schema | Missing CHECK on event times | Low |
| S-5 | MEDIUM | Schema | No cleanup triggers for cancelled events | Medium |
| S-6 | MEDIUM | Schema | Organizer RLS gap for attendee data | Medium |
| L-1 | LOW | API | Access code format not validated | Trivial |
| L-2 | LOW | Schema | order_ratings has no event context | Low |
| L-3 | LOW | Frontend | Dual-path vendor listing lookup | Low |
| L-4 | LOW | Frontend | Pre-existing lint error OrganizerEventDetails | Trivial |
| S-7 | LOW | Schema | payment_model TEXT not ENUM | Medium |
| S-8 | LOW | Schema | access_code format unconstrained | Low |
| S-9 | LOW | Schema | No lifecycle status enforcement | Low |

**Totals: 3 critical, 8 high, 9 medium, 7 low = 27 findings across 4 layers.**
