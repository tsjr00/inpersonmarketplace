# Session 62 — Independent Comprehensive Codebase Audit

**Date:** 2026-03-20
**Scope:** Full codebase audit — errors/conflicts, missing business rules, missing tests, high-value opportunities
**Method:** Systematic section-by-section deep dive with no reference to prior audit reports
**Areas Covered:** Auth, pricing, checkout/Stripe, order lifecycle, notifications, cron jobs, vendor onboarding, events/catering, market boxes, browse/location, cart/inventory, test suite, API security, code-DB alignment

---

## SECTION 1: ERRORS & CONFLICTS

### CRITICAL (Financial Impact / Data Integrity)

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| E-1 | **External payment orders don't deduct vendor fees** | `api/checkout/external/route.ts:276` | `vendor_payout_cents: itemSubtotal` gives vendor 100% — platform absorbs all fees. Stripe orders correctly deduct 6.5% + $0.15. Same item, different payout depending on payment method. |
| E-2 | **External payment vendor fees never recorded in ledger** | `api/checkout/external/route.ts:290-407` | `recordExternalPaymentFee()` exists in `vendor-fees.ts` but is never called. Fee balance is always $0, invoicing is broken for external orders. |
| E-3 | **Resolve-issue refund missing buyer fees** | `api/vendor/orders/[id]/resolve-issue/route.ts:138,163` | Refunds `subtotal_cents` only — buyer paid subtotal + 6.5% + prorated $0.15. Buyer loses $0.80+ per refund on a $10 item. |
| E-4 | **3 different refund calculation methods** | reject (correct), buyer-cancel (correct), resolve-issue (wrong), cron-expire (correct) | Same business operation (refund) uses inconsistent math across 4 code paths. |
| E-5 | **Admin approval sets legacy tier names** | `api/admin/vendors/[id]/approve/route.ts:85` | Sets `tier = 'basic'` (FT) or `'standard'` (FM) instead of unified `'free'`. Every new vendor gets a tier name that doesn't match the Free/Pro/Boss system. |
| E-6 | **Market box missed pickup doesn't process refund** | `api/cron/expire-orders/route.ts:968-1005` | Marks pickup as `'missed'` but no financial processing. Regular order no-shows DO trigger refunds (lines 655-718). Financial inconsistency. |

### HIGH (Functional / Security)

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| E-7 | **Admin can invite non-event-approved vendors to events** | `api/admin/events/[id]/invite/route.ts:97-108` | Query selects vendors by ID without `.eq('event_approved', true)`. Admin could invite a vendor who hasn't passed event readiness. |
| E-8 | **Cart validation endpoints missing vertical scope** | `api/cart/validate/route.ts` GET + POST | Neither endpoint validates that cart items match the requested vertical. Cross-vertical cart could pass validation. |
| E-9 | **Market box add-to-cart doesn't validate vertical** | `api/cart/items/route.ts:299-327` | FM cart can receive FT market box offering. No `offering.vertical_id == request.vertical` check. |
| E-10 | **Admin vendor table tier filter uses legacy names** | `admin/vendors/VendorsTableClient.tsx:223-225` | Dropdown offers Standard/Premium/Featured — names that no longer exist in DB after tier unification. Filtering returns zero results. |
| E-11 | **Admin vendor tier badge colors reference legacy names** | `admin/vendors/VendorsTableClient.tsx:352-356` | Colors keyed on 'premium'/'featured'. Pro/Boss vendors show grey fallback instead of blue/yellow. |

### MEDIUM (Edge Cases / UX)

