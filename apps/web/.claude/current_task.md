# Current Task: Session 36 — Critical Fixes COMPLETE
Started: 2026-02-19

## STATUS: ALL 7 CRITICAL FIXES DONE. TSC passes. Ready to commit.

## CANONICAL REFERENCE
**`apps/web/.claude/session36_audit_report.md`** — Master todo list with checkboxes.

## COMPLETED FIXES

### C1: Tips Now Route to Vendors ✅
- All 3 payout routes (`fulfill`, `confirm-handoff`, `buyer/confirm`) now:
  - Include `tip_amount` in the order select query
  - Count total items in the order for proration
  - Calculate `tipShareCents = Math.round(tip_amount / totalItemsInOrder)`
  - Add tip share to the Stripe transfer amount
  - Record actual payout (including tip) in `vendor_payouts.amount_cents`
- Per Session 28: Stripe processing on tip comes from tip itself (vendor absorbs)

### C2+C3: Double Payout Prevention ✅
- `fulfill/route.ts`: Added `vendor_payouts` existence check with `.neq('status', 'failed').maybeSingle()` before Stripe transfer
- `confirm-handoff/route.ts`: Same pattern added
- `buyer/confirm/route.ts`: Already had check — upgraded with `.neq('status', 'failed')` filter so failed payouts can be retried
- All 3 routes now return early if a non-failed payout already exists

### C4: Market Detail Vertical Filter ✅
- `src/app/[vertical]/markets/[id]/page.tsx`: Added `.eq('vertical_id', vertical)` to prevent cross-vertical market access

### C6: Module-Level Supabase Clients ✅
- `api/submit/route.ts`: Replaced module-level `createClient()` from `@supabase/supabase-js` with per-request `createServiceClient()` from `@/lib/supabase/server`
- `api/vertical/[id]/route.ts`: Same — replaced module-level anon client with per-request `createClient()` from `@/lib/supabase/server`

### C7: Vendor Analytics Rewritten ✅
- All 4 analytics routes rewritten from `transactions` table to `order_items`:
  - `overview/route.ts`: Uses `order_items.subtotal_cents` for revenue, proper status mapping (fulfilled/completed → completed, paid/confirmed/ready → pending, cancelled/refunded → cancelled). Fixed averageOrderValue bug (was dividing by all orders, now by completed only)
  - `top-products/route.ts`: Groups by `listing_id`, uses `quantity` for total_sold and `subtotal_cents` for revenue
  - `customers/route.ts`: JOINs `order_items` → `orders` for `buyer_user_id`, same new/returning classification
  - `trends/route.ts`: Replaced `get_vendor_revenue_trends` RPC with direct `order_items` query + JS date grouping (day/week/month)

## Files Modified (10 files)
1. `src/app/api/vendor/orders/[id]/fulfill/route.ts` — C1 tip + C2 payout check
2. `src/app/api/vendor/orders/[id]/confirm-handoff/route.ts` — C1 tip + C3 payout check
3. `src/app/api/buyer/orders/[id]/confirm/route.ts` — C1 tip + upgraded payout check
4. `src/app/[vertical]/markets/[id]/page.tsx` — C4 vertical filter
5. `src/app/api/submit/route.ts` — C6 per-request client
6. `src/app/api/vertical/[id]/route.ts` — C6 per-request client
7. `src/app/api/vendor/analytics/overview/route.ts` — C7 rewrite
8. `src/app/api/vendor/analytics/top-products/route.ts` — C7 rewrite
9. `src/app/api/vendor/analytics/customers/route.ts` — C7 rewrite
10. `src/app/api/vendor/analytics/trends/route.ts` — C7 rewrite

## REMAINING AUDIT ITEMS
See `session36_audit_report.md` for full list. Next priorities:
- H1+H20: Refund wrong amount (vendor rejection + auto-expiry)
- H2+H3: External checkout missing inventory/cutoff checks
- H12+H13: Onboarding multi-vertical filter
- H16: Subscription downgrade timing
