# Session 43: Comprehensive Systems Audit Report

**Date:** 2026-02-22
**Scope:** Full codebase, database, infrastructure, payment flows, frontend, API routes
**Method:** 6 parallel deep-exploration agents covering all system layers
**Focus:** Food Truck vertical readiness, system health, launch blockers

---

## Executive Summary

The InPersonMarketplace codebase is **well-engineered with strong security fundamentals**. Financial calculations are accurate, Stripe integration is idempotent, and the multi-vertical architecture is sound. However, there are **meaningful gaps between "working" and "launch-ready"** — particularly around server-side enforcement of business rules, operational observability, and vendor transparency for the external payment system.

**Overall Grade: B+**
**Launch-Blocking Issues: 3**
**High-Priority Issues: 11**
**Medium-Priority Improvements: 16**
**Low-Priority Polish: 12**

---

## TIER 0: LAUNCH BLOCKERS (3 items)

These must be resolved before taking real money from food truck vendors.

### LB-1: Vendor Tier Limits Not Enforced Server-Side
- **What:** `vendor-limits.ts` has comprehensive limit-checking functions, but they're only called client-side. API routes for creating listings, activating market boxes, and joining markets do NOT call these functions.
- **Why it matters:** A vendor on the Free tier (3 menu items) could bypass the UI and create unlimited listings via direct API calls. This undermines the entire subscription revenue model.
- **Impact:** Revenue loss + unfair advantage for technically savvy vendors
- **Fix:** Add `canCreateListing()`, `canActivateMarketBox()`, `canJoinMarket()` checks to the corresponding API routes. DB trigger `enforce_listing_tier_limit` exists (migration 036) as a backup, but API-level checks provide better error messages.
- **Effort:** ~2 hours
- **Files:** `/api/vendor/listings`, `/api/vendor/market-boxes`, `/api/vendor/markets`

### LB-2: External Payment Fee Visibility Gap
- **What:** When vendors use external payments (Venmo/CashApp/PayPal/cash), platform fees are silently recorded to `vendor_fee_ledger`. Vendors have no dashboard UI to see their fee balance, understand what they owe, or pay it proactively. Fees are auto-deducted (up to 50%) from the next Stripe payout — a surprise for the vendor.
- **Why it matters:** Vendors will feel blindsided by unexpected deductions. This will generate support tickets and erode trust. Could also cause legal issues (undisclosed fees).
- **Impact:** Vendor trust, support burden, potential legal/compliance risk
- **Fix:** Add vendor fee balance visibility to vendor dashboard + email notifications at $25 and $50 thresholds. The data exists (`vendor_fee_balance`, `vendor_fee_ledger` tables) — it just needs UI.
- **Effort:** ~4 hours (dashboard card + threshold notification)
- **Files:** Vendor dashboard, `/api/vendor/fees` (GET exists, needs UI consumer)

### LB-3: Missing Stripe Webhook Handlers for Refunds/Reversals
- **What:** The webhook handler doesn't process `charge.refunded` or `transfer.reversed` events. If an admin issues a refund via the Stripe Dashboard (not through the app), the app won't know about it — the order stays "paid" and the vendor may still receive a payout for a refunded order.
- **Why it matters:** Financial integrity. Double-paying vendors for refunded orders is direct revenue loss.
- **Impact:** Financial loss, accounting discrepancies
- **Fix:** Add handlers for `charge.refunded` (update order status + notify) and `transfer.reversed` (update payout status + notify vendor).
- **Effort:** ~3 hours
- **Files:** `/lib/stripe/webhooks.ts`, `/api/webhooks/stripe`

---

## TIER 1: HIGH PRIORITY (11 items)

### H-1: ~30% of API Routes Missing Rate Limiting
- **Routes affected:** `/api/user/profile` (PATCH), `/api/notifications/*`, `/api/vendor/analytics/*`, `/api/vendor/favorites`, `/api/vendor/onboarding/*`, most admin GET endpoints
- **Risk:** DoS vulnerability, resource exhaustion
- **Fix:** Apply `rateLimits.api` (60/min) to all read endpoints, `rateLimits.submit` (10/min) to all write endpoints that don't already have limits
- **Effort:** ~2 hours

### H-2: 9 Files Using Raw `<img>` Tags Instead of next/image
- **Files:** checkout/page.tsx, OrderCard.tsx, vendor profile page, ListingImageUpload, MarketBoxImageUpload, market prep page
- **Impact:** ~30-50% higher image bandwidth, no lazy loading, no WebP conversion, poor mobile experience
- **Fix:** Replace with `<Image>` component from `next/image`
- **Effort:** ~2 hours

