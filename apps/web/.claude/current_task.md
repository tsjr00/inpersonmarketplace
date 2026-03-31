# Current Task: Event System — End-to-End Shopping Flow
Started: 2026-03-30 (Session 66)

## Status: WORKING — Cart + checkout flow verified on prod

### What Was Accomplished This Session

**Cart validation fix (BLOCKER RESOLVED):**
- Root cause: `get_available_pickup_dates()` generates dates via `generate_series(0, 7)` — 8-day window. Events >7 days away were excluded.
- Fix: Migration 105 adds UNION to `date_series` CTE for event date ranges. Verified on prod: `validate_cart_item_schedule` returns TRUE, items add to cart correctly.
- Rollback file: `supabase/migrations/ROLLBACK_105.sql` (verified against prod function source)

**Event pages moved under [vertical] layout:**
- `/events/[token]/*` → `/[vertical]/events/[token]/*`
- Shop page rewritten to use `useCart()` from CartProvider (was using disconnected local state)
- Fixes: sticky cart bar shows real server cart, "X in cart" per listing, correct item counts, "Checkout" label
- URL references updated in 7 backend locations + middleware

**Event vendor order capacity caps (Migration 106):**
- `event_max_orders_total` and `event_max_orders_per_wave` columns on `market_vendors`
- Vendor acceptance UI: FM gets total field, FT gets wave-aware calculator with profile default
- FT vendors missing event readiness data see error message, can't accept until profile updated
- Cart enforcement REVERTED — was added to cart/items/route.ts and broke cart. Must be reimplemented via separate endpoint.

**Event lifecycle automation (Cron Phases 14-15):**
- Phase 14: `ready` → `active` on `event_start_date`
- Phase 15: `active` → `review` after `event_end_date`
- Admin can manually override both transitions

**Unfulfilled order check:**
- When admin marks event `completed`, checks for non-fulfilled/completed/cancelled orders
- Notifies affected vendors with count
- Does not block transition — logs warning

**UX fixes:**
- Cross-sell suppressed for event orders in checkout
- "Continue Shopping" hidden in cart drawer for event orders
- Event info page footer now vertical-aware (was hardcoded "Food Truck'n")

### Session 66 Incident: Cart API Broken in Production

Event order cap enforcement code was added to `cart/items/route.ts` without explicitly flagging this as a critical-path file modification. The additional queries broke the cart — items were not saved to `cart_items` despite success messages in the UI. Discovered by user on prod.

**Response:** Immediate revert from verified pre-session source. Cart restored.

**New safeguard:** `.claude/rules/critical-path-files.md` — 13 protected files listed. Mechanical gate: must name exact file path + state risk + show diff + get file-specific approval. Design approval ≠ file approval.

**Pending:** Cap enforcement needs reimplementation via a separate validation endpoint (not inside cart/items/route.ts).

### Files Changed This Session
- `apps/web/src/app/[vertical]/events/[token]/page.tsx` — MOVED from /events/, params updated, footer vertical-aware
- `apps/web/src/app/[vertical]/events/[token]/shop/page.tsx` — REWRITTEN: useCart() instead of local state
- `apps/web/src/app/[vertical]/events/[token]/select/page.tsx` — MOVED from /events/, lint fixes
- `apps/web/src/app/api/events/[token]/shop/route.ts` — unchanged (API stays)
- `apps/web/src/app/api/events/[token]/select/route.ts` — URL updated to include vertical
- `apps/web/src/app/api/admin/events/[id]/route.ts` — URL updated + unfulfilled order check on completed
- `apps/web/src/app/api/vendor/events/[marketId]/respond/route.ts` — capacity fields + URL update
- `apps/web/src/app/api/vendor/events/[marketId]/route.ts` — returns profile capacity data
- `apps/web/src/app/api/cron/expire-orders/route.ts` — Phases 14 + 15 + URL update
- `apps/web/src/app/[vertical]/vendor/events/[marketId]/page.tsx` — capacity UI (FM + FT)
- `apps/web/src/app/[vertical]/admin/events/page.tsx` — URL updated for event link
- `apps/web/src/app/[vertical]/checkout/page.tsx` — cross-sell suppressed for events
- `apps/web/src/components/cart/CartDrawer.tsx` — "Continue Shopping" hidden for events
- `apps/web/src/lib/notifications/types.ts` — event feedback URL updated
- `apps/web/src/middleware.ts` — removed 'events' from NON_VERTICAL_PREFIXES
- `apps/web/.claude/rules/critical-path-files.md` — NEW: protected file list

### Migrations Applied (All 3 Environments)
- `20260330_105_event_date_range_in_pickup_dates.sql` — event dates in pickup function
- `20260330_106_event_vendor_order_caps.sql` — capacity columns on market_vendors

### Key Test Data
- Event shop URL: `https://farmersmarketing.app/farmers_market/events/chef-prep-caapg2/shop`
- Market ID: `6e328bc0-2704-49b9-a790-6984a26b1a6d`
- Schedule ID: `c8a55720-fc01-42b7-b546-d520622f6392`
- Event date: 2026-04-11

### Backlog Additions from This Session
- Event order cap enforcement via separate endpoint (NOT in cart/items/route.ts)
- Event capacity alert for unlimited-inventory vendors
- Schema snapshot refresh (market_vendors table stale)
- Admin PATCH duplicates approval logic (should call shared function)
- Phase 11 cron hardcodes `vertical: 'food_trucks'`
- Phase 12 cron email FT language for all verticals
- Public event page N+1 vendor queries
- Event organizer "My Events" dashboard card (carried from session 65)
