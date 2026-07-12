# Session 37 — Comprehensive Systems Audit & Strategic Roadmap
**Date:** 2026-02-19
**Scope:** Full-stack audit of InPersonMarketplace — Food Truck vertical focus
**Methodology:** 7 parallel deep-exploration agents across codebase structure, database, payments, security, vendor UX, buyer UX, and infrastructure. ~90 source files read, 131 API routes audited, 46 DB tables analyzed.

---

## EXECUTIVE SUMMARY

The app is architecturally sound with excellent foundations: a well-designed multi-vertical terminology system, clean CSS variable theming, comprehensive 4-channel notifications, production-grade error tracing, and a solid Stripe Connect integration. Session 36's audit already fixed 42 items across financial safety, security, and code quality.

**However, the Food Truck vertical is NOT ready for real users.** The gaps fall into three categories:

1. **Money Flow Gaps** — Race conditions in payment processing, market box vendors never receiving payouts, and inconsistent fee handling across payout paths
2. **Critical UX Blockers** — Stripe Connect setup invisible in onboarding, pickup time slots not shown to vendors, and browse page not filtering by location
3. **Terminology Leakage** — Dozens of hardcoded "Market"/"Market Box" strings that should say "Location"/"Chef Box" for food trucks

The good news: none of these require architectural changes. They're surgical fixes on a solid foundation.

---

## PART 1: WHAT'S WORKING WELL

Before the problems — the things that DON'T need touching:

| System | Assessment |
|--------|-----------|
| **Terminology system** (`term()`) | Well-designed, comprehensive, proper fallback chain |
| **CSS variable theming** | Clean architecture — vertical layout injects overrides, pages inherit |
| **4-channel notifications** | 19 types, proper channel selection, never throws, must await |
| **Pricing single source of truth** | `pricing.ts` is well-structured, fees are centralized |
| **Vendor tier differentiation** | FM vs FT tiers properly separated in `vendor-limits.ts` |
| **Rate limiting** | 128/131 routes covered (3 use alternative auth) |
| **Error tracing** | `withErrorTracing` + breadcrumbs on all 131 routes |
| **Security headers** | CSP, HSTS, X-Frame-Options all in `next.config.ts` |
| **Stripe Connect** | Deterministic idempotency keys, Connect account linking |
| **Auth patterns** | Consistent getUser() + role verification across routes |
| **Service client discipline** | All 33 uses verified — admin-checked or cron-authenticated |
| **RLS policies** | Comprehensive, uses `(SELECT auth.uid())` for performance |
| **Attendance/schedule system** | FT-specific vendor hours, attendance prompts, well-integrated |
| **Pickup scheduling RPC** | `get_available_pickup_dates()` is vertical-aware and correct |

**Stats:** 131 API routes, ~90 pages, 68 lib modules, 75 components, 46 DB tables, 80+ functions, 30+ triggers, 15 enum types, 10 views.

---

## PART 2: PRIORITIZED FINDINGS

### Tier 1: FINANCIAL SAFETY (Must fix before any real transaction)

| ID | Finding | Impact | Effort |
|----|---------|--------|--------|
| **F1** | **Race condition: webhook + success route both write `payments` record.** Both check-then-insert independently — concurrent execution can create duplicate rows. The `payments.stripe_payment_intent_id` UNIQUE constraint would catch it as a DB error, but the code doesn't handle the constraint violation gracefully. | Duplicate payment records possible; error in logs | Small — handle unique violation as no-op |
| **F2** | **Market box vendors NEVER receive payouts.** `market_box_pickups` completion has no Stripe transfer logic. Buyers pay upfront, platform holds funds, vendors get nothing through the payout system. | Vendors subsidize platform for every Chef Box sold | Medium — add payout trigger to pickup completion |
| **F3** | **Fee auto-deduction inconsistent across 3 payout paths.** `fulfill` route deducts outstanding vendor fees; `confirm-handoff` and `buyer/confirm` do NOT. Vendors using the buyer-first confirmation path avoid fee deduction. | Revenue leakage on vendor fees | Small — add fee deduction to all paths |
| **F4** | **`ready` route has no status validation.** Can be called on fulfilled or cancelled items — would flip status backwards. | Data integrity risk | Tiny — add status check |
| **F5** | **No tip upper-bound validation.** `Math.max(0, Math.round(tipAmountCents))` with no ceiling — a buggy client could send millions. | Financial exposure | Tiny — add `Math.min(tipAmountCents, maxTipCents)` |
| **F6** | **Market box "at capacity" after payment = buyer charged with no refund.** If `subscribe_to_market_box_if_capacity` RPC returns `{ success: false }`, buyer paid but gets nothing — no refund, no notification, no order status update. | Trust destroyer — buyer loses money | Medium — add refund + notification path |
| **F7** | **Cancellation fee vendor share calculated but never transferred.** Buyer cancel route computes `vendorShareCents` in the response but never initiates a Stripe transfer to the vendor. | Vendors lose compensation for prep work on cancellations | Small — add transfer call |
| **F8** | **`pending_stripe_setup` payouts never retried.** Cron Phase 5 only retries `status = 'failed'`. Vendors who complete Stripe setup later never get paid for past no-show items. | Lost vendor revenue | Small — add Phase 5.5 or expand query |
| **F9** | **No admin alert for permanently cancelled payouts after 7 days.** Just a `console.warn` in Vercel logs. | Undetected revenue loss | Small — send admin notification |

