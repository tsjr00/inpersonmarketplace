# Comprehensive Systems Audit — Session 35
Date: 2026-02-19

## Executive Summary

Codebase is architecturally sound for a solo-developer project at this stage. The multi-vertical system, notification orchestration, and Stripe integration are well-engineered. However, there are several issues that would cause real problems in production with paying customers, particularly around the Food Truck vertical which is shipping first. Findings organized into 5 tiers.

---

## CRITICAL — Fix Before Launch

### C1. Fee Constants Duplicated Between Two Files
- **Files:** `src/lib/pricing.ts` (source of truth) vs `src/lib/stripe/config.ts` (independent copy)
- **Risk:** If fees change in one file and not the other, buyers/vendors get charged different amounts than displayed.
- **Resolution:** `stripe/config.ts` should import from `pricing.ts` instead of defining its own constants.
- **Status:** [x] FIXED — `STRIPE_CONFIG` now imports from `FEES` in pricing.ts

### C2. FT Subscription Cancellation Downgrades to `'basic'` Instead of `'free'`
- **File:** `src/lib/stripe/webhooks.ts` → `handleSubscriptionDeleted()`
- **Risk:** Vendor who cancels subscription keeps Basic-tier privileges ($10/mo tier) indefinitely for free.
- **Resolution:** Change downgrade target to `'free'` for food_trucks vertical.
- **Status:** [x] FIXED — downgrades to 'free' instead of 'basic'

### C3. `canCreateListing()` Doesn't Pass Vertical Parameter
- **File:** `src/lib/vendor-limits.ts` → `canCreateListing()`
- **Risk:** FT vendors get evaluated against FM tier limits (more generous), allowing them to exceed their actual FT tier cap.
- **Resolution:** Add `vertical` parameter to `canCreateListing()` and propagate from callers.
- **Status:** [x] FIXED — `canCreateListing()`, `getTierLimits()`, `getListingLimit()` all accept vertical; new listing page passes it

### C4. Notification Action URLs Use Wrong Slug Format
- **File:** `src/lib/notifications/types.ts`
- **Risk:** Fallback URL path uses `'farmers-market'` (hyphen) instead of `'farmers_market'` (underscore). Broken links in push notifications when vertical param is missing.
- **Resolution:** Fix to underscore format matching the route parameter convention.
- **Status:** [x] FIXED — all 19 occurrences changed to 'farmers_market'

### C5. `shouldShowErrorCodes()` Always Returns True
- **File:** `src/lib/errors/with-error-tracing.ts`
- **Risk:** Internal error codes (like `ERR_RLS_001`) exposed to end users in production API responses. Leaks implementation details.
- **Resolution:** Gate on `NODE_ENV === 'development'` or a debug flag.
- **Status:** [x] REVISED — error codes always shown (help users report), only pgDetail hidden in production

---

## HIGH — Fix Before or Shortly After Launch

### H1. In-Memory Rate Limiting Is Per-Instance Only
- **File:** `src/lib/rate-limit.ts`
- **Risk:** Vercel spins up multiple serverless instances, each with its own Map. Attacker hitting different instances bypasses all limits.
- **Resolution (budget-friendly):** Accept for launch but add Supabase-based rate limiting for most sensitive endpoints (auth, checkout, account deletion). Or use Vercel's built-in edge rate limiting if on plan.
- **Status:** [ ] Not started

### H2. Hardcoded Email Branding — FM Green in All Verticals
- **File:** `src/lib/notifications/service.ts` line 214
- **Risk:** FT vendors and buyers receive green-branded emails instead of red. `#166534` hardcoded in email HTML header.
- **Resolution:** Pass brand color from `defaultBranding[vertical].colors.primary` into the email template.
- **Status:** [ ] Not started

### H3. Email Sender Always `noreply@mail.farmersmarketing.app`
- **File:** `src/lib/notifications/service.ts`
- **Risk:** All verticals send from FM domain. FT customers see "Farmers Marketing" in their inbox.
- **Resolution:** Use vertical-specific sender name. Adding a new sender domain (`mail.foodtruckn.app`) requires Resend DNS verification, so for launch could just change display name while keeping same sending domain.
- **Status:** [ ] Not started

