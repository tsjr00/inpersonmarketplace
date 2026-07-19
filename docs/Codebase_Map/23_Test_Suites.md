# 23 — Test Suites

<!-- map-stamp: domain=test-suites; verified=2026-07-18; commit=b9f82116 -->

**Measured 2026-07-18 by live run:** 64 test files, **1694 tests, all passing, 18.6 seconds**. Plus ~49 Playwright smoke tests in one spec.

---

## Read this first — the testing philosophy

**The tests are the specification. The code conforms to the test, never the reverse.** This is stated as an absolute rule in `apps/web/.claude/rules/test-integrity.md`, and it is the single most important thing to understand before touching anything here.

The governing insight: *a test that mirrors the code's current behavior catches nothing — it is security theater.* Editing a test to make it pass deletes the detection capability it existed to provide and replaces verification with false confidence.

### The four rules, accurately

1. **Never change a business-rule test to match code.** Before writing or editing any `expect(...)`, ask where the expected value came from. From the spec → fine. From reading the code under test → **stop**, find the spec; if none exists, flag it rather than silently adopting the code's value. "I'm changing it because it's failing" → **stop**; a failing test is a decision point, not a to-do item. Count-only assertions (`expect(arr.length).toBe(4)`) must be upgraded to value assertions — counts pass when the *wrong* items are present. On a genuine conflict, change **neither**: state the conflict, leave the test asserting the rule, and annotate `// BUG: code does X, rule requires Y`.
2. **Never skip, conditionally skip, or soft-fail.** Banned in business-rule files: `describe.skip`, `it.skip`, `xit`, `xdescribe`, `.runIf`, and env-var early returns. If a test needs infrastructure, **make the infrastructure available everywhere tests run** — never silence the test. The hierarchy is explicit: *app correctness > test accuracy > CI green > deployment speed > developer convenience.* When in doubt, make failures louder.
3. **Never pre-plan test modifications.** If "update tests" / "fix failing test" / "update baseline" appears in a plan, that plan has already failed — authoring the code change and the test update in one mental motion destroys the test's independence. Approval to change code is **not** approval to change test expectations.
4. **Flow-integrity tests run on every feature audit.** A new cross-file contract obligates a matching entry in `flow-integrity.test.ts` before the feature is done.

None of these are overridable by time pressure or autonomy mode.

### Corollaries visible in the code

- **Nearly every test file restates the rule in its own header** — that's the reminder placed at the point of temptation, not boilerplate.
- **Route logic is extracted into pure functions specifically so it can be tested without a server.** `lib/vendor/__tests__/event-readiness-validation.test.ts` is the documented proof of concept; `lib/cron/__tests__/*` and `lib/orders/__tests__/*` apply it at scale. Write routes thin.
- **Structural tests are first-class here.** A large share of the suite asserts *code shape* — guards present, markers present, retired patterns absent — rather than behavior, because many of these bug classes are unreachable from a unit test and only appear in production. Do not dismiss them as "not real tests."
- **Allowlists shrink, never grow silently.** money-structure and guardrail-contracts *fail* when an allowlist entry stops matching real code, so the lists must track reality. Removals are dated and annotated with the finding ID that closed them.
- **Unconfirmed rules are deliberately untested.** Auth/Access Control and Notifications R1–R18 are excluded from the coverage index because they were never user-reviewed. Don't fill that gap unprompted — an unverified assumption encoded as a test becomes a fake spec future sessions will defend.

---

## The immune system — suites that must never be weakened

These six do not test functions. They test that the codebase still has the *shape* that prevents a class of money bug. Each is the residue of the July 2026 pre-relaunch review.

### `lib/__tests__/money-structure.test.ts` — Rules A–E

Five structural rules, each distilled from a defect found in **two or more independent modules**.

