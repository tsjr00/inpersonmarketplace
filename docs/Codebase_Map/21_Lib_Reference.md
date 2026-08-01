# 21 — Shared Library Reference

<!-- map-stamp: domain=lib-reference; verified=2026-07-18; commit=b9f82116 -->
<!-- map-claims
src/lib/errors/**
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

---

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
| `errors/supabase-errors.ts` | Postgres error interpretation: `isRlsRecursionError`, `isRlsAccessDenied`, `isNoRowsError`, `parseSupabaseError` |
| `errors/breadcrumbs.ts` | `startBreadcrumbTrail`, `addBreadcrumb`, `crumb` |
| `errors/logger.ts` | `logErrorToDb` — writes to the `error_logs` table |
| `errors/resolution-tracker.ts` | Fix-attempt history: `recordFixAttempt`, `verifyResolution` |

**The convention that matters:** money-path errors go through `logError(new TracedError(...))`, never `console.error` — console output is invisible to the error-log review, and a structural test enforces this on money files.

**Adding a new error code obligates a catalog entry** — enforced by money-structure Rule E.

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

`surveys/types.ts` (`CATEGORY_DEFINITIONS`, `validateSurveySubmission`) · `token.ts` · `email.ts` · `lazy-generate.ts` (`ensurePendingVendorSurveys` / `ensurePendingBuyerSurveys` — generates a survey when the user next returns, so returners never receive the email) · `cron-helpers.ts` (timezone-local fire-moment math).

## Misc utilities

`utils/availability-status.ts` (`deriveAvailabilityStatus` — maps the RPC's output to open/closing-soon/closed badges; **the SQL stays the single source of truth**) · `utils/image-resize.ts` · `utils/maps-link.ts` · `geocode.ts` (`ZIP_LOOKUP`, `geocodeZipCode` — note the `zip_codes` table is empty) · `export-csv.ts`.

## Testing support

`test-utils/supabase-test-client.ts` — `TEST_PREFIX = '__test_'`, `createTestClient`, `testId`, `cleanupTestData`, `cleanupAllTestData`. Integration tests run against dev Supabase and clean up after themselves via this prefix convention.

## ⚠ `lib/tax/` is dead code

**Verified unwired.** Two files — `tax/taxcloud.ts` (245 lines) and `tax/tic-codes.ts` — with **zero importers anywhere in the application**. A repo-wide search for the module path and for every exported symbol (`lookupTax`, `captureTransaction`, `reportReturn`, `TIC_CODES`, `getTICForListing`) returns no hits outside `lib/tax/` itself.

The module is complete and plausible, and depends on `TAXCLOUD_API_LOGIN_ID` / `TAXCLOUD_API_KEY`. Its own header notes the TIC codes were never validated against TaxCloud's live list, which suggests the account was never provisioned and the integration was written ahead of a decision that never landed.

**No sales tax is calculated by this code today.** Treat it as a build-or-delete decision for the incoming team, not as live behavior. (Vendor-facing tax *advisory copy* is a separate thing and does live: `lib/vendor/tax-notice.ts`, plus the vendor `analytics/tax-summary` report.)