| # | Finding | Location | Impact |
|---|---------|----------|--------|
| E-12 | **Migration 085 not in migration log** | `supabase/migrations/20260316_085_*.sql` | `ensure_user_profile` RPC used by login page may not be applied to all environments. Login for users without profiles would silently fail. |
| E-13 | **Resolve-issue restores inventory after fulfillment** | `resolve-issue/route.ts:146-149` | Calls restoreInventory without checking if buyer already has the item (status='fulfilled'). Inventory inflated incorrectly. |
| E-14 | **Order expiration cron doesn't notify vendor** | `cron/expire-orders/route.ts:235-251` | Phase 1 (vendor didn't confirm) notifies buyer only. Vendor doesn't know the order disappeared. |
| E-15 | **Event requests accept past dates** | `api/event-requests/route.ts` | No validation that `event_date >= today`. Past-date events can be created. |
| E-16 | **Stale notification dedup key uses unreliable data** | `cron/expire-orders/route.ts:805` | Dedup set built from `n.data?.orderItemId` which could be undefined if notification data is corrupted. |
| E-17 | **External buyer flat fee constant undocumented** | `settlement/route.ts:280` | Uses `EXTERNAL_BUYER_FEE_FIXED_CENTS` — not in pricing.ts, no business rule. |
| E-18 | **JSONB race condition on document upload** | `onboarding/category-documents, coi, documents` | Read→modify→write pattern without row locking. Concurrent uploads could lose a document. |
| E-19 | **Cart remove endpoint is a stub** | `api/cart/remove/route.ts:5-18` | Returns `{ success: true }` without removing anything. Dead code. |
| E-20 | **20+ vendor notification titles hardcoded in English** | `notifications/types.ts:325-642` | Vendor notifications use string literals while buyer notifications use `t()` for i18n. Breaks multi-language for vendors. |
| E-21 | **Timezone issues in cron date calculations** | `expire-orders:919-921,995` | Uses `new Date().setHours(h-2)` which on UTC Vercel can cross midnight. `toLocaleDateString()` formats in UTC, potentially showing wrong day. |
| E-22 | **Silent geocode failure on browse** | Browse page + geocode API | If `?zip=` geocoding fails, browse silently falls back to cookie location. User thinks they see results for entered ZIP. |
| E-23 | **Tip split ambiguity** | `checkout/session/route.ts:541-547` | Caps vendor tip at `subtotalCents * tipPercentage / 100`. If buyer tips flat amount larger than percentage cap, platform keeps the difference. |
| E-24 | **`/api/trucks/where-today` missing rate limit** | `api/trucks/where-today/route.ts` | Public endpoint with no rate limiting. Low risk (read-only) but should be added. |
| E-25 | **Duplicate `UserRole` type definition** | `auth/roles.ts:9` and `auth/admin.ts:5` | Same type defined in two places. Could drift. |
| E-26 | **FT doc type validation loose** | `onboarding/category-documents/route.ts:66` | Checks `docType !== category` but doesn't validate against `FOOD_TRUCK_DOC_TYPES` list independently. |

---

## SECTION 2: MISSING BUSINESS RULES

These are business functions in code that lack documented rules to prevent future sessions from breaking them.

| # | Business Function | What's Missing | Risk |
|---|-------------------|----------------|------|
| BR-1 | **External payment fee structure** | 3.5% vendor fee defined in `vendor-fees.ts:15` — not in pricing.ts, no documented reason for 6.5% vs 3.5% split. No rule specifying when/why external fees differ from Stripe. | Future session could "fix" this to 6.5% without understanding the intentional difference. |
| BR-2 | **Refund amount per cancellation path** | No documented rule for: reject=100%, buyer-cancel=X%, resolve-issue=Y%, cron-expire=Z%. Each path calculates independently. | Already caused E-3 (resolve-issue using wrong amount). |
| BR-3 | **Tip allocation between vendor and platform** | No documented rule for how tip is split. Code caps vendor tip at `subtotalCents * tipPercentage / 100` with remainder going to platform. | Future session could change tip logic without understanding the split intent. |
| BR-4 | **Event approval prerequisites** | Schema says COI is "hard gate for events" but code doesn't enforce during invite. Event-approved flag exists but no documented criteria for granting it. | Admin could approve a vendor for events who doesn't have proper insurance. |
| BR-5 | **Market box missed pickup financial handling** | No rule for whether missed pickups warrant refund, credit, or nothing. Regular orders have clear expiration/refund logic; market boxes don't. | Financial inconsistency between product types. |
| BR-6 | **Trial tier assignment** | Code assigns 'basic' (FT) or 'standard' (FM) as trial tiers — but unified system only has 'free'. No rule specifying what tier a trial vendor should get. | Currently broken (E-5). |
| BR-7 | **Cancellation fee allocation** | When buyer cancels after vendor confirmed, vendor gets a fee share. No documented percentage or rule. | Future session could change the split without understanding the business intent. |
| BR-8 | **Event headcount range (10-5000)** | Hardcoded in event request validation. No documented justification for minimum or maximum. | Could be changed without understanding why the range was chosen. |
| BR-9 | **Cross-vertical cart isolation** | No documented rule preventing FM items + FT items in same cart. Code partially enforces via cart creation but not validation. | Cross-vertical orders could slip through if validation code changes. |
| BR-10 | **Radius persistence behavior** | Radius stored in cookie only (not profile). No documented decision on whether this is session-state or persistent preference. | Future session might "fix" by persisting to profile, changing user experience. |