### H4. `isAdminCheck()` Inconsistent with `requireAdmin()`
- **File:** `src/lib/auth/admin.ts`
- **Risk:** `isAdminCheck()` doesn't check for `'platform_admin'` role, but `requireAdmin()` does. API routes using `isAdminCheck()` could incorrectly deny admin access.
- **Resolution:** Align both functions to check the same role values.
- **Status:** [ ] Not started

### H5. Domain Inconsistencies in Branding
- **Files:** `src/lib/branding/defaults.ts` uses `farmersmarket.app` (no "ing"); `src/lib/domain/config.ts` uses `farmersmarketing.app`
- **Also:** `foodtruckn.app` missing from `branding/server.ts` domain fallback map
- **Resolution:** Audit all domain references. Correct to `farmersmarketing.app` and add `foodtruckn.app` to server-side domain map.
- **Status:** [ ] Not started

### H6. Admin Sidebar Hardcodes `/farmers_market/admin`
- **File:** `src/app/admin/layout.tsx`
- **Risk:** FT admins navigating admin pages get routed through FM vertical path.
- **Resolution:** Use current vertical from route params or a vertical selector.
- **Status:** [ ] Not started

### H7. Hardcoded Prices in Dashboard
- **File:** `src/app/[vertical]/dashboard/page.tsx` lines 871-872
- **Risk:** Shows "$10/month" and "$24.99/month" — FM prices, not FT tier prices.
- **Resolution:** Pull from tier config or pricing constants per vertical.
- **Status:** [ ] Not started

### H8. Stale Logo Reference for Food Truck'n
- **File:** `src/lib/domain/config.ts`
- **Risk:** `foodtruckn.app` entry maps to `/logos/street-eats-logo.svg` — stale name from before rename.
- **Resolution:** Update to current `food-truckn-logo.png` path.
- **Status:** [ ] Not started

### H9. Admin Alert Email Hardcoded
- **File:** `src/lib/errors/logger.ts` line 88
- **Risk:** `alerts@farmersmarketing.app` hardcoded for admin alert emails regardless of vertical.
- **Resolution:** Use generic platform email or derive from vertical context.
- **Status:** [ ] Not started

### H10. Logger Doesn't Alert on Critical Severity
- **File:** `src/lib/errors/logger.ts`
- **Risk:** Only `severity === 'high'` triggers admin email alerts. `'critical'` severity does not.
- **Resolution:** Add `'critical'` to the alert trigger condition.
- **Status:** [x] FIXED — logger.ts now alerts on both 'high' and 'critical'

### H11. Conflicting `UserRole` Type Exports
- **Files:** `src/lib/auth/roles.ts` vs `src/lib/auth/admin.ts`
- **Risk:** Both export `UserRole` with different values. `roles.ts` omits `'platform_admin'`.
- **Resolution:** Single canonical `UserRole` type, imported by both files.
- **Status:** [ ] Not started

---

## MEDIUM — Should Fix, Not Blocking Launch

### M1. 4 API Routes Missing Rate Limiting
- `api/admin/knowledge` (GET/POST/PATCH/DELETE)
- `api/market-boxes` (GET)
- `api/marketing/activity-feed` (GET)
- `api/vendor/onboarding/acknowledge-prohibited-items` (POST)
- **Resolution:** Add appropriate rate limit presets.
- **Status:** [ ] Not started

### M2. `marketing/activity-feed` Missing `withErrorTracing`
- **Resolution:** Wrap in `withErrorTracing()`.
- **Status:** [ ] Not started

### M3. N+1 Query in `getTraditionalMarketUsage()`
- **File:** `src/lib/vendor-limits.ts`
- **Risk:** Per-listing DB call to check market type. 20 listings = 20 queries.
- **Resolution:** Batch into single query with `IN` clause or join.
- **Status:** [ ] Not started

