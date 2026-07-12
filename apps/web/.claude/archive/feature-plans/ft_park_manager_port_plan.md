# FT Park-Operator Management — Port Plan (FM market-manager → Food Trucks)

**Created:** 2026-06-29. **Mode:** Report — PLANNING ONLY, no code. Picked up after the FM
make-up-days feature lands and the user finishes FM-vertical testing.
**Companion to:** `market_manager_v2_plan.md` (the FM build, which defers "FT park operator equivalent"
to its Phase 6+, line 454). This doc is that deferred port, scoped.
**Source:** 3 cross-vertical code surveys (2026-06-29) + first-hand verification of the load-bearing claims.

---

## TL;DR (the headline finding)

The market-manager + booth/season system is **already vertical-agnostic at the database layer and across
~90% of the app layer.** FM-only status is enforced by a *thin* code scoping, not by schema:

- **Every booth/season/manager table keys only on `market_id`** (no vertical column, no FM constraint):
  `markets` (carries `vertical_id`), `market_booth_inventory`, `weekly_booth_rentals`,
  `booth_booking_groups`, `market_seasons`, `booth_credits`, `market_schedules`, `market_date_overrides`,
  `market_day_checkins`. (Verified via migrations 134/139/160/161/164/166/170.)
- **FT truck parks ALREADY EXIST as data:** `FT_SEED_PART_A.sql:117-126` seeds "Sixth Street Food Park"
  (Amarillo), + Canyon + Lubbock parks as `market_type='traditional'`, `vertical_id='food_trucks'`.
- **`market_day_checkins` was designed with FT in mind** — its migration comment names "FT park owners +
  FM managers" (mig 160:13).
- **The money path is vertical-neutral:** `calculateBoothRentalFees(weeklyPriceCents)` takes no vertical
  param (`pricing.ts:324`); booth checkout is a destination charge to `markets.stripe_account_id`
  (`payments.ts:287-345`).
- **Manager auth is vertical-agnostic:** `isMarketManager` / `getMarketManagerState` key on
  `markets.manager_user_id`/`manager_email` + `manager_status`, never on vertical (`manager-auth.ts:26-119`).

**So the port is mostly: un-hardcode three FM gates, add FT terminology, design the FT "spot" inventory
shape, and curate an FT agreement-statement set — NOT build a new core system.** Plus deciding which FM
pieces genuinely fit FT vs. which to drop or rework (the "don't force it" analysis below).

---

## FM → FT concept map

| FM concept | FT equivalent | Notes |
|---|---|---|
| Market (recurring) | **Truck Park** = a Multi-Truck Location | Same `market_type='traditional'`; FT term already = "Location"/"Truck Park" (`food-trucks.ts:25-29,71`) |
| Market manager | **Park operator** | Same `markets.manager_*` columns + auth; FT term = "Operator" (`food-trucks.ts:19`). Persona/intake deferred (`intake/route.ts:24-25`) |
| Vendor (farmer) | **Food truck** | FT term = "Food Truck" (`food-trucks.ts:17`) |
| Booth (numbered tent, size tier) | **Truck spot / stall** | Needs FT-specific shape — see "don't force it" #1 |
| Booth inventory (size_label, count, weekly_price) | **Spot inventory** | Same table; "size" semantics change (length / power, not 10×10) |
| Weekly booth rental | **Weekly spot rental** | Same table/flow; this is the FT wedge (weekly-first) |
| Season prepay | Season spot commitment | Optional/secondary for FT — see "don't force it" #2 |
| Booth credits / settlement / make-up days | Same, for park closures | Maps cleanly (weather closes a park too) |
| Market schedule (weekly days/hours) | Park operating schedule | Maps directly — same `market_schedules` |
| Check-ins | Truck check-in at park | Already FT-aware (mig 160:13) |
| Opt-in vendor agreement | Park rules for trucks | Needs FT statement set — see "don't force it" #4 |
| Cancel-a-day cascade | Park-day closure | Maps; refunds buyer orders + credits spot renters |
| Buyer product pickup at market | Truck pickup order | ALREADY shared/built — no change |
| "Vendors at market today" | "Where are trucks today" | FT already has this (`trucks/where-today/route.ts`) |

---

