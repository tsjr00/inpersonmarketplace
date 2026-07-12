# Day-of Event Sales — Feasibility Analysis
**Date:** 2026-03-31 (Session 66)
**Status:** Research only — no code changes

---

## What's Being Explored

Event managers suggest the 48-hour pre-order cutoff leaves money on the table. Many event attendees decide what to buy when they arrive, not days before. Can the app serve those people while preserving the guaranteed pre-order flow?

**Two tiers of event sales:**
- **Pre-orders (Guaranteed Sales):** Days before the event, hard cutoff at 24hr before start. Vendor confirms, prepares, marks ready. Buyer picks up at event.
- **Day-of Sales (Event Sales):** While the event is happening. Buyer browses on their phone, orders, picks up at a time slot or before the event ends. No waiting in line, no walking to every booth.

---

## How the System Currently Works (Verified from Code)

### The Cutoff Mechanism
`get_available_pickup_dates()` (migration 105) controls when orders are accepted:

```sql
-- Event cutoff logic (listing_schedules CTE, line 60-69)
CASE
  WHEN m.vertical_id = 'food_trucks' AND m.market_type != 'event' THEN 0  -- FT parks: no cutoff
  ELSE COALESCE(m.cutoff_hours,
    CASE
      WHEN m.market_type = 'event' THEN 24       -- Event default fallback
      WHEN m.market_type = 'private_pickup' THEN 10
      ELSE 18
    END
  )
END as cutoff_hours
```

Then in `with_cutoff`:
```sql
CASE
  WHEN cutoff_hours = 0 THEN pickup_end_utc       -- Accepting until event ends
  ELSE pickup_start_utc - (cutoff_hours || ' hours')::INTERVAL  -- Advance cutoff
END as cutoff_at
```

And the final filter:
```sql
WHERE pickup_end_utc > NOW()  -- Event hasn't ended
-- is_accepting = (NOW() < cutoff_at)
```

**Current behavior for an event starting at 11am CT on April 11:**
- `markets.cutoff_hours = 48` (hardcoded at creation)
- `cutoff_at = April 11 11:00am CT - 48hr = April 9 11:00am CT`
- After April 9 11am: `is_accepting = false`
- **Result: No orders accepted for 2 full days before the event**

### What FT Parks Already Do
FT parks use `cutoff_hours = 0`, which means `cutoff_at = pickup_end_utc` — accepting orders until the truck closes. This is the exact behavior needed for day-of event sales.

### Existing Infrastructure

| Component | What Exists | Status |
|-----------|-------------|--------|
| `markets.cutoff_hours` | Per-market cutoff, used by pickup dates function | Currently hardcoded to 48 at event creation |
| `preferred_pickup_time` | On `cart_items` and `order_items` | Used by FT for 30-min time slots. Not used by FM. |
| `event_max_orders_total` | Per-vendor order cap on `market_vendors` | New (migration 106). Enforces vendor capacity. |
| `event_max_orders_per_wave` | Per-vendor per-time-slot cap on `market_vendors` | New (migration 106). FT only currently. |
| `market_schedules` | Event has one schedule entry with start/end time | Defines the event window and time slot boundaries |
| `listings.quantity` | Universal inventory per listing | Shared across all markets. Decremented atomically at checkout. |
| Event status `active` | Auto-transitions on event day (cron Phase 14) | Could serve as day-of trigger |
| Time slot generation | Shop page generates 30-min or 15-min slots from schedule | Currently FT-only (`isFT` check in shop page) |
| `pickup_end_utc > NOW()` | Final filter in pickup dates function | Already ensures orders stop when event ends |

---

## The Key Insight: `cutoff_hours = 0` Already Does What Day-of Needs

The FT park pattern (`cutoff_hours = 0`) means "accept orders until the event/market ends." If an event's cutoff drops to 0 on the day of, orders would be accepted until `pickup_end_utc` (the event end time). No new mechanism needed — the existing system handles it.

The question is: **how to have a 24hr cutoff for pre-orders AND a 0hr cutoff for day-of, on the same event.**

---

## Three Approaches

### Approach A: Phase-Based Cutoff in the SQL Function
**Change:** One modification to `get_available_pickup_dates()` — the cutoff logic checks if today is the event date:

```sql
CASE
  WHEN m.market_type = 'event'
    AND (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE >= m.event_start_date
  THEN 0  -- Day of event: accepting until event ends (like FT parks)
  WHEN m.market_type = 'event'
  THEN COALESCE(m.cutoff_hours, 24)  -- Before event: standard pre-order cutoff
  WHEN m.vertical_id = 'food_trucks' AND m.market_type != 'event'
  THEN 0  -- FT parks: existing behavior
  ELSE COALESCE(m.cutoff_hours, ...)  -- Everything else: existing behavior
END as cutoff_hours
```

**What this gives you:**
- Days before event: orders close at the cutoff (24hr default, or vendor-configured)
- Event day: orders reopen and stay open until the event end time
- After event: `pickup_end_utc > NOW()` blocks everything — no change needed

**Pros:**
- Smallest possible change (one CASE modification in SQL function)
- No new tables, columns, schedules, or market types
- The `event_max_orders_total` cap still enforces capacity regardless of when orders come in
- Regular market/private pickup behavior completely untouched

**Cons:**
- Pre-orders and day-of orders are indistinguishable in the order data
- Can't report "40 pre-orders + 22 day-of orders" without looking at timestamps
- One cutoff value serves both phases (can't have 72hr pre-order cutoff AND day-of)

### Approach B: Two Schedules Per Event
**Change:** Create two `market_schedules` entries when the event is approved:

| Schedule | Purpose | cutoff_hours | Effect |
|----------|---------|-------------|--------|
| Schedule 1 ("Pre-order") | Advance ordering | 24 (or vendor-set) | Closes 24hr before |
| Schedule 2 ("Day-of") | Same-day ordering | 0 | Open until event ends |

Both have the same `day_of_week`, `start_time`, `end_time`. Different `cutoff_hours` and potentially a label column.

**What this gives you:**
- Cart items reference different `schedule_id` values → pre-orders vs day-of are distinguishable
- Vendors see separate order groups ("Pre-orders" vs "Day-of")
- Reporting is clean — each order type is traceable
- The shop page could label sections differently based on which schedule is accepting

**Pros:**
- Clean data separation between pre-orders and day-of
- Works within existing infrastructure (no new tables)
- Each schedule can have its own cutoff independently
- Easy to extend: could add a "last-minute" schedule with 2hr cutoff

**Cons:**
- More complex event creation (two schedules instead of one)
- Shop page needs to know which schedule to use at which time
- `event_max_orders_total` enforcement needs to work across both schedules (it currently counts by `market_id`, not `schedule_id`, so this already works)
- Cart items from different schedules but same market might trigger the "mixed market types" warning

### Approach C: Flag on `markets` table
**Change:** Add `event_allow_day_of_orders BOOLEAN DEFAULT false` to `markets`. The SQL function checks this flag on event day to switch cutoff to 0.

**Pros:** Explicit opt-in per event, configurable by admin
**Cons:** Adds a column for a single CASE check that Approach A handles without a column

---

## Recommended: Approach A for Speed, Approach B for Data

**If you want this fast with minimal risk:** Approach A. One SQL function change, no new infrastructure. Day-of orders happen transparently — the system just stops blocking them on event day.

**If you want to report on and differentiate pre-orders vs day-of:** Approach B. Two schedules per event give clean data separation. More setup complexity but the reporting and vendor communication is better.

**Both approaches can coexist:** Start with A (unblock day-of sales quickly), then add schedule-based separation later when reporting needs it.

---

## Inventory: How Dual Demand Works

The user's concern: vendor says 100 available for pre-order, gets 40, can the remaining 60 sell day-of?

**Current system:**
- `listings.quantity` = vendor's total app inventory (e.g., 200 loaves)
- `event_max_orders_total` = vendor's event commitment (e.g., 100)
- After 40 pre-orders: listing quantity drops to 160, event cap has 60 remaining
- Day-of: the 60 remaining capacity is available (cap enforcement checks total orders for that vendor at that event, regardless of when they were placed)
- The vendor's other 100 loaves remain for in-person sales — the app never touches them

**The cap IS the app-side inventory for this event.** `listings.quantity` is the global limit. `event_max_orders_total` is the event-specific limit. Whichever hits first blocks the order. This is already correct for both pre-orders and day-of.

**In-person sales conflict:** If a vendor sells an item in-person that a buyer just purchased in the app, the app has no way to know. This is inherent to any system where the vendor has dual sales channels. The mitigation:
- The vendor's `event_max_orders_total` should be set conservatively (e.g., 60% of what they bring, reserving 40% for walk-up)
- A future feature could let vendors "pause app sales" from their phone with one tap — but that's a separate project

---

## FM Time Slots at Events

**What exists:** The shop page generates time slots from the event schedule and shows a picker. Currently gated by `isFT` (shop page line 147):

```typescript
const timeSlots = useMemo(() => {
  if (!isFT || !schedule?.start_time || !schedule?.end_time) return []
  // ...generates 30-min or 15-min slots...
}, [isFT, schedule, vendors, quantities])
```

**What it would take to enable for FM events:**
- Change `if (!isFT ...` to `if ((!isFT && !isEvent) ...` or make it configurable per-event
- FM event attendees could select "Ready at 2:00 PM" when ordering
- The vendor holds the item until that time — buyer shops the event hands-free
- `preferred_pickup_time` is already stored on `cart_items` and `order_items` regardless of vertical

**FM-specific consideration:** FM items don't need cooking lead time, so the time slot is purely "when do you want to pick this up?" rather than "when should I start cooking?" The vendor just sets it aside. The interval could be longer (60 min instead of 30 min) since there's no prep window.

**Per-vendor opt-in:** Not all FM vendors at an event may want to offer hold-for-pickup. This could be a checkbox during event acceptance: "Offer hold-for-pickup time slots" — stored on `market_vendors` as a boolean.

---

## Vendor-Configurable Cutoff

Event managers suggested the cutoff time should be vendor-determined (with floor/ceiling). Options:

| Approach | Where Stored | Scope |
|----------|-------------|-------|
| Per-event (admin sets) | `markets.cutoff_hours` | All vendors at this event share the cutoff |
| Per-vendor (vendor sets at acceptance) | `market_vendors.vendor_cutoff_hours` (new) | Each vendor has their own cutoff |
| Per-event with override | `markets.cutoff_hours` default, `market_vendors.vendor_cutoff_hours` override | Flexible |

**Per-vendor cutoff would require:** The `get_available_pickup_dates()` function joins `market_vendors` in addition to `listing_markets`, `listings`, `markets`, and `market_schedules`. This adds a join to a performance-critical function that runs on every cart add and every browse page. The join would need `vendor_profile_id` from `listings` to match the correct `market_vendors` row.

**Simpler alternative:** Keep cutoff at the market level (per-event, admin-configurable). Replace the hardcoded 48 with a field set during event creation. Floor: 12 hours. Ceiling: 168 hours (7 days). Most events will use 24 hours. This requires no SQL function changes — the function already reads `m.cutoff_hours`.

---

## What Changes Would Be Needed (Summarized)

### For Day-of Sales (Approach A — minimal):
1. **SQL function change** — one CASE modification in `get_available_pickup_dates()` to set `cutoff_hours = 0` when `local_today >= event_start_date`
2. **No app code changes** — cart, checkout, orders all work as-is
3. **No new columns or tables**

### For FM Time Slots at Events:
1. **Shop page** — remove `isFT` gate on time slot picker, add event-aware flag
2. **Vendor acceptance UI** — optional "offer hold-for-pickup" checkbox
3. **`market_vendors`** — new boolean column `event_offer_timeslots` (or similar)
4. **No cart/checkout changes** — `preferred_pickup_time` already flows through

### For Vendor-Configurable Cutoff:
1. **Remove hardcoded 48** from `approveEventRequest()` and admin PATCH
2. **Admin UI** — cutoff field during event setup (or use existing `markets.cutoff_hours` column)
3. **No SQL function changes** — already reads `m.cutoff_hours`

### For Two-Schedule Data Separation (Approach B — for reporting):
1. **Event creation** — insert two schedules instead of one
2. **Shop page** — show which schedule is active, label sections
3. **Vendor dashboard** — group orders by schedule (pre-order vs day-of)
4. **No cart/checkout changes** — schedule_id already distinguishes

---

## Risk Assessment

| Change | Touches Critical Path? | Risk Level |
|--------|----------------------|------------|
| SQL function cutoff modification | No (function, not cart API) | Low — additive CASE branch, existing logic untouched |
| FM time slot enablement | Shop page only | Low — visual change, existing data flow |
| Remove hardcoded cutoff | Event creation code only | Low — column already exists |
| Two-schedule creation | Event creation + shop page | Medium — more moving parts |
| Vendor-configurable cutoff (per-vendor) | SQL function join change | High — performance-critical function, adds join |

None of these require touching `cart/items/route.ts`, `checkout/session/route.ts`, or any payment file.