### Tier 2: CRITICAL UX BLOCKERS (Blocks FT vendor/buyer from completing core flows)

| ID | Finding | Impact | Effort |
|----|---------|--------|--------|
| **U1** | **Gate 4 (Stripe Connect) NOT shown in OnboardingChecklist UI.** API returns it, `canPublishListings` requires it, progress bar counts it — but the `gates` array only has 3 entries. Vendors hit 75% and can't publish with zero explanation. | Vendors stuck, unable to sell | Small — add Gate 4 to UI |
| **U2** | **No link to Stripe setup page from onboarding or dashboard.** The Stripe page exists at `/vendor/dashboard/stripe/` but has no entry point from the checklist or dashboard. | Dead end | Small — add link |
| **U3** | **Stripe success page has dead link.** Routes to `/vendor/dashboard/orders` which doesn't exist — should be `/vendor/orders`. | Broken navigation after critical setup | Tiny — fix path |
| **U4** | **Preferred pickup time NOT shown to vendors ANYWHERE.** Session 28 decided FT uses 30-min time slots. The field exists in DB (`order_items.preferred_pickup_time`), buyers can select it — but it doesn't appear in vendor orders, pickup mode, or prep sheet. | Vendors can't fulfill orders by time | Medium — add to 3 interfaces |
| **U5** | **Browse page does NOT filter by ZIP code proximity.** Accepts `?zip=` param and shows a badge, but listings returned are NOT location-filtered. A Chicago buyer sees listings from everywhere. | Discovery broken for local food trucks | Medium — add geo-filter to browse query |
| **U6** | **Vendor tier labels wrong on dashboard.** Code checks `tier === 'premium'` and `tier === 'featured'` — neither matches FT tier names (basic/pro/boss). All FT vendors show "Standard Plan". | Confusing, undermines tier value | Small — add FT tier name mapping |
| **U7** | **Allergen declarations disabled for food trucks.** `vertical === 'farmers_market'` gate on line 563 of ListingForm. FT has more allergen exposure than FM produce. | Missing food safety feature | Small — remove the gate or invert it |

### Tier 3: TERMINOLOGY LEAKAGE (Hardcoded FM language in FT context)

| ID | Location | Says | Should Say (FT) |
|----|----------|------|-----------------|
| **T1** | Checkout page line 939 | "Market Box Subscriptions" | "Chef Box Subscriptions" |
| **T2** | Buyer orders page line 689 | "Market Box" badge | "Chef Box" |
| **T3** | Buyer orders page line 252 | "Market:" filter | "Location:" |
| **T4** | Pickup mode line 909 | "Market Box Pickups" | "Chef Box Pickups" |
| **T5** | Pickup mode empty state | "Select a market" | "Select a location" |
| **T6** | Chef Box detail page | "agricultural realities" skip-week copy | "mechanical issues, event cancellations" |
| **T7** | Browse page h1 | "Browse" | "Browse Menus" |
| **T8** | Empty cart checkout | "Browse Products" | "Browse Menus" |
| **T9** | Checkout line 714 | "Market Compatibility Issues" | "Location Compatibility Issues" |
| **T10** | Browse page line 1081 | "4-Week Box" hardcoded | Term-length-aware label |
| **T11** | Listing form title placeholder | "Fresh Organic Tomatoes" | "BBQ Brisket Plate" |
| **T12** | Listing form description hint | "variety/type, quantity" | "portion size, sides, allergens" |
| **T13** | Dashboard market boxes card | "subscription bundles" | "Chef Boxes" |
| **T14** | Manifest.json `name` | "Farmers Marketing" | Per-vertical manifest needed |

