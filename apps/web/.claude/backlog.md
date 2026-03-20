# Backlog

Last updated: 2026-03-20

## Priority 1 — From Session 62 (Today)

### Notifications & Communication
- [ ] **Confirmation email pickup instructions** — "Order Ready" notification should include: what to do on arrival (show order screen to vendor), both buyer+vendor must confirm handoff, direct link to specific order detail page (the one with big green header). Currently just says "your order is ready for pickup."
- [ ] **Inventory change notifications (design needed)** — Notify buyers when favorited vendors restock. Design: favorites-only, 15-30 min batch window after last change, max 1 per vendor per buyer per day. Approach: `inventory_updated_at` on vendor_profiles, cron scans for recent changes, batches into single notification per vendor-buyer pair.
- [ ] **Vendor expiration notification** — Cron Phase 1 notifies buyer when vendor fails to confirm, but doesn't notify vendor. Vendor should know the order expired.
- [ ] **Vendor notification titles i18n** — 20+ vendor notifications use hardcoded English strings. Buyer notifications use `t()`. Should be consistent.

### Tests — Protect Revenue & Recent Fixes
- [ ] **T-7: External payment fee flow test** — HIGHEST PRIORITY. User said "if it breaks we lose money." Test the full deferred fee flow: checkout → confirm-external-payment → fee recorded in ledger → cash path at fulfill → balance accumulates → auto-deduction caps at 50%.
- [ ] **T-2: Refund calculation consistency test** — All 4 refund paths (reject, buyer-cancel, resolve-issue, cron-expire) must produce identical amounts for the same item. Already had a real bug (E-3, fixed this session).
- [ ] **T-11: Inventory restore vertical awareness test** — FT fulfilled items should NOT restore, FM fulfilled items should, non-fulfilled items always restore. New logic from this session, zero protection.
- [ ] **T-3: Tip split protective test** — Confirmed correct but easy to accidentally break. Vendor tip = min(tipAmount, subtotal * tipPercent / 100), platform tip = remainder, sum = original tip.

### Business Rules to Document
- [ ] **BR-5: Market box missed pickup = no refund** — User confirmed: 4-week prepaid commitment. Add to decisions.md.
- [ ] **BR-6: Trial tier = 'free'** — Fixed code this session. Document the decision.
- [ ] **BR-11: FT fulfilled items don't restore inventory** — Implemented this session. Document so it's not reverted.
- [ ] **BR-4: Event approval prerequisites** — What criteria grants event_approved? Is COI required?
- [ ] **BR-7: Cancellation fee allocation** — No documented percentage for vendor's share.
- [ ] **BR-8: Event headcount range (10-5000)** — Hardcoded, no justification documented.
- [ ] **BR-9: Cross-vertical cart isolation** — No documented rule. Tied to E-8/E-9 investigation.
- [ ] **BR-10: Radius persistence behavior** — Cookie-only vs profile.

### Investigation Needed
- [ ] **E-8/E-9: Cart cross-vertical isolation** — Cart validation doesn't check vertical match. Needs careful exploration before changing. Can cross-vertical carts actually be created through the UI?
- [ ] **E-21: Timezone centralization** — Cron date calculations use raw UTC. Need centralized timezone utility. Design discussion needed.
- [ ] **E-22: Geocode/browse silent failure** — If zip geocoding fails, browse silently falls back to cookie location. zip_codes table populated (~33,800) so DB lookup should hit, but need to investigate actual user flow.
- [ ] **Where-today schedule mismatch** — FM where-today shows schedules that don't match vendor published schedules. Need specific example to diagnose (from Session 61).

### Small Fixes
- [ ] **E-25: UserRole type dedup** — Defined in both `auth/roles.ts` and `auth/admin.ts`. Simple fix: import from roles.ts.
- [ ] **E-19: Cart remove endpoint stub** — `api/cart/remove/route.ts` is dead code. No callers. Safe to delete.

## Priority 1 — From Session 61 (Carried Forward)

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
- [ ] **Order notifications → orders page (correct). Non-order notifications → notifications page.** Currently ALL notification taps go to the orders page regardless of notification type. Check `actionUrl` in notification type registry.

### Translation Gaps
- [ ] **Page-by-page translation audit** — Many items not translated to Spanish. Known gaps: "View Menu" button, schedule days/times, payment type pill labels, category names, "Event Catering" label + subtext.

### Order Lifecycle Monitoring
- [x] **Fix "active orders" count on dashboard** — FIXED Session 62. Root cause: `atomic_complete_order_if_ready()` was broken since migration 011 (boolean/integer mismatch). Fixed in migration 092. DB trigger 093 auto-cancels orders when all items cancelled. One-time data cleanup applied to all 3 envs.
- [ ] **Admin dashboard: stuck orders card** — Show orders older than 24hrs still in `paid` or `confirmed` status.
- [ ] **Integration test: full order lifecycle** — Test order transitions pending → paid → confirmed → ready → completed. Would have caught the boolean/integer bug.
- [x] **Backfill stuck orders** — DONE Session 62. One-time SQL cleanup applied to all 3 envs.

### Event System
- [ ] **Event Phase 1 completion** — Per-event listing connections, event page lifecycle
- [ ] **Event Phase 2** — Wave-based ordering system
- [ ] **Stripe payouts_enabled flag sync** — Investigate why DB flags don't stay current after vendor completes Stripe setup