---

## SECTION 3: MISSING TESTS

### Critical Test Gaps (Zero Coverage)

| # | What's Untested | Why It Matters |
|---|-----------------|----------------|
| T-1 | **Event system lifecycle** | Zero tests for invites, RSVPs, settlement, cancellation, capacity. Entire feature is unprotected. |
| T-2 | **Refund calculation across all paths** | 4 refund paths with different amounts. Already has a bug (E-3). No test would catch it. |
| T-3 | **Tip splitting logic** | No test for how tip is divided between vendor and platform. Business rule undocumented. |
| T-4 | **Cart cross-vertical isolation** | No test preventing FM + FT items in same cart. |
| T-5 | **Market box payout lifecycle** | Subscription integration tests exist but have many `.todo()` placeholders. No test for skip-refund, cancellation-refund, or missed-pickup handling. |
| T-6 | **Concurrent order race conditions** | No test for two buyers trying to buy last item simultaneously. Atomic decrement is the safety net but untested. |
| T-7 | **External payment fee calculation vs Stripe** | Existing test validates external buyer fee = 6.5% (correct) but doesn't compare with Stripe path side-by-side. Doesn't test that vendor gets proper deduction. |
| T-8 | **Order status transition state machine** | Tests verify valid transitions exist but NOT via API routes. No test for route handlers performing transitions. |
| T-9 | **Admin-only endpoint access control** | Tests verify role constants exist but no test that admin endpoints reject non-admin users. |
| T-10 | **Trial system lifecycle** | No test for trial expiry cron, grace period enforcement, or trial → paid conversion. |

### Partially Covered (Has Tests But Gaps)

| # | What's Partially Tested | What's Missing |
|---|-------------------------|----------------|
| T-11 | **Notification channel filtering by tier** | Tests verify tier-channel mapping constants but no integration test that sendNotification actually filters by tier. |
| T-12 | **Vendor tier limits** | Limits tested for free/pro/boss constants. No test for DB trigger `enforce_listing_tier_limit()` matching code. |
| T-13 | **Subscription lifecycle** | Integration tests created but many `.todo()` markers. No auto-renewal test, no cancellation-refund proration test. |
| T-14 | **Stripe idempotency keys** | Tests reference key format but don't verify determinism (same inputs = same key) or uniqueness. |

---

## SECTION 4: HIGH-VALUE OPPORTUNITIES

### Opportunity 1: Buyer Interest Geographic Intelligence Dashboard

**Current state:** `buyer_interests` table (migration 088) captures demand signals — email, phone, zip code from buyers who visit browse pages with zero results. Data is collected but completely invisible.

**Value:** This is your vendor recruitment intelligence. Every row says "a real buyer wanted to buy from [ZIP] but no vendors are there." This data could:
- Identify underserved zip codes by demand density
- Provide sales ammunition when recruiting vendors ("We have 47 buyers in your area looking for food trucks")
- Create automated outreach ("You're the first vendor in [city] — 23 buyers are waiting")
- Generate geographic heatmaps for expansion planning

**What's needed:** Admin dashboard page showing buyer interests by vertical, sortable by zip/count/date. Export button for CSV. Alert when any zip hits 5+ interests.

**Estimated impact:** Directly accelerates vendor acquisition — the hardest part of a marketplace.

---

### Opportunity 2: Vendor Quality System Activation

**Current state:** Nightly cron generates quality findings (5 types: schedule_conflict, low_stock_event, price_anomaly, ghost_listing, inventory_velocity). API routes exist for both vendor and admin to read findings. But NO UI component displays them anywhere.

**Value:** This is a fully built quality engine with zero visibility. Activating it would:
- Catch ghost listings (published but no inventory) before buyers see them
- Alert vendors to schedule conflicts before they double-book
- Surface low-stock items before events (preventing buyer disappointment)
- Provide admin with quality oversight without manual auditing

**What's needed:** Vendor dashboard card showing top 3 action-required findings with dismiss/fix buttons. Admin page showing all active findings sortable by severity.

**Estimated impact:** Reduces buyer frustration from stale listings, improves vendor operations, reduces admin support burden.

---

### Opportunity 3: Trial-to-Paid Conversion Funnel

