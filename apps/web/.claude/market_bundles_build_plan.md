# Market-Curated Bundles — Build / Implementation Plan (2026-09-05)

## ⚡ FRESH-SESSION STARTER (post-compaction operational context — read FIRST)
- **BUILD IS GO** (owner 2026-09-05: "build while I test"). Scope latitude granted (Q1) — recommended
  order: mig + config/constants + offers-style pure lib → checkout expansion → manager surfaces →
  admin approval → market-page card → B2 cause split → gates → commit.
- **Owner is TESTING ON STAGING concurrently. ⛔ DO NOT PUSH STAGING while their test pass runs**
  (a push redeploys staging under them). COMMIT LOCAL ONLY; push only when the owner says their
  pass is done or explicitly OKs a push.
- Migration number: **next is 244** (243 = vendor_offers, applied Dev+Staging). Mig 244 has
  CREATE TABLEs ⇒ **Rule L fires** (suite red until owner pastes Dev+Staging + runs scoped rebuild
  queries → rebuild structured tables + stamp). Same flow as migs 242/243. Owner is around (testing)
  — hand the paste early. Migration handoff LEADS with the apply class (paste-and-go, inert).
- Tripwire: NOTIFICATION_REGISTRY currently **124**; bump to **127 PRE-APPROVED** (bundle_sold,
  bundles_intro, bundle_ready — Q7). Note the pre-approval in the test edit comment.
- **checkout/session is a PROTECTED money file**: build approval ≠ file approval. Present the exact
  diff + risk sentence and get per-file approval BEFORE editing it (change-discipline Rule 3).
  Same for any other protected file that turns out to be touched.
- Code anchors (verified 2026-09-04/05): market-box second-item-type pattern =
  `checkout/page.tsx` ~:127-135 (client) + `checkout/session/route.ts` hasMarketBoxes blocks
  ~:586-600 and ~:880-899 (server) — bundles follow this as a third type. Margin addend rides
  beside tip/chipin in `totalCents` (session ~:704). Per-item order building ~:611-649.
  VIP discount engine (`lib/loyalty/offers-checkout.ts`) sees LISTING items only ⇒ bundles are
  auto-excluded from perks — state it as a rule + pin in flow-integrity.
- Margin rail: transfers to `markets.stripe_account_id` — VERIFY the existing transfer helper
  before composing (grep event fee-payment / booth-fee transfer code, e.g. fees/pay + park pay
  routes; event organizer money uses this account per decisions history). Deterministic
  idempotency key `bundle-margin:{order_id}`; NEVER Date.now().
- B2 cause split rides mig-213 rails: `cause_beneficiaries` + Connect onboarding (admin/cause
  console). Margin split: pct to beneficiary account, remainder to market. Both transfers only
  AFTER handed_off (the no-clawback invariant).
- Schema gate applies to every table the migration + queries touch (fresh SCHEMA_SNAPSHOT read or
  information_schema in-turn). Rule K: every .select() column must exist in snapshot ∪ migration DDL.
- Comms: SMS is OFF platform-wide — bundle notifications are in-app + email only (owner Q2 note).
  bundles_intro email is owner-approved spend.
- Conservation test is the SPEC ANCHOR: a bundle order's component vendor payouts must equal a
  plain order's, byte-for-byte. Write it first.
- House cadence: spec-first tests · one feature per push · trace end-to-end + write the trace ·
  update THIS FILE as the build log AS YOU WORK.

Design locked over 3 rounds (chat 2026-09-04/05; decisions + marketing slices in backlog.md).
THE SHAPE: one ordinary multi-vendor order + one margin payee. Vendors' machinery untouched.

## ⚙ BUILD LOG (update as you work)
- **2026-09-05 session start — pre-build verification PASSED**: (1) margin rail: booth/park money
  to markets.stripe_account_id is DESTINATION-CHARGE (payments.ts:339/:436/:536) — single-payee
  only, unusable for bundles; the rail is the SEPARATE-TRANSFER pattern (fulfill/route.ts:354-407:
  record-before-transfer → chargeId from payments table via getChargeIdFromPaymentIntent →
  transfer → record; failure=retryable). Margin transfer gets its own module (cause/remit.ts:85
  precedent) — payments.ts NOT touched. (2) checkout/session read END-TO-END (1,088 lines):
  expansion point = expand components into `items` shape BEFORE the pricing block (route :578
  pricingItems / :611 orderItems); margin addend at totalCents :704; Stripe lines :847-938;
  order insert :984; inventory decrement :1031. (3) Schema gate: markets/listings/
  vendor_profiles/orders/order_items + cause_beneficiaries snapshot sections read — no collisions.
