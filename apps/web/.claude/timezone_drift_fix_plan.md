# Timezone Drift Fix — Plan (2026-07-07)

**Status:** Report/plan. NOT started. Money-path — its own focused session, before/after tests, NOT bundled with feature work.
**Source audit:** `backlog.md` Priority 1. All sites below RE-VERIFIED against current code 2026-07-07 (citations are live).

## The bug (one invariant, two sub-patterns)

Market-local calendar-date columns (`pickup_date`, `event_date`, `scheduled_date`, `end_date`, `week_start_date`) are compared against a **UTC-derived** "today"/"tomorrow" (`new Date().toISOString().split('T')[0]` / `.slice(0,10)`). Every US market is behind UTC, so after UTC midnight but before market midnight (each evening), UTC-today is ONE DAY AHEAD of market-local-today → a same-day row looks past-due.

- **Sub-pattern A — date-vs-UTC-today comparison.** The common one. Fix = resolve "today" in the row's market timezone and compare against that.
- **Sub-pattern B — local-time stamped as UTC.** `no-show.ts` FT path builds `` `${pickupDate}T${time}Z` `` — treats a market-LOCAL pickup time as UTC. Fix = compare local-vs-local strings (mirror `computeFireMomentLocal`), never append `Z`.

## INTACT — do NOT touch
The open/close "accepting orders" window: `get_available_pickup_dates` uses `(NOW() AT TIME ZONE COALESCE(m.timezone,'America/Chicago'))::DATE` (`applied/20260223_054_fix_availability_timezone.sql:48`); `is_listing_accepting_orders` + availability route funnel through it (absolute-instant `NOW() < cutoff_at`). This fix holds.

## The reference pattern (already correct in-repo)
Phase 14/15 in the SAME cron file does it right — per-row market tz:
```
const tz = event.market?.timezone || 'America/Chicago'
const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
const todayStr = `${localNow.getFullYear()}-${pad(localNow.getMonth()+1)}-${pad(localNow.getDate())}`
if (event.event_date <= todayStr) { ... }
```
(`expire-orders/route.ts:2306-2310`). Helpers exist: `nowInTimezoneAsLocalIso(tz)` + `recentLocalDates(tz)` (`lib/surveys/cron-helpers.ts:75,91`), and `computeFireMomentLocal` (same file, string-compare fire moments — the model for sub-pattern B).

## Verified site inventory

| # | Site | What it does | Pattern | Severity | Money? |
|---|------|--------------|---------|----------|--------|
| 1 | `expire-orders` Phase 4 `:656` | missed-pickup → PAYS VENDOR + notifies buyer | A | **Highest** | ✅ payout |
| 2 | `expire-orders` Phase 20 `:2771,:2776` | season auto-end/settle (`end_date < todayStr`) | A | **High** | ✅ settlement |
| 3 | `lib/cron/no-show.ts` `:47-56` (+ fallback `:62-63`) | FT no-show fire time → strike/payout timing | B (+A) | **High** | ✅ payout/strike |
| 4 | `expire-orders` Phase 3 `:350` | cancels unpaid external-payment orders (`pickup_date < today`) | A | Med-High | ✅ cancels order |
| 5 | `lib/cron/external-payment.ts:43-47` `getAutoConfirmCutoffDate` | auto-confirms digital external orders a day early | A | Med | ✅ auto-confirm |
| 6 | `expire-orders` Phase 4.6 `:922,:933` | expires `confirmed` orders a day early | A | Med | ✅ order state |
| 7 | `expire-orders` Phase 11 `:2028-2030,:2037` | event 24h prep reminder (`event_date = tomorrow` UTC) | A | Med | ❌ notif timing |
| 8 | `buyer/orders/route.ts:385-389` | buyer's "next pickup" (market box) — display | A | Low | ❌ display |
| 9 | `lib/quality-checks.ts:149-150` (+ `:288,:477`) | low-stock-event window — internal scan | A | Low | ❌ internal |
| 10 | Display SQL `get_listing_market_availability` (per audit `applied/…001…:213`) | "next schedule" DOW order | A | Low | ❌ display |
| 11 | Fallback-only: membership `start_date` (`webhooks.ts:238`, `checkout/success:226`); `polling-config.ts:14` | only when startDate missing / poll cadence | A | Very low | ❌ |

