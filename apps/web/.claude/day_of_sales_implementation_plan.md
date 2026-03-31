# Day-of Event Sales — Implementation Plan

## Overview
Five work items, ordered by dependency. No changes to cart API, checkout, or payment files.

---

## Step 1: Migration — New Columns
**File:** New migration `20260331_108_day_of_sales_and_vendor_stay.sql`

```sql
-- Add day-of ordering flag to markets
ALTER TABLE markets ADD COLUMN IF NOT EXISTS event_allow_day_of_orders BOOLEAN NOT NULL DEFAULT false;

-- Add vendor stay policy to catering_requests
ALTER TABLE catering_requests ADD COLUMN IF NOT EXISTS vendor_stay_policy TEXT;
-- Values: 'may_leave_when_sold_out', 'stay_full_event', 'vendor_discretion'

COMMENT ON COLUMN markets.event_allow_day_of_orders IS
  'When true AND local_today >= event_start_date, cutoff switches to 0 '
  '(accepting orders until event ends). Admin/self-service sets at creation. '
  'No admin action needed on event day — date-driven in SQL function.';

COMMENT ON COLUMN catering_requests.vendor_stay_policy IS
  'Organizer preference for vendor departure. Disclosed on vendor invitation page. '
  'may_leave_when_sold_out | stay_full_event | vendor_discretion';

NOTIFY pgrst, 'reload schema';
```

**Depends on:** Nothing
**Risk:** None — additive columns, default false/null

---

## Step 2: SQL Function Update — Day-of Cutoff Logic
**File:** New migration `20260331_109_day_of_cutoff_function.sql`

Recreate `get_available_pickup_dates()` with one change in the cutoff_hours CASE:

```sql
-- CURRENT (line 60-69 of migration 105):
CASE
  WHEN m.vertical_id = 'food_trucks' AND m.market_type != 'event' THEN 0
  ELSE COALESCE(m.cutoff_hours,
    CASE
      WHEN m.market_type = 'event' THEN 24
      WHEN m.market_type = 'private_pickup' THEN 10
      ELSE 18
    END
  )
END as cutoff_hours,

-- NEW:
CASE
  WHEN m.vertical_id = 'food_trucks' AND m.market_type != 'event' THEN 0
  WHEN m.market_type = 'event'
    AND m.event_allow_day_of_orders = true
    AND (NOW() AT TIME ZONE COALESCE(m.timezone, 'America/Chicago'))::DATE >= m.event_start_date
  THEN 0  -- Day-of: accepting until event ends
  ELSE COALESCE(m.cutoff_hours,
    CASE
      WHEN m.market_type = 'event' THEN 24
      WHEN m.market_type = 'private_pickup' THEN 10
      ELSE 18
    END
  )
END as cutoff_hours,
```

**How it works:**
- Before event day: falls through to ELSE → uses `cutoff_hours` (admin-set or 24hr default)
- On event day with flag ON: returns 0 → `cutoff_at = pickup_end_utc` → accepting until event ends
- On event day with flag OFF: falls through to ELSE → stays closed after cutoff
- After event: `pickup_end_utc > NOW()` blocks everything regardless

**Depends on:** Step 1 (column must exist)
**Risk:** Low — additive CASE branch, existing logic untouched. Rollback = re-run migration 105 function.
**Verify against prod:** Must pull current `prosrc` from prod before writing migration (lesson from Session 66).

---

## Step 3: Remove Hardcoded Cutoff + Wire Up New Fields
**Files to modify:**

### 3a. Event creation — `src/lib/events/event-actions.ts:approveEventRequest()`
- Change `cutoff_hours: 48` to `cutoff_hours: request.cutoff_hours || 24`
- Add `event_allow_day_of_orders: request.event_allow_day_of_orders || false`
- Add `cutoff_hours` and `event_allow_day_of_orders` to `CateringRequest` interface

### 3b. Event request form — `src/components/events/EventRequestForm.tsx`
- Add cutoff hours field: dropdown with options 12, 24, 48, 72, 168hr (default 24)
- Add day-of ordering toggle: "Allow attendees to order during the event" (default ON for festivals/grand openings, OFF for corporate)
- Add vendor stay policy: radio buttons (may_leave_when_sold_out, stay_full_event, vendor_discretion)
- All three fields submitted in the POST body

### 3c. Event request API — `src/app/api/event-requests/route.ts`
- Accept `cutoff_hours`, `event_allow_day_of_orders`, `vendor_stay_policy` from body
- Validate cutoff_hours: floor 12, ceiling 168, default 24
- Store `vendor_stay_policy` on catering_requests
- Pass `cutoff_hours` and `event_allow_day_of_orders` to `approveEventRequest()` via requestData

### 3d. Admin event UI — `src/app/[vertical]/admin/events/page.tsx`
- Show cutoff_hours, day-of flag, vendor stay policy in event detail panel
- Editable by admin before event day

**Depends on:** Step 1 (columns exist)
**Risk:** Low — form fields, no critical path files

---

## Step 4: FM Time Slots at Events
**Files to modify:**

