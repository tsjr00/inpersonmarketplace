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
- **Q4 — ✅ ANSWERED 2026-09-04**: "8am daily during the season and only if there is something for them to see. out of season they go to the app and look." → 8am local, content-gated (zero new items = zero send — which is also what makes off-season naturally silent; no separate season flag in v1, noted for revisit if off-season posting noise appears). Hard max one digest per buyer per day.
- **Q5 — Punch card v1 mechanics**: vendor sets visits target (bounds?) + reward = % off next order (bounds?); free-item variant now or later?
- **Q6 — Threshold discount bounds**: min/max % and threshold (guard against 90%-off mistakes)?
- **Q7 — ✅ ANSWERED 2026-09-04: gate RE-OPENED** — Phase B may follow Phase A directly. Rationale: vendor-funded-only + subtotal-NET keeps tax clean ("we want taxes to be clean and easy for calculations & compliance"). **NO platform-funded discounts/perks yet, maybe later** — those stay behind chunk D.

## Perk-build decision menu (written 2026-09-04 at owner request — "write up your suggestions and I'll pick")

**D1 — Q6 threshold-discount bounds** (coded as constants in `lib/loyalty/offers.ts`, pending confirm):
(a) **RECOMMENDED: 5–25% off, threshold $15–$100** — wide enough for real strategies, blocks fat-fingered 90%-off. (b) Tighter: 5–15%, $20–$60. (c) Owner's own numbers.

**D2 — Q5 punch-card bounds**: (a) **RECOMMENDED: target 3–15 visits, reward 5–25% off** the next order. (b) Fixed simple menu (5 or 10 visits; 10/15/20%) — fewer knobs, harder to misconfigure. (c) Owner's numbers.

**D3 — punch reward type**: (a) **RECOMMENDED v1: %-off-next-order only** — rides the B1 plumbing as-built; no new money mechanics. (b) Free-item rewards too — reopens the Stripe 50¢-minimum + min-order rule (decided 2026-08-25) → real extra work; defer unless demanded.

**D4 — what counts as a punch**: (a) **RECOMMENDED: a FULFILLED order** — the exact Layer-1 visit definition (same source as segments/badges; one definition, no drift). No real alternative worth having.

**D5 — when punches start counting**: (a) **RECOMMENDED: from VIP designation** (or perk enablement, whichever is later) — clean expectations, no retroactive windfall. (b) Lifetime history counts — a 12-order Regular redeems instantly on enable; a delight-moment launch gift but cheapens the earn and complicates "progress". 
**D6 — redemption**: (a) **RECOMMENDED: auto-applied at checkout on the order AFTER the target is hit** (no codes, no show-this-screen — consistent with the Layer-2 "auto-applied, no codes" decision and the auto-track/auto-deliver rule). Card repeats (every N visits). (b) Banked/choose-when-to-use — needs UI + state; defer.

**D7 — stacking (punch reward + threshold discount on one order)**: (a) **RECOMMENDED: no stacking — the single best-for-buyer perk applies**; simple math, caps exposure at one discount. (b) Stack both — max ~50% off with max bounds; not recommended.

**D8 — vendor perk-menu UI home**: (a) **RECOMMENDED: a "VIP Perks" block inside/below the Your Customers card on Insights** — one VIP home (slots, roster, perks together). (b) Own dashboard card. (c) Vendor edit page.

**D9 — buyer-facing disclosure**: (a) **RECOMMENDED: VIPs SEE their perks** — on the Favorites vendor card ("VIP perk: 10% off orders over $30" / punch progress "3 of 5 visits") + a "VIP deal −$X" line in checkout. A secret discount changes no behavior; a visible one drives the spend it rewards. (b) Silent surprise at checkout only.

**D10 — perk-enabled announcement**: (a) **RECOMMENDED: fold into the daily digest** ("Smokestack added a VIP perk: …") — no new notification type, respects the 5-pings rule. (b) Dedicated one-time notice to VIPs on enable (new type → tripwire). (c) None — discover via Favorites.

**D11 — later menu candidates (NOT now, listed for completeness)**: First Order + Come Back offers (decided 2026-08-25) are inherently NOT VIP-only (First Order targets new customers by definition) — they join the menu after the VIP-only feedback round, when Q3 widens. Free-item punch rewards (D3b). Early access perks (tie to flash sales if ever built).

## Build order proposal
A1 → A2 (one push each, trace end-to-end) → A3 → B plumbing → punch card → threshold discount (gate re-opened 2026-09-04; vendor-funded only). Flash sales: not in this plan ("later, if at all").

---

## PHASE FM — apply VIP to the farmers-market vertical (REVISED 2026-09-04 after owner corrected the tier model)

### The corrected tier model (verified vendor-limits.ts:6-9 + snapshot migs 089/061)
Tiers are UNIFIED across both verticals: free → pro ($25/mo) → boss ($50/mo).
"standard/premium/featured/basic" are LEGACY names accepted by the DB CHECK for
backward compat only; normalizeTier maps them to free (vendor-limits.ts:27-35).
Mig 061 grandfathered then-existing FM vendors at 'standard'. (An earlier draft
of this section claimed FM had its own tier names — that came from a stale
memory file, now corrected there too.)

### Consequence: VIP already works for FM — there is NO code blocker
An FM vendor on pro/boss gets 10/25 VIP slots TODAY (normalizeTier passes
pro/boss through regardless of vertical). Verified in the 2026-09-04 review:
insights page renders for FM, Your Customers gate passes, engine/checkout/
preview/favorites/notifications/digest are vertical-agnostic, the punch
qualifying bar auto-adjusts ($10 FM / $5 FT, pricing.ts:49-52), and punches
accumulate at private pickup locations too (punchState filters only
vendor+buyer+fulfilled — no market-type filter; the owner's stated reason for
keeping "visits" wording). The "Pro and Boss feature" copy is CORRECT for FM.

### Owner decisions (2026-09-04)
1. FM mirrors FT numbers — ALREADY TRUE in code (pro 10 / boss 25, both verticals).
2. "Featured gets slots: yes" — answered under the old model; featured is a
   legacy value now. If the data check finds featured rows → propose migrating
   them to boss (25). Owner re-confirms once data is in.
3. Market boxes EXCLUDED from perks v1 — confirmed (already true: engine sees
   listing items only).
4. Punch wording stays "visits" — confirmed (private-pickup rationale above).

### Remaining work
- **Data check (owner runs, read-only, each env — prod matters most):**
  `SELECT vertical_id, tier, count(*) FROM vendor_profiles GROUP BY 1, 2 ORDER BY 1, 2;`
  → If legacy tier values (standard/premium/featured/basic) show up: owner
  decides per group — migrate rows to the unified equivalent, or leave (they
  behave as free ⇒ 0 VIP slots). Featured→boss proposal per #2.
  **PROD RESULT (owner 2026-09-04):** FM free 2 / premium 1 / standard 7 ·
  FT basic 2 / pro 1 / standard 2. No featured (decision 2 moot), no boss.
  12 of 15 vendors on legacy values ⇒ behave as free, 0 VIP slots. OPEN
  QUESTION for owner: the 1 FM `premium` vendor — if actually paying,
  migrate that row to `pro`? (Data change, owner-run.) Standard/basic rows
  presumably stay (grandfathered free).
- **FM guidance copy (built 2026-09-04):** one line in VipPerksCard for
  farmers_market — weekly cadence, 3–6 visits is a realistic target.
- **Verify pass on staging:** FM pro/boss vendor runs the same loop as FT
  (tag VIP → buyer badge/ping → enable perks → FM buyer checkout discount →
  punch earn). No migration; code-only ship.