## The key implementation question — RESOLVED (2026-07-07)
**`order_item → market timezone` = `order_items.market_id → markets.timezone`**, COALESCE `'America/Chicago'`. Verified:
- `order_items.market_id` (snapshot `:372`, nullable) → `markets.timezone` (snapshot `:317`, nullable).
- **All three pickup types are `markets` rows** — regular market, event, AND **private pickup location** (`market_type='private_pickup'`; vendors INSERT into `markets`; mig `20260120_001:29`). No separate location table — one join covers every phase.
- Null-`market_id` order_items (rare edge) → `America/Chicago` fallback (matches the DB convention below).

Phases 3/4/4.6 fix = join `markets(timezone)` via `order_items.market_id`, resolve local-today per market, compare per-row (Phase 14/15 shape). Events (11) + seasons (20) already carry `market_id` — same join.

## Fallback decision — REVISED: `America/Chicago`, NOT state-inference
User first said "infer from state," but the ENTIRE codebase already handles null `markets.timezone` with flat **`COALESCE(timezone,'America/Chicago')`** — mig 054 (`:46,:48`, the intact fn) + JS `nowInTimezoneAsLocalIso`. If JS inferred CT-vs-ET from state while the DB falls back to CT for the same null-tz market, they'd DISAGREE → a NEW drift bug. Use `America/Chicago` to stay DB↔JS consistent; it only fires when tz is null (rare). Real remedy for the rare null = a small **`markets.timezone` backfill** (separate cleanup). **CONFIRMED (user 2026-07-07): use `America/Chicago` for consistency** — no state-inference.

## Fix approach per pattern

**Sub-pattern A (date comparisons):**
1. Widen the SQL date filter so we don't drop today's rows: change `.lt('pickup_date', UTCtoday)` → fetch a superset (e.g. `.lte('pickup_date', UTCtoday)`, or filter by status only), because we can't compare against a single UTC date in SQL once "today" is per-market.
2. In the existing per-row loop, resolve `todayLocal = ` market-tz today (reference pattern) and act only if the date column is strictly `< todayLocal` (or `= tomorrowLocal` for Phase 11).
3. Over-fetch is bounded (~1 extra day of candidate rows) and refined in-loop — acceptable.

**Sub-pattern B (no-show FT time):** rebuild `no-show.ts` FT branch to string-compare local moments: `fireAtLocal = ${pickupDate}T${pickupTime}` + 1h, vs `nowInTimezoneAsLocalIso(marketTz)` — no `Z`, no instant math. Requires threading `marketTimezone` into `shouldTriggerNoShow(...)` (signature change) and into the fallback `today` (`:62`). Update all callers to pass tz.

`external-payment.ts` (5): `getAutoConfirmCutoffDate` is currently tz-agnostic (one global cutoff). Either add a `timezone` param and compute per-market, or move the cutoff decision into the caller's per-row loop. Confirm the caller shape before choosing.

## Testing strategy
- **Pure/injectable functions** get unit tests with a fixed `now` straddling the UTC/market boundary (e.g. `now = 2026-07-07T02:00:00Z` = still 07-06 in CT): `no-show.ts` (`now?` param already), `external-payment.ts` (`now?` already), plus any extracted date helper. Assert the CT-evening case does NOT fire early and the true-past case DOES.
- **Cron phases** (not pure): extract the date decision into a testable helper where feasible, or add a targeted test around the resolved-today logic. For the money phases (1,2,4,6), write a before/after note in the PR: what fired under UTC vs what fires under market-tz for a boundary case.
- Flow-integrity: add a contract test asserting the money-path phases resolve tz per market (guards regression).
- **NEVER** change a test to match the buggy code (test-integrity Rule 1) — tests assert market-local correctness.

