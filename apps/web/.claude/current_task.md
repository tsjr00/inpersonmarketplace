# Current Task: Session 74 — End-of-Session Handoff (Compact-Safe)
**Updated:** 2026-04-26 (late evening)
**Mode:** Report by default for next session. All planned work shipped to staging.
**Length:** This is the COMPLETE Session 74 record after the original wrap + the "attack the backlog" extension. Read top-to-bottom for full context.

---

## START HERE — Read in this order

1. **This file** (current_task.md) — full session state
2. **`apps/web/.claude/backlog.md`** — Priority 0 / 0.5 / 1 items, kept current as we worked
3. **`CLAUDE.md`** (project root) — project rules. **NEW THIS SESSION:** "Mechanical Gate — Cannot Be Overridden" subsection under "Database Schema Reference - MANDATORY" requires `Read SCHEMA_SNAPSHOT.md` OR `information_schema.columns` discovery before composing any SQL referencing public-schema columns. Snapshot can be wrong — escalate to `information_schema` if it fails.
4. **`apps/web/.claude/market_box_audit_v2.md`** — original audit; nearly all CRIT/HIGH items are now shipped (see "Audit status" below)
5. **`CLAUDE_CONTEXT.md`** (project root) — has new Session 74 entry in session history

---

## Where we are

- **43 commits ahead of `origin/main` (Prod)** — full ship pending
- **4 migrations pending Prod:** 124, 125, 126, 127 (all applied to Dev + Staging)
- **Code state:** stable; staging tip is `e35fa0b3`
- **Working tree:** only doc files (`current_task.md`, `settings.local.json`) modified at session end

---

## The user's pricing principle (ALWAYS RESPECT)

> Vendor sets the price. System adds platform fees. System NEVER reduces or transforms the vendor's stated price. Cadence affects pickup count, NOT price. Vendor knows what cadence they're offering when they set the price; do not compare biweekly vs weekly per-pickup.

## Surface-visibility rule

- **Buyer-facing surfaces** show buyer-fee-inclusive prices (`base × 1.065 + 0.15`)
- **Vendor-only surfaces** (vendor list, vendor box detail, edit form) show raw vendor-stated price

## Option A duration semantics (migration 125 — locked in)

- `4-week` term = 1 Month duration (28 days), regardless of cadence
- `8-week` term = 2 Months duration (56 days), regardless of cadence
- Weekly: 4 or 8 pickups; Biweekly: 2 or 4 pickups
- `original_end_date = start_date + (term_weeks * 7)`

---

## Session 74 — Complete commit list (in chronological ship order)

### Phase 1: Original Session 74 work (market box hardening + payout chase)

| SHA | Commit |
|---|---|
| `121b3d5e` | order-side payout: source_transaction + service client (Phase 1 — already on prod from earlier) |
| `6b9bd5c5` | fee pay 403 (already on prod) |
| `101d4bb9` | feat: bi-weekly market box pickup frequency |
| `d52bc1c0` | market box payouts use actual paid amount + source_transaction (Phase 1 helper) |
| `15f8b180` | webhook 8-arg RPC + correct price in metadata |
| `58fc5e86` | cart route biweekly half-price (later reversed) |
| `8b153222` | order.total_cents matches Stripe charge for biweekly (later reversed) |
| `729b4a5e` | migration 125 bookkeeping |
| `cd614580` | UI lead with pickup count + cadence (Option A clarity) |
| `01f55707` | UX cleanup — pickup mode + price display + per-pickup |
| `12d0e473` | UX round 2 — cart frequency + 2nd subscription + order# + back nav + pickup pills |
| `669d3a93` | vendor's stated price = buyer's pre-fee price (REVERSED biweekly halving) |
| `abfb1b72` | revert migrations 124/125/126 from applied/ — pending Prod |
| `96d1ab75` | **Batch 1 — buyer-side display:** CRIT-1 (cart→checkout pipe), CRIT-2 (cart drawer chip), CRIT-3 (Pickup X of Y), CRIT-4 (remove per-pickup row) |
| `3cebfae4` | **Batch 2 — vendor-side display:** HIGH-1 form labels, HIGH-2 list subtitle, HIGH-3 detail subtitle, HIGH-4 per-box badge, MED-3 skip prompt copy |
| `4efda92c` | **Batch 3 + LOW-2:** browse card framing + standalone webhook biweekly fix |
| `7b5dcc50` | webhook missing market box payout call (vendor never paid when webhook ran alone) — first half of "find the money" fix |
| `114d70f1` | webhook market box processing now idempotent across deliveries (resend-safe) — restructure to move market box block out of `if (!existingPayment)` guard |
| `274ac535` | **Migration 127:** vendor_payouts constraint accepts market_box_subscription_id (the actual constraint bug) |
| `398a007f` | docs — session 74 wrap (mechanical schema gate, backlog, handoff) |

