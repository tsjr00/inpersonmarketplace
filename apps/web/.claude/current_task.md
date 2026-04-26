# Current Task: Market Box Hardening + "Find the Money" Investigation — End of Session 74
**Updated:** 2026-04-26 (early morning)
**Mode:** Report by default for next session. All currently planned work is shipped to staging.

---

## START HERE — Read in this order

1. This file
2. `apps/web/.claude/backlog.md` — **NEW Priority 0 section at the top** — 4 items discovered Session 74 that should be addressed before starting other work:
   - **Pass platform order # to Stripe metadata** (operational reconciliation gap — vendor/admin can't trace Stripe transactions to orders)
   - **`processMarketBoxPayout` catch-all eats errors silently** (made the Order #FA-2026-34616411 bug invisible — fix is ~5 lines)
   - **Schema snapshot wrong about 4 columns on `orders` table** (phantom columns may be referenced in code — needs grep before any DB work)
   - **Audit other webhook handlers for the `if (!existingPayment)` anti-pattern** (the bug we fixed in handleCheckoutComplete may exist elsewhere)
3. `CLAUDE.md` (project root) — has a NEW Mechanical Gate section under "Database Schema Reference - MANDATORY". READ IT before composing any SQL. Snapshot alone is no longer sufficient — you must escalate to `information_schema.columns` if the snapshot fails or is marked stale.
4. `apps/web/.claude/market_box_audit_v2.md` — original audit; most items are now shipped (see "Audit status" below)

---

## Critical context (don't lose this)

### The user's pricing principle (overrides any earlier code patterns)

> Vendor sets the price. System adds platform fees. System NEVER reduces or transforms the vendor's stated price. Cadence affects pickup count, NOT price. Vendor knows what cadence they're offering when they set the price; do not compare biweekly vs weekly per-pickup or draw correlations between them.

### The user's surface-visibility rule

- **Buyer-facing surfaces** show buyer-fee-inclusive prices (`base × 1.065 + 0.15`).
- **Vendor-only surfaces** (vendor list, vendor box detail, edit form) show the raw vendor-stated price. They know fees apply on top.

### Option A duration (locked in via migration 125)

- `4-week` term = 1 Month duration (28 days) regardless of cadence.
- `8-week` term = 2 Months duration (56 days) regardless of cadence.
- Weekly: 4 or 8 pickups across the term.
- Biweekly: 2 or 4 pickups across the term.
- `original_end_date = start_date + (term_weeks * 7)`.

### Skip-a-week semantics

- For biweekly, extension adds 14 days (one biweekly period). Cadence-aware.
- Skip modal copy is now frequency-aware ("Skip This Pickup?" for biweekly) and shows the new computed end date — Batch 2.

---

## Session 74 — Everything shipped to staging

### Commits (in order, all on `staging`, all pending Prod)

| # | SHA prefix | Title | Notes |
|---|---|---|---|
| 1 | `abfb1b72` | Migration revert — 124/125/126 from `applied/` back to `migrations/` | Bookkeeping correction (file moves shouldn't have happened until Prod was applied) |
| 2 | `96d1ab75` | Buyer-side display: cart→checkout pickupFrequency pipe + cart drawer chip + "Pickup X of Y" + remove Per Pickup row (Batch 1) | CRIT-1, CRIT-2, CRIT-3, CRIT-4 from market_box_audit_v2.md |
| 3 | `3cebfae4` | Vendor-side display: forms, list, detail subtitles + biweekly badge + skip prompt copy (Batch 2) | HIGH-1 through HIGH-4 + MED-3. Includes 1-line API change to `/api/vendor/markets` to expose `marketBoxFrequency` |
| 4 | `4efda92c` | Browse card per-pickup framing + standalone webhook biweekly fix (Batch 3 + LOW-2) | MED-1 + LOW-2 |
| 5 | `7b5dcc50` | Webhook missing market box payout call (vendor never paid when webhook ran alone) | First half of "find the money" fix |
| 6 | `114d70f1` | Webhook market box processing now idempotent across deliveries (resend-safe) | Restructure — moved market box block out of `if (!existingPayment)` guard |
| 7 | `274ac535` | Migration 127: vendor_payouts constraint accepts market_box_subscription_id | The actual bug; constraint pre-dated the column |

**Local main is 35 commits ahead of `origin/main` (Prod).**

### Migrations status

| Migration | Description | Dev | Staging | Prod |
|---|---|---|---|---|
| 124 | market_box_biweekly_frequency (columns + 4 function rewrites) | ✅ 2026-04-24 | ✅ 2026-04-24 | ❌ Pending |
| 125 | market_box_term_duration (Option A: original_end_date = start + term_weeks*7) | ✅ 2026-04-25 | ✅ 2026-04-25 | ❌ Pending |
| 126 | unified_market_box_tier_limits (DB trigger now matches app vendor-limits.ts) | ✅ 2026-04-25 | ✅ 2026-04-25 | ❌ Pending |
| 127 | vendor_payouts constraint accepts market_box_subscription_id | ✅ 2026-04-26 | ✅ 2026-04-26 | ❌ Pending |

All 4 migration files are in `supabase/migrations/` (NOT in `applied/`) — they move only when ALL THREE envs are confirmed.

### Audit status (`market_box_audit_v2.md`)

All Critical, High, and most Medium items are **shipped**. Remaining:
- **MED-2** (cart_items doesn't capture pickup_frequency at add time) — deferred. Transparency gap, not financial.
- **MED-4** (extended_weeks semantics broken for biweekly across consumer pages) — deferred.
- **LOW-1** (7-arg `subscribe_to_market_box_if_capacity` overload is dead) — separate cleanup migration.
- **LOW-3** (refund-on-RPC-failure amount math) — backlog already.
- **LOW-4** (refactor for shared subscribe + payout) — defer indefinitely.

---

## "Find the Money" investigation chain (Order #FA-2026-34616411)

**Order details:**
- Order: `295bb0bb-e494-4511-9cf0-e0df4bf5ef7d`, number `FA-2026-34616411`, status `paid`, total $106.65
- Subscription: `c6acffda-b05a-42e0-b010-978695c2197b`, biweekly, 4-week term, `total_paid_cents=10000` (vendor's $100 stated price)
- Buyer: `69fe5512-68a3-40dc-b524-635f1adc66c6`, `cottagevendor1+test@test.com`
- Vendor: `farmersmarketingapp+vegvendor1@gmail.com`, profile `ee3c259c-2bbd-4589-a21b-e48eb998a58e`, `acct_1T4ManADPKYoCTbQ`
- Payment intent: `pi_3TQFncAUXdXt3w5T39TvUQzZ` (test mode → `cs_test_b1cb2PFd3xrZVbxehFHSZUIBLm8u3FCE3SzNDz0n7GNbgnm9xTN1sSw3es`)
- Pickup #1: confirmed end-to-end at 2026-04-25 23:46

**The chain of bugs (each blocking the next):**

1. **User couldn't find Stripe transaction** — Resolved: Stripe sandbox vs legacy test mode confusion. Sandbox showed it. Existing transaction was always there. Buyer was never overcharged or anything; just visibility.

2. **`vendor_payouts` had zero rows for the subscription** — Bug: webhook (`handleCheckoutComplete` in `webhooks.ts`) creates the subscription but never called `processMarketBoxPayout`. Only the `checkout/success` route called the helper. When the webhook ran alone (success route never reached, e.g. Vercel mid-deploy when buyer redirected), vendor was never paid.
   - **Fix:** commit `7b5dcc50` added the helper call.
   - **Verification:** resend the Stripe event after deploy to backfill.

3. **Resend produced no payout** — Bug: my fix at #2 was inside `if (!existingPayment)` guard. On resend, payment row already existed → entire market box block was skipped → helper not called.
   - **Fix:** commit `114d70f1` restructured the function to move market box processing OUT of the existingPayment guard. Both subscribe RPC and payout helper are idempotent — safe.
   - **Verification:** resend again.

4. **Helper threw `ERR_PAYOUT_003`** — Bug: `vendor_payouts_has_reference` CHECK constraint only allowed `order_item_id IS NOT NULL OR market_box_pickup_id IS NOT NULL`. Constraint pre-dated the `market_box_subscription_id` column. Helper inserted with only that column set → constraint violated → silent skip.
   - **Fix:** migration 127 (`274ac535`) drops + recreates the constraint to include `market_box_subscription_id`.
   - **Verification:** vendor got paid $93.35, transfer `tr_3TQFncAUXdXt3w5T3UAhepiq`. Vendor dashboard "Payments & Earnings" card now correctly shows Pending Payouts = $109.36 ($93.35 today + $16.01 yesterday's regular order, both `processing`).

**Why this matters for next session:** the bug pattern was "success path handles A+B, webhook handles A only." If you find similar patterns in other flows (regular orders, refunds, anything with a webhook backup), check whether the webhook's processing is gated behind `if (!existingPayment)` — that's the trap.

---

## New issues discovered this session (in backlog.md)

1. **Vendor analytics page doesn't show today's sales** — Found while reconciling the $109.36. Hypotheses: date-filter off-by-one, UTC vs CT boundary, ISR not refreshed, or different table. Not fixed; backlogged.

2. **`weeks_completed` not incrementing when pickup confirmed** — Subscription `c6acffda-...` has pickup #1 fully `picked_up` with both confirmations, but `weeks_completed` on the parent subscription is still 0. The `check_subscription_completion` trigger (rewritten in migration 124) appears to not be updating `weeks_completed` — verify trigger is firing AFTER UPDATE on `market_box_pickups` and that it actually bumps the column (may only be flipping status to `completed`).

3. **Pre-existing baseline lint error in `OrganizerEventDetails.tsx:110`** — `react-hooks/set-state-in-effect`. Slipping past pre-commit because lint-staged only checks staged files. Worth a separate fix sometime.

4. **Two webhook endpoints in Stripe** — One has Protection Bypass (works), other doesn't (401s on every delivery). Add bypass to the broken one OR delete it. Cosmetic but pollutes the Events log.

5. **Snapshot inaccuracy** — Live staging `orders` table is MISSING these columns that `SCHEMA_SNAPSHOT.md` claimed exist:
   - `vendor_payout_cents`
   - `buyer_fee_cents`
   - `service_fee_cents`
   - `market_id`

   These columns DO exist on `order_items` but not on `orders`. The Apr 5 snapshot rebuild that added them to the orders section was wrong. Worth: regenerate the snapshot via REFRESH_SCHEMA.sql (the user can run it next time they have a SQL editor open). Marked the live-DB ground-truth issue in the new CLAUDE.md gate (rule b).

---

## What was NOT shipped this session (still in backlog)

- Pass platform `order_number` to Stripe metadata (Issue 2 from session start)
- Buyer notification deep link when vendor marks pickup ready before scheduled date (Issue 1)
- Order-side cron retry missing `source_transaction` (`expire-orders/route.ts:1089`)
- Various previously backlogged items

---

## Operating mode for next session

- **Report by default.** Read first, cite file:line, summarize what the code does. Wait for explicit user direction before any edit.
- **Present-Before-Changing protocol** for any edit (your last message must contain a `?` asking permission).
- **Critical-path files** (per `.claude/rules/critical-path-files.md`) need per-file approval even within a batch.
- **NEW: Schema gate** — before any SQL with column names, your immediately preceding tool call must be a Read of the snapshot OR an `information_schema.columns` query. If the snapshot fails or is marked stale, escalate to `information_schema` — don't trust it.

---

## Uncommitted state (working tree)

`git status` shows only:
- `apps/web/.claude/backlog.md` — modified (today's additions)
- `apps/web/.claude/current_task.md` — modified (THIS rewrite)
- `apps/web/.claude/settings.local.json` — local-only, never commit
- `apps/web/.claude/rules/schema-check-before-sql.md` — DELETED (moved to inline gate in CLAUDE.md)
- `CLAUDE.md` (project root) — modified (new mechanical gate section)

These are documentation-only changes that don't ship to staging. Suggest committing them in one cleanup commit when the user wraps OR leave for next session to decide.

---

## Files modified or created this session (summary)

### Code (all shipped)
- `src/lib/hooks/useCart.tsx` — `pickupFrequency` field on CartItem
- `src/app/[vertical]/checkout/page.tsx` — pass `pickupFrequency` through both maps
- `src/app/[vertical]/checkout/CheckoutMarketBoxItem.tsx` — already correctly read it
- `src/app/[vertical]/buyer/subscriptions/[id]/page.tsx` — Pickup X of Y, remove per-pickup row
- `src/components/cart/CartDrawer.tsx` — biweekly chip, frequency-aware subtitle, duration label
- `src/lib/locale/messages/en.ts` + `es.ts` — `sub_detail.pickup_of`, `sub_detail.paid_upfront_note`
- `src/app/api/vendor/markets/route.ts` — exposes `marketBoxFrequency`
- `src/app/[vertical]/vendor/market-boxes/new/page.tsx` — frequency reminder + labels
- `src/app/[vertical]/vendor/market-boxes/[id]/edit/page.tsx` — same treatment
- `src/app/[vertical]/vendor/market-boxes/page.tsx` — list subtitle + per-box BI-WEEKLY badge
- `src/app/[vertical]/vendor/market-boxes/[id]/page.tsx` — detail subtitle + skip-week modal
- `src/app/[vertical]/browse/page.tsx` — pickup-count framing
- `src/lib/stripe/webhooks.ts` — added helper call (commit 7b5dcc50) + restructured guard (commit 114d70f1) + standalone biweekly lookup (Batch 5)

### Migrations
- `supabase/migrations/20260426_127_vendor_payouts_market_box_subscription_constraint.sql` (NEW, applied dev+staging)

### Bookkeeping
- `supabase/MIGRATION_LOG.md` — entry for 127
- `supabase/SCHEMA_SNAPSHOT.md` — changelog entry for 127
- `CLAUDE.md` — new Mechanical Gate section under "Database Schema Reference - MANDATORY"
- `apps/web/.claude/backlog.md` — Priority 0 (URGENT) entry resolved + 2 new entries (analytics, weeks_completed)
- `apps/web/.claude/rules/schema-check-before-sql.md` — DELETED (gate moved inline into CLAUDE.md)

---

## When you're ready to push to Prod

1. 35 commits + 4 migrations are queued
2. Window: 9pm–7am CT only
3. Order matters: apply migrations 124, 125, 126, 127 (in order) on Prod via Supabase SQL Editor BEFORE pushing the code commits, otherwise code may try to use columns/RPC signatures that don't exist on Prod yet
4. After Prod is confirmed: move all 4 migration files to `supabase/migrations/applied/` and update MIGRATION_LOG + SCHEMA_SNAPSHOT to mark them "Applied to all 3 envs"
