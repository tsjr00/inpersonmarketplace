# Market Box End-to-End Audit V2 — 2026-04-25

**Why:** Multiple rounds of biweekly fixes. This audit walks every surface and connection, names what's there with file:line citations, and produces a single source of truth on the current behavior. Findings only — no fixes proposed during the audit.

**Method:** Read every file in the flow personally. Every claim cites a file:line. UNVERIFIED markers where I haven't looked.

**Severity:** Critical = financial / data integrity / blocks a real flow. High = wrong UX with money implications. Medium = clarity/UX. Low = cleanup.

---

## End-to-end data flow (the connection map)

```
Vendor entry:
  vendor/market-boxes/page.tsx (list) → frequency toggle PATCH /api/vendor/market-boxes
                                      → "+ New" → vendor/market-boxes/new/page.tsx
                                                    → POST /api/vendor/market-boxes
                                                          → DB INSERT market_box_offerings
                                                                → trigger enforce_market_box_tier_limit (migration 064/126)
                                                                → trigger set_market_box_premium_window (migration 026)
  vendor/market-boxes/[id]/page.tsx (detail) → GET /api/vendor/market-boxes/[id]
                                              → tabs: Overview / Subscribers / Pickups
                                              → activate/deactivate → PATCH /api/vendor/market-boxes/[id]
                                              → edit → /[id]/edit → POST /api/vendor/market-boxes/[id]
                                              → skip-week → POST /api/vendor/market-boxes/pickups/[id]/skip
                                                            → DB function vendor_skip_week (migrations 124)

Buyer entry:
  browse/page.tsx (server) → SELECT market_box_offerings + vendor_profiles.market_box_frequency
                           → MarketBoxCard render
  market-box/[id] page → MarketBoxDetailClient.tsx
                       → GET /api/market-boxes/[id] (returns availableTerms, purchase, offering)
                       → addMarketBoxToCart → POST /api/cart/items
                                            → DB INSERT cart_items (NO pickup_frequency captured here)
  Cart drawer → GET /api/cart (returns market box items with pickupFrequency since Commit D)
              → CartDrawer.tsx render
  Checkout → checkout/page.tsx
           → POST /api/checkout/session
              → calls Stripe.checkout.sessions.create with line items + metadata
              → DB INSERT orders + order_items
           → CheckoutMarketBoxItem.tsx render (consumes CheckoutItem)
  Stripe charges → buyer redirected back to checkout/success
  Success page → checkout/success/page.tsx
              → GET /api/checkout/success
                 → confirms payment, calls subscribe RPC subscribe_to_market_box_if_capacity (migration 124)
                       → DB INSERT market_box_subscriptions
                             → trigger create_market_box_pickups (migrations 124, 125)
                                   → INSERT market_box_pickups rows
                                   → SET market_box_subscriptions.original_end_date
                 → calls processMarketBoxPayout helper (src/lib/stripe/market-box-payout.ts)
                       → INSERT vendor_payouts (pending)
                       → calls transferMarketBoxPayout (Stripe API) with source_transaction
                       → UPDATE vendor_payouts.status = processing/failed
                 → returns order + marketBoxSubscriptions
  Webhook (parallel/backup): /api/webhooks/stripe handleCheckoutSessionCompleted
                           → same RPC call (idempotent)
                           → same payout helper

Buyer post-purchase:
  buyer/orders/page.tsx → GET /api/buyer/orders (transforms subscriptions into market_box rows)
                       → click into market box → /buyer/subscriptions/[id]?from=orders
  buyer/subscriptions/page.tsx → GET /api/buyer/market-boxes (list)
  buyer/subscriptions/[id]/page.tsx → GET /api/buyer/market-boxes/[id]
                                    → header / pickups timeline / details panel
                                    → confirm pickup → POST /api/buyer/market-boxes/[id]/confirm-pickup

Vendor post-purchase:
  vendor/pickup/page.tsx (pickup mode) → GET /api/vendor/market-boxes/pickups?status=ready
                                       → client filters to today's pickups
  vendor box detail → Pickups tab → GET /api/vendor/market-boxes/pickups?offering_id=X
                                  → mark ready/picked_up/missed → PATCH .../pickups/[id]

Cron (daily):
  Phase 4.7 — auto-miss past-due pickups
  Phase 5  — retry failed market box payouts (uses source_transaction since Commit "fix")

Pricing principle (per user, not always followed in code):
  Vendor sets price → buyer pays vendor's stated price + fees → cadence affects pickup count, not price.
```

