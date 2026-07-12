# System Map (read-first inventory)

Verified 2026-07-12 by direct enumeration. Purpose: skip rediscovery. Counts are exact;
per-route detail lives in the files themselves — this is the index.

## Stack & environments
- **Next.js 16 App Router** (`apps/web`, `next ^16.1.6` per package.json) · **Supabase** (Postgres + Auth + RLS + Storage) · **Stripe Connect** (destination charges) · **Vercel** (hosting + cron). Rate limiting = **Upstash Redis** (sliding window, async `checkRateLimit`). Errors = **Sentry**.
- **Verticals:** `farmers_market` (FM, farmersmarketing.app) + `food_trucks` (FT, foodtruckn.app). Multi-vertical isolation: every query scopes `vertical_id`.
- **Envs:** Dev (`main` local, localhost:3002) · Staging (`staging` branch, Vercel preview, staging Supabase) · Prod (`main` on origin, farmersmarketing.app, prod Supabase). Deploy = staging-first.
- **Roles (composable, never merged — `decisions.md` 2026-06-12):** buyer, vendor, market manager, regional manager (RM, not built), event organizer (`catering_requests`, may be account-less). Events are NOT a vertical — a `markets` row with `market_type='event'`, cross-vertical.

## API routes — 254 total (`src/app/api/**/route.ts`), by area
| Area | Routes | What lives here |
|---|---|---|
| `vendor/` | 74 | Vendor dashboard, orders (confirm/ready/fulfill/reject/cancel), market/booth/spot booking, market-boxes, fees, profile, events, referrals, analytics |
| `admin/` | 49 | Platform + per-vertical admin: users, vendors, markets, events, reports, errors, moderation, knowledge, vendor-activity |
| `market-manager/` | 35 | Manager dashboard: markets, booth inventory, opt-in agreement catalog/selections, vendor invitations/approval, schedules, park-spots, standing-reservations, broadcast, Stripe onboarding |
| `buyer/` | 18 | Orders, ratings, feedback, tier, location (geocode/reverse-geocode), subscription status |
| `events/` | 15 | Token-scoped organizer + attendee: shop/order, waves reserve, select vendors, verify-code, validate-capacity, cancel, **agreement** (new), **broadcast** (new), ratings (new) |
| `markets/` | 10 | Public market pages, vendors-with-listings, optin-public, nearby |
| `checkout/` | **4 ⚠money** | `session`, `success`, `external`, `payment-methods` |
| `cart/` | **4 ⚠money** | `route`, `items`, `items/[id]`, `validate` |
| `cron/` | 5 | See below |
| `webhooks/` | 2 | `stripe`, `resend` |
| `subscriptions/` | 2 | Vendor/buyer Stripe subscription checkout + verify |
| `market-boxes/` | 2 | Chef-box/CSA subscription offerings |
| others | ~29 | user(5), notifications(5), listings(4), auth(3), + singles (health, locale, submit, support, marketing, vertical, trucks, vendor-leads, buyer-interests, event-requests, event-approved-vendors, errors, vendor-documents, surveys) |

## Crons (`vercel.json`) — 5, run on PROD only (Vercel crons don't fire on preview/staging)
| Route | Schedule (UTC) | Purpose |
|---|---|---|
| `cron/expire-orders` | `0 12 * * *` daily | **⚠ money-moving.** Order expiry/cancel, missed-pickup vendor payouts, no-show, season auto-end/settlement, event reminders + auto-complete, park occurrences. Multi-phase; the heaviest + highest-risk job. |
| `cron/surveys` | `0 * * * *` hourly | Post-event survey sending (has an N+1 shape — see cost anchors) |
| `cron/vendor-activity-scan` | `0 8 * * *` daily | Vendor activity/referral scan |
| `cron/vendor-quality-checks` | `0 14 * * *` daily | Nightly vendor quality scoring (Phase 8) |
| `cron/park-docs-review` | `0 12-23,0-2 * * *` | FT park doc-review nudges (~7am–8pm CT, DST-safe) |

