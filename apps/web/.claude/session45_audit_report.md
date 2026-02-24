# Session 45: Comprehensive Systems Audit Report
**Date**: 2026-02-24
**Scope**: Full codebase & systems review — 140 API routes, 94 pages, 49 DB tables, 6 parallel agents

---

## Methodology
- Read all context files (CLAUDE.md, CLAUDE_CONTEXT.md, SCHEMA_SNAPSHOT.md, MEMORY.md, rules)
- Read key source files: `pricing.ts`, `vendor-limits.ts`, `design-tokens.ts`, `vertical/index.ts`
- Launched 6 parallel deep-dive agents analyzing:
  1. All 140 API routes (error tracing, rate limiting, auth, validation)
  2. Vertical isolation across pages + queries
  3. Checkout/payment end-to-end flow
  4. All 94 vendor & buyer workflow pages
  5. Testing & error infrastructure
  6. Notification system (34 types, 36 call sites)

---

## What's Working Well

1. **Multi-vertical isolation: 95%+ secure** — CSS var theming, `term()` system, query filtering
2. **Fee system centralized** — `pricing.ts` single source of truth, 27 unit tests
3. **Error tracing: 97% route coverage** — `withErrorTracing`, breadcrumbs, error catalog
4. **Race condition mitigations solid** — Atomic inventory decrement, double payout prevention, idempotent Stripe keys
5. **Notification system comprehensive** — 34 types, 4 channels, tier-gated for FT, batch support
6. **CI/CD pipeline functional** — Lint, type check, test, build, bundle size reporting
7. **Security headers thorough** — HSTS, CSP, X-Frame-Options, Permissions-Policy
8. **Vendor tier limits enforced** — Both app code AND DB trigger
9. **Cron jobs well-structured** — 8-phase order expiry, quality checks, activity scanning

---

## VERTICAL IMPACT KEY

- **FM** = Farmers Market vertical
- **FT** = Food Trucks vertical
- **Platform** = Shared infrastructure (affects all verticals equally)
- **% Impact** = How severely this finding affects that vertical's users/revenue/operations
  - 100% = Fully blocked or broken for this vertical
  - 75%  = Major degradation
  - 50%  = Moderate impact
  - 25%  = Minor inconvenience
  - 0%   = Not applicable to this vertical

---

## TIER 1: CRITICAL (Revenue / Security / Data Risk)

### ~~C-1: External Payment UX is Broken~~ — RETRACTED
**Status**: NOT A BUG. Re-investigation confirmed external payments work correctly:
- Cash: "Bring $X.XX cash when you pick up" + two-step confirm→fulfill flow
- Venmo/PayPal/CashApp: deep link opens payment app
- Fees deferred to fulfillment (vendors not charged for no-shows)
- Commit `2503777` implemented the full flow

---

### C-2: No Integration or E2E Tests
- 7 test files with 94 unit tests cover ONLY library math functions
- Zero tests for: API routes, checkout flow, order lifecycle, RLS policies, Stripe webhooks
- Test-to-route ratio: **3.5%** (7 files vs 140 routes)

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| Platform | **100%** | Any code change can break either vertical's payment flow undetected. Equal risk to both. |

---

### C-3: Market Box Subscription RPC Failure = Buyer Charged, No Subscription
- If `subscribe_to_market_box_if_capacity()` RPC fails AFTER Stripe payment, buyer is charged but subscription not created
- At-capacity case auto-refunds, but **RPC errors do NOT auto-refund**

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **100%** | Market Boxes are a core FM feature — weekly produce subscriptions. Direct money loss. |
| FT | **100%** | Chef Boxes are the FT equivalent. Same RPC, same failure mode. Equal exposure. |

---

### C-4: Rate Limiter is In-Memory Only
- Per-serverless-instance rate limiting (no shared state across Vercel functions)
- Attacker hitting different instances bypasses limits entirely

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| Platform | **40%** | Low scale today means low actual risk. Becomes critical at scale. Both verticals equally exposed. |

---

### C-5: Vertical Parameter Validation Missing on 136 Routes
- Only **4 of 140 routes** validate that `vertical` query param exists in `verticals` table
- Most routes pass it through as a filter without validation

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| Platform | **25%** | RLS + ownership scoping prevents data leaks. This is enumeration risk / poor hygiene, not a breach vector. Equal for both. |

---

## TIER 2: HIGH (UX Blockers / Workflow Gaps)

