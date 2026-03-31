# Day-of Event Sales — Decisions (2026-03-31)

## Cutoff Times: Approach C Selected

**Decision:** Add `event_allow_day_of_orders BOOLEAN DEFAULT false` to `markets` table.

**How it works:**
- Admin toggles this flag per event when creating/approving
- SQL function checks: if `event_allow_day_of_orders = true` AND `local_today >= event_start_date`, cutoff = 0 (accept until event ends)
- If flag is false, normal pre-order cutoff applies (admin-configurable, default 24hr)
- This is explicit opt-in — not all events want day-of ordering (some are pre-order only)

**Why C over A:** Approach A (auto-switch on event day) removes admin control. Approach C lets admin decide per event whether day-of ordering makes sense. Some events (small corporate lunch) may want pre-order only. Large festivals want day-of.

**Implementation needs:**
- Migration: add `event_allow_day_of_orders BOOLEAN DEFAULT false` to `markets`
- SQL function: one CASE branch addition in `get_available_pickup_dates()`
- Admin event UI: checkbox "Allow day-of orders (buyers can order while event is happening)"
- No cart/checkout changes

## Inventory: Vendor Guidance

**Decision:** Add support text at key touchpoints to help vendors plan for dual demand (app + walk-up).

**Where to add clarity:**
1. **Event acceptance UI** (capacity section) — "Set the number of orders you want to fulfill through the app. Plan to bring additional inventory for walk-up customers who prefer to buy in person."
2. **Vendor event confirmation email** — include a line about dual inventory planning
3. **Vendor prep reminder (24hr before)** — "You have X confirmed pre-orders. Remember to bring additional inventory for walk-up customers."
4. **Vendor dashboard event card** — show "X pre-orders confirmed" so vendor knows their app demand vs total capacity

**Key message:** "We want as many people as possible to buy through the app, but plan for walk-up customers who will not use the app until they've seen it work and appreciate the benefits."

## FM Time Slots at Events

**Decision:** Enable for all FM event vendors (not opt-in per vendor).

**Rationale:** Good value proposition for buyers (order now, pick up later, don't carry items around). Not a big ask for vendors (just hold the item).

**Implementation:**
- Shop page: change `if (!isFT ...)` gate on time slot picker to enable for events regardless of vertical
- All events use 30-min intervals (consistent across verticals, prevents half-hour boundary overlap)
- `preferred_pickup_time` already flows through cart → order_items

## Vendor-Configurable Cutoff

**Decision:** Keep at market level, admin-configurable. Remove hardcoded 48.

**Implementation:**
- Replace hardcoded `cutoff_hours: 48` in `approveEventRequest()` with a value from the event form or admin UI
- Floor: 12 hours. Ceiling: 168 hours (7 days). Default: 24 hours.
- The column `markets.cutoff_hours` already exists — just needs to be set from the form instead of hardcoded

## New Event Form Field: Vendor Stay Policy

**Decision:** Add "Can vendors leave when they sell out, or should they stay for the full event?" to event request form.

**Rationale:** Vendors want to know before accepting. Especially important for FM vendors who may sell out early.

**Options:**
- "Vendors may leave when sold out"
- "Vendors should stay for the full event duration"
- "Vendor discretion"

**Where it appears:**
- Event request form (organizer fills in)
- Vendor invitation page (disclosed before acceptance)
- Admin event detail page