## A. Reuses as-is (no logic change; FT markets already satisfy these)

All of the following work for an FT `traditional` market today, keyed on `market_id` / real `vertical_id`:

- **Manager auth + route guard** (`manager-auth.ts`, the `[vertical]/market-manager/[marketId]/layout.tsx`).
- **The whole `[marketId]/*` API surface** (booth inventory/labels/placeholders, vendors/booth/tier/approval/
  invitations/docs, optin selections, onboarding-acks, schedules, cancel-date, attendance, stripe
  onboard/status, broadcast, branding, logo, documents, weekly-rental, seasons/settlement/makeup-dates).
- **All booth/season/schedule libs** (`booth-*`, `season-*`, `settlement-math`, `cancelled-days`,
  `cancel-date-cascade`, `checkin-eligibility`, `manager-dashboard-stats`, `market-visibility`) — grep found
  no FM/FT branching in `src/lib/markets`.
- **The booth money path** (`pricing.ts` `calculateBoothRentalFees`, `payments.ts` booth + season checkout).
- **The manager dashboard page render logic** — NOT vertical-hardcoded; its only conditional is
  `market_type==='traditional'` for the visibility card (a market-type, not vertical, distinction).

---

## B. Must change (the real FM gates)

1. **`getMarketsManagedBy` FM filter (THE blocker).** `manager-queries.ts:42,54` hardcodes
   `.eq('vertical_id','farmers_market')` on both branches → an FT operator's parks would never surface on
   the buyer dashboard "My Markets" card. Fix: drop the filter (or make it accept the current vertical).
2. **Intake hardcodes the vertical.** `market-manager/intake/route.ts:223` sets `vertical_id:'farmers_market'`
   on the created market; intake is FM-pitched (copy + emails). FT needs a park-operator intake path (or a
   vertical param on the existing one).
3. **Terminology keys.** FT config has park/location/operator vocab but **no keys for "booth/spot,"
   "manager/operator-program," "season," or "rental"** — the manager components hardcode FM-flavored copy
   (e.g. dashboard `:231-237`). Add keys to `vertical/types.ts` + both configs, route manager copy through
   `term()`.
4. **Cosmetic FM branding** (not logic): `ManagerSupportCard.tsx:17` (`support@farmersmarketing.app`), intake
   emails, access-removed/suspended pages, the `/market-manager-program` landing page copy. FT needs its
   foodtruckn.app equivalents.