- **MONEY CONTRACT PINNED** (pricing.ts read in full): Stripe bundle line = ONE round of
  (componentSum+margin)×1.065 (market-box line contract, session:888 precedent); orders.total_cents
  addend = round(margin×1.065); manager transfer = margin_cents exactly; B2 split = round(margin×
  pct/100) to cause, remainder to market (exact conservation). NOTE: Stripe-charge vs
  orders.total_cents cent drift is a PRE-EXISTING platform-wide class (per-line rounding vs
  pricing.ts sum-rounding, e.g. 2×99¢ cart: Stripe 225 vs DB 226) — bundles add no new class;
  the page==Stripe invariant (A5) is what's guarded, via the shared display function.
- **DONE**: mig `20260905_244_market_bundles.sql` (B2 cause cols INCLUDED — cause_beneficiary_id
  + cause_pct — so no second migration; 2 RPCs atomic_increment_bundle_sold/atomic_release_
  bundle_sold, REVOKEd anon+authenticated) · `lib/bundles/core.ts` (BUNDLE_LIMITS 25/3/1,
  expandBundleComponents, bundleDisplayPriceCents, marginWithBuyerFeeCents, splitMargin,
  bundleOrderingOpen, bundleMarginIdempotencyKey) · conservation spec test FIRST
  `lib/bundles/__tests__/bundle-core.test.ts` 15/15 ✓ · map 21_Lib_Reference claim+section ·
  snapshot changelog row (Rule G ✓). Suite: 2178 green + Rule L red on 244 (owner-gated, expected).
- **⚠ FLAGGED interpretation (owner can veto)**: "1-day assembly buffer" implemented as ONE FULL
  day between order close and pickup ⇒ last orderable day = pickup−2 (e.g. Saturday pickup:
  order through Thursday, Friday = assembly day). If the owner intends "order through the day
  before", set assemblyBufferDays=0 semantics — one constant + one test row change.
- **2026-09-05 (cont.) — 244 APPLIED Dev+Staging (owner)**: bookkeeping done — changelog row
  flipped, structured tables rebuilt DDL-derived (243 precedent, labeled), stamp → 244,
  guardrails 20/20 ✓.
- **DONE (phase 2)**: `lib/bundles/margin-payout.ts` payBundleMargin — atomic NULL→'pending'
  claim on bundle_margin_transfer_id · VOR-1 payment-proof mirror · B2 cause share = mig-213
  cause_ledger 'collected' row with order_id NULL (uq_cause_ledger_collected_order belongs to
  chip-ins; note carries order number) so check-method orgs work via the remit sweep · market
  remainder = separate Stripe transfer keyed bundle-margin:{order_id} with source_transaction ·
  failed transfer stays 'pending' for reconciliation, NO auto-retry (= no double-pay; remit.ts
  trade-off precedent) · ERR_BUNDLE_001/002/003 cataloged (money-structure Rule E).
  `api/market-manager/[marketId]/bundles/orders/[orderId]/handoff` POST — isMarketManager +
  this-market ownership + order paid + ALL non-cancelled items fulfilled (vendors' own handoffs
  recorded first; margin moves LAST) → stamp bundle_handed_off_at → payBundleMargin.
  `lib/inventory.ts` cancelOrderItemsAndRestoreGuarded releases the bundle slot (qty 1) inside
  the guarded claim — covers checkout cleanup + expire cron. Flow-integrity bundles guard added.
  Maps 12 (money block) + 21. Gates: tsc ✓ · **2166/2166** ✓.
- **CONTRACT REFINED pre-consumer**: bundleDisplayPriceCents = round(C×1.065) + round(M×1.065)
  (split rounding) — for integer C, round(1.065C) ≡ C + round(0.065C) = pricing.ts's fee term,
  so Stripe charge == checkout page == market card == orders.total_cents TO THE CENT on
  bundle-only orders. Spec test updated with reasoning (refinement of my own hours-old spec
  before any consumer existed, documented in the test comment).
- **⚠ V1 SCOPE CHOICES (flagged to owner with the checkout diff)**: (a) ONE bundle per order,
  quantity 1 (buy two = two checkouts) — orders has no bundle_quantity column; margin/release/
  run-sheet/handoff are all per-order clean. (b) Bundle orders are bundle-ONLY (no mixed carts) —
  bundle_handed_off_at is an ORDER-level stamp; mixing buyer-picked-up items with
  manager-handed-off items on one order would conflate the handoff semantics. (c) VIP perks
  skipped on bundle orders (expansion feeds `items`, so the "engine only sees listing items"
  auto-exclusion does NOT hold — an explicit gate + pin is required, included in the diff).
