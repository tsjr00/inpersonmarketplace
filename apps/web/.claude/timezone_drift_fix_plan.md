# Timezone Drift Fix — Plan (2026-07-07)

**Status:** COMPLETE (2026-07-10) — all sites done: Groups 1-3 + #11. Groups 1-3 committed + on staging; #11 uncommitted. Awaiting the tz PROD push (apply mig 184 to Prod + push `main`). mig 184 applied Dev+Staging (Prod PENDING).

**#11 DONE (2026-07-10, uncommitted):** added `nextPickupDateInTimezone(pickupDow, tz?, now?)` to `market-dates.ts` (+ week-shift regression test). Fixed the two real market-box start-date sources: `buyer/market-boxes/route.ts` (added `pickup_market_id` to offering select + `markets` tz lookup) and `cart/items/route.ts` (CRITICAL-PATH, user file-level approval — `pickup_market_id` already selected + tz lookup). Backstops (`webhooks.ts:238`, `checkout/success:226`) LEFT ON UTC per user decision. tsc clean, 1613/1613 green.
**Source audit:** `backlog.md` Priority 1. All sites below RE-VERIFIED against current code 2026-07-07 (citations are live).

---

## ⭐ PROGRESS — session ending 2026-07-07 (resume here)

**Shared foundation built + validated (NEW file `src/lib/time/market-dates.ts`):**
- `todayInTimezone(tz?, now?)`, `tomorrowInTimezone(tz?, now?)`, `addDaysToDateString(ymd, n)` — pure, injectable `now`, fallback `America/Chicago`. Unit test `src/lib/time/__tests__/market-dates.test.ts` (6 tests, boundary + rollover + DST) PASSING. `tsc` clean. This is the reusable helper Groups 2-3 will import.

**Group 1 status:**
- ✅ **#8** `buyer/orders/route.ts` — added `timezone` to market-box market select (`:142`), swapped UTC `today` → `todayInTimezone(market?.timezone)` (`:385`). Display only.
- ✅ **#9** `quality-checks.ts` — scoped to `:149-150` (`checkLowStockEvents`, added `timezone` to select + per-market `today`/`nextWeek` in loop) and `:288` (`checkGhostListings`, per-market `today` at `:343`). **`:477` `checkInventoryVelocity` INTENTIONALLY SKIPPED** (user-agreed): it's a display detail derived from server-local `getDay()`/`now` DOW math (`:429,448,461`), a different/bigger bug class on a `suggestion`-severity advisory — logged as a separate low-pri item, NOT this fix.
- ✅ **#10** `get_listing_market_availability` — **migration `supabase/migrations/20260707_184_fix_listing_availability_dow_timezone.sql` CREATED, NOT YET APPLIED.** Fixes the two `EXTRACT(DOW FROM NOW())` (UTC) → market-local `v_today_dow`. **Display-only** (verified: checkout money gate is `is_listing_accepting_orders` mig 054; this fn only enriches the closed-order message + buyer availability). **USER TO APPLY on Dev + Staging** (then Claude does snapshot bookkeeping). Rides the tz-fix prod push, NOT the FT push.
- ⏸️ **#11 DEFERRED** (user, 2026-07-07) — see reclassification below. `polling-config.ts:14` confirmed NOT a bug (client-local `getHours()`, matches intent) — permanently dropped from scope.

**Group 2 status (2026-07-10, committed `a76b6a4d` + on staging):**
- ✅ **#10** mig 184 APPLIED Dev+Staging (Prod PENDING) + snapshot bookkeeping.
- ✅ **#7** Phase 11 event reminder — market-local "tomorrow" (2 UTC candidate dates → refine per-market via `catering_requests_market_id_fkey` embed + `tomorrowInTimezone`).
- ✅ **#6** Phase 4.6 stale-confirmed expiry — UTC `.lt` kept as superset bound; per-market cutoff in-loop via a `markets` tz map + `todayInTimezone`.
- ❌ **#4, #5 OUT OF SCOPE** — external payments INACTIVE/HISTORICAL (user, 2026-07-10). Do NOT touch. See [[project_external_payments_historical]].

**Group 3 status (2026-07-10, MONEY — code-complete, uncommitted until the Group 3 commit):**
- ✅ **#3** `no-show.ts` — `shouldTriggerNoShow` now compares local-vs-local (FT 1-hr rule, no `Z` stamp) + `todayInTimezone` fallback; added `marketTimezone` param. New injectable helper `nowInTimezoneLocalIso(tz, now?)` in `market-dates.ts`. **Tests rewritten (user-authorized) to assert market-local rule** across `no-show.test.ts`, `cron-timing-functional.test.ts` (CR-019/020), `business-rules-coverage.test.ts` (OL-R19) + a regression test the old UTC code would fail. This was the highest-value fix (old code paid vendors ~hours early on FT no-shows).
- ✅ **#1** Phase 4 payout caller — selects `market_id`, resolves market→tz map, passes `marketTz` to `shouldTriggerNoShow`. UTC `today` stays as SQL `.lte` superset bound.
- ✅ **#2** Phase 20 season auto-end/settle — select `end_date`, per-market tz map, only end once `end_date < todayInTimezone(marketTz)`. UTC `.lt` kept as superset bound.
- Full suite 1612/1612 green, `tsc` clean.

**Original Group-1 uncommitted note (historical):** Group 1 committed `0b913b22`; mig 184 + Group 2 committed `a76b6a4d` (both on staging).