### M4. Hardcoded `America/Chicago` Timezone Fallback
- **File:** `src/lib/utils/listing-availability.ts` line 155
- **Risk:** Wrong date calculations if vendor is in different timezone.
- **Resolution:** Fine for single-market FT launch, needs attention before expanding.
- **Status:** [ ] Not started

### M5. `retry-failed-payouts` Cron Not in `vercel.json`
- **Risk:** Endpoint exists but has no cron trigger. Duplicated as Phase 5 of `expire-orders`, so payouts do get retried — standalone endpoint is dead code.
- **Resolution:** Either add to `vercel.json` or remove standalone route.
- **Status:** [ ] Not started

### M6. Stale Logo in `how-it-works` Page
- **File:** `src/app/[vertical]/how-it-works/page.tsx` line 26
- **Risk:** Hardcoded FM logo `src="/logos/logo-icon-color.png"` shows on all verticals.
- **Resolution:** Use `branding.logo_path` from `defaultBranding[vertical]`.
- **Status:** [ ] Not started

### M7. Test Components Page Accessible Without Auth
- **File:** `src/app/test-components/page.tsx`
- **Resolution:** Add auth check or remove before production.
- **Status:** [ ] Not started

### M8. Root Metadata Says "FastWrks Marketplace"
- **File:** `src/app/layout.tsx` line 17
- **Resolution:** Update to current brand or make dynamic per vertical.
- **Status:** [ ] Not started

### M9. Two Duplicate Footer Components
- **Files:** `src/components/shared/Footer.tsx` and `src/components/landing/Footer.tsx`
- **Resolution:** Remove the unused one.
- **Status:** [ ] Not started

### M10. Upgrade Message Hardcodes FM Premium Listing Count
- **File:** `src/lib/vendor-limits.ts` line ~450
- **Risk:** Tier limit upgrade prompts show "15 listings" (FM premium) regardless of vertical.
- **Resolution:** Pull from active vertical's tier config.
- **Status:** [ ] Not started

### M11. `branding/server.ts` Missing `foodtruckn.app` in Domain Fallback
- **File:** `src/lib/branding/server.ts` → `getBrandingByDomainFallback()`
- **Risk:** If DB unavailable, food truck domain falls through to null — breaks domain-based routing for FT.
- **Resolution:** Add `foodtruckn.app` to the fallback domain map.
- **Status:** [ ] Not started

### M12. Design Tokens Module Header Says "FASTWRKS"
- **File:** `src/lib/design-tokens.ts`
- **Resolution:** Update module header comment.
- **Status:** [ ] Not started