### H-1: Vendor Onboarding Has No Success State
- No "Onboarding Complete" celebration, no next-step guidance
- Stripe Connect not prominently prompted — vendors discover they can't get paid later

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **80%** | FM vendors go through 3-gate verification (category, COI, prohibited items). Longer process with no payoff moment = higher dropout risk. |
| FT | **90%** | FT vendors are paying subscribers. If onboarding feels incomplete, they're less likely to activate and more likely to churn before first sale. Higher cost-per-lost-vendor. |

---

### H-2: No Pre-Pickup Reminders
- No "Your order is ready for pickup in 2 hours" notification
- No "Market starts in 1 hour" reminder

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **75%** | Market pickups are weekly on a set schedule. Buyers may forget, but the pattern is recurring and somewhat predictable. |
| FT | **90%** | FT has time-slot-based pickups (30-min windows). Narrower windows = higher no-show risk if buyer forgets. More perishable food = more vendor waste. |

---

### H-3: Email FROM Address Not Per-Vertical
- All emails from `noreply@mail.farmersmarketing.app` regardless of vertical
- FT buyers get FM-branded emails

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **0%** | Emails are already correctly branded for FM. No impact. |
| FT | **100%** | Every email a FT user receives has a competitor's branding. Damages trust, confuses buyers, undermines the FoodTruckN brand entirely. |

---

### H-4: No Reviews or Ratings Visible on Listings
- `order_ratings` table exists with `rating` + `comment` columns
- No buyer-facing display on listing detail or browse pages

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **80%** | Reviews build trust for produce quality. FM buyers are more cautious about food freshness from unknown vendors. |
| FT | **90%** | Food truck discovery is heavily review-driven (Yelp, Google Reviews). Missing this signal is a major competitive gap for FT. |

---

### H-5: Partial Fulfillment Not Supported
- Vendor can only fulfill ENTIRE order or reject/refund
- If 8 of 10 items ready, buyer loses entire order

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **90%** | Farmers have variable inventory (weather, harvest). "Sorry, no tomatoes this week but everything else is ready" is a daily reality. This forces an all-or-nothing choice. |
| FT | **50%** | Food trucks have more controlled menus with predictable supply. Partial fulfillment happens less frequently but still matters for combo orders. |

---

### H-6: Subscription Auto-Renewal Missing
- Market box subscriptions end at week 4 (or 6 with extension)
- No auto-renew — buyer must manually re-subscribe

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **85%** | Market Boxes are a key recurring revenue feature for FM. Manual renewal = churn at every cycle boundary. |
| FT | **85%** | Chef Boxes are equivalent for FT. Same churn risk. Both lose predictable revenue. |

---

### H-7: Timezone Display Missing from All Time Elements
- Cutoff times, pickup windows, order deadlines shown WITHOUT timezone indicator
- Server uses market timezone correctly, but UI doesn't show it

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **60%** | Markets are local by nature — buyers and vendors usually in same timezone. Cross-TZ confusion less common. |
| FT | **85%** | Food trucks are more mobile, may serve multiple cities/states. Time-slot pickups (30-min windows) make timezone errors more consequential — buyer arrives an hour early/late. |

---

### H-8: No External Monitoring (Sentry/DataDog/etc.)
- Error tracking is DB-only (error_logs table)
- In-memory performance metrics reset on serverless restart

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| Platform | **75%** | Equally affects both. Errors happen silently. No trend analysis, no spike alerting. Current DB-only approach works but won't scale and provides no real-time visibility. |

---

## TIER 3: MEDIUM (Improvement Opportunities)

### ~~M-1: Cron Routes Missing `withErrorTracing()`~~ — RETRACTED
**Status**: NOT A BUG. Re-investigation confirmed all active cron routes already have `withErrorTracing()`.
`confirm-cash-complete` is deprecated (returns 410 Gone). No changes needed.

---

### M-2: Referral Code Not Vertical-Scoped
- Referral code lookup doesn't filter by `vertical_id`
- FM vendor code works for FT signup (cross-contamination)

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **40%** | An FT referral code granting FM credit dilutes FM referral tracking accuracy. |
| FT | **40%** | Same issue in reverse. Both verticals get inaccurate referral attribution. |

---