### #11 RECLASSIFICATION (important — the original inventory below is incomplete for this item)
The plan listed #11 as "very low, fallback-only (`webhooks.ts:238`, `checkout/success:226`)." Investigation showed that's wrong:
- The **real** market-box start-date computation is UTC-based and **duplicated in 2-3 places**: `cart/items/route.ts:417-426` (add-to-cart, **CRITICAL-PATH**) and `buyer/market-boxes/route.ts:281-293` (direct checkout, payment-adjacent). The `webhooks.ts:238` + `checkout/success:226` `|| new Date()...` are just backstops that rarely fire (start date already set upstream).
- `subscribe_to_market_box_if_capacity` derives EVERY pickup date + `original_end_date` from `start_date` (trigger in `applied/20260420_124...:60,67`), so a drifted fallback shifts the whole subscription.
- Severity is **higher than "very low" when it fires**: concrete boundary case (CT buyer, Sun 9pm local = Mon 02:00 UTC, pickup day = Monday) → UTC path computes start **07-13**, correct market-local is **07-06** → box starts a **full week late**, pickups + settlement end-date all shift. Fires only in the evening window AND when buyer omits a start date.
- **Recommended #11 scope when resumed:** add `nextPickupDateInTimezone(pickupDow, tz)` to `market-dates.ts` (+ unit test locking the Monday week-shift case); fix ONLY the two real sources (`cart/items:417-426`, `buyer/market-boxes:281-293`) — add `timezone` to their offering→market selects; **leave the two webhook/success backstops unchanged** (critical-path money files, effectively unreachable, no tz context — pure risk for ~zero benefit). `cart/items/route.ts` is on the protected list → per-file approval with before/after required before editing.

### #11 BUILD PLAN (2026-07-10, sites re-verified against current code)
**Bug:** when a buyer does NOT supply a start date, the market-box subscription start date is computed from **server-UTC** `new Date().getDay()` + `.toISOString()`. In the evening window this can pick the wrong week → whole subscription (all pickups + settlement end-date) shifts by up to a week. Fires only when the buyer omits a start date AND it's the evening drift window.

**Sites (verified 2026-07-10):**
1. `cart/items/route.ts:417-426` — add-to-cart start-date computation. **CRITICAL-PATH FILE** (per-file approval + before/after diff required). Offering select already has `pickup_market_id` (`:353`) + `pickup_day_of_week` (`:354`).
2. `buyer/market-boxes/route.ts:281-293` — direct-checkout start-date computation (payment-adjacent, not on the critical-path list). Offering select has `pickup_day_of_week` (`:215`) but **NOT** `pickup_market_id` → must add it.
3. **Backstops — LEAVE AS-IS (do NOT touch):** `webhooks.ts:238`, `checkout/success:226` (`|| new Date()...`). Unreachable in practice (start date already set upstream), both CRITICAL-PATH money files, and no market-tz context there → pure risk for ~zero benefit. (Decision point for user; recommend leave.)

**Market tz source:** `market_box_offerings.pickup_market_id → markets.timezone`. Resolve via a single `markets` lookup by `pickup_market_id` in each route (one offering, not a list → no embed/FK-name dependency). Null `pickup_market_id` → America/Chicago (helper default).

**Shared helper (add to `market-dates.ts` + unit test):**
`nextPickupDateInTimezone(pickupDow: number, timezone?, now?)` → next occurrence of `pickupDow` (0–6) as YYYY-MM-DD, all in market tz. Preserves the existing "today IS pickup day → next week" semantics (`delta<=0 → +=7`). Reuses `addDaysToDateString`.
Unit test locks the week-shift: CT buyer Sun 9pm = `2026-07-06T02:00:00Z`, pickupDow=Mon(1) → `'2026-07-06'` (NOT the UTC-buggy `'2026-07-13'`).

**Steps:** (1) helper + test; (2) `buyer/market-boxes` — add `pickup_market_id` to select, `markets` tz lookup, replace `:281-293` with helper; (3) `cart/items` — PRESENT before/after, get file-specific approval, tz lookup via `pickup_market_id`, replace `:417-426` with helper; (4) tsc + tests. The change is isolated to the start-date fallback — it does NOT touch cart insert/pricing/RPC.

### Resume order (updated 2026-07-10)
1. **Only #11 remains** — handle per the reclassified scope below (its own careful sub-task, critical-path per-file approval). Awaiting user go.
2. Then the **tz prod push** (its own push): decide whether #11 rides it or ships separately. mig 184 still needs Prod apply as part of that push.
3. Groups 1-3 are done: `0b913b22` (G1), `a76b6a4d` (mig184+G2), + the Group 3 commit. G1/G2 already on staging.

---

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
| ~~4~~ | ~~`expire-orders` Phase 3 `:350`~~ | **OUT OF SCOPE — external payments (venmo/cashapp/paypal/cash) are INACTIVE/HISTORICAL (user, 2026-07-10). Do NOT touch.** | A | — | historical |
| ~~5~~ | ~~`lib/cron/external-payment.ts:43-47`~~ | **OUT OF SCOPE — external payments INACTIVE/HISTORICAL (user, 2026-07-10). Do NOT touch.** | A | — | historical |
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
- ~~`external-payment.ts:43-47` (#5)~~ — **OUT OF SCOPE: external payments INACTIVE/HISTORICAL (user, 2026-07-10). Do NOT touch external-payment code in any way.**
- ~~Phase 3 `:350` (#4)~~ — **OUT OF SCOPE: this is the external-payment order-cancel path (`payment_method in venmo/cashapp/paypal/cash`, `:344-350`). Historical. Do NOT touch.**
- Phase 4.6 `:922,:933` (#6) — expire stale confirmed. **IN SCOPE** — general confirmed-order cleanup (NOT external-payment-specific: `status='confirmed'` + `pickup_date < today` + untouched 7+ days).
- Phase 11 `:2028-2030` (#7) — event reminder (notif; market_id present → easy tz). **IN SCOPE.**

**⇒ Group 2 effective scope = #6 + #7 only.**

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
