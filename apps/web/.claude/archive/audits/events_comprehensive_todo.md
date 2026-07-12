# Events System — Comprehensive TODO List
**Session 71 | 2026-04-12**
**Source:** 4 end-to-end flow traces (company-paid, hybrid, attendee-paid, wave/admin lifecycle) + surface-level audit from earlier this session. All findings verified against actual code.

---

## How to read this list

- **BROKEN** = code exists but doesn't work, or flow hits a dead end
- **MISSING** = no code exists for a required step
- **FRAGILE** = works but has race conditions, no validation, or depends on manual steps
- **POLISH** = works but has UX/copy/consistency issues

Items within each tier are roughly ordered by impact.

---

## Tier 0 — Broken / Non-Functional (fix before any event goes live)

### T0-1: Hybrid payment flow is a dead end
**Status:** BROKEN — config works, checkout does not
**What:** `payment_model='hybrid'` is selectable on the event form and stored correctly. Access codes generate. But:
- `/api/events/[token]/order` explicitly rejects hybrid (line 57: `payment_model !== 'company_paid'`)
- `/api/checkout/session` has zero hybrid logic — no split payment, no cap check
- No RPC exists for hybrid order creation
- No UI shows "Company pays $X, you pay the rest"

**Impact:** An organizer who selects hybrid will have attendees unable to order.

**Fix:** Either (A) implement the full split-payment flow (high complexity — new RPC, modified checkout, new UI), or (B) temporarily hide 'hybrid' from the form and add a backlog item for proper implementation.

**Recommendation:** Option B for now. Hybrid is a complex feature that deserves its own dedicated session. Hiding the option prevents organizer confusion.

---

### T0-2: Event cancellation does not notify buyers or refund payments
**Status:** BROKEN — cancel route only notifies vendors
**Files:** `api/events/[token]/cancel/route.ts:96-114`, `api/admin/events/[id]/route.ts:176`
**What:** When an event is cancelled (by organizer or admin):
- Accepted vendors get notified ✓
- Admin gets an email ✓
- Buyers who already paid get NOTHING — no notification, no refund
- Company-paid orders stay in 'confirmed' status forever

**Impact:** Buyers show up to a cancelled event. Stripe-paid buyers lose money.

**Fix:**
1. Query `orders` + `order_items` for the event's market_id
2. For each buyer: send `event_cancelled_buyer` notification (new type)
3. For Stripe-paid orders: initiate refund or flag for manual refund
4. For company-paid orders: mark as cancelled

---

### T0-3: Cancel notification sends company_name as eventDate
**Status:** BROKEN — one-line bug
**File:** `api/events/[token]/cancel/route.ts:108`
**What:** `eventDate: event.company_name` — copies company name into the date field
**Fix:** Change to `eventDate: event.event_date`

---

## Tier 1 — Missing Financial Controls (fix before company-paid events go live)

### T1-1: No per-attendee spending cap enforcement (server-side)
**Status:** MISSING
**What:** `company_max_per_attendee_cents` is stored on `catering_requests` and returned by the access code endpoint, but:
- `create_company_paid_order` RPC does not check it
- No server-side validation prevents unlimited spending per attendee
- Frontend check only (bypassable)

**Fix:** Add cap check to the `create_company_paid_order` RPC: before creating order, query total `subtotal_cents` for this user + market. If adding this item exceeds cap, reject.

---

### T1-2: No company budget validation at order time
**Status:** MISSING
**What:** No check that the company has paid enough to cover all orders. Attendees can place orders even if company payment hasn't been recorded. No field for `company_total_budget_cents`.

**Fix:** Either (A) add a total budget field and check at order time, or (B) accept this as "orders on credit" and reconcile at settlement. If (B), make this explicit in the admin UI.

---

### T1-3: Fee structure for company-paid events undefined
**Status:** MISSING
**What:** `create_company_paid_order` sets `buyer_fee_cents: 0` and `service_fee_cents: 0`. Vendor gets 100% of subtotal. Platform earns nothing on company-paid orders.

**Impact:** No revenue from company-paid events (the highest-value event type).

**Decision needed:** Who pays the platform fee — company or vendor? Options:
- (A) Company pays: add platform fee on top of subtotal in settlement
- (B) Vendor pays: deduct from vendor_payout_cents (same as regular orders)
- (C) Flat event fee only ($75/truck): no per-order fee

---

### T1-4: No vendor payout mechanism for events
**Status:** MISSING
**What:** Settlement notification tells vendors their total but no actual transfer happens. For regular orders, Stripe transfers are triggered by fulfill/webhook. For company-paid events, there's no Stripe checkout and no transfer mechanism.

**Fix:** After event completion + company payment confirmed, create vendor_payouts entries and initiate Stripe transfers (or manual payout process).