### Stripe Cleanup
- [ ] **Delete old pebble02 webhook endpoint** — `https://pebble02.bubbleapps.io/api/1.1/wf/invoice_paid` in Stripe Dashboard → Developers → Webhooks. Old Bubble.io app, generates error emails.

## Priority 2 — Soon

- [ ] **Browse page: consolidate filters into single 3-dot menu** — Three dropdowns intimidate new users. Replace with one "Filters" button. Priority: high — conversion issue.
- [ ] **Playwright automated smoke tests** — See detailed plan below.
- [ ] **Test push notifications on staging** — Verify web push end-to-end.
- [ ] **Stripe live mode activation** — Switch from test to live keys when ready.

## Priority 2.5 — Session 62 Audit Opportunities

- [ ] **Opportunity 1: Buyer Interest Geographic Intelligence Dashboard** — buyer_interests table captures demand signals. Data collected, never surfaced. Admin page showing interests by zip/count/date + CSV export.
- [ ] **Opportunity 2: Vendor Quality System Activation** — Nightly cron generates quality findings. API routes exist. Zero UI visibility. Vendor dashboard card + admin findings page.
- [ ] **Opportunity 3: Trial-to-Paid Conversion Funnel** — Trial system exists, zero vendor awareness. Dashboard banner "Day X of 90", upgrade page context, 7-day pre-expiry notification.
- [ ] **Opportunity 4: Vendor Leads Management UI** — Lead capture works, no management interface. Admin leads page with status tracking, follow-up, demo scheduling.

## Priority 2.6 — Documentation Deep Dives
- [ ] **Area-specific deep dive series** — Internal reference docs across full stack. Topics:
  1. Statuses — Order item, vendor, market, payout lifecycle maps
  2. Dates & Times — Pickup windows, cutoff hours, timezone handling
  3. Locations — Geocoding, Haversine, cookies, lat/lng
  4. Hours/Schedules — Market schedules, vendor availability, conflicts
  5. Tiers & Limits — FM/FT structures, trial system, feature gating
  6. Financial Flows — Pricing, fees, tips, payouts, refunds, external payments
  7. Auth & Access — Login, signup, vertical gate, admin, RLS
  8. Device/Browser — PWA, push, mobile quirks, responsive, offline

## Priority 2.7 — Performance & Infrastructure
- [ ] **AC-4: Optimize heavy RLS policies on markets table** — 2 nested EXISTS subqueries per row. Migration required.
- [ ] **L4: Zod input validation on API routes** — Gradually add Zod schemas.
- [ ] **L6: SMS send logic when push enabled** — Blocked by A2P 10DLC carrier approval.
- [ ] **L2: External cron monitoring** — Deferred post-launch.

## Priority 3 — When Time Allows
- [ ] **Geographic intelligence feature** — Plan at `.claude/geographic_intelligence_plan.md`
- [ ] **A2P 10DLC SMS approval** — Waiting on carrier

## Post-Launch — Growth & Expansion
- [ ] **Ecosystem Partner Platform** — Full design at `docs/CC_reference_data/Ecosystem_Partner_Platform_Design.md`
- [ ] **Growth Ambassador Program** — Design at `docs/CC_reference_data/Growth_Partner_System_Design.md`
- [ ] **Geographic Expansion Planning** — Workbook at `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx`

## Icebox
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

#### What This Does NOT Cover
- Production testing (intentionally excluded — too risky)
- Stripe payment completion (their iframe blocks automation)
- SMS/push notification delivery (external services, can't automate without mocking)
- Admin flows (would require admin test account — unnecessary risk)

## Completed (Archive)

| Date | Item |
|------|------|
| 2026-03-20 | Active orders count fix (migration 092 + trigger 093 + data cleanup) |
| 2026-03-20 | Admin approval tier names (was basic/standard, now free) |
| 2026-03-20 | Admin vendor/listing table tier filter + badge colors |
| 2026-03-20 | Event invite event_approved check |
| 2026-03-20 | Event request past date validation |
| 2026-03-20 | JSONB race condition on doc upload |
| 2026-03-20 | Where-today rate limit |
| 2026-03-20 | Resolve-issue refund math (now includes buyer fees) |
| 2026-03-20 | Inventory restore vertical awareness (FT fulfilled = no restore) |
| 2026-03-20 | Migration 085 applied (lazy profile + role enums) |
| 2026-03-20 | External payment safety net (buyer cancel + vendor non-payment) |
| 2026-03-20 | Vendor resolve-issue UI on orders page |
| 2026-03-20 | Admin order issues page |
| 2026-03-20 | Listing edit no longer demotes published to draft |
| 2026-03-20 | Where-today FM text (header, subtitle, count labels) |
| 2026-03-20 | Where-today zip persistence (reads from API, not cookie) |
| 2026-03-20 | Cancelled order banner — no refund text for external payments |
| 2026-03-04 | Upstash Redis rate limiting |
| 2026-03-04 | CI lint fixes (ESLint errors) |
| 2026-03-04 | Sentry setup (staging + production) |
| 2026-03-04 | Legal terms 3-tier system |
| 2026-03-04 | Production push (all infra) |