---

## Findings

### CRITICAL

#### CRIT-1 — `pickupFrequency` is dropped between cart route and CheckoutMarketBoxItem render

**Files:**
- `apps/web/src/lib/hooks/useCart.tsx:15-51` — `CartItem` interface does not declare `pickupFrequency`
- `apps/web/src/app/[vertical]/checkout/page.tsx:72-95` — first map building `marketBoxCheckoutItems` does not pass `pickupFrequency`
- `apps/web/src/app/[vertical]/checkout/page.tsx:190-204` — second map (validation/build path) does not pass `pickupFrequency`

**Effect:** `CheckoutMarketBoxItem.tsx` reads `item.pickupFrequency` (line 13) — always undefined → `isBiweekly = false` → renders `"{N} weekly pickups · {Duration}"` for biweekly subs. User saw "8 weekly pickups · 2 Months" for a biweekly 2-month box.

**Cart route returns it correctly** (`api/cart/route.ts:317`) — the field is in the JSON response, but client TS strips it because the type doesn't declare it, and the page maps that build CheckoutItem don't list it.

#### CRIT-2 — Cart drawer has zero biweekly indication

**File:** `apps/web/src/components/cart/CartDrawer.tsx:440-559` (the `MarketBoxCartItem` render block)

- Line 504: `{vendor_name} · {t('cart.subscription', { term: ... })}` → "Vendor · 4-week subscription". No biweekly indicator at all. Same for weekly. Identical render.
- Line 556: `{t('cart.week_total', { term: ... })}` → "4-week total" — same regardless of cadence.
- No biweekly chip. No "bi-weekly" word anywhere in this component.

So a buyer with a biweekly box in the cart drawer sees no indication that it's biweekly. They only learn about cadence when they hit the checkout page (and even there, only AFTER CRIT-1 is fixed).

#### CRIT-3 — Subscription detail "Next Pickup" banner says "Week 1 of 8" for biweekly 2-month

**File:** `apps/web/src/app/[vertical]/buyer/subscriptions/[id]/page.tsx:380`

```tsx
{t('sub_detail.week_of', locale, {
  current: String(nextPickup.week_number),
  total: String(totalWeeks)
})}
```

- Translation `sub_detail.week_of` (`en.ts:1268`) = `"Week {current} of {total}"`.
- `nextPickup.week_number` is set by `create_market_box_pickups` trigger as `i` in `1..n` → it's a **pickup index**, not a calendar week number. For biweekly 2-month (4 pickups): values are 1, 2, 3, 4. The column is misnamed.
- `totalWeeks` = `term_weeks + extended_weeks` = 8 for 2-month subscription.

Mixed semantics: pickup index over calendar week count. Renders "Week 1 of 8" when the buyer has 4 total pickups. Misleading.

`subs.week` (different key) was renamed to "Pickup {number}" in Commit D. `sub_detail.week_of` was missed.

#### CRIT-4 — Subscription detail "Per Pickup" row math correct but label misleading

**File:** `apps/web/src/app/[vertical]/buyer/subscriptions/[id]/page.tsx:603-606`

```tsx
<span>{t('sub_detail.per_pickup', locale)}</span>     // "Per Pickup"
<span>{formatPrice(Math.round(buyerPaidCents / pickupCount))}</span>
```

For $20 vendor 2-month biweekly box: `$21.45 / 4 = $5.36` displayed.

**Math is correct** (average per pickup). **Label is misleading** — implies "buyer pays $5.36 per pickup" when actually they paid $21.45 once upfront. Buyer doesn't pay per pickup. There is no per-pickup payment event.

User explicitly flagged this: "Its one price period, not a per pickup amount."

---

### HIGH

#### HIGH-1 — Vendor new/edit form labels assume weekly cadence

**File:** `apps/web/src/app/[vertical]/vendor/market-boxes/new/page.tsx`

