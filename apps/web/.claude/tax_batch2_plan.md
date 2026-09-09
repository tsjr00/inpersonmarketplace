# Tax Batch 2 Plan — wire the seam (checkout → capture → display), dark flag
Started 2026-09-08. Status: ✅ BUILT 2026-09-08 (owner go + both protected files approved
by name). UNCOMMITTED. Gates: tsc ✓ · 2207/2207 ✓ (+10 engine spec, +4 pins) · lint 0 err.

## ⚙ BUILD LOG 2026-09-08
- Owner approved interim policies: Q11 base = net + embedded buyer % fee share (flat/
  small-order/tip/chipin excluded) · Q8 margin pro-rata into taxable components ·
  Q10 market boxes EXCLUDED (+ backlog item: MB is_taxable flag + vendor guidance).
- NEW: lib/tax/flags.ts (TAX_STREAM1_ENABLED=false, flip prereqs in header) ·
  lib/tax/checkout-tax.ts (the ONE engine: loads is_taxable + market tax cols, base
  policy, margin allocation folded INTO taxable component bases — self-storing for
  List Supplement + refunds) · __tests__/checkout-tax.test.ts (10 specs, vi.mock flag).
- checkout/session (protected, approved, 5 hunks): engine call after chipin validation;
  ERR_CHECKOUT_TAX all-or-nothing refusal; totalCents += tax; "Sales tax" Stripe line;
  orders.tax_total_cents (real 0 vs NULL distinct); order_items tax_* snapshot
  (tax_source='self_computed_v1', idx-aligned refs).
- checkout/success (protected, approved, hook deny-once→verified→retried): +tax_total_cents
  in fullOrder select.
- Mirrors: discount-preview +tax_total_cents (null=unpreviewable, degrade-only) ·
  bundles/[bundleId] +taxTotalCents · checkout page tax line (inside preChipinTotal so
  round-up stays whole-dollar; tip base unchanged) · BundleCheckout line+total · buyer
  order API/page line · success page "Includes $X sales tax" note · en+es keys
  (checkout/bundle/order.sales_tax, success.tax_info).
- Flow-integrity: 4 pins (dark-ship flag=false; one-engine across the 3 routes;
  all-or-nothing + snapshot in session; engine owns flag+base policy).
- Maps: 21_Lib_Reference lib/tax section rewritten · 10_Checkout_Payments item 7a ·
  stamps → 2026-09-08/d34eae7f (also fixed 21's stamp↔INDEX drift).
- NOT in Batch 2 (recorded): event-order route (required pre-flip, see flags.ts) ·
  refund reversals (Batch 3) · rate refresh + intake (Batch 4) · TaxCloud file
  retirement (needs owner deletion approval).

Spec anchors: sales_tax_readiness.md III.6 (A′ ratified) · tax_phase1_design.md (A′ + seam
contract) · lib/tax/compute-cart-tax.ts (Batch 1, inert).

Batch 2 scope (from the ratified sequence): checkout session tax line + capture snapshot +
buyer display, ALL behind dark TAX_STREAM1_ENABLED. Refund reversals = Batch 3. Ops = Batch 4.

## Storage (verified SCHEMA_SNAPSHOT.md 2026-09-08)
- markets: tax_jurisdictions jsonb '[]', tax_rate_total_pct, tax_rate_version,
  tax_jurisdiction_verified_at, tax_jurisdiction_note (snapshot :1377-1381)
- order_items: tax_amount_cents, taxable_amount_cents, tax_jurisdictions, tax_rate_version,
  tax_source (:1439-1443)
- orders: tax_total_cents (:1487)

## Research checklist
- [ ] checkout/session route: item+market load points, Stripe line construction, totals,
      metadata, where a tax line would attach
- [ ] checkout/success route: order + order_items insert → snapshot write point
- [ ] webhooks.ts: does checkout.session.completed also create orders (dual path)?
- [ ] display surfaces: checkout page totals, success page, buyer order page
- [ ] flag home: how TRIAL_SYSTEM_ENABLED-style constants are done
- [ ] bundle expanded components at checkout (per-component is_taxable available?)
- [ ] Q11 interim base policy (fee-in-base) — call-site decision, flag for owner

## Findings (verified 2026-09-08)

1. **Orders + order_items are created AT SESSION TIME** in checkout/session/route.ts
   (orders insert :1077-1098, order_items insert :1104-1113, status pending). Success
   route only flips status/payments/notifications (success/route.ts:80-104,136-164) and
   returns display data (:589-618). Webhook = backstop finalizer. ⇒ **The per-item tax
   snapshot writes belong in the SESSION route**; success/webhook need NO tax logic,
   only display fields added to selects. Blast radius shrinks to ONE protected money file.
2. **Money math shape** (session route): per-item net subtotal (post-discount, :694-695),
   buyer % fee embedded per line (:701, :956, :961), flat Service Fee line (:994), small-order
   fee line (:1002), tip (:1012), chip-in (:1023), bundle = ONE display line
   bundleDisplayPriceCents (:935-940) while order_items carry expanded components (:340-343).
   totalCents (:786) must equal Stripe sum — a tax line adds symmetrically to both.
3. **`listings.is_taxable`** bool NOT NULL DEFAULT false (mig 081; snapshot :971). NOT in
   the session route's listings select (:354-365) — add the column there. ⚠ default false
   = exempt; guardrail ④ anomaly report stays Batch 4.
4. **Flag pattern**: exported const like TRIAL_SYSTEM_ENABLED (vendor-limits.ts:24). →
   new `lib/tax/flags.ts` with `TAX_STREAM1_ENABLED = false`.
5. **Display-parity pattern exists**: checkout page ↔ /api/checkout/discount-preview both
   call computeCartDiscounts (preview route:63; page effect page.tsx:88-113) — "same shared
   engine so totals can never disagree." Tax copies this exactly. Page checkoutItems carry
   market_id (page.tsx:119) so the preview payload can add it.
6. **Display surfaces**: [vertical]/checkout/page.tsx (client totals :652-665) ·
   checkout/success/page.tsx · buyer/orders/[id]/page.tsx + api/buyer/orders/[id]/route.ts.
7. **Other order creators**: /api/events/[token]/order (event wave path) creates orders
   OUTSIDE this route — NOT in Batch 2 scope; must be wired before flag flip (listed as
   follow-up seam consumer). External-payment checkout INACTIVE/historical — never touch.
8. **Dead code**: lib/tax/taxcloud.ts + tic-codes.ts still present (plan III.1 says retire
   when tax work resumes). Deletion needs owner approval — proposed as optional cleanup.

## The plan (presented to owner 2026-09-08 — awaiting go)
See chat presentation this date. Structure: flags.ts + checkout-tax.ts engine (new, unprotected)
→ session-route wiring (protected, per-file diff) → preview extension → success/order display
→ tests (engine spec + conservation-with-tax + flow-integrity pins). Interim policies flagged
for owner: Q11 base (net item + embedded buyer % fee share; flat/small-order/tip/chipin
excluded), Q8 margin pro-rata, market boxes EXCLUDED pending Q10, events route deferred-but-named.