### Phase 2: Staging-test findings (after user testing)

| SHA | Commit |
|---|---|
| `c2101854` | skip-modal label uses actual last pickup date + backlog 7 staging-test findings |

### Phase 3: "Attack the backlog" run (Priority 0 + 0.5 sweep)

| SHA | Commit | Backlog item |
|---|---|---|
| `f0c49195` | market-box-payout catch-all logs to error_logs (was console-only) | Priority 0 #3 ✓ |
| `45be1f00` | vendor new market box "How it Works" copy is FT-aware and biweekly-aware | Priority 0 #1 ✓ (FT audit + polish) |
| `4e4cb355` | event cancellation actually cancels buyer orders (was silent no-op) | Priority 0 #4 ✓ + bonus production bug fix |
| `22eed055` | backlog — webhook anti-pattern audit RESOLVED + dispute dedup item added | Priority 0 #5 ✓ (audit, no code change) |
| `9ba2e795` | vendor analytics overview includes market box subscriptions | Priority 0.5 (analytics overview) ✓ |
| `e35fa0b3` | vendor analytics trends + customers routes include market box subscriptions | Priority 0.5 (analytics partial — top-products + tax-summary deferred per design call) |

---

## "Find the money" investigation summary (Order #FA-2026-34616411)

The original Session 74 driver. Vendor `farmersmarketingapp+vegvendor1` was charged $106.65 for a biweekly market box, subscription was created, pickup completed end-to-end, but `vendor_payouts` had ZERO rows. Vendor never received their $93.35.

Bug chain (each blocking the next):
1. **Stripe sandbox vs legacy test mode** — visibility issue (resolved)
2. **Webhook missing helper call** — fixed `7b5dcc50`
3. **Webhook helper call inside `if (!existingPayment)` guard** — fixed `114d70f1` by restructuring to move market box block outside the guard
4. **`vendor_payouts_has_reference` CHECK constraint missing `market_box_subscription_id`** — fixed via migration 127

Vendor finally paid: transfer `tr_3TQFncAUXdXt3w5T3UAhepiq` for $93.35. Verified end-to-end on a fresh test order (`tr_3TQaLNAUXdXt3w5T2gQYyJe0`) — chain holds for new orders.

---

## Resolved (full list across whole session)

**From original audit (`market_box_audit_v2.md`):**
- ✅ CRIT-1: pickupFrequency cart→checkout pipe
- ✅ CRIT-2: cart drawer biweekly chip
- ✅ CRIT-3: "Pickup X of Y" replaces "Week X of Y"
- ✅ CRIT-4: remove "Per Pickup" row
- ✅ HIGH-1: vendor form labels (per Q4 option C)
- ✅ HIGH-2: vendor list "for 4 weeks" subtitle
- ✅ HIGH-3: vendor detail subtitle adds cadence
- ✅ HIGH-4: per-box BI-WEEKLY badge on vendor list
- ✅ MED-1: browse card per-pickup framing
- ✅ MED-3: skip-week prompt copy frequency-aware + extension date
- ✅ LOW-2: standalone webhook biweekly support

