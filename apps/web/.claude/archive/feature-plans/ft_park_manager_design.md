# FT Park-Manager Module — Design & Phased Build Plan

**Created:** 2026-07-01. **Mode:** Report (design + plan; NO code until each phase is approved).
**Status:** Design LOCKED with user (2026-07-01). Build not started.
**Supersedes:** the rental-unit approach in `ft_park_manager_port_plan.md` §C1/fork. That doc assumed FM-pattern reuse; **this design diverges deliberately** — date-native, drops FM's season/group/credit/settlement stack. The port plan's un-gating/terminology findings still apply as prerequisites.
**Companion:** `ft_port_familiarity_research.md` (verified code anchors + the day-vs-week fork analysis).

---

## TL;DR

A food-truck **park operator** rents **individual spots** to trucks **by the day** (with a prepay-week option). The atomic record fuses three things FM keeps separate — **reservation + attendance + payment** — around a **calendar date**, not a Sunday week. Anchor trucks hold a **manager-approved recurring** spot governed by a 3-strike engine. A separate **check-in** layer (reusing an existing table) is the **actual-attendance / state-compliance** log. We **reuse** the unit-agnostic money math and drop the entire FM season/settlement machinery FT doesn't need — so this is *less* code than porting FM, not more.

**Design principle the user set:** don't force the FM shape; be innovative where FT differs; stay efficient. Buyer-sales integration is explicitly **out** (deferred, touches a critical-path RPC).

---

## Locked decisions (user, 2026-07-01)

