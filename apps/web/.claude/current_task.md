# Current Task: Pickup Scheduling System Implementation
Started: 2026-02-05
Last Updated: 2026-02-06 (Session 4 - pre-compaction save)

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
- `src/app/api/buyer/orders/[id]/cancel/route.ts` - Fixed RLS bypass for cancel (Session 4)
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
- [x] Fix cancel order "Order item not found" RLS bug - DONE (Session 4)
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

## FIXED: Cancel Order "Order item not found" (Session 4 - 02/05/2026)

### Root Cause
- RLS policy on `order_items` blocked direct queries even though the function looked correct
- `order_items_select` policy uses `user_buyer_order_ids()` function
- Querying `order_items` directly triggered RLS failure
- Querying `orders` directly works fine

### Fix Applied
File: `src/app/api/buyer/orders/[id]/cancel/route.ts`

Changed query approach to bypass the RLS issue:
1. Query `orders` first with nested `order_items` (buyer_user_id filter)
2. Find the order containing the target order_item_id
3. Extract both order and orderItem from the nested result
4. Continue with cancellation logic

This mirrors how the working order detail API operates - query orders first, get items nested.

## Session 4 Changes (02/05-06/2026)

### Cancel API Fixes
1. **RLS bypass** - Query orders first with nested order_items instead of querying order_items directly
2. **Removed non-existent columns**:
   - `cancellation_fee_cents` - doesn't exist on order_items
   - `grace_period_ends_at` - doesn't exist on orders (migration never applied)
3. **Restored `profile_data`** - DOES exist on vendor_profiles (was incorrectly removed)
4. **Grace period calculation** - Now uses `created_at + 1 hour` since column doesn't exist

### Cancel UI Fixes
1. Added `await` before `fetchOrder()` to ensure UI updates
2. Added success alert for cancellations without fee
3. Order total now excludes cancelled items (both list and detail pages)
4. Added `cancelled_at` to Order interface and API response

### Payment Record Fix
- **Root cause**: Webhook and checkout success were updating `grace_period_ends_at` column that doesn't exist
- **Files fixed**: `src/lib/stripe/webhooks.ts`, `src/app/api/checkout/success/route.ts`
- **Status**: NEEDS TESTING - user should create new order to verify payment record creation

### Schema Snapshot Updates
- Added complete vendor_profiles columns (41 columns verified)
- Added note: `grace_period_ends_at` does NOT exist on orders
- Migration `20260127_001_cancellation_grace_period.sql` was NEVER applied

### CLAUDE.md Updates
- Added "When to Verify vs When to Hypothesize" guidance to Data-First Policy

## PENDING - Next Session

### Immediate: Test Payment Record Creation
User needs to create new order, complete Stripe checkout, then verify:
```sql
SELECT p.*, o.order_number
FROM payments p
JOIN orders o ON o.id = p.order_id
ORDER BY p.created_at DESC LIMIT 5;
```

### Architecture Review: Fee Calculations
**Problem identified**: Multiple calculation routines for fees instead of unified function
- Stripe shows $33.48, app shows $33.32 (difference is the $0.15 flat fee)
- `calculateDisplayPrice` in `src/lib/constants.ts` adds flat fee
- But display in orders may not be using this consistently

**Files with fee calculations:**
- `src/lib/stripe/config.ts` - STRIPE_CONFIG with fee percentages
- `src/lib/constants.ts` - calculateDisplayPrice, PLATFORM_FEE_RATE
- `src/app/api/checkout/session/route.ts` - calculateFees function
- `src/lib/stripe/payments.ts` - may have calculations

**Action needed**: Audit all fee calculations, unify into single source of truth

## Commits Made This Session (02/05/2026 Session 3)

1. `cb9b0e8` - Fix ERR_DB_010 and complete pickup scheduling UI
2. `4af90e9` - Add Data-First Policy and Context Compaction Recovery rules
3. `93ba171` - Update migration log through 2026-02-05
4. `6c9c9c2` - Add Migration File Management rule
5. `4645ab9` - Fix duplicate orders and per-transaction fee bugs

## Commits Made Session 4 (02/05-06/2026)
1. `59335d6` - Fix order cancel API RLS bypass issue
2. `22d87d8` - Fix cancel API: remove non-existent cancellation_fee_cents column
3. `bb0826d` - Fix cancel API: remove potentially missing columns
4. `6912677` - Update schema snapshot with verified data, fix cancel API
5. `c208b79` - Fix cancel UI: await fetchOrder and add success message
6. `ce35787` - Fix order total to exclude cancelled items
7. `eadd97c` - Fix payment record creation: remove non-existent grace_period_ends_at
8. `14b61ca` - Add verification vs hypothesis guidance to Data-First Policy

## New Rules Added to CLAUDE.md
1. **Data-First Policy** - No assumptions when data available
2. **Context Compaction Recovery Protocol** - Verify schema after compaction
3. **Migration File Management** - Move to applied/ after confirmed in both envs
4. **When to Verify vs Hypothesize** - Added in Session 4

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