**Production bug fixes (incidental):**
- ✅ Webhook missing market box payout helper call
- ✅ Webhook idempotency anti-pattern (now resend-safe)
- ✅ Migration 127 — vendor_payouts constraint
- ✅ Skip-modal date label (mine — Batch 2)
- ✅ Event cancellation silent no-op (4 phantom `orders.market_id` references in 2 routes — both fixed via `order_items.market_id` lookup)
- ✅ FT vertical "How it Works" copy bugs (2 lines, pre-existing)
- ✅ `processMarketBoxPayout` catch-all eats errors silently — now uses `logError` with new `ERR_PAYOUT_004` code

**Backlog cleanups:**
- ✅ Webhook anti-pattern audit (no other handlers have the bug shape)
- ✅ Vendor analytics overview/trends/customers include market box subscriptions

**Documentation/structural:**
- ✅ New "Mechanical Gate" section added to CLAUDE.md (escalates to `information_schema` when snapshot fails)
- ✅ Migration 127 bookkeeping (changelog + log entry)
- ✅ Backlog continuously updated as work progressed (kept current)

---

## Still pending

### Priority 0 (1 remaining)

- **Pass platform `order_number` + `order_id` to Stripe checkout session metadata** — Currently Stripe charges/payment intents have no platform identifier. Vendors and admins cannot trace a Stripe transaction back to an order without DB lookups. Touches `apps/web/src/app/api/checkout/session/route.ts` (CRITICAL-PATH file — needs explicit per-file approval). Also consider also adding `market_box_subscription_id` to PaymentIntent metadata after subscription creation. Verify metadata appears on both checkout session AND payment intent.

### Priority 0.5

- **`weeks_completed` trigger not incrementing** — `check_subscription_completion` (rewritten in migration 124) is not bumping `weeks_completed` when a pickup is confirmed. Verify trigger fires AFTER UPDATE on `market_box_pickups` and check what it does — may only flip status to 'completed' at term end. Affects subscription lifecycle status, trial-to-paid conversion logic, vendor analytics, completion notifications.
- **T0-2 step 3: refund Stripe-paid event orders on cancellation** — Order cancellation now works (Session 74 fix), but Stripe-paid buyers don't get auto-refund. Touches `lib/stripe/payments.ts` (CRITICAL-PATH file). Two paths: (a) auto-refund via Stripe API, (b) flag for manual admin review.
- **Vendor analytics top-products** — Design call: include market box offerings as separate "products" or keep listings-only with separate "Top Market Boxes" panel?
- **Vendor analytics tax-summary** — Design call: market box taxability model. Defer until tax compliance work picks TaxCloud vs Stripe Tax.
- **Vendor not notified on new market box subscription** — Buyer notified, vendor isn't. Subscription DOES appear in `/vendor/market-boxes` Subscribers tab.
- **Notification routing for market box pickup** — Design call: when does notification deep-link to Pickup Mode vs market box manage page? Today routes to Pickup Mode which only shows today's pickups → early pickups confused.
- **Buyer orders progress bar shows "0 of 4" after pickup confirmed** — Likely date-triggered not status-triggered.
- **Vendors cannot delete market boxes** — only deactivate. Needs design + guardrails.
- **Subscribers tab on vendor market box detail missing order_number column**
- **Premium buyer upgrade returns "Not authenticated"** — auth bug; same downstream error-reporting form failure as the duplicate-subscription flow
- **Market box duplicate-subscription flow has 3 stacked UX bugs** — cart vs checkout inconsistency + error code not shown + form requires errorCode/traceId user can't see

### Priority 1

