# Current Task: Market Box / Chef Box Payout Implementation
Started: 2026-02-28

## Goal
Fix market box (FM) / chef box (FT) vendor payout flow. Buyers prepay for full term (4 or 8 weeks). Vendor should get paid the full amount when buyer prepays — NOT per-pickup.

## Status: COMPLETE — Migration applied, schema snapshot updated, needs final commit

## What Was Done

### Market Box Payout Fix — COMMITTED (`433275f`), PUSHED TO STAGING
**Problem**: F2 FIX paid vendors per-pickup (each time a pickup was confirmed). Business rule: vendor gets full prepaid amount at checkout time.

**Code changes committed in `433275f` (9 files)**:
1. `supabase/migrations/20260228_059_market_box_subscription_payout.sql` — **New**. Adds `market_box_subscription_id` UUID column + FK + unique partial index + performance index to `vendor_payouts`
2. `src/lib/stripe/payments.ts` — Added `transferMarketBoxPayout()` function + `basePriceCents` param to `createMarketBoxCheckoutSession()` + `base_price_cents` in Stripe metadata
3. `src/lib/stripe/webhooks.ts` — Added `processMarketBoxVendorPayout()` helper called from `handleMarketBoxCheckoutComplete()`. Updated `handleTransferCreated`/`handleTransferFailed` for `market_box_subscription_id` metadata.
4. `src/app/api/checkout/success/route.ts` — Added `processMarketBoxPayout()` helper for unified checkout path (idempotent)
5. `src/app/api/buyer/market-boxes/route.ts` — Passes `basePriceCents` to Stripe session
6. `src/app/api/vendor/market-boxes/pickups/[id]/route.ts` — **Removed** F2 FIX per-pickup payout block + unused imports
7. `src/app/api/buyer/market-boxes/[id]/confirm-pickup/route.ts` — **Removed** F2 FIX per-pickup payout block + unused imports
8. `src/app/api/cron/expire-orders/route.ts` — Added market box subscription payout retry to Phase 5
9. `apps/web/.claude/current_task.md` — Context tracking

### Post-Commit Steps (IN PROGRESS when compaction hit)
- Migration 059 applied to ALL 3 environments (Dev, Staging, Prod) ✅
- SCHEMA_SNAPSHOT.md updated (changelog + columns + FKs + indexes) ✅
- Migration file moved to `applied/` folder ✅
- MIGRATION_LOG.md — NEEDS migration 059 entry added (was searching for last entry when interrupted)
- **NEED TO COMMIT**: schema snapshot update + migration move + log update
- **NEED TO PUSH**: this commit to staging (and possibly main if user approves)

## Git State
- Commit `433275f` on main, pushed to origin/staging
- Main is 1 ahead of origin/main (commit `433275f` not pushed to prod yet)
- Schema snapshot + migration move are UNSTAGED local changes

## Earlier This Session (Pre-Compaction)
- Resend Webhooks + Support Page — ALL COMPLETE, PUSHED TO PROD + STAGING
- Resend Config — COMPLETE
- noreply→updates Email Fix — COMMITTED + PUSHED
- About/Terms Pages Moved Under [vertical] — COMMITTED + PUSHED
- CI ESLint Fixes — COMMITTED + PUSHED
- Favicon fix, PWA manifest fix, Vendor leads admin email

## Open Items (Carried Over)
- Instagram URLs still placeholder `#` in Coming Soon footers
- Business rules audit questions pending user review
- Events Phase 5 (reminders + conversion) — deferred
- Dev DB may be out of sync on some migrations
- Migrations 057+058 schema snapshot update still needed
