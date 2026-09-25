# Tax build — pre-build code & systems review (2026-09-24)

**Owner ask (2026-09-24):** "because the next build is so sensitive and close to the money path i want you to do a thorough
code and systems review of all the elements that will be impacted by the tax build before you change any code. make sure
you know how it works and then create a plan to make the changes required."

**Scope of "the tax build" (from `sales_tax_readiness.md` ▶ STATUS 2026-09-24 + `lib/tax/flags.ts:9-16`):**
Batch 3 refund reversals · Batch 4 ops (rate refresh + loud-fail stamp, admin needs-codes queue at approval, monthly
List Supplement report) · event order route through the seam · tax-notice copy · dead TaxCloud file deletion · (stream 2
subscriptions = separate later track, noted only).

**Method:** every claim below carries a `path:line` read this session. No code changed. Findings written per component
as read (compaction recovery points).

## Checklist
- [ ] A. Prior design docs (leads only): `tax_phase1_design.md`, `tax_batch2_plan.md`
- [ ] B. Tax library: `checkout-tax.ts`, `compute-cart-tax.ts`, `jurisdictions.ts`, `flags.ts`, dead `taxcloud.ts`/`tic-codes.ts`
- [ ] C. Schema: `orders.tax_*`, `order_items.tax_*`, `markets.tax_*` (snapshot read)
- [ ] D. Checkout write path: `checkout/session/route.ts` (tax section + order_items insert), `discount-preview`, `bundles/[bundleId]`
- [ ] E. Post-payment: `checkout/success/route.ts`, `webhooks.ts` (order paid → transfers; refunds)
- [ ] F. Money math: `payments.ts` (createRefund, transfers), `pricing.ts`, `fulfill/route.ts` (payout)
- [ ] G. Refund call sites (13 files) — what each refunds, amount source, what it records
- [ ] H. Display: checkout page, BundleCheckout, success page, buyer order page/API, vendor views, tax-summary analytics
- [ ] I. Event order route + `create_company_paid_order` RPC
- [ ] J. Admin jurisdictions API + card; migs 214/215; rate-refresh design (§4.5)
- [ ] K. Tests/pins: `flow-integrity.test.ts` tax pins, tax unit tests
- [ ] L. Vault diff on money files (`git diff vault --stat`)
- [ ] M. Stream 2 note: where subscriptions are created

## Findings

### A. Prior design docs ✅ (read 2026-09-24; leads, re-verified in B/D below)
- `tax_batch2_plan.md` build log: orders + order_items are created AT SESSION TIME (session route), success route only
  flips status; webhook = backstop finalizer; snapshot written in the session route; Q11/Q8/Q10 interim base policies;
  market boxes EXCLUDED from tax; event order route and refund reversals explicitly NOT in Batch 2.
- Dead TaxCloud files: only referenced by `docs/Codebase_Map/21_Lib_Reference.md:176` ("the dead half — do not build on")
  and an old business-model doc. No source import (grep of `src` this session: zero importers outside `lib/tax/`).

### C. Schema ✅ (snapshot read 2026-09-24, structured tables stamp 257)
- `markets`: `tax_jurisdictions jsonb NOT NULL '[]'`, `tax_rate_total_pct numeric` (CHECK 0..8.25 `:3879`),
  `tax_rate_version text`, `tax_jurisdiction_verified_at timestamptz`, `tax_jurisdiction_note text` (`:1435-1439`).
- `order_items`: `tax_amount_cents int4` (CHECK ≥0 `:3890`), `taxable_amount_cents int4` (CHECK ≥0 `:3892`),
  `tax_jurisdictions jsonb`, `tax_rate_version text`, `tax_source text` (`:1498-1502`); also `refund_amount_cents int4`,
  `cancellation_fee_cents int4`, `discount_cents`, `subtotal_cents`, `platform_fee_cents`, `vendor_payout_cents`.
  Partial index `idx_order_items_tax_collected` on created_at WHERE tax_amount_cents>0 (`:3343`).
- `orders`: `tax_total_cents int4` (CHECK ≥0 `:3895`) `:1546`; no refund column on orders (status only).
- 🔴 **LATENT BUG (High, snapshot-based — confirm on live DB before relying):** `order_items_tax_source_check` allows
  ONLY `'none' | 'manual' | 'stripe'` (`SCHEMA_SNAPSHOT.md:3891`), but the session route writes
  `tax_source: 'self_computed_v1'` when the flag is on (`checkout/session/route.ts:1156`). Dark today (the spread is
  skipped while `enabled:false` `:1151`), so nothing fails now — **the day the flag flips, every taxable
  checkout's order_items INSERT would violate the CHECK.** Fix belongs in the Batch 3/4 migration (extend the CHECK).
  The CHECK ≥0 on `tax_amount_cents` also means reversals can NOT be stored as negative item rows — a separate
  reversal record (or per-item `tax_refunded_cents`) is required.
- No `refunds`/`order_refunds` table in the snapshot grep — refunds are recorded ONLY as `order_items.refund_amount_cents`
  + status flips + Stripe's own ledger (verified by the grep above; absence claim → confirm with an unfiltered table
  list before the plan is final).

### C-addendum ✅ CHECK constraint origin CONFIRMED in repo
`supabase/migrations/applied/20260801_214_tax_jurisdiction_storage.sql:90-91`:
`tax_source TEXT CHECK (tax_source IS NULL OR tax_source IN ('none','manual','stripe'))` — applied to all three envs
(snapshot changelog `:111`). Session route writes `'self_computed_v1'` (`checkout/session/route.ts:1156`).
**Confirmed latent bug — flag flip today would 23514 every taxable order_items insert.** Mig 249 comment `:98` lists
tax columns among "service-only" money columns (RLS) — reversal writes must use the service client.

### D. Checkout write path ✅ (`checkout/session/route.ts`, tax + money lines read)
- Per-item money written at `:718-719`: `platform_fee_cents = itemPercentFee`, `vendor_payout_cents = netSubtotal −
  vendorPercentFee − itemVendorFlatFee` — computed BEFORE tax (`:766`); tax never enters either. ✅ §2b satisfied by shape.