- **2026-09-05 (cont.) — CHECKOUT DIFF APPROVED ("proceed") + APPLIED**: 9 hunks, verified vs git
  141+/5− — the 5 removed lines are exactly the 5 presented before/after pairs. Full route trace
  intact. V1 scope choices live in the code: one-bundle-per-order qty 1 · bundle-only orders ·
  VIP perks gated OFF (explicit `const cartDiscounts = bundleContext ? empty : …`).
- **DONE (phase 3 — ALL B1+B2 SURFACES)**:
  · Notifications: 3 types registered (bundle_sold manager standard=email+in_app · bundles_intro
    one-time vendor launch send · bundle_ready buyer immediate) — tripwire **124→127** (pre-
    approved note in the test comment) + MESSAGE_TEMPLATES entries. bundle_sold rides the HOURLY
    surveys cron via `lib/bundles/sold-sweep.ts` (per-order notifications-table dedup; hourly is
    fine — ordering closes ≥2 days before pickup; NO protected webhook touch needed).
  · Manager: `api/market-manager/[marketId]/bundles` GET (bundles + run-sheet orders + picker
    availableListings + beneficiaries) / POST (create → pending_approval; Q4 rail check) ·
    `[bundleId]` PATCH (edit; margin-INCREASE on active → re-approval, locked decision; archive)
    · `orders/[orderId]/notify-ready` POST (bundle_ready, per-order dedup) ·
    `components/market-manager/CuratedBundlesCard.tsx` mounted in FmDashboardBody ⑤ Money
    (FM-first per Q1; FT waits for B3): list + status chips, create/edit form w/ component picker
    + live price preview (shared bundleDisplayPriceCents), run sheet w/ per-item collect status,
    Ready-notify + Mark-handed-off buttons (handoff disabled until all items fulfilled).
  · Admin: `/[vertical]/admin/bundles` → `components/admin/BundlesAdminPage.tsx` (status tabs;
    review card = market + components at live prices w/ vendor names + OPTED-OUT/NOT-PUBLISHED
    flags + margin abs/% + derived price + cause + justification; approve blocked client-side on
    opted-out vendors AND re-checked server-side). Nav Money group + pendingBundles queue badge
    (market_bundles⋈markets vertical scope). `send-intro` POST (vertical admin scoped; platform
    admin for all-verticals; idempotent per user).
  · Vendor: `api/vendor/bundle-consent` GET/PUT + `BundleConsentToggle` on /vendor/edit.
  · Buyer: `lib/bundles/public.ts` (getMarketBundleCards + componentIsLive — ONE display-side
    availability mirror) · `components/markets/MarketBundlesSection` on the public market page
    (5-pillar copy; service client — RLS is service-only) · `api/bundles/[bundleId]` public
    detail · `checkout/BundleCheckout.tsx` + 3-line vaulted-page hook (`?bundle=` param read
    post-mount, early return before cart flow; vault diff run first). Client money mirror:
    total = displayPrice + 15¢ + smallOrderFee(componentSum only, matching the server) —
    equals Stripe to the cent by the split-rounding identity.
  · Security checklist self-audit done → fixed: admin bundles GET + send-intro now
    verifyAdminScope'd (vertical admins can't see/act cross-vertical).
  · Docs: maps 10 (bundles money block) / 12 / 19 / 20 / 21 + stamps + 00_INDEX;
    ERR_BUNDLE_001-003 cataloged; snapshot bookkeeping done (244 ✅ Dev+Staging, stamp → 244).
- **GATES at phase-3 wrap**: tsc ✓ · vitest **2166/2166** ✓ · lint 0 errors · `npm run build`
  ✓ (172/172 pages). NOT committed yet — commit ask pending owner.
- **REMAINING (B1+B2 polish, next session ok)**: end-to-end trace write-up per house cadence ·
  owner walkthrough/test protocol for bundles · FT body mount (B3) · localization pass (new
  strings are EN-only v1 — flag to owner) · decisions.md entry · CLAUDE_CONTEXT session row.

## Locked decisions (do not re-litigate)
- Single-order design: bundle checkout expands to component order_items at LIVE vendor prices.
- Margin FIXED, bundle price DERIVED (live component sum + margin). Live-price cart validation applies.
- Vendor consent: DEFAULT-IN, GLOBAL per-vendor opt-out (not per item), intro notification + email.
- Margin is seller-fee-FREE; buyer fee applies to the FULL bundle price incl. margin.
- Per-bundle ADMIN APPROVAL w/ value-add justification; re-approval on margin increase only;
  approval verifies component vendors not opted out.