5. **Audit the soft fallbacks.** ~10 sites use `market.vertical_id || 'farmers_market'` for notification
   vertical (harmless when the FT market's `vertical_id` is set correctly, but worth confirming during port).

---

## C. Needs FT-specific design ("don't force it" — the important part)

1. **The "spot" inventory shape is genuinely different.** An FM booth = a numbered tent footprint in a
   size tier (10×10 / 10×20). A truck spot differs on real axes: **vehicle length**, **power/utility
   hookups** (generator vs shore power), and parks typically have **far fewer spots** (≈5–15 vs ≈50 booths).
   - The `market_booth_inventory` table fits structurally (`size_label`, `count`, `weekly_price_cents`), but
     "size_label" should mean spot type for FT — e.g. "Standard (≤20ft)", "Large rig (≤30ft)", "Powered
     spot". **Decision needed:** do FT spots tier by length, by utilities, or just flat per-spot?
   - `booth_number` → spot/stall ID. Same mechanic.
   - Don't import FM dimension copy; drive labels through config/manager input.

2. **Season prepay is secondary for FT — lead with weekly.** FM farmers commit to a recurring season;
   that's natural. Food trucks rotate — many won't prepay a season. The v2 plan already found "**weekly is
   the wedge**" even for FM. For FT, recommend **shipping weekly spot rental first and treating season as a
   later, optional add** for anchor trucks that hold a standing weekly slot. The season tables already exist
   if/when wanted — just don't make it the FT entry point.

3. **The park-operator persona overlaps the RM/operator economics (already decided).** `decisions.md`
   2026-06-28: **FT-park spaces use the SAME booth math** (operator keeps base − 6.5%), operator-keep % is a
   tunable lever (standard 93.5%), RM license $1,000/yr, tier rules deferred. The FT port is where that
   "per-market keep-rate read by payments.ts" (operator_projection_tool.md:28-29) would actually get built.
   **Sequence note:** the FT park-operator port and the RM money-path build are the same surface — plan them
   together, not twice.

4. **Agreement statements must be FT-authored.** The opt-in catalog (mig 136, 15 FM statements) is
   farmers-market-flavored (produce/handmade, liability). FT parks need **mobile-food-specific** rules:
   health/mobile-food-permit (MFP), fire/propane/generator safety, grease disposal, setup/teardown windows,
   power-draw limits. New catalog rows tagged for FT (the catalog is per-market-selected, so this is data +
   a vertical tag, not schema).

5. **Coexists with — does not replace — the existing FT events/wave system.** FT already has the
   events/catering/wave subsystem (`market_type='event'`, `event_waves`, company-paid Stripe-bypass). Park
   management is the **recurring `traditional` layer**, orthogonal to one-time events. A person can be both a
   park operator and an event organizer (composable-roles decision, `decisions.md` 2026-06-12). Don't fold
   them together.

6. **The free "where are trucks today" attendance already exists.** FT trucks self-declare attendance via
   `vendor_market_schedules` (powering `trucks/where-today`). Paid park-spot booking should **layer on top**
   (a paid booking implies attendance) rather than duplicating it — reconcile the two so a paid spot shows
   in "where today" without a second declaration.

---

## D. Things that DON'T need porting (already shared or N/A for FT)

- Buyer product-pickup ordering (shared `orders`/`order_items`) — no booth/buyer-facing copy needed; booths
  are operator↔truck B2B, invisible to buyers.
- Buyer premium (off for FT — `food-trucks.ts:7-10`).
- The events/wave system (already FT's primary commercial layer).

---

## E. Suggested phasing (gated on FM validation + the FM make-up feature proving out)

Mirrors the FM v2 plan's proven sequence, FT-flavored. Each phase = its own present→approve→build cycle.

1. **Un-gate + terminology** (S): drop the `manager-queries` FM filter; add FT booth/spot/operator/season
   `term()` keys + route manager copy through them; FT branding/emails. (Makes existing manager dashboard
   usable for an FT park operator.)
2. **FT spot inventory shape** (M, design-first): decide the FT spot tiering (length/utility/flat); adjust
   inventory labels/UX; no new core table.
3. **FT operator intake + landing** (M): a park-operator intake path (vertical param or sibling route) +
   foodtruckn.app program page.
4. **Weekly spot rental for FT** (M): the wedge — reuse `weekly_booth_rentals` + booth checkout; reconcile
   with `vendor_market_schedules` attendance.
5. **FT agreement statements** (S): author + seed FT-tagged opt-in catalog rows.
6. **Operator-keep % money-path** (L, ⚠ money path): the RM tunable keep-rate read by `payments.ts` — joint
   with the RM build, per-file approval. (Could precede or follow #4 depending on RM priority.)
7. **Optional later:** FT season prepay; FT-specific check-in/make-up copy (logic already works).

---

## F. Open questions for the user (resolve before building any FT phase)

1. **Spot tiering:** do FT park spots tier by truck length, by utilities (power/water), or flat per-spot?
2. **Season for FT:** ship weekly-only first (recommended), or include season prepay from the start?
3. **Operator intake:** extend the existing `market-manager/intake` with a vertical param, or a separate
   `park-operator/intake` route + persona?
4. **RM coupling:** build the operator-keep-% money path together with the FT port (#6), or port FT at the
   standard 93.5% first and add the tunable keep-rate later?
5. **Attendance reconciliation:** should a paid spot booking auto-create/replace the
   `vendor_market_schedules` "where today" attendance row, or stay separate?

---

## G. Verification status of this doc

First-hand verified this session: `manager-queries.ts:42,54` (FM filter), FT parks in `FT_SEED_PART_A.sql:117-126`,
`market_manager_v2_plan.md` defers FT (line 454). The booth-table vertical-agnosticism is cited to migrations
read by the survey agents (not re-opened here); confirm exact columns against the migration DDL before writing
any FT migration. The `market_type` CHECK = `traditional|private_pickup|event` (no `food_truck` type — FT parks
reuse `traditional`).
