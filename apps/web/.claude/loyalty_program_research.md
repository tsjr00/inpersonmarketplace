# Loyalty / Discount / Gamification — Research Working File
Started: 2026-08-25 (owner request: review foodtrucknai.com idea, read our code, research, suggest). REPORT MODE — no code changes.

## Owner's brief (verbatim gist)
Competitor foodtrucknai.com has a customer loyalty program idea. Goal: convert first-time users → repeat users. Ingredients: discounts, gamification, rewards/badges. Vendors likely willing to fund discounts to convert first-timers. Needs a vendor-discount model that changes final pricing WITHOUT changing the core pricing model — "maybe the way we added a small order fee after everything's calculated we can add a discount." Badge ideas: "5 trucks in 5 days = Around the World", "10 days in a row at one truck".

## Checklist
- [x] Competitor recon (foodtrucknai.com)
- [x] pricing.ts read
- [x] payments.ts read (separate-transfer model for orders; destination charges for booth/park/event fees)
- [ ] checkout/session route — how line items, small-order fee, tip/round-up, flat-fee proration are built
- [ ] checkout/success route — what order/order_item columns are written
- [ ] fulfill route — how vendor payout amount is derived
- [ ] schema: orders, order_items, payments, user_profiles, verticals.config, vendor_fee_balance/ledger
- [ ] existing credit precedents (vendor referral credits / fee ledger; booth credit appliedCreditCents)
- [ ] existing loyalty-adjacent features: favorites, insights customerLoyalty, order_ratings, buyer premium, flash_sales_vip_plan
- [ ] external research: Stripe discounts on Checkout w/ Connect; loyalty benchmarks
- [ ] Synthesis + recommendations

## Findings

### Competitor — foodtrucknai.com (recon 2026-08-25)
- React SPA on Supabase; meta description: "Get your food truck online in 5 minutes. Branded app, AI ordering assistant, live location sharing, digital menu, and QR code — starting at $29/month. No coding, no contracts." 7-day trial. FAQ: no customer app download (QR/link), AI answers menu/location/wait questions + upsells, multilingual.
- Sitemap: /, /pricing, /find-trucks, /blog (posts incl. "get-more-repeat-customers"), /terms, /privacy.
- NOT indexed by search engines yet (two searches, zero hits). Loyalty specifics: NOT visible in server HTML (SPA) — see JS-bundle grep below.
- Positioning: single-truck SaaS (per-truck branded app), NOT a marketplace. Different model from ours (multi-vendor, geolocated discovery, park/market operators).

### pricing.ts (src/lib/pricing.ts — CRITICAL PATH)
- FEES: buyer 6.5% + $0.15/order; vendor 6.5% + $0.15/order (:14-19). Platform = 13% + $0.30.
- `calculateOrderPricing(items)` (:130-160) — subtotal → buyer/vendor fees → payout. Pure.
- `calculateItemDisplayPrice` per item (:184-186); flat fee prorated per item via `proratedFlatFee` (:209-218).
- Small order fee: `calculateSmallOrderFee(subtotalCents, vertical)` (:82-86) — compares DISPLAYED subtotal to per-vertical threshold; config `SMALL_ORDER_FEE_DEFAULTS` mirrors `verticals.config` JSONB (:49-56). ← the "added after everything's calculated" precedent the owner means.
- Vendor fee discount system: `getEffectiveVendorFeePercent(override)` floor 3.6% (:269-277) — admin-set per-vendor override; buyer side never changes.
- Booth credits reduce BOTH charge and transfer equally (payments.ts:365-368, 441-446) — "platform fee invariant" precedent.

### payments.ts (src/lib/stripe/payments.ts)
- Product orders: `createCheckoutSession` (:22-77) = plain line items, NO transfer_data; vendor paid later via `transferToVendor` per order_item (:83-112) with `source_transaction`. No coupon/discount params anywhere.
- Booth/park/event fees: destination charges with `transfer_data.amount` (:365-397 etc.) — credits subtract from both sides.