### Tier 4: SECURITY & DATA INTEGRITY

| ID | Finding | Severity | Effort |
|----|---------|----------|--------|
| **S1** | **Profile image upload accepts `image/svg+xml`** — XSS risk if served from Supabase Storage. Listing images correctly restrict to jpeg/webp. | Medium | Tiny |
| **S2** | **Admin error digest email interpolates unescaped user content.** `user_description` goes directly into HTML. | Low (admin-only recipient) | Tiny |
| **S3** | **HEIC image upload silently fails.** `isValidImageType()` accepts HEIC but Canvas can't process it in most browsers. iOS users affected. | Medium for mobile | Small |
| **S4** | **Duplicate PostCSS configs** — `postcss.config.js` (TW v4) and `postcss.config.mjs` (TW v3) both exist. One is wrong. | Build correctness risk | Tiny — delete wrong one |
| **S5** | **CRON_SECRET marked optional** in environment validation but absence causes 500 on cron endpoints. | Deployment risk | Tiny — move to required |
| **S6** | **`vendor_profiles.tier` CHECK constraint in DB** only allows 'standard'/'premium' — but FT uses free/basic/pro/boss. Schema snapshot says it was expanded in migration 027/033, but the CHECK in the snapshot shows the old constraint. **Need to verify actual DB.** | Could block FT vendor creation | Verify — may be snapshot-only |

### Tier 5: INFRASTRUCTURE & SCALABILITY

| ID | Finding | Impact | Effort |
|----|---------|--------|--------|
| **I1** | **PWA manifest is FM-only.** `manifest.json` has `name: "Farmers Marketing"`, `theme_color: "#166534"`. Food Truck'n users installing PWA get FM branding. | Brand confusion | Medium — dynamic manifest per domain |
| **I2** | **Service worker push icon is FM-branded.** All push notifications show FM logo regardless of vertical. | Brand confusion | Small — per-vertical icon |
| **I3** | **No 512x512 PWA icon.** Only 192x192 exists — Android Chrome install prompts may fail. | PWA install broken on some devices | Small — add icon |
| **I4** | **Cron Phase 6 digest email hardcodes** `from: 'alerts@farmersmarketing.app'` — wrong sender for FT context. | Brand confusion in admin emails | Tiny |
| **I5** | **No automated tests, no CI/CD.** All deployments are manual git push → Vercel. No safety gate. | Risk accumulates as codebase grows | Strategic decision |
| **I6** | **In-memory rate limiter doesn't share state across serverless instances.** Bypassable under concurrent load by hitting different instances. | Security gap at scale | Medium — Upstash Redis (free tier available) |
| **I7** | **Tailwind `content` array excludes `src/lib/`.** Classes in template strings in lib files could be purged in production. | Potential styling bugs | Tiny — add to content array |
| **I8** | **`RESEND_FROM_EMAIL` has hardcoded FM default** (`noreply@mail.farmersmarketing.app`). FT emails come from FM domain. | Brand confusion | Tiny — per-vertical sender |

### Tier 6: UX POLISH & OPTIMIZATION

