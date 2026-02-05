# Current Task: Pickup Scheduling System Implementation
Started: 2026-02-05
Last Updated: 2026-02-05 (Session 3 - pre-compaction save)

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

## ACTIVE BUG INVESTIGATION: Cancel Order "Order item not found"

### Symptoms
- User tried to cancel order FW-2026-62281
- After providing reason and confirming, got error: "Order item not found"
- This was during testing of the duplicate order bug

### Database State (verified)
- **Order exists**: `8f575a50-2303-4bf6-8e48-21b3cf308a8e` (FW-2026-62281)
- **Order status**: `pending` (NOT `paid` - Stripe callback may not have updated it)
- **Order items exist**:
  - `f2ba3ad4-f942-4ff9-824e-e0218e6a06e8` (Asparagus spears)
  - `8019b3f6-2237-4271-bf4d-937fa8f5b271` (Wooden widgets)
- **3 duplicate orders** from testing (duplicate order bug):
  - FW-2026-62281 (21:19:13)
  - FW-2026-01719 (21:18:38)
  - FW-2026-05662 (21:17:45)

### ROOT CAUSE IDENTIFIED: RLS Policy Issue
- **Screenshot shows**: cancel request returned HTTP 500
- **DB query works**: order_item joins to orders successfully in Supabase dashboard (service role)
- **API fails**: Because it uses authenticated client subject to RLS
- **Conclusion**: `order_items_select` RLS policy is blocking the query

### Next Steps
1. Check RLS policy `order_items_select` - does it allow buyer access via orders.buyer_user_id?
2. Run this query to see what the policy allows:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'order_items';
   ```
3. Fix the RLS policy to allow buyers to select their order items
4. File: `src/app/api/buyer/orders/[id]/cancel/route.ts`

## Commits Made This Session (02/05/2026 Session 3)

1. `cb9b0e8` - Fix ERR_DB_010 and complete pickup scheduling UI
2. `4af90e9` - Add Data-First Policy and Context Compaction Recovery rules
3. `93ba171` - Update migration log through 2026-02-05
4. `6c9c9c2` - Add Migration File Management rule
5. `4645ab9` - Fix duplicate orders and per-transaction fee bugs

## New Rules Added to CLAUDE.md
1. **Data-First Policy** - No assumptions when data available
2. **Context Compaction Recovery Protocol** - Verify schema after compaction
3. **Migration File Management** - Move to applied/ after confirmed in both envs

## Key Context for Next Session
- The `pickup_start_time` and `pickup_end_time` columns DO NOT EXIST - always use `pickup_snapshot.start_time/end_time`
- Cart items now have `pickup_display` with `date_formatted`, `time_formatted`, `day_name`
- Schema snapshot updated with critical warnings about pickup columns (supabase/SCHEMA_SNAPSHOT.md)
- TypeScript check passes - no build errors
- Cross-sell section now uses purple colors instead of yellow

### Cancel Bug Investigation Context
- Cancel API: `src/app/api/buyer/orders/[id]/cancel/route.ts`
- The `[id]` parameter is ORDER_ITEM id (not order id)
- Query uses `orders!inner` join which requires RLS access to both tables
- User: cottagevendor1+test@test.com, buyer_user_id: b81d3ff9-074c-439c-a8e4-1cfa16172bfd

### Duplicate Order Fix Context
- Added to `src/app/api/checkout/session/route.ts` (lines ~35-95)
- Checks for pending orders within 30 minutes with matching items/quantities
- If match found with valid Stripe session, returns existing URL
- Prevents creating new order on back-button from Stripe
