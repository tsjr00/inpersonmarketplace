# Phase E — Remaining Build Plan (season prepay completion + end-of-life actions)

**Created:** 2026-06-27. **Mode:** Report (plan only — no code/migrations until approved).
**Source:** Full-app code review 2026-06-27 (`fullapp_review_research.md`). The review confirmed
the season booking→payment→confirm→reconcile chain is sound; the one remaining significant gap is
that Phase E has no **end-of-life** (post-sale) actions wired to a UI. This plan completes them.
**Design source of truth:** `phase_e_booth_granularity_prepay_plan.md` (O1–O6) +
`phase_e_season_payment_safety_plan.md` (shipped). **Schema:** migs 164/166/167 (verify exact
columns against the migration DDL at build time — do not compose SQL from memory).

---

## What "end-of-life actions" means (the explanation)

A season booking has a lifecycle: **sold → active → wound-down**. The first half is built and
verified on staging. The "wound-down" half is the post-sale set of things that must happen when a
season doesn't run exactly as pre-sold. There are three of them, and right now each has working
backend pieces but no way for the user to actually trigger or see them:

1. **Vendor-initiated cancel of the WHOLE remaining group (season / all remaining prepaid weeks).**
   This earns a **formula credit**: full base value before season start; remaining weeks' base ×
   (1 − 25% penalty) after start. The shipped route (`api/vendor/booth-groups/[groupId]/cancel`)
   already does exactly this (cancel/route.ts:91-102) — there's just **no button** to call it. A
   vendor cancelling a **single week / partial / no-show gets NO credit** (same as buying one week at
   a time and cancelling). The only change to the route is the credit BASIS (full vendorPays →
   managerReceives base — LOCKED #2).

2. **Manager-initiated settlement (the market ran fewer days than sold).**
   When a manager cancels operating days (Phase C), the **default is to schedule a make-up date** so
   the vendor gets the booth time and no credit is owed. Only days that genuinely can't be made up,
   beyond the season `refund_cap_days`, create a manager-owed **booth credit** (manager-held base
   value). The counting logic exists (`lib/markets/cancelled-days.ts getGroupCancelledDays`) but is
   referenced by nothing, and there is no manager UI to review it or resolve it. Today a manager has
   no way to settle.

3. **Credit redemption + clean close (the vendor spends an accrued credit; the season closes to zero).**
   Manager-caused credits sit in the `booth_credits` ledger, **write-only today**. Redemption applies
   a credit as a discount on a *new* booking — reducing the vendor charge AND the manager transfer by
   the same amount, so the platform's cut is unchanged and **no platform cash is fronted**. This is the
   **money path** (`payments.ts`), so it's design-first + per-file approval, sequenced last. At season
   close, any unredeemed balance is resolved value-first (make-up date / upgrade) or by the manager
   off-platform — never platform cash (Option A) — and the season closes with zero open credit.

Until all three exist, the season feature can take money but can't gracefully unwind — which is the
exact situation that produces support tickets and angry vendors. Completing them is the highest
value-per-effort work left in Phase E because the hard parts (atomic RPCs, the ledger, the cancel
route, the cancelled-day counter) are already built and verified.

---

## Build sequence (each item = its own present → approve → build → gate → review cycle)

### Item 1 — Vendor "Cancel my season" button (whole group, WITH formula credit) + visibility  ·  size S  ·  changes cancel route credit basis, no protected file, no migration
**Goal:** surface the existing whole-group cancel in the vendor UI, grouped, and fix the credit basis.
- **Visibility:** `vendor/bookings/page.tsx` lists `weekly_booth_rentals` ungrouped (verified
  `:101-106`); season children carry `group_id`. Add a grouped "Season bookings" view: fetch the
  vendor's paid `booth_booking_groups`, render each as one card summarizing its weeks. (Folds in the
  review's "visible grouping" UX gap.)
- **Cancel-my-season button:** `ConfirmDialog` (mobile-safe) stating the credit outcome (full base
  before start; remaining base − 25% after start) → `POST api/vendor/booth-groups/[groupId]/cancel`
  → show the granted credit + new balance. This cancels the WHOLE remaining group (the route already
  does so). No single-week / no-show cancel path (those earn nothing by rule).
- **Route change = credit BASIS only:** in `cancel/route.ts`, switch the credit computation
  (:91-102) from full `vendorPays`/`total_vendor_cents` to the `managerReceives` base value (LOCKED
  #2). Before-start = sum of remaining weeks' `managerReceivesCents`; after-start = that × 0.75. The
  cancel + ledger-insert structure stays; only the amount formula changes.
- **Approvals:** standard (booth-groups/cancel is NOT a critical-path-protected file, but it's
  money-adjacent — show the exact diff for the basis change before editing).

### Item 2 — Manager settlement (value-first) + cancel-day make-up  ·  size M  ·  writes `booth_credits`, no protected file, no migration
**Goal:** let the manager resolve manager-caused shortfalls value-first and close the season to zero.
- **Make-up-dates first (cancel-a-date):** default a manager day-cancellation to offer a make-up date
  → vendor keeps the booth time, NO credit created. (Depends on the deferred add-special-date feature;
  if it's not built, this item documents the dependency and credits accrue for all unmakeable days.)
- **Settlement route** `GET/POST api/market-manager/[marketId]/seasons/[seasonId]/settlement`
  (isMarketManager-gated): GET returns each paid group's weeks, `getGroupCancelledDays(group)`,
  `refund_cap_days`, and the owed base value (manager-held basis); POST records resolution.
- **Resolution options (value-first, NO platform cash — Option A):** per group, the manager resolves
  the owed value as (a) make-up date(s), (b) booth-upgrade credit (a distinct `booth_credits` row,
  LOCKED #8), or (c) **off-platform settled** (manager attests, vendor is notified + confirms receipt).
  Credits the manager grants are redeemable in-season (Item 4); anything unresolved blocks clean close.
- **Clean-close gate:** the season can't be marked `settled` while any on-platform credit is open
  (LOCKED #6).
- **Notifications:** `booth_season_settled_vendor` + the weekly use-it/lose-it sweep (balances > $50)
  piggybacked on `expire-orders` cron. Bump the notification tripwire test by the exact count (present
  it, never silently).
- **Approvals:** standard + confirm the notification-count change. No platform cash, no protected file.

### Item 3 — Flow-integrity tests for the season path  ·  size S–M  ·  test-only
**Goal:** lock the cross-file contracts so future changes can't silently break them.
- Add to `src/lib/__tests__/flow-integrity.test.ts`: (a) season checkout → webhook
  `confirm_season_paid` → all children flip paid; (b) cron Phase 18 confirms-or-cancels a pending
  group correctly; (c) settlement → `booth_credits` ledger row written with the right source/amount.
- **Rule guard:** these assert the BUSINESS RULE, not current code. If a test fails, it's a decision
  point — present it, never edit the assertion to pass.

### Item 4 — Credit redemption at booking  ·  size L  ·  ⚠️ MONEY PATH — design-first, separate session

**LOCKED DECISIONS (user, 2026-06-27):**
1. **Two credit sources.** (a) Vendor cancels the WHOLE remaining group → formula credit (full base
   before start; remaining base × 0.75 after start). (b) Manager-caused settlement (cancelled days
   beyond cap). A vendor cancelling a single week / no-show earns NOTHING.
2. **Credit basis = `managerReceivesCents`** (manager-held base value), NOT full vendorPays. Used both
   for what the manager owes and for the redemption-discount math.
3. **Base parity, manager stays even.** Settlement credits the lost weeks' base value only; the vendor
   bears the platform fee on any replacement booking (no gross-up). Manager nets the normal per-week
   base, platform keeps every fee.
4. **ZERO platform-fronted cash (Option A).** The platform never pays out a dollar it hasn't pulled
   from the manager in the same operation. No float, no chasing managers with empty Connect balances.
   Settlement is VALUE-FIRST; the vendor is made whole in booth value (make-up dates) or by the
   manager directly (off-platform) — never by platform cash. (Option B = balance-limited pass-through
   cash-out → BACKLOG, revisit later.)
5. **Make-up-dates first.** When a manager cancels a day, the default is to schedule a make-up date so
   the vendor gets the booth time and NO credit is created. Credits accrue only for genuinely
   unmakeable days beyond the season `refund_cap_days`. (Depends on the deferred add-special-date
   feature — flag.)
6. **Clean season close, no rollover of any kind.** A season can't be marked settled while on-platform
   credit is open; whatever isn't redeemed/made-up in-platform becomes the manager's off-platform
   obligation (recorded + vendor-notified + vendor-confirms receipt). No credit carries to next season.
7. **Notifications:** weekly sweep (piggyback on `expire-orders` cron) flags positive balances as a
   season nears close; balances **over $50** carry an explicit use-it message. **$100** is the ceiling
   on any future pass-through cash-out (Option B only) — under Option A no platform cash moves.
8. **Booth-upgrade recording = a distinct `booth_credits` row** (its own source), not a note on the group.

#### The mechanism that satisfies all of those at once
A booth charge is a destination charge that splits three ways (per `calculateBoothRentalFees`,
pricing.ts:324). For a $25.00 week: vendor pays **$26.78**, manager receives **$23.37**, platform
keeps **$3.41**. The key identity:

> Apply credit **C** by reducing BOTH the vendor charge AND the manager transfer by C.
> Platform keep = (vendorPays − C) − (managerReceives − C) = vendorPays − managerReceives = **unchanged**.

Because the credit reduces both sides equally, **the platform's cut is mathematically invariant** —
it always keeps its full fee, in cash, on every booking, credit or no credit. The manager funds the
discount by receiving less on the new booking — which is exactly right, because the manager already
KEPT the original cash when the booth time was cancelled (credit-first: no Stripe reversal ever
happened). Net effect across the two bookings: the manager holds the cash once and delivers booth
value once; no money flows backward; the vendor is made whole in booth value.

#### Worked example (same $25.00 weekly tier)
- **Original season**, vendor books 1 week, then a cancel/settlement grants a credit.
  Manager's Connect account holds **$23.37** for that week (platform already kept its $3.41).
- **Credit granted = $23.37** (the manager-held base value — see "credit basis" below).
- **Vendor re-books a $25.00 week later, redeems the credit:**
  - Vendor charged: $26.78 − $23.37 = **$3.41**  (just the platform fee, in cash)
  - Manager transfer: $23.37 − $23.37 = **$0.00**  (manager funds it from cash already held)
  - Platform keeps: **$3.41**  (full fee, unchanged)
  - Identity check: $3.41 charged = $0.00 manager + $3.41 platform ✓

#### Build outline (own session, after your go)
- Read ledger balance for (vendor, market); `appliedCredit = min(balance, managerReceivesTotalCents)`
  for the new booking; leftover stays in ledger. Never reduces the manager transfer below 0, never
  reduces the vendor charge below the platform fee.
- `payments.ts createSeasonBoothCheckoutSession` (PROTECTED — exact diff + per-file approval):
  consolidated line `unit_amount = vendorPaysTotal − appliedCredit`; `transfer_data.amount =
  managerReceivesTotal − appliedCredit`. Deterministic idempotency key. Write a `redeemed` (negative)
  `booth_credits` row in the same flow so the ledger balances.
- Booking UI shows "Credit applied −$X.XX" and the reduced total.
- **Edge to handle:** if a booking is fully credit-covered and the residual vendor charge falls below
  Stripe's ~$0.50 minimum, either disallow full-cover on tiny bookings or carry the remainder.

#### Resolved
- Manager-settlement fairness → base parity, manager stays even (LOCKED #3).
- Credit expiry / rollover → none; credits resolve at season close (LOCKED #6), so there is no
  standing liability to expire.
- **Cross-use:** credit is market-scoped (`booth_credits.market_id`) so it only offsets bookings at
  the market that owes it — confirmed correct, no change.

**Sequenced last** so Items 1–3 (which create credits + let users see them) ship and bake before we
touch the money path that spends them.

### Item 5 — PROD push of the Phase E stack  ·  size M (coordination)
- Apply migs **164 → 165 → 166 → 167 in order** to Prod (user applies), then push the staging Phase
  E commit stack, in the **9 PM–7 AM CT** window, with explicit approval. Verify Vercel green +
  smoke test. (Decision at kickoff: push the current booking+safety+UX stack now and ship items 1–3
  after, OR finish 1–3 then push as one complete feature. Item 4 is always its own later session.)

---

## Dependencies & order
- Items 1, 2, 3 are independent of each other and of #4 — can build in any order; recommend 1 → 2 → 3.
- Item 4 depends on credits existing (1 + 2) and should follow them by at least one verified release.
- Item 5 (prod push) is gated on the kickoff decision and on staging verification of whatever's in.

## Approvals summary
- Items 1–3: standard approval (present → you say go). #2 also needs sign-off on the notification
  count bump and the booth-upgrade recording design question.
- Item 4: design doc first → your approval of the accounting → per-file approval of the exact
  `payments.ts` diff before any edit.
- Migrations: you apply Dev→Staging and confirm; I do the snapshot/changelog bookkeeping; never
  applied or pushed by me.

## Open questions to resolve at build time
1. **Booth-upgrade recording** (Item 2): note on the group, or a distinct `booth_credits` row with a
   different source? Decide before building the settlement card.
2. **Credit redemption accounting** (Item 4): vendor-charge-only discount vs also reducing the
   manager transfer. Needs your call with the worked example in hand.
3. **Kickoff push decision** (Item 5): ship-now vs finish-then-ship.
