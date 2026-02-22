# Current Task: Session 43 — Comprehensive Audit Execution (33 Items)

Started: 2026-02-22

## Goal
Execute 33 approved audit fixes from the comprehensive systems audit in 6 batches.

## Audit Report Location
`apps/web/.claude/session43_comprehensive_audit.md` — full detailed report

## Status: ALL 6 BATCHES COMPLETE ✅

**94 tests passing, 0 type errors, lint clean.**

---

## BATCH 1: COMPLETE (All 6 items done, type-checked)

| Item | Status | What was done |
|------|--------|---------------|
| H-7 | ✅ | Added `npm audit --audit-level=moderate` step to `.github/workflows/ci.yml` |
| L-4 | ✅ | Deleted orphaned `.prettierrc` file |
| L-11 | ✅ | Removed localStorage cart migration useEffect from `src/lib/hooks/useCart.tsx` |
| L-9 | ✅ | Added safety comments to all 5 `dangerouslySetInnerHTML` usages |
| L-10 | ✅ | Replaced 5 `console.error` in `src/lib/quality-checks.ts` with `TracedError` + `logError()` |
| LB-2 | ✅ | Renamed "Payment Methods" to "Payments" in `PaymentMethodsCard.tsx` |

---

## BATCH 2: COMPLETE (All 8 items done, type-checked)

| Item | Status | What was done |
|------|--------|---------------|
| LB-1 | ✅ (no change) | Already enforced: market-boxes has API checks, markets has API checks, listings has DB trigger |
| LB-3 | ✅ | Added `charge.refunded` handler to webhooks.ts + enhanced `handleTransferFailed` with vendor notification + added `order_refunded` notification type to types.ts |
| H-6 | ✅ | Fixed SMS sending to check `sms_order_updates` independently of `push_enabled` in service.ts |
| H-9 | ✅ | Subscription upgrade returns error if cancel fails (with fallback for already-canceled) in checkout/route.ts |
| H-10 | ✅ | Added Phase 8 to expire-orders cron: downgrades expired vendor tiers (FT→free, FM→standard) + buyer tiers |
| M-7 | ✅ | Moved recordFeeCredit before payout insert, wrapped in try/catch in fulfill/route.ts |
| M-8 | ✅ | Added `logError(TracedError)` escalation in checkout/success + webhooks when market box RPC fails |
| M-16 | ✅ | Created migration 049: adds vertical_id validation to `scan_vendor_activity()` function |

---

## BATCH 3: COMPLETE (5 items, type-checked)

| Item | Status | What was done |
|------|--------|---------------|
| H-1 | ✅ | Only 1 route needed rate limiting: `vendor/quality-findings/route.ts` (GET + PATCH). All other ~133 routes already had it. |
| M-5 | ✅ (already done) | Routes already use `{ error: string }` pattern consistently. `withErrorTracing` standardizes thrown errors. |
| M-6 | ✅ (already done) | 87 files use 401 (auth), 48 files use 403 (permissions) — already correct split. |
| M-10 | ✅ (already done) | `TracedError.toResponse()` already includes `traceId` in every error response through `withErrorTracing`. |
| M-15 | ✅ | Added `createVerifiedServiceClient()` to `src/lib/supabase/server.ts` — verifies admin role before returning service client. |

---

## BATCH 4: COMPLETE (6 items, type-checked)

| Item | Status | What was done |
|------|--------|---------------|
| H-2 | ✅ | Replaced 8 raw `<img>` with `next/image` in 6 files: checkout, OrderCard, MarketVendorsList, market-boxes, prep page (2), vendor profile (2). Kept 4 as `<img>` (MFA QR + 3 upload previews use blob/data URLs). |
| H-5 | ✅ | Removed/replaced 12 unnecessary `console.log` calls across 10 files. Kept dev-guarded `[DEV]` logs, error system logs, and cron operational logs. |
| M-2 | ✅ (deferred) | 76 occurrences across 48 files — major architectural refactor to move feature toggles into vertical config. Works correctly today. Needs dedicated session. |
| M-3 | ✅ (infra task) | Code already uses vertical branding for display name. FROM domain requires Resend DNS verification for foodtruckn.app — infrastructure task, not code. |
| M-4 | ✅ | Fixed default brandColor in `formatEmailHtml()` from `#166534` to `#2d5016` (matches farmers_market primary). |
| M-1 | ✅ (already done) | `listing-availability.ts` line 167 already uses `market.timezone || 'America/Chicago'`. |

---

## BATCH 5: COMPLETE (6 items, type-checked)

| Item | Status | What was done |
|------|--------|---------------|
| H-3 | ✅ | Ran `npm audit fix`. Remaining 17 vulns are all eslint dev dependencies — not production risk. |
| M-9 | ✅ | Updated terms page section 4.2 with specific fee percentages (6.5% buyer, 6.5% vendor Stripe, 3.5% vendor external, $0.15 service fee). |
| L-5 | ✅ | Created `WebVitals` component with `useReportWebVitals`, added to `layout.tsx`. |
| L-6 | ✅ | Added build + build size report steps to CI workflow (`.github/workflows/ci.yml`). |
| L-7 | ✅ (already done) | Middleware already sets `Cache-Control: no-store` for sensitive paths. Supabase handles SameSite on its own cookies. |
| L-8 | ✅ (already done) | Middleware already has smart cache control: `no-store` for sensitive paths, Next.js handles static asset caching automatically. |