| # | Decision |
|---|---|
| Spots | **Individual** attribute-rich spots (length / power / water), NOT count-based size tiers. Parks have ~5–15 real spots. |
| Unit | **Date-native** paid booking `(truck, park, date, spot)`. Not week-grained. |
| Payment | **Pay-per-booking at checkout** + a **prepay-the-week** bundle option. |
| Season | **Replaced by "standing/recurring reservation."** No FM-style season prepay. |
| Recurring grant | **Manager-approved** (the consistency draw + the abuse gate). |
| Strike engine | Revoke recurring at **3 strikes**; a paid week does **not** decrement; **32-day rolling window, compute-on-read**; **manager manual authority always** (revoke / reinstate / reset). |
| Strike sources | (a) missed prepay cutoff for a generated occurrence; (b) **paid but no same-day check-in (no-show)**. |
| Check-in | **Day-only** (market-local date; no after-the-fact filing). **Geolocation strongly pushed**; if location off → save anyway (never blocks) but show a **state-noncompliance warning**. |
| False-no-show guard | **3 check-in reminders** during the operating day (open / midday / pre-close) — a strike lands only after all 3 are missed. Manager `manager_confirmed` override is optional (offsite operators can't rely on it). |
| Check-in scope | **Same mechanism for free & paid parks.** |
| No-show visibility | **Yes** — surface "paid but didn't check in" on the operator roster. |
| Free parks | Brought in via the **attendance + compliance subset only** (no spots/bookings/payment) — the compliance log is the hook; must not distract from paid build. |
| Buyer sales | **OUT.** No `get_available_pickup_dates` / cart / checkout integration in this module. |

---

## Concept map (FT)

| FM | FT park-manager | Status |
|---|---|---|
| Market manager | **Park Manager** (term shipped) | terminology on staging |
| Booth (size tier, count) | **Spot** (individual, length/power/water) | NEW model |
| Weekly booth rental (Sunday week) | **Park spot booking** (calendar date) | NEW date-native table |
| Season prepay | **Standing/recurring reservation** | NEW, manager-approved + strikes |
| Booth credits / settlement / make-up days | — (dropped; per-date refund/credit is trivial) | DROP |
| Check-in (`market_day_checkins`) | **Same table** — now the compliance backbone | REUSE (mig 160) |
| "Vendors at market" (`vendor_market_schedules`) | Free recurring attendance | REUSE + union paid bookings |
| Cancel-a-day (`market_date_overrides`) | Park-day closure | REUSE (mig 161) |
| Booth money path (`pricing.ts` + destination charge) | Spot money path (per-day base) | REUSE (unit-agnostic) |

---

## Data model

### NEW — 3 tables

**1. `park_spots`** — individual spots (FT analog of `market_booth_inventory`, but enumerated not tiered).
```
park_spots
  id                UUID PK
  market_id         UUID -> markets(id) ON DELETE CASCADE
  label             TEXT            -- "Spot A", "Corner (30ft)"
  max_length_ft     INTEGER NULL    -- fits trucks up to N ft
  power             TEXT CHECK (power IN ('shore','generator_ok','none'))
  has_water         BOOLEAN NOT NULL DEFAULT false
  base_price_cents  INTEGER NOT NULL CHECK (base_price_cents >= 0)  -- per DAY
  recurring_eligible BOOLEAN NOT NULL DEFAULT false   -- manager lever (decision: recurring)
  active            BOOLEAN NOT NULL DEFAULT true
  created_at / updated_at
  UNIQUE (market_id, label)
```

**2. `park_spot_bookings`** — the fused reservation record (date-native).
```
park_spot_bookings
  id                UUID PK
  market_id         UUID -> markets(id) ON DELETE CASCADE
  vendor_profile_id UUID -> vendor_profiles(id) ON DELETE RESTRICT
  spot_id           UUID -> park_spots(id) ON DELETE RESTRICT
  booking_date      DATE NOT NULL
  price_cents       INTEGER NOT NULL CHECK (price_cents >= 0)   -- snapshot at booking
  status            TEXT CHECK (status IN ('pending_payment','paid','cancelled','completed'))
                      DEFAULT 'pending_payment'
  booking_group_id  UUID NULL         -- ties a prepay-week bundle (NOT the FM season stack)
  standing_reservation_id UUID NULL -> park_standing_reservations(id)  -- if auto-generated
  stripe_checkout_session_id TEXT
  stripe_payment_intent_id   TEXT
  agreement_acceptance_id    UUID -> vendor_market_agreement_acceptances(id)
  booked_at / paid_at / cancelled_at / created_at / updated_at
  UNIQUE (spot_id, booking_date)                    -- one truck per spot per day
  UNIQUE (vendor_profile_id, market_id, booking_date) -- one spot per truck per park per day
```
- Same-market integrity trigger (spot_id ∈ market) — mirror mig 139:106.
- RLS default-deny; service client behind `isMarketManager` / vendor-self (mirror mig 139:55-57).

**3. `park_standing_reservations`** — the recurring tag.
```
park_standing_reservations
  id                UUID PK
  market_id         UUID -> markets(id) ON DELETE CASCADE
  vendor_profile_id UUID -> vendor_profiles(id) ON DELETE CASCADE
  spot_id           UUID -> park_spots(id) ON DELETE CASCADE
  day_of_week       INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6)
  status            TEXT CHECK (status IN ('requested','active','suspended','revoked'))
                      DEFAULT 'requested'
  approved_by       UUID NULL -> auth.users(id)
  approved_at       TIMESTAMPTZ NULL
  created_at / updated_at
  UNIQUE (spot_id, day_of_week) WHERE status IN ('requested','active')  -- one holder per spot per DOW
```
- **Strikes are NOT stored** — computed on read (see engine below). Only the tag + status live here.

### REUSE — existing, verified
- **`market_day_checkins`** (mig 160) — actual attendance + compliance. Already has `market_date` (one row per market/vendor/date, :49), `checked_in_at/out_at` (:28-29), `method` self_attest|geolocation|manager|qr (:30), `attestation_text/version` ("compliance backbone", :10, :33-34), `booth_number` ("value for FT park owners", :11) → **spot label**, geolocation cols (`captured_lat/lng`, `distance_from_market_m`, `within_geofence`, :36-40), and `manager_confirmed*` (:43-45). **No schema change needed for v1.**
- **`market_date_overrides`** (mig 161) — date-grained cancelled/special (:29-31). Weather-cancel a park day → cancel that date's bookings + refund/credit.
- **`market_schedules`** — day-of-week operating hours; drives prepay-week enumeration + standing-reservation DOW.
- **`vendor_market_schedules`** (mig 001) — free recurring attendance; unioned with paid bookings for where-today.
- **`pricing.ts calculateBoothRentalFees(base)`** (:324) — unit-agnostic; feed per-day base.
- Destination-charge mechanics (`payments.ts` booth pattern), manager auth (`manager-auth.ts`), `term()`, the `[marketId]/*` dashboard shell.

### DROP vs FM (not needed for FT)
`market_seasons`, `booth_booking_groups`, `booth_credits`, `settlement-math.ts`, `cancelled-days.ts`, make-up-days, the season lifecycle/enforcement. FT per-date cancellation is a simple refund/credit; no season debt to settle.

---

## The two-layer attendance model

```
RESERVE (assumed)                    CONFIRM (actual / compliance)
park_spot_bookings (paid)     ──►    market_day_checkins (mig 160)
- reserves the spot                  - day-only self-attest + geolocation push
- feeds where-today forward          - IS the state location log (date→park→address→times)
- pre-fills the check-in             - feeds no-show strike + manager roster
```
- A paid booking **pre-fills** the check-in (park, date, spot known) → truck taps "Confirm I'm here" → `market_day_checkins` row (`booth_number`=spot label, attestation snapshot, advisory lat/lng).
- **Compliance export:** per-truck "My location log" (CSV/PDF) from `market_day_checkins` — turns a legal obligation into a platform draw.
- **Same flow free & paid** (decision). Free-park trucks check in identically → get the log with no booking/payment.

---

## Recurring / standing reservation — full mechanism

**Manager lever:** `park_spots.recurring_eligible` toggle — operator chooses how many spots are anchorable vs. open rotation.

**Lifecycle:**
```
truck requests recurring on an eligible spot  → status='requested'
   → MANAGER APPROVES (decision: manager-approved)  → status='active'
        generator auto-creates next-DOW occurrence booking (pending_payment)
        truck prepays by cutoff  → holds the spot (first dibs)
        │
        ├─ misses prepay cutoff → that date's hold RELEASES to open booking + 1 strike
        ├─ paid but no same-day check-in (no-show) → 1 strike
        │
        └─ 3 live strikes (rolling 32d) → auto-suspend → revoke; spot returns to pool
   manager may revoke / reinstate / reset at ANY time (always wins)
```

**Strike engine (compute-on-read):**
- A "strike" = a row/event with a timestamp; count only those with `event_time > now() - INTERVAL '32 days'`.
- Sources: missed-payment (a generated `park_spot_bookings` left `pending_payment` past cutoff) + no-show (a `paid` booking with **no** `market_day_checkins` row for `booking_date`).
- **≥3 → tag auto-revoked.** A paid week does **not** decrement. 32 days with zero new strikes → count returns to 0 naturally (no cron).
- Manager override is absolute (manual revoke/reinstate/reset).
- **Where "strikes" are read from:** derive from `park_spot_bookings` (missed) + `market_day_checkins` absence (no-show). No strike table needed → compute-on-read.

**False-no-show guard:** 3 check-in reminders on the operating day (open / midday / pre-close) via `sendNotification` — a no-show strike only lands after all 3 are missed. Same reminders double as the compliance nudge. `manager_confirmed` is an optional correction for on-site operators.

---

## Prepay-the-week
Booking action = **single date** OR **prepay-week** = the park's operating dates that week (`market_schedules` ∖ cancelled `market_date_overrides`), same spot, **one checkout**. N `park_spot_bookings` rows share a `booking_group_id` (a lightweight payment bundle — NOT the FM season/settlement stack). Also the natural cadence for standing reservations, and it clears the **Stripe ~$0.50 minimum** that bites cheap single-day spots.

---

## Money path + RM
- Pay-per-booking at checkout: reuse `pricing.ts` (per-day base) + destination charge to the operator's Stripe. New `metadata.type='park_spot'` branch in `payments.ts` (+ webhook) — **critical-path, per-file approval, exact diffs.**
- **RM operator-keep-%** (decisions.md 2026-06-28): `markets.operator_keep_pct` read by the park-spot checkout to raise `transfer_data.amount` (operator keeps up to 100% of base; platform still earns the vendor-side markup). Build jointly with the RM effort. Same money surface as FM booth.

---

## Coexistence (do not fold together)
- **Free "where-today" attendance stays.** Union recurring free declarations (`vendor_market_schedules`) with paid date bookings in the map query. A market is `park_mode` **free** (no priced spots) or **paid** (spots + bookings) or hybrid.
- **Events/waves stay orthogonal** — one-off catered events remain `market_type='event'`; the recurring park layer doesn't touch them. A special event day at a park = `market_date_overrides status='special'` (+ optional event).

---

## Prerequisites (un-gate the manager dashboard for FT)
1. **Drop/parameterize the FM filter:** `manager-queries.ts:42,54` `.eq('vertical_id','farmers_market')` — else an FT operator's parks never surface on the buyer dashboard.
2. **FT operator intake path:** `market-manager/intake/route.ts:223` hardcodes `vertical_id:'farmers_market'` + FM emails — needs an FT variant (vertical param or sibling route).
3. **FT branding/emails:** `ManagerSupportCard` support email, intake emails, access pages → foodtruckn.app equivalents.
4. **Terminology:** DONE (on staging, commit `2cc84272`) — spot / Park Manager / Location. Remaining tail itemized in `current_task.md` (MarketVisibilityCard, STEP_LABELS, admin blocks, season/week vocab held).

---

## Phased build sequence (each = its own present → approve → build → gate → review)

- **P0 — Un-gate + FT intake/branding** (S–M). Prereqs 1–3 above. Makes the (terminology'd) manager dashboard reachable for an FT park operator.
- **P1 — Spot inventory** (M). `park_spots` migration + manager CRUD UI (individual spots, attributes, `recurring_eligible`); `markets.park_mode` (free|paid). No money path.
- **P2 — Date-native paid booking (the wedge)** (L, ⚠ money path). `park_spot_bookings` migration + atomic booking guard + booking route (single date + prepay-week bundle) + `payments.ts`/`webhooks.ts` `park_spot` branch (per-file approval) + where-today union.
- **P3 — Attendance / compliance check-in** (M). Truck check-in flow on `market_day_checkins` (day-only, geolocation push + noncompliance warning); paid-booking pre-fill; 3 reminders (notification/cron); "My location log" export; manager roster view (booked / checked-in / no-show).
- **P4 — Standing / recurring reservations** (L). `park_standing_reservations` migration; manager approve/revoke/reset + `recurring_eligible`; truck request; occurrence generator; compute-on-read strike engine (3 / 32d, missed-payment + no-show); pay-cutoff release.
- **P5 — FT agreement statements** (S). Seed FT-tagged opt-in catalog rows (MFP / mobile-food permit, propane + generator + fire safety, grease disposal, setup/teardown windows, power-draw limits). Reuse the optin system (data + vertical tag, no schema).
- **P6 — RM operator-keep-% money path** (L, ⚠ money path). `markets.operator_keep_pct` read by park-spot checkout. Joint with the RM build; could precede or follow P4.

**Deferred / OUT:** buyer-sales integration (menu live on booked date — touches `get_available_pickup_dates` critical-path RPC); any FM-style season prepay (standing reservations replace it).

---

## Migration list (additive, in order)
1. `park_spots` (+ same-market trigger, indexes, RLS no-policy).
2. `markets.park_mode` (free|paid) — additive column, default derived.
3. `park_spot_bookings` (+ FK, dual UNIQUE, integrity trigger, indexes, RLS no-policy).
4. `park_standing_reservations` (+ partial UNIQUE, RLS no-policy).
5. No change to `market_day_checkins`, `market_date_overrides`, `market_schedules`, `vendor_market_schedules`, `pricing.ts` for v1.

Apply Dev+Staging before code; Prod with the push. Update `SCHEMA_SNAPSHOT.md` after each (mandatory, all DDL).

---

## Verified code anchors (cited this session)
- Rental primitive is date-keyed, not Sunday-enforced: `weekly_booth_rentals.week_start_date DATE` (mig 139:63); book RPC takes `p_week_start_date DATE`, matches exact date (mig 146:167,222). Route enforces Sunday, not the DB (`book/route.ts:209`).
- Fee math unit-agnostic: `pricing.ts:324-345`.
- Check-in table FT-ready: `market_day_checkins` (mig 160:23-50; geolocation :36-40; manager_confirmed :43-45; attestation :33-34).
- Date-grained overrides: `market_date_overrides` (mig 161:26-38).
- Free attendance recurring: `vendor_market_schedules` UNIQUE(vendor, schedule_id) (mig 001:13,19); where-today reads it only (`trucks/where-today/route.ts:40-76`).
- `market_type` CHECK = traditional|private_pickup|event (mig 039:8); FT parks = traditional + vertical_id='food_trucks'.
- Un-gate blockers: `manager-queries.ts:42,54`; `intake/route.ts:223`. Manager auth vertical-agnostic: `manager-auth.ts:26,60`.
- RM keep-%: `decisions.md` 2026-06-28; `operator_projection_tool.md:28-29`.

---

## Open items to confirm at build time (not blockers)
- Prepay-week atomicity: all-or-nothing bundle vs. book-what's-available (lean all-or-nothing, mirror FM O3).
- Cancellation credit vs. cash for a cancelled park day (lean credit-first, but far simpler than FM — no season).
- Whether `park_mode` is an explicit flag or derived from "has priced active spots."
- Reminder cadence exact times (open / midday / pre-close) per market timezone.
- Compliance-log export format (CSV first; PDF later).
