# Research: bundles from PRIVATE-PICKUP vendors (partner question, 2026-09-21)

Question: could a market manager assemble a bundle from private-pickup-location vendors (not on a
traditional market), meet them at a shared address (church/school lot), and hand off to buyers?
Report only — no code changes. Findings written as read.

## Checklist
- [x] Schema: market_bundles / components / orders columns (mig 244)
- [x] Composition gates (lib/bundles/validate.ts)
- [x] Core math + ordering window (lib/bundles/core.ts) · public card (public.ts)
- [x] What a private pickup location IS (markets.market_type='private_pickup')
- [ ] Manager create route: which listings offered, auth
- [ ] Checkout expansion: market/date on component order_items; availability re-check
- [ ] Run sheet: Receiving now / Fulfill / Ready / handed off; margin transfer target
- [ ] Vendor side: notification + fulfil gate; where the vendor sees "bring it to X"
- [ ] Cancellation / sold-sweep
- [ ] Buyer discovery: where bundles are shown (market page only?)

## Findings so far
- `market_bundles.market_id NOT NULL → markets` (mig 244:43). Bundle = ONE market, ONE
  `pickup_market_date` (:58), `pickup_notes` = spot AT THAT MARKET (validate.ts:107-112 requires it).
- Every component listing must be published AND linked to THAT market via `listing_markets`
  (validate.ts:44-47 "Every bundle item must be sold at this market"). Vendor must not have opted out
  and must have a Stripe account (:55-60).
- Max 3 active bundles per market; max 25 copies; orders close pickup−2 (core.ts:21-33).
- Margin transfers to `markets.stripe_account_id` after handoff (core.ts header) — the MARKET needs
  Stripe Connect, i.e. a managed market with a manager.
- A private pickup location is a `markets` row with `market_type='private_pickup'`,
  `vendor_profile_id = the vendor`, auto-approved, its own `market_schedules` (vendor/markets/route.ts:669-714).
  ONE vendor per row. Several vendors at one address = several unrelated rows; nothing reconciles them.
- Public bundle cards: `getMarketBundleCards(marketId)` — shown on the MARKET page (public.ts:39-49).
- Manager create route: `isMarketManager` (bundles/route.ts:181) + market MUST have `stripe_account_id`
  (:187-197, 409 otherwise); picker offers only published listings linked to THIS market whose vendor
  is opted in (:79-97); pickup-day picker = the market's own schedule DOWs minus cancelled, 28 days,
  filtered by the assembly buffer (:99-128). Status → pending_approval, admin approves (:232).
- Checkout: bundle is its own order; components pushed as items with `marketId = bundle.market_id`,
  `pickupDate = bundle.pickup_market_date` (checkout/session:341-343). Per-component live check =
  published/not deleted/stock + vendor opt-out (:320-337). Cutoff check is PER LISTING, any market
  (`get_listings_accepting_status(p_listing_ids)` :558-559; 2-arg form per snapshot changelog mig 245)
  — NOT per the bundle's market, so a vendor need not have declared days at the bundle market.
- Vendor side: OrderCard shows an `is_bundle` badge "the market manager collects it from your stand —
  wait for their tap, then tap Fulfill within 30 seconds" (OrderCard.tsx:285-290). Fulfill route skips
  buyer notices for bundle orders (fulfill/route.ts:214-215, 253-257). Margin → `markets.stripe_account_id`
  after handoff (margin-payout.ts:97-104, :177).
- Run-sheet routes (collect-ack / handoff / notify-ready) all gate on isMarketManager.

## Owner's four follow-ups (2026-09-21, all read in code)
- Hide from buyers' list: automatic — public list needs a vendor with a published listing AND a declared day
  (`visible-markets.ts:6-14,32-60`); market page reachable by link, no gate (`markets/[id]/page.tsx:39-51`);
  bundle cards render ONLY there (`page.tsx:113,673`).
- Monthly cadence: none exists (weekly `market_schedules.day_of_week`; overrides = cancel + make-up). Bundles
  pin ONE picked date (`bundles/route.ts:99-128`) so weekly rows are just candidates. Cost: empty strip days.
- Drop-off vs pickup day: bundle has ONE date (buyer pickup). Collect-ack/Fulfill have no date gate
  (`collect-ack/route.ts:86-112`) → drop-off any day works; ordering open till pickup−2 (`core.ts:26-33`) →
  drop-off on pickup−1, or manager ARCHIVES the bundle early (`bundles/[bundleId]/route.ts:61`; orders stay
  on run sheet). A drop-off date column = small additive follow-up if wanted.
- Revenue/community: cause % of margin (B2, `core.ts:87-100`; admin-created beneficiaries) → host as
  beneficiary; checkout chip-in (`checkout/session:70`); 3 bundles × 25 = ladder/scarcity; broadcast +
  surveys; optional à-la-carte for vendors who tick the day (⚠ ONE such vendor makes the lot public).
- Constraint: joining consumes a traditional-market slot (free 3 / pro 5 / boss 8 — `vendor-limits.ts:60-91,183-197`).

## Conclusion (see chat reply 2026-09-21)
Bolt-on with ZERO bundle-code change: model the shared meetup address as a MANAGED TRADITIONAL market
with no priced booth tier, run by the partner (Stripe-connected). Vendors apply → approved → add the
market to their listings → eligible components. Rough edges: "your stand" copy; 3-active/25-copies caps
per market; vendors' traditional-market tier allowance consumed (constants.ts:162 — count rule UNVERIFIED);
market visibility requirements for a no-fee market UNVERIFIED. Real "bundle at an address" would touch
validate.ts + checkout stamping + run-sheet auth + margin rail = the money path — not now.
