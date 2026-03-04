# Current Task: Consistent Listing Availability via Batch SQL Function (Session 50 continued)

Started: 2026-03-03

## Goal
Fix inconsistent "Closed" pill on browse page. Some listings show "Closed" while others from the same vendor don't — but clicking into ANY of them says "orders are currently closed." Root cause: browse page used a JS reimplementation that ignored vendor attendance data. Fix: single SQL source of truth via batch RPC function.

## Session 50 Summary — Prior Items COMMITTED

### Schedule Conflict Prevention (COMMITTED `c4ead74`, pushed to staging)
- 5-batch implementation: shared utility, API validation, DB trigger, UI handling, business rule test
- Migration 066 applied to all 3 envs, schema snapshot updated, moved to applied/ (`7e52bd1`)

### Dashboard UX + VI Tests (COMMITTED `e4d34b4`, pushed to staging)
- Combined Payments+Earnings card, fixed icons, added VI-R16 through VI-R19

## Listing Availability Consistency Fix — Status

### Root Cause (CONFIRMED)
Two separate availability systems existed:
1. **Detail page** → `get_available_pickup_dates()` SQL function (checks vendor attendance, vendor hours, timezone)
2. **Browse page** → JS `calculateMarketAvailability()` in `listing-availability.ts` (IGNORES vendor attendance entirely)
3. **Cart validate API** → same JS utility (ALSO ignores attendance — order integrity issue)
4. **Vendor listings page** → same JS utility (same bug)

### Completed (code written, NOT YET COMMITTED):

- [x] **Batch 1**: Migration `supabase/migrations/20260303_067_batch_listing_availability.sql`
  - `get_listings_accepting_status(p_listing_ids uuid[])` function
  - Uses `LEFT JOIN LATERAL get_available_pickup_dates(lid)` — guaranteed sync
  - Aggregates: `bool_or(is_accepting)`, `MIN(hours_until_cutoff)`, `MIN(cutoff_hours)`
  - `SECURITY DEFINER SET search_path = public`
  - NOTIFY pgrst at end

- [x] **Batch 2**: Browse page (`src/app/[vertical]/browse/page.tsx`)
  - Removed `import { calculateMarketAvailability }`
  - Removed `calculateListingAvailability()` function (was ~45 lines of JS)
  - Added `deriveAvailabilityStatus()` — simple map lookup from RPC data
  - Added RPC call after pagination: `supabase.rpc('get_listings_accepting_status', { p_listing_ids })`
  - Builds `availabilityMap` (Map<string, availability>)
  - `ListingCard` now accepts `availabilityStatus` prop instead of calculating internally
  - Both `<ListingCard>` callsites updated (grouped by category + filtered flat grid)

- [x] **Batch 3**: Cart validate API (`src/app/api/cart/validate/route.ts`)
  - Removed `import { processListingMarkets, type MarketWithSchedules }`
  - **GET handler** (line ~94): Replaced 35-line JS block (fetched listing_markets + processListingMarkets) with single RPC call
  - **POST handler** (line ~208): Replaced per-item N+1 pattern (each item fetched listing_markets separately) with single batch RPC call before the loop
  - Both now use `get_listings_accepting_status()` via `availMap`

- [x] **Batch 4**: Vendor listings page (`src/app/[vertical]/vendor/listings/page.tsx`)
  - Removed `import { calculateMarketAvailability, type MarketWithSchedules }`
  - Removed `calculateListingAvailability()` function
  - Added `deriveAvailabilityStatus()` with extra `listingStatus` param (draft listings skip check)
  - Added RPC call after tier limit calculation
  - Updated inline `calculateListingAvailability(listing)` → `deriveAvailabilityStatus(availabilityMap.get(listing.id), listing.status)`

- [x] **Batch 5**: Business rule + documentation
  - Updated VJ rule count: 14 → 15 in file header comment
  - Added VJ-R15 with 4 .todo markers (browse, cart validate, vendor listings, DB test)
  - Added deprecation comment to `listing-availability.ts` header
  - SQL comments in migration 067 document sync guarantee

### REMAINING (must do before commit):
- [ ] Run `npx vitest run` — expect all pass
- [ ] Run `npx tsc --noEmit` — was 0 errors after each batch
- [ ] Commit all files
- [ ] Push to staging
- [ ] User applies migration 067 to Dev, Staging, Prod

### Post-commit (user action needed):
- [ ] User applies migration 067 to all 3 envs
- [ ] After confirmed: update SCHEMA_SNAPSHOT.md (changelog + function description), move to applied/, update MIGRATION_LOG.md

## Files Modified (Not Yet Committed)
| File | Status | Change |
|------|--------|--------|
| `supabase/migrations/20260303_067_batch_listing_availability.sql` | NEW | Batch SQL function wrapping get_available_pickup_dates |
| `src/app/[vertical]/browse/page.tsx` | MODIFIED | Replaced JS availability with RPC lookup |
| `src/app/api/cart/validate/route.ts` | MODIFIED | Replaced JS availability with RPC (both GET + POST handlers) |
| `src/app/[vertical]/vendor/listings/page.tsx` | MODIFIED | Replaced JS availability with RPC lookup |
| `src/lib/__tests__/integration/business-rules-coverage.test.ts` | MODIFIED | VJ-R15 added (4 .todo markers) |
| `src/lib/utils/listing-availability.ts` | MODIFIED | Deprecation comment added |

## Key Decisions
- **LEFT JOIN LATERAL** pattern guarantees sync — batch function calls get_available_pickup_dates() directly, no duplicated logic
- **Browse page RPC runs after pagination** — only queries 50 visible listings, not all
- **Cart validate POST was N+1** — each item did its own listing_markets query. Now 1 batch RPC call for all items.
- **listing-availability.ts retained** — processListingMarkets() still used by api/listings/[id]/markets/route.ts for market data display
- **Draft listings skip availability check** — vendor listings page returns 'open' for non-published listings

## Architecture
```
Single SQL Source of Truth:
  get_available_pickup_dates(listing_id)
    ├── Checks vendor attendance (vendor_market_schedules.is_active)
    ├── Uses vendor-specific hours (vendor_start_time/vendor_end_time)
    ├── Timezone-aware cutoff calculation
    ├── FT parks: same-day only, zero cutoff
    ├── FT events: 7-day window, advance cutoff
    └── FM: 7-day window, advance cutoff

Batch wrapper (NEW — migration 067):
  get_listings_accepting_status(listing_ids uuid[])
    └── LEFT JOIN LATERAL get_available_pickup_dates() for each
    └── Aggregates: bool_or(is_accepting), MIN(hours_until_cutoff), MIN(cutoff_hours)

Consumers (all now use batch RPC):
  ├── Browse page → CutoffBadge (open/closing-soon/closed pill)
  ├── Cart validate GET → cutoffWarnings
  ├── Cart validate POST → cutoff_passed per item
  └── Vendor listings page → ListingCutoffStatusBadge

Existing (unchanged):
  ├── Listing detail page → calls get_available_pickup_dates() directly
  ├── is_listing_accepting_orders() → wraps get_available_pickup_dates()
  └── listing-availability.ts → retained for processListingMarkets() in market data API
```

## Git State
- Main branch, 14 commits ahead of origin/main
- Staging synced to main (pushed after migration 066 schema update)
- Migration 066 applied to all 3 envs, moved to applied/
- Migration 067 NOT YET applied (pending commit + user action)
