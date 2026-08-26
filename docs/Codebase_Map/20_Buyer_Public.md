# 20 — Buyer & Public Surfaces

<!-- map-stamp: domain=buyer-public; verified=2026-08-25; commit=bfc60dfd -->
<!-- map-claims
src/app/api/buyer/**
src/app/api/listings/**
src/app/api/trucks/**
src/app/api/vendors/**
src/app/api/vertical/**
src/app/api/locale/**
src/app/api/health/**
src/app/api/submit/**
src/app/api/support/**
src/app/api/marketing/**
src/app/api/vendor-leads/**
src/app/api/buyer-interests/**
src/app/api/surveys/**
src/app/api/user/**
src/app/api/vendor-documents/**
src/lib/location/**
src/components/browse/**
src/components/buyer/**
src/components/listings/**
src/components/location/**
src/components/landing/**
src/components/marketing/**
src/components/help/**
src/components/support/**
src/components/surveys/**
src/components/legal/**
src/components/projection/**
src/app/[vertical]/browse/**
src/app/[vertical]/buyer/**
src/app/[vertical]/listing/**
src/app/[vertical]/favorites/**
src/app/[vertical]/where-today/**
src/app/[vertical]/help/**
src/app/[vertical]/support/**
src/app/[vertical]/survey/**
src/app/[vertical]/terms/**
src/app/[vertical]/about/**
src/app/[vertical]/features/**
src/app/[vertical]/how-it-works/**
src/app/[vertical]/comingsoon/**
src/app/[vertical]/settings/**
src/app/[vertical]/dashboard/**
src/app/[vertical]/notifications/**
src/app/[vertical]/vendors/**
src/app/[vertical]/vendor/[vendorId]/**
src/app/[vertical]/operator-projection/**
src/app/[vertical]/page.tsx
src/app/[vertical]/layout.tsx
src/app/[vertical]/template.tsx
src/app/page.tsx
src/app/layout.tsx
src/app/browse/**
src/app/dashboard/**
src/app/about/**
src/app/contact/**
src/app/support/**
src/app/terms/**
src/app/privacy/**
src/app/test-components/**
src/app/robots.ts
src/app/sitemap.ts
src/app/llms.txt/**
src/app/api/manifest/**
src/app/api/apple-touch-icon/**
-->

---

## Read this first

1. `lib/location/server.ts` — small, and the source of truth for the location-cookie contract.
2. `app/[vertical]/browse/page.tsx:25-28` and `:577-700` — the caching decision and the location-resolution ladder.
3. `app/api/buyer/location/route.ts` — the only writer of the location cookie.
4. `app/api/listings/route.ts:24-37` — the admin-conditional client pattern worth copying.

## The location system

**Location is an httpOnly cookie, with a profile override — and a query param that beats both.**

The cookie is `user_location` (`lib/location/server.ts:4`): httpOnly, 30-day max-age, JSON `{latitude, longitude, source, locationText, radius}`. Valid radii are `[2, 5, 10, 25, 50, 100]`, default 25. Because it is httpOnly it can only be written server-side — client code posts to `/api/buyer/location` rather than setting it directly.

**Two precedence orders coexist, which is a genuine trap:**

- `getServerLocation()` (`lib/location/server.ts:19-78`) — an authenticated **profile beats the cookie** for coordinates, but **radius always comes from the cookie** (the profile stores no radius).
- The **browse page reimplements this inline** rather than calling `getServerLocation`: **`?zip=` param first** (hardcoding radius 25), then profile, then cookie (`browse/page.tsx:591-648`).

**Distance filtering is PostGIS-first with a JS fallback.** With a location resolved, browse calls `get_listings_within_radius`, passing `vertical_filter` — **this is where vertical isolation happens on the browse path**. If the RPC errors *or returns zero rows*, it falls back to an inline Haversine computation.

> Worth knowing: the fallback condition treats an empty PostGIS result identically to an error, so a legitimately-empty radius silently triggers the Haversine path. Harmless today, but surprising when debugging.

`api/markets/nearby` uses a different technique entirely — a 20%-buffered bounding box rather than the RPC.

**This system has broken three times** and is protected by a dedicated 36-test suite (`browse-location.test.ts`). Its header is explicit: violations are regressions, not reasons to update the test. Do not remove the cookie read, convert browse to static rendering, or drop the Haversine filter.

## Caching posture — verified per page

| Page | Setting |
|---|---|
| `[vertical]/browse` | **`export const dynamic = 'force-dynamic'`** — it reads cookies. An in-file comment warns that adding `revalidate` would cause CDN caching that ignores cookie changes, **breaking search** |
| `[vertical]/markets` | `revalidate = 600` |
| `[vertical]/vendors` | `revalidate = 600` |
| `[vertical]/help` | `revalidate = 300` |
| `[vertical]/listing/[listingId]` | `force-dynamic` |
| `[vertical]/markets/[id]` | Neither export; uses the cookie-bound client, so dynamic by default |

This is exactly the tension `lib/supabase/anon.ts` exists to resolve: **a page that wants ISR must use `anonSupabase` and must not touch cookies.**

## Buyer API

All under `app/api/buyer/`, all wrapped in `withErrorTracing` + `checkRateLimit`:

| Route | Purpose |
|---|---|
| `location/route.ts` | The location cookie: POST set, GET read, PATCH radius-only, DELETE clear |
| `location/geocode` · `reverse-geocode` | ZIP → coordinates, coordinates → place name |
| `orders/route.ts` · `orders/[id]` | Buyer order list and detail |
| `orders/[id]/cancel` · `confirm` · `rate` · `report-issue` | Buyer-side lifecycle actions (cancel applies the grace-window and 25% fee rules — see [10_Checkout_Payments.md](10_Checkout_Payments.md)) |
| `orders/unrated` | Drives the review-prompt UI |
| `market-boxes/*` | Box subscriptions + pickup confirmation |
| `events/[token]/rate` · `review-state` | Token-addressed event rating |
| `feedback` | Shopper feedback submission |
| `subscription/status` · `tier/downgrade` | Buyer premium tier |

## Public catalog API

`listings/route.ts` (**requires `?vertical=`**; admin-conditional client) · `listings/[id]` · `listings/[id]/availability` · `listings/suggestions` · `markets/*` (see [12_Market_Manager.md](12_Market_Manager.md)) · `vendors/nearby` · `trucks/where-today` (day-of-week resolution preferring client-supplied timezone values).

## Misc public routes

`health` (uptime probe) · `locale` (locale cookie) · `vertical` (vertical resolution) · `submit`, `support`, `marketing`, `vendor-leads`, `buyer-interests` (public forms and lead capture) · `surveys` (token-addressed survey submission) · `user/*` (account settings, email preferences, delete-account) · `vendor-documents` (signed document access) · `errors` (client error reporting).

**Platform assets & SEO:** `api/manifest/route.ts` (per-vertical PWA manifest) · `api/apple-touch-icon/route.ts` (per-vertical touch icon) · `app/llms.txt/route.ts` (LLM-readable site description) · `app/robots.ts` · `app/sitemap.ts`. These are vertical-aware because the two brands share one deployment.

## Pages

**Discovery / public:** `[vertical]` (vertical home) · `browse` · `listing/[listingId]` · `market-box/[id]` · `markets` + `[id]` + `[id]/book` + `[id]/book-spot` · `vendors` · `vendor/[vendorId]/profile` + `/schedule` · `where-today` · `about` · `features` · `how-it-works` · `comingsoon` · `market-manager-program` · `terms` (+ `/partner`, `/vendor`) · `help` (+ `/setup`) · `support`.

**Buyer:** `buyer/orders` + `[id]` · `buyer/subscriptions` + `[id]` · `buyer/surveys` · `buyer/upgrade` · `favorites` (since 2026-08-25 also the home of the buyer's loyalty badges — "My Badges" + next-up progress, evaluated on load by `lib/loyalty/evaluate.ts`; owner kept the dashboard consolidated instead of adding a tile) · `checkout` (+ `external`, `success`) · `subscription/success` · `survey/[token]`.

**Account:** `settings` · `account/email-preferences` · `dashboard` · `notifications`.

**Root (not vertical-scoped):** `/` (marketing landing) · `/browse` · `/dashboard` · `/login` · `/signup` · `/vendor-signup` · `/about` · `/contact` · `/support` · `/terms` · `/privacy` · `/test-components` (a dev-only component gallery).

> The duplication between root `/login`, `/browse` and their `[vertical]/` equivalents is a structural fact worth knowing early. **UNVERIFIED** whether the root variants redirect into a default vertical or render independently — trace `middleware.ts` before assuming.

## Components

`browse/NotifyMeCapture` (email capture when a query has no results in the user's area) · `location/LocationPrompt`, `LocationSearchInline` · `listings/ListingImageGallery`, `ListingPurchaseSection`, `PickupLocationsCard`, `CutoffBadge`, `CutoffStatusBanner` · `buyer/OrderTimeline`, `PickupDetails`, `RateOrderCard`, `ShopperFeedbackForm`, `ReviewPromptCard`, `OrderStatusSummary`, `FeedbackCard`, `ExternalOrderFollowUp` · `landing/*` (15 marketing sections incl. `Hero`, `Features`, `HowItWorks`, `LocationEntry`, `ManagerIntakeForm`, `ComingSoonForm`) · `marketing/ShareButton`, `PostPurchaseSharePrompt`, `SocialProofToast` · `markets/MarketCard`, `MarketsWithLocation`, `ScheduleDisplay`, `MarketDocumentsViewer` · `help/*` · `support/SupportForm` · `surveys/SurveyForm`, `PendingSurveysCard` · `legal/LegalDocument` · `projection/OperatorProjectionTool`.

## Library

`lib/location/server.ts` (the cookie contract) plus the client-side location helpers. Geocoding lives in `lib/geocode.ts` — note that the `zip_codes` table is empty, so the `?zip=` path silently resolves nothing and the cookie fallback is what actually carries location. Do not remove that fallback.