**Current state:** Trial system exists (90 days, grace 14 days, cron handles expiry) but vendors have zero awareness of their trial status. No dashboard banner, no upgrade urgency, no "days remaining" indicator. Vendor discovers trial expired only when listings get auto-unpublished.

**Value:** Trial-to-paid conversion is the primary revenue lever for vendor subscriptions. Without awareness:
- Vendors are surprised by trial expiry (bad experience, churn risk)
- No urgency drives upgrade decisions
- Admin has no visibility into trial cohorts or conversion rates

**What's needed:**
- Vendor dashboard banner: "Day X of 90 — Upgrade to keep your listings live"
- Upgrade page trial context: "Your trial includes Pro features. Upgrade to keep them."
- Auto-notification 7 days before expiry (in-app + email)
- Admin trial cohort view: which vendors expire when, bulk outreach tools

**Estimated impact:** Direct revenue impact. Every converted trial = $25-50/month recurring.

---

### Opportunity 4: Vendor Leads Management UI

**Current state:** Vendor lead capture form works (`/api/vendor-leads`), stores leads in `vendor_leads` table with status tracking, sends admin email. But admin has no management interface — leads are handled via email and manual DB updates.

**Value:** Pre-launch leads are the warmest pipeline. Without a management UI:
- No tracking of follow-up status
- No lead scoring (demo-interested leads get same treatment as casual inquiries)
- No automated follow-up sequences
- No conversion tracking (lead → signed-up vendor)

**What's needed:** Admin leads page with sortable table, status dropdown (new/contacted/converted), one-click "send demo link" button, filter by vertical, auto-flag "hot leads" (interested_in_demo=true).

**Estimated impact:** Reduces lead-to-vendor conversion time, prevents leads from going cold.

---

## PRIORITIZED ACTION PLAN

### Tier 1 — Fix Now (Financial / Data Integrity)

1. **Fix E-5: Admin approval tier assignment** — Change `'basic'`/`'standard'` to `'free'` in approve route. Every new vendor is getting the wrong tier.
2. **Fix E-3/E-4: Standardize refund calculations** — Create a single `calculateRefundAmount()` function used by all 4 refund paths. Document the business rule.
3. **Fix E-1/E-2: External payment vendor fee handling** — Either deduct vendor fees and record in ledger, or document why external orders are fee-free. Current state is silently wrong.
4. **Fix E-6: Market box missed pickup financials** — Decide on business rule (refund? credit? nothing?) and implement.

### Tier 2 — Add Rules & Tests (Regression Prevention)

5. **Document BR-1 through BR-10** — Write business rules for all 10 undocumented areas.
6. **Add T-1: Event system tests** — Minimum: invite validation, response flow, settlement calculation.
7. **Add T-2: Refund calculation tests** — Test all 4 paths against documented business rules.
8. **Add T-4: Cart cross-vertical isolation test** — Prevent mixed-vertical carts.
9. **Fix E-7: Add event_approved check on invite** — Prevent inviting non-approved vendors.
10. **Fix E-8/E-9: Add vertical validation to cart** — Prevent cross-vertical leakage.

### Tier 3 — Activate Value (Revenue / Growth)

11. **Opportunity 1: Buyer interest dashboard** — Surface geographic demand intelligence.
12. **Opportunity 3: Trial conversion funnel** — Add trial awareness to vendor dashboard + upgrade page.
13. **Opportunity 2: Quality findings visibility** — Surface findings to vendors and admins.
14. **Opportunity 4: Leads management UI** — CRM-like interface for vendor lead tracking.

### Tier 4 — Polish (Admin UX / Minor)

15. **Fix E-10/E-11: Admin vendor table tier names** — Update to Free/Pro/Boss naming + colors.
16. **Fix E-12: Verify migration 085 applied** — Confirm `ensure_user_profile` RPC exists in all environments.
17. **Fix E-20: Vendor notification i18n** — Add translation keys for vendor-facing notifications.
18. **Fix E-19: Remove dead cart/remove endpoint** — Delete the stub.

---

## STATISTICS

- **Total findings:** 55
- **Critical errors (financial):** 6
- **High errors (functional/security):** 5
- **Medium errors (edge cases):** 15
- **Missing business rules:** 10
- **Missing test categories:** 14
- **High-value opportunities:** 4
- **Areas audited:** 10 (auth, pricing, checkout/Stripe, order lifecycle, notifications/cron, vendor onboarding, events, market boxes, browse/location/cart, test suite, API security, code-DB alignment)