- Tax call `:770-778` passes `netSubtotalCents: oi.subtotal_cents` per order item (idx as ref) + bundle margin context;
  refusal → `ERR_CHECKOUT_TAX` validation error `:783` (checkout blocked, loud). `taxTotalCents` `:788`.
- `totalCents` `:811` = buyerTotal + smallOrderFee + tip + chipin + bundleMarginAddend + **tax**. Stripe line "Sales
  tax / Texas sales tax" only when `taxTotalCents > 0` `:1036-1041`. Orders insert `:1113-1135` writes
  `tax_total_cents` only when `enabled` (NULL = never computed vs 0 = computed exempt). order_items insert
  `:1144-1156` spreads the per-item snapshot only when `enabled`.
- Comment `:692`: "Every refund path recomputes buyer-paid from subtotal_cents" — the refund paths do NOT read the
  order's stored totals; they rebuild `buyerPaidForItem`. ⇒ tax reversal must be ADDED to that rebuild, from the
  item's snapshot (`tax_amount_cents`), never recomputed from today's market rates.

### E. Post-payment ✅ (success route + webhooks refund paths)
- `success/route.ts:74-133` dead-order path: full auto-refund of `session.amount_total` (includes tax) with key
  `${orderId}-dead-order` shared with `webhooks.ts:202-215`. Full-amount → tax fully reversed in Stripe terms, but
  NOTHING records the reversal for the List Supplement (order flips to cancelled/refunded only).
- `success/route.ts:613` selects `tax_total_cents` for the success page (display only). Market-box auto-refunds
  `:297,:316` and `webhooks.ts:363,:378,:604,:619` refund MB price × (1+buyer%) — MB excluded from tax (Q10) → no tax.
- **`handleChargeRefunded` `webhooks.ts:1168-1295`** (Stripe-dashboard refunds): full → order `refunded`, all
  un-cancelled items `refunded`, `refund_amount_cents` apportioned by subtotal floor+remainder to equal
  `charge.amount_refunded` exactly `:1216-1237`; partial → only `payments.status = partially_refunded` `:1240-1243`,
  NO item rows touched. ⇒ an admin partial refund leaves no per-item record at all today; a tax reversal record for
  dashboard refunds can only be derived (full: negate every item's snapshot; partial: unknowable per item — must be
  an admin-entered allocation or a documented "not supported, use in-app paths" rule).
- Event-fee refunds (`refundEventFeePayment`, `event-fee-payments.ts`) = stream 3 vendor-space fees, not taxable — out.

### F. Money math ✅ (`pricing.ts` full read; payments.ts createRefund)
- `FEES` `:14-19`; `calculateOrderPricing` `:113-141` — `vendorPayoutCents = subtotal − vendor% − vendorFlat`; no tax
  anywhere in pricing.ts (unfiltered read). `proratedFlatFeeSimple` `:210` (floor) is what reject/cron use for the
  15¢ share; `proratedFlatFee` `:193` (exact) exists but the refund paths use the Simple one.
- `createRefund(paymentIntentId, idempotencySuffix, amount?)` `payments.ts:248-262`: key
  `refund-${pi}-${suffix}-${amount ?? 'full'}` — **the amount is part of the key**, so changing a path's refund amount
  (adding tax) changes its key: safe for new refunds, but a retry of a pre-tax refund with a post-tax amount would
  create a SECOND refund. Only matters for in-flight orders at flip time (none — flag flips on a chosen date).
- `createRefund` has no `reverse_transfer` (comment `event-fee-payments.ts:37`); product orders use separate
  transfers on fulfil, so refunds of unfulfilled items don't need reversal. Tax is platform-held (never transferred)
  → a tax refund is purely platform-balance → no transfer reversal needed for the tax portion. ✅

### G. Refund call sites — inventory (grep this session; 13 files call `createRefund`)
| Path | Amount | Suffix | Records |
|---|---|---|---|
| vendor reject `reject/route.ts:118,175` | `subtotal + buyer% + floor(15¢/N)` per item; + tip+small-order fee when last item `:246` | item id / `-order-fees` | `refund_amount_cents` `:129` |
| buyer cancel `cancel/route.ts:130-140,255` | `calculateCancellationFee()` (25% fee possible) | item id / `-order-fees` (tip only) `:284` | `refund_amount_cents`, `cancellation_fee_cents` `:149-150`; vendor share transfer `:300-340` |
| cancel-bundle `:114,177,194,207` | per-component calc + margin refund + tip | per.id / `-bundle-margin` / `-order-fees` | `refund_amount_cents` |
| resolve-issue `:152,220,329` | buyerPaidForItem; + fees `:329` | item id / `-order-fees` | `refund_amount_cents` `:168` |
| expire-orders cron `:214,275,292` | buyerPaidForItem; + fees | item id / `-order-fees` | `refund_amount_cents` `:225` |
| cancel-date-cascade `:136,185,276` | buyerPaidForItem; + fees | item id / `-order-fees` | `refund_amount_cents` `:151` |
| vendor event withdraw `vendor/events/[marketId]/cancel:338,362` | buyerPaidForItem | item id | `refund_amount_cents` `:348` |
| event cancel (token) `:232`, admin event cancel `:673`, event-reconfirm `:150` | **FULL PI refund, no amount** | `-event-cancel` / `-reconfirm` | order status only |
| success dead-order `:124`, webhook dead-order `:204` | full `amount_total` | `-dead-order` | payments row + status |
| webhook `charge.refunded` `:1168` | Stripe-side (dashboard) | n/a | full: apportioned `refund_amount_cents`; partial: payments.status only |
| market-box refunds (success `:297,316`; webhooks `:363,378,604,619`) | MB price×1.065 | offering id | — (MB untaxed, Q10) |

Six paths share the SAME `buyerPaidForItem` formula inline (`subtotal + round(subtotal×6.5%) + floor(15/N)`):
reject, resolve-issue, expire-orders, cancel-date-cascade, vendor-event-withdraw, + `cancellation-fees.ts:74` (buyer
cancel/bundle via the pure helper). ⇒ Batch 3's cleanest shape is ONE helper `refundableTaxCents(item, fraction)`
(pure, from the snapshot) added beside `buyerPaidForItem` at each site — not a rewrite of six routes.