## Webhooks
- `webhooks/stripe` → `src/lib/stripe/webhooks.ts` (payment/transfer/account events; market-box payout; **critical-path**).
- `webhooks/resend` → email delivery/bounce events.

## lib subsystems (`src/lib/*`)
`auth` · `branding` · `cron` · `db` · `domain` · `errors` (withErrorTracing/crumb/traced) · `events` (viability scoring, complete-event) · `hooks` · `legal` · `locale` · `location` · `marketing` · `markets` (booth/season/park booking, optin, agreement-version) · `notifications` (single send pipe) · `onboarding` · `orders` · `payments` (**vendor-fees, cancellation, tips — money**) · `stripe` (**payments/webhooks/connect/reconcile — money**) · `supabase` (client/server/service factories) · `surveys` · `tax` (TaxCloud, not yet wired) · `time` (market-dates tz helpers) · `utils` · `validation` · `vendor` · `vertical` (terminology/config)

## Money paths & protected files (issues here matter most; edits need per-file approval)
Critical-path files (`.claude/rules/change-discipline.md` Rule 3 + `protected-paths.txt`, hook-enforced):
`cart/items/route.ts`, `cart/items/[id]/route.ts`, `cart/validate/route.ts`, `checkout/session/route.ts`, `checkout/success/route.ts`, `checkout/external/route.ts`, `lib/stripe/payments.ts`, `lib/stripe/webhooks.ts`, `vendor/orders/[id]/reject/route.ts`, `vendor/orders/[id]/fulfill/route.ts`, `vendor/payouts/route.ts`, `lib/pricing.ts`, `lib/vendor-limits.ts`. Money model = Stripe **destination charges** (manager/vendor keeps base − 6.5%; platform keeps 6.5% + $0.15/txn flat).

## Key architectural facts (so you don't mis-flag them)
- **Browse page is ISR-cached** (`revalidate=300`, `anonSupabase`, no cookies); user-specific data via `BrowseBuyerOverlay` client overlay. `loading.tsx` skeleton reveals real latency, is NOT the slowness.
- **Server components MUST NOT `fetch()` their own API routes** — extract to `src/lib/**` and call directly (Vercel SSO 401s server-to-server fetches). Decisions 2026-04-10.
- **Payments use the service client** (buyers can't insert payments via RLS).
- **Notifications:** `sendNotification()` never throws, MUST be awaited; `sendNotificationBatch` for fan-out; vertical goes in the OPTIONS param, not templateData.
- **RPCs return PostgrestFilterBuilder** — no `.catch()`; errors are in the response object. 77 `.rpc()` calls across 42 files (hot in checkout/session, cart/items, expire-orders).
- **Vercel runs UTC** — server-side date comparisons need market-timezone awareness (`src/lib/time/market-dates.ts`). Timezone-drift fix shipped to staging (prod pending).
- Data model: **`supabase/SCHEMA_SNAPSHOT.md`** is the source of truth (structured tables marked STALE since 2026-04-24 — the Change Log is current; verify columns via `information_schema` if in doubt).

## Suggested review slices (one per pass; disjoint file sets)
1. **Checkout & payments** (cart/*, checkout/*, stripe/*, pricing, vendor-fees) — money, highest stakes
2. **Vendor orders lifecycle** (vendor/orders/*, order status, fulfill/reject/refund, inventory)
3. **Market-manager** (market-manager/*, booth/season booking, optin/agreement)
4. **FT park-operator** (park-spots, standing-reservations, book-park-spot, vetting)
5. **Events** (events/*, catering_requests, waves, viability, complete-event, new agreement/broadcast/ratings)
6. **Market-box / subscriptions** (market-boxes/*, subscriptions/*, market-box payout in webhooks)
7. **Auth / RLS / multi-vertical isolation** (supabase/*, service-client usage, vertical scoping)
8. **Crons** (the 5 jobs — money-timing in expire-orders is the key one)
9. **Notifications** (single pipe, fan-out, email volume)
10. **Admin** (49 routes — permissions, data accuracy)