- **Webhook handler `handleChargeDisputeCreated` doesn't dedup admin notifications** — apply `wasNotificationSent` pattern (low severity)
- **Pre-existing baseline lint error** in `OrganizerEventDetails.tsx:110` (`react-hooks/set-state-in-effect`)
- **Stripe webhook endpoint cleanup** — one of two endpoints missing Protection Bypass
- **Verify `STRIPE_SECRET_KEY` matches active sandbox** post-Stripe sandbox migration
- **Other 5 silent return points in `processMarketBoxPayout`** should `logError` (catch-all done; the 5 inner returns still silent)
- **Yesterday's $16.01 payout still 'processing' 24+ hours later** — check whether `transfer.paid` webhook handler exists; if not, payouts may stay 'processing' indefinitely
- **Investigate which migration added `vendor_payouts.market_box_subscription_id` without updating constraint** — process-quality investigation
- **Order-side cron retry missing `source_transaction`** — `expire-orders/route.ts:1089`
- **Schema snapshot regeneration** — clear the 4 phantom `orders` columns from snapshot via `REFRESH_SCHEMA.sql`

---

## Migrations status

| Migration | Description | Dev | Staging | Prod |
|---|---|---|---|---|
| 124 | market_box_biweekly_frequency (columns + 4 function rewrites) | ✅ 2026-04-24 | ✅ 2026-04-24 | ❌ Pending |
| 125 | market_box_term_duration (Option A: original_end_date = start + term_weeks*7) | ✅ 2026-04-25 | ✅ 2026-04-25 | ❌ Pending |
| 126 | unified_market_box_tier_limits (DB trigger matches app vendor-limits.ts) | ✅ 2026-04-25 | ✅ 2026-04-25 | ❌ Pending |
| 127 | vendor_payouts constraint accepts market_box_subscription_id | ✅ 2026-04-26 | ✅ 2026-04-26 | ❌ Pending |

All 4 migration files in `supabase/migrations/` (NOT in `applied/`) — they move only when ALL THREE envs confirm.

---

## Known schema snapshot issues

`supabase/SCHEMA_SNAPSHOT.md` claims 4 columns on `orders` table that DON'T exist on live staging:
- `vendor_payout_cents` ❌
- `buyer_fee_cents` ❌
- `service_fee_cents` ❌
- `market_id` ❌

These columns DO exist on `order_items` (correct) but were incorrectly added to the `orders` section by the 2026-04-05 snapshot rebuild. The user discovered this Session 74 — code grep (this session) found:
- 3 columns: NO production references (matches were all on `order_items` joins or test object literals)
- `orders.market_id`: 4 active references in event cancellation flows — all silently broken, all fixed in commit `4e4cb355`

**Backlog item exists** to regenerate the snapshot. Until then, the new mechanical gate covers it (escalate to `information_schema.columns` if snapshot fails).

---

## Operating mode for next session

- **Report by default.** Read first, cite file:line, summarize what code does. Wait for explicit user direction before any edit.
- **Present-Before-Changing protocol** for any edit (your last message must contain a `?` asking permission).
- **Critical-path files** require per-file approval even within an approved batch.
- **Schema gate (NEW):** before any SQL with column names, your immediately preceding tool call must be a Read of the snapshot OR an `information_schema.columns` query. If snapshot fails or is marked stale, escalate to `information_schema` — don't trust it.
- **Git workflow chain** for every commit + push to staging — see `.claude/rules/git-workflow-chain.md`.

---

## Verification queries (frequently used this session)

For investigating market box flows, the user has run these on staging Supabase:

```sql
-- Find subscription_id from order number
SELECT s.id AS subscription_id, s.created_at, s.status, s.total_paid_cents
FROM market_box_subscriptions s
JOIN orders o ON o.id = s.order_id
WHERE o.order_number = '<FA-2026-XXXXXXXX>';

-- Verify vendor payout for a subscription (should have 1 row, status='processing')
SELECT id, market_box_subscription_id, vendor_profile_id, amount_cents, status,
       stripe_transfer_id, created_at, updated_at
FROM vendor_payouts
WHERE market_box_subscription_id = '<UUID>';

-- Pickups for a subscription
SELECT id, week_number, scheduled_date, status,
       ready_at, picked_up_at, vendor_confirmed_at, buyer_confirmed_at
FROM market_box_pickups
WHERE subscription_id = '<UUID>'
ORDER BY week_number;

-- Vendor Stripe Connect status
SELECT id, vertical_id, tier, stripe_account_id, stripe_onboarding_complete,
       stripe_charges_enabled, stripe_payouts_enabled, market_box_frequency
FROM vendor_profiles
WHERE id = (
  SELECT vendor_profile_id FROM market_box_offerings WHERE id = '<offering_uuid>'
);

-- Recent error logs
SELECT created_at, error_code, message, severity, route
FROM error_logs
WHERE created_at > now() - interval '5 minutes'
ORDER BY created_at DESC;
```