| ID | Finding | Category |
|----|---------|----------|
| **P1** | Signup form uses `alert()` and `window.confirm()` throughout — terrible mobile UX | Vendor |
| **P2** | Listing card no-image placeholder is `📦` — should be food emoji for FT | Buyer |
| **P3** | "View Vendor Profile" button is solid-filled, not outlined (violates FT brand kit) | Buyer |
| **P4** | Landing page stats show fake fallback data (50 listings, 25 vendors) on launch | Buyer trust |
| **P5** | No "saved trucks" / vendor favorites in the buyer flow | Buyer retention |
| **P6** | Pickup mode only shows "ready" items — FT cooks need "confirmed" (kitchen queue) | Vendor |
| **P7** | Pickup mode polling uses market hours, not vendor-set operating hours | Vendor |
| **P8** | Prep sheet has no pickup time column or unit labels | Vendor |
| **P9** | Analytics "Export CSV" is a placeholder `alert()` — boss tier vendors pay $50/mo for this | Vendor |
| **P10** | Analytics "Top Products" click routes to buyer view, not vendor edit page | Vendor |
| **P11** | Texas-specific permit requirements hardcoded with no configuration mechanism | Vendor |
| **P12** | No dietary/allergen filter on browse page | Buyer |
| **P13** | ZIP badge shows raw ZIP not city name on browse | Buyer |
| **P14** | Tip selector doesn't explain who receives it | Buyer |
| **P15** | "View submitted data" debug `<details>` element in signup success | Vendor |
| **P16** | Stripe setup page uses no design tokens — looks like a placeholder | Vendor |
| **P17** | Settings page has no back link | Buyer |
| **P18** | No "Find My Truck" shortcut on buyer dashboard | Buyer |
| **P19** | Quantity field labeled "Quantity Available" — wrong framing for made-to-order FT items | Vendor |

---

## PART 3: END-TO-END WORKFLOW ANALYSIS

### Flow 1: Food Truck Vendor Onboarding → First Sale

```
[SIGNUP] → [ONBOARDING] → [STRIPE] → [LISTING] → [BUYER FINDS IT] → [ORDER] → [PAYOUT]
   ✓          ⚠️             ❌          ⚠️            ❌              ⚠️         ⚠️
```

| Step | Status | Blockers |
|------|--------|----------|
| Vendor signs up | WORKS | P1 (alert() dialogs), P15 (debug element) |
| 3-gate onboarding | WORKS but CONFUSING | U1 (Gate 4 invisible), U2 (no Stripe link) |
| Stripe Connect setup | BLOCKED | U1+U2 (no path to it), U3 (dead link on success) |
| Creates first listing | WORKS but FRICTION | U7 (no allergens), U4 (no pickup times shown back), T11/T12 (FM placeholder text) |
| Buyer discovers listing | BROKEN | U5 (browse not location-filtered) |
| Buyer places order | WORKS | F5 (tip validation), T1 (terminology) |
| Vendor receives & fulfills | WORKS but MISSING INFO | U4 (no pickup time visible) |
| Vendor gets paid | WORKS but INCONSISTENT | F3 (fee deduction varies by path) |

**Verdict:** A food truck vendor CAN technically complete this flow, but will get stuck at Stripe setup (U1/U2) unless they discover the URL independently. A buyer CAN order but won't find local trucks (U5).

### Flow 2: Chef Box (Market Box) Subscription

```
[VENDOR CREATES BOX] → [BUYER SUBSCRIBES] → [WEEKLY PICKUPS] → [VENDOR PAID]
        ✓                      ⚠️                    ✓                ❌
```

| Step | Status | Blockers |
|------|--------|----------|
| Vendor creates Chef Box | WORKS | T13 (terminology), box_type field works |
| Buyer subscribes via Stripe | WORKS | F6 (at-capacity = lost money) |
| Weekly pickup tracking | WORKS | Mutual confirmation, skip-week, extensions all functional |
| Vendor receives payout | **BROKEN** | F2 — no payout logic exists for market box pickups |

**Verdict:** Chef Box subscriptions are a **revenue trap** — vendors provide weekly boxes but the platform never pays them.

### Flow 3: Order Cancellation / No-Show

```
[BUYER CANCELS] → [REFUND] → [VENDOR COMPENSATED?]
     ⚠️              ✓              ❌
```

| Step | Status | Blockers |
|------|--------|----------|
| Buyer cancels within grace period | WORKS | Full refund |
| Buyer cancels after grace period | WORKS | 25% cancellation fee retained |
| Vendor rejection → refund | WORKS (fixed in S36) | Refunds full buyer-paid amount now |
| Vendor compensation from cancellation fee | **BROKEN** | F7 — vendor share calculated but never transferred |
| No-show → auto-fulfill | WORKS (fixed in S36) | Vendor gets paid via cron Phase 4 |

### Flow 4: Vendor Tier Upgrade/Downgrade

