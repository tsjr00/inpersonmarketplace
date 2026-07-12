# M4: Availability System Consolidation Plan

**Created:** 2026-03-14 (Session 55)
**Status:** Research complete — awaiting user decision
**Priority:** Backlog 2.7

---

## Executive Summary

Two availability systems exist. The JS system is effectively **dead code** — its only consumer (an API route) has zero callers. Consolidation is simpler than originally anticipated.

---

## Current State: Two Systems

### System A: SQL RPC (Source of Truth)
**Functions:**
- `get_available_pickup_dates(p_listing_id)` — returns all upcoming pickup dates for a listing
- `get_listings_accepting_status(p_listing_ids[])` — batch check: is each listing accepting orders?

**Used by (5 call sites):**
| File | Function Called | Purpose |
|------|----------------|---------|
| `[vertical]/browse/page.tsx` | `get_listings_accepting_status` | Availability badges + "available" filter |
| `[vertical]/listing/[listingId]/page.tsx` | `get_available_pickup_dates` | Listing detail pickup dates |
| `api/cart/validate/route.ts` (GET+POST) | `get_listings_accepting_status` | Cart validation before checkout |
| `[vertical]/vendor/listings/page.tsx` | `get_listings_accepting_status` | Vendor's own listing badges |

**Handles:**
- Vendor attendance (FT parks/events require `vendor_market_schedules` record)
- Vendor-specific hours (`COALESCE(vms.vendor_start_time, ms.start_time)`)
- Timezone-aware "today" (`NOW() AT TIME ZONE market.timezone`)
- FT same-day ordering (`advance_order_days = 0` → today only)
- FT catering 48-hour lead time (`advance_order_days > 0` → 2-day minimum)
- Event date range filtering
- Season date filtering
- Cutoff hours per vertical/market type
- 8-day rolling window for FM/FT events

**Evolution:** 7 migrations (030→031→032→040→054→079→080) over Sessions 23-54.

### System B: JavaScript (Deprecated)
**File:** `src/lib/utils/listing-availability.ts` (303 lines)
**Functions:** `calculateMarketAvailability()`, `processListingMarkets()`

**Used by (1 call site):**
| File | Purpose |
|------|---------|
| `api/listings/[id]/markets/route.ts` | Returns processed market data for a listing |

**Callers of that API route: ZERO.** No client-side code fetches from `/api/listings/[id]/markets`.

**Does NOT handle:**
- Vendor attendance (no `vendor_market_schedules` check)
- Vendor-specific hours (uses market hours only)
- `advance_order_days` / catering lead time
- Season date filtering

**Already marked deprecated** — deprecation note at top of file says "use `get_listings_accepting_status()` RPC instead."

---

## 5 Identified Divergence Scenarios

These are the cases where the JS system would give a different answer than the SQL RPC:

| # | Scenario | SQL RPC | JS System | Impact |
|---|----------|---------|-----------|--------|
| 1 | Vendor sets custom hours (e.g., 9-11am vs market 8am-2pm) | Uses vendor hours | Uses market hours | JS shows wrong pickup window |
| 2 | FT vendor hasn't confirmed attendance | Excludes market | Still shows as available | JS shows markets vendor won't attend |
| 3 | FT catering listing with 48hr lead time | Enforces 2-day minimum | Shows same-day availability | JS allows ordering too late |
| 4 | Market in season (has season_start/end dates) | Filters by season | Ignores season dates | JS shows off-season markets |
| 5 | Event with specific date range | Strict date range filter | Basic date range check | Minor — both handle, SQL is stricter |

**Risk assessment:** These divergences are **moot** because the JS system's only consumer has zero callers. No user is ever hitting the divergent code path.

---

## Consolidation Options

### Option A: Delete Dead Code (Recommended)
**Effort:** ~30 minutes | **Risk:** None | **Files changed:** 3 deleted

1. Delete `src/app/api/listings/[id]/markets/route.ts` (the orphan route)
2. Delete `src/lib/utils/listing-availability.ts` (the deprecated utility)
3. Remove the `VJ-R15` sync guarantee test reference in `business-rules-coverage.test.ts` (or update it to reference only the SQL RPC)

**Why this is correct:**
- The listing detail page already calls `get_available_pickup_dates()` directly (server-side)
- Browse/cart/vendor pages use `get_listings_accepting_status()` (batch version)
- No client component fetches from the markets API route
- The JS system is documented as deprecated
- Keeping dead code risks someone accidentally using it and getting wrong availability

### Option B: Migrate Route to SQL RPC (If Route Is Still Needed)
**Effort:** ~1-2 hours | **Risk:** Low | **Files changed:** 2

If the `/api/listings/[id]/markets` route should be preserved for future use:
1. Replace the `processListingMarkets()` call with `get_available_pickup_dates()` RPC
2. Transform RPC results into the same `ProcessedMarket` response shape (group by market, derive `next_pickup_at`, etc.)
3. Delete `listing-availability.ts`

```typescript
// Conceptual — route.ts after migration
const { data: pickupDates } = await supabase
  .rpc('get_available_pickup_dates', { p_listing_id: listingId })

// Group by market, pick earliest accepting date per market
const marketMap = new Map<string, ProcessedMarket>()
for (const date of pickupDates || []) {
  if (!marketMap.has(date.market_id) || (date.is_accepting && !marketMap.get(date.market_id)!.is_accepting)) {
    marketMap.set(date.market_id, {
      market_id: date.market_id,
      market_name: date.market_name,
      // ... transform fields
    })
  }
}
```

### Option C: Do Nothing
Leave the dead code. It's already deprecated and documented. Low risk but adds maintenance confusion.

---

## Recommendation

**Option A (delete dead code)** is the clear winner:
- Zero callers means zero migration risk
- Removes 303 lines of duplicated logic that's already known to diverge from the source of truth
- Eliminates the possibility of someone accidentally importing the deprecated functions
- No migration needed, no SQL changes, pure cleanup

The only reason to choose Option B is if there's a planned feature that will need a markets-for-listing API endpoint. In that case, it's better to build it fresh on top of the SQL RPC when the need arises.

---

## Pre-Deletion Verification Checklist

Before deleting, verify:
- [ ] `git grep "listings.*markets\|processListingMarkets\|calculateMarketAvailability"` shows no other callers
- [ ] No external system (mobile app, webhook, etc.) calls the endpoint
- [ ] The listing detail page (`[vertical]/listing/[listingId]/page.tsx`) works correctly without the route (it uses server-side RPC, not this API)
- [ ] Business rules test `VJ-R15` is updated or removed

---

## Files Affected

| File | Action | Lines |
|------|--------|-------|
| `src/lib/utils/listing-availability.ts` | DELETE | -303 |
| `src/app/api/listings/[id]/markets/route.ts` | DELETE | -67 |
| `src/lib/__tests__/integration/business-rules-coverage.test.ts` | UPDATE | ~5 lines (VJ-R15 reference) |
| `src/lib/__tests__/vendor-onboarding.test.ts` | UPDATE | ~5 lines (VJ-R12 reference) |
