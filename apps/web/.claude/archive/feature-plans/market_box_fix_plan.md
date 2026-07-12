# Market Box Fix Plan — 2026-04-24

**Source:** `apps/web/.claude/market_box_audit.md`
**HIGH-2 product call:** Option B — biweekly subscription has 2 (or 4) pickups, actual duration is 2 (or 6) weeks; UI labels reflect actual cadence rather than implying "1 Month."
**Status:** Awaiting approval. No code changes yet.

---

## Phase boundaries

- **Phase 1 (release blocker):** financial-correctness fixes. Without these, every biweekly subscription either over-pays the vendor or strands the payout. Required before commit `101d4bb9` ships to prod.
- **Phase 2 (release blocker):** UI/API correctness fixes. Without these, biweekly buyers see misleading prices or labels.
- **Phase 3 (quality, not money):** lifecycle math, copy, semantics. Can ship as a follow-up.
- **Phase 4 (optional):** test coverage + tech-debt cleanup. Defer to a later session.

---

## Phase 1 — Critical financial fixes

### Fix 1 — CRIT-2: thread `source_transaction` through every market box transfer call site

Mirrors the exact pattern from commit `121b3d5e` for `transferToVendor`.

**1a. `apps/web/src/lib/stripe/payments.ts`** — CRITICAL PATH FILE

- Add optional `sourceTransaction?: string` param to `transferMarketBoxPayout` (lines 211–235).
- When set, include `source_transaction: sourceTransaction` in the `stripe.transfers.create` body.
- Risk: money flow. Mitigation: identical shape to the proven `transferToVendor` change.

**1b. `apps/web/src/app/api/checkout/success/route.ts`** — CRITICAL PATH FILE

- In `processMarketBoxPayout` (line 531+), accept the payment intent ID, look up the charge via `getChargeIdFromPaymentIntent` (already imported pattern), pass as `sourceTransaction` to `transferMarketBoxPayout`.
- The PI is in scope at the call site (`paymentIntentId`, line 45). Pass it down.

**1c. `apps/web/src/lib/stripe/webhooks.ts`** — CRITICAL PATH FILE

- Same fix in the duplicate `processMarketBoxPayout` (line 430+). Webhook handler already has access to the payment intent.

**1d. `apps/web/src/app/api/cron/expire-orders/route.ts`** (Phase 5 retry — not on critical-path list, but high-risk)

- Both retry blocks (lines 1226 and 1288) call `transferMarketBoxPayout` without `source_transaction`.
- For each failed payout, look up the charge from the subscription's `stripe_payment_intent_id` (stored on `market_box_subscriptions`) → `getChargeIdFromPaymentIntent` → pass into the retry. Same pattern as the order-side retry.

**Test plan for Fix 1:**
- Unit: extend `webhook-utils.test.ts` to assert that the transfer payload contains `source_transaction` when threaded.
- Manual on staging: re-run the buyer→vendor flow you used for the regular-order verification. Subscribe to a market box, check Stripe Workbench logs for `POST /v1/transfers`, confirm `source_transaction` appears in the request body. Verify `vendor_payouts.status='processing'` and `stripe_transfer_id LIKE 'tr_%'`.

---

### Fix 2 — CRIT-1: vendor payout uses actual paid amount, not full weekly price

Two equivalent shapes were proposed. **Recommend shape (b):** use what the buyer actually paid. Cleaner — eliminates frequency dependency in this function entirely and makes the calculation tamper-resistant against future frequency-related bugs.

**2a. `apps/web/src/app/api/checkout/success/route.ts`** — CRITICAL PATH FILE