### B. Tax library ✅ (full unfiltered reads)
- `flags.ts:20` — `TAX_STREAM1_ENABLED = false`; header `:9-16` lists the four flip prerequisites.
- `checkout-tax.ts` (145 lines) — `computeCheckoutTax(serviceClient, items, bundle, now)`: flag gate `:94` returns
  `{enabled:false, totalTaxCents:0, items:[]}` with NO DB reads; loads `listings.is_taxable` `:98-101` and
  `markets.state, tax_jurisdictions, tax_rate_version, tax_jurisdiction_verified_at` `:110-113`; base policy
  `taxableBaseCents = net + round(net × buyerFeePercent/100)` `:61-63`; bundle margin allocated pro-rata into TAXABLE
  component bases (floor+remainder) `:71-90`; unknown listing → not taxable `:130`; item with no market → `''` so the
  seam refuses `:140`. Result union `:54-57`.
- `compute-cart-tax.ts` (173 lines) — pure. Guardrails per market that has a taxable item with base>0 `:112-114`:
  not_texas `:124`, no_jurisdictions `:132`, invalid `:137`, unverified `:141`, stale_rates `:145` (rate_version must
  equal `YYYY-Qn` of NOW, `:93-101`). ALL-OR-NOTHING `:154`. Per item: `computeItemTax` → `{taxableAmountCents,
  taxAmountCents, jurisdictions[{code,name,level,rate_pct,tax_cents}]}` + `rateVersion` `:156-165`.
- `jurisdictions.ts` (178 lines) — `computeItemTax` rounds EACH jurisdiction to the cent and sums `:96-108` (total is
  derived from parts; matches Form 01-116). `buildListSupplement` = group-by code over snapshot rows `:136-172` — the
  monthly report is a group-by of `order_items.taxable_amount_cents + tax_jurisdictions`, never a recompute.
  `validateJurisdictions` `:57-86`; `parseJurisdictions` tolerant `:175-183`.
