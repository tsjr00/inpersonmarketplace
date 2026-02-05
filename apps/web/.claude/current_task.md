# Current Task: Pickup Scheduling System Implementation
Started: 2026-02-05
Last Updated: 2026-02-05

## Goal
Implement pickup date selection where buyers choose specific pickup DATES (not just locations). Each date has its own order cutoff, allowing vendors to offer multiple pickup days per week.

## Key Decisions Made
- **Schedule-based selection**: Use (schedule_id, pickup_date) pair instead of just market_id
- **Pickup snapshot at checkout**: Store immutable JSONB snapshot of pickup details so order info persists even if vendor changes schedule
- **SQL functions for availability**: Server-side calculation via `get_available_pickup_dates()` for consistent timezone handling
- **Cutoff hours from database**: NEVER hardcode - use `markets.cutoff_hours` (18 for traditional, 10 for private_pickup)
- **Color coding**: Blue/purple/teal for date differentiation (NOT red/yellow/green which are for status)

## Critical Context (DO NOT FORGET)
- Traditional markets: 18-hour cutoff before pickup (stored in markets.cutoff_hours)
- Private pickup: 10-hour cutoff before pickup (stored in markets.cutoff_hours)
- "Closing soon" threshold must use market's cutoff_hours, NOT hardcoded 24
- Migration 003 needed DROP FUNCTION before CREATE due to return type change

## What's Been Completed
- [x] Schema migration (20260205_001): Added schedule_id, pickup_date to cart_items and order_items
- [x] SQL functions migration (20260205_002): get_available_pickup_dates, validate_cart_item_schedule, build_pickup_snapshot
- [x] Cutoff threshold fix migration (20260205_003): Added cutoff_hours to function output
- [x] Type definitions (src/types/pickup.ts)
- [x] Listing page updates - shows pickup dates with status
- [x] AddToCartButton - date selection instead of market selection
- [x] useCart hook - extended for schedule_id and pickup_date
- [x] Cart API (items/route.ts) - validates and stores schedule/date
- [x] Cart API (route.ts) - returns schedule_id and pickup_date
- [x] Checkout page - displays pickup dates
- [x] Checkout session API - builds pickup snapshots
- [x] Buyer orders list API - includes pickup_snapshot and display field
- [x] Buyer order detail API - includes pickup_snapshot and display field
- [x] Checkout success API - includes pickup_snapshot
- [x] Vendor orders API - includes pickup_snapshot and display field
- [x] Checkout success page transform - uses pickup_snapshot
- [x] Buyer orders list page - updated interface for display field
- [x] Fixed cutoff threshold in: AddToCartButton, PickupLocationsCard, CutoffStatusBanner, availability API, browse page, vendor listings page
- [x] Context Preservation System added to CLAUDE.md

## What's Remaining
- [ ] Test full checkout flow with pickup snapshots
- [ ] Verify order displays show correct pickup info from snapshots
- [ ] Vendor dashboard updates for multi-schedule management (Phase 5)
- [ ] Schedule deletion protection UI (Phase 6)
- [ ] Cart cleanup notifications when schedule deactivated (Phase 7)
- [ ] End-to-end testing (Phase 8)

## Files Modified (Key Files)
- `supabase/migrations/20260205_001_pickup_scheduling_schema.sql` - Schema changes
- `supabase/migrations/20260205_002_pickup_scheduling_functions.sql` - SQL functions
- `supabase/migrations/20260205_003_fix_cutoff_threshold.sql` - Added cutoff_hours to output
- `src/types/pickup.ts` - Type definitions with cutoff_hours
- `src/components/cart/AddToCartButton.tsx` - Date selection UI
- `src/lib/hooks/useCart.tsx` - Cart state with schedule/date
- `src/app/api/cart/items/route.ts` - Cart item creation with validation
- `src/app/api/checkout/session/route.ts` - Builds pickup_snapshot
- `src/app/api/buyer/orders/route.ts` - Returns pickup_snapshot in response
- `src/app/api/buyer/orders/[id]/route.ts` - Returns pickup_snapshot in detail
- `src/app/api/vendor/orders/route.ts` - Returns pickup_snapshot for vendors
- `src/lib/utils/listing-availability.ts` - Added cutoff_hours to ProcessedMarket

## Gotchas / Watch Out For
- PostgreSQL requires DROP FUNCTION before CREATE if changing return type
- Must use `ALTER TABLE DROP CONSTRAINT` not `DROP INDEX` for unique constraints
- cutoff_hours must come from database, not hardcoded - check all files for hardcoded "24"
- The "closing soon" display should only show when within market's cutoff_hours window

## Migration Status
- 20260205_001: Applied to dev & staging
- 20260205_002: Applied to dev & staging
- 20260205_003: Needed fix (DROP FUNCTION), re-run needed on dev

## Commits Made
1. "Add pickup date selection system for buyers" - main implementation
2. "Add pickup_snapshot support to order display APIs" - API updates
3. "Fix cutoff threshold to use market-specific policy" - removed hardcoded 24
4. "Fix migration: drop function before recreating" - PostgreSQL fix
5. "Add Context Preservation System" - this system
