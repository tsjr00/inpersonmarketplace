# P6 — Operator-Keep-% Money Path (RM lever) — Design & Build Plan

**Created:** 2026-07-03. **Mode:** Report (planning; NO code until each phase is approved).
**Status:** Plan drafted. Build not started. ⚠️ **MONEY PATH — touches critical-path `payments.ts` (per-file approval, exact diffs, before/after math).**
**Grounding (verified, cite-don't-trust):** current fee math `pricing.ts:295-345`; park checkout `payments.ts:470-544`; economics `operator_projection_tool.md:16-29`; decisions `decisions.md` 2026-06-28 (RM economics). Design hook: `ft_park_manager_design.md` P6.

---

## TL;DR
Make the **operator's share of a booth/spot rental configurable per market** via `markets.operator_keep_pct`, so the platform can rebate the operator-side fee (operator keeps up to 100% of base) as a switch/RM incentive — while the **vendor pays exactly the same** and the platform still earns the vendor-side markup. Default = current behavior, byte-identical. This is the REAL implementation of the projection tool's headline lever (the tool is projection-only today).

---

## The money math (the crux)

**Current** (`calculateBoothRentalFees`, pricing.ts:324-345; `BOOTH_RENTAL_FEES` :295-299):
- `vendorPays   = round(base × 1.065) + 15`   (base + 6.5% + $0.15)
- `managerReceives = base − round(base × 0.065)`   (base − operator-side 6.5%)
- `platformKeeps  = vendorPays − managerReceives`
- $25 booth (2500¢) → vendor **2678**, operator **2337**, platform **341** (= operator-side 163 + vendor-side 178).

**With `operator_keep_pct` (keep the SAME structure — only the operator-side fee becomes configurable):**
- Define `operatorFeePct = 1 − operator_keep_pct` (default keep 0.935 → fee 0.065 = current).
- `managerReceives = base − round(base × operatorFeePct)`
- **`vendorPays` UNCHANGED** — vendor always pays base + 6.5% + $0.15 regardless of keep rate.
- `platformKeeps  = vendorPays − managerReceives` (shrinks toward the vendor-side markup as keep→100%).
- **Invariant:** at `keep=0.935` the formula is **identical to current** (base − round(base×0.065)) → **zero change to existing FM booth/season payouts** (byte-for-byte). At `keep=1.0`: operator gets full base 2500, platform keeps only the vendor-side 178.

> ⚠️ **Rounding note:** must use `base − round(base × (1−keep))`, NOT `round(base × keep)` — the latter differs by a cent at 0.935 (2500: 2500−163=2337 vs round(2337.5)=2338) and would silently shift every existing payout by ±1¢. The plan locks the `base − round(base×operatorFee)` form to preserve exact current behavior at default.

**What NEVER changes:** the vendor's charge, the flat $0.15, the vendor-side 6.5%. Only how the operator-side markdown is split between operator and platform. Platform stays cash-positive at any keep ≤ 100% (still earns vendor-side ~$1.78/booth).

---

## Data model
`markets.operator_keep_pct NUMERIC(4,3) NOT NULL DEFAULT 0.935 CHECK (operator_keep_pct BETWEEN 0.935 AND 1.000)`
- Default 0.935 grandfathers every existing market to current behavior (additive + inert until read).
- Range floor 0.935 = never take MORE from the operator than today (no penalty tier); ceiling 1.000 = full base. (Range is an open decision — see below.)
- Additive column migration; SCHEMA_SNAPSHOT changelog.

---

## Files touched (blast radius)
1. **Migration** — add `markets.operator_keep_pct` (additive, default 0.935).
2. **`pricing.ts calculateBoothRentalFees`** — add optional `operatorKeepPct = 0.935` param; change only the `managerReceives` line to `base − round(base × (1 − keep))`. Pure fn. **Business-rule tests** (`pricing.test.ts`): default preserves $23.37/$3.41; keep=1.0 → operator=base, platform=vendor-side only; platform-fee invariant holds. (Assert the RULE — do not edit existing expectations to match; default MUST stay identical.)
3. **`payments.ts` (⚠ CRITICAL PATH — per-file approval):** `createParkSpotCheckoutSession` already takes `managerReceivesTotalCents` from the caller → **may need NO change** if the ROUTE computes fees with the keep rate and passes the already-raised transfer amount. Confirm at build: the fn just forwards `managerReceivesTotalCents` into `transfer_data.amount` (payments.ts:529) — so the keep logic can live entirely in the route + pricing.ts, leaving payments.ts untouched. **Preferred: zero edits to payments.ts.** (Same pattern the concurrency fix used — keep the protected file out of it.)
4. **Booking routes** — `book-park-spot/route.ts` (+ `park-occurrences/[bookingId]/pay`, standing occurrence sweep) fetch `market.operator_keep_pct` and pass it to `calculateBoothRentalFees`. That raises `totalManagerReceivesCents` → the existing forward into checkout does the rest.
5. **UI** — where the rate is SET (see decision below) + optionally surface it on the operator dashboard ("you keep X% of base"). Link the projection tool → the real config.
6. **Webhook** — verify NO change (transfer amount is fixed at checkout; webhook only flips status). Expected clean.
7. **Tests** — pricing unit tests + a flow-integrity contract (route reads operator_keep_pct → into fee calc; default unchanged).

---

## Decisions — LOCKED (user, 2026-07-03)
1. **Scope = FT park-spot ONLY.** FM booth + season stay on the current fixed 93.5% for now. Backlog item added: reconcile all booth money paths under one operator-keep mechanism later — no hurry unless something breaks.
2. **Admin sets the REBATE.** Framing (user): the platform's earn is built-in/fixed — nobody "sets" it. What's configurable is the **rebate** (how much of the operator-side 6.5% the platform gives back, raising `operator_keep_pct` from 0.935 toward 1.000). **Admin-granted, not operator-self-serve.** (So `operator_keep_pct` is really "admin-granted rebate level.")
3. **Range = [0.935, 1.000].** ✅ (0.935 = no rebate/current; 1.000 = full operator-side rebate.)
4. **Tier rules DEFERRED** (who gets what rebate) — admin sets per-market free-field; tune later.
5. **RM program surface OUT of P6** — P6 is only the per-market money lever.

## Why `pricing.ts` changes but `payments.ts` does NOT (answered 2026-07-03)
To be precise: **`pricing.ts` IS changed** (it's the fee math + single source of truth). The file kept OUT is **`payments.ts`** (the critical-path Stripe checkout fn). This is safe — and adds NO new risk — because **computing the operator transfer amount was ALWAYS the route's job**: the route already calls `calculateBoothRentalFees` and passes `managerReceivesTotalCents` into `createParkSpotCheckoutSession`, which just forwards it to `transfer_data.amount` (payments.ts:529). The keep rate is simply one more input to that existing route-side computation, centralized in `pricing.ts`. payments.ts's role (forward the number to Stripe) is unchanged.
- **The only enduring risk** (which exists today, keep-rate or not): a FUTURE caller of `createParkSpotCheckoutSession` that mis-computes `managerReceivesTotalCents` → operator under-paid. Mitigation: `pricing.ts` stays the single source (all callers use it), the payments.ts param is documented as "must already include any operator rebate," and a flow-integrity contract asserts the booking route reads `operator_keep_pct` into the fee calc.
- **When putting it INTO payments.ts WOULD be warranted (revisit then, not now):** if the transfer ever needs Stripe-account-side data at charge time, or we switch from `transfer_data` to `application_fee_amount`, or the rebate becomes dynamic per-charge — none of which the current fixed-per-market model needs. For a fixed per-market rebate, route + `pricing.ts` is the correct home; keeping the protected file untouched is a feature, not a shortcut.

---

## Build sequence (each = present → approve → build → gate → review)
- **P6.1 — Config + pricing plumbing (no money moved yet):** migration (`operator_keep_pct`) + `calculateBoothRentalFees` optional param + unit tests (default byte-identical). Low risk; nothing reads it yet.
- **P6.2 — Wire FT park-spot checkout (⚠ money):** `book-park-spot` (+ pay-occurrence + standing sweep) read `operator_keep_pct` → fee calc → raised transfer. Confirm `payments.ts` needs no edit (preferred). Flow-integrity contract.
- **P6.3 — Admin set-rate UI** (+ optional operator "you keep X%" display; projection-tool link).
- **P6.4 (if in scope) — FM booth + season checkout** wired the same way (⚠ these are on PROD — extra care, before/after math, staging-verify).

---

## Risk + test discipline
- **Money path + critical-path `payments.ts`.** Mitigation: keep the keep-logic in the route + pure `pricing.ts` so `payments.ts` stays untouched (confirm at build); default 0.935 preserves exact current behavior; record before/after math per `code-stability.md` Rule 2 for anything justified by numbers.
- **Never edit an existing `pricing.test.ts` expectation to make it pass** — the default MUST stay $23.37/$3.41; if it doesn't, the formula is wrong, not the test (test-integrity Rule 1).
- FM booth/season changes (if in scope) touch **prod-live** money → staging-verify with a real Stripe-ready market before any prod push.

---

## Next step
Lock decisions 1–3 (scope, who-sets, range) with the user, then build P6.1 (config + pricing, no money moved) as the safe first commit.