- `processMarketBoxPayout` currently re-fetches `offering.price_4week_cents` and computes `vendorPayoutCents = calculateVendorPayout(basePriceCents)` using that full price.
- Change to: accept `actualPaidCents` parameter (the buyer's actual payment for this market box, already available as `mbItem.priceCents` at the call site, lines 271 and 276). Use `calculateVendorPayout(actualPaidCents)` instead.
- The offering query becomes unnecessary except for vendor_profile_id; can simplify to a single vendor_profiles fetch.

**2b. `apps/web/src/lib/stripe/webhooks.ts`** — CRITICAL PATH FILE

- Same fix in the duplicate `processMarketBoxPayout`. Webhook receives `mbItem.priceCents` from session metadata.
- The `selectBasePriceForTermWeeks` helper in `webhook-utils.ts:42-65` becomes dead for the payout flow. Leave the helper alone (out of scope), just stop calling it.

**Refactor decision (asking below):** these two `processMarketBoxPayout` functions are duplicates. Worth extracting to a shared helper to prevent future drift, but that's scope expansion. Default plan: leave as duplicates, fix in lockstep. Better answer if you'd rather refactor.

**Test plan for Fix 2:**
- Unit: extend `pricing.test.ts` to assert biweekly payout math: $40 4-week box / biweekly → buyer pays ~$2130c → `calculateVendorPayout(2000)` = expected vendor amount.
- Manual on staging: subscribe to a biweekly market box on staging. Check `vendor_payouts.amount_cents` matches the half-price formula (not full-price).

---

## Phase 2 — High-impact correctness fixes

### Fix 3 — HIGH-1: `purchase.total_price_cents` returns adjusted price

**File:** `apps/web/src/app/api/market-boxes/[id]/route.ts:232`

Change `total_price_cents: price4Week` → `total_price_cents: adjustedPrice4Week`. One-line.

**Test plan:** Manual: open a biweekly market box detail page on staging. Inspect Network tab `purchase.total_price_cents` field — should match `available_terms[0].price_cents` (both adjusted).

---

### Fix 4 — HIGH-2 (Option B): UI labels reflect actual biweekly cadence

For biweekly, replace "1 Month" / "2 Months" with cadence-explicit copy.

**4a. API: `apps/web/src/app/api/market-boxes/[id]/route.ts:164-194`**

For biweekly:
- 4-week term: `label = '2 Pickups · Bi-Weekly'` (or similar — open to copy suggestions)
- 8-week term: `label = '4 Pickups · Bi-Weekly'`
- Add `duration_weeks` and `duration_label` fields to each term so UI doesn't have to derive: `4-week biweekly → duration_weeks: 2, duration_label: '2 weeks'`. `8-week biweekly → duration_weeks: 6, duration_label: '6 weeks'`.

For weekly: keep current behavior (1 Month, 2 Months, num_pickups=4/8, duration_weeks=4/8).

**4b. UI: `apps/web/src/app/[vertical]/market-box/[id]/MarketBoxDetailClient.tsx`**

- Show a prominent "Bi-Weekly" tag near the title when `offering.pickup_frequency === 'biweekly'`.
- Show `duration_label` in the term selector ("2 pickups over 2 weeks" instead of "1 Month").
- When subscribing, the confirmation copy should say something like "You'll get 2 pickups, the first on [date], the second 14 days later."

**4c. UI: `apps/web/src/app/[vertical]/checkout/CheckoutMarketBoxItem.tsx:48`**

- Already shows "· Bi-Weekly" tag. Make it more prominent (move into the title row, not the meta line).
- Replace `t('cart.week_total', ...)` with a frequency-aware key.

**4d. UI: `apps/web/src/app/[vertical]/browse/page.tsx`**

- Confirm browse cards show frequency badge for biweekly offerings. (Not yet read in detail — will read during implementation.)

**4e. UI: `apps/web/src/app/[vertical]/vendor/market-boxes/page.tsx`**

- When toggling biweekly, show a preview: "Buyers will receive 2 pickups for a 4-week subscription, 4 pickups for an 8-week subscription. They'll be charged half the weekly price."

**Test plan:** Manual on staging — go through buyer flow as biweekly. Verify every page shows accurate cadence labels. Vendor flow: toggle biweekly, see preview, see updated offering display.

---

## Phase 3 — Semantic cleanup

### Fix 5 — MED-1: `extended_weeks` actually means weeks (recommend Option (b) — math change, no rename)

**Recommendation:** Option (b) keeps the column name and changes how `vendor_skip_week` increments it: increment by `interval / 7` (= 1 for weekly, = 2 for biweekly). Then `extended_weeks` consistently means "weeks of extension." All consumer arithmetic stays correct.

**5a. Migration** (new file, e.g. `20260425_125_fix_vendor_skip_week_extended_weeks.sql`)

```sql
-- Update vendor_skip_week so extended_weeks reflects actual weeks, not number of skips
CREATE OR REPLACE FUNCTION vendor_skip_week(...) ... AS $$
...
  -- New: increment by frequency-aware week count
  UPDATE market_box_subscriptions
  SET extended_weeks = COALESCE(extended_weeks, 0) + (v_interval / 7),
      updated_at = NOW()
  WHERE id = v_subscription_id;
...
$$
```

**5b. API responses** that compute `total_weeks = term_weeks + extended_weeks` — leave unchanged. Math now works consistently.

**Open question (asking below):** option (a) is to rename the column and update 8 consumers, which is more invasive but more semantically honest. Default is (b). Confirm.

**Test plan:** Migration on dev → staging → prod. After dev: subscribe to biweekly box, skip a week, verify `extended_weeks` increments by 2 not 1.

### Fix 6 — MED-2: skip endpoint message is frequency-aware

**File:** `apps/web/src/app/api/vendor/market-boxes/pickups/[id]/skip/route.ts:166`

Replace hardcoded "Subscription extended by 1 week" with a frequency-aware version that reads the subscription's `pickup_frequency` and produces "extended by 1 week" or "extended by 2 weeks" accordingly.

**Test plan:** Manual: skip a pickup as a vendor in both weekly and biweekly subs, verify response message.

### Fix 7 — MED-4: notification copy + locale strings

**Files:**
- `apps/web/src/lib/locale/messages/en.ts` and `es.ts` — add biweekly variants for any string that mentions weeks/cadence in market-box context (`subs.weeks_progress`, `cart.subscription`, `cart.week_total`, etc.)
- `apps/web/src/lib/notifications/types.ts:331-336` — `market_box_skip` template currently doesn't reference cadence; not mandatory. Skim other market-box notification types for week-mentioning copy.

**Approach:** introduce a parallel set of i18n keys (`subs.pickups_progress`, `cart.bw_subscription`, etc.) and switch the UI to use the right key based on `pickup_frequency`. Avoids breaking weekly users.

**Test plan:** Snapshot vitest for any rendered notification strings; manual UI walk on staging.

---

### Fix 4 supplement — Progress math now uses pickup count, not term_weeks arithmetic

While we're touching the API responses for Fix 4, also fix the `total_weeks` calculation in:
- `apps/web/src/app/api/buyer/market-boxes/route.ts:120-131`
- `apps/web/src/app/api/buyer/market-boxes/[id]/route.ts:115-132`
- `apps/web/src/app/api/buyer/orders/route.ts:404,447-449`
- `apps/web/src/app/api/vendor/market-boxes/pickups/[id]/skip/route.ts:163`

Currently each computes `total_weeks = term_weeks + extended_weeks`. For weekly this happens to match the actual pickup count. For biweekly it does not.

**Replace with:** query `SELECT COUNT(*) FROM market_box_pickups WHERE subscription_id = X` (or `JOIN` it in the original query). Use that as `total_pickups`. Add it to the API response. Keep `total_weeks` for backwards compat, populate it with the same value for now.

**UI consumers** (`buyer/subscriptions/page.tsx:364`, `buyer/orders/page.tsx:752`) display this as "X of Y" progress. They'll be correct as long as the API returns the right number.

This is technically part of MED-1, but I'm flagging it explicitly because it's the most user-visible number and the easiest to verify on staging.

---

## Phase 4 — Lower priority (defer)

### Fix 8 — MED-5: Cart captures pickup_frequency at cart-add (optional)

Migration to add `cart_items.pickup_frequency` column. Code change in `cart/items/route.ts` and `useCart.tsx`. Lower priority — current behavior is acceptable since the actual frequency lock-in still happens at subscribe-time.

### Fix 9 — LOW-3: Test coverage

Extend `pricing.test.ts` and `business-rules-coverage.test.ts` with biweekly cases. Add an integration test that exercises the full subscribe → payout flow for biweekly.

### Fix 10 — LOW-1: Drop the 7-arg overload of `subscribe_to_market_box_if_capacity`

Future migration: `DROP FUNCTION subscribe_to_market_box_if_capacity(uuid,uuid,uuid,integer,date,integer,text);`. Confirm via grep that no caller passes 7 args before dropping.

---

## Critical-path file approval requirements

Per `apps/web/.claude/rules/critical-path-files.md`, modifying these files requires explicit per-file approval beyond design-level approval:

- `apps/web/src/lib/stripe/payments.ts` — touched by Fix 1a
- `apps/web/src/app/api/checkout/success/route.ts` — touched by Fix 1b, Fix 2a
- `apps/web/src/lib/stripe/webhooks.ts` — touched by Fix 1c, Fix 2b
- `apps/web/src/lib/pricing.ts` — NOT touched (all calculation changes pass values into existing helpers)

When implementing, I'll present each modification to a critical-path file separately with the exact before/after diff and wait for file-specific approval before opening Edit.

---

## Deploy & test strategy

1. **Phase 1 + Phase 2** ship together as one PR/commit cluster. Both are blockers.
2. Run `npm run lint && npm run test` locally before any commit.
3. Push commit chain to staging.
4. Manual staging verification:
   - Subscribe to a weekly market box. Verify `vendor_payouts.amount_cents` matches `calculateVendorPayout(price_4week_cents)`. Verify Stripe transfer body has `source_transaction`.
   - Subscribe to a biweekly market box. Verify `vendor_payouts.amount_cents` matches half-price math. Verify pickup count = 2. Verify subscription dashboard shows "2 of 2" not "2 of 4."
   - Skip a week as vendor. Verify response message is correct for both weekly and biweekly.
5. Report results back. **Do not push to prod** until all checks pass.
6. **Phase 3 + migration 125** as a separate commit cluster, same staging-first flow.
7. **Phase 4** deferred entirely; track in `.claude/backlog.md` if desired.

---

## Open questions / data needed before implementation

1. **Existing biweekly subscriptions** — are there any in prod or staging right now? If yes, they may have wrong `original_end_date` set already (per HIGH-2 Option A interpretation). Cleanup migration may be needed. Asking you to run a query (below).

2. **Fix 5 option (a) vs (b)** — confirm option (b) is acceptable. (b) is less invasive: change one SQL function, no rename, no consumer updates. (a) is more semantically honest but touches 8 places.

3. **CRIT-1/CRIT-2 refactor scope** — `processMarketBoxPayout` is duplicated in `checkout/success/route.ts` and `webhooks.ts`. Default plan keeps them as duplicates. Acceptable? Or should I extract a shared helper as part of these fixes?

4. **Phase 1+2 commit shape** — single commit with all critical-path changes, or split per file (e.g., one commit per critical-path file with corresponding test)? Smaller commits = easier to revert if something breaks. My default would be to split per concern: one commit for Fix 1 (source_transaction), separate commit for Fix 2 (paid-amount), etc.

5. **Locale copy** — for biweekly UI labels, are you OK with copy like "2 Pickups · Bi-Weekly" / "4 Pickups · Bi-Weekly" for the term selector, plus "2 weeks" / "6 weeks" for duration? Or do you have specific copy in mind?

6. **Fix 4d** — I haven't read `browse/page.tsx` market box card rendering yet. Will do during implementation; flagging in case I find more changes are needed there.

### Data I'd like before starting

```sql
-- Run on prod and staging (paste both results)
SELECT
  vp.profile_data->>'business_name' AS vendor,
  COUNT(*) FILTER (WHERE vp.market_box_frequency = 'biweekly') AS vendors_biweekly,
  (SELECT COUNT(*) FROM market_box_subscriptions s
     JOIN market_box_offerings o ON o.id = s.offering_id
     JOIN vendor_profiles vp2 ON vp2.id = o.vendor_profile_id
     WHERE vp2.market_box_frequency = 'biweekly') AS biweekly_subscriptions,
  (SELECT COUNT(*) FROM market_box_subscriptions WHERE pickup_frequency = 'biweekly') AS subs_with_biweekly_captured
FROM vendor_profiles vp
GROUP BY 1
ORDER BY vendors_biweekly DESC NULLS LAST;
```

Tells us if there's any cleanup to do or if we can ship cleanly.