---

## BATCH 6: COMPLETE (1 item — integration tests)

| Item | Status | What was done |
|------|--------|---------------|
| M-13 | ✅ | Created 3 test files (24 tests): `rate-limit.test.ts` (6 tests), `errors.test.ts` (11 tests), `notification-types.test.ts` (7 tests). All 94 tests pass. |

---

## Files Modified (Complete List)

### Batch 1
- `.github/workflows/ci.yml` — added npm audit step
- `.prettierrc` — DELETED
- `src/lib/hooks/useCart.tsx` — removed localStorage migration useEffect
- `src/lib/quality-checks.ts` — console.error → TracedError + logError
- `src/app/[vertical]/vendor/dashboard/PaymentMethodsCard.tsx` — renamed card title
- 5 files — added safety comments to dangerouslySetInnerHTML

### Batch 2
- `src/lib/notifications/service.ts` — SMS channel independent of push_enabled + fixed default brandColor
- `src/lib/notifications/types.ts` — added `order_refunded` notification type
- `src/app/api/subscriptions/checkout/route.ts` — fail on cancel error
- `src/lib/stripe/webhooks.ts` — charge.refunded handler + transfer.reversed notification + M-8 logError
- `src/app/api/cron/expire-orders/route.ts` — Phase 8 tier expiration
- `src/app/api/vendor/orders/[id]/fulfill/route.ts` — fee credit before payout, try/catch
- `src/app/api/checkout/success/route.ts` — M-8 logError + TracedError import
- `supabase/migrations/20260222_049_scan_vendor_activity_validation.sql` — NEW

### Batch 3
- `src/app/api/vendor/quality-findings/route.ts` — added rate limiting (GET + PATCH)
- `src/lib/supabase/server.ts` — added `createVerifiedServiceClient()`

### Batch 4
- `src/app/[vertical]/checkout/page.tsx` — img → Image + import + position:relative
- `src/components/vendor/OrderCard.tsx` — img → Image + import + position:relative
- `src/app/[vertical]/markets/[id]/MarketVendorsList.tsx` — img → Image + import + position:relative
- `src/app/[vertical]/vendor/market-boxes/page.tsx` — img → Image + import
- `src/app/[vertical]/vendor/markets/[id]/prep/page.tsx` — 2× img → Image + import
- `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` — 2× img → Image + import
- `src/hooks/useLocationAreaName.ts` — removed 3 console.log
- `src/app/api/buyer/feedback/route.ts` — removed console.log
- `src/app/api/vendor/feedback/route.ts` — removed console.log
- `src/app/api/buyer/location/geocode/route.ts` — console.log → console.warn (2×)
- `src/app/api/vendor/tier/downgrade/route.ts` — removed console.log
- `src/app/api/buyer/tier/downgrade/route.ts` — removed console.log
- `src/app/api/vendor/markets/[id]/route.ts` — removed console.log
- `src/app/api/vendor/markets/route.ts` — removed console.log
- `src/app/api/vendors/nearby/route.ts` — console.log → console.warn
- `src/app/admin/errors/page.tsx` — removed console.log
- `src/app/test-components/page.tsx` — removed console.log

### Batch 5
- `src/app/terms/page.tsx` — updated section 4.2 with specific fee percentages
- `src/components/layout/WebVitals.tsx` — NEW: Web Vitals monitoring component
- `src/app/layout.tsx` — added WebVitals component
- `.github/workflows/ci.yml` — added build + build size report steps

### Batch 6
- `src/lib/__tests__/rate-limit.test.ts` — NEW: 6 tests (checkRateLimit, presets, response format)
- `src/lib/__tests__/errors.test.ts` — NEW: 11 tests (TracedError, getHttpStatus)
- `src/lib/__tests__/notification-types.test.ts` — NEW: 7 tests (registry, urgency channels, config lookup)

---

## Important Decisions
- LB-1 is ALREADY ENFORCED — no additional code changes needed
- M-7 fee credit: wrapped in try/catch, moved before payout insert
- M-16: Validates vertical_id exists when non-NULL; NULL still means "scan all"
- M-2 deferred: 76 occurrences across 48 files — needs dedicated session
- M-3 is infra task: code supports per-vertical branding, DNS verification needed
- M-5/M-6/M-10: All already implemented in the existing error system
- M-1: Already implemented in listing-availability.ts
- L-7/L-8: Already implemented in middleware.ts
- H-2: Kept 4 `<img>` tags (MFA QR code + 3 upload previews with blob/data URLs)

## Pending Migration
- `supabase/migrations/20260222_049_scan_vendor_activity_validation.sql` — needs to be applied to Dev + Staging

## What's Next
- Commit all changes
- Push to staging for testing
- Apply migration 049 to Dev + Staging