### H-3: 19 npm Vulnerabilities (14 HIGH, 4 MODERATE)
- **Key issues:** minimatch ReDoS (via ESLint chain), bn.js infinite loop (via web-push), ajv ReDoS, qs DoS
- **Fix:** `npm audit fix` immediately (fixes ajv + qs); evaluate `npm audit fix --force` for ESLint 10 + web-push downgrade
- **Effort:** 30 minutes for safe fixes, ~2 hours to test force fixes

### H-4: Stripe Price ID Typo in .env.local
- **Line 31:** `STRIPE_FT_BOSS_MONTHLY_PRICE_IDprice_1T22fv...` — missing `=` sign
- **Impact:** FT Boss tier monthly subscription checkout will fail
- **Fix:** Add `=` sign
- **Effort:** 1 minute

### H-5: Console.log Statements in 143 Files
- **Risk:** Performance overhead, potential sensitive data in logs, unprofessional in production
- **Fix:** Global find/replace, replace with error tracker where appropriate, remove rest
- **Effort:** ~2 hours (bulk operation + selective review)

### H-6: Notification SMS Logic Skips SMS When Push Is Enabled
- **What:** `service.ts` line 481 — if `push_enabled`, SMS is unconditionally skipped
- **Why wrong:** Push and SMS should be independent channels. A user who enables both wants belt-and-suspenders reliability, especially for urgent notifications like order confirmations.
- **Fix:** Check `preferences.sms_order_updates` independently of push_enabled
- **Effort:** 30 minutes

### H-7: No Security Scanning in CI/CD Pipeline
- **What:** GitHub Actions runs lint, type check, and tests but no `npm audit` or SAST
- **Fix:** Add `npm audit --audit-level=moderate` step
- **Effort:** 15 minutes

### H-8: Dev Environment Out of Sync
- **What:** Dev is missing migrations 038-048. Cannot test events, quality checks, or minimum order features locally.
- **Fix:** Apply pending migrations to Dev Supabase project
- **Effort:** 30 minutes (run migrations in Supabase SQL Editor)

### H-9: Subscription Cancellation Failure Not Escalated
- **What:** If canceling an existing subscription fails when upgrading tiers, the code logs and continues — potentially creating a second active subscription.
- **Impact:** Vendor billed for two subscriptions simultaneously
- **Fix:** Fail the upgrade if cancellation fails, or add admin notification
- **Effort:** 30 minutes

### H-10: No Automated Tier Expiration Cleanup
- **What:** `tier_expires_at` is set but no cron job checks for expired tiers and auto-downgrades. If the Stripe webhook for subscription cancellation fails, the vendor stays "premium" indefinitely.
- **Fix:** Add check in existing cron or create new one: `WHERE tier_expires_at < NOW() AND tier != 'free'`
- **Effort:** ~1 hour

### H-11: Accessibility Gaps — Missing Alt Text & ARIA Labels
- **What:** OrderCard images have no alt text, icon-only buttons lack aria-labels, status badges are color-only without text fallback
- **Impact:** Screen reader users can't navigate the app; potential ADA compliance issues
- **Fix:** Audit and add alt text to all product images, aria-labels to icon buttons
- **Effort:** ~3 hours

---

## TIER 2: MEDIUM PRIORITY (16 items)

### M-1: Hardcoded Timezone Default (`America/Chicago`)
- `listing-availability.ts` line 167 defaults to Chicago timezone. Will break for vendors in other time zones as the platform expands.
- **Fix:** Use market's `timezone` column (already exists in DB), fall back to `America/Chicago` only if null.

### M-2: Hardcoded Vertical Logic Scattered Across Components
- 4+ files have `vertical === 'food_trucks'` checks instead of using config or `term()`. Makes adding new verticals harder.
- **Fix:** Move to vertical config objects or feature flags.

### M-3: Email From Domain Hardcoded to FM
- `RESEND_FROM_EMAIL = 'noreply@mail.farmersmarketing.app'` for all verticals. FT emails come from a farmers market domain.
- **Fix:** Use branding domain from vertical config.

