# Backlog

Last updated: 2026-03-19

## Priority 1 — Next Session (from Session 61 testing)

### Buyer Dashboard & Orders
- [ ] **Fix "active orders" count on dashboard** — Currently counts all non-cancelled orders including fulfilled. Should only count pending, confirmed, ready. Fulfilled and cancelled should NOT be counted. This was fixed before but appears reverted.

### Buyer Premium Upgrade Page
- [ ] **Remove "access to market box subscriptions" from upgrade pitch** — No longer accurate; anyone can purchase market/chef box subscriptions regardless of tier.
- [ ] **Remove "Market Box Subscriptions Exclusive" heading** from upgrade page.
- [ ] **Rewrite premium buyer value proposition** — Focus on early access to listings (premium window). Messaging: "Get the items you want before non-premium members. Great for restaurants, food trucks, and anyone buying local in quantity." Remove "premium support" claim (we don't offer it). Keep premium badge — explain that vendors see a notation on orders from premium buyers, encouraging best-quality items for premium customers.

### Vendor Profile (FM)
- [ ] **"View Menu" → "View Products"** for FM vertical — FM vendors have products, not menus.
- [ ] **Hide "Free" tier badge** on vendor profile — showing "Free" hurts vendor credibility. Only show Pro/Boss badges (they add value). Free tier = no badge.
- [ ] **Show tier badge on FM vendor cards** — FT vendor cards show Pro/Boss badge but FM cards do not. Both should show paid tier badges on browse/discovery cards AND on the profile page.
- [ ] **Resize social buttons on vendor profile** — Reduce Facebook/Website button size ~10%. Desktop: name on first line, Event Approved + reviews on second line, Website + Facebook on third line (or same row as reviews). Mobile: wraps naturally. View Menu button should be the clear primary CTA.

### Notification Click Behavior
- [ ] **Order notifications → orders page (correct). Non-order notifications → notifications page.** Currently ALL notification taps go to the orders page regardless of notification type. Options to investigate: (1) Route based on notification type — order-related → orders, everything else → notifications page. (2) Route all to notifications page and let user navigate from there. (3) Deep-link order notifications to the specific order detail. Check `actionUrl` in notification type registry — each type already has an `actionUrl` function that may just need fixing.

### Translation Gaps
- [ ] **Page-by-page translation audit** — Many items not translated to Spanish on both verticals. Known gaps: "View Menu" button, schedule days/times, payment type pill labels (Venmo/Cash App/PayPal/Cash), category names (Dairy & Eggs, Produce, etc.), "Event Catering" label + subtext on vendor profile. Rule: all platform-generated text (not vendor-entered) should be translated. Add to near-term TODO for systematic review.

### Order Lifecycle Monitoring
- [ ] **Admin dashboard: stuck orders card** — Show orders older than 24hrs still in `paid` or `confirmed` status. These are likely stuck due to fulfillment issues. Simple count + list on admin dashboard.
- [ ] **Integration test: full order lifecycle** — Test that `atomic_complete_order_if_ready` works, and that an order transitions pending → paid → confirmed → ready → completed. Run against real DB. Would have caught the boolean/integer type mismatch in migration 011.
- [ ] **Backfill stuck orders** — Run `atomic_complete_order_if_ready()` against all orders in `paid`/`confirmed`/`ready` status where all items have both confirmations. One-time cleanup.

### Event System (continued from Session 61)
- [ ] **Event Phase 1 completion** — Per-event listing connections, event page lifecycle
- [ ] **Event Phase 2** — Wave-based ordering system
- [ ] **Stripe payouts_enabled flag sync** — Investigate why DB flags don't stay current after vendor completes Stripe setup

### Stripe Cleanup
- [ ] **Delete old pebble02 webhook endpoint** — `https://pebble02.bubbleapps.io/api/1.1/wf/invoice_paid` in Stripe Dashboard → Developers → Webhooks. Old Bubble.io app, generates error emails.

## Priority 1 — Previous (carried forward)
- [x] **FM free tier + tier restructure** — ALREADY DONE (migration 061, code, UI all in place). Confirmed 2026-03-05.
- [x] **Commit password validation fix** — DONE 2026-03-05 (commit `b7d4616`)

## Priority 2 — Soon
- [x] **Fix fulfill route: separate fulfillment from payout** — ALREADY FIXED: H-1 FIX in fulfill/route.ts:283-319. Item stays 'fulfilled', failed payout recorded for Phase 5 retry. Verified Session 55.
- [x] **Fix `atomic_decrement_inventory` overselling bug** — ALREADY FIXED: Migration 078. Now RAISE EXCEPTION on insufficient stock. Verified Session 55.
- [ ] **Playwright automated smoke tests** — See detailed implementation plan below
- [ ] **Test push notifications on staging** — Verify web push works end-to-end (subscribe → trigger → receive). Instructions drafted Session 49.
- [ ] **Stripe live mode activation** — Switch from test keys to live keys when ready for real payments
- [x] **Event readiness form: move success/error message next to submit button** — DONE Session 61.
- [ ] **Browse page: consolidate filters into single 3-dot menu** — Three separate dropdowns intimidate new users (confirmed by vendor demos). Replace with one "Filters" button (label + 3-dot icon in circle). Opens a popup with all filter groups in a single vertical list separated by thin lines. Groups: menu type (All / Daily Menu / Catering — pick one), sort, category, etc. Checkboxes with mutual exclusion rules within groups. Closes on submit. First impression becomes: radius search + one clean filter button. Priority: high — this is a conversion issue.
- [x] **Set Dev/Staging password policy** — DONE by user 2026-03-05

## Priority 2.5 — Documentation Deep Dives
- [ ] **Area-specific deep dive series** — Create a series of internal reference docs that explain how specific domains work across the full stack (DB → API → UI → cron). Each deep dive follows the same template: current state audit, business rules, data flow, edge cases, and improvement opportunities. Topics:
  1. **Statuses** — Order item statuses, vendor statuses, market statuses, payout statuses. Full lifecycle maps.
  2. **Dates & Times** — Pickup windows, cutoff hours, event dates, timezone handling, cron timing.
  3. **Locations** — Geocoding, Haversine filtering, user location cookies, market lat/lng, vendor service areas.
  4. **Hours/Schedules** — Market schedules, vendor availability, pickup hours, schedule conflicts.
  5. **Tiers & Limits** — FM/FT tier structures, vendor-limits.ts, trial system, feature gating.
  6. **Financial Flows** — Pricing, fees, tips, payouts, refunds, Stripe Connect, external payments.
  7. **Auth & Access** — Login, signup, vertical gate, admin checks, RLS, service client usage.
  8. **Device/Browser** — PWA, push notifications, mobile quirks, responsive patterns, offline.
  - Process: For each topic, Claude reads all relevant code, writes findings to a `.claude/deep-dive-[topic].md` file, then consolidates into a reference doc in `docs/`.

## Priority 2.6 — Performance Audit Deferred Items (Session 59)

All items below require rules & tests written BEFORE implementation. See `apps/web/.claude/performance_audit.md` for full details.

- [x] **Backlog #1: ME-6** — MOOT: `src/lib/db/listings.ts` is dead code (zero imports). `vendors.ts` and `verticals.ts` don't exist. File should be deleted. Verified 2026-03-16.
- [ ] **Backlog #2: AC-4 — Optimize heavy RLS policies on markets table** — Markets SELECT policy has 2 nested EXISTS subqueries checking order_items+orders for every row. Write rules defining expected policy behavior, write tests verifying access patterns, then optimize the policy. Migration required. User approved 2026-03-16.
- [x] **Backlog #3: AC-3 — PostGIS** — ALREADY DONE: PostGIS extension enabled, `get_nearby_zip_codes` uses `ST_DWithin()`. Verified 2026-03-16.

## Priority 2.7 — Session 55 Deferred Items
- [ ] **L4: Zod input validation on API routes** — Currently only vendor signup uses Zod. Other routes use manual checks. Gradually add Zod schemas to remaining API routes for consistent validation. Low priority, do incrementally.
- [ ] **L6: SMS send logic when push enabled** — Verify SMS-skip-when-push logic works correctly in service.ts. A2P 10DLC still pending carrier approval, so this is blocked anyway.
- [ ] **L2: External cron monitoring** — Integrate free monitoring service (Cronitor/Better Uptime) for cron heartbeat. Deferred post-launch.
- [x] **M4: Availability system consolidation** — DONE: commit `3e56fcf` (Session 56). Dead JS availability system deleted, consolidated on SQL RPC. 47 functional tests added.
- [x] **Sales tax tracking** — DONE: commit `29faa65` (Session 54). is_taxable flag, help article, vendor tax report.

## Priority 3 — When Time Allows
- [ ] **Geographic intelligence feature** — Plan exists at `.claude/geographic_intelligence_plan.md`
- [ ] **A2P 10DLC SMS approval** — Waiting on carrier, nothing actionable until approved

## Post-Launch — Growth & Expansion
- [ ] **Ecosystem Partner Platform** (`partners.farmersmarketing.app`) — Give ag nonprofits, market associations, and advocacy orgs (FARFA, FMC, state FM associations, food truck associations) a professional profile page, event calendar, resource hosting, and analytics on our platform — free. Same app, same DB, same deployment ($0 incremental infra cost). They share their presence to their networks; we get credibility transfer and organic vendor pipeline. Phase 1 = profiles + events + resources + directory (~3-4 sessions). Full design: `docs/CC_reference_data/Ecosystem_Partner_Platform_Design.md`
- [ ] **Growth Ambassador Program** — Incentivized referral system for non-vendor partners (community connectors, influencers) who earn signup bonuses + time-limited revenue share for vendors they bring on. Complements ecosystem play for FT vertical where no central gatekeepers exist. Design: `docs/CC_reference_data/Growth_Partner_System_Design.md`
- [ ] **Geographic Expansion Planning** — Use `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx` workbook to score and prioritize markets. Algorithm design: `docs/CC_reference_data/Geographic_Expansion_Algorithm.md`

## Icebox — Ideas for Later
- [ ] **Events feature Phase 5+** — Ticketing, capacity management, recurring events
- [ ] **Advanced vendor analytics** — Sales trends, customer demographics, peak hours

---

## Detailed Plans

### Playwright Automated Smoke Tests

**Goal:** Automate Tier 1 (targeted) and Tier 2 (critical path) smoke tests so routine deployments don't require manual verification. Estimated effort: 1 session.

#### Security Implementation Checklist

**Test Account Setup:**
- [ ] Create a dedicated test account in Staging Supabase (e.g., `smoke-test-[random]@815enterprises.com`)
- [ ] Give it **buyer-only** permissions — no vendor, no admin access
- [ ] Use a strong, unique password (generated, not reused)
- [ ] Do NOT create a test account on Production — tests only run against staging
- [ ] Document the test account email in the decision log (not the password)

**Credential Storage:**
- [ ] Store `PLAYWRIGHT_TEST_EMAIL` and `PLAYWRIGHT_TEST_PASSWORD` as GitHub Actions encrypted secrets
- [ ] Also store in `.env.local` for local test runs (already in `.gitignore`)
- [ ] NEVER commit credentials to code, test files, or config files
- [ ] Add `PLAYWRIGHT_TEST_EMAIL` and `PLAYWRIGHT_TEST_PASSWORD` to `.env.example` as placeholders

**Test Configuration Security:**
- [ ] Hardcode staging URL in `playwright.config.ts` — never production
- [ ] Add a domain guard that aborts if base URL contains `farmersmarketing.app` or `foodtruckn.app` (production domains)
- [ ] Set `baseURL` from env var `PLAYWRIGHT_BASE_URL` with staging as default
- [ ] Add `playwright.config.ts` comment: "NEVER set baseURL to production"

**Test Design (Read-Only Where Possible):**
- [ ] Page load tests — no data mutation, just verify pages render
- [ ] Login test — logs in, verifies dashboard loads, logs out
- [ ] Browse test — verifies listings appear, clicks one, verifies detail page
- [ ] Cart test — adds item, verifies cart page, does NOT submit order
- [ ] Checkout test — navigates to checkout, verifies Stripe elements load, does NOT complete payment
- [ ] If any test creates data, add cleanup in `afterEach` or `afterAll`

**CI Integration:**
- [ ] Add Playwright step to GitHub Actions AFTER build step
- [ ] Only runs on `staging` branch pushes (not on main/production)
- [ ] If tests fail, CI fails — blocks awareness, not deployment (staging deploys via Vercel regardless)
- [ ] Store test artifacts (screenshots on failure) as GitHub Actions artifacts for debugging
- [ ] Set timeout of 60 seconds per test to prevent hanging

**File Structure:**
```
apps/web/
├── e2e/
│   ├── smoke.spec.ts          # Tier 2 critical path tests
│   ├── auth.spec.ts           # Login/logout/signup page tests
│   ├── browse.spec.ts         # Browse + listing detail tests
│   └── fixtures/
│       └── test-account.ts    # Reads credentials from env vars
├── playwright.config.ts       # Config with staging URL + domain guard
└── package.json               # Add @playwright/test devDependency
```

**Ongoing Maintenance:**
- [ ] When new pages/features are added, add corresponding smoke test
- [ ] Rotate test account password quarterly (update GitHub secret + .env.local)
- [ ] Review test results in CI — flaky tests should be fixed or marked, not ignored

#### What This Does NOT Cover
- Production testing (intentionally excluded — too risky)
- Stripe payment completion (their iframe blocks automation)
- SMS/push notification delivery (external services, can't automate without mocking)
- Admin flows (would require admin test account — unnecessary risk)

## Completed (Archive)
<!-- Move completed items here with date -->
| Date | Item |
|------|------|
| 2026-03-04 | Upstash Redis rate limiting |
| 2026-03-04 | CI lint fixes (ESLint errors) |
| 2026-03-04 | Sentry setup (staging + production) |
| 2026-03-04 | Legal terms 3-tier system |
| 2026-03-04 | Production push (all infra) |
