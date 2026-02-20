# Current Task: Events Feature Implementation

Started: 2026-02-21

## Goal
Add `market_type = 'event'` to support food truck events (festivals, fairs, concerts). Multi-vendor gatherings with advance ordering.

## Status: ALL PHASES COMPLETE (1-4) — Ready to commit

## What's Been Completed

### Phase 1: Database + Type Foundation ✅
- **Migration**: `supabase/migrations/20260221_039_add_event_market_type.sql`
  - Expanded CHECK constraint: `'traditional' | 'private_pickup' | 'event'`
  - Added columns: `event_start_date DATE`, `event_end_date DATE`, `event_url TEXT`
  - Added CHECK: event dates required when market_type='event'
  - Added index: `idx_markets_event_dates`
- **TypeScript types updated (8 files)**:
  - `src/types/pickup.ts` — `AvailablePickupDate.market_type` and `MarketPickupDates.market_type` + added `event_start_date?`, `event_end_date?` to MarketPickupDates
  - `src/lib/utils/listing-availability.ts` — `ProcessedMarket.market_type`, `MarketWithSchedules` (added event date fields), cast on line 241
  - `src/components/markets/MarketsWithLocation.tsx` — Market interface
  - `src/components/markets/MarketCard.tsx` — MarketCardProps + event badge + date range display
  - `src/components/vendor/PickupScheduleGrid.tsx` — PickupLocation
  - `src/app/[vertical]/markets/page.tsx` — cast on line 182
- **Constants**: `src/lib/constants.ts` — added `event: 24` to DEFAULT_CUTOFF_HOURS
- **Backend logic fixes (4 files)**:
  - `src/lib/vendor-limits.ts` lines 236,246 — changed `!== 'private_pickup'` to `=== 'traditional'`
  - `src/app/api/vendor/market-stats/route.ts` line 58 — include events as selectable
  - `src/app/api/vendor/home-market/route.ts` line 124 — block events from home market
  - `src/app/api/vendor/markets/[id]/schedules/route.ts` — changed both PUT and PATCH checks
- **Terminology (3 files)**:
  - `src/lib/vertical/types.ts` — added `'event' | 'events' | 'event_icon_emoji'` keys
  - `src/lib/vertical/configs/food-trucks.ts` — added event/events/event_icon_emoji terms
  - `src/lib/vertical/configs/farmers-market.ts` — same

### Phase 2: Availability Engine ✅
- **Migration**: `supabase/migrations/20260221_040_event_availability_function.sql`
  - Rewrote `get_available_pickup_dates()` with event support
- **Client-side mirror**: `src/lib/utils/listing-availability.ts`
  - `calculateMarketAvailability()`: events use advance cutoff, event date range filtering

### Phase 3: Admin + Vendor Event Management ✅
- **API routes (3 files)**: admin/markets, vendor/markets/suggest, vendor/markets
- **Vendor Markets Page**: full events section, suggestion form, cutoff function updated
- **MarketSelector**: events section between traditional and private pickup

### Phase 4: Public Visibility + Full Ordering Flow ✅
- **UI emoji/color updates (10 files)**: checkout, checkout/success, browse, dashboard, vendor/dashboard, PickupLocationsCard, AddToCartButton, CutoffStatusBanner
- **MarketCard**: event badge, event date range display, event_start_date/event_end_date props
- **Public markets page**: "Upcoming Events" section with event cards, parallel query
- **Event detail page (NEW)**: `src/app/[vertical]/markets/[marketId]/page.tsx` — shows event info, dates, location, schedule, attending vendors
- **Vendor profile page**: type expanded to include `'event'`, event date fields, past event filtering
- **Vendor schedule page**: type expanded to include `'event'`
- **Admin markets page**: market type selector (Traditional/Event), event date pickers, event URL, cutoff hours, event filter option in dropdown
- **Cart route**: event schedule validation alongside private_pickup
- **Cart validate route**: updated mixed market type warning text
- **Vendor markets getDefaultCutoffHours**: events return 24 (not FT 0)

## Files Modified (All Phases)
- `supabase/migrations/20260221_039_add_event_market_type.sql` (NEW)
- `supabase/migrations/20260221_040_event_availability_function.sql` (NEW)
- `src/app/[vertical]/markets/[marketId]/page.tsx` (NEW — event detail page)
- `src/types/pickup.ts`
- `src/lib/constants.ts`
- `src/lib/vendor-limits.ts`
- `src/lib/vertical/types.ts`
- `src/lib/vertical/configs/food-trucks.ts`
- `src/lib/vertical/configs/farmers-market.ts`
- `src/lib/utils/listing-availability.ts`
- `src/components/markets/MarketsWithLocation.tsx`
- `src/components/markets/MarketCard.tsx`
- `src/components/vendor/PickupScheduleGrid.tsx`
- `src/components/vendor/MarketSelector.tsx`
- `src/app/[vertical]/markets/page.tsx`
- `src/app/[vertical]/checkout/page.tsx`
- `src/app/[vertical]/checkout/success/page.tsx`
- `src/app/[vertical]/browse/page.tsx`
- `src/app/[vertical]/dashboard/page.tsx`
- `src/app/[vertical]/vendor/dashboard/page.tsx`
- `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx`
- `src/app/[vertical]/vendor/[vendorId]/schedule/page.tsx`
- `src/app/[vertical]/vendor/markets/page.tsx`
- `src/app/[vertical]/admin/markets/page.tsx`
- `src/app/api/admin/markets/route.ts`
- `src/app/api/vendor/markets/suggest/route.ts`
- `src/app/api/vendor/markets/route.ts`
- `src/app/api/vendor/market-stats/route.ts`
- `src/app/api/vendor/home-market/route.ts`
- `src/app/api/vendor/markets/[id]/schedules/route.ts`
- `src/app/api/cart/route.ts`
- `src/app/api/cart/validate/route.ts`
- `src/components/listings/PickupLocationsCard.tsx`
- `src/components/listings/CutoffStatusBanner.tsx`
- `src/components/cart/AddToCartButton.tsx`

## Key Decisions
- Events use advance cutoff (default 24h) even for FT vertical
- FT events bypass same-day-only restriction (FM-style 7-day window)
- Events require attendance records (same as FT parks)
- Events don't count toward traditional market tier limits
- Past events auto-filtered by `event_end_date >= today`
- Event emoji: 🎪, dot color: #f59e0b (amber)

## TSC + Tests Status
- `npx tsc --noEmit` — CLEAN ✅
- `npx vitest run` — 34/34 tests pass ✅

## Git State
- All changes are LOCAL only (not committed yet)
- main is 3 commits ahead of origin/main (from Session 38)
- Migrations 039 + 040 NOT applied to any environment yet

## Next Steps
- Commit all changes
- Push to staging for testing
- Apply migrations 039 + 040 to Dev + Staging
- Update SCHEMA_SNAPSHOT.md after migrations applied