### Competitor — what their app bundle actually contains (index-CMrtTOlJ.js, 458KB, fetched 2026-08-25)
- Plans (from their AI-chat system prompt): **Starter $29/mo (1 truck), Pro $49/mo (unlimited AI chat, voice ordering, analytics), Fleet $129/mo (5 trucks, custom domain, white-label)**; 7-day trial card-required; $79 one-time "Get My App Built". Terms §5: **6% platform fee on card orders "(after any applicable discounts)"**; cash orders no fee.
- Marketing: "Built-In Loyalty Rewards — Visit punch cards and spend tiers (Bronze, Silver, Gold) — fully customizable. Your regulars earn rewards automatically. You set what they get." / "Turn first-timers into regulars." / "Loyal customers spend 67% more and cost 5x less". Tier example: Bronze $25 spent → "Priority queue"; Silver $75 → "Free side every visit"; Gold $150 → "10% off everything".
- Mechanics (from code): `loyalty_settings.enabled` per truck; punch card = `punch_card_visits` target + `punch_card_reward` text; progress UI "N more visits to earn: X"; **redemption is OUT-OF-BAND: "🎉 You've earned: {reward}! Show this screen."** — no money moves in-system. Tiers = `{bronze,silver,gold}_reward` free text, `current_tier`. **Identity = customer PHONE NUMBER** (`record-loyalty-visit` edge fn: truck_id, customer_phone, customer_name, amount_spent, order_id) — customers look up progress by typing their phone. Promo codes: `validate_promo_code(p_truck_id, p_code, p_cart_total)` → amount/percent off cart total; fee computed on discounted total.
- Structural read: single-truck SaaS, loyalty siloed per truck, phone-keyed (no account), manual reward redemption, no cross-truck gamification. Our marketplace has buyer accounts + cross-vendor order history → cross-truck badges are something they structurally cannot do.

### Our checkout money path (src/app/api/checkout/session/route.ts — CRITICAL PATH, read-only)
- Per-item: `orderItems[]` rows get `subtotal_cents`, `platform_fee_cents` (buyer%+vendor%), `vendor_payout_cents = subtotal − vendor% − prorated flat` (:577-600). Stripe line item per listing = `price × 1.065` (:813-822).
- Order-level line items appended: "Service Fee" $0.15 (:854-859), "Small Order Fee" (:862-868), "Tip" (:871-877), "Community Chip In" (:881-887). `orders` row stores `small_order_fee_cents`, `chipin_*`, tip fields (:913-928). ← the small-order-fee pattern the owner referenced = an ORDER-LEVEL line item. **Stripe line items cannot be negative**, so a discount can't be a mirror-image line; it must reduce line-item `unit_amount` (or be a Stripe coupon).
- Fulfill: `actualPayoutCents = order_items.vendor_payout_cents − feeDeduction + tipShare` (fulfill/route.ts:337), transfer w/ source_transaction. ⇒ a vendor-funded discount only needs `vendor_payout_cents` stored NET at checkout; fulfill is untouched.
- Reject refund RECOMPUTES buyer-paid = `subtotal + 6.5% + prorated flat` (reject/route.ts:112-120) — would OVER-REFUND a discounted item unless it reads a stored discounted amount. Must change with any discount feature.
- Stripe minimum charge 50¢ (comment payments.ts:461-463) — a 100%-off "free item" order must still clear 50¢ or be a non-Stripe path.

### Stripe facts (docs fetched 2026-08-25)
- Checkout `discounts[0][coupon|promotion_code]` — **"Checkout Sessions currently support up to one coupon or promotion code."** Coupon `applies_to` needs Product IDs; our line items are ad-hoc `price_data.product_data` → can't target one vendor's items. Promotion codes support `restrictions.first_time_transaction` (Stripe-customer-scoped, not ours) + `minimum_amount`.
- Separate charges & transfers: **"Transfer and charge amounts don't have to match."** Transfer ≤ source charge amount. Refund of a charge does not touch transfers (platform reconciles). ⇒ platform-funded discount = charge less, transfer full; vendor-funded = charge less, transfer less. Both fit today's model.

### Existing building blocks (verified)
- `vendor_favorites` (mig 034), `market_favorites` (mig 156), follow route; `order_ratings` + RateOrderCard + `/api/buyer/orders/unrated`.
- Repeat-customer math already exists: vendor insights `customerLoyalty` new vs repeat per location (api/vendor/location-insights/route.ts:83-211).
- Completed-visit signal: `order_items.buyer_confirmed_at` + `pickup_confirmed_at` (both-sided confirmation) — badge/punch source of truth. `market_day_checkins` = vendor geofenced check-in (mig 2026-06).
- Buyer premium: FM only (`verticals.config.buyer_premium_enabled` false for FT, mig 026); benefits = early-access window + badge (en.ts:1338-1353).
- Notifications: 4-channel, `immediate`=push+in_app, `info`=in_app only (free) (notifications/types.ts:27-36); `push_subscriptions` table exists.
- Social proof feed: `public_activity_events` (purchase/new_vendor/sold_out/new_listing) — natural place for "X just earned a badge".
- Credit precedents: vendor referral credits (pending/earned/applied/expired/voided ledger, $10, annual cap); vendor_fee_ledger + atomic claim RPC (mig 197); booth credit reduces charge AND transfer equally (payments.ts:365-368).
- Unbuilt plan: `flash_sales_vip_plan.md` (2026-03-25) — VIP customers (Pro 10 / Boss 25 slots), flash sales; decision #10 there = "does discount come from vendor margin only or does platform reduce fee?" — same question resurfaces here.
- Guardrails: money-structure Rule A FLIP_TABLES (money-structure.test.ts:74) — any new money table joins with zero allowlist. `verticals.config` JSONB = per-vertical knobs precedent (small order fee, buyer premium).
- Buyer dashboard tiles today: Ready for Pickup, Browse, My Orders, My Favorites, Where Are Trucks Today, Upgrade promo (dashboard/page.tsx:388-611).