---

### T1-5: No payment-to-order linkage
**Status:** MISSING
**What:** `event_company_payments` tracks deposits/settlements. `orders` tracks attendee orders. No FK or field connects them. Can't reconcile which payment covers which orders.

**Fix:** Add `event_company_payment_id` FK to `orders`, or create a join table.

---

## Tier 2 — Wave System Gaps (fix before wave-ordered events go live)

### T2-1: No timeout on wave reservations
**Status:** FRAGILE
**What:** A user can reserve a wave slot, never place an order, and hold it indefinitely. No expiration timestamp. No cron cleanup.

**Impact:** At a busy event, 10 people could reserve all slots and never order, blocking real attendees.

**Fix:** Add `expires_at` column to `event_wave_reservations` (default: reserved_at + 10 minutes). Add cron phase to cancel expired reservations and free slots.

---

### T2-2: Wave capacity not enforced at Stripe checkout (H-5)
**Status:** FRAGILE — critical-path file
**What:** If `wave_ordering_enabled=true` but `payment_model='attendee_paid'`, buyers checkout via standard Stripe with no wave validation. They bypass the wave system entirely.

**Impact:** Wave capacity limits become advisory, not enforced.

**Fix:** In checkout/session, if items are from a wave-ordered event market, require `event_wave_reservation_id`. This touches `checkout/session/route.ts` — a critical-path file requiring explicit file-level approval.

---

### T2-3: Wave generation is manual only
**Status:** FRAGILE
**What:** Admin must manually click "Generate Waves" after vendors accept. No automatic trigger. If admin forgets, event day arrives with `wave_ordering_enabled=false`.

**Fix:** Either (A) auto-generate waves when status transitions to 'ready', or (B) add a pre-event checklist that blocks 'active' transition without waves.

---

### T2-4: Walk-up flow not implemented
**Status:** MISSING
**What:** RPC `find_next_available_wave` exists but is never called. No UI for walk-up attendees (people who show up without a reservation).

**Fix:** Add walk-up reservation UI (admin or self-service kiosk) that calls the existing RPC.

---

### T2-5: Orphaned reservations after order cancellation
**Status:** FRAGILE
**What:** If a company-paid order is cancelled, the `event_wave_reservation` stays at status='ordered' with the cancelled order_id. The wave slot is never freed.

**Fix:** When an order at an event market is cancelled, update the linked reservation back to 'reserved' or 'cancelled', and decrement the wave's `reserved_count`.

---

### T2-6: Wave capacity fixed at generation time
**Status:** FRAGILE
**What:** All waves get the same capacity, calculated once from vendor `event_max_orders_per_wave` sums at generation time. If a vendor later updates their capacity or a new vendor accepts, waves are NOT recalculated.

**Fix:** Add a "Recalculate wave capacity" admin action, or recalculate automatically when vendor caps change.

---

## Tier 3 — Admin Workflow Gaps

### T3-1: Auto-invite not triggered on admin approval
**Status:** MISSING
**What:** Admin PATCH to 'approved' calls `approveEventRequest()` (creates market + token) but does NOT call `autoMatchAndInvite()`. Vendors must be manually selected. Self-service events DO auto-invite (in the event-requests route).

**Fix:** Add `autoMatchAndInvite()` call after approval in the admin PATCH handler (for full-service events).

---

### T3-2: No notification to organizer on decline
**Status:** MISSING
**What:** Admin can decline an event (status='declined') but no notification is sent to the organizer. They find out only if they check the event page.

**Fix:** Send email/notification to `contact_email` when status changes to 'declined', with optional reason from `admin_notes`.

---

### T3-3: No notification to organizer on status changes
**Status:** MISSING
**What:** Organizer is only notified on 'ready' (when vendors accept). No notification for: approved, active, review, completed.

**Fix:** Add organizer notifications for key transitions: approved ("we're finding vendors"), active ("your event is live"), completed ("event wrapped up, here's a summary").

---

### T3-4: Approval flow not atomic (orphaned markets possible)
**Status:** FRAGILE
**What:** `approveEventRequest()` creates a market, then a separate UPDATE sets `market_id` on catering_requests. If the UPDATE fails, the market is orphaned.

**Fix:** Wrap in an RPC or use a transaction.

---

### T3-5: Access code verification is frontend-only
**Status:** FRAGILE
**What:** The access code is verified client-side via `/api/events/[token]/verify-code`, but `create_company_paid_order` RPC does not re-verify it. A user who bypasses the UI could place orders without knowing the code.

**Fix:** Pass `access_code` to the order endpoint and verify server-side before creating the order.

---

## Tier 4 — Cross-Event & Cart Issues