| Rule | Enforces | A failure means |
|---|---|---|
| **A — guarded status flips** | Every `.update({status})` on `orders`, `order_items`, `park_spot_bookings`, `vendor_payouts`, `park_standing_reservations` carries a status precondition in the same chain (`.eq/.in/.neq('status')` or `.is('cancelled_at')`) | Someone added an unguarded status flip — the exact shape of the MBX-3/MBX-7 corruption bugs; a concurrent writer can double-move money |
| **B — expire before release** | The Stripe session is expired *before* the payment-holding row is released. Found at three independent sites | A buyer can pay for a row already given away |
| **C — no `console.error` in money files** | Money errors go to `error_logs`, not stdout. Zero for clean files; a **shrinking ratchet** for legacy ones | A money failure just became invisible in production |
| **D — `sourceTransaction` on transfers** | Every `stripe.transfers.create` is anchored to its source charge | A transfer can draw on platform balance instead of the buyer's charge |
| **E — new error codes cataloged** | Any newly-used error code appears in the catalog; cataloged baseline entries must be *removed* | Support cannot decode a live error |

**The allowlist discipline is the load-bearing part.** Every entry carries a written reason or an open finding ID, and entries that stop matching real code **fail the suite** — so the lists cannot rot. Adding an entry is a deliberate reviewed act; weakening a rule instead of adding a reasoned entry is itself a rule violation.

### `lib/__tests__/pricing-conservation.test.ts` — 8 property loops

Deterministic seeded PRNG so failures reproduce exactly; thousands of randomized inputs per identity. Thesis: the tip and fee bugs of the review were all one shape — **the parts stopped summing to the whole.**

Key identities: `Σ proratedFlatFee(fee, N, i) === fee` exactly · **`buyerTotal − vendorPayout === platformFee`** exactly · `buyerPrice ≥ base ≥ vendorPayout` · `vendorTip + platformFeeTip === totalTip` · per-item tip drift ≤ `⌈N/2⌉` cents · booth split `vendorPays > managerReceives ≥ 0` across all `operator_keep_pct ∈ [0.935, 1.0]`.

A failure means money is being created or destroyed in the pricing pipeline.

### `app/api/__tests__/money-authorization.test.ts` — the 8-rule spec

User-signed-off 2026-07-13.

