# 21 — Shared Library Reference

<!-- map-stamp: domain=lib-reference; verified=2026-09-05; commit=de9baab6 -->
<!-- lib/loyalty/offers.ts (B1 + punch, 2026-09-04): pure VIP perk math + config parsers — spend_threshold (D1: 5–25% / $15–$200) and punch_card (D2: 3–12 visits → 10–100% off min-$X, or $1–$50 off; 100% waives the min). lib/loyalty/offers-checkout.ts: computeCartDiscounts, the ONE discount engine (VIP-only, best single perk, no stacking) + punchState (punches = fulfilled qualifying orders since max(VIP added_at, last redemption via order offer_id)). See 10_Checkout_Payments item 8. -->
<!-- map-claims
src/lib/errors/**
src/lib/telemetry/**
src/lib/paired-rules.ts
src/lib/dashboard/**
src/lib/db/**
src/lib/domain/**
src/lib/hooks/**
src/lib/locale/**
src/lib/legal/**
src/lib/marketing/**
src/lib/surveys/**
src/lib/tax/**
src/lib/time/**
src/lib/utils/**
src/lib/branding/**
src/lib/test-utils/**
src/lib/events/**
src/lib/cause/**
src/lib/loyalty/**
src/lib/bundles/**
src/lib/design-tokens.ts
src/lib/pricing-display.ts
src/lib/rate-limit.ts
src/lib/geocode.ts
src/lib/export-csv.ts
src/lib/performance.ts
src/lib/pluralize.ts
src/lib/polling-config.ts
src/lib/quality-checks.ts
src/lib/content-moderation.ts
src/lib/image-moderation.ts
src/lib/swr.ts
src/lib/validation.ts
-->

Shared modules not owned by a single domain. **The lib layer is where the business logic lives** — routes are kept thin so rules can be unit-tested and reused by both routes and server components.

**`lib/dashboard/nav-destinations.ts`** (new 2026-08-07) — resolves which dashboards a user can reach (shopper always, plus vendor / market-manager / event-manager by permission), for `components/dashboard/DashboardNav`. ⚠ **Deliberately NOT in `layout/Header.tsx`:** the Header renders on every page and only receives `userProfile`, so teaching it about managed markets and organized events would mean three extra queries on every page load site-wide to serve a switcher that only matters on a dashboard. The four dashboard pages call this instead, so the cost lands where the feature is. Its three role checks run in one parallel block — `performance-baseline.test.ts` guards query count and sequential depth on the pages that call it.

---

**`lib/loyalty/`** (new 2026-08-25, Loyalty Layer 1 — no money) — `config.ts` is the spec: badge catalog (First Bite/First Basket, Back for More, Regular, Local Legend, Around the World/Market Hopper, Explorer), customer segments (new · one-timer · repeat 2–3 · Regular 4–9 · Local Legend 10+ or 3 straight months) and per-vertical windows. `segments.ts` is pure math over a buyer's FULFILLED orders (a "visit" = the vendor's handoff) — one classifier feeding three readers: the buyer's badges (`[vertical]/favorites`), the vendor's order-card chip (`api/vendor/orders` → `OrderCard`), and the vendor milestone nudge. `evaluate.ts` loads history via the service client, persists only newly-earned rows to `buyer_achievements` (mig 236; unique index is the race guard), and sends `badge_earned` (buyer, push+in_app) + `customer_milestone` (vendor, in_app). **Never throws**; tolerant of the table not existing. Runs lazily on the Favorites page (also the backfill); a fulfill-route `after()` hook is a separate, per-file-approved change. `evaluate.ts` also fires `vip_reward_ready` (checkVipPunchRewards — punch target reached, dedup `punchready:{offer}:{anchor}`). **Layer 2/3 are BUILT (2026-09-04):** VIP lists (mig 242, `vendor-limits.ts` vipCustomers caps), vendor perk config (`api/vendor/offers` + `components/vendor/VipPerksCard` on Insights, bounds enforced via `offers.ts` parsers), and checkout discounts — see `offers.ts` / `offers-checkout.ts` above and 10_Checkout_Payments item 8.

**`lib/bundles/core.ts`** (new 2026-09-05, market bundles B1+B2 — mig 244, `market_bundles_build_plan.md`) — the single source of bundle money math + Q5 limits (25 qty / 3 active per market / 1-day assembly buffer), pure, no I/O. `expandBundleComponents` turns a bundle purchase into plain cart-item shapes (listing ids + quantities ONLY — prices always come live, so component vendors' pricing/inventory/payout math is byte-identical to a plain order: the conservation invariant, spec-tested). `bundleDisplayPriceCents` = ONE round of (component sum + margin) × buyer % (market-box line contract); `marginWithBuyerFeeCents` is the orders.total_cents addend; `splitMargin` is the B2 cause split (exact conservation); `bundleMarginIdempotencyKey` is the deterministic Stripe key. Margin transfers to `markets.stripe_account_id` ONLY after handoff (no-clawback invariant). See 10_Checkout_Payments for the checkout touch.

## Read this first

1. `errors/with-error-tracing.ts` + `errors/index.ts` — you will wrap every new route in this.
2. `rate-limit.ts` — the second half of the standard route preamble.
3. `design-tokens.ts` — styling is token-based; see [22_Components_UI.md](22_Components_UI.md).
4. `constants.ts` — fee math and category enums other domains key off.

## Error handling — the most developed subsystem here

| File | Purpose |
|---|---|
| `errors/with-error-tracing.ts` | `withErrorTracing` — the wrapper on essentially every API route; also `createTracedHandler`, `throwTracedError` |
| `errors/traced-error.ts` | The `TracedError` class (**details must not leak in production mode** — asserted by test) |
| `errors/error-catalog.ts` + `catalog/*.ts` | The coded error registry, split per area: auth, cart, db, market-box, order, RLS, webhook. `lookupError`, `lookupByPgCode`, `explainError` |
| `errors/observe.ts` | `observed(query, { table, operation?, route?, logNoRows?, extra? })` (2026-08-29) — wraps a Supabase call whose caller used to drop `error`; same `data` shape and behavior, plus a `logError` entry (route/method from the breadcrumb trail, schema-class PG codes 42703/22P02/42P01/42883 forced to **high**; PGRST116 "no rows" not logged). A codemod wrapped 706 call sites; guardrail Rule J is a ratchet on the unwrapped count (13 critical-path money files still pending per-file approval). `logger.ts` throttles the admin alert email to one per code+route per hour. |
| `errors/supabase-errors.ts` | Postgres error interpretation: `isRlsRecursionError`, `isRlsAccessDenied`, `isNoRowsError`, `parseSupabaseError` |
| `errors/breadcrumbs.ts` | `startBreadcrumbTrail`, `addBreadcrumb`, `crumb` |
| `errors/logger.ts` | `logErrorToDb` — writes to the `error_logs` table |
| `errors/resolution-tracker.ts` | Fix-attempt history: `recordFixAttempt`, `verifyResolution` |

**The convention that matters:** money-path errors go through `logError(new TracedError(...))`, never `console.error` — console output is invisible to the error-log review, and a structural test enforces this on money files.

**Adding a new error code obligates a catalog entry** — enforced by money-structure Rule E.

## Refusal telemetry — counting every time the app says "no"

| File | Purpose |
|---|---|
| `paired-rules.ts` | PAIRED_RULES — the registry of rules enforced in MORE than one independently-editable place where drift is silent (the dominant 2026-08 defect pattern: token generator vs shop guard, cart/items vs cart/validate, matching engine vs admin preview). Each entry names the rule, the authoritative surface, why drift is silent, and the BEHAVIOURAL test pinning the pair. Sites carry `@paired-rule <key>` comment tags; `__tests__/paired-rules-coverage.test.ts` fails the commit on orphan tags, pairs with <2 sites, or dead behavioural-test pointers. Collapse before registering — only pairs that cannot share one implementation belong here. |
| `telemetry/refusal-registry.ts` | The declared list of rules that can refuse a user: key, description, enforcement site, the decision behind it, and `RETIRED_RULES` for rules deliberately removed. Without a declared list you cannot tell a rule that NEVER FIRED from one that DOESN'T EXIST — and "never fired" is the signal. |
| `telemetry/refusals.ts` | `recordRefusal(key, ctx)` → one row in `rule_refusals` (mig 222). Never throws, no-ops in tests, and must be **awaited** (Vercel freezes the function after the response). |

**Why it exists.** Multi-market checkout was dead in production for three weeks in July 2026 with 1911 tests green. Every other gate here checks that something *is present*; nothing detected a capability quietly disappearing. This makes two questions into queries: *which rules have never fired* (dead code, or a rule nobody meant) and *which started firing* (a regression in flight).

**Two ways a refusal gets counted.** Thrown refusals record themselves — `with-error-tracing.ts` maps `TracedError.code` through `REFUSAL_BY_ERROR_CODE`, so registering a code is the only wiring needed. Refusals that merely **return a warning** (as `cart/validate` does) never reach `error_logs` at all and need an explicit `recordRefusal()` call; that invisible kind is the one that caused the incident.

⚠ **Never rename a key** — it resets that rule's history to "never fired". Retire it in `RETIRED_RULES` and add a new one. ⚠ **Never register a generic code** (`ERR_CHECKOUT_001` spans twelve sites) or a rate-limit refusal (unbounded rows). Both are asserted by `refusal-registry.test.ts`.

## Config & constants

| File | Purpose |
|---|---|
| `constants.ts` ⚠ | Fees, cutoffs, quantity units, `CATEGORIES` / `FOOD_TRUCK_CATEGORIES`, and the platform **feature flags** (`EXTERNAL_PAYMENTS_ENABLED`, etc.). Protected — check the decision log before changing any flag |
| `environment.ts` | Per-vertical production URLs; `getAppUrl`, `validateEnv` |
| `polling-config.ts` | Business-hours-aware refresh cadences; `isOffPeak`, `POLLING_INTERVALS`, `getPollingInterval` |
| `pricing-display.ts` | **Human-readable price/tier strings derived from `SUBSCRIPTION_AMOUNTS`.** `formatCentsUSD`, `formatCentsCompact`, `PAID_VENDOR_TIERS`, `vendorTiersSentence()`, `upgradeCallToAction()`, `buyerPremiumMonthly()`. Never write a subscription price as a literal in UI, legal or marketing copy — import from here. Lives outside `pricing.ts` so display formatting doesn't share a change-approval gate with fee arithmetic |
| `domain/config.ts` · `domain/server.ts` | Host → brand/vertical resolution |
| `branding/` | `defaults.ts`, `server.ts` (`getVerticalConfig`, `getBrandingByDomain`, `getAllVerticals`), `types.ts` |

## Time & scheduling

| File | Purpose |
|---|---|
| `time/market-dates.ts` | **The timezone authority.** `DEFAULT_TIMEZONE = 'America/Chicago'`, `todayInTimezone`, `nextPickupDateInTimezone`. Vercel runs UTC — every server-side market-date comparison must go through here |
| `utils/timezone.ts` · `utils/time-slots.ts` | Display formatting and slot generation |
| `utils/schedule-overlap.ts` | `findScheduleConflicts`, `timesOverlap` — single-truck vendors can't be in two places at once |

## Internationalization

`locale/index.ts` (`SUPPORTED_LOCALES` = `en`, `es`; `LOCALE_COOKIE`; `isValidLocale`) · `locale/server.ts` (`getLocale`) · `locale/client.ts` · `locale/messages/{en,es,index}.ts` (the `t()` lookup) · `pluralize.ts`.

New user-facing strings go through `t()`, not hardcoded literals — the shared primitives already do this.

## Data access

`db/verticals.ts` (`getVerticals`, `getVerticalConfig`, field getters) · `db/vendors.ts` (`createVendorProfile`, `getVendorsByVertical`, `submitVendorForVerification`) · `db/markets.ts` (`getMarketVendorCounts`, `mergeVendorCounts`) · `db/index.ts` barrel.

## Client-side

`hooks/useCart.tsx` (`CartProvider`, `useCart`) · `hooks/useToast.tsx` · `hooks/useDebounce.ts` · `hooks/useSmartRefresh.ts` (cutoff-aware polling) · `swr.ts` (`fetcher`, `swrDefaults`).

> **Most hooks live in `lib/hooks/`, not `src/hooks/`.** Check both — `src/hooks/` holds only `useLocationAreaName.ts` and `useStatusBanner.tsx`.

## Validation & moderation

`validation.ts` (zip/phone/state validate + format) · `validation/vendor-signup.ts` (Zod schema) · `validation/vertical.ts` (see [16_Auth_RLS_Verticals.md](16_Auth_RLS_Verticals.md)) · `content-moderation.ts` (`isProfane`, `moderateText`, `checkFields`) · `image-moderation.ts` (Google Cloud Vision SafeSearch) · `quality-checks.ts` (vendor-health heuristics feeding the quality cron: schedule conflicts, low stock, price anomalies, ghost listings, inventory velocity).

## Infrastructure

`rate-limit.ts` — Upstash Redis with an **in-memory fallback** when `UPSTASH_REDIS_REST_URL` is unset. Exports `checkRateLimit`, `getClientIp`, `rateLimits`, `rateLimitResponse`, `compositeKey`, `getRequestFingerprint`, `checkBurst`, `trackEndpointScan`.

`performance.ts` — in-memory metrics; resets on restart, so it is a development aid rather than a production telemetry source.

## Content & marketing

`legal/` — four agreement documents plus `resolvePlaceholders`, `verticalPlaceholders`, and `CURRENT_AGREEMENT_VERSION`. `marketing/json-ld.ts` (structured data), `marketing/share.ts`, `marketing/activity-events.ts`.

## Surveys

`surveys/types.ts` (`CATEGORY_DEFINITIONS`, `validateSurveySubmission`, buyer `other_places_request` mig 240) · `token.ts` · `email.ts` (+ `buildWeeklySurveyEmail`) · `lazy-generate.ts` (`ensurePendingVendorSurveys` / `ensurePendingBuyerSurveys` — generates a survey when the user next returns, so returners never receive the email) · `cron-helpers.ts` (timezone-local fire-moment math) · **`cadence.ts`** (owner 2026-08-29: vendors WEEKLY, buyers per-day for purchases 1–2 then weekly; Monday→Sunday week, fires Sunday 18:00 market-local; pure) · **`weekly.ts`** (`generateWeeklySurveys` — one row per place per person per week, ONE notification + ONE email per person; `isEarlyBuyer`; shared by the cron and the lazy path).

## Misc utilities

`utils/availability-status.ts` (`deriveAvailabilityStatus` — maps the RPC's output to open/closing-soon/closed badges; **the SQL stays the single source of truth**) · `utils/image-resize.ts` · `utils/maps-link.ts` · `geocode.ts` (`ZIP_LOOKUP`, `geocodeZipCode` — note the `zip_codes` table is empty) · `export-csv.ts`.

## Testing support

`test-utils/supabase-test-client.ts` — `TEST_PREFIX = '__test_'`, `createTestClient`, `testId`, `cleanupTestData`, `cleanupAllTestData`. Integration tests run against dev Supabase and clean up after themselves via this prefix convention.

## `lib/tax/` — the sales-tax core (Phase 1 in progress; NOT yet wired to checkout)

**The living half** (plan: `apps/web/.claude/sales_tax_readiness.md` Part III + `tax_phase1_design.md`):
- `tax/jurisdictions.ts` — TX jurisdiction model + pure math (mig 214): `computeItemTax`
  (per-jurisdiction rounding, total derived from parts), `validateJurisdictions`,
  `buildListSupplement` (Form 01-116 rollup), `parseJurisdictions`. Consumed by the admin
  jurisdictions route + the seam below. 22 tests.
- `tax/compute-cart-tax.ts` — **THE TAX SEAM** (Batch 1, 2026-09-07, owner-ratified A′
  design): `computeCartTax(items, markets)` computes facilitated-sales tax from stored
  market jurisdictions — zero external calls; bundle components carry their own
  `is_taxable` (owner ruling: taxability follows the items). Guardrails refuse loudly:
  TX-only assert · III.7 intake readiness (codes entered + verified) · stale-quarter
  rate_version check (⚠ the quarterly refresh job must exist before TAX_STREAM1 enables,
  or quarter-turns halt taxable sales). Multi-state future = swap this seam's internals
  for the Stripe Tax Calculations API; callers never move. **Inert until Batch 2 wires
  checkout/capture behind the flag.** 14 tests.

**⚠ The dead half — do not build on:** `tax/taxcloud.ts` + `tax/tic-codes.ts` are
artifacts of the REJECTED pre-8/1 TaxCloud plan (zero importers; env vars never
provisioned). Retirement queued in plan Part III.1.

(Vendor-facing tax *advisory copy* lives separately: `lib/vendor/tax-notice.ts` — whose
"will be automatically applied" line is a known guardrail item — plus the vendor
`analytics/tax-summary` report.)