- Line 173: error `"Please enter a valid 1-month price"` — OK, frequency-neutral
- Line 180: error `"Please enter a valid 2-month price"` — OK
- Line 255: header copy `"Set up a weekly subscription bundle for ... (1 or 2 month terms)"` — **says "weekly" subscription, but vendor may be on biweekly cadence**
- Line 443: `"1-Month Price (4 weeks) *"` — implies weekly ("4 weeks" of pickups)
- Line 472: `"Total for 4 weekly pickups ({price/4}/week)"` — **explicitly says 4 weekly pickups regardless of vendor's frequency**
- Line 526: `"Total for 8 weekly pickups ({price/8}/week)"` — same issue
- Line 530: suggested 8-week price = `4-week × 1.8` ("10% discount from 2x 1-month price")
- Line 729: `"Offer 1-month (4 weeks) or 2-month (8 weeks) subscriptions"` — generic, OK

For a vendor on biweekly cadence, the form tells them they're setting "Total for 4 weekly pickups" when actually buyers will get **2 bi-weekly pickups** for that price. The vendor doesn't see what the buyer will actually receive.

**Edit form (`/[id]/edit/page.tsx`) likely has similar labels** — UNVERIFIED beyond first 80 lines, but interface fields match (line 37: `price_4week_cents`).

#### HIGH-2 — Vendor list page card subtitle says "for 4 weeks" without cadence indication

**File:** `apps/web/src/app/[vertical]/vendor/market-boxes/page.tsx:410`

```tsx
<strong>Price:</strong> {formatPrice(offering.price_cents)} for 4 weeks
```

Shows raw vendor price (correct per user's vendor-only-surface rule). But **"for 4 weeks" is misleading**: for a biweekly box, the vendor sells 2 pickups for that price, not 4 pickups across 4 weeks. The "4 weeks" framing is the term-length, but without cadence context the vendor reading this thinks they're advertising 4 pickups.

#### HIGH-3 — Vendor box detail header subtitle has the same "for 4 weeks" issue

**File:** `apps/web/src/app/[vertical]/vendor/market-boxes/[id]/page.tsx` (header subtitle, post-Commit E)

The Details panel rows now say `(2 bi-weekly pickups)` next to the 1-Month price — that's good. But the subtitle just below the title still reads `"$10.00 · 1 Month"` and `"$20.00 · 2 Months"` (per Commit E) without the bi-weekly indicator there. Mixed signals: the same page tells the vendor "1 Month" in the subtitle and "1 Month — 2 bi-weekly pickups" in the Details panel.

#### HIGH-4 — Vendor list page "active offerings" count has no biweekly indicator

**File:** `apps/web/src/app/[vertical]/vendor/market-boxes/page.tsx`

The frequency toggle (Commit B/C work) is a global setting at the top. But the per-box cards below don't carry a "Bi-Weekly" badge — vendor scanning the list can't see at a glance which boxes are operating in biweekly mode (in fact, since frequency is vendor-wide, ALL boxes are in the same cadence; but a badge per box would still help confirmation).

---

### MEDIUM

#### MED-1 — Browse page card uses per-pickup average framing

**File:** `apps/web/src/app/[vertical]/browse/page.tsx:1466-1473`

```tsx
const freq = ...market_box_frequency || 'weekly'
if (freq === 'biweekly') {
  return `for 4 weeks · 2 pickups (${formatDisplayPrice(offering.price_cents / 2)}/pickup)`
}
return `for 4 weeks (${formatDisplayPrice(offering.price_cents / 4)}/week)`
```

Math is buyer-fee-inclusive (`formatDisplayPrice` adds 6.5%). For biweekly $10 box: `for 4 weeks · 2 pickups ($5.33/pickup)`. For weekly $10: `for 4 weeks ($2.66/week)`.

**Same per-pickup framing concern as CRIT-4** — the buyer doesn't pay $5.33/pickup, they pay $10.65 once. Browse card's `/pickup` suffix invites the same misreading. Lower severity than the subscription detail page because this is a marketing breakdown, not the post-purchase summary.

Also: only the **4-week** term is shown on the card. Buyer doesn't see 8-week pricing on the card; they see it on the detail page. Probably intentional but worth noting.

#### MED-2 — Cart `cart_items` row doesn't capture `pickup_frequency` at add time

**File:** `apps/web/src/app/api/cart/items/route.ts:482-492`

The INSERT into `cart_items` for market boxes stores `cart_id, item_type, offering_id, term_weeks, start_date, quantity, market_id`. No `pickup_frequency`.

**Effect:** if a vendor flips frequency between cart-add and checkout-submit, the cart's "remembered" item picks up the new frequency on next read (`/api/cart` re-derives from offering's vendor profile). Already audited in V1 as MED-5; still present.