- FT rule: every aggregation-eligible item must be in a SELF-CONTAINED COVERED container
  (delivery-driver packaging standard).
- Attorney items queued: manager-handling disclaimer + commercial co-venturer rules (cause slices).
- Tax: chunk-D input — assembled bundle may be a different taxable object than components.

## Phasing
- **B1 (this plan's scope): FM core loop** — create → approve → sell → assemble → hand off → margin paid.
- **B2: cause attachment** — % of margin to a beneficiary via the EXISTING mig-213 cause rails
  (recommended same release or immediately after — it's the growth story; owner call, Q8).
- **B3: FT date-night** — timing choreography, staging slot, container-rule enforcement live.
- **B4: delivery** — manager as consolidation point. Not designed here.

## B1 build items

### 1. Migration (1 file; CREATE TABLE ⇒ Rule L rebuild; schema gate at composition)
- `market_bundles`: id · market_id FK→markets CASCADE · name · description · margin_cents INT NOT NULL
  · quantity_limit INT NOT NULL · quantity_sold INT NOT NULL DEFAULT 0 · status TEXT CHECK
  (draft|pending_approval|active|archived|rejected) · justification TEXT (the value-add explanation)
  · pickup_market_date DATE (B1: bundle is tied to ONE market day; cutoff derived, see #4)
  · pickup_notes TEXT (where at the market to collect) · approved_by/approved_at · created_by ·
  timestamps. RLS enabled, no policies (service-only, house pattern).
- `market_bundle_components`: bundle_id FK CASCADE · listing_id FK · quantity INT · UNIQUE(bundle_id, listing_id).
- `vendor_profiles.bundles_opt_out BOOLEAN NOT NULL DEFAULT false` (the global consent setting).
- `orders.bundle_id UUID NULL FK→market_bundles` + `orders.bundle_margin_cents INT NOT NULL DEFAULT 0`
  + `orders.bundle_handed_off_at TIMESTAMPTZ NULL` + `orders.bundle_margin_transfer_id TEXT NULL`
  (the margin-payout record — transfer id doubles as the done-flag).
- FT container flag: per Q3 decision (listing-level boolean proposed: `listings.covered_container`).
All additive; inert until UI exists.

### 2. Checkout expansion — ⚠ `checkout/session` (protected; exact diff presented at build)
- New cart item type `bundle` (FOLLOW THE MARKET-BOX PATTERN — checkout already handles a second
  item type end-to-end; bundles are a third).
- Server-side expansion: load bundle (status active, quantity_sold < limit, pickup date valid) →
  verify every component listing published + in stock + vendor NOT opted out → create component
  order_items at live prices (existing pricing/inventory/payout math BYTE-UNTOUCHED for vendors)
  → order carries bundle_id + margin.
- Money: `totalCents += Math.round(margin × (1 + buyerFeePercent/100))` — buyer % on margin, NO
  vendor-side fee on margin (rides beside tip/chipin in the total, its own addend, never enters
  orderPricing's vendor math). Stripe line: ONE line "«Bundle name» — curated by «market»" at the
  full display price (order_items carry the per-vendor truth; Stripe lines are display only).
- quantity_sold increment rides the existing atomic patterns (guard against oversell: increment
  WHERE quantity_sold < limit, reject on 0 rows — same race posture as inventory).
- VIP discounts: bundles EXCLUDED from perk computation v1 (like market boxes — engine only sees
  listing items; confirm as a stated rule, it already falls out of the code shape).

### 3. Fulfillment + margin payout
- Component order_items: EXISTING per-vendor lifecycle verbatim. Vendor order card gains a
  "🧺 Bundle — picked up by your market manager" flag (customer name = manager context).
- Bundle lifecycle on the order: components fulfilled → manager assembles → manager marks
  HANDED OFF (buyer collected) → margin transfer fires.
- Margin transfer: to `markets.stripe_account_id` (the existing booth-fee/organizer Connect rail —
  VERIFY the exact transfer helper at build), deterministic idempotency key
  `bundle-margin:{order_id}`, recorded in bundle_margin_transfer_id.
- **INVARIANT: margin transfers ONLY after handoff** ⇒ any pre-handoff cancellation never needs a
  margin clawback. Refunds before handoff = existing per-item refund paths + margin simply never
  transfers (refund buyer the margin portion via the standard refund math on the order total).
- Component vendor rejects post-sale: manager chooses substitute (edit within approval rules) or
  cancel bundle (existing cancellation cascade + full refund). Manual v1.
- Manager no-show at vendor windows = existing buyer-no-show handling per vendor.

### 4. Availability + timing (B1, FM)
- Bundle purchasable while: status active · quantity remains · every component in stock ·
  order cutoff not passed. Cutoff = MIN(component listings' own cutoffs for the pickup date)
  minus an assembly buffer (config constant, e.g. 1 day — Q5).
- Bundle goes auto-unavailable the moment any component lacks stock or its vendor opts out.

### 5. Surfaces
- **Manager dashboard**: "Curated Bundles" card — create/edit (components picker from the market's
  vendors' published listings, FT filtered by container flag), margin input, qty limit, pickup date,
  justification; submit → pending_approval. Run-sheet view per sold bundle: component pickup list
  w/ per-item status, "Mark handed off" button.
- **Admin**: approval queue (pending bundles w/ justification + component/vendor list + margin);
  approve/reject. Fits AdminShell; nav entry + queue badge.
- **Market page (buyer)**: bundle card per the 5-pillar copy template (backlog marketing entry):
  curator line · NAMED makers w/ vendor profile links · quality/scarcity ("only N left") ·
  pickup line. (Cause line arrives with B2.)
- **Vendor settings**: "Allow the market manager to include my items in curated bundles" toggle
  (default on) + one-time intro notification + email at feature launch.

### 6. Notifications (tripwire bumps need owner OK at build — Q7)
Proposed: `bundle_sold` → manager (immediate; their run-sheet call-to-action) ·
`bundle_ready` → buyer (optional; or ride existing order notifications) ·
one-time `bundles_intro` → vendors (the opt-out announcement; email per owner decision).
Vendors' component sales ride the EXISTING new_paid_order flow (flagged as bundle).

### 7. Tests (spec-first per house rules)
- Conservation: component vendor payouts on a bundle order == identical plain order (byte equality).
- Margin never enters vendor-fee math; buyer fee applies to margin; totals reconcile.
- Margin transfer only after handed_off; idempotent; refund-before-handoff leaves no transfer.
- Opt-out vendor's listings excluded at composition AND at approval AND at checkout.
- Oversell guard on quantity_sold; component stockout → unavailable.
- FT container flag gates composition (when B3 lands; the flag+check can ship dormant in B1).
- Flow-integrity: bundle checkout uses live listing prices (no snapshot prices); approval gate
  pinned; margin payee = markets.stripe_account_id only.

### 8. Docs riding the build
Codebase map (10 ⚠ item for the checkout touch, new manager/admin surfaces), SCHEMA_SNAPSHOT
changelog + Rule L rebuild, MESSAGE_TEMPLATES, decisions.md, this plan updated as build log.

## Size estimate
B1: 3–5 sessions · 1 migration paste · protected-file touches: checkout/session (one presented
diff) — success/webhooks NOT touched (margin fires at handoff, not payment). B2 cause: +1 session
(existing rails). B3 FT: +1–2 sessions.

## Open questions — ALL ANSWERED (owner 2026-09-05). Build-ready.
Q1 scope: **Claude scopes per session for efficiency/stability/security** (FM-first recommendation
   stands as the default ordering; latitude granted).
Q2 pickup: **YES** — one market date per bundle. NEW DETAIL: a manager whose market runs multiple
   days may run MULTIPLE bundles per week on different dates (each bundle has its own
   pickup_market_date — already supported by the schema; watch the 3-active cap interplay for
   multi-day markets). COMMS NOTE: SMS is not enabled platform-wide — all bundle comms are
   in-app + email for now.
Q3 container flag: **YES** — listing-level `covered_container` checkbox, dormant in B1.
Q4 eligibility: **REFINED** — only managers of markets that manage their bookings/sales ON THE
   APP (build check: market has manager_user_id + markets.stripe_account_id + active platform
   activity — the margin rail requires the Connect account anyway, so this is nearly free).
Q5 limits: **APPROVED as proposed** — max 25 qty/bundle · max 3 ACTIVE bundles per market ·
   1-day assembly buffer. Config constants, not hardcoded inline.
Q6 margin bounds: **YES** — no code enforcement; admin approval is the judgment.
Q7 notifications: **TRIPWIRE BUMP PRE-APPROVED** — bundle_sold (manager) + bundles_intro
   (vendors, one-time, email) + bundle_ready (buyer) as proposed.
Q8 cause attachment: **SAME RELEASE** — B1+B2 ship together; the fundraiser/beneficiary % is in
   scope for the first release (rides mig-213 rails).
