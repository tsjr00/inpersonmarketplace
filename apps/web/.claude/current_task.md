# Current Task: Session 31 (continued) — FT Cutoff Hours Fix

Started: 2026-02-18

## ACTIVE TASK: Migration 031 — Fix cutoff_hours COALESCE bug in SQL + JS

### The Root Bug
`COALESCE(m.cutoff_hours, CASE WHEN FT THEN 0 ... END)` returns the DB value (18) when it's non-NULL, so the FT default of 0 never applies. This affected:
1. **SQL function `get_available_pickup_dates()`** — listing detail page showed "closed"
2. **JS `listing-availability.ts`** — browse page showed "closed"

### What's DONE (committed + pushed to staging)
1. `1cae92a` — JS fix: `getNextMarketDatetime()` uses end_time for FT (keeps today's occurrence active until truck closes) + same-day-only skip for FT schedules
2. `c9ef313` — JS fix: `cutoffHours = isFoodTruck ? 0 : (...)` — forces 0 for FT regardless of DB value
3. `a588575` — Empty commit to trigger Vercel build
4. User manually ran `UPDATE markets SET cutoff_hours = 0 WHERE vertical_id = 'food_trucks'` on staging — listing now shows OPEN

### What STILL NEEDS DOING (in order)

#### A. Migration 031: Fix SQL function `get_available_pickup_dates()`
The SQL function at line 63 of migration 030 has the same COALESCE bug:
```sql
-- CURRENT (buggy):
COALESCE(m.cutoff_hours,
  CASE
    WHEN m.vertical_id = 'food_trucks' THEN 0
    WHEN m.market_type = 'private_pickup' THEN 10
    ELSE 18
  END
) as cutoff_hours,

-- FIX needed:
CASE
  WHEN m.vertical_id = 'food_trucks' THEN 0
  ELSE COALESCE(m.cutoff_hours,
    CASE WHEN m.market_type = 'private_pickup' THEN 10 ELSE 18 END
  )
END as cutoff_hours,
```
Also include: `UPDATE markets SET cutoff_hours = 0 WHERE vertical_id = 'food_trucks';` (not just NULL ones)

#### B. Cart validation uses `processListingMarkets()` (JS) — ✅ already fixed
- File: `src/app/api/cart/validate/route.ts:119`
- Uses `processListingMarkets()` from `listing-availability.ts` which is already fixed
- Fetches `vertical_id` in the market select (line 104) ✅

#### C. Update schema snapshot for migration 031
#### D. Apply migration 031 to all 3 environments
#### E. Commit + push to staging for testing
#### F. Production push (main is 9+ commits ahead of origin/main)

### Complete Cutoff Hours Audit Results

#### SQL Functions — Need Fix:
| Location | Current Code | Issue | Fix Needed |
|----------|-------------|-------|------------|
| `get_available_pickup_dates()` (live in DB) | `COALESCE(m.cutoff_hours, CASE...)` | Returns DB value 18 instead of FT default 0 | **YES — Migration 031** |

#### JS/TS Code — Already Fixed:
| File:Line | Code | Status |
|-----------|------|--------|
| `listing-availability.ts:165` | `isFoodTruck ? 0 : (...)` | ✅ Fixed (c9ef313) |
| `cart/validate/route.ts:119` | Uses `processListingMarkets()` | ✅ Uses fixed JS utility |
| `vendor/markets/route.ts:341` | `vertical === 'food_trucks' ? 0 : undefined` | ✅ Correct on creation |
| `vendor/markets/suggest/route.ts:108` | `insertData.cutoff_hours = 0` | ✅ Correct on suggestion |

#### JS/TS Code — Display Only (auto-correct after SQL fix):
| File:Line | Code | Data Source | Notes |
|-----------|------|-------------|-------|
| `AddToCartButton.tsx:334` | `date.cutoff_hours ?? 18` | SQL RPC | Has `> 0` guard. Correct after SQL fix returns 0. |
| `PickupLocationsCard.tsx:42` | `date.cutoff_hours ?? 18` | SQL RPC | Same — shows "closing soon" indicator |
| `CutoffStatusBanner.tsx:234` | `m.cutoff_hours ?? (...)` | Mixed | Has `=== 0` guard at line 235. Correct after SQL fix. |
| `CutoffStatusBanner.tsx:439` | `market.cutoff_hours ?? (...)` | Mixed | Has `> 0 &&` guard at line 440. Correct after SQL fix. |
| `availability/route.ts:95` | `cutoff_hours ?? ...` | SQL RPCs | RPCs don't exist → falls back to open state |

#### JS/TS Code — No Change Needed:
| File:Line | Reason |
|-----------|--------|
| `vendor/markets/page.tsx:650,1942` | Display-only for vendor's own settings — should show actual DB value |
| `browse/page.tsx:482` | Just selects the column — `calculateListingAvailability()` uses the fixed JS utility |
| `vendor/listings/page.tsx:288` | Just selects the column — same as browse |
| `listings/[id]/markets/route.ts:37` | Just selects the column — returned to client as-is |

### Other Issues Found This Session

#### Vendors Page Flash-and-Disappear (FIXED by user)
- `/food_trucks/vendors` — vendors appeared briefly then vanished
- Root cause: Food Truck Exchange market had NULL latitude/longitude
- Geographic search (`/api/vendors/nearby`) returned 0 results
- Client-side `VendorsWithLocation.tsx` line 143: `setVendors([])` when no location results
- User updated market coordinates + `vendor_location_cache` was auto-populated
- **Validation bug noted**: Markets can be "approved" without coordinates — should require lat/lng

### Git Status
- **main** is 9 commits ahead of **origin/main** (production)
- **staging** is 1 commit ahead of main (empty trigger commit)
- Recent commits on main: c9ef313, 1cae92a, 867b6d4, 6cbec96, a3f986c, f5fbf17, 14b336f, bd54bbe, 8956bdb
- Migration 030 already moved to applied/ and committed (867b6d4)
- Schema snapshot + migration log updated for 030

### Staging DB State
- `Food Truck Exchange`: cutoff_hours=0 (manually updated by user), lat/lng set, vertical_id='food_trucks'
- Schedules: Mon-Fri (day 1-5), 11:00-19:30, all active, timezone America/Chicago
- `vendor_location_cache` has entry for FT vendor (lat 35.19, lng -101.87)
- Listing "Giant Coffee & Enormous Piece of Pie" — now shows OPEN on browse, OPEN on detail page

### Files Modified This Session (across both continuations)
- `src/lib/utils/listing-availability.ts` — 2 commits (getNextMarketDatetime endTime + cutoff override)
- `src/components/cart/AddToCartButton.tsx` — FT location-first flow (commit 6cbec96)
- `src/components/listings/CutoffStatusBanner.tsx` — cutoff_hours `||` → `??` + FT guards (commit 6cbec96)
- `src/components/listings/PickupLocationsCard.tsx` — cutoff_hours `||` → `??` (commit 6cbec96)
- `src/app/api/listings/[id]/availability/route.ts` — cutoff_hours `||` → `??` (commit 6cbec96)
- `src/app/[vertical]/browse/page.tsx` — vertical_id added to market query (commit 6cbec96)
- `src/app/[vertical]/vendor/listings/page.tsx` — vertical_id added (commit 6cbec96)
- `src/app/api/listings/[id]/markets/route.ts` — vertical_id added (commit 6cbec96)
- `src/app/api/cart/validate/route.ts` — vertical_id added (commit 6cbec96)
- `src/app/[vertical]/vendor/listings/ListingForm.tsx` — quantity units filter fix (commit a3f986c)
- `src/app/api/cart/route.ts` — preferred_pickup_time in response (commit a3f986c)
- `src/lib/hooks/useCart.tsx` — preferred_pickup_time in CartItem interface (commit a3f986c)
- `src/lib/stripe/webhooks.ts` — food_truck_vendor renewal handling (commit a3f986c)
