# Current Task: Per-Vertical Buyer Premium — COMPLETE

Started: 2026-02-17
Status: READY TO COMMIT

## What Was Done

### Per-Vertical Buyer Premium Configuration
Made buyer premium features (2-hour early access, upgrade UI, premium badges) configurable per-vertical. Food trucks have premium DISABLED. Farmers market keeps premium as-is.

### Implementation (4 steps)

**Step 1: Feature Config System (4 files)**
- Added `VerticalFeatureConfig` interface to `types.ts`
- Added `features` block to farmers-market.ts (enabled) and food-trucks.ts (disabled)
- Added `isBuyerPremiumEnabled()` helper to `terminology.ts`
- Exported from `index.ts`

**Step 2: DB Migration 026 (1 file)**
- `set_listing_premium_window()` now checks vertical config before setting premium window
- `set_market_box_premium_window()` same + fixed capacity-increase regression
- Added `buyer_premium_enabled` config to `verticals` table
- Cleanup of any existing food truck premium windows

**Step 3: UI Guards (8 files)**
- `browse/page.tsx` — Skip premium filtering + hide premium banners
- `listing/[listingId]/page.tsx` — Skip isPremiumRestricted
- `dashboard/page.tsx` — Hide premium badge + upgrade promo card
- `vendor/[vendorId]/profile/page.tsx` — Hide premium window overlays
- `buyer/upgrade/page.tsx` — Redirect to browse when disabled
- `settings/BuyerTierManager.tsx` — Hide entire section when disabled
- `vendor/market-boxes/page.tsx` — Conditional "premium buyers" copy
- `vendor/market-boxes/new/page.tsx` — Conditional "premium buyers" copy

**Step 4: 3 Bug Fixes**
- Bug 1: Hardcoded prices ($9.99/$81.50) → `SUBSCRIPTION_PRICES` (upgrade page, BuyerTierManager, dashboard)
- Bug 2: Settings page read `buyer_tier_expires_at` but webhook writes `tier_expires_at` — fixed
- Bug 3: Market box trigger capacity-increase regression — fixed in migration 026

### Verification
- `npx tsc --noEmit` passes clean

### Files Modified (15 total)
1. `src/lib/vertical/types.ts`
2. `src/lib/vertical/configs/farmers-market.ts`
3. `src/lib/vertical/configs/food-trucks.ts`
4. `src/lib/vertical/terminology.ts`
5. `src/lib/vertical/index.ts`
6. `src/app/[vertical]/browse/page.tsx`
7. `src/app/[vertical]/listing/[listingId]/page.tsx`
8. `src/app/[vertical]/dashboard/page.tsx`
9. `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx`
10. `src/app/[vertical]/buyer/upgrade/page.tsx`
11. `src/app/[vertical]/settings/BuyerTierManager.tsx`
12. `src/app/[vertical]/settings/page.tsx`
13. `src/app/[vertical]/vendor/market-boxes/page.tsx`
14. `src/app/[vertical]/vendor/market-boxes/new/page.tsx`
15. `supabase/migrations/20260217_026_vertical_premium_triggers.sql` (NEW)

### Migration 026 — NOT YET APPLIED
Needs to be applied to Dev, Staging, and Prod after commit.

## Previous Session 29 Commits
1. `ec51736` — Quantity/measurement fields
2. `1b0f39c` — Per-vertical color system + Food Truck'n landing page
3. `8146784` — Vertical-specific colors via CSS Custom Properties
4. `177ab7f` — Mobile photo upload fix + tappable map addresses
5. `cbe6668` — Parameterize food truck terminology (28 files)
6. `a5c7b83` — Landing page design updates
7. `588d710` — Rename fireworks → fire_works (43 files)
8. `435251b` — Fix fireworks rename migration
9. `7163d7d` — Schema snapshot refresh process
10. `70f0cad` — Regenerate SCHEMA_SNAPSHOT.md
