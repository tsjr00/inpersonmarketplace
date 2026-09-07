# Tax Phase 1 Design — Calculation + Capture (2026-09-07, owner-approved sequence)

Status: DESIGN, presented for owner review before any build. Feeds sales_tax_readiness.md
Part III Phase 1. Verified against Stripe docs 2026-09-07 (links at bottom).

## The problem that shapes everything: WHERE tax is computed

- We are pickup-only; tax must compute at the MARKET's address, not the buyer's.
- **Checkout Sessions' `automatic_tax` uses exactly ONE address per session** (entered
  shipping → billing, or the saved Customer address) [Stripe docs, verified 9/7].
- **Our orders can span multiple markets** (order_items.market_id per item; checkout
  success groups by vendor+market) → one session, several pickup addresses.
- Therefore plain `automatic_tax[enabled]=true` on the session is STRUCTURALLY WRONG for
  facilitated sales. (It remains RIGHT for subscriptions — one seller, one address.)

## Options considered

| | Mechanism | Verdict |
|---|---|---|
| A | Manual per-line `tax_rates` built from our mig-214 market jurisdictions | Works multi-market; but WE own taxability logic + rates, Stripe Tax reports/TaxJar never see these transactions, and mixed-taxability bundle lines still unsolved. Fallback only. |
| B | `automatic_tax` + Customer whose address = market | One address per session → wrong for multi-market carts; racy per-purchase Customer mutation. REJECTED for stream 1. |
| **C** | **Stripe Tax Calculations API + Tax Transactions** | **RECOMMENDED.** Explicit `customer_details[address]` PER CALCULATION; per-line `tax_code` + amount; response returns per-line jurisdiction breakdown (name/level/rate); transactions recorded post-payment so Stripe reports + future TaxJar filing include them. Pricing = the API tier the plan already chose (50¢/txn incl. 10 calc calls; 5¢ beyond — multi-market carts stay within 10). |

## Recommended architecture (Option C)

**At session creation (checkout/session route — protected, per-file approval):**
1. Group cart items by market.
2. ONE Tax Calculation per market group: `customer_details.address` = the market's
   address (models in-person possession at pickup; CPA Q1 confirms sourcing), per-line
   `amount` = the item's buyer-paid line (subtotal + embedded buyer-fee share, matching
   the existing Stripe line amounts), `tax_code` from the Phase 1a mapping.
3. **Bundles (owner ruling 2026-09-06/07: taxability follows the items; assembly changes
   nothing):** the calculation runs on the EXPANDED COMPONENTS (which checkout already
   builds) with each component's own tax code — exempt components exempt, taxable taxed.
   The single display line in Checkout is untouched. Margin allocation → CPA Q8 rider
   (proposed: margin allocated pro-rata across components' taxability; if all-exempt
   contents → margin untaxed, per the ruling).
4. Sum `tax_amount_exclusive` across calculations → ONE "Sales tax" line item on the
   Checkout Session (display exactness: page total == Stripe total == orders.total_cents
   INCLUDING tax, conservation-tested).
5. Stash calculation IDs in session metadata.

**At payment (success/webhook — protected):**
6. Create a **Tax Transaction from each calculation** (Stripe's reports/exports now
   include the sale — keeps the future TaxJar/Complete path alive for stream 1).
