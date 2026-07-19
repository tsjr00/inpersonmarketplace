# 01 — System Overview

<!-- map-stamp: domain=system-overview; verified=2026-07-18; commit=b9f82116 -->
<!-- map-claims
src/middleware.ts
src/instrumentation.ts
src/types/**
src/hooks/**
src/lib/environment.ts
src/lib/constants.ts
-->

## What the product is

A marketplace for **in-person** transactions: buyers order ahead from local food vendors and pick the order up in person at a farmers market or a food-truck park. The platform never ships anything. Money moves through **Stripe Connect destination charges** — the buyer pays the platform, the platform keeps a fee, and the vendor's share is transferred to their connected account.

Three parties transact: **buyers**, **vendors** (the sellers), and **venue operators** (farmers-market managers on the FM side, park operators on the FT side) who rent selling space to vendors. Venue rent is a second, independent money path — see [02_Money_Flow.md](02_Money_Flow.md).

## The two verticals

The same codebase serves two products under one platform:

| Vertical id | Product | Canonical domain |
|---|---|---|
| `farmers_market` | Farmers Marketing (FM) | farmersmarketing.app |
| `food_trucks` | Food Truckn (FT) | foodtruckn.app |

Verticals are a **first-class isolation boundary**, not a theme. Every query scopes `vertical_id`; terminology, branding, vendor tiers and pricing all differ by vertical. Getting this wrong leaks one product's data into the other — see [16_Auth_RLS_Verticals.md](16_Auth_RLS_Verticals.md).

**Routing:** most pages live under the dynamic segment `src/app/[vertical]/**`, so `/farmers_market/browse` and `/food_trucks/browse` are the same page component with different scope. `src/middleware.ts:7-11` holds the allowlist of top-level segments that are *not* verticals (`api`, `admin`, `browse`, `login`, …); anything else that isn't a valid vertical is rewritten to 404 (`src/middleware.ts:43-47`). On production domains the middleware also 308-redirects cross-domain vertical access to the correct domain (`src/middleware.ts:18-38`).

**Events are not a vertical.** An event is a `markets` row with `market_type='event'`, and it works across both verticals. See [14_Events.md](14_Events.md).

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16** App Router (`next ^16.1.6`), **React 19.2.3** | Server components by default; route handlers under `src/app/api/**` |
| Database / auth / storage | **Supabase** (Postgres, Auth, RLS, Storage) `@supabase/supabase-js ^2.89.0`, `@supabase/ssr ^0.8.0` | RLS is the primary authorization layer; three client factories — see below |
| Payments | **Stripe Connect** `stripe ^20.1.2` | Destination charges; vendor + venue-operator connected accounts |
| Hosting / scheduling | **Vercel** | Cron jobs defined in `apps/web/vercel.json` — **crons run on PRODUCTION only**, never on preview/staging |
| Email | **Resend** `resend ^6.9.1` | Delivery + bounce/complaint webhooks feed email suppression |
| SMS | **Twilio** `twilio ^5.12.1` | Reserved for urgent-channel notifications |
| Push | **web-push** `^3.6.7` (VAPID) | Browser push notifications |
| Rate limiting | **Upstash Redis** `@upstash/ratelimit ^2.0.8` | Sliding window; `src/lib/rate-limit.ts` |
| Errors | **Sentry** `@sentry/nextjs ^10.40.0` | Plus a database `error_logs` table — see `src/lib/errors/` |
| Validation | **Zod** `^4.3.6` | |
| Client data | **SWR** `^2.4.1` | |
| Charts | Chart.js + react-chartjs-2 | Admin/vendor analytics |
| Webhook verification | `standardwebhooks`, `svix` | Supabase auth-hook + Resend signature verification |
| Moderation | `bad-words`, Google Cloud Vision (image) | `src/lib/content-moderation.ts`, `src/lib/image-moderation.ts` |

## Environments

| Environment | Branch | Where | Supabase project |
|---|---|---|---|
| Dev | `main` (local) | localhost:3002 | Dev |
| Staging | `staging` | Vercel preview | Staging |
| Production | `main` on origin | farmersmarketing.app / foodtruckn.app | Prod |

**Deployment is staging-first and gated.** The workflow, the branch chain, and the 9 PM–7 AM CT production push window are documented in `apps/web/.claude/rules/git-and-deployment.md` and enforced by git hooks (`.husky/`). Migrations are applied by the product owner, in order, before the corresponding production push.

**Quality gates:** pre-commit runs ESLint (staged) + `tsc --noEmit` + the full Vitest suite; pre-push runs `npm run build` + Playwright smoke. See [23_Test_Suites.md](23_Test_Suites.md).

## Roles

Roles are **composable, never merged** — one person can be a buyer and a vendor and a market manager, and each capability is checked independently (decision log, 2026-06-12).

| Role | What it is |
|---|---|
| Buyer | Orders for in-person pickup; may hold a buyer subscription |
| Vendor | Sells; has a `vendor_profiles` row, a Stripe connected account, and a tier |
| Market manager | Operates a farmers market; rents booths; has their own Stripe account |
| Park operator | FT equivalent: operates a truck park; rents spots |
| Event organizer | May be **account-less** — access is token-scoped by URL (see [14_Events.md](14_Events.md)) |
| Admin | Platform-wide or scoped to a single vertical (see [19_Admin.md](19_Admin.md)) |
| Regional manager | Designed, **not built** |

## Vendor tiers & subscription pricing

Tiers were **unified across verticals** — `SUBSCRIPTION_AMOUNTS` (`src/lib/pricing.ts:22-43`) is the single source of truth, and the per-vertical tier names are now aliases pointing at the same amounts:

| Tier | Monthly | Annual | Notes |
|---|---|---|---|
| Pro (FM "premium", FT "pro") | $25.00 | $208.15 | ~30% annual saving |
| Boss (FM "featured", FT "boss") | $50.00 | $481.50 | ~20% annual saving |
| Free / Standard / Basic | $0 | $0 | `fm_standard` and `ft_basic` are both free (`pricing.ts:35,39`) |
| Buyer Premium | $9.99 | $81.50 | Buyer-side subscription |

> Older documentation (and prior session notes) describe FT `basic $10 / pro $30` and FM `premium $24.99` — **those figures are obsolete**; the code above is current. This is a good illustration of why this map is enforced rather than remembered.

Tier *limits* (listing caps, subscriber caps, feature gates) are centralized in `src/lib/vendor-limits.ts` ⚠ — never hardcode a limit elsewhere. Tier *amounts* live in `src/lib/pricing.ts` ⚠. Stripe price IDs are per-vertical env vars (see below), resolved in `src/lib/stripe/config.ts`.

## Code structure

```
apps/web/src/
  app/
    [vertical]/**        ~110 pages — the vertical-scoped product surface
    admin/**             platform-admin pages (not vertical-scoped)
    api/**               256 route handlers  ← the API surface
    (root pages)         landing, browse, login, signup, terms, privacy…
  components/            180 components, grouped by domain
  lib/                   168 modules — business logic; the real substance
  hooks/                 shared React hooks
  types/                 shared TypeScript types
  middleware.ts          vertical routing, session refresh, cache headers
  instrumentation.ts     Sentry init
```

**Counts as of the stamp:** 256 API routes · 168 lib modules · 180 components · 142 pages · 64 test files · 846 source files total.

The **lib layer is where the business logic lives.** Route handlers are thin-ish; the rules (pricing, fees, inventory, credits, notifications, scheduling) are in `src/lib/**` so they can be unit-tested and reused by both routes and server components.

## Integrations & external services

| Service | Used for | Key files |
|---|---|---|
| Stripe | Checkout sessions, destination charges, transfers, refunds, Connect onboarding, subscriptions | `src/lib/stripe/**` ⚠ |
| Supabase | Postgres + Auth + RLS + Storage | `src/lib/supabase/**` |
| Resend | Transactional email + delivery/bounce webhooks | `src/lib/notifications/**`, `src/app/api/webhooks/resend/` |
| Twilio | SMS on urgent notifications | `src/lib/notifications/**` |
| Upstash Redis | Rate limiting | `src/lib/rate-limit.ts` |
| Sentry | Error monitoring | `src/lib/errors/**`, `instrumentation.ts` |
| Google Cloud Vision | Image moderation | `src/lib/image-moderation.ts` |
| TaxCloud | Sales tax — **built, not yet wired into checkout** | `src/lib/tax/` |
| Cloudflare Turnstile | Bot protection on public forms | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |

## Environment variables

Grouped by system. (Enumerated from `process.env.*` references in `src/`.)

**Supabase** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`

**Stripe** — `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, plus subscription price IDs: `STRIPE_{VENDOR,FM,FT}_{PRO,BOSS}_{MONTHLY,ANNUAL}_PRICE_ID` and `STRIPE_BUYER_{MONTHLY,ANNUAL}_PRICE_ID`

**Email / SMS / push** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`, `ADMIN_EMAIL`, `ADMIN_ALERT_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`

**Infrastructure** — `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET` (cron route auth), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_URL`, `VERCEL_ENV`, `NODE_ENV`, `NEXT_RUNTIME`, `VITEST`

**Observability** — `NEXT_PUBLIC_SENTRY_DSN`, `LOG_ERRORS_TO_DB`, `DISABLE_BREADCRUMBS`, `NEXT_PUBLIC_VITALS_ENDPOINT`

**Other** — `GOOGLE_CLOUD_VISION_API_KEY`, `TAXCLOUD_API_KEY`, `TAXCLOUD_API_LOGIN_ID`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_GOOGLE_PLACE_ID`, `REQUIRE_ADMIN_MFA`, `NEXT_PUBLIC_REQUIRE_ADMIN_MFA`

A fuller operational guide lives at `docs/Environment_Configuration_Guide.md`.

## Security posture

- **Security headers + CSP** are set in `next.config.ts` — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, HSTS, `Referrer-Policy`, `Permissions-Policy`, and a restrictive CSP allowlisting only Supabase, Stripe, Turnstile and Sentry origins.
- **Sensitive paths are never cached** — `src/middleware.ts:16` lists `/admin`, `/dashboard`, `/vendor/dashboard`, `/buyer/orders`, `/settings`; the middleware sets `Cache-Control: no-store` on them (`src/middleware.ts:49-51`).
- **RLS is the primary authorization layer.** The service-role client bypasses RLS and is restricted to server-side paths that genuinely need it (payments, webhooks, crons) — see [16_Auth_RLS_Verticals.md](16_Auth_RLS_Verticals.md).
- **Rate limiting** on public/abusable endpoints via Upstash.
- **Admin MFA** gated by `REQUIRE_ADMIN_MFA`.

## Protected / critical-path files

These files handle money, inventory, or fulfillment. They are enforced by a PreToolUse hook (`apps/web/.claude/protected-paths.txt` → `scripts/hooks/protected-paths-check.mjs`) and by `change-discipline.md` Rule 3, which requires per-file approval with exact diffs before any edit. Throughout this map they carry a ⚠ marker.

`api/cart/items/route.ts` · `api/cart/items/[id]/route.ts` · `api/cart/validate/route.ts` · `api/checkout/session/route.ts` · `api/checkout/success/route.ts` · `api/checkout/external/route.ts` · `lib/stripe/payments.ts` · `lib/stripe/webhooks.ts` · `api/vendor/orders/[id]/reject/route.ts` · `api/vendor/orders/[id]/fulfill/route.ts` · `api/vendor/payouts/route.ts` · `lib/pricing.ts` · `lib/vendor-limits.ts` · `lib/payments/vendor-fees.ts` · `api/vendor/orders/[id]/confirm-external-payment/route.ts` · `lib/constants.ts`

## Architectural facts a new dev must know

These are the things that look like bugs but are deliberate, and the things that silently break if you don't know them.

1. **Server components must never `fetch()` their own API routes.** Vercel SSO returns 401 on server-to-server fetches. Extract the logic to `src/lib/**` and call it directly. (Decision log, 2026-04-10.)
2. **`cache: 'no-store'` on a server fetch is also a dynamic-rendering signal.** Removing it can silently make a route static and serve stale HTML. When refactoring a server component, add `export const dynamic = 'force-dynamic'` explicitly.
3. **Vercel runs in UTC.** Every server-side date comparison must be market-timezone aware — use `src/lib/time/market-dates.ts`, never raw `new Date()` comparisons for market days.
4. **Supabase `.rpc()` returns a `PostgrestFilterBuilder`**, not a promise you can `.catch()`. Errors arrive in the response object.
5. **`sendNotification()` never throws and must be awaited** — Vercel terminates the function after the response, so an un-awaited send silently doesn't happen. The vertical goes in the OPTIONS parameter, not `templateData`.
6. **Payments are written with the service client** — buyers cannot insert `payments` rows under RLS.
7. **Stripe idempotency keys must be deterministic** — never `Date.now()`. Retries must reuse the same key or you double-charge.
8. **The `verticals` table has both `id` (UUID) and `vertical_id` (TEXT slug); foreign keys use the slug.**
9. **After adding a column, PostgREST needs `NOTIFY pgrst, 'reload schema'`** or the API won't see it.
10. **Crons never fire on staging** — Vercel schedules production only. Cron behavior must be verified by invoking the route manually with `CRON_SECRET`.
11. **`window.confirm/alert/prompt` are blocked on mobile** — use the `ConfirmDialog` component.
12. **The browse page is ISR-cached** and user-specific data is layered in by a client overlay; the `loading.tsx` skeleton reveals real latency rather than causing it. Details in [20_Buyer_Public.md](20_Buyer_Public.md).

## Where the rest of the truth lives

| For | Read |
|---|---|
| Database schema | `supabase/SCHEMA_SNAPSHOT.md` (Change Log is authoritative; verify columns via `information_schema` if in doubt) |
| Why a decision was made | `apps/web/.claude/decisions.md` |
| Engineering rules | `CLAUDE.md` + `apps/web/.claude/rules/` (5 files) |
| The July 2026 pre-relaunch review | `apps/web/.claude/review/FINDINGS_LEDGER.md` |
| Migration workflow | `apps/web/docs/migration-workflow.md` |
| RLS policy workflow | `apps/web/docs/rls-policy-workflow.md` |
| API route security checklist | `apps/web/docs/api-route-security-checklist.md` |