### External research (industry blogs — vendor-marketing numbers, not peer-reviewed)
- ~70% of first-time diners never return; loyalty members visit ~20% more often, spend ~18–30% more (restroworks, tillster). Stamps beat points at counters (Costa +16% transactions after points→stamps); 73% of small businesses have NO loyalty program because tools cost too much (Square Loyalty $45–49/mo) — loop.fans. Gamification: badges = measurable positive effect; streaks work via loss aversion; **"badges ≠ gamification unless mapped to a behavior you actually want repeated"** (RevenueCat). DoorDash separates merchant-funded vs platform-funded promos — **funder changes sales-tax treatment** (DoorDash US Promotion Tax) → relevant to chunk D. DoorDash first-order: 15% off ≥$15, max $10 (platform-funded acquisition).

## Synthesis — see chat message 2026-08-25 (three layers: badges → vendor-funded offers engine → punch card/tiers on top). Owner decisions pending: fee base pre/post discount; who funds first-order; tier gating; badge windows per vertical; priority vs chunk D.

## Owner decisions 2026-08-25 (chat)
- Fees on POST-discount price (same formulas, smaller base for discounted items). Min-order rule for free-item rewards agreed.
- Layer 1 badges: agreed. Explore weaving in VIP (flash_sales_vip_plan.md) — report.
- Layer 2 offers engine: keep SIMPLE — minimal changes to core/money path; fewer GREAT offers over many blah ones.
- Layer 3 loyalty: later (after taxes / chunk D); do basic contingency planning now.
- Owner will ask for a full plan re-review for "true value add we can market, not a gimmick" before anything is built.

## VIP recon (verified 2026-08-25)
- Deferred reason: backlog.md:1458 "VIP customer tagging (launch with flash sales, not before)" — VIP's only concrete perk in the plan was flash-sale early access.
- No buyer notification exists for favorited-VENDOR activity (notification type list has none; only `market_day_today` for market follows). `vendor_favorites` drives only the favorites page. `market-audience.ts:6` was built generic with "VIP-tagged" as a planned tier. FM marketing copy already promises "Build a loyal VIP customer base" (farmers-market.ts:117) — no feature behind it.
- Vendor OrderCard shows `customer_name` only (OrderCard.tsx:258) — no history/regular/VIP signal for the vendor at pickup.

## Owner decisions 2026-08-25 (round 2)
- Small order fee: NO change (fee on what the buyer actually pays; using a discount to buy one tiny thing is not the goal). Only deviate if something breaks.
- VIP stays vendor-driven; benchmark nudges to vendors ("X just became a Regular") = yes; auto-track & auto-deliver (buyer never shows a card/screen); notifications yes, staggering is FM-value not FT; flash sales later if at all.
- Offers: First Order (as proposed) + **Come Back** (return within vendor-chosen X days at vendor-chosen %). Get specific + reasoning.
- Layer 3 contingencies → into the plan when authorized. Customer-distribution report → backlogged 2026-08-25.

## Design note — store subtotal NET (min-change key)
Refund paths RECOMPUTE the small-order fee and buyer-paid from `subtotal_cents` (reject:112-120 + :242, resolve-issue:318, expire-orders:267, cancel-date-cascade:259) rather than reading stored `small_order_fee_cents`. If checkout charged a fee on the discounted subtotal but `subtotal_cents` stayed gross, every one of those would recompute a different fee → refund mismatch. **Fix by construction: store `order_items.subtotal_cents` and `orders.subtotal_cents` as the NET (post-discount) amount, keep `unit_price_cents` = list price, add `discount_cents` + `offer_id` (item) / `discount_cents` (order) as the record.** Then fees, payout, refunds, reports, small-order fee all read net automatically — "same math, smaller base" holds end-to-end and reject/resolve/expire/cascade need NO edits. Verify at build: any test/code asserting `subtotal_cents == unit_price_cents × quantity`. Paired surface: checkout page client calc (checkout/page.tsx:553-586) must mirror the discount (display only). External checkout route also computes the fee — external payments are historical/inactive, out of scope.
