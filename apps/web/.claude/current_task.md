# Current Task: Session 52 (continued) — Advance Ordering + 48hr Lead Time

Started: 2026-03-12

## Goal
1. Fix FT timezone bug in `get_available_pickup_dates()` (DONE)
2. Add advance ordering for FT catering/bulk pre-orders (DONE — migration 079 applied)
3. Restrict advance ordering to event-approved catering items only (DONE — committed)
4. Unified browse filter bar with 3 dropdowns (DONE — committed + pushed to staging)
5. Catering menu filter on browse page (DONE — committed + pushed to staging)
6. **48-hour lead time for catering orders** (DONE — migration 080 applied, code changes ready)

## UNCOMMITTED CHANGES — NEED COMMIT + PUSH

### 48-Hour Lead Time Implementation (6 touchpoints):

1. **Migration 080** — `get_available_pickup_dates()` rewrite: catering items (`advance_order_days > 0`) now get dates from `[local_today+2, local_today+advance_order_days]` instead of `[local_today, local_today+advance_order_days]`. Applied to all 3 envs. Moved to applied/.

2. **ListingForm.tsx** — Removed "1 day ahead" option (minimum 2 days for catering). Updated help text with 48hr rule.

3. **checkout/types.ts** — Added `advance_order_days` to `CheckoutItem` interface.

4. **cart/validate/route.ts** — Added `advance_order_days` to listings select + response so checkout can detect catering items.

5. **checkout/page.tsx** — Detects catering items in cart, filters out cash from payment methods, shows info banner: "This order includes catering items. Cash payment is not available for advance orders."

6. **checkout/external/route.ts** — Server-side guard: rejects cash payment for orders containing catering items (advance_order_days > 0).

7. **listing/[listingId]/page.tsx** — Blue "Advance Order · Prepaid" badge on listings with advance_order_days > 0.

### Schema/docs updates (also uncommitted):
- `supabase/SCHEMA_SNAPSHOT.md` — Changelog entries for migrations 079 + 080, updated function description
- `supabase/migrations/MIGRATION_LOG.md` — Both migrations marked ✅ all 3 envs
- Migrations 079 + 080 moved to `applied/`

## ALREADY COMMITTED + PUSHED TO STAGING

### Commit `57d5c9b` — Browse filter bar + catering restriction (pushed to staging)
- BrowseFilterBar.tsx (NEW), browse page.tsx, SearchFilter.tsx, ListingForm.tsx

### Commit `692af5e` — Advance order days + timezone fix (pushed to staging)
- Migration 079, ListingForm, AddToCartButton

### Earlier Session 52 commits (all pushed to prod + staging):
1. `e44116c` — 32 of 40 audit fixes (27 files)
2. `0ad1c57` — Migration 078 applied all 3 envs
3. `b6ef52d` — Display name mandatory + business rules updates
4. `1717a19` — Fix /api/health: anon key
5. `09b8a0a` — CI: add NEXT_PUBLIC_SUPABASE_ANON_KEY
6. `268180d` — Fix CI lint: require() → ES module imports
7. `d53fe5e` — Listing detail: Qty Available, force-dynamic, continue shopping nav

## Key Decisions Made

### 48-Hour Lead Time Rules
- 2 calendar days minimum (not true 48 hours — simpler, always >= 48hr)
- Hardcoded in SQL function (no per-listing `lead_time_days` column)
- `advance_order_days > 0` = proxy for "catering item" (accurate since only catering items have this set)
- Mixed carts allowed — if any catering item, cash is removed from payment options
- Payment apps (Venmo/CashApp/PayPal) still allowed; only cash is blocked
- Server-side enforcement in external checkout API (can't bypass via API)

### FT Advance Ordering Architecture
- `advance_order_days` column on `listings` table (INTEGER, default 0)
- Default 0 = same-day only (identical to current behavior, zero risk)
- Values 2-7 extend the FT ordering window for that specific listing
- SQL date window: `[local_today + 2, local_today + advance_order_days]`
- Only available for event-approved FT vendors on listings marked "Available for Events"
- Regular walk-up menu items stay same-day only

### Timezone Bug Root Cause
- Migration 040 applied to Prod on 2026-03-07 out of order, reverting 054's fix
- Fix: migration 079 includes both event support AND timezone fix (supersedes both 040 and 054)

### Browse Filter Bar Design
- 3 dropdowns in outlined box: View, Availability, Menu Type (FT only)
- Catering filter: `listing_data->>'event_menu_item'`
- URL param: `?menu=catering` or `?menu=daily`

## Branch Status
- Main is 4+ ahead of origin/main (several commits not pushed to prod)
- Staging synced through browse filter bar commit
- New 48hr changes uncommitted

## Remaining Items
- **Commit + push to staging** — 48hr lead time changes
- **M-2**: Vendor confirm 30-sec window — user must review before fix
- **H-2**: Market box cancellation flow — needs code review
- **M-16**: Nearby vendors DB-level pagination — deferred
- **Catering feature backlog**: min_quantity, separate pricing, lead time display to buyers
