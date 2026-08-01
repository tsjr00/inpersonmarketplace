# 17 — Crons / Scheduled Jobs ⚠ money

<!-- map-stamp: domain=crons; verified=2026-07-31; commit=b597ef70 -->
<!-- map-claims
src/app/api/cron/**
src/lib/cron/**
-->

Six scheduled jobs. One of them — `expire-orders` — is the platform's master sweeper and the highest-risk recurring process in the system.

---

## Read this first

1. `apps/web/vercel.json` (25 lines) — all five schedules.
2. `expire-orders/route.ts:39-129` — the phase index, the `maxDuration` rationale, and the soft-budget mechanism. These 90 lines explain the structure of the 3,292-line file.
3. The five pure helpers in `lib/cron/` (68–87 lines each, all unit-tested) — they hold the actual business rules.

**Do not read `expire-orders` top to bottom.** Jump to the phase you need by the line anchors below.

**The critical operational fact:** phases run in order under a 270-second soft budget with checkpoints only after Phases 3.6, 4.7, 6, 9, 15.5 and 17 — so a slow Phase 5 or 18 defers everything downstream to the next day.

## Schedules (`apps/web/vercel.json`)

| Route | Cron (UTC) | Human | Money |
|---|---|---|---|
| `/api/cron/expire-orders` | `0 12 * * *` | daily 12:00 UTC | **YES** — transfers, refunds, session expiry |
| `/api/cron/vendor-activity-scan` | `0 8 * * *` | daily 08:00 UTC | No |
| `/api/cron/vendor-quality-checks` | `0 14 * * *` | daily ~8am CT | No |
| `/api/cron/surveys` | `0 * * * *` | hourly | No |
| `/api/cron/park-docs-review` | `0 12-23,0-2 * * *` | hourly, ~7am–8pm CT (DST-safe) | No |
| `/api/cron/remit-cause-funds` | `0 8 * * 1` | weekly Mon 08:00 UTC (~3am CT) | **YES** — Community Chip In Connect payouts |

**Crons run on PRODUCTION only** — Vercel does not fire schedules on preview or staging deployments. `expire-orders` and `vendor-activity-scan` additionally hard-skip when `VERCEL_ENV !== 'production'`. To exercise a cron elsewhere, invoke the route manually with the `CRON_SECRET` bearer token.

**Auth (all six):** `Bearer ${CRON_SECRET}` with a timing-safe comparison.

## `expire-orders` — the master sweeper

**`maxDuration = 300`** (the Vercel Pro ceiling), raised from 60s because Phase 5 (payout retries) and Phase 18 (season reconciliation) individually exceeded the old budget; a mid-run kill silently skipped later phases and opened a double-restore window.

**Soft budget:** `SOFT_BUDGET_MS = 270_000`. `budgetStopAfter(phase)` checks elapsed time *between* phases; on breach it logs `ERR_CRON_001` and returns `{ success: true, partial: true, stoppedAfter }`.

> A former zero-work early-return gate was **removed** because it counted only 6 work types and no-op'd Phases 8–21 entirely on a quiet platform. Do not reintroduce a global gate — this is a coded business rule (IR-R20).

| Phase | Line | What it does | Money |
|---|---|---|---|
| 1 | `:131` | Expire items past `expires_at` (vendor never confirmed); on last-item expiry also refunds order-level tip/fee | **YES** |
| 2 | `:340` | Cancel pending Stripe orders past the 10-minute checkout window; expires the session first | **YES** |
| 3 | `:405` | Cancel external-payment orders past pickup time | No |
| 3.5 | `:487` | Vendor reminder for unconfirmed external orders (per-vertical delay) | No |
| 3.6 | `:572` | Auto-confirm digital external orders 24h after pickup date | Indirect |
| 4 | `:713` | **Buyer no-show handling** — creates payout + Stripe transfer; gated so an order with no completed payment is left untouched | **YES** |
| 4.5 | `:916` | Notify on stale confirmed orders never marked ready | No |
| 4.6 | `:1034` | Auto-expire stale confirmed orders | Indirect |
| 4.7 | `:1112` | Auto-miss market-box pickups 2+ days overdue | Indirect |
| 5 | `:1218` | **Payout retry engine** — failed payouts, `pending_stripe_setup` payouts, market-box payouts. Global cap of 15 transfers per run. Also ages stale `processing` (>7d) and `pending` payouts to `failed`, and cancels payouts past the retry-days limit with an admin alert | **YES** |
| 6 | `:1675` | Error report digest email to admin | No |
| 7 | `:1760` | Auto-fulfill stale confirmation windows; same payout path as Phase 4, failures downgraded to `failed` for Phase 5 retry | **YES** |
| 8 | `:1986` | Expire vendor/buyer tier subscriptions past `tier_expires_at` | Entitlements |
| 9 | `:2050` | Data-retention cleanup — **Sundays only** | No |
| 10a/b/c | `:2101`/`:2143`/`:2179` | Vendor trial lifecycle: reminders → expiry → grace-period auto-unpublish of excess listings. **Dormant** (`TRIAL_SYSTEM_ENABLED = false`) | Indirect |
| 11 | `:2256` | Event prep reminders (24h before) | No |
| 11.5 | `:2319` | Nudge self-service events stuck in `new` with no address | No |
| 12 | `:2356` | Self-service event response threshold + results email | No |
| 13 | `:2499` | Event vendor gap alert at 24h (suppressed after 48h — Phase 12 owns that) | No |
| 13.5 | `:2568` | Expire stale wave reservations | No |
| 14 | `:2609` | Event `ready → active` on event day | No |
| 15 | `:2639` | Event `active → review` after the event ends | No |
| 15.5 | `:2670` | Auto-complete events 3 days after end | Indirect |
| 16 | `:2718` | Expire abandoned booth-rental bookings | Releases inventory |
| 17 | `:2918` | Auto-decline stale manager-initiated vendor invitations | No |
| 18 | `:2967` | Reconcile pending season booth groups against Stripe; capped at 25 lookups per run, remainder deferred | **YES** |
| 19 | `:3067` | **Booth-credit expiry sweep** + use-it-or-lose-it warnings; skips with `ERR_CRON_002` if the RPC is missing | **YES** |
| 20 | `:3152` | Auto-end seasons past `end_date`; splits into make-up window vs settled-no-debt | **YES** |
| 21 | `:3205` | FT standing/recurring spot reservations — generate, release, suspend | Indirect |

## The other five

| File | Purpose |
|---|---|
| `cron/vendor-activity-scan/route.ts` | Calls a DB scan flagging inactive vendors and auto-resolving stale flags; `maxDuration = 30`; accepts an optional `?vertical=` |
| `cron/vendor-quality-checks/route.ts` | Runs the five quality checks (schedule conflicts, low stock, price anomalies, ghost listings, inventory velocity) and sends **one grouped notification per vendor** |
| `cron/surveys/route.ts` | Post-market survey generation with per-market local fire times (market closes before 18:00 → 18:00 same day; at/after 18:00 → 08:00 next day). Inserts `market_surveys`, sends in-app + branded email. **Also runs `runParkCheckinReminders`** — which is why this cron must stay hourly |
| `cron/park-docs-review/route.ts` | 36-line wrapper: auth check, then `runParkDocsReviewSweep()` from `lib/markets/park-docs-review` |
| `cron/remit-cause-funds/route.ts` | Community Chip In (mig 213): batch-remits accumulated chip-in balances (≥ $10) to **Connect** beneficiaries via `runCauseRemitSweep` (`lib/cause/remit.ts`); deduct-first for no-double-pay; check-method orgs are paid manually at `/admin/cause` |

## Library

| File | Purpose |
|---|---|
| `lib/cron/order-timing.ts` | Pure timing constants for Phases 2/5/7 and confirmation windows (`STRIPE_CHECKOUT_EXPIRY_MS = 10 min`) |
| `lib/cron/no-show.ts` | `calculateNoShowPayout()` — vendor payout + prorated tip share on buyer no-show |
| `lib/cron/external-payment.ts` | Per-vertical reminder delays for unconfirmed external orders: food trucks 15 min, farmers market 12 h |
| `lib/cron/retention.ts` | `DATA_RETENTION_DAYS` (error_logs 90 / notifications 60 / activity_events 30) + `isCleanupDay()` = Sunday UTC |
| `lib/cron/quality-checks-logic.ts` | Pure dedup, grouping and formatting for the quality-checks cron |

Each has a dedicated unit-test file — the business rules live in these helpers precisely so they're testable without invoking a 3,000-line route.

## Why the surveys cron is hourly

Survey fire moments are **per-market-timezone local**, so a daily job cannot hit them correctly. The route is also shared with intraday work (park check-in reminders at open/midday/pre-close) that genuinely needs hourly cadence. The cost concern was addressed differently: survey *generation* is gated to once daily and supplemented by lazy on-return generation when a user next visits, so returners are never emailed. See `lib/surveys/lazy-generate.ts`.