### T4-1: No cross-event cart isolation (C-3)
**Status:** FRAGILE
**What:** `get_or_create_cart` takes only `vertical_id`. Items from different events (or events + regular markets) can mix in one cart.

**Fix:** At add-to-cart time, if cart has items from a different event market, block with an error message.

---

### T4-2: Event order cap enforcement not reimplemented (M-4)
**Status:** MISSING — reverted in Session 66
**What:** `event_max_orders_total` and `event_max_orders_per_wave` columns exist on `market_vendors` but enforcement code was removed from `cart/items/route.ts` after it broke the cart. Never reimplemented via separate endpoint.

**Fix:** New pre-checkout validation endpoint that checks caps. Call from ShopClient before checkout.

---

## Tier 5 — UX & Polish

### T5-1: Hardcoded FT text on event info page
**Status:** DONE (Session 71) ✅

### T5-2: FM-specific copy on event request landing
**Status:** DONE (Session 71) ✅

### T5-3: Login redirect in EventFeedbackForm missing vertical prefix (M-1)
**Status:** POLISH
**File:** `EventFeedbackForm.tsx:369`
**Fix:** Use `/${vertical}/login` instead of `/login`. Requires adding vertical back as a prop.

---

### T5-4: No organizer self-service dashboard (M-5)
**Status:** MISSING
**What:** Organizers manage events via token-based URLs. No "My Events" listing page.

**Note:** Dashboard already has "My Events" section for logged-in organizers (auto-linked via email). The gap is: no way to manage events (approve vendors, edit details) from the dashboard — those actions require the token URL.

---

### T5-5: Event orders not visually separated for vendors (M-6)
**Status:** POLISH
**What:** Vendor orders page mixes event orders with regular marketplace orders.
**Fix:** Add `is_event` filter/badge based on `markets.market_type='event'`.

---

### T5-6: No timezone awareness on event times (H-4)
**Status:** MISSING
**What:** All event times display in browser timezone. No `event_timezone` column.
**Fix:** Add column + display formatting. Important for multi-timezone expansion.

---

## Tier 6 — Schema & Data Integrity

### T6-1: Missing CHECK on event times (S-4)
**Status:** FRAGILE
**What:** `event_date` can be set without `event_start_time` or `event_end_time`. Wave generation fails silently.
**Fix:** `CHECK (event_date IS NULL OR (event_start_time IS NOT NULL AND event_end_time IS NOT NULL))`

---

### T6-2: No cleanup triggers for cancelled events (S-5)
**Status:** MISSING
**What:** `event_vendor_listings`, `event_waves`, `event_wave_reservations` persist when an event is cancelled.
**Fix:** Expand cancel route to clean all associated records, or add a trigger.

---

### T6-3: Organizer RLS gap for attendee data (S-6)
**Status:** MISSING
**What:** Organizers can't query their own event's wave reservations or order items via RLS.
**Fix:** Add RLS policies for organizer SELECT on these tables.

---

### T6-4: Per-vendor per-wave capacity not enforced in DB
**Status:** FRAGILE
**What:** Wave capacity is global (sum of all vendors). Individual vendor `event_max_orders_per_wave` is stored but not enforced — a single vendor could get all orders in a wave.
**Fix:** Add per-vendor tracking at order creation time.

---

## Summary by Flow

| Flow | Status | Blocking Items |
|------|--------|----------------|
| **Attendee-paid** | ~95% functional | T0-2 (cancel/refund), T4-1 (cart isolation) |
| **Company-paid** | ~60% functional | T0-2, T1-1 through T1-5, T2-1, T2-5, T3-5 |
| **Hybrid** | ~20% — dead end | T0-1 (entire checkout flow missing) |
| **Wave system** | ~75% functional | T2-1 (no timeout), T2-2 (Stripe bypass), T2-3 (manual gen) |
| **Admin lifecycle** | ~80% functional | T3-1 (no auto-invite), T3-2/T3-3 (missing notifications) |

## Recommended Priority Order

**Before any event goes live:**
1. T0-1 (hide hybrid option — 5 min)
2. T0-2 (cancel buyer notifications — 1 hour)
3. T0-3 (eventDate bug — 1 min)

**Before company-paid events go live:**
4. T1-1 (per-attendee cap enforcement)
5. T1-3 (fee structure decision — business decision, then code)
6. T2-1 (wave reservation timeout)
7. T3-5 (server-side access code verification)
8. T2-5 (orphaned reservation cleanup)

**Before scale/beta:**
9. T4-1 (cart isolation)
10. T2-2 (wave enforcement at Stripe checkout)
11. T3-1 (auto-invite on admin approval)
12. T1-4 (vendor payout mechanism)
13. T4-2 (order cap reimplementation)

**Polish:**
14. Everything in Tier 5-6
