# VIP Buildout Plan — vendor-value batch (owner directions 2026-09-04)

Decisions: `decisions.md` "VIP buildout unblocked + perk-menu model (2026-09-04)" + the 2026-08-25 loyalty decisions. Design ancestry: `loyalty_program_research.md` (Layer 1 shipped; store-subtotal-NET key at its end) + `flash_sales_vip_plan.md` (March VIP design — flash-sale parts stay parked).
**Status: PLAN. Phase A awaiting owner go; Phase B has open questions below.**

## What exists today (verified 2026-09-03/04)
- Layer 1 (prod since `e946c2c0`): `buyer_achievements`, `lib/loyalty/{config,segments,evaluate}.ts` classifier (new/one-timer/repeat/regular/loyal), OrderCard segment chip, `badge_earned` + `customer_milestone` notifications, My Badges on Favorites.
- NO VIP mechanism anywhere (no table, no tagging, no buyer notification for followed-vendor activity; `market-audience.ts:6` planned a "VIP-tagged" tier; FM copy promises "Build a loyal VIP customer base" — `farmers-market.ts:117` — with nothing behind it).
- Vendor insights: `api/vendor/location-insights` computes new-vs-repeat per location; page = `[vertical]/vendor/insights/page.tsx`.
- ⚠ `vendor-limits.ts` is a PROTECTED file — VIP slots extend `TierLimits` (:39) → per-file approval at build.

---

## PHASE A — no money moves (build first)

### A1. "Your Customers" report (owner: "plan on doing this")
Vendor Insights page gains a "Your Customers" section: distribution across one-timers / repeat / Regulars / Local Legends (+ favorites count), names visible (consistent with order cards; never email/phone), tier-gated like the rest of insights.
- ONE classifier: `lib/loyalty/segments.ts` — the same function that drives badges and the milestone nudge (2026-08-25 decision). Extend `location-insights` or a sibling endpoint; group distinct FULFILLED orders per (buyer, this vendor).
- Effort S/M. No migration.

### A2. VIP designation core
- **Mig (next number at build): `vendor_vip_customers`** — March shape trimmed: vendor_profile_id, buyer_user_id, added_at, notes, UNIQUE pair. (total_purchases/total_spent derivable from order_items — don't denormalize v1.)
- Vendor: "Add to VIP" from the Your Customers report rows + order history; VIP list with capacity meter; remove.
- Buyer: "You're now a VIP at {vendor}" notification (free channels); VIP badge on their Favorites page rows.
- Vendor-at-pickup: VIP star on OrderCard beside the segment chip.
- Nudge upgrade: `customer_milestone` ("just became a Regular") gains the "make them a VIP?" action link.
- Marketing-copy debt: FM "VIP customer base" promise becomes TRUE — no copy change needed, note in map.
- Tier slots: extend `TierLimits` (⚠ protected, per-file approval). March numbers 0/10/25 free/pro/boss — CONFIRM (Q1).
- Effort M. One additive migration.

### A3. Consolidated "today's specials" digest (owner: consolidate, never 5 pings from 5 trucks)
One digest per buyer covering ALL their followed/VIP vendors' new listings since the last digest — never per-vendor sends.
- Recipients: buyers who favorited the vendor (`vendor_favorites`) ∪ VIPs. Free channels only (push + in_app; comms-cost rule) — email only if owner asks.
- Mechanism: daily cron sweep (join new published listings since last run × followers, group BY BUYER, one notification listing vendor names/items). Dedup + "since last digest" watermark. Vercel crons fire prod-only — staging test via manual CRON_SECRET GET (house pattern).
- Cadence Q4 below. New notification type (tripwire bump needs owner OK at build).
- Effort M. No migration (watermark can live on the notification row query or a small table — decide at build).

## PHASE B — money perks (the vendor-toggled benefits MENU)
Vendor picks from platform-defined benefits, toggle on/off per benefit. V1 menu (owner-named):
1. **Virtual punch card** — N fulfilled orders → reward. Cross-checks: reward as %-off-next-order avoids the free-item 50¢-Stripe-minimum problem (min-order rule decided 2026-08-25 if free-item is wanted). Data: fulfilled-order counts already exist (same source as segments) — a punch card is largely DISPLAY over Layer-1 data + a redemption discount.
2. **Spend-threshold discount** — "10% off if you spend more than $30" (per-order subtotal threshold at this vendor).
Both are VENDOR-FUNDED (2026-08-25: no platform-funded at launch) and ride the **store-subtotal-NET** discount plumbing (research doc design note): `order_items.subtotal_cents` stored net, `unit_price_cents` = list, `discount_cents` + offer ref as the record — reject/resolve/expire/cascade then need NO edits. Fees on post-discount price (decided). Checkout page client calc mirrors display (paired surface).
- ⚠ SEQUENCING: the 2026-08-25 decision gated the offers/discount machinery behind **chunk D** ("funder decision feeds sales tax"). All-vendor-funded shrinks that concern but the gate stands until the owner explicitly re-opens it → **Q7**.
- ⚠ Critical-path files at build: checkout/session (discount application) + reject-refund read path verification. Per-file approvals.
- Effort: ~2 sessions once unblocked (plumbing + menu UI + 2 benefits + tests).

## Open questions (owner answers lock the design)
- **Q1 — ✅ ANSWERED 2026-09-04**: keep free 0 / pro 10 / boss 25 (FM mapping by tier rank).
- **Q2 — VIP auto-expiry**: auto-remove after 6 months without a purchase (vendor notified, can re-add)? March said yes; cheap to skip in v1.
- **Q3 — ✅ ANSWERED 2026-09-04**: perks are **VIP-only for now** — "build it for VIPs now and we will get feedback." Widening to all customers is a later call driven by that feedback.
- **Q4 — Digest cadence**: daily fixed hour? Market-day mornings? At most one per day regardless.
- **Q5 — Punch card v1 mechanics**: vendor sets visits target (bounds?) + reward = % off next order (bounds?); free-item variant now or later?
- **Q6 — Threshold discount bounds**: min/max % and threshold (guard against 90%-off mistakes)?
- **Q7 — ✅ ANSWERED 2026-09-04: gate RE-OPENED** — Phase B may follow Phase A directly. Rationale: vendor-funded-only + subtotal-NET keeps tax clean ("we want taxes to be clean and easy for calculations & compliance"). **NO platform-funded discounts/perks yet, maybe later** — those stay behind chunk D.

## Build order proposal
A1 → A2 (one push each, trace end-to-end) → A3 → B plumbing → punch card → threshold discount (gate re-opened 2026-09-04; vendor-funded only). Flash sales: not in this plan ("later, if at all").