```
[CHOOSE TIER] → [STRIPE SUBSCRIPTION] → [WEBHOOK UPDATES DB] → [LIMITS CHANGE]
      ✓                ✓                       ⚠️                     ✓
```

| Step | Status | Blockers |
|------|--------|----------|
| Vendor selects tier | WORKS | |
| Stripe subscription created | WORKS | |
| Webhook processes tier change | RISK | `food_truck_vendor` type silently ignored in `handleInvoicePaymentFailed` |
| DB tier and limits update | WORKS | `enforce_listing_tier_limit` trigger active |
| Downgrade timing | WORKS (fixed in S36) | Actual downgrade deferred to billing period end |

---

## PART 4: STRATEGIC RECOMMENDATIONS

### Recommendation 1: "Go-to-Market Minimum" — Ship in 3 Phases

**Phase A: Fix the Money (1 session, ~20 changes)**
- F1-F9: All financial safety items
- This is non-negotiable before ANY real transaction

**Phase B: Fix the Journey (1-2 sessions, ~30 changes)**
- U1-U7: All critical UX blockers
- T1-T14: All terminology leakage (batch grep-and-replace)
- S1-S6: Security items

**Phase C: Polish for Launch (1-2 sessions, ~20 changes)**
- P1-P19: UX polish items
- I1-I8: Infrastructure items
- First real end-to-end test by a non-developer

### Recommendation 2: Highest-ROI Single Actions

1. **Add pickup time to vendor interfaces** (U4) — Touches 3 files, unlocks core FT value proposition
2. **Add geo-filter to browse** (U5) — Touches 1 query, makes discovery actually work
3. **Add Gate 4 to onboarding UI** (U1) — Touches 1 component, unblocks entire vendor flow
4. **Add market box vendor payouts** (F2) — Touches 1 route, fixes an active money trap
5. **Terminology sweep** (T1-T14) — Batch job, fixes dozens of FM leaks at once

### Recommendation 3: Technical Debt vs. Shipping

| Decision Point | Recommendation | Reason |
|----------------|---------------|--------|
| Automated tests | Defer to post-launch | Manual testing + Claude's audit coverage is sufficient for MVP. Add tests when you have revenue. |
| Redis rate limiter | Defer to 100+ users | In-memory limiter is fine at launch volume. Upstash free tier is available when needed. |
| Domain-based routing | Defer to multi-domain | Currently one domain per vertical. Only needed when `815enterprises.com` serves all verticals. |
| CI/CD pipeline | Defer to post-launch | Current staging-first workflow + Claude review is sufficient for a 2-person team. |
| React error boundaries | Defer | No user-facing crashes reported. Add when error monitoring shows need. |
| `any` type cleanup | Defer indefinitely | 41 files, zero runtime impact. Pure aesthetic. |

### Recommendation 4: Cost-Effective Scaling Path

| Scale Point | Action | Cost |
|-------------|--------|------|
| 0-100 users | Current architecture is fine | $0 additional |
| 100-1000 users | Add Upstash Redis for rate limiting + session caching | $0 (free tier) |
| 1000+ users | Add Vercel Edge Config for feature flags | $0 (included) |
| 5000+ users | Consider Supabase Pro plan upgrade | ~$25/mo |
| 10000+ users | Add CDN image optimization (already built via next/image) | $0 |

### Recommendation 5: Competitive Advantage Opportunities

1. **Real-time order queue for FT vendors** — Show "confirmed" items as a kitchen prep queue, not just "ready" items. No competitor does this well for food trucks.
2. **Time-slot-aware prep sheets** — Sequence prep by pickup time. Saves vendors hours of manual organization.
3. **Location-based push notifications** — "Your favorite truck is at [Park] today!" Requires proximity detection but VAPID infrastructure is already built.
4. **Vendor analytics that actually help** — Current analytics show revenue/orders. Add: busiest hours, most popular items by location, repeat customer rate. Data already exists in `order_items`.

---

## PART 5: SCHEMA & DATA OBSERVATIONS

### Tables That Are Never Written To

| Table | Status | Action Needed |
|-------|--------|--------------|
| `transactions` | **ZERO writes in codebase** (fixed in S36 — analytics rewritten to use `order_items`) | Consider dropping table if no other consumers |
| `fulfillments` | FK to `transactions` — also effectively dead | Same |
| `audit_log` | Has triggers but unclear if anything writes to it | Verify |