Combined with CRIT-1 (cart UI doesn't surface frequency anyway), the buyer's experience is: they add to cart, vendor flips frequency, buyer checks out at the new frequency without ever seeing the change. Not a financial bug since price is server-derived; but a transparency gap.

#### MED-3 — `vendor_skip_week` interval semantics conflict with "1 week" UI promise

**File:** `supabase/migrations/applied/20260420_124_market_box_biweekly_frequency.sql:171-176` (the `vendor_skip_week` function)

Function logic:
```sql
v_interval := CASE WHEN v_frequency = 'biweekly' THEN 14 ELSE 7 END;
...
v_last_date + v_interval  -- extension pickup at last + interval days
```

For weekly: extension at last+7 (= 1 calendar week) ✓
For biweekly: extension at last+14 (= 2 calendar weeks) ✗ doesn't match the prompt copy

**Prompt copy** (per user testing earlier): "Skip This Week? Skipping Week 1 for this subscriber will: ... Add an extra week to the end of their subscription."

For biweekly, "an extra week" is wrong — it's actually +14 days. User's earlier directive: "Keep skip-a-week cadence at 14 days" — so the function math is what they want, but the **prompt copy needs updating** to be accurate.

#### MED-4 — `extended_weeks` column semantics broken for biweekly

**File:** `apps/web/src/app/api/vendor/market-boxes/pickups/[id]/skip/route.ts:163` and several consumer pages

`extended_weeks` is incremented by 1 in `vendor_skip_week` regardless of cadence (migration 124:211-215). For biweekly each "extension" is actually 14 days = 2 weeks. UI displays "+1 extended" / `total_weeks = term_weeks + extended_weeks` which for biweekly understates the actual added duration.

Consumers: `buyer/subscriptions/page.tsx:367`, `buyer/orders/page.tsx`, `subscriptions/[id]/page.tsx`. All assume weekly arithmetic.

#### MED-5 — Pickup mode auto-misses are 48-hour grace per market box (FM)

**File:** `apps/web/src/app/api/cron/expire-orders/route.ts:925-1023` (Phase 4.7)

Already verified working. Notes for the audit: FM 48h grace, FT 2h. Per-vertical correctly.

Confirmed Commit C added comment to `vendor/pickup/page.tsx` explaining the single-purpose rule. Filter is now `?status=ready` + client-side `scheduled_date === today`. ✓

---

### LOW

#### LOW-1 — `subscribe_to_market_box_if_capacity` 7-arg overload dead code

**File:** Postgres function table (from migration 124).

Both call sites now pass 8 args (Commit D). The 7-arg overload is dead. Future cleanup migration: `DROP FUNCTION subscribe_to_market_box_if_capacity(uuid,uuid,uuid,integer,date,integer,text);`

#### LOW-2 — Standalone market box checkout flow defaults frequency to 'weekly'

**File:** `apps/web/src/lib/stripe/webhooks.ts:367-380` (Commit D placeholder).

If the standalone checkout path (`/api/buyer/market-boxes` POST → `createMarketBoxCheckoutSession`) is ever used by a buyer of a biweekly vendor's box, the subscription would be created with `pickup_frequency='weekly'` per the hardcoded default. Currently `MarketBoxDetailClient` routes through the unified cart, so standalone is cold — but if reactivated, biweekly is silently broken in this path.

#### LOW-3 — Refund-on-RPC-failure uses post-Commit-E food subtotal

**File:** `apps/web/src/lib/stripe/webhooks.ts:218,232,239,256`

If the subscribe RPC fails (rare since Commit D fixed the overload), webhooks attempt `createRefund(paymentIntentId, mbItem.priceCents)`. Post-Commit-E, `mbItem.priceCents` IS the vendor's stated price = food subtotal. Stripe charge is `priceCents × 1.065 + flat`. So a refund of `priceCents` would refund LESS than what was actually charged, leaving the buyer-fee portion stuck.

Lower severity than V1's HIGH because the RPC overload bug (root cause of refund-failures) is fixed. But the underlying refund-amount math is still off.

#### LOW-4 — `processMarketBoxPayout` is duplicated between checkout/success and webhooks

**File:** `apps/web/src/app/api/checkout/success/route.ts:271,283` and `apps/web/src/lib/stripe/webhooks.ts:354-361,415-422`

Both call sites use the new shared helper at `src/lib/stripe/market-box-payout.ts` — single source of truth for the payout logic. Good. Only LOW now because both ENTRY points (success route and webhook) have their own subscription-detection code; only the payout step is shared. Future refactor could share the subscribe + payout block.

---

### NOTES / Open questions

- **`week_number` column in `market_box_pickups` is misnamed.** It's actually a pickup index (1..N), not a calendar week. Renaming would touch many consumers; documenting here for clarity.
- **`weeks_completed` column on `market_box_subscriptions` is also misnamed.** Per migration 124's rewritten `check_subscription_completion`, it's incremented by COUNT of completed pickup rows, not by weeks. For biweekly subs, "1 weeks_completed" really means "1 pickup completed."
- **Vendor box detail's `pickups` tab UI** uses `subs.week` translation key (line 470) which Commit D renamed to `"Pickup {number}"` ✓ — consistent now.
- **Migration 126 + Migrations 124+125 are all "Pending Prod"** as of 2026-04-25 — file locations were corrected in the next commit (move-back from `applied/`). MIGRATION_LOG already says "Pending Prod" for all three. Reconciled.
- **Order number on subscription detail** was added in Commit D (line 380 area of subscriptions/[id]/page.tsx renders `Order #FA-...`). User reported it missing earlier; Commit D fixed it. UNVERIFIED whether they retested after Commit D landed.

---

## What changes naturally as the bigger fixes land

If CRIT-1 (cart→checkout pickupFrequency) is fixed:
- CheckoutMarketBoxItem renders `"{count} bi-weekly pickups · 1 Month"` for biweekly — correct.
- Cart drawer still shows nothing biweekly-related (CRIT-2 separate).

If CRIT-3 (subscription detail "Week 1 of 8") is fixed:
- Banner uses pickup_count and a "Pickup X of Y" key (similar to `subs.pickups_progress`).
- The misnamed `week_number` column becomes a pickup index in display, not a week.

If CRIT-4 (Per Pickup label) is addressed:
- Either remove the row, or relabel to "Avg per pickup", or add explanatory text.

If HIGH-1 (vendor form labels) is fixed:
- Vendor form becomes frequency-aware. "Total for 2 bi-weekly pickups" / "Total for 4 weekly pickups". Form already has access to frequency (vendor-level setting on profile).

---

## Final recommendation order (when fixing — don't fix yet)

1. **CRIT-1** — cart→checkout pipe (`pickupFrequency` propagation). Highest impact, smallest change. Restores buyer-side cadence display end to end.
2. **CRIT-3** — subscription detail "Week 1 of 8" — replace with pickup-count framing. Touches one line + new locale key.
3. **CRIT-4** — "Per Pickup" row — remove or relabel. UX call.
4. **CRIT-2** — Cart drawer biweekly indicator. Add chip.
5. **HIGH-1** — Vendor form labels become frequency-aware. Larger UX work.
6. **HIGH-2 / HIGH-3** — Vendor list + detail subtitles. Add cadence indicator.
7. **MED-3** — Skip-week prompt copy. Frequency-aware text.
8. **MED-4** — `extended_weeks` semantics. Affects multiple consumer pages.
9. **MED-1** — Browse card per-pickup framing — UX call, similar to CRIT-4.
10. **LOW** items as cleanup later.

---

**Audit status:** complete. Awaiting user direction on which findings to address and in what order.