These all use REAL columns confirmed via `information_schema.columns` discovery this session.

---

## When pushing to Prod (eventually, within 9pm-7am CT window)

Order matters — apply migrations FIRST, then push code:

1. Apply migration 124 to Prod via Supabase SQL Editor
2. Apply migration 125 to Prod
3. Apply migration 126 to Prod
4. Apply migration 127 to Prod
5. After all migrations confirmed: `git push origin main`
6. Move all 4 migration files to `supabase/migrations/applied/`
7. Update `MIGRATION_LOG.md` + `SCHEMA_SNAPSHOT.md` to mark each "Applied to all 3 envs"
8. Run smoke tests against prod

If anything fails mid-migration, the code on prod will still work because it was deployed against the OLD migrations. The new code (in commits ahead) requires the new migrations.

---

## Files modified across full session (summary)

### Code (all shipped to staging)
- `lib/hooks/useCart.tsx`, `lib/locale/messages/en.ts`/`es.ts`
- `app/[vertical]/checkout/page.tsx`, `CheckoutMarketBoxItem.tsx`, `success/page.tsx`
- `app/[vertical]/buyer/subscriptions/[id]/page.tsx`, `buyer/orders/page.tsx`, `buyer/subscriptions/page.tsx`
- `app/[vertical]/vendor/market-boxes/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`, `new/page.tsx`
- `app/[vertical]/vendor/pickup/page.tsx`
- `app/[vertical]/market-box/[id]/MarketBoxDetailClient.tsx`
- `app/[vertical]/browse/page.tsx`
- `components/cart/CartDrawer.tsx`
- `app/api/checkout/session/route.ts`, `success/route.ts`
- `app/api/cart/route.ts`, `cart/items/route.ts`
- `app/api/market-boxes/[id]/route.ts`
- `app/api/buyer/market-boxes/route.ts`, `[id]/route.ts`
- `app/api/buyer/orders/route.ts`
- `app/api/vendor/markets/route.ts`, `vendor/market-boxes/route.ts`, `[id]/route.ts`
- `app/api/vendor/analytics/overview/route.ts`, `trends/route.ts`, `customers/route.ts`
- `app/api/cron/expire-orders/route.ts`
- `app/api/events/[token]/cancel/route.ts`
- `app/api/admin/events/[id]/route.ts`
- `lib/stripe/payments.ts`, `webhooks.ts`, `market-box-payout.ts` (NEW helper)

### Migrations
- `supabase/migrations/20260420_124_market_box_biweekly_frequency.sql`
- `supabase/migrations/20260425_125_market_box_term_duration.sql`
- `supabase/migrations/20260425_126_unified_market_box_tier_limits.sql`
- `supabase/migrations/20260426_127_vendor_payouts_market_box_subscription_constraint.sql`

### Documentation
- `CLAUDE.md` — new Mechanical Gate section
- `supabase/MIGRATION_LOG.md` — entries for 124/125/126/127
- `supabase/SCHEMA_SNAPSHOT.md` — changelog entries for all 4 migrations
- `apps/web/.claude/backlog.md` — continuously updated; reorganized into Priority 0 / 0.5 / 1
- `apps/web/.claude/current_task.md` — multiple rewrites; this is the latest
- `apps/web/.claude/market_box_audit_v2.md` — original audit (reference, not modified after creation)