### M-4: Email Template Brand Color Fallback Is Green
- Line 169: fallback `#2d5016` (green/FM) when FT is red (#ff5757). Currently works because FT has explicit branding, but fragile.
- **Fix:** Use `getVerticalColors(vertical).primary` for email templates.

### M-5: Inconsistent Error Response Formats Across API Routes
- Some routes: `{ error: 'message' }`, others: `{ ok: false, error }`, others: `{ success: true }`. Frontend must handle multiple formats.
- **Fix:** Standardize on `{ error?: string, data?: T }` across all routes.

### M-6: Inconsistent HTTP Status Codes for Auth Failures
- Some routes return 401 for both missing credentials AND failed authorization. Should use 401 for "not authenticated" and 403 for "not authorized."

### M-7: Fee Credit Recorded After Stripe Transfer (Risky Order)
- In vendor payout flow: Stripe transfer → fee credit record. If credit recording fails, ledger is incomplete.
- **Fix:** Record fee credit BEFORE transfer (compensating transaction pattern).

### M-8: Market Box RPC Failures Not Escalated
- If `subscribe_to_market_box_if_capacity` RPC fails after payment, buyer paid but has no subscription. Logged but no admin notification.
- **Fix:** Send admin alert on RPC failure after successful payment.

### M-9: External Payment Fee Structure Inconsistency
- External payments charge 6.5% buyer fee + 3.5% seller fee (10% total). Stripe orders charge 6.5% buyer + 6.5% vendor (13% total). The difference is undocumented and may confuse vendors.
- **Fix:** Document the fee difference in vendor onboarding and fee dashboard.

### M-10: No Request IDs in API Responses
- Error responses don't include a correlation ID. When users report errors, support can't trace them without the trace_id from logs.
- **Fix:** Include `traceId` in all error responses.

### M-11: Confirmation Window Too Short (30 seconds)
- Buyer confirms pickup → 30-second window for vendor to fulfill. If vendor misses it, buyer must re-confirm. Frustrating UX, especially at busy markets.
- **Fix:** Extend to 2-3 minutes or add auto-retry.

### M-12: Checkout Page Is 1700+ Lines
- Single file handling regular items, market boxes, external payments, tips, validation. Hard to maintain and test.
- **Fix:** Extract into sub-components (TipSelector, ItemSummary, ExternalPaymentOptions).

### M-13: 4 Test Files for 139 API Routes
- Only financial calculations are tested. No API route tests, no integration tests, no E2E tests.
- **Fix:** Add tests for auth flows, checkout happy path, admin authorization, rate limiting.

### M-14: Inventory Decrement Failure After Order Insert
- If `atomic_decrement_inventory` fails after order is inserted, order exists without reserved inventory. Cron cleanup handles Stripe orders but NOT external orders.
- **Fix:** Add inventory verification step or flag orders where decrement failed.

### M-15: Service Client Not Centrally Guarded
- `createServiceClient()` called in 30+ routes. No wrapper enforces admin verification before creation.
- **Fix:** Create `createVerifiedServiceClient()` that checks admin role first.

### M-16: scan_vendor_activity() Has No Input Validation
- Accepts `p_vertical_id` parameter without validation. If called with NULL, could scan all verticals.
- **Fix:** Add `IF p_vertical_id IS NULL THEN RAISE EXCEPTION` at function start.

---

## TIER 3: LOW PRIORITY / POLISH (12 items)

### L-1: Migration 038 Status Unclear
- `enforce_listing_tier_trigger_status` migration — unclear if applied to all environments. Need to verify.

### L-2: No Offline Support in PWA
- Service worker is push-only. No caching strategy for offline browsing. Acceptable for now but could improve vendor experience at markets with poor connectivity.

### L-3: MFA Optional for Admins
- `REQUIRE_ADMIN_MFA` defaults to false. Should be mandatory before production launch with real admin accounts.

### L-4: No Prettier in Package.json
- `.prettierrc` exists but Prettier isn't installed. Either add it or remove the config.

### L-5: No Web Vitals Monitoring
- No Core Web Vitals tracking (LCP, FID, CLS). Important for SEO and mobile UX.

### L-6: No Build Size Tracking in CI
- Bundle analyzer exists but isn't wired into CI. Can't detect bundle bloat.

### L-7: Cookie SameSite Verification Needed
- Supabase handles auth cookies but should verify `SameSite=Strict` is set.

### L-8: Cache Control Headers Missing from API Routes
- Middleware sets `no-store` for page routes but not API routes. Verify API routes set their own cache headers.

### L-9: JSON-LD Scripts Should Be Documented
- 5 uses of `dangerouslySetInnerHTML` for JSON-LD are safe but should have comments explaining why.

### L-10: Quality Check Errors Log to Console Instead of Error Tracker
- `quality-checks.ts` uses `console.error` instead of the structured `logError()` function.

### L-11: LocalStorage Cart Migration Code Still Running
- `useCart.tsx` line 114 — migration from localStorage cart runs on every mount. If migration is complete, remove the code.

### L-12: CSP Uses `unsafe-inline` for Scripts
- Required by Stripe.js. Consider nonce-based CSP when Next.js support improves.

---

## CROSS-CUTTING THEMES

### Theme 1: "Logged but Not Escalated"
Multiple systems log errors to console or database but don't alert humans:
- Market box RPC failures after payment (M-8)
- Fee recording failures in external payments (LB-2)
- Subscription cancellation failures during upgrade (H-9)
- Quality check errors (L-10)

**Pattern fix:** Create a `escalateToAdmin()` function that sends an admin notification for operational failures that require human intervention.

### Theme 2: Server-Side Enforcement Gaps
Business rules are checked client-side but not enforced at the API layer:
- Tier limits (LB-1)
- Potentially vendor capability checks for external payments

**Pattern fix:** Every business rule that affects revenue or fairness needs API-level enforcement, not just UI guards.

### Theme 3: Financial Edge Case Handling
Core financial calculations are excellent, but edge cases around failure recovery need tightening:
- Fee credit ordering (M-7)
- Refund webhook handling (LB-3)
- Inventory after failure (M-14)

**Pattern fix:** Use compensating transaction pattern — record intent before executing, mark as completed after.

### Theme 4: Operational Readiness
The app works for development and staging testing. For production operations:
- Rate limiting is per-instance only (adequate now, needs Redis later)
- No automated subscription expiration cleanup
- Dev environment is out of sync
- Only 4 test files

---

## RECOMMENDED EXECUTION ORDER

### Phase 1: Launch Safety (Week 1) — ~15 hours
1. LB-1: Server-side tier enforcement (2h)
2. LB-3: Webhook handlers for refunds/reversals (3h)
3. H-4: Fix .env.local typo (1min)
4. H-3: npm audit fix (30min)
5. H-1: Add rate limiting to unprotected routes (2h)
6. H-2: Replace raw `<img>` tags (2h)
7. H-8: Sync Dev environment (30min)
8. H-7: Add npm audit to CI (15min)
9. H-6: Fix SMS notification logic (30min)
10. H-10: Add tier expiration cron check (1h)
11. LB-2: Vendor fee dashboard visibility (4h)

### Phase 2: Quality & Polish (Week 2) — ~12 hours
1. H-5: Remove console.log statements (2h)
2. H-11: Accessibility audit + fixes (3h)
3. M-1: Fix timezone default (1h)
4. M-3 + M-4: Email branding per vertical (1h)
5. M-5 + M-6: Standardize error responses (2h)
6. M-10: Add request IDs to error responses (1h)
7. M-11: Extend confirmation window (30min)
8. H-9: Escalate subscription cancellation failures (30min)

### Phase 3: Hardening (Week 3) — ~10 hours
1. M-7: Fee credit ordering fix (1h)
2. M-8: Market box RPC failure escalation (1h)
3. M-13: Add integration tests for critical paths (4h)
4. M-15: createVerifiedServiceClient wrapper (1h)
5. M-12: Refactor checkout page (3h)

### Phase 4: Continuous Improvement (Ongoing)
- L-1 through L-12 as time permits
- M-2: Reduce hardcoded vertical logic
- M-16: DB function input validation
- Redis rate limiting when traffic demands it

---

## STRENGTHS TO PRESERVE

1. **Financial accuracy** — pricing.ts is a well-tested single source of truth
2. **Idempotency** — Stripe operations use deterministic idempotency keys throughout
3. **Security headers** — CSP, HSTS, X-Frame-Options all properly configured
4. **Error tracking** — withErrorTracing + breadcrumbs across all API routes
5. **Multi-vertical architecture** — clean separation via vertical configs, terminology, design tokens
6. **RLS policies** — comprehensive, recently cleaned up, no overly permissive policies
7. **Webhook design** — proper signature verification, idempotent handlers, correct error codes

---

## METRICS

| Category | Score |
|----------|-------|
| Security | 8.5/10 |
| Financial Integrity | 9/10 |
| Performance | 7/10 |
| Reliability | 7.5/10 |
| Maintainability | 7/10 |
| Test Coverage | 4/10 |
| Operational Readiness | 6/10 |
| Accessibility | 5/10 |
| **Overall** | **7.3/10** |

---

*Report generated by 6 parallel deep-exploration agents across API routes, frontend, core libraries, payment flows, infrastructure, and database layers.*