| # | Rule |
|---|---|
| R1 | An item on an order with **no succeeded payment can never produce a Stripe transfer** — via fulfill, buyer-confirm, or cron Phases 4/7 (includes a positive control proving the gate doesn't false-block paid orders) |
| R2 | A `cancelled`/`refunded` item can never become `fulfilled`/`expired`, by any path |
| R3 | A non-duplicate `vendor_payouts` insert failure always blocks the transfer (23505 is the idempotent case) |
| R4 | A completed payout is never modified by webhook events for a *different* transfer |
| R5 | When every item is cancelled, the refund includes **tip + small-order fee**, asserted at both sites |
| R6 | An issue-refund on a paid-out item always produces a fee-ledger debit or a payout cancellation |
| R7 | A **blocked truck** can neither create nor pay for any park booking or occurrence |
| R8 | An unpaid park booking reaches `'paid'` only via the Stripe webhook flip, which is the sole writer and is guarded |

R1–R3 are driven behaviorally against the **real route handlers** with a fixture-driven Supabase mock; the rest are anchored structurally.

### `lib/__tests__/guardrail-contracts.test.ts` — Rules F/G/H

Explicitly **cross-session** protection: each rule encodes a way one session silently undoes another's verified work.

- **Rule F — SQL function contract markers.** Critical RPCs evolve by `CREATE OR REPLACE` (whole-body swaps), so the **newest** migration defining each listed function must still contain its named invariants. The concrete failure mode: rebuilding `get_available_pickup_dates` from migration 162's body would silently drop the paid-park intersection (199) and barred exclusion (200), letting buyers order dates trucks never booked — **with no other failing test.** Covers `get_available_pickup_dates`, `claim_vendor_fee_deduction`, `redeem_booth_credit`, `get_booth_credit_expiry_state`.
- **Rule G — migration bookkeeping.** Every migration numbered ≥ 184 must have a `SCHEMA_SNAPSHOT.md` changelog row, or the next session's schema gate runs on stale data.
- **Rule H — retired patterns stay retired.** `calculateAutoDeductAmount` and `restoreOrderInventory` must be referenced only by their own definitions; resurrection re-opens a fixed money bug.

### `lib/__tests__/flow-integrity.test.ts` — ~60 tests

Tests cross-file contracts that file-level audits structurally cannot catch — each file correct alone, the bug being the missing connection. (Origin: signup emails linking to an auth-required page that couldn't authenticate until `verifyOtp()` ran *on that page*.)

Sections: auth flow integrity · PostgREST FK disambiguation · frontend-backend param contracts · RPC usage completeness · payment-model completeness · event status reachability · manager permission boundary · season flow integrity · booth assignment honors manager pins · season status lifecycle · make-up days · FT park-manager flow.

### `lib/__tests__/integration/business-rules-coverage.test.ts` — ~133 tests

The **coverage index**: maps every confirmed business rule to its test location. Domains: MP money path (28) · OL order lifecycle (22) · VI vertical isolation (19) · VJ vendor journey (15) · SL subscription lifecycle (16) · cross-domain conservation · IR infrastructure R1–R29. Zero `it.todo` remain.

Deliberately excluded: Auth & Access Control (unreviewed domain) and Notifications R1–R18 (observations, not user-confirmed).

---

## Full inventory by area

**API / component** — `api-route-guards` (auth 401 / rate-limit 429 / validation 400, handlers imported directly with mock `Request`) · `money-authorization` *(immune)* · `component-renders` (38 render smoke tests, RTL + jsdom).

**Money & pricing** — `money-structure` *(immune)* · `pricing-conservation` *(immune)* · `pricing` (67) · `order-pricing-e2e` (26) · `refund-consistency` (**all four refund paths produce identical amounts for identical input**) · `tip-math` (25) · `tip-rules` (12) · `vendor-fees` (8) · `vendor-fees-functional` (31) · `external-fee-flow` (24 — the five-file external fee architecture; "if this fails, the platform is losing money on external orders") · `cancellation-fees` (19) · `platform-revenue` (11) · `settlement-math` (17, locked 2026-06-27) · `cancel-credit` (12, locked) · `booth-credit-balance` (5) · `checkout-helpers` (22) · `webhook-utils` (13).

**Order lifecycle & cron** — `orders/status-transitions` (51) · `status-transitions-functional` (54) · `order-cron-rules` (20) · `order-lifecycle.integration` (10, real DB) · `cron-timing-functional` (56) · `cron/order-timing` (19) · `cron/external-payment` (22) · `cron/no-show` (15) · `cron/retention` (9) · `cron/quality-checks-logic` (12) · `inventory-restore` (12 — FT fulfilled items don't restore, FM do).

**Vendor & verticals** — `vendor-limits` (43) · `vendor-tier-limits` (29, exact tier values) · `vendor-onboarding` (20) · `event-readiness-validation` (42) · `getVendorProfile` (9) · `vertical-isolation` (39) · `vertical-config` (18) · `vertical-features` (26) · `schedule-overlap` (24) · `availability-status` (16) · `pickup-formatters` (31) · `cutoff-and-sort-functional` (25, includes the notification-type count tripwire).

**Markets, parks, time** — `season-window` (13) · `park-week-schedule` (10) · `park-standing` (12) · `park-checkin-reminders` (6) · `market-dates` (7 — guards the exact bug where server-UTC rolled a full extra week).

**Notifications & infra** — `notification-types` (51) · `email-config` (10) · `infra-config` (32) · `rate-limit` (6) · `errors` (11, incl. details must not leak in production) · `db-constraints.integration` (4, real DB) · `subscription-amounts-functional` (23) · `subscription-lifecycle.integration` (17) · `event-business-rules` (28, written from requirements rather than code).

**Cross-cutting** — `flow-integrity` *(immune)* · `guardrail-contracts` *(immune)* · `business-rules-coverage` *(immune)* · `cross-file-business-rules` (61 — each rule enforced identically in *every* file in its chain) · `admin-account-integrity` (12, a deliberate self-protecting chain: delete the file and the suite count drops, failing CI — origin: both admin accounts vanished from production `auth.users`, undetected) · `browse-location` (36 — **has broken three times**; violations are regressions, not reasons to update the test) · `performance-baseline` (25 — query counts, waterfall depth, parallelization, loading skeletons; baseline changes require before/after measurements and approval *before* touching the test).

---

## Infrastructure

**`vitest.config.ts`** — `include: src/**/*.test.{ts,tsx}`, 15s timeout, `loadEnv` so `.env.local` service-role keys reach integration tests, `@` → `./src`. **There is no exclude for integration tests** — `db-constraints`, `order-lifecycle` and `subscription-lifecycle` run against dev Supabase on *every commit*. That is intentional per Rule 2: infrastructure must be available wherever tests run.

> **Stale references:** several integration-test headers point at a `vitest.integration.config.ts` for isolated runs. **That file does not exist in the repo** — the run commands in those headers are stale.

### Gates by hook (`.husky/` at repo root)

**pre-commit** (~20s total):
1. **Schema-snapshot gate** — a staged `supabase/migrations/*.sql` requires a staged `SCHEMA_SNAPSHOT.md`. Instant.
2. **Amend-of-pushed-commit heuristic** — compares `GIT_AUTHOR_DATE` to HEAD's (amend preserves it) against `origin/main`/`origin/staging`. Covers the `--amend -m` gap. Override `REWRITE_OVERRIDE=`.
3. `lint-staged` → ESLint `--fix` on staged TS/TSX.
4. `tsc --noEmit` → full typecheck, with `exactOptionalPropertyTypes`.
5. `vitest run` → **the entire 1694-test suite, ~19s.**

**pre-push** (fail-fast):
1. **Production push window** — pushes to `origin refs/heads/main` allowed only 21:00–06:59 America/Chicago. Staging unaffected. Override `PUSH_WINDOW_OVERRIDE=hotfix`.
2. `npm run build` — the same `next build` Vercel runs, and stricter than `tsc --noEmit`. 30–60s warm.
3. `playwright test --max-failures=1` — stops at the first failure so one break doesn't cascade into 20 minutes of timeouts.

**pre-rebase** / **prepare-commit-msg** — block rewriting commits reachable from `origin/main` or `origin/staging`.

### Playwright (`e2e/smoke.spec.ts`, ~49 tests)

Deliberately narrow: page loads and element presence. **No visual/CSS testing, no Stripe iframe interaction, no data-creating submissions** — read-only and safe against staging.

Chromium only, `workers: 1` (sequential, to avoid tripping rate limits), 30s timeouts, `retries: 1`. `baseURL` defaults to localhost:3002, overridable via `PLAYWRIGHT_BASE_URL`. The web server runs `npm run start` (production build), **not** `npm run dev`, because Turbopack dev mode hangs compiling `/[vertical]/signup` on this codebase. **Two independent production guards:** a config-level prohibition, plus a `beforeAll` that hard-throws if the baseURL contains `farmersmarketing.app`, `foodtruckn.app` or `815enterprises.com`.

Playwright is the one suite with a documented "when to update" list: intentional page-structure changes only (route added/removed/renamed, auth requirement flipped) — never for CSS, component churn, reordering, or copy changes.

## Largest suites

`business-rules-coverage` (133) · `pricing` (67) · `cross-file-business-rules` (61) · `flow-integrity` (60) · `cron-timing-functional` (56) · `status-transitions-functional` (54) · `notification-types` (51) · `orders/status-transitions` (51).

> **Note on that last pair:** roughly 51 tests exercise `lib/orders/status-transitions.ts`, a module **no production code imports**. It is the suite's largest single source of false confidence and is a tracked open decision — see [11_Vendor_Orders.md](11_Vendor_Orders.md).