## Sequencing — by blast radius, SMALL → LARGE (user-directed 2026-07-07)
Do the small, low-risk sites first and use them to build + unit-test the shared pieces the big money items will reuse, so the hard problems are solved before we touch money.

**Shared problems to resolve DURING Group 1 (reused by all later groups):**
- (a) a per-market "today/tomorrow in market tz" helper (extend `cron-helpers.ts` or reuse `nowInTimezoneAsLocalIso`);
- (b) **null-timezone fallback = `America/Chicago`** (user-confirmed 2026-07-07) — matches mig 054 `COALESCE(timezone,'America/Chicago')` + the JS helpers, so DB↔JS stay consistent. NO state-inference (would create new DB↔JS drift). Real remedy for the rare null is a separate `markets.timezone` backfill;
- (c) **order_item → market timezone resolution** (the key unknown) — solve on a LOW-RISK site (buyer/orders display) and validate before reusing for the Phase 4 payout.

**Group 1 — SMALL blast radius (no money moves; contained). Start here.**
- `buyer/orders:385-389` (#8) — display next-pickup. Smallest; forces + validates order→market-tz resolution cheaply.
- `quality-checks.ts:149-150` (+`:288,:477`) (#9) — internal advisory scan.
- Display SQL `get_listing_market_availability` (#10) — ordering only.
- Fallbacks (#11) — membership start_date / poll cadence.

**Group 2 — MEDIUM (state changes; reversible or non-payout).**
- `external-payment.ts:43-47` (#5) — auto-confirm cutoff (pure, `now?` injectable → unit test).
- Phase 3 `:350` (#4) — cancel unpaid external orders.
- Phase 4.6 `:922,:933` (#6) — expire stale confirmed.
- Phase 11 `:2028-2030` (#7) — event reminder (notif; market_id present → easy tz).

**Group 3 — LARGE (irreversible money movement). Do last, full before/after.**
- `no-show.ts:47-63` (#3) — strikes + payout timing (patterns A+B; note: HIGH blast despite being testable — it gates payout, so it moves here from "first").
- Phase 4 `:656` (#1) — PAYS VENDOR on missed pickup.
- Phase 20 `:2771,:2776` (#2) — season auto-end + SETTLEMENT (market_id present → easy tz; high money impact).

Ship ≥2 commits: Group 1 (+shared helpers), then Group 2, then Group 3 each verified. Every Group 2/3 site: verify → present → test → edit.

## Deployment note
This is a LIVE prod bug (crons run prod-only but daily). The fix should reach prod on its own merit — decide whether to ship it ahead of / bundled with the FT-port push. Own careful session; staging-verify what's testable (note: expire-orders early-returns when `VERCEL_ENV !== 'production'`, so most phases only truly run in prod — unit tests + a seeded staging row are the verification levers).

## Decisions (user 2026-07-07)
1. **Fallback tz = `America/Chicago`** (matches mig 054 + JS helpers; NOT state-inference — that would drift DB↔JS). See Group-1 shared piece (b).
2. **Ship path** — RECOMMEND: push the FT-port to prod FIRST (it's staging-verified/ready), then ship the timezone fix as its own isolated follow-up prod push. Reason: `main` is linear with the FT-port stacked below, so the tz fix lands on top of it anyway; separate deploys keep each small + independently rollback-able, and an isolated tz deploy is easy to verify (cron/money timing) without FT-port noise. The bug is pre-existing (not an emergency), so the short wait is fine. Alternative if it must be live immediately: a hotfix branch from prod tip `426deff4` (more git work — only if urgent). AWAITING user pick.
3. **Scope = grouped small→large** (see Sequencing). Start Group 1.
