# Comprehensive Pickup Scheduling Implementation Plan

**Created:** 2026-02-05
**Status:** Ready for Implementation
**Scope:** Fix availability logic, implement per-date pickup selection, preserve performance optimizations

---

## Table of Contents

1. [Problem Summary](#problem-summary)
2. [Root Cause Analysis](#root-cause-analysis)
3. [Design Decisions](#design-decisions)
4. [Performance Requirements](#performance-requirements)
5. [Schema Changes](#schema-changes)
6. [Implementation Phases](#implementation-phases)
7. [Files to Modify](#files-to-modify)
8. [Testing Checklist](#testing-checklist)
9. [Documentation Standards](#documentation-standards)

---

## Problem Summary

### Original Issue
Listing showed "Accepting Orders" when it should have shown "Closed" for the Tractor Supply private pickup location.

### Investigation Findings

1. **Data Issue:** Market had `cutoff_hours = 18` but should be `10` for private_pickup
2. **Multiple Schedules:** Market had both Tuesday AND Thursday schedules active
3. **Logic Gap:** Current system checks if ANY schedule is accepting, not specific dates
4. **Fundamental Design Issue:** Buyers select a LOCATION but not a specific PICKUP DATE

### Why This Matters
- Vendor with Tuesday + Thursday pickups: If Tuesday cutoff passes but Thursday is open, system shows "Accepting Orders"
- But buyer doesn't know WHICH day they're ordering for
- Vendor doesn't know which day to prepare the order for
- Closing Tuesday orders shouldn't block Thursday orders

---

## Root Cause Analysis

### Current Data Model (The Gap)

```
cart_items:
  market_id  ← Only captures WHERE, not WHEN

order_items:
  market_id  ← Same problem
```

### Real-World Requirement

Buyers need to select:
- WHERE: Which pickup location
- WHEN: Which specific pickup date

Each pickup date has its own cutoff time independent of other dates.

---

## Design Decisions

### Decision 1: Schedule-Based Selection
**Buyer selects a specific pickup date, not just a location.**

- `schedule_id` identifies the recurring slot (e.g., "Thursdays at 5 PM")
- `pickup_date` identifies the specific occurrence (e.g., "February 13, 2026")
- Each date has independent cutoff calculation

### Decision 2: Snapshot at Checkout
**Order details frozen at purchase time.**

- `pickup_snapshot` JSONB stores location, time, address at checkout
- Vendor can change schedules without affecting existing orders
- Historical accuracy preserved even if schedule deleted

### Decision 3: Cart Reflects Live Data
**Cart items reference current schedule state.**

- If schedule deactivated while item in cart, auto-remove item
- Send notification explaining removal
- Buyer can re-add with different date if desired

### Decision 4: Schedule Deletion Protection
**Cannot delete schedule with active orders.**

- Active = pending, confirmed, not yet fulfilled
- Show vendor prompt with list of blocking orders
- Suggest deactivating instead of deleting
- After all orders fulfilled/cancelled, deletion allowed
- On deletion, `schedule_id` becomes NULL but `pickup_snapshot` preserved

### Decision 5: One Order Per (Vendor + Pickup Date)
**Checkout creates properly grouped orders.**

- Same checkout can have items for different dates
- Creates separate orders: #FM-2026-0847-A, #FM-2026-0847-B
- Related orders linked via `parent_order_id`
- Vendor sees orders grouped by pickup date

### Decision 6: Availability Window
**Show 1 week of pickup dates from current time.**

- Calculate upcoming dates from active schedules
- Filter to dates where NOW() < cutoff_time
- Display with cutoff countdown

### Decision 7: Visual Differentiation
**Use color-coding for pickup dates (NOT red/yellow/green).**

- Red/yellow/green reserved for open/closed status
- Use blue, purple, teal, indigo, pink for date differentiation
- Emphasize date/time with colored underline or border

### Decision 8: Platform Fee Never Shown Separately
**Fee included in item prices, not line-itemed at checkout.**

---

## Performance Requirements

### Yesterday's Optimizations (MUST PRESERVE)

1. **Server-Side Rendering**
   - Browse page calculates availability server-side
   - No N+1 API calls from client
   - `CutoffBadge` receives pre-calculated status as props

2. **Efficient Queries**
   - Single query fetches listings with nested market/schedule data
   - Batch subscription counts instead of per-item queries
   - Use indexes for common query patterns

3. **Caching Strategy**
   - Browse page: `revalidate = 300` (5 minutes)
   - Listing detail: Dynamic (real-time availability)

4. **SQL RPC for Cart Validation**
   - Cart API uses `is_listing_accepting_orders` SQL function
   - Proven correct, efficient, handles timezone properly
   - DO NOT replace with client-side JavaScript calculation

### New Implementation Requirements

1. **Server-Side Pickup Date Calculation**
   - Calculate available dates server-side, pass to components
   - No client-side date calculation for initial render
   - Client-side only for real-time countdown updates

2. **Efficient Schedule Queries**
   - Include `market_schedules` in existing nested queries
   - Don't add new API endpoints if avoidable
   - Extend existing queries rather than create new ones

3. **SQL Functions for Validation**
   - Create/update SQL functions for:
     - `get_available_pickup_dates(listing_id)` - returns dates with cutoff status
     - `validate_cart_item_schedule(listing_id, schedule_id, pickup_date)` - validates selection
   - Use these in cart API instead of JavaScript calculation

4. **Minimal Client-Side JavaScript**
   - Timezone display formatting only
   - Countdown timers for cutoff
   - No availability calculation in browser

---

## Schema Changes

### Migration: Add Pickup Scheduling Columns

```sql
-- =====================================================
-- Migration: Pickup Scheduling Enhancement
-- Purpose: Enable buyers to select specific pickup dates
-- =====================================================

-- 1. Cart Items: Add schedule and date selection
ALTER TABLE cart_items
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES market_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_date DATE;

-- 2. Order Items: Add schedule, date, and snapshot
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES market_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_date DATE,
  ADD COLUMN IF NOT EXISTS pickup_snapshot JSONB;

-- 3. Orders: Add parent linking for split orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS parent_order_id UUID REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS order_suffix VARCHAR(5);

-- 4. Index for vendor order grouping by pickup date
CREATE INDEX IF NOT EXISTS idx_order_items_vendor_pickup
  ON order_items(vendor_profile_id, pickup_date, schedule_id);

-- 5. Index for finding orders by schedule (for deletion check)
CREATE INDEX IF NOT EXISTS idx_order_items_schedule
  ON order_items(schedule_id)
  WHERE schedule_id IS NOT NULL;

-- 6. Fix cutoff_hours for private_pickup markets
UPDATE markets
SET cutoff_hours = 10
WHERE market_type = 'private_pickup'
  AND (cutoff_hours IS NULL OR cutoff_hours = 18);

COMMENT ON COLUMN cart_items.schedule_id IS 'References the specific recurring pickup slot selected by buyer';
COMMENT ON COLUMN cart_items.pickup_date IS 'The specific date buyer wants to pick up';
COMMENT ON COLUMN order_items.schedule_id IS 'Reference to schedule (may be NULL if schedule deleted after order)';
COMMENT ON COLUMN order_items.pickup_date IS 'Immutable: The promised pickup date';
COMMENT ON COLUMN order_items.pickup_snapshot IS 'Immutable: Frozen pickup details at checkout (location, time, address)';
COMMENT ON COLUMN orders.parent_order_id IS 'Links split orders from same checkout';
COMMENT ON COLUMN orders.order_suffix IS 'Distinguishes split orders: -A, -B, etc.';
```

### Migration: SQL Functions for Availability

```sql
-- =====================================================
-- Function: Get available pickup dates for a listing
-- Returns dates within next 7 days that are still accepting orders
-- =====================================================
CREATE OR REPLACE FUNCTION get_available_pickup_dates(
  p_listing_id UUID
)
RETURNS TABLE (
  market_id UUID,
  market_name TEXT,
  market_type TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  schedule_id UUID,
  pickup_date DATE,
  start_time TIME,
  end_time TIME,
  cutoff_at TIMESTAMPTZ,
  is_accepting BOOLEAN,
  hours_until_cutoff NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH listing_schedules AS (
    SELECT
      m.id as market_id,
      m.name as market_name,
      m.market_type,
      m.address,
      m.city,
      m.state,
      m.timezone,
      m.cutoff_hours,
      ms.id as schedule_id,
      ms.day_of_week,
      ms.start_time,
      ms.end_time
    FROM listing_markets lm
    JOIN markets m ON m.id = lm.market_id AND m.active = true
    JOIN market_schedules ms ON ms.market_id = m.id AND ms.active = true
    WHERE lm.listing_id = p_listing_id
  ),
  date_series AS (
    -- Generate next 7 days
    SELECT generate_series(
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '7 days',
      INTERVAL '1 day'
    )::DATE as potential_date
  ),
  matched_dates AS (
    SELECT
      ls.*,
      ds.potential_date as pickup_date,
      -- Calculate pickup datetime in UTC
      (ds.potential_date || ' ' || ls.start_time)::TIMESTAMP
        AT TIME ZONE COALESCE(ls.timezone, 'America/Chicago') as pickup_datetime
    FROM listing_schedules ls
    CROSS JOIN date_series ds
    WHERE EXTRACT(DOW FROM ds.potential_date) = ls.day_of_week
  ),
  with_cutoff AS (
    SELECT
      md.*,
      md.pickup_datetime - (COALESCE(md.cutoff_hours,
        CASE WHEN md.market_type = 'private_pickup' THEN 10 ELSE 18 END
      ) || ' hours')::INTERVAL as cutoff_at
    FROM matched_dates md
  )
  SELECT
    wc.market_id,
    wc.market_name,
    wc.market_type,
    wc.address,
    wc.city,
    wc.state,
    wc.schedule_id,
    wc.pickup_date,
    wc.start_time,
    wc.end_time,
    wc.cutoff_at,
    NOW() < wc.cutoff_at as is_accepting,
    EXTRACT(EPOCH FROM (wc.cutoff_at - NOW())) / 3600 as hours_until_cutoff
  FROM with_cutoff wc
  WHERE wc.pickup_date >= CURRENT_DATE
    AND wc.pickup_datetime > NOW()  -- Don't show past pickups today
  ORDER BY wc.pickup_date, wc.start_time, wc.market_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- Function: Validate cart item schedule selection
-- Returns true if the schedule/date combo is valid and accepting
-- =====================================================
CREATE OR REPLACE FUNCTION validate_cart_item_schedule(
  p_listing_id UUID,
  p_schedule_id UUID,
  p_pickup_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_result RECORD;
BEGIN
  SELECT * INTO v_result
  FROM get_available_pickup_dates(p_listing_id)
  WHERE schedule_id = p_schedule_id
    AND pickup_date = p_pickup_date
    AND is_accepting = true;

  RETURN v_result IS NOT NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- Function: Check if schedule can be deleted
-- Returns false if active orders exist
-- =====================================================
CREATE OR REPLACE FUNCTION can_delete_schedule(
  p_schedule_id UUID
)
RETURNS TABLE (
  can_delete BOOLEAN,
  blocking_order_count INTEGER,
  blocking_orders JSONB
) AS $$
BEGIN
  RETURN QUERY
  WITH active_orders AS (
    SELECT
      o.id,
      o.order_number,
      o.order_suffix,
      oi.pickup_date,
      o.status
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.schedule_id = p_schedule_id
      AND o.status NOT IN ('fulfilled', 'completed', 'cancelled', 'refunded')
  )
  SELECT
    COUNT(*) = 0 as can_delete,
    COUNT(*)::INTEGER as blocking_order_count,
    COALESCE(jsonb_agg(jsonb_build_object(
      'order_id', ao.id,
      'order_number', COALESCE(ao.order_number, '') || COALESCE(ao.order_suffix, ''),
      'pickup_date', ao.pickup_date,
      'status', ao.status
    )), '[]'::JSONB) as blocking_orders
  FROM active_orders ao;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- Function: Build pickup snapshot for order
-- Called at checkout to freeze pickup details
-- =====================================================
CREATE OR REPLACE FUNCTION build_pickup_snapshot(
  p_schedule_id UUID,
  p_pickup_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'market_id', m.id,
    'market_name', m.name,
    'address', m.address,
    'city', m.city,
    'state', m.state,
    'start_time', ms.start_time,
    'end_time', ms.end_time,
    'timezone', COALESCE(m.timezone, 'America/Chicago'),
    'pickup_date', p_pickup_date,
    'captured_at', NOW()
  ) INTO v_result
  FROM market_schedules ms
  JOIN markets m ON m.id = ms.market_id
  WHERE ms.id = p_schedule_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
```

---

## Implementation Phases

### Phase 1: Database Schema (Day 1)

1. Create migration file with schema changes
2. Create migration file with SQL functions
3. Apply migrations to dev database
4. Verify indexes and constraints
5. Update `SCHEMA_SNAPSHOT.md`

**Deliverables:**
- `supabase/migrations/20260205_001_pickup_scheduling_schema.sql`
- `supabase/migrations/20260205_002_pickup_scheduling_functions.sql`
- Updated schema documentation

### Phase 2: Server-Side Availability Calculation (Day 1-2)

**Goal:** Replace JavaScript availability calculation with SQL, maintain server-side rendering.

1. Update listing detail page to use `get_available_pickup_dates()` RPC
2. Update browse page to use SQL-based availability (already uses server-side calc)
3. Ensure `CutoffBadge` continues to receive pre-calculated props
4. Remove or deprecate `listing-availability.ts` JavaScript calculation

**Files to modify:**
- `src/app/[vertical]/listing/[listingId]/page.tsx`
- `src/app/[vertical]/browse/page.tsx`
- `src/lib/utils/listing-availability.ts` (deprecate or remove)

**Performance check:**
- [ ] No new client-side API calls added
- [ ] Server-side queries remain efficient
- [ ] Page load time unchanged or improved

### Phase 3: Cart API Updates (Day 2)

**Goal:** Cart items capture schedule_id + pickup_date, validate with SQL.

1. Update cart POST endpoint to require `schedule_id` and `pickup_date`
2. Use `validate_cart_item_schedule()` SQL function for validation
3. Update cart GET endpoint to return schedule/date info
4. Add cart cleanup logic for deactivated schedules

**Files to modify:**
- `src/app/api/cart/items/route.ts`
- `src/app/api/cart/route.ts`

**Backward compatibility:**
- Add migration path for existing cart items (if any)
- Clear carts on schema change if needed (dev only)

### Phase 4: Add to Cart UI (Day 2-3)

**Goal:** Buyer selects specific pickup date when adding to cart.

1. Create `PickupDateSelector` component
2. Integrate into listing detail page
3. Show available dates from server-calculated data
4. Color-code dates (blue, purple, teal - NOT red/yellow/green)
5. Display cutoff countdown for each date

**Files to create/modify:**
- `src/components/listings/PickupDateSelector.tsx` (new)
- `src/components/listings/ListingPurchaseSection.tsx`
- `src/components/cart/AddToCartButton.tsx`

**UX requirements:**
- Dates shown for 1 week ahead
- Date/time emphasized with colored underline
- Cutoff time clearly displayed
- Closed dates shown but disabled

### Phase 5: Checkout Updates (Day 3)

**Goal:** Checkout creates properly grouped orders with snapshots.

1. Group cart items by (vendor + pickup_date)
2. Generate order suffixes (-A, -B) for split orders
3. Call `build_pickup_snapshot()` for each order item
4. Link related orders via `parent_order_id`

**Files to modify:**
- `src/app/api/checkout/route.ts`
- Order creation logic

**Display requirements:**
- Checkout summary groups items by pickup date
- Each pickup group has distinct color border
- Total shown once (not per group)
- Platform fee NOT shown separately

### Phase 6: Order Display Updates (Day 3-4)

**Goal:** Orders display frozen pickup details from snapshot.

1. Update buyer order history to show pickup_snapshot details
2. Update vendor dashboard to group by pickup_date
3. Show related orders (same parent) together
4. Display order suffix in order number

**Files to modify:**
- `src/app/[vertical]/buyer/orders/page.tsx`
- `src/app/[vertical]/vendor/dashboard/page.tsx`
- Order confirmation email templates

### Phase 7: Schedule Management (Day 4)

**Goal:** Vendors can manage schedules with appropriate protections.

1. Add deletion check using `can_delete_schedule()`
2. Show blocking orders when deletion attempted
3. Add "Deactivate" option as alternative
4. Show warning about active listings using schedule

**Files to modify:**
- `src/app/[vertical]/vendor/markets/[marketId]/page.tsx` (or similar)
- Schedule management components

### Phase 8: Cart Cleanup & Notifications (Day 4)

**Goal:** Handle schedule deactivation gracefully.

1. Create background job or trigger to check cart items against schedule status
2. Remove items with deactivated schedules
3. Send notification to affected buyers
4. Log removals for debugging

**Implementation options:**
- Database trigger on `market_schedules.active` change
- Cron job checking cart validity
- Check at cart view time (lazy cleanup)

**Notification content:**
> "Your [item name] was removed from cart because the vendor updated their pickup schedule. You can re-add it with a new pickup date."

---

## Files to Modify

### Database
- [ ] `supabase/migrations/20260205_001_pickup_scheduling_schema.sql` (new)
- [ ] `supabase/migrations/20260205_002_pickup_scheduling_functions.sql` (new)
- [ ] `supabase/SCHEMA_SNAPSHOT.md` (update)

### API Routes
- [ ] `src/app/api/cart/items/route.ts` - Add schedule_id, pickup_date validation
- [ ] `src/app/api/cart/route.ts` - Return schedule/date info
- [ ] `src/app/api/checkout/route.ts` - Split orders, create snapshots

### Pages (Server Components)
- [ ] `src/app/[vertical]/browse/page.tsx` - Update availability calculation
- [ ] `src/app/[vertical]/listing/[listingId]/page.tsx` - Add date selection
- [ ] `src/app/[vertical]/buyer/orders/page.tsx` - Display snapshot details
- [ ] `src/app/[vertical]/vendor/dashboard/page.tsx` - Group by pickup date

### Components
- [ ] `src/components/listings/PickupDateSelector.tsx` (new)
- [ ] `src/components/listings/ListingPurchaseSection.tsx` - Integrate date selector
- [ ] `src/components/listings/PickupLocationsCard.tsx` - Update for new data structure
- [ ] `src/components/cart/AddToCartButton.tsx` - Handle schedule/date
- [ ] `src/components/checkout/CheckoutSummary.tsx` - Group by pickup date

### Utilities
- [ ] `src/lib/utils/listing-availability.ts` - Deprecate (move to SQL)
- [ ] `src/lib/utils/pickup-colors.ts` (new) - Color assignment for dates

### Types
- [ ] `src/types/cart.ts` or similar - Add schedule_id, pickup_date types
- [ ] `src/types/order.ts` or similar - Add pickup_snapshot type

---

## Testing Checklist

### Availability Logic
- [ ] Listing with single market, single schedule shows correct dates
- [ ] Listing with single market, multiple schedules shows all dates
- [ ] Listing with multiple markets shows dates grouped by location
- [ ] Past cutoff dates show as closed/disabled
- [ ] Cutoff countdown displays correctly
- [ ] Timezone handling correct for markets in different zones

### Cart Functionality
- [ ] Can add item with schedule_id and pickup_date
- [ ] Cannot add item for past cutoff date
- [ ] Cannot add item for deactivated schedule
- [ ] Cart displays selected pickup date
- [ ] Cart update works (change quantity)
- [ ] Cart removal works

### Checkout
- [ ] Single item checkout creates single order
- [ ] Multiple items, same pickup date creates single order
- [ ] Multiple items, different dates creates split orders with suffixes
- [ ] Split orders have correct parent_order_id
- [ ] pickup_snapshot populated correctly
- [ ] Order confirmation shows pickup details

### Schedule Changes
- [ ] Deactivating schedule removes items from carts
- [ ] Notification sent when item removed from cart
- [ ] Cannot delete schedule with active orders
- [ ] Can delete schedule after orders fulfilled
- [ ] Deleted schedule: orders still display correctly (via snapshot)

### Vendor Dashboard
- [ ] Orders grouped by pickup date
- [ ] Related orders (same checkout) identifiable
- [ ] Order details show correct pickup info from snapshot
- [ ] Schedule deletion shows blocking orders

### Performance
- [ ] Browse page load time unchanged
- [ ] Listing detail page load time unchanged
- [ ] No N+1 queries introduced
- [ ] Cart operations responsive
- [ ] Checkout completes in reasonable time

---

## Documentation Standards

### Code Comments
Every file modified should include context comment:

```typescript
/*
 * PICKUP SCHEDULING CONTEXT
 *
 * This file was updated as part of the pickup scheduling enhancement.
 * See: docs/Build_Instructions/Pickup_Scheduling_Comprehensive_Plan.md
 *
 * Key concepts:
 * - Buyers select specific pickup DATE, not just location
 * - Each date has independent cutoff
 * - Orders snapshot pickup details at checkout (immutable)
 * - schedule_id can become NULL if schedule deleted; use pickup_snapshot
 */
```

### SQL Function Comments
Each function includes purpose and context:

```sql
/*
 * PICKUP SCHEDULING: Get Available Dates
 *
 * Returns upcoming pickup dates for a listing within the next 7 days.
 * Used by listing detail page for server-side rendering.
 *
 * Design: SQL calculation preferred over JavaScript for:
 * - Consistent timezone handling
 * - Single source of truth
 * - Better performance (no N+1 API calls)
 */
```

### Database Column Comments
All new columns have COMMENT ON statements explaining purpose.

---

## Summary: What This Solves

| Original Problem | Solution |
|------------------|----------|
| Wrong open/closed status | SQL-based calculation with proper timezone handling |
| Multiple schedules confused availability | Per-date cutoff, buyer selects specific date |
| Buyer didn't choose pickup day | Explicit date selection in UI |
| Vendor schedule changes broke orders | Snapshot freezes details at checkout |
| No way to block future orders independently | Each date has own cutoff |
| Platform fee shown separately | Never shown (already in prices) |
| Performance concerns | SQL functions, server-side rendering preserved |

---

## Reference: Key SQL Functions

| Function | Purpose | Used By |
|----------|---------|---------|
| `get_available_pickup_dates(listing_id)` | Get upcoming dates with cutoff status | Listing detail page |
| `validate_cart_item_schedule(listing_id, schedule_id, pickup_date)` | Validate cart item selection | Cart API |
| `can_delete_schedule(schedule_id)` | Check if deletion allowed | Vendor schedule management |
| `build_pickup_snapshot(schedule_id, pickup_date)` | Create frozen pickup details | Checkout |
| `is_listing_accepting_orders(listing_id)` | Quick check if ANY date accepting | Browse page badges |

---

## Next Steps

1. Review this plan for completeness
2. Begin Phase 1: Database schema migration
3. Test migration in dev environment
4. Proceed through phases sequentially
5. Update SCHEMA_SNAPSHOT.md after each migration
6. Test thoroughly before moving to next phase