### M-2b: Cross-Vertical Auth Bleed — NEEDS EXPLORATION
- **User-reported**: Opening the other vertical's URL in a new tab auto-logs you in
- **Staging cause (confirmed)**: Both verticals share one Vercel preview domain → single Supabase auth cookie covers both
- **Production question**: Different TLDs (`farmersmarketing.app` vs `foodtruckn.app`) = separate cookie jars → session should NOT carry over
- **BUT**: Both TLDs share the same Supabase project (same `auth.users` table). Investigate:
  1. **Credential sharing**: Can a user who signed up on FM log in to FT with the same email/password? (Likely yes — same auth DB)
  2. **Should they be able to?** Design decision: shared identity across verticals (convenience) vs separate accounts (isolation)
  3. **`vendor_profiles` scoping**: Does a vendor approved on FM appear as a vendor on FT? (Should NOT — vendor_profiles has `vertical_id`)
  4. **Buyer role bleed**: If a buyer signs up on FM, do they automatically have buyer access on FT? (Likely yes — `user_profiles` has no vertical_id)
  5. **Middleware vertical routing**: Does `middleware.ts` enforce that the vertical in the URL matches the user's context?
  6. **Cart/order isolation**: Can a buyer with a cross-vertical session add FT items while browsing FM? (Carts have `vertical_id` — likely safe)
- **Status**: EXPLORE — needs codebase investigation of auth flow, middleware, and user_profiles table

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **60%** | If production shares auth, FM buyers could see FT content/data in edge cases. Vendor profiles are scoped, but buyer identity is not. |
| FT | **60%** | Same risk in reverse. FT is launching first — early FT users discovering FM content undermines the standalone brand. |

---

### M-3: `profile_data` JSONB Not Schema-Validated
- `/api/submit/route.ts` accepts `profile_data` directly from client with no Zod/schema validation

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| Platform | **35%** | Both verticals use the same signup flow. RLS provides some protection. Risk is arbitrary JSONB injection. |

---

### M-4: Activity Feed Not Vertical-Filtered
- `/api/marketing/activity-feed` returns activity from ALL verticals
- FM buyers see FT activity and vice versa

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **50%** | FM buyers see "Food Truck X just sold 5 tacos!" — confusing and off-brand. |
| FT | **50%** | FT buyers see "Farm Y just sold organic kale!" — equally confusing. |

---

### M-5: Vendor Dashboard Missing Earnings Display
- No "Pending Payouts" or "This Month's Earnings" on vendor dashboard

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **70%** | Vendors need to track income. Currently must check Stripe separately. |
| FT | **80%** | FT vendors are paying subscribers — they want ROI visibility. "Am I making more than my subscription costs?" is a key question. |

---

### M-6: Listing Pause/Unpublish Missing
- Can delete but not pause listings. `listing_status` enum has 'paused' but UI doesn't use it.

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **65%** | Seasonal vendors want to hide winter items without losing order history. |
| FT | **85%** | Food trucks have more variable schedules (events, weather, travel). Pause is a daily operational need. |

---

### M-7: Bulk Listing Operations Missing
- No bulk publish/unpublish/price-update

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **40%** | Premium tier has 15 listings max. Manageable one-by-one. |
| FT | **90%** | Boss tier allows 45 listings. Managing one-by-one is painful. Seasonal menu rotations need bulk ops. |

---

### M-8: `payout_failed` Notification Reused for Tier Expiry
- Semantic mismatch — payout_failed notification sent for subscription expiry

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **15%** | FM tiers (standard/premium/featured) are not paid subscriptions currently. Minimal relevance. |
| FT | **75%** | FT tiers (basic/pro/boss) are paid monthly. Vendors getting "payout failed" when their subscription expires is confusing and alarming. |

---

### M-9: No Vendor-Buyer Messaging
- No in-app communication channel. Questions require external email/phone.

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **60%** | Produce questions ("Is the kale organic?") happen but markets are local — buyers can ask in person. |
| FT | **75%** | Food allergy questions, custom order requests, "where are you parked?" — FT has more real-time communication needs. |

---

### M-10: Cart Doesn't Validate Availability Until Checkout
- Buyer adds items, goes to checkout, finds items out of stock

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **70%** | Farm produce inventory is volatile. Items sell out fast at popular markets. |
| FT | **80%** | FT has time-slot constraints layered on top of inventory. Double the failure modes. |

---

### M-11: Search is Category + Title Substring Only
- No full-text search, no fuzzy matching, no filters for rating/price/dietary

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| FM | **65%** | FM has fewer listings per market. Category browsing is workable for small catalogs. |
| FT | **80%** | FT Boss vendors can have 45 items. Multiple trucks at an event = large catalog. Search matters more for discovery. Dietary filters critical for food allergies. |

