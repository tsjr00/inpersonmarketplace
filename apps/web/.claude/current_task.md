# Current Task: Market Box / Chef Box Payout Implementation
Started: 2026-02-28

## Goal
Fix market box (FM) / chef box (FT) vendor payout flow. Buyers prepay for full term (4 or 8 weeks). Vendor should get paid the full amount when buyer prepays — NOT per-pickup.

## Status: IMPLEMENTATION COMPLETE — Awaiting migration apply + commit

## What Was Changed

### Market Box Payout Fix — COMPLETE, READY TO COMMIT
**Problem**: F2 FIX paid vendors per-pickup (each time a pickup was confirmed). Business rule: vendor gets full prepaid amount at checkout time.

**Files changed (8)**:
1. `supabase/migrations/20260228_059_market_box_subscription_payout.sql` — **New**. Adds `market_box_subscription_id` UUID column + FK + unique partial index + performance index to `vendor_payouts`
2. `src/lib/stripe/payments.ts` — **Edit**. Added `transferMarketBoxPayout()` function + `basePriceCents` param to `createMarketBoxCheckoutSession()` + `base_price_cents` in Stripe metadata
3. `src/lib/stripe/webhooks.ts` — **Edit**. Added `processMarketBoxVendorPayout()` helper called from `handleMarketBoxCheckoutComplete()`. Updated `handleTransferCreated`/`handleTransferFailed` to handle `market_box_subscription_id` metadata. Added `calculateVendorPayout` + `transferMarketBoxPayout` imports.
4. `src/app/api/checkout/success/route.ts` — **Edit**. Added `processMarketBoxPayout()` helper called after unified checkout market box RPC success. Idempotent.
5. `src/app/api/buyer/market-boxes/route.ts` — **Edit**. Passes `basePriceCents: priceCents` to `createMarketBoxCheckoutSession()`
6. `src/app/api/vendor/market-boxes/pickups/[id]/route.ts` — **Edit**. Removed F2 FIX per-pickup payout block (lines 278-326). Removed unused imports (`FEES`, `transferToVendor`, `createServiceClient`).
7. `src/app/api/buyer/market-boxes/[id]/confirm-pickup/route.ts` — **Edit**. Removed F2 FIX per-pickup payout block (lines 135-179). Removed unused imports.
8. `src/app/api/cron/expire-orders/route.ts` — **Edit**. Added market box subscription payout retry to Phase 5 (failed + pending_stripe_setup).

**TypeScript**: 0 errors

### Earlier This Session (Pre-Compaction)
- Resend Webhooks + Support Page — ALL COMPLETE, PUSHED TO PROD + STAGING
- Resend Config — COMPLETE
- noreply→updates Email Fix — COMMITTED + PUSHED
- About/Terms Pages Moved Under [vertical] — COMMITTED + PUSHED
- CI ESLint Fixes — COMMITTED + PUSHED
- Favicon fix, PWA manifest fix, Vendor leads admin email

## Git State
- Main and staging fully synced at `1286784`
- Market box payout changes are LOCAL ONLY (not committed yet)
- Migration 059 needs to be applied to all 3 environments

## What's Next
1. Commit the market box payout changes
2. Apply migration 059 to Dev, Staging, and Prod
3. Update SCHEMA_SNAPSHOT.md with new column + index
4. Push to staging for testing

## Open Items (Carried Over)
- Instagram URLs still placeholder `#` in Coming Soon footers
- Business rules audit questions pending user review
- Events Phase 5 (reminders + conversion) — deferred
- Dev DB may be out of sync on some migrations
- Migrations 057+058 schema snapshot update needed
