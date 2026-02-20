# Current Task: Session 37 — Systems Audit Fixes

Started: 2026-02-19

## Goal
Fix all findings from the comprehensive audit (`session37_comprehensive_audit.md`). Working through tiers in order.

## Status Summary
- **Tier 1 (F1-F9): ALL COMPLETE** — committed `9a07d0c`, pushed to staging + production
- **Tier 2 (U1-U7): ALL COMPLETE** — TSC passes, ready to commit
- **Migration 037**: Applied to all 3 envs. Also fixed 27 missing PKs on Prod.

## Tier 1 Completed (commit 9a07d0c)

| Fix | What was done |
|-----|---------------|
| F1 | Payment race condition — handle `23505` unique constraint violation as no-op in `checkout/success/route.ts` and `stripe/webhooks.ts` |
| F2 | Market box vendor payouts — added per-pickup payout logic to `vendor/market-boxes/pickups/[id]/route.ts` and `buyer/market-boxes/[id]/confirm-pickup/route.ts`. Migration 037 adds `market_box_pickup_id` to `vendor_payouts`. Per-pickup payout = `price_cents - Math.round(price_cents * vendorFeePercent / 100)` (flat fee already deducted at checkout) |
| F3 | Fee auto-deduction normalized — added `getVendorFeeBalance` + `calculateAutoDeductAmount` + `recordFeeCredit` to `buyer/confirm/route.ts` and `vendor/confirm-handoff/route.ts` (both already had it in `fulfill/route.ts`) |
| F4 | Status validation on ready route — only `pending`/`confirmed` items can transition to `ready` |
| F5 | Tip cap at $50 (5000 cents) — `Math.min(Math.max(0, ...), MAX_TIP_CENTS)` in `checkout/session/route.ts` |
| F6 | At-capacity market box auto-refund — `createRefund()` in 3 paths: `checkout/success`, webhook `handleCheckoutComplete`, webhook `handleMarketBoxCheckoutComplete` |
| F7 | Cancellation fee vendor share — added `transferToVendor()` after successful refund in `buyer/orders/[id]/cancel/route.ts`. Added `stripe_account_id, stripe_payouts_enabled` to vendor_profiles select. |
| F8 | `pending_stripe_setup` retry — expanded cron Phase 5 to query + retry these payouts when vendor's Stripe is now ready. On failure, moves to `failed` status for regular retry. |
| F9 | Admin email alert — Resend email to `ADMIN_ALERT_EMAIL` when payouts permanently cancelled after 7 days |

## Tier 2 Completed (U1-U7)

| Fix | What was done |
|-----|---------------|
| U1 | Added Gate 4 (Stripe Connect) to OnboardingChecklist: `gate4` in interface, 4th entry in `gates` array, status derived from `stripeConnected`/`stripePayoutsEnabled` |
| U2 | Added `Gate4Content` component with 3 states: not connected (setup CTA), connected but incomplete (complete setup link), fully enabled (success message). Links to `/${vertical}/vendor/dashboard/stripe` |
| U3 | Fixed dead link on stripe page: `/${vertical}/vendor/dashboard/orders` → `/${vertical}/vendor/orders` |
| U4 | Added `preferred_pickup_time` to vendor orders API response (`display.preferred_pickup_time`), vendor pickup page (shows "Pickup time: X:XX AM/PM"), and prep page order items. Also added to prep API select + response. |
| U5 | Added ZIP proximity filtering to browse page: queries `zip_codes` for coordinates, filters listings by Haversine distance (40km/25mi radius). Added ZIP input to SearchFilter with go button + clear all. |
| U6 | Fixed tier labels on dashboard: replaced hardcoded premium/featured/standard with lookup object supporting all tiers (boss/pro/premium/featured/basic/standard). Color accent for non-standard/basic tiers. |
| U7 | Enabled allergen declarations for food trucks: changed `vertical === 'farmers_market'` gate to `(vertical === 'farmers_market' \|\| vertical === 'food_trucks')` in both places (section + description hint). |

### Files modified in Tier 2:
- `src/components/vendor/OnboardingChecklist.tsx` — U1, U2
- `src/app/[vertical]/vendor/dashboard/stripe/page.tsx` — U3
- `src/app/api/vendor/orders/route.ts` — U4 (added `preferred_pickup_time` to select + response)
- `src/app/[vertical]/vendor/pickup/page.tsx` — U4 (interface + UI)
- `src/app/api/vendor/markets/[id]/prep/route.ts` — U4 (added to select + response)
- `src/app/[vertical]/vendor/markets/[id]/prep/page.tsx` — U4 (interface + UI)
- `src/app/[vertical]/browse/page.tsx` — U5 (geo-filter + lat/lng in market select)
- `src/app/[vertical]/browse/SearchFilter.tsx` — U5 (ZIP input UI)
- `src/app/[vertical]/vendor/dashboard/page.tsx` — U6 (tier labels)
- `src/app/[vertical]/vendor/listings/ListingForm.tsx` — U7 (allergen gate)

## Remaining Tiers (not started)
- **Tier 3 (T1-T14)**: Terminology leakage — hardcoded FM language in FT context
- **Tier 4 (S1-S6)**: Security & data integrity
- **Tier 5 (I1-I8)**: Infrastructure & scalability
- **Tier 6 (P1-P19)**: UX polish & optimization

## Key Decisions Made
- Tip cap: $50 (5000 cents) per user instruction
- Per-pickup market box payout excludes flat fee (already deducted at subscription checkout)
- vendor_payouts.order_item_id made nullable for market box support (migration 037)
- 27 missing PKs fixed on Prod (initial schema migration was incomplete)

## Files Modified in Tier 1 (commit 9a07d0c)
- `apps/web/src/app/api/buyer/market-boxes/[id]/confirm-pickup/route.ts`
- `apps/web/src/app/api/buyer/orders/[id]/cancel/route.ts`
- `apps/web/src/app/api/buyer/orders/[id]/confirm/route.ts`
- `apps/web/src/app/api/checkout/session/route.ts`
- `apps/web/src/app/api/checkout/success/route.ts`
- `apps/web/src/app/api/cron/expire-orders/route.ts`
- `apps/web/src/app/api/vendor/market-boxes/pickups/[id]/route.ts`
- `apps/web/src/app/api/vendor/orders/[id]/confirm-handoff/route.ts`
- `apps/web/src/app/api/vendor/orders/[id]/ready/route.ts`
- `apps/web/src/lib/stripe/webhooks.ts`
- `supabase/migrations/applied/20260219_037_market_box_payout_support.sql`

## Schema Snapshot
- Migration 037 changelog entry added ✅
- vendor_payouts columns updated (order_item_id nullable, market_box_pickup_id added) ✅
- FK references updated ✅
- Index updated ✅
- Full structured table regeneration NOT done (user should run REFRESH_SCHEMA.sql when convenient)

## Gotchas / Watch Out For
- Prod had 27 tables missing PKs — all fixed now
- `vendor_payouts` inserts in existing code use authenticated client (not service client) — may silently fail due to missing INSERT RLS policy. Works for now but worth investigating.
- `mbItem.priceCents` in checkout metadata may be base price or fee-inclusive — used as-is for F6 refund amount
- Audit report is at `apps/web/.claude/session37_comprehensive_audit.md` — master reference for all findings