### M13. `QUANTITY_UNITS` Defined Inline in ListingForm
- **File:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`
- **Risk:** Duplicate of what should be a shared constant.
- **Resolution:** Extract to `constants.ts` and import.
- **Status:** [ ] Not started

### M14. Vendor Dashboard Upgrade Page Hardcodes FT Tier Prices
- **File:** `src/app/[vertical]/vendor/dashboard/upgrade/page.tsx`
- **Risk:** `basic=10, pro=30, boss=50` hardcoded in component instead of imported from pricing config.
- **Resolution:** Import from `SUBSCRIPTION_PRICES` or `FT_TIER_LIMITS`.
- **Status:** [ ] Not started

### M15. `admin/vendors/reject` Uses Different Pattern Than `approve`
- **Files:** `src/app/api/admin/vendors/[id]/reject/route.ts` vs `approve/route.ts`
- **Risk:** `reject` uses regular client (RLS), `approve` uses service client. `reject` uses manual notification insert, not `sendNotification()`. No email on rejection.
- **Resolution:** Align patterns — use service client and `sendNotification()` for consistency.
- **Status:** [ ] Not started

---

## LOW — Nice to Have / Cleanup

### L1. Hardcoded Hex Colors Outside Design Token System
- Various components still use hardcoded hex values instead of CSS variable tokens.
- **Status:** [ ] Not started

### L2. Admin Order Issues Filters Post-Query in JS
- `api/admin/order-issues` fetches all then filters by vertical in JavaScript.
- **Status:** [ ] Not started

### L3. Help Page Doesn't Use Design Tokens
- `src/app/[vertical]/help/page.tsx` — raw pixel values and hex colors.
- **Status:** [ ] Not started

### L4. Missing `deletion` Rate Limit Preset
- CLAUDE.md specifies 3/hour for account deletion, but no preset exists.
- **Status:** [ ] Not started

### L5. `payout_status` Enum Missing Values
- `skipped_dev` and `pending_stripe_setup` used in code but not in DB enum.
- **Status:** [ ] Not started

### L6. Cross-Sell Suggestions Show Emoji Placeholder
- **File:** `src/app/[vertical]/checkout/page.tsx` lines 1079-1090
- Suggested products always show `📦` emoji — no real product image.
- **Status:** [ ] Not started

### L7. Browse Page Hardcoded Badge Colors
- **File:** `src/app/[vertical]/browse/page.tsx` lines ~1141-1150
- `'#fef3c7'`, `'#92400e'` hardcoded for box type labels.
- **Status:** [ ] Not started

### L8. Vendor Pickup Page Inconsistent Token Usage
- `src/app/[vertical]/vendor/pickup/page.tsx` — uses only `colors`, raw values for everything else.
- **Status:** [ ] Not started

### L9. `areFtPricesConfigured()` Separate from `areSubscriptionPricesConfigured()`
- **File:** `src/lib/stripe/config.ts`
- Callers must know which check to call. Could be unified.
- **Status:** [ ] Not started

### L10. Texas-Specific Regulatory Requirements Hardcoded
- **File:** `src/lib/onboarding/category-requirements.ts`
- No TODO noting need for parameterization when expanding states.
- **Status:** [ ] Not started

### L11. `admin/analytics/trends` In-Memory Grouping
- Fetches all transactions then groups in JS. May be slow at scale vs RPC approach.
- **Status:** [ ] Not started

### L12. `sendNotificationBatch()` N×2 Sequential Profile Fetches
- **File:** `src/lib/notifications/service.ts`
- No batching of user preference lookups.
- **Status:** [ ] Not started

---

## STRATEGIC OBSERVATIONS

### What's Working Well
- Notification system is well-architected (4 channels, urgency routing, never-throw pattern)
- Stripe integration has proper idempotency keys, webhook signature verification, and error handling
- Error tracing system with breadcrumbs provides good debugging capability
- Vertical parameterization is ~90% complete — the architecture is right
- Security headers in `next.config.ts` are comprehensive (CSP, HSTS, etc.)
- Checkout flow handles race conditions well (atomic inventory decrement, expired order cleanup)
- No circular dependencies — dependency graph flows cleanly
- 129 of 133 API route files properly wrapped in `withErrorTracing()`

### Key Risks for FT Launch
1. The fee duplication (C1) is a ticking time bomb — one pricing change could create billing discrepancies
2. The tier bugs (C2+C3) mean FT vendors could get wrong limits and free access to paid features
3. Email branding (H2+H3) will make the product look unprofessional to FT customers
4. 28 commits sitting unpushed to production — the longer this sits, the riskier the production deploy

### Budget-Conscious Recommendations
- Skip Vercel edge rate limiting upgrade for now — in-memory is adequate at low volume
- Timezone hardcode is fine for single-market FT launch
- Don't invest in URL rewrite middleware until multi-domain routing is needed
- N+1 query won't matter until a vendor has 50+ listings
- Focus effort on Critical and High items — Medium/Low can be addressed post-launch

---

## Suggested Fix Order

**Phase 1 (pre-launch, ~2-3 hours):**
C1 → C2 → C3 → C4 → C5 (all code-only, no migrations)

**Phase 2 (pre-launch, ~1-2 hours):**
H2 → H3 → H4 → H5 → H6 → H7 → H8 → H9 → H10 → H11

**Phase 3 (launch week):**
M1 → M2 → M6 → M7 → M8 → M9 → M10 → M11 → M14 → M15

**Phase 4 (post-launch):**
M3 → M4 → M5 → M12 → M13 → L1-L12
