# Current Task: Pickup Scheduling System Implementation
Started: 2026-02-05
Last Updated: 2026-02-05 (Session 2 - pre-compaction save)

## Goal
Implement pickup date selection where buyers choose specific pickup DATES (not just locations). Each date has its own order cutoff, allowing vendors to offer multiple pickup days per week.

## CRITICAL BUG FIXED THIS SESSION
**ERR_DB_010 "Invalid column reference" on buyer orders page**
- **Root Cause**: API files were querying `pickup_start_time` and `pickup_end_time` columns that DON'T EXIST in order_items table
- **The migration only added**: `schedule_id`, `pickup_date`, `pickup_snapshot` (NOT the time columns)
- **Files Fixed**:
  - `src/app/api/buyer/orders/route.ts` - Removed non-existent columns from query
  - `src/app/api/buyer/orders/[id]/route.ts` - Removed non-existent columns from query
  - `src/app/api/vendor/orders/route.ts` - Removed non-existent columns from query
  - `src/app/api/checkout/success/route.ts` - Removed non-existent columns from query
- **Solution**: Get start_time/end_time from `pickup_snapshot` JSONB field instead

## UI IMPROVEMENTS IN PROGRESS (NOT YET COMMITTED)

### 1. Pickup Times on Checkout - DONE
- Added `pickup_display` to CheckoutItem interface
- Updated merge logic to include pickup_display from cart items
- Updated checkout item display to show time: `@ 9:00 AM - 12:00 PM`

### 2. Multiple Pickup Location Banner - DONE
- Removed the large icon column layout
- Put icon inline with header: `📍 Multiple Pickup Locations`
- Condensed text to reduce rows
- Made checkbox label shorter

### 3. Cross-sell Section Color Change - DONE
- Changed background from yellow to soft lavender (`#F5F3FF`)
- Changed border from accent yellow to light purple (`#DDD6FE`)
- Changed card borders to light purple (`#E9D5FF`)
- Changed button from yellow to purple (`#A78BFA`) with white text
- Put vendor name on same line as price using flexbox

### 4. Checkout Success Screen Improvements - NOT STARTED
- User wants to capture feedback/reviews while they have buyer's attention
- Ideas: testimonial capture, feedback form, satisfaction rating
- NOT STARTED

## Phase 6 & 7 - COMPLETED

### Phase 6: Schedule Deletion Protection
- [x] API blocks market deletion with pending orders
- [x] API blocks pickup window removal with pending orders
- [x] API blocks schedule deactivation with pending orders
- [x] MarketScheduleSelector shows blocking errors in red

### Phase 7: Cart Schedule Validation
- [x] Cart API validates schedules and returns `schedule_issue` for invalid items
- [x] Cart API returns `hasScheduleIssues` flag
- [x] CartItem interface extended with `pickup_display` and `schedule_issue`
- [x] CartDrawer shows warning banner and highlights invalid items
- [x] Checkout page blocks checkout when hasScheduleIssues is true

## Files Modified This Session
- `src/app/api/buyer/orders/route.ts` - Fixed ERR_DB_010 bug
- `src/app/api/buyer/orders/[id]/route.ts` - Fixed ERR_DB_010 bug
- `src/app/api/vendor/orders/route.ts` - Fixed ERR_DB_010 bug
- `src/app/api/checkout/success/route.ts` - Fixed ERR_DB_010 bug
- `src/app/api/cart/route.ts` - Added schedule validation, pickup_display
- `src/lib/hooks/useCart.tsx` - Added hasScheduleIssues, pickup_display
- `src/components/cart/CartDrawer.tsx` - Shows pickup info and schedule warnings
- `src/components/vendor/MarketScheduleSelector.tsx` - Shows blocking errors in red
- `src/app/[vertical]/checkout/page.tsx` - Added pickup times, fixed multi-location banner

## What's Remaining
- [x] Change cross-sell section background color (not yellow) - DONE
- [x] Put vendor name on same line as price in cross-sell cards - DONE
- [x] Fix duplicate order bug (back button from Stripe) - DONE
- [x] Fix $0.15 per-transaction fee (was per-item) - DONE
- [ ] Checkout success screen - add feedback/review capture
- [ ] Test full checkout flow with pickup snapshots
- [ ] Test vendor dashboard upcoming pickups display
- [ ] End-to-end testing (Phase 8)

## Critical Bug Fixes (02/05/2026 - Session 3)

### Duplicate Orders on Stripe Back Button
- **Root cause**: Orders created BEFORE Stripe payment confirmation
- **Fix**: Check for existing pending orders (matching items, quantities, recency within 30 min)
- **If match found**: Verify Stripe session still open, return existing URL
- **File**: `src/app/api/checkout/session/route.ts`

### $0.15 Transaction Fee Applied Per-Item Instead of Per-Order
- **Root cause**: `calculateFees()` called per item, adds $0.15 each time
- **Fix**: After processing items, subtract extra flat fees: `(itemCount - 1) * flatFee`
- **File**: `src/app/api/checkout/session/route.ts`

## Key Context for Next Session
- The `pickup_start_time` and `pickup_end_time` columns DO NOT EXIST - always use `pickup_snapshot.start_time/end_time`
- Cart items now have `pickup_display` with `date_formatted`, `time_formatted`, `day_name`
- Schema snapshot updated with critical warnings about pickup columns (supabase/SCHEMA_SNAPSHOT.md)
- TypeScript check passes - no build errors
- Cross-sell section now uses purple colors instead of yellow