- **Implication for Batch 3 (refunds):** the per-item snapshot already carries every jurisdiction line with its cents.
  A FULL-item reversal is "negate the snapshot"; a PARTIAL reversal must prorate the snapshot (per-jurisdiction
  floor+remainder or re-run `computeItemTax` on the refunded base at the SNAPSHOT rates — never today's market rates).
  The List Supplement builder has NO notion of negative rows yet — reversals need a storage shape it can subtract.
- **Implication for Batch 4 (rate refresh):** the freshness check is string-equality on `markets.tax_rate_version`
  vs the current UTC quarter (`:93-101`). The refresh job's minimum contract: at each quarter-turn, re-stamp every
  verified market's `tax_rate_version` (after confirming rates) — otherwise every taxable checkout refuses on day 1 of
  the quarter. UTC quarter, not market-tz — fine (quarter boundaries are dates; the 6-hour skew is harmless).

### H. Display surfaces ✅ (grep + reads)
- Checkout page: `taxPreviewCents` from `/api/checkout/discount-preview` `page.tsx:71,117`; sits INSIDE
  `preChipinTotal` `:670` so round-up stays whole-dollar; line renders only when >0 `:1039-1048`. Preview route
  returns `tax_total_cents` = 0 (flag off) / cents / **null when a market is not ready** (page hides the line; the
  session route then refuses loudly) `discount-preview/route.ts:75-101`. Bundle detail mirrors `bundles/[bundleId]:85-99`;
  `BundleCheckout.tsx:133-136,177-180`.
- Success page note `success/page.tsx:301-304` (Total already includes tax). Buyer order API `buyer/orders/[id]/route.ts:36,127`
  + page line `:1427-1441`. Per-item refund display `buyer/orders/[id]/page.tsx:1340-1342` shows `item.refund_amount_cents`
  ⇒ if Batch 3 stores refund_amount_cents INCLUSIVE of the tax refunded, the buyer sees the true amount with no UI change.
- Vendor `analytics/tax-summary/route.ts:40-70`: informational only, counts `subtotal_cents` by `listings.is_taxable` for
  fulfilled/completed items — does NOT read the snapshot columns. Untouched by the build (could later read
  `tax_amount_cents`, backlog).
- No admin List Supplement surface exists: `buildListSupplement` has ONE reference in `src` — its own definition
  (`jurisdictions.ts:137`; grep this session). The monthly report (Batch 4) is a NEW surface.

### I. Event order route + RPC ✅
- `api/events/[token]/order/route.ts` (134 lines, full read): auth + access code, then ONE RPC call
  `create_company_paid_order(p_user_id, p_market_id, p_reservation_id, p_listing_id, p_vendor_profile_id, p_wave_id)`
  `:76-85`; no pricing in TS. RPC body (latest DEFINING migration `20260412_119_company_paid_fees_and_cap.sql`; mig 250
  only re-grants): fees inline `:139-144` (buyer 6.5%+15, vendor 6.5%+15), inserts orders `:147-159` + order_items
  `:165-174` — **no tax columns**. Host-paid V1 design §2 already DROP+CREATEs this function (mig 259 outline,
  `host_paid_events_design.md:54-74`) ⇒ tax for event orders = add `p_tax_total_cents` + per-item snapshot params to
  THAT rewrite; the route computes via `computeCheckoutTax` first (one engine pin extends to a 4th caller). Owner ruled
  2026-09-22 (decision 10/14): host pays 6.5% baked + $0.50/meal facilitation — tax on attendee meals is a NEW question
  for the host-paid design (who bears it: host invoice line). → §8 open item there.

### J. Admin intake + rate refresh ✅
- `api/admin/markets/[id]/tax-jurisdictions/route.ts` (full read): GET returns codes/rate/version/verifiedAt/
  `needsReverification` + address + lat/long `:96-140`; PUT normalizes decimal→percent `:171-190`, validates, TX-only
  `:196-200`, writes all five columns with `tax_jurisdiction_verified_at = now()` `:208-216`. **`rateVersion` is free
  text typed by the admin** `:161` — nothing enforces the `YYYY-Qn` form the seam requires (`compute-cart-tax.ts:93-101`).
  A typo ("2026 Q3") refuses every checkout at that market. Batch 4 must validate/derive it server-side.
- Mig 215 trigger clears `verifiedAt` on any address change (keeps codes) — the seam's `unverified` refusal then
  blocks taxable checkout at that market until an admin re-saves. Correct, loud.
- **Market approval** `api/admin/markets/[id]/route.ts:122` sets `approval_status` with NO tax check (III.7 gate not
  built). **Private pickup markets are auto-approved at creation** `api/vendor/markets/route.ts:684-685`
  (`status:'active', approval_status:'approved'`) — CONFIRMS the III.7 "VERIFY AT BUILD" doubt: a vendor-created
  private pickup sells immediately with no codes → today that would be an exempt-only location (taxable item →
  checkout refused loudly, `no_jurisdictions`). Product decision needed (see plan Q3).
- Cron registry `vercel.json` (7 crons; none for tax). Readiness §3/§4.5: refresh "designed, not built"; source =
  Comptroller quarterly rate file (static XLSX w/ ETag — [VERIFY at build: URL + columns]). Seam freshness is exact
  string equality with the CURRENT quarter ⇒ a job that stamps early is "stale" until the boundary, a job that runs
  late halts every taxable checkout from 00:00 UTC on the 1st. Design must handle the boundary explicitly (plan §B4).

### K. Tests / pins ✅
- `flow-integrity.test.ts:3290-3350`: flag ships false; three routes use the ONE engine; session route has
  `ERR_CHECKOUT_TAX` + `tax_source: 'self_computed_v1'` + the total conservation regex; engine owns flag+base policy.
  ⚠ The pin `:3335` asserts the literal `'self_computed_v1'` — the CHECK-constraint fix (C-addendum) must extend the
  DB CHECK, not rename the source string (renaming would also be a pin change = test change → owner gate).
- Unit specs: `checkout-tax.test.ts` (10), `compute-cart-tax.test.ts`, `jurisdictions.test.ts` (22). No refund/
  reversal spec exists (none can — no code). `cancellation-fees.ts` has its own spec (tests dir; not read — the pure
  function's inputs are what matter: `subtotalCents, totalItemsInOrder, orderStatus, orderCreatedAt, vertical,
  smallOrderFeeCents` `:35-43`; adding a tax input is an additive optional field).

### L. Vault ✅
- Vault = `7f895e5` (manifest `:5`), pre-dates the whole tax build. `git diff vault --stat` on the 7 money files:
  3,152 insertions / 933 deletions (webhooks +1,525). The vault diff is required reading before touching
  `payments.ts` / `webhooks.ts` / checkout routes — but it no longer describes "the working version" of these
  files; the last user-verified state of the checkout+refund paths is Prod `d704d3bb`. Plan uses `git diff d704d3bb`
  as the practical baseline and notes the vault is stale for money files (owner decides whether to re-vault).

### M. Stream 2 note ✅
- `api/subscriptions/checkout/route.ts:298-316`: `mode:'subscription'`, price id, metadata — no `automatic_tax`.
  Stream 2 = add `automatic_tax: { enabled: true }` (+ Stripe Dashboard: tax settings, TX registration, SaaS product
  tax code on the Prices) and read `total_details.amount_tax` in the subscription webhook. Separate track; not in
  this plan's build order.

### N. `payments` table ✅ (snapshot `:1642-1656`)
- Has `refunded_at`, `refund_amount_cents`, `stripe_fee_cents` — grep found NO writer of `payments.refund_amount_cents`
  or `payments.refunded_at` in `src` (presence-grep only; Medium-High). Refund truth today = `order_items.refund_amount_cents`
  + Stripe. Not a candidate home for tax reversals (payment-level, not item/jurisdiction-level).

---

## Plan — "the tax build" in build order (NO code changed; every step below awaits its own go)

### Guiding facts (from the review)
1. Tax is platform-held money: it rides `orders.total_cents` only; never in `platform_fee_cents`/`vendor_payout_cents`;
   never transferred. A tax refund is a platform-balance refund — no transfer reversal, no payout math changes.
2. Every in-app refund path rebuilds `buyerPaidForItem` from `subtotal_cents` and passes an explicit amount to
   `createRefund`. Today that amount EXCLUDES tax ⇒ once the flag flips, a cancelled taxable item would leave the
   buyer's tax in our account and unreported. Batch 3 = add the item's snapshot tax to that amount + record the reversal.
3. The per-item snapshot (`tax_amount_cents`, `taxable_amount_cents`, `tax_jurisdictions[{code,rate_pct,tax_cents}]`,
   `tax_rate_version`) is sufficient to reverse at the ORIGINAL rate. Nothing recomputes from today's market rates.
4. Two latent defects must be fixed in the same migration: the `tax_source` CHECK (C-addendum) and the missing
   home for reversals (CHECK ≥0 forbids negative item rows).

### B3 — Batch 3: refund-path tax reversals
**Migration (next free number; 259 is reserved by the host-paid design — confirm numbering with owner):**
- `ALTER TABLE order_items DROP CONSTRAINT order_items_tax_source_check; ADD CHECK (... IN ('none','manual','stripe','self_computed_v1'))`.
- NEW append-only ledger `order_item_tax_reversals` (id, order_item_id FK, order_id FK, reversal_kind
  ['item_refund','order_refund','dashboard_refund'], refund_ref text (Stripe refund id or idempotency suffix),
  taxable_amount_cents ≥0, tax_cents ≥0, jurisdictions jsonb (same shape as the snapshot, per-jurisdiction cents),
  rate_version text, created_at). Service-role only (mig 249/250 pattern). Index (order_item_id), (created_at).
  WHY a ledger, not a column: the List Supplement is per-jurisdiction and per-month; a reversal in a later month
  than the sale is a negative line in THAT month's return; 4-year audit retention (§151.0242). Snapshot rows stay immutable.
- Pre-check/post-check blocks in the file; snapshot changelog row at file creation (Rule G).
**Code (unprotected, new):** `lib/tax/refund-tax.ts` —
- `taxReversalForItem(snapshot, refundedBaseCents | 'full')` PURE: full → exact snapshot; partial → per-jurisdiction
  `floor(tax_cents × fraction)` + remainder to the last jurisdiction (conservation-exact), capped by (snapshot −
  already-reversed). Returns `{taxCents, taxableAmountCents, jurisdictions}`.
- `alreadyReversedCents(serviceClient, orderItemId)` and `recordTaxReversal(serviceClient, …)` writer.
- `refundAmountWithTax(buyerPaidForItem, reversal)` = buyerPaid + reversal.taxCents (what `createRefund` gets and
  what `refund_amount_cents` stores — the buyer's true refund; the order page shows it unchanged).
**Code (call sites, one helper call each, shape identical at every site):**
- Per-item paths (7): vendor reject ⚠protected · buyer cancel · cancel-bundle · resolve-issue · expire-orders cron
  · cancel-date-cascade · vendor event withdraw → `amount = buyerPaidForItem + taxReversal.taxCents`; write
  `refund_amount_cents` inclusive; `recordTaxReversal` AFTER the Stripe refund succeeds (refund_ref = Stripe refund id);
  on refund failure the existing `ERR_REFUND_001` log carries the tax cents too.
- Whole-order full-PI paths (5): events token cancel · admin event cancel · event-reconfirm · success dead-order
  ⚠protected · webhook dead-order ⚠protected → Stripe amount unchanged (already full); ADD one ledger row per
  un-cancelled item = full snapshot (reversal_kind 'order_refund').
- Dashboard `charge.refunded` ⚠protected: FULL → ledger rows for every item (full snapshot); PARTIAL → **no automatic
  allocation** (the code already records nothing per item for partial dashboard refunds `:1240-1243`); logError
  `ERR_REFUND_001`-class "tax reversal needs manual allocation" so it surfaces in the error-log review. (Owner Q2.)
- Market-box refunds: untouched (MB untaxed, Q10).
**Partial-refund policy (25 % cancellation fee):** interim = pro-rata (tax reversed on the refunded 75 % of the base;
tax on the retained 25 % stays collected/remitted). Recorded as CPA Q12. (Owner Q1.)
**Tests (spec first, from the rule, never from code):** unit spec for `taxReversalForItem` (full = snapshot; partial
conservation; cap; original-rate invariance when market rates change); flow-integrity pin: every file that calls
`createRefund` (enumerated by grep IN the test, not typed) either calls `recordTaxReversal`/`refundAmountWithTax` or is
on the explicit MB/event-fee allowlist. Existing pins unchanged.
**Protected-file approvals owed (change-discipline Rule 3, each with before/after diff):** `reject/route.ts`,
`webhooks.ts` (2 blocks: dead-order + charge.refunded), `checkout/success/route.ts` (dead-order block).
Vault diff: baseline `d704d3bb` (see L).

### B4 — Batch 4: operations
1. **Rate-version integrity now (small):** PUT validates/derives `rateVersion` as `YYYY-Qn` (`tax-jurisdictions/route.ts:161`)
   — free text today can silently refuse every checkout at a market.
2. **Quarterly rate refresh** — new cron `/api/cron/tax-rate-refresh` + `vercel.json` entry (map + cron test will
   demand both). Runs DAILY (cheap; idempotent): (a) fetch the Comptroller quarterly rate file [VERIFY URL/format at
   build], (b) for each market with codes: compare each code's rate; if unchanged and we are in a new quarter → stamp
   `tax_rate_version = currentQuarter`; if a rate changed → update `rate_pct` + `tax_rate_total_pct` + stamp (log the
   delta, notify admin); if a code is MISSING from the file → clear `tax_jurisdiction_verified_at` + admin queue
   (never silent); (c) fetch failure → no stamps, logError loud; markets then refuse from the boundary (the designed
   loud-fail). **Boundary handling (owner Q4):** the job pre-fetches next quarter's file when published and stamps at
   the first run ON/AFTER the boundary; Vercel cron at `5 0 * * *` UTC gives ≤1 day of refusals at worst → propose
   the seam accept `nextQuarter` ONLY within the last 7 days of a quarter when the market's rates match the
   upcoming file (a seam change → pin change → owner gate).
3. **Admin needs-codes queue** — one admin surface listing markets (incl. private pickups) with `approval_status
   pending` OR (`approved` AND (no codes OR `verified_at IS NULL`)); links to the existing card. III.7 gate on the
   approve action (`admin/markets/[id]/route.ts:122`): approving requires verified codes or a logged override.
   **Private pickups** (auto-approved `vendor/markets/route.ts:685`): owner Q3 — (a) keep auto-approve; exempt-only
   sales work, a taxable item refuses until an admin codes it (queue catches it), or (b) III.7 literal: new private
   pickups start `pending` until coded (vendor cannot sell there at all until then).
4. **Monthly List Supplement report** — admin page + CSV over a date range: `buildListSupplement(snapshots)` minus the
   same roll-up of `order_item_tax_reversals` (extend the builder with a sign or a second pass — pure, spec'd);
   reconcile line vs Stripe itemized export (III.4 step 3).
5. **Anomaly report on `is_taxable`** (light): vendor listings flagged exempt in taxable categories (FT vertical /
   prepared food) — a list, not a gate.

### B5 — Event order route through the seam
Fold into `host_paid_events_design.md` §2 (mig 259 RPC rewrite): route calls `computeCheckoutTax` first (4th one-engine
caller), passes tax total + per-item snapshot into the RPC; refusal → the event order refuses loudly like checkout.
Host-side presentation of tax (invoice line) = new §8 item there. Not started before the host-paid build.

### B6 — Cleanup / edges
- `tax-notice.ts:9,36` copy: fix-or-fulfill (owner Q5) — with a 2nd tester live, "will be automatically applied" is
  now user-facing and false.
- Delete `lib/tax/taxcloud.ts` + `tic-codes.ts` (+ map line `21_Lib_Reference.md:176`) via `git rm` (owner Q6; file
  deletion needs explicit approval).
- decisions.md TaxCloud rows already struck + 2026-09-24 row added (done today).

### Flip readiness checklist (unchanged from flags.ts, now with owners)
Batch 3 ✔code · Batch 4 refresh ✔code · event route ✔code (host-paid build) · real codes verified on every live
market (owner + admin, Staging first) · registration effective date (owner) · one simulated month on Staging
(III.4 step 3) · THEN the flag flip = its own approved change (pin `:3309` updated in that same change).

### Build order v2 — certainty first, then learning (owner 2026-09-24) · progress
| # | Step | Status 2026-09-24 |
|---|---|---|
| 0 | Owner enters real codes on Staging test markets via the card | owner |
| 1 | Migration 259 `20260924_259_order_items_tax_source_self_computed.sql`: DROP+ADD the CHECK with `self_computed_v1`; pre-check + post-check in the file; snapshot changelog row written (Rule G); guardrail suite green | ✅ APPLIED Dev + Staging 2026-09-24 (post-checks identical); Prod pending; snapshot rows updated from measured text |
| 2 | Admin PUT validates `rateVersion` as `YYYY-Qn`, blank → current quarter, off-quarter → warning; card uses the engine's UTC quarter label + shows the stored version after save | ✅ BUILT (uncommitted) |
| 3 | Cleanup: FT notice copy, delete TaxCloud files | waits Q5/Q6 |
| 4 | Needs-codes queue = "Tax codes" filter + not-ready chip on the existing markets admin list (no new page) | ✅ BUILT |
| 5 | `lib/tax/refund-tax.ts` pure reversal math + 11 specs (policy-neutral: portion is the caller's) | ✅ BUILT |
| 6 | Report `tax_list_supplement` (Form 01-116) over snapshots, CSV, on the existing reports page | ✅ BUILT |
| 7 | **Item 1 ✅** `buildNetListSupplement` (pure, 8 specs) · **Migration 260 FILE WRITTEN** — `order_item_tax_reversals` ledger + `order_tax_reversal_queue` (Q2), service-only, live post-check = scoped catalog export; Rule L suite RED BY DESIGN until Dev + Staging apply → owner pastes the export → structured sections rebuilt → stamp 260 | ✅ 260 APPLIED Dev + Staging 2026-09-24; snapshot rebuilt from the Dev export (stamp 257 → 260); guardrail suite GREEN 364/364; Staging export received: identical to Dev, 41 rows |
| 8–11 | Refund call sites (unprotected first, protected last) | waits Q1/Q2 + step 7 |
| 12 | Rate-refresh: verify Comptroller file source, then cron | spike next (no code) |
| 13–15 | Approval gate (Q3), event route (host-paid build), simulated month → flip | later |
Gates after steps 2/4/5/6: tsc 0 · eslint 0 errors · vitest 333/333 in tax + flow-integrity + map coverage
(refund-tax.ts is covered by the `src/lib/tax/**` claim block). Docs in the same batch: map 19/21 + index stamps,
registry TR-110–113, printable list W11 + mapping row.
**What steps 5/6 taught (for step 7):** the report needs, per reversal, exactly the snapshot's shape (code · name ·
level · rate_pct · tax_cents) plus `taxable_amount_cents` and the item's `tax_rate_version`; period placement is
the REVERSAL's created_at, not the sale's. So the ledger row = `{order_item_id, order_id, kind, refund_ref,
taxable_amount_cents, tax_cents, jurisdictions jsonb, rate_version, created_at}` — no other columns are needed by
either consumer. The report's "minus reversals" = `buildListSupplement(reversal rows)` subtracted by code.

### Step 12 spike — Comptroller rate-file source (verified live 2026-09-24, no code)
- **Source found:** `https://comptroller.texas.gov/data/edi/sales-tax/taxrates.txt` (current quarter) and
  `taxrates{YY}{Q}.txt` archives (e.g. `taxrates263.txt` = 2026 Q3; listed at
  `comptroller.texas.gov/taxes/file-pay/edi/sales-tax-rates.php`). Plain text, tab-separated, CRLF, ~241 KB,
  served with `Last-Modified` + `ETag` (CloudFront). Fetched and parsed this session.
- **Layout (from the file itself):** line 1 = header `1 ⇥ 20263 ⇥ 202609 ⇥ "2026 - 3rd" ⇥ 0.0625 ⇥ 0 ⇥ 3715 ⇥ msg`
  → field 2 = the quarter the file describes (`YYYYQ`), field 5 = state rate, field 7 = row count. Then 16
  filing-due-date rows (`20261 q 4/20/2026`, `202601 m 2/20/2026` …). Then 3,715 area rows of 12 fields:
  `area name ⇥ code ⇥ rate ⇥ county ⇥ code ⇥ rate ⇥ [transit] name ⇥ code ⇥ rate ⇥ [SPD] name ⇥ code ⇥ rate`,
  `n/a` where absent, rates as decimals (0.02 = 2 %). ⚠ Column 2 is NOT always a city: 111 rows carry an
  SPD/assistance-district code (5…/6…) there ("Amarillo/Randall Co AD 1 ⇥ 6191606"). Code families seen: 2… city
  (1,179), 3… transit (12), 4… county (127), 5… SPD (507), 6… SPD/AD (111). **1,937 distinct codes; every code
  has exactly ONE rate across the whole file** (checked) → a `code → rate` map built from all four triples is the
  safe primitive. Real Amarillo = `2188013` @ 2.0 % (the unit tests' `2188024` is fictional test data).
- **Timing (the finding that changes the design):** on 2026-09-24, six days before Q4, `taxrates264.txt` is **404**.
  The Q3 file's `Last-Modified` is **2026-07-23**, 22 days AFTER Q3 began (and the Q2 archive was re-stamped the
  same day). The open-data rate-change feed (`data.texas.gov/resource/tmhs-ahbh`) has NO future effective dates
  (max = 2026-07-01) and carries names only, no codes. ⇒ **There is no machine-readable source that lets us verify
  next quarter's rates before the quarter starts, and the new file can land weeks late.** A job that refuses to
  stamp until the new file exists would halt taxable checkout for up to ~3 weeks every quarter.
- **Q4 reframed for the owner:** (a) **carry-forward** — at the boundary, if the new-quarter file is not yet
  published, the job stamps the new quarter for every market whose codes all exist in the LATEST file at the SAME
  rates, records `carried_forward`, and re-checks daily; when the new file lands, a changed rate is applied
  forward and an admin notice lists orders taxed in between (platform absorbs any cent difference — local changes
  are rare and ≤ 2 %); a code missing from the new file clears `verified_at` (loud). (b) refuse until the new file
  is published (halts sales). Recommend (a). The seam's freshness check stays exact-quarter; only the JOB decides
  when to stamp.
- **Rate-locator address dataset** (for the future resolver, III.5): announced 2021 as downloadable from
  `gis.cpa.texas.gov`; the site is a JS app — the download URL was not reachable by fetch this session. Not needed
  for Batch 4.

### Owner questions before B3 starts
Q1 partial-refund tax policy (pro-rata interim?) · Q2 dashboard partial refunds = manual-allocation log only? ·
Q3 private-pickup intake (a/b) · Q4 quarter-boundary handling (seam grace vs pure cron timing) · Q5 tax-notice copy
now? · Q6 delete the two TaxCloud files? · Q7 migration number (259 reserved → next free) · Q8 vault: re-vault the
money files at `d704d3bb` before B3?

### Owner rulings received 2026-09-24 (recorded in decisions.md the same day)
- **Q1 → (a)** pro-rata: refund 75 % of the item's tax with the 75 % refund; tax on the retained 25 % stays remitted. Call-site
  policy for buyer cancel + cancel-bundle: `portion = { kind:'partial', refundedBaseCents: round(base × 0.75) }`.
- **Q3 → (a)+:** non-taxable sells immediately; taxable waits for codes (engine refusal as today) **+ notify the admin
  that someone is waiting** (new notification type; tripwire count moves) **+ advise the seller at the moment they
  attach a taxable listing to a private pickup location** that there may be a delay (copy on the listing↔market
  attach surface — `listings/[listingId]/markets` route + its form; read at build). Design goes in B4.3.
- **Q4 → (a)+:** carry forward at the boundary, stamp current, re-check daily, apply changes forward, list in-between
  orders **+ a DAILY admin reminder while the new file is missing** (same notification channel; one per day per
  environment, not per market). Design goes in B4.2.
- **Q2 → (a):** partial dashboard refund on a taxed order → the `charge.refunded` handler writes a "reversal OWED" marker (order-level, amount known, items unknown) + the order appears on an admin list where the admin picks the items; the ledger rows are written from that pick. Full dashboard refunds reverse every item automatically. Design goes in B3 (webhooks block, protected) + B4 (admin list).
- **Q5 → leave the FT signup notice until tax goes live** (tester knows). Step 3 shrinks to Q6 only.
- **Q6 → NO deletion** (keep as fallback options). **Q8 → done:** vault = `d704d3bb`, old vault kept under `vault/pre-session-59`, manifest updated. **Q7 → 259 is the tax CHECK migration** (numbers follow build order; host-paid takes the next free number at creation).

### Q6 review — what the dead TaxCloud files contain (full reads 2026-09-24)
Both are OUR code from the Session 72 TaxCloud plan (2026-04), written against TaxCloud's public API docs — not
outside material. Un-tracked 2026-05 ("WIP, not ready to ship"), re-added by `11e7387f` (agreements) by accident.
Zero importers; `TAXCLOUD_API_LOGIN_ID/KEY` never provisioned.
- `taxcloud.ts` (246 lines): Lookup / AuthorizedWithCapture / Returned HTTP client, credentials in the request
  body, dollars↔cents helpers. Worth keeping as an IDEA only: capture failure deliberately does not throw so
  reporting can never block an order (`:167-170`) → apply to the Batch 3 ledger write (log loudly, never fail the
  refund after Stripe succeeded). Everything else superseded by the seam.
- `tic-codes.ts` (130 lines): TIC numbers UNVERIFIED (`:21-24` TODO) → worthless. **The category → taxability
  table IS reusable knowledge** (encodes the 2026-03-24 ruling) → the Batch 4.5 anomaly report's expected-taxability
  rule. Copied here so deletion loses nothing (⚠ verify category NAMES against the live category list at build):
  - always EXEMPT (expect is_taxable=false): `Produce`, `Dairy & Eggs`, `Pantry Staples`
  - always TAXABLE (expect true): `Prepared Foods`, `Plants & Flowers`, `Wellness & Personal Care`,
    `Art & Handmade`, `Home & Living`
  - CONDITIONAL (either; the flag decides — no anomaly): `Meat & Seafood`, `Baked Goods`
  - food_trucks vertical: everything taxable (expect true; the listing form already forces it — decision 2026-03-24)
  - no/unknown category: the flag stands, no anomaly

### Round 2 (after the push `55950dc8`) — progress
- ✅ **"Minus reversals" wired into the List Supplement report** (`reports/route.ts` `generateTaxListSupplement`): sales =
  every taxed item on a non-pending order (cancelled/refunded items INCLUDED — their tax returns via the ledger, never by
  dropping the sale); reversals = `order_item_tax_reversals` rows created in the period, vertical-scoped through
  `orders`; `buildNetListSupplement`; 13 CSV columns (gross both sides + net + counts + versions); TOTAL row net.
  Catalogue description updated; registry TR-113 + printable W11.5 header updated; map 19 updated. Gates: tsc 0 ·
  eslint 0 err · 364/364. Report URL corrected everywhere to `/admin/reports` (platform page; the vertical page hides
  the Accounting group by design, `ReportsAdminPage.tsx:156-157`).
- NEXT (certainty order): Q3 non-money pieces (seller advisory on taxable listing ↔ private pickup; admin "someone is
  waiting" notification) → step 12 rate-refresh cron (carry-forward + daily reminder) → steps 8–11 call sites.
- ✅ **Q3 seller advisory built** (uncommitted): `lib/tax/readiness.ts` (shared `marketTaxReadiness`; MarketsAdminPage now
  imports it instead of its inline copy) · `api/vendor/market-stats` selects the three tax columns + returns
  `taxReadiness` per market · `MarketSelector` type carries it · `ListingForm` renders an amber "Heads up — sales tax
  setup is pending…" note under "Available at" when the item is taxable AND a selected market is not ready (names the
  markets; exempt items never see it). Registry TR-114, printable W11.6. Gates: tsc 0 · eslint 0 err · 364/364.
- ✅ **Q3 admin notification BUILT (owner "yes, bump the tripwire" 2026-09-24; tripwire 135→136 with dated reason):** new type
  `tax_codes_needed_admin` (audience admin · standard · warning; action → `/{vertical}/admin/markets?edit=<marketId>`),
  sent from `api/vendor/listings/[listingId]/markets` after a successful attach when `listing.is_taxable` and a chosen
  market is not ready; recipients = `adminRecipientsForVertical(serviceClient, listing.vertical_id)`; once per market per
  24 h (notifications `data.dedupRef = marketId`, the H-6 pattern); route gains a service client for the fan-out only.
  Also: MESSAGE_TEMPLATES entry, map 18 note, tripwire comment line with the dated reason.

---

## 🏁 2026-09-24 SESSION CLOSE — progress + what doing the certain items first taught us

### Done today (all on staging after the push that follows this note; Prod untouched at `d704d3bb`)
| Step | What shipped | Learned |
|---|---|---|
| Decision log | TaxCloud struck + 2026-09-24 provider row; 8 owner rulings Q1–Q8 in one row | The additive-only hook is right: strike, never delete. |
| Review | `tax_build_review_research.md` A–N: every refund path, the seam, schema, display, event route, admin intake read with citations | The latent `tax_source` CHECK bug (mig 214 vs checkout) was findable ONLY by reading both sides; a flag flip would have 23514'd every taxable checkout. Reading before building paid for the whole day. |
| 1 · mig 259 | CHECK extended; live trailing SELECT as post-check | **Paste-whole files with a LIVE post-check** give the owner one action and give us MEASURED text for the snapshot. Pre-check is optional for idempotent DDL — say so in the header. Numbers follow build order (259 tax, host-paid takes the next free). |
| 2 · rate version | Admin PUT enforces `YYYY-Qn`, blank → current quarter, off-quarter warning; card + engine share one UTC quarter label | Two quarter helpers (local vs UTC) already existed — a drift nobody would have noticed until a boundary. Shared helper closed it. |
| 4 · needs-codes queue | "Tax codes" filter + chip on the EXISTING markets admin list | No new page needed; the same three engine guardrails, surfaced. Extracted to `lib/tax/readiness.ts` once a third consumer appeared (vendor picker). |
| 5 · refund math | `refund-tax.ts` pure, policy-neutral, 11 specs | Making the refunded FRACTION a caller input let Q1 be answered later without touching the math. Cap-by-already-reversed fell out of the spec. |
| 6 · report v1 → net | Form 01-116 CSV: snapshots only, then NET of the ledger (13 columns) | Writing the READ side before the ledger existed told us the ledger's exact columns and that period placement = reversal `created_at`. The sale side must KEEP cancelled/refunded items or reversals double-remove. |
| item 1 · net math | `buildNetListSupplement`, 8 specs | Negatives must be preserved (later-month refunds) — CPA Q13 on how Texas wants a credit line. |
| 7 · mig 260 | Ledger + dashboard-refund queue, service-only; Rule L red-by-design → rebuilt from the owner's export → stamp 260; Dev = Staging (41 rows) | The trailing-SELECT export made the Rule L rebuild a 10-minute mechanical job instead of a refresh session. Rebuild sections bottom-up by line number in one script. |
| Q3 · seller advisory | market-stats `taxReadiness` → ListingForm amber note when a TAXABLE item is attached to a not-ready location | The picker didn't know taxability, the form did — put the advisory where both facts meet, not in the picker. |
| Q3 · admin alert | `tax_codes_needed_admin` (tripwire 135→136, owner yes); attach route fan-out, once per market per 24 h, non-throwing | Tripwire bumps are a test change → the owner's word, every time. Codes aren't catalog-validated; routes use their own. |
| spike · rate file | `comptroller.texas.gov/data/edi/sales-tax/taxrates.txt` parsed: header names the quarter; 1,937 codes, one rate each; col 2 not always a city | **Q4 file was NOT published 6 days before Q4; Q3's landed 22 days late.** No advance machine-readable source → carry-forward (owner Q4) is the only workable design. |

### Process lessons (already saved as memories)
- Owner questions must be written as real questions (context → "?" → options). `feedback_questions_must_be_real_questions`.
- Migration files are pasted whole; pre-check optional when idempotent; live post-check last. `feedback_migration_files_paste_whole`, `feedback_precheck_sized_to_migration_risk`.
- Accounting reports live on `/admin/reports` (platform) — the vertical page hides that group; the test docs pointed at the wrong URL once.
- Certainty-first ordering: each low-risk step produced a fact the next step needed. Keep doing it.

### Where the next session starts (build order v2, remaining)
1. **Step 12 rate-refresh cron** — daily; fetch `taxrates.txt` (ETag/Last-Modified); parse header quarter + code→rate map from all four (code, rate) triples; for each verified market: rates match → stamp current quarter; changed → update `rate_pct`/`tax_rate_total_pct` + stamp + admin notice; code missing → clear `verified_at` + admin queue; file quarter behind the calendar → **carry forward** (owner Q4: stamp current, re-check daily, apply forward, list in-between orders, DAILY admin reminder while the file is missing). New cron = `vercel.json` + map 17 + a notification type (tripwire, owner yes) for the reminder/notice. ⚠ Staging previews never run Vercel crons — curl it.
2. **Steps 8–11 refund call sites** (Q1 pro-rata; Q2 queue for dashboard partials): unprotected 7 first (simplest full-refund path first), whole-order paths (ledger rows only), then the 3 protected files last with per-file approval. Pattern: `amount = buyerPaidForItem + taxReversalForItem(...).taxCents`, ledger row AFTER Stripe succeeds, never fail the refund on a ledger error.
3. Admin list for the dashboard-refund queue (Q2) + approval gate (13) + event route inside host-paid (14) + simulated month (15) + flag flip (its own approved change; pin `flow-integrity:3309`).
4. Owner side: real codes on Staging test markets (step 0); W11 steps 1–7 retest; Prod when the owner says (wipe first; migs 252→260 in order).