---

### M-12: Admin Role Checking Inconsistent
- Some routes use `hasAdminRole()` helper, others check inline

| Vertical | Impact | Reasoning |
|----------|--------|-----------|
| Platform | **20%** | Maintenance burden, not a security issue. Both verticals equally affected. |

---

## TIER 4: LOW (Polish / Nice-to-Have)

| ID | Finding | FM Impact | FT Impact | Reasoning |
|----|---------|-----------|-----------|-----------|
| L-1 | Service worker push-only, no offline caching | 30% | 50% | FT vendors at events have spotty connectivity |
| L-2 | No data retention policy (logs accumulate) | Platform 20% | Platform 20% | Storage cost grows slowly, equal risk |
| L-3 | Allergen filter unreliable (`contains_allergens` often null) | 25% | 60% | Allergens far more critical for prepared food (FT) than raw produce (FM) |
| L-4 | Schedule editing UX painful, no bulk copy | 40% | 70% | FT trucks have more variable/complex schedules |
| L-5 | Out-of-stock badge missing on browse | 55% | 55% | Equal impact — both need clear availability signals |
| ~~L-6~~ | ~~"Added to Cart" no confirmation toast~~ | — | — | **RETRACTED** — Toast exists in `AddToCartButton.tsx` line 138 |
| L-7 | Loading states inconsistent | 25% | 25% | Equal — cosmetic, both verticals |
| L-8 | Small order fee not explained | 35% | 50% | FT minimum is $5 (vs FM $10), so fee triggers more often for FT |
| L-9 | Pickup confirmation window 30s fragile | 30% | 60% | FT has time-slot pickups; tighter windows make 30s more punishing |
| L-10 | Quality alerts not actionable | 30% | 30% | Equal — admin feature for both |

---

## TIER 5: STRATEGIC (Future Scalability)

| ID | Opportunity | FM Impact | FT Impact | Reasoning |
|----|-------------|-----------|-----------|-----------|
| S-1 | Reviews & ratings UI | 80% | 90% | FT more review-driven (Yelp culture) |
| S-2 | Subscription auto-renewal (Stripe Recurring) | 85% | 85% | Both have box subscriptions |
| S-3 | QR code scanning for pickup | 60% | 85% | FT has higher volume + time-slot pressure |
| S-4 | Offline-first PWA | 40% | 70% | FT vendors at events need offline resilience |
| S-5 | External monitoring (Sentry) | Platform 75% | Platform 75% | Equal — free tier immediate win |
| S-6 | Integration test suite | Platform 100% | Platform 100% | Equal — protects all payment flows |
| S-7 | Shared rate limiter (Upstash Redis) | Platform 40% | Platform 40% | Low scale currently, equal future risk |
| S-8 | Product recommendations | 50% | 70% | FT larger catalogs benefit more from discovery |

---

## VERTICAL IMPACT SUMMARY

### Items That Hit FT Harder Than FM
| ID | Finding | FM | FT | Delta |
|----|---------|----|----|-------|
| H-3 | Email FROM not per-vertical | 0% | 100% | **+100** |
| M-7 | Bulk listing ops missing | 40% | 90% | **+50** |
| M-8 | payout_failed reused for tier expiry | 15% | 75% | **+60** |
| M-6 | Listing pause missing | 65% | 85% | +20 |
| H-2 | No pickup reminders | 75% | 90% | +15 |
| H-7 | Timezone display missing | 60% | 85% | +25 |
| L-3 | Allergen filter unreliable | 25% | 60% | +35 |
| L-4 | Schedule editing painful | 40% | 70% | +30 |
| M-11 | Search is basic | 65% | 80% | +15 |

### Items That Hit FM Harder Than FT
| ID | Finding | FM | FT | Delta |
|----|---------|----|----|-------|
| H-5 | Partial fulfillment missing | 90% | 50% | **+40** |
| C-1 | External payment UX broken | 85% | 75% | +10 |

### Items Hitting Both Equally (Platform-Wide)
C-2, C-3, C-4, C-5, H-4, H-6, H-8, M-1, M-2, M-2b, M-3, M-4, M-12, L-2, L-5, L-6, L-7, L-10, S-5, S-6, S-7

---

## VERTICAL PRIORITIZATION