### Schema Snapshot Staleness

The `vendor_profiles.tier` CHECK constraint in the snapshot says `tier IN ('standard', 'premium')` but migrations 027/033 expanded it to include `free/basic/pro/boss`. **The snapshot structured tables need regeneration** — ask user to run `REFRESH_SCHEMA.sql` and rebuild.

### `transactions` + `fulfillments` Tables

These appear to be from an earlier architectural pattern (pre-order-items model). They have triggers (`notify_transaction_status_change`), FKs, and indexes, but the order flow now writes exclusively to `orders` + `order_items`. These tables are dead weight — 2 tables, 3 triggers, 8 indexes consuming space and maintenance overhead.

---

## PART 6: GIT & DEPLOYMENT STATE

| Branch | Status |
|--------|--------|
| `main` (local) | At commit `e4f7dcc` — 5+ commits ahead of `origin/main` |
| `staging` | Needs merge + push (Session 36 commits not all on staging) |
| `origin/main` (prod) | Behind — Session 36 fixes not deployed |

**Next deployment action:** Merge main → staging, push staging, user tests, then push production.

---

## APPENDIX: ALL FINDINGS BY FILE

(Cross-reference for implementation — which files need changes)

### Files Needing Multiple Changes
| File | Findings |
|------|----------|
| `ListingForm.tsx` | U4 (pickup time), U7 (allergens), T11, T12, P19 |
| `checkout/page.tsx` | T1, T8, P14 |
| `buyer/orders/page.tsx` | T2, T3 |
| `vendor/pickup/page.tsx` | U4, T4, T5, P6, P7 |
| `vendor/dashboard/page.tsx` | U6, T13 |
| `OnboardingChecklist.tsx` | U1, U2 |
| `vendor/markets/[id]/prep/page.tsx` | U4, P8 |
| `browse/page.tsx` | U5, T7, T10, P2, P12, P13 |
| `manifest.json` | I1, I3 |
| `sw.js` | I2 |
| `notifications/service.ts` | I4, I8 |
| `vendor-signup/page.tsx` | P1, P15 |
| `vendor/analytics/page.tsx` | P9, P10 |
| `vendor/dashboard/stripe/page.tsx` | U3, P16 |

---

*This report is the master reference for Session 37+. After each fix, check the box and note the commit hash.*

---

## INVESTIGATION: FM 'Featured' Tier

**Raised by user during S6 review — "I've never seen featured before."**

### What it is
`featured` is a Farmers Market vendor tier above `premium`. It exists in:
- `vendor_profiles.tier` CHECK constraint (all 3 envs)
- `vendor-limits.ts` TIER_LIMITS — has identical limits to `premium`
- `VendorTierManager.tsx` — treated as equivalent to `premium` (`isPremium = currentTier === 'premium' || currentTier === 'featured'`)
- Sort priority — same priority as `premium` (both return 0)
- `isPaidVendorTier()` — returns true for both `premium` and `featured`

### What it's NOT
- **No separate price.** FM only has one subscription: `vendor_monthly_cents: 2499` ($24.99/mo). There's no `fm_featured_monthly` price.
- **No upgrade path from premium → featured.** The FM upgrade page only offers standard → premium.
- **No UI to set a vendor as featured.** Admin panel doesn't have a "set to featured" action.
- **No unique benefits.** Limits are copy-pasted from `premium`. The only theoretical difference would be extra visibility ("Featured on homepage, browse, and market pages") mentioned in VendorTierManager benefit lists.

### Conclusion
`featured` appears to be a **planned but never implemented** tier. It was added to the CHECK constraint and limits as a placeholder, but there's no way for a vendor to reach it through the normal flow. It's harmless (nothing breaks), but it's dead code.

### Decision needed
- **Option A: Remove it** — drop from CHECK constraint, remove from `TIER_LIMITS`, simplify `isPremium` checks. Clean, but requires a migration.
- **Option B: Keep as admin-only tier** — add an admin action to manually promote vendors to `featured`. Could be useful for highlighting top vendors without a price tier.
- **Option C: Leave as-is** — it's harmless dead code. Address later when FM tier system gets attention.