### 4a. Shop page — `src/app/[vertical]/events/[token]/shop/page.tsx`
- Change time slot gate from `if (!isFT || ...)` to `if (!schedule?.start_time || !schedule?.end_time) return []`
- This enables time slots for ALL event types (FM + FT)
- All events use 30-min intervals (prevents half-hour boundary overlap, simpler logic).

```typescript
// CURRENT:
const timeSlots = useMemo(() => {
  if (!isFT || !schedule?.start_time || !schedule?.end_time) return []
  ...
}, [...])

// NEW:
const timeSlots = useMemo(() => {
  if (!schedule?.start_time || !schedule?.end_time) return []
  // All events: 30-min slots (consistent, avoids half-hour boundary overlap)
  const defaultInterval = 30
  ...
}, [...])
```

### 4b. Time slot label for FM
- FT label: "What time do you want your food ready?"
- FM label: "When would you like to pick up your items?"

### 4c. Cart add validation
- `cart/items/route.ts` already validates `preferredPickupTime` for FT at line 171-179
- Need to check: does this validation block FM? It checks `if (vertical === 'food_trucks')` — so FM bypasses it. But now FM events will send a pickup time. Need to extend the validation to accept pickup times for event markets regardless of vertical.

**CRITICAL PATH FILE: `cart/items/route.ts`** — the pickup time validation change at line 171 touches this file. Per the critical-path-files rule:
- File: `src/app/api/cart/items/route.ts`
- Risk: If validation rejects FM event pickup times, buyers can't add items to cart
- Change: extend `if (vertical === 'food_trucks')` to `if (vertical === 'food_trucks' || (marketData?.market_type === 'event' && preferredPickupTime))`
- Must show exact diff, get explicit file-level approval before editing

**Depends on:** Nothing (can be done independently)
**Risk:** Medium — touches cart validation (critical path file, requires explicit approval)

---

## Step 5: Vendor Guidance Text + Stay Policy Disclosure
**Files to modify:**

### 5a. Vendor event acceptance UI — `src/app/[vertical]/vendor/events/[marketId]/page.tsx`
- Add text below capacity section: "Set the number of orders you want to fulfill through the app. Plan to bring additional inventory for walk-up customers who prefer to buy in person."
- Show vendor stay policy from event data (if set)

### 5b. Vendor event GET API — `src/app/api/vendor/events/[marketId]/route.ts`
- Add `vendor_stay_policy` to the response (from catering_requests)

### 5c. Vendor invitation page
- Disclose stay policy: "The organizer requests that vendors [stay for the full event / may leave when sold out / use their discretion]"
- Show alongside event details (date, time, headcount)

### 5d. Prep reminder notification (cron Phase 11)
- Include pre-order count in the reminder: "You have X confirmed pre-orders for tomorrow's event"
- Requires querying order_items count for the vendor at this market

### 5e. Vendor dashboard event card
- Show "X pre-orders" count on the event card in the vendor dashboard

**Depends on:** Step 1 (vendor_stay_policy column)
**Risk:** Low — UI text and API response additions

---

## Implementation Order

| Step | What | Migration? | Critical Path? | Depends On |
|------|------|-----------|----------------|------------|
| **1** | Column migration | Yes (108) | No | Nothing |
| **2** | SQL function update | Yes (109) | No | Step 1 |
| **3** | Form fields + wiring | No | No | Step 1 |
| **4** | FM time slots | No | **Yes** (cart validation) | Nothing |
| **5** | Vendor guidance text | No | No | Step 1 |

**Recommended batch order:**
- **First:** Steps 1 + 2 (migrations, apply to all envs)
- **Second:** Step 3 (form + wiring — largest code change, no risk)
- **Third:** Step 5 (vendor text — easy, high UX value)
- **Fourth:** Step 4 (FM time slots — needs careful cart file approval)

---

## What Does NOT Change

| Component | Why |
|-----------|-----|
| `cart/items/route.ts` | Only Step 4c touches it — and only the pickup time validation, not the add-to-cart logic |
| `checkout/session/route.ts` | No changes — orders flow through normally |
| `pricing.ts` | No fee changes |
| `stripe/payments.ts` | No payment changes |
| `atomic_decrement_inventory` | Same inventory logic |
| `validate_cart_item_schedule` | Unchanged — it calls `get_available_pickup_dates()` which handles the new logic |
| `validate_cart_item_inventory` | Unchanged |
| Regular market/private pickup ordering | Untouched — new CASE branch only fires for `market_type = 'event'` |

---

## Testing Checklist

- [ ] Pre-orders work normally when `event_allow_day_of_orders = false`
- [ ] Pre-orders close at configurable cutoff (not hardcoded 48hr)
- [ ] Day-of orders open automatically on event day when flag = true
- [ ] Day-of orders stay closed on event day when flag = false
- [ ] Day-of orders close when event ends (`pickup_end_utc`)
- [ ] No admin action required on event day
- [ ] FM event buyers see 60-min time slot picker
- [ ] FT event buyers see 30/15-min time slot picker (unchanged)
- [ ] Regular FM markets NOT affected (no time slots)
- [ ] Regular FT parks NOT affected (same-day ordering unchanged)
- [ ] Vendor stay policy appears on invitation page
- [ ] Vendor capacity section shows guidance text
- [ ] Prep reminder includes pre-order count
