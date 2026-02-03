# Session Summary: Availability System Fix

**Date:** 2026-02-03

## Problem

Buyers saw a grayed "Orders Currently Closed" button on some listings but **no explanation** of why orders were closed. Example: "Fresh Organic Tomatoes" showed disabled button with no yellow/red explanation box.

## Root Cause Investigation

### Initial Misdiagnosis
Initially believed the issue was a column name mismatch (`type` vs `market_type`) in the database RPC functions. Created a migration to change `market_type` → `type`.

**This was wrong.** The actual column in the `markets` table is `market_type`, not `type`. The "fix" broke the RPC functions entirely, causing ALL availability notifications to disappear.

### Actual Root Cause
The real issue was **markets without schedules**:
- Private pickup locations were being created without any schedule entries in `market_schedules`
- Without a schedule, `get_market_cutoff()` returns NULL
- The RPC function treats NULL cutoff as "always open"
- But the JavaScript API treats no schedules as "closed"
- This inconsistency caused: grayed button (JS says closed) + no explanation (RPC says open)

## Changes Made

### 1. Reverted Migration
**File:** `supabase/migrations/20260202_001_fix_market_type_column.sql`

Restored RPC functions to use correct column name `market_type`.

### 2. Safety Net in CutoffStatusBanner
**File:** `src/components/listings/CutoffStatusBanner.tsx`

Added `forceShowClosed` prop that displays explanation even if availability API fails or returns no data.

### 3. Wired Up Safety Net
**File:** `src/components/listings/ListingPurchaseSection.tsx`

Computes `hasNoOpenMarkets` from markets data and passes `forceShowClosed` to CutoffStatusBanner when availability API says open but all markets are actually closed.

### 4. Schedule Section for All Market Types
**File:** `src/app/admin/markets/[id]/page.tsx`

- Changed schedule section to show for ALL market types (was previously hidden for `private_pickup`)
- Added warning banner when a market has no schedules
- Fixed `market.type` → `market.market_type` reference

### 5. Data Cleanup (Dev Database)
Removed improperly inserted test data:
- "Super Saturday Market" (private pickup with no schedule)
- "Fresh Organic Tomatoes" listing
- Associated test orders

Added schedules to existing markets missing them:
- "Tuesday Afternoon seed swap"
- "Farmers + Makers Market - Borger"

## Commit
```
d1a58ad - Fix availability system and require schedules for all market types
```

## Key Learnings

1. **Always verify actual database schema** before assuming column names from migration files
2. **Private pickup locations need schedules too** - the cutoff system requires them
3. **Test data should follow the same rules** as real data to avoid hidden bugs
4. **Two systems checking availability** (RPC + JavaScript) must agree on edge cases like "no schedule"

## Files Modified

| File | Change |
|------|--------|
| `supabase/migrations/20260202_001_fix_market_type_column.sql` | Restore RPC functions with `market_type` |
| `src/components/listings/CutoffStatusBanner.tsx` | Add `forceShowClosed` safety net |
| `src/components/listings/ListingPurchaseSection.tsx` | Wire up `forceShowClosed` logic |
| `src/app/admin/markets/[id]/page.tsx` | Show schedules for all types + warning banner |

## Verification Query

To find markets missing schedules:
```sql
SELECT m.id, m.name, m.market_type
FROM markets m
LEFT JOIN market_schedules ms ON ms.market_id = m.id
WHERE ms.id IS NULL AND m.active = true;
```

Should return no rows when all markets are properly configured.

## Still Outstanding

- Vendor dashboard: vendors cannot edit their own private pickup locations (access issue mentioned but not investigated)
