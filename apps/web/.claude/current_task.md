# Current Task: Session 10 — Audit Hardening + RLS Optimization
Started: 2026-02-09
Last Updated: 2026-02-09 (Session 10)

## What Was Completed This Session

### 1. withErrorTracing on 90 API Routes (COMMITTED - `1c88c9e`)
- Wrapped all 90 unwrapped API route handlers with `withErrorTracing()`
- Pattern: `import { withErrorTracing } from '@/lib/errors'`, wrap each handler body
- 5 parallel agents processed batches: admin, buyer/cart/auth, vendor batch 1, vendor batch 2, misc
- No logic changes — purely mechanical wrapping

### 2. Fee Structure Documentation (COMMITTED - `231986e`)
- Created `docs/Fee_Structure.md` with complete breakdown
- Stripe orders: 13% + $0.30 (6.5% buyer + 6.5% vendor + $0.15 flat each)
- External payments: 10% (6.5% buyer + 3.5% vendor, no flat fee)
- Market boxes: same as Stripe orders, `total_paid_cents` includes buyer fee
- Auto-deduction: up to 50% of Stripe payouts for external fee balances
- Invoice threshold: $50 or 40 days

### 3. Performance Indexes (COMMITTED - `851c115`, APPLIED to Dev & Staging)
- `supabase/migrations/20260209_001_add_performance_indexes.sql`
- 10 indexes targeting high-traffic queries:
  - Notifications: `idx_notifications_user_unread` (partial), `idx_notifications_user_created`
  - Order items: `idx_order_items_status_expires` (cron), `idx_order_items_vendor_status_created`, `idx_order_items_pickup_date_market`
  - Orders: `idx_orders_parent_id` (split orders), `idx_orders_vertical_created` (admin)
  - Market boxes: `idx_market_box_pickups_sub_date_status`, `idx_market_box_offerings_vendor_active` (name collision, skipped), `idx_market_box_subscriptions_offering_active`

### 4. RLS Policy Merge — 6 Tables (COMMITTED - `c68a2ea`, APPLIED to Dev & Staging)
- `supabase/migrations/20260209_002_merge_duplicate_select_policies.sql`
- Merged admin_select + regular select into single policy on: listings, orders, order_items, transactions, vendor_payouts, notifications
- Dropped ~40 old-named policies from previous schema versions
- Pure performance optimization — Postgres OR-combines permissive policies anyway

### 5. RLS Policy Merge — Markets (COMMITTED - `99baf12`, APPLIED to Dev & Staging)
- `supabase/migrations/20260209_003_merge_markets_select_policies.sql`
- Merged `markets_select` + `markets_public_select` into single comprehensive `markets_select`
- Includes: approved+active, vendor owns it, buyer order history (2 paths), platform admin, vertical admin
- Split out from #4 as risk reduction (complex policy)

### 6. Schema Snapshot Updated
- `supabase/SCHEMA_SNAPSHOT.md` updated with all 4 migrations
- Changelog, columns, RLS policies, and indexes all current

## Earlier This Session (Before Audit Items)

### Market Box Mutual Confirmation (COMMITTED - `5eaaf42`, APPLIED to Dev & Staging)
- `supabase/migrations/20260208_001_market_box_mutual_confirmation.sql`
- Added 3 columns to `market_box_pickups`: `buyer_confirmed_at`, `vendor_confirmed_at`, `confirmation_window_expires_at`
- 30-second mutual confirmation window matching regular orders
- API routes updated: buyer confirm-pickup, vendor pickup update, both list endpoints

### Order Lifecycle Guide (COMMITTED - `8742605`)
- `docs/Order_Lifecycle_Guide.md` — step-by-step buyer and vendor instructions

## Commits This Session
1. `5eaaf42` — 30-second mutual confirmation for market box pickups
2. `8742605` — Order lifecycle guide
3. `1c88c9e` — withErrorTracing on 90 routes
4. `231986e` — Fee Structure documentation
5. `851c115` — Performance indexes
6. `c68a2ea` — Merge duplicate SELECT policies (6 tables)
7. `99baf12` — Merge markets SELECT policies
8. `72e2b89` — Add credentials/temp files to .gitignore
9. `fd8476b` — Update schema snapshot, session context, archive old build docs
10. `edd276d` — Drop remaining old-named policies (6 tables)

## Pending Items
- [ ] Redis rate limiter (deferred — needs infrastructure/provider decision)
- [ ] Admin dashboard testing after RLS policy merges (user hasn't tested yet)
- [ ] A2P 10DLC campaign approval (waiting on Twilio/carrier)
- [ ] Test email notifications on staging
- [ ] Production data seeding (sign up, promote to platform_admin)
- [ ] Stripe branding cleanup
- [ ] Disconnect Wix from Stripe connected platforms

## Key Architecture Notes
- `withErrorTracing` pattern: `src/lib/errors` — wraps route handlers with structured error tracking
- RLS policy merging: zero behavioral change, Postgres OR-combines permissive policies automatically
- `(SELECT auth.uid())` vs `auth.uid()`: wrapped = evaluated once per query; functions with column args (e.g., `is_admin_for_vertical(vertical_id)`) MUST evaluate per row
- `is_platform_admin()` wrapped as `(SELECT is_platform_admin())` since it has no column args
- Fee constants: `src/lib/pricing.ts` (Stripe) + `src/lib/payments/vendor-fees.ts` (external)

## Files Modified This Session
- 90 API route files — withErrorTracing wrapping
- `docs/Fee_Structure.md` — NEW: complete fee breakdown
- `docs/Order_Lifecycle_Guide.md` — NEW: buyer/vendor step-by-step
- `supabase/migrations/20260208_001_market_box_mutual_confirmation.sql` — NEW
- `supabase/migrations/20260209_001_add_performance_indexes.sql` — NEW
- `supabase/migrations/20260209_002_merge_duplicate_select_policies.sql` — NEW
- `supabase/migrations/20260209_003_merge_markets_select_policies.sql` — NEW
- `supabase/migrations/20260209_004_drop_remaining_old_policies.sql` — NEW
- `supabase/SCHEMA_SNAPSHOT.md` — Updated with all changes
- `src/app/api/buyer/market-boxes/[id]/route.ts` — Confirmation columns + term_weeks fix
- `src/app/api/buyer/market-boxes/[id]/confirm-pickup/route.ts` — Mutual confirmation
- `src/app/api/vendor/market-boxes/pickups/[id]/route.ts` — Mutual confirmation
- `src/app/api/vendor/market-boxes/pickups/route.ts` — Confirmation columns in list
- `src/app/[vertical]/buyer/subscriptions/[id]/page.tsx` — Confirmation UI
- `src/app/[vertical]/vendor/market-boxes/[id]/page.tsx` — Confirmation UI