**User decision: Option C** — leave as-is for now.

---

## INVESTIGATION: I5 — No Automated Tests / No CI/CD

**Raised by user: "Tell me about the risk & options."**

### Current State
- **Tests**: Zero test files in the codebase. No unit tests, integration tests, or E2E tests.
- **CI/CD**: None. Deployment is manual: `git push origin staging` → Vercel auto-deploys → user tests → `git push origin main`.
- **Safety net**: Claude Code audits + pre-commit lint + TypeScript compiler. No automated runtime verification.

### Risk Assessment

**What could go wrong without tests:**

| Risk | Likelihood | Impact | Example |
|------|-----------|--------|---------|
| Payment logic regression | Medium | **Critical** — lost money | Changing fee calculation breaks vendor payouts. TSC won't catch math errors. |
| Stripe webhook handling breaks | Medium | **Critical** — orders stuck | Editing checkout flow inadvertently changes webhook payload shape. No test catches it. |
| RLS policy regression | Low | **High** — data leak | A migration drops/recreates a policy with wrong conditions. Buyers see other buyers' orders. |
| API route returns wrong shape | Medium | **Medium** — broken UI | Refactoring an API route changes a field name. Frontend silently gets `undefined`. |
| Notification delivery fails silently | Low | **Medium** — missed orders | `sendNotification()` never throws, so a broken template or missing field just silently fails. |
| Edge case in order lifecycle | Medium | **Medium** — stuck orders | Cancel/refund/fulfill logic has ~10 status transitions. Manual testing can't cover all paths. |

**What could go wrong without CI/CD:**

| Risk | Likelihood | Impact |
|------|-----------|--------|
| Deploying with TSC errors | Very low | Medium — Vercel build fails (caught) |
| Deploying broken code to prod | Low | High — but staging-first workflow mitigates |
| Forgetting to push staging first | Medium | Medium — no gate prevents direct prod push |
| Env var mismatch between envs | Low (fixed S5) | High — cron/webhooks silently break |

### Overall Risk Level: **Moderate, increasing with each session**

At current codebase size (~130 source files, ~50 API routes), manual testing + Claude audits is workable. But each session adds complexity. The payment and order lifecycle code is the highest-risk area — a regression there costs real money.

### Options

**Option A: Do nothing (current approach) — $0, 0 effort**
- Pros: Ship faster, no test maintenance overhead, Claude audits catch structural issues
- Cons: Risk accumulates. No safety net for runtime logic. Every deploy requires manual testing.
- Best for: Pre-revenue MVP with a single developer who manually tests every flow

**Option B: Targeted critical-path tests only — $0, ~1 session**
- Add tests ONLY for: checkout flow, payment calculations, fee logic, order status transitions, Stripe webhook handling
- ~15-20 test cases covering the money paths
- Use Vitest (already compatible with Next.js, zero config)
- Pros: Covers the highest-risk area. Catches payment regressions before they hit production.
- Cons: Doesn't cover UI, API shapes, or notification logic
- Best for: When you start processing real transactions

**Option C: Basic CI pipeline + critical tests — $0, ~2 sessions**
- Everything in Option B, plus:
- GitHub Actions workflow: `tsc --noEmit` + `vitest run` on every push to `main` and `staging`
- Branch protection: require CI pass before merge
- Pros: Automated gate prevents broken deploys. Catches TSC + logic errors before staging.
- Cons: ~2 sessions of setup, slight workflow change (PRs instead of direct push)
- Best for: When you have a second developer or start processing volume

**Option D: Full test suite — $0, ~4-5 sessions**
- Unit tests for all lib functions (pricing, vendor-limits, terminology, notifications)
- Integration tests for all API routes (mock Supabase + Stripe)
- E2E tests with Playwright for critical user flows (signup → list → buy → pickup)
- Pros: Comprehensive safety net. Enables confident refactoring.
- Cons: Significant upfront investment. Test maintenance overhead.
- Best for: Post-revenue, when the cost of a bug exceeds the cost of writing tests

### Recommendation

**Option B now, Option C when you have revenue.** The payment logic is complex enough (10+ status transitions, 3 fee types, market box subscriptions, tips, refunds) that a handful of targeted tests would prevent the most expensive bugs. You don't need full coverage — you need a safety net around the money.