### If FT Ships First (Current Strategy)
**Top 10 for FT launch readiness:**
1. H-3 — Email FROM per-vertical (100% FT impact, brand-breaking)
2. C-1 — External payment UX (75% FT)
3. C-3 — Market Box RPC auto-refund (100% FT)
4. H-1 — Vendor onboarding success state (90% FT)
5. H-2 — Pre-pickup reminders (90% FT)
6. M-7 — Bulk listing operations (90% FT, Boss tier unusable without)
7. H-4 — Reviews display (90% FT)
8. M-6 — Listing pause/unpublish (85% FT)
9. H-7 — Timezone display (85% FT)
10. M-5 — Vendor earnings display (80% FT)
11. **M-2b — Cross-vertical auth bleed (60% FT, EXPLORE needed)** — confirm production TLD separation is sufficient; decide on shared vs separate identity model

### Quick Wins (Any Vertical, Minimal Effort)
1. M-2 — Referral code vertical scope (1 line)
2. M-4 — Activity feed vertical filter (1 filter)
3. ~~M-1 — Cron error tracing~~ RETRACTED (already done)
4. M-8 — Tier expiry notification type (rename)
5. ~~L-8 — Small order fee explanation~~ SKIPPED (by design)

---

## USER DECISIONS (Session 45 Review)

### RETRACTED (not real bugs)
- **C-1**: External payment UX — working correctly, two-step confirm→fulfill flow exists
- **M-1**: Cron error tracing — all active crons already have `withErrorTracing()`
- **L-6**: Cart toast — exists in `AddToCartButton.tsx` line 138

### APPROVED FOR FIX
- **C-2**: Integration tests
- **C-3**: Market Box RPC auto-refund
- **H-1**: Vendor onboarding success state (celebration + next-step guidance)
- **H-3**: Email FROM per-vertical
- **M-2**: Referral code vertical scope (1 line)
- **M-4**: Activity feed vertical filter + investigate admin UI

### SKIPPED (by design or deferred)
- **H-2**: Pre-pickup reminders — skip
- **H-6**: Subscription auto-renewal — by design
- **M-7**: Bulk listing ops — skip for now
- **M-9**: Vendor-buyer messaging — by design
- **L-1**: Service worker offline — skip
- **L-4**: Schedule editing — skip
- **L-8**: Small order fee — by design
- **L-9**: Pickup confirmation window — skip

### RESEARCH PROVIDED (awaiting user decision)
- **C-4**: Rate limiter — keep current for beta, add Upstash when >100 DAU
- **C-5**: Vertical param validation — middleware allowlist recommended over per-route fix
- **H-4**: Reviews display — rating system exists, need buyer-facing display on browse cards + listing detail
- **H-5**: Partial fulfillment — line-item reject (Option A) recommended
- **H-7**: Timezone — short format " CT"/" ET" (3 chars) won't cause wrapping
- **H-8**: Sentry — free tier (5K errors/mo) is high-ROI, 15-min setup
- **M-2b**: Cross-auth — production TLD separation handles it, no code change needed for beta
- **M-3**: profile_data validation — easy but low priority (defense-in-depth, no UX impact)
- **M-5**: Vendor earnings — plan for analytics dashboard with payment method breakdown
- **M-6**: Listing pause — exists in edit form dropdown, suggest adding one-click toggle button
- **M-8**: FM tiers are free verification levels (admin-granted), not paid subscriptions like FT
- **M-10**: Cart inventory — correctly decrements at checkout, not add-to-cart (verified)
- **M-11**: Search — PostgreSQL FTS + client Fuse.js recommended ($0), upgrade to Meilisearch at scale
- **M-12**: Admin role checking — low priority, fix organically when touching routes
- **L-2**: Data retention — 90-day error_logs, 60-day read notifications, 30-day activity events
- **L-3**: Allergen filter — remove checkbox + filter logic from browse, keep vendor data entry + detail page warning
- **L-5**: Out-of-stock items — browse query has no quantity filter; recommend adding `.gt('quantity', 0)`
- **L-7**: Loading states — 5+ patterns across 30+ files, no shared component; cosmetic issue
- **L-10**: Quality alerts — add direct fix links, bulk resolve, severity colors, weekly digest
- **S-3**: QR pickup — client-side libraries, ~8-12 hours, no external service needed
- **S-4**: Offline PWA — 20-40 hours full, 4-6 hours for cache shell only; not recommended for beta
- **S-6**: Integration tests — Vitest + MSW for Stripe mocking; start with checkout + order lifecycle
- **S-7**: Upstash Redis — free tier (500K commands/mo) covers beta rate limiting; $10/mo at scale

*No code changes made — research only.*