7. Write the snapshot: orders.tax_total_cents + per-item taxable_amount_cents,
   tax_amount_cents, tax_jurisdictions (Stripe's breakdown names/levels/rates matched
   to the market's stored SEVEN-DIGIT codes — the two-source audit position),
   tax_rate_version = the calculation ID.

**Refunds/cancellations:** each refund path also creates a Tax Transaction REVERSAL for
its portion (Stripe supports partial reversals) + reverses the snapshot at the ORIGINAL
stored amounts. Paths: buyer cancel, cancel-bundle, vendor reject, cancel-date cascade,
no-show — the Part III.1 extended list.

**Payout withholding stays Phase 3** (gated on CPA Q1): this design only ADDS tax on top
of buyer totals and records it; vendor transfers are untouched until Phase 3 subtracts
the tax portion.

## Line-code decisions (Phase 1a scope)
- Listings: `is_taxable=true` → txcd prepared-food class; `false` → exempt groceries
  class. Exact `txcd_` selection at build with a verification spec (TX: taxable vs exempt
  at a TX address must produce non-zero vs zero).
- Tip line: NOT sent to the calculation (voluntary, separately stated; Q2 rider covers).
- Small-order fee + buyer flat fee: embedded per-line (already are) → taxed with the item
  they ride on; standalone small-order line → same code as... [DECIDE at build: simplest =
  give it the dominant cart tax code; CPA Q11 informs]. Cause chip-in: excluded (Q2).
- Subscriptions (Phase 2): plain `automatic_tax` on the subscription object with SaaS
  code — one seller/one address, the simple case; VERIFY the TX 80/20 base in sandbox.

## Test plan (before any protected-file edit ships)
- Sandbox spec: taxable item at a Dallas-address market → nonzero tax matching the Rate
  Locator; exempt item → zero; mixed cart across TWO markets → each group at its own
  market's rate; bundle with mixed contents → only taxable components taxed; refund →
  reversal to the cent. Conservation suite extended with the tax line.

## Open items
1. CPA Q1 (sourcing) — proceed on the market-address assumption; Q1 confirms.
2. CPA Q8 margin allocation refinement (build pro-rata; adjust on answer).
3. `ship_from_details` — Stripe supports origin addresses; for TX origin-vs-destination
   nuance, evaluate passing market address as ship_from AND customer address [small
   build-time experiment; does not change architecture].

Sources: docs.stripe.com/payments/checkout/taxes (one-address-per-session) ·
docs.stripe.com/tax/custom (Calculations API, per-line breakdown, ship_from) ·
docs.stripe.com/tax/file-with-stripe (TaxJar files only Stripe-Tax-calculated txns).

---

## REVISION 2026-09-07 (same day) — Option A′ recommended; C becomes the upgrade seam

Owner challenge: C is complex (multiple API calls/data movements per checkout). Re-examined
honestly: for TX-only, pickup-only, with mig-214 rates + computeItemTax + listings.is_taxable
ALREADY BUILT, self-computation is dramatically simpler and was what the August storage
design pointed at.

**Option A′ — compute tax ourselves from stored market jurisdictions:**
- Checkout: per item, `is_taxable ? line × market's stored combined rate : 0`; per-item
  jurisdiction split via computeItemTax; bundles = components' own is_taxable (owner ruling
  native); sum → ONE "Sales tax" line. ZERO external calls; no per-txn Stripe Tax fee on
  product sales; multi-market carts trivial (each item uses its own market's rate).
- Snapshot: written from OUR jurisdictions — seven-digit codes native, no name matching.
- Refunds: reverse from stored per-item snapshot (same as C).
- Filing: buildListSupplement → Webfile (already the plan's chosen path).
- Stripe's remaining roles: automatic_tax on SUBSCRIPTIONS (Phase 2, one-address fine) +
  optional VERIFIER (calc-API spot-check when a market's codes are entered / monthly sample).
- **The seam:** one function `computeCartTax(cart) → {taxLine, perItemSnapshot}` — checkout,
  capture, display, refunds all call the seam. Multi-state trigger = swap the seam's
  internals for Option C. Nothing else moves.

### Dependencies & must-happen mechanisms A′ requires that C would not (with burden)

| # | Dependency / mechanism | Guardrail | Burden |
|---|---|---|---|
| 1 | **Rate freshness is OURS.** Stored rates must track the Comptroller's QUARTERLY changes; C recalculates live | Quarterly rate-refresh job (Comptroller file, ETag-assertable — §4.5 design exists) + **loud-fail stamp check: tax computation REFUSES/flags when a market's rate_version predates the current quarter** (stale ≠ silent) | One-time: day-scale build. Ongoing: ~0 automated. Failure mode without guardrail = wrong collections for a whole quarter — the guardrail converts it to a loud block |
| 2 | **Jurisdiction completeness at sale time.** A taxable sale needs its market's codes+rates ENTERED; C needs only an address | Per-market tax-readiness gate (no verified jurisdictions → taxable listings at that market can't sell taxed / flagged loudly) + admin "needs codes" queue + III.5 private-pickup resolver before pickup-point taxable sales | Small code guard (hours) + the operational entry (~5 min/market until resolver). The resolver stays the real scale item EITHER way (filing needs codes regardless) |
| 3 | **Taxability truth = vendor-set is_taxable** with no second engine sanity-checking | Existing signup tax notices + category-default suggestions + a periodic anomaly report (e.g., prepared-food category marked exempt → flag) | Light; and mostly shared with C (C still needs US to map listings→tax codes — vendor classification is the root input in BOTH) |
| 4 | **Rounding/allocation math is ours** (per-item, per-jurisdiction split, fee-in-base per Q11) | Spec-tested pure function (conservation suite extended WITH tax; bundle-math precedent); computeItemTax already covers the jurisdiction split | One-time careful build + tests (day-scale), then frozen |
| 5 | **Audit second-source shrinks** (no Stripe record per sale) | Optional monthly sample cross-check via a handful of calc-API calls + entry-time verifier | Tiny, optional; restores the two-source posture cheaply |
| 6 | **TX-only by construction** | Hard assert: seam refuses non-TX market addresses loudly; second state = flip the seam to C | Trivial code; strategic clarity |
| 7 | (Both paths, noted) exemption certificates / tax-exempt buyers not handled v1 | Future item; C has taxability_override, A′ would add a flag | Deferred |

**Net:** the extra burden is concentrated in TWO must-not-fail mechanisms — the quarterly
refresh (with its loud-fail stamp) and the per-market readiness gate. Both are one-time
builds with near-zero ongoing cost, and #1 is required for the FILING data even under C.
**RECOMMENDATION (revised): A′ for the Texas launch, seam designed for C, verifier optional.**
