# FT Park-Operator Port — Familiarity Review (research working file)

**Created:** 2026-07-01. **Mode:** Report (review + plan only, no code). Recovery point for the FT port familiarization.
**Deliverable:** cited familiarity report + day-vs-week strategic options + refined port sequence, delivered in chat.

---

## VERIFIED FIRST-HAND (path:line cited by me, not agents)

### The week-grained core — what's actually week-coupled vs date-keyed

- **`weekly_booth_rentals` is DATE-keyed, not Sunday-enforced.** `week_start_date DATE NOT NULL` (mig 139:63);
  `UNIQUE (vendor_profile_id, market_id, week_start_date)` (mig 139:83); keyed on `market_id` (139:62), NO
  vertical column; `price_cents` is a booking-time snapshot (139:69); status CHECK pending_payment|paid|cancelled|completed (139:71).
- **`market_booth_inventory`**: `weekly_price_cents` per size tier (mig 134:31), `UNIQUE (market_id, size_label)`
  (134:34), keyed on market_id (134:27), NO vertical column. `size_label` free-form (134:28), `dimensions` free text (134:29), `count` (134:30).
- **`book_weekly_booth_atomic` does NOT enforce Sunday.** Takes `p_week_start_date DATE` (mig 146:167);
  advisory lock = `hash(market:inventory:week_start_date)` (146:197-200); capacity recount matches EXACT date
  `week_start_date = p_week_start_date` (146:222); booth auto-assign excludes same-exact-date rentals (146:280);
  UNIQUE catch on (vendor,market,week_start_date) (146:328). **Nothing validates the date is a Sunday** — the
  DB primitive would accept any calendar date as a distinct slot.
- **`book_season_atomic`** (mig 165): thin wrapper, inserts a `booth_booking_groups` row then LOOPS the inner
  RPC per date in `p_week_start_dates DATE[]` in ONE tx (all-or-nothing, 165:97-118). Comment says "Sundays"
  (165:53) but structurally accepts any DATE[]. Stamps `group_id` on each child (165:110).
- **`calculateBoothRentalFees(weeklyPriceCents)` is UNIT-AGNOSTIC** (pricing.ts:324-345). Pure math: vendor pays
  `round(base×1.065)+15`, manager gets `base − round(base×0.065)`, platform keeps the spread. The param is
  *named* weekly but nothing in the math is week-specific — **feed it a per-day base and it works identically.**
  → **Per-day pricing does NOT require changing pricing.ts logic**, only what "base" means + the inventory column name.
- **Sunday-anchoring lives ONLY in the app layer, concentrated in 2-3 modules:**
  - `season-weeks.ts computeSeasonWeeks` (:42-76): enumerates operating dates in [start,end] matching active
    `market_schedules.day_of_week`, minus cancelled overrides, then BUCKETS each to its Sunday (:63-66) → ONE
    weekly row per Sunday-week even for multi-day markets (Sat+Wed → 1 row covering both days).
  - `cancelled-days.ts` (`sundayOf` :22-27; `computeCancelledDays` :30-42): buckets cancelled dates to Sunday-weeks,
    counts those in the group's bought weeks on/after purchase_date.
  - `settlement-math.ts owedForGroup` (:18-31): `perDayBase = total_manager_cents / (weekCount × activeDaysPerWeek)`;
    owed = `round(max(0,cancelledDays−cap) × perDayBase)`. Week-named but structurally days/total — adaptable if
    weekCount=Ndays & activeDaysPerWeek=1. `isSeasonFullyResolved` (:39-44) is unit-neutral.

**THESIS (for the fork):** the week-grain is a *semantic convention* concentrated in the column NAME + ~3 app
modules (season-weeks, cancelled-days, settlement-math). The DB rental primitive is date-keyed; the fee math is
unit-agnostic. So the money/DB layer is LESS week-coupled than the "~19 files" estimate implies — the coupling is
concentrated in enumeration + settlement math + naming, not in the charge path.

### Vertical-agnosticism (confirmed first-hand)

- **`manager-queries.ts:42 AND :54`** both hardcode `.eq('vertical_id','farmers_market')` (id-match + email-match
  branches). `getMarketsManagedBy` takes NO vertical param. THE buyer-dashboard blocker. Confirmed.
- **`manager-auth.ts`** `isMarketManager` (:26) / `getMarketManagerState` (:60) key only on
  `markets.manager_user_id`/`manager_email`/`manager_status` (:71,:84-89). No vertical param, no vertical filter.
  Vertical-agnostic confirmed.

---

## STILL TO VERIFY FIRST-HAND
- [ ] FT parks seeded market_type='traditional' vertical_id='food_trucks' (FT_SEED_PART_A.sql:117-126)
- [ ] market_type CHECK constraint (no 'food_truck' type) — which migration
- [ ] intake/route.ts:223 vertical hardcode
- [ ] mig 164 season foundation columns; mig 170 potential_makeup_days; mig 160 checkins FT comment; mig 161 overrides status='special'
- [ ] vertical config / term() system: src/lib/vertical/**, configs/food-trucks.ts, farmers-market.ts, types.ts
- [ ] FT events/waves + where-today attendance (agent B) + manager surface inventory (agent C) + blast radius (agent A)

## MORE VERIFIED FIRST-HAND (round 2)

- **Sunday enforced at the ROUTE layer, not the DB.** `book/route.ts:209` — `if (weekStartUtc.getUTCDay() !== 0) → 400 "must be a Sunday"`. So the one-off booking route HARD-gates Sunday even though `book_weekly_booth_atomic` accepts any DATE. Correction to my round-1 thesis: the convention is enforced, just at the app/route layer + the Sunday-bucketing helpers, not the DB primitive.
- **`term()` system EXISTS** at `src/lib/vertical/terminology.ts:30` (`term(vertical,key,locale)`, falls back to key then FM config). BUT manager components use it ZERO times (agent C grep: 0 imports across src/components/market-manager). `TerminologyKey` (types.ts:2-33) has NO booth/spot/season/rental/operator-program keys — only market/traditional_market/market_day/event*. FT config (food-trucks.ts) HAS operator/location vocab (`vendor_person:'Operator'`:19, `market:'Location'`:25, `traditional_market:'Multi-Truck Location'`:27) but nothing for the booth-rental domain. → Port needs to (1) ADD ~a dozen TerminologyKey entries, (2) fill both configs, (3) WIRE ~25 manager components to term() from scratch (not "finish" — start).
- **market_type CHECK = `traditional|private_pickup|event`** (mig `20260221_039_add_event_market_type.sql:8`); no `food_truck` type. FT parks = `traditional` + `vertical_id='food_trucks'`.
- **intake hardcode confirmed:** `market-manager/intake/route.ts:223` `vertical_id:'farmers_market'` (write); `:244` `||'farmers_market'` fallback.
- **where-today = free, public, single-source:** `trucks/where-today/route.ts` GET, rate-limited only, NO auth (:6-12); reads `vendor_market_schedules` where `is_active=true` (:40-76). Truck self-declares free via `vendor/markets/[id]/schedules/route.ts` (no payment/booth check anywhere). → the two-sources-of-truth collision with a paid spot booking is real.

## KEY CORRECTIONS TO ft_park_manager_port_plan.md (cite when reporting)
1. **Blast radius is 62-64 distinct code files** (agent A full week-concept surface), NOT "~19". (~19 was the phase_e plan's estimate for option-b generalization specifically; the full week-touching surface is far larger.) Breakdown: 12 DB/mig, 14 API routes, 18 lib, 13 components/pages, 5 tests.
2. Plan §B3 implies manager copy is "routed through term()" — FALSE. Zero term() in manager components; wiring is unstarted (~25 components + ~12 new keys).
3. Plan didn't flag `book/route.ts:209` hard Sunday route-gate — a concrete blocker for any day booking through the existing route.
4. `market_booth_inventory` "fits structurally" (plan §C1) is true but note `weekly_price_cents` naming + the `>$10k/week` guard (booth-types.ts:72) are week-denominated.

## TERMINOLOGY DECISIONS (user, 2026-07-01)
- **FM 'booth' → FT 'spot'** (confirmed; not "stall"). Other proposed identity/spatial terms approved (vendor→Food Truck, market→Location/Truck Park).
- **Season/settlement/make-up vocab (Bucket 3) = ON HOLD** — user awaiting data on whether FT parks even do season-long rentals. Do NOT wire season/settlement/credit terms yet.
- **Bucket 2 (time-unit words: week/weekly/per-week) also effectively held** — tied to the undecided day-vs-week rental-unit fork.
- ⚠ STILL OPEN: park-manager term collides with existing FT `vendor_person:'Operator'` (food-trucks.ts:19). Need a distinct word (Park Host / Park Manager / Lot Operator) before wiring the manager/operator label.
- Net actionable slice = **Bucket 1 only** (spatial/identity nouns incl. booth→spot), FM rendering identical.

## BUILD IN PROGRESS — FT terminology wiring (2026-07-01, approved batch)
Approach: route manager-surface domain nouns through `term(vertical, key)`. FM stays BYTE-IDENTICAL (each FM config value = the original word; `.toLowerCase()` where the original was lowercase; singular/plural keys matched). Pattern proven on the dashboard anchor (tsc exit 0).
- **DONE + tsc-clean:**
  - `types.ts` — added keys `booth/booths/manager/season/seasons/week/weekly` (season/week/weekly FT vals PROVISIONAL).
  - 4 configs — FM (Booth/Booths/Manager/Season/Seasons/Week/Weekly), FT (Spot/Spots/Park Manager/…prov), + es (Puesto/Espacio, Gerente/Gerente del Parque, …).
  - `dashboard/page.tsx` — all user-facing card titles/descriptions + "coming soon"/feedback copy routed through term(); import added; `vertical` already in scope.
- **PATTERN:** `import { term } from '@/lib/vertical/terminology'`; `term(vertical, 'booth')` (title case) / `term(vertical, 'booth').toLowerCase()` (mid-sentence). Client components need a `vertical: string` prop threaded from the parent (dashboard passes `vertical`).
- **REMAINING (~24 components + onboarding/access pages):** booth family (BoothInventoryManager, BoothPlaceholderManager, BoothOccupancyGrid, VendorBoothList, WeeklyBookingsCard/List), season family (MarketSeasonCard/SettlementCard/MakeupWindow — provisional vocab), plus MarketScheduleCard, MarketCancelDateCard, MarketBroadcastCard, MarketAttendanceCard, MarketTransactionsCard, ManagerEarningsCard, ManagerActionSummary, ManagerJumpNav, InviteVendorLink/Browser, OptinManager, OnboardingChecklist, VerificationDocumentsCard, SurveyResultsCard, MarketVisibilityCard, MarketStripeConnectCard, ManagerSupportCard (email→FT), MarketManagerCard (buyer dashboard — extra call site). Most need the `vertical` prop threaded.
- **FM-regression guard:** the ONLY failure modes are wrong key / wrong plural / wrong case / accidental non-domain edit — audit for those; tsc+lint+vitest must stay green; FM output must equal pre-change strings.

### STATUS 2026-07-01 EOD — DONE + VERIFIED (tsc 0, lint 0, vitest 1557/1557), UNCOMMITTED
Scope executed: booth→spot + vendor/market/manager nouns via term(); **week/weekly/season vocab left hardcoded** (held); **season cards untouched** (MarketSeasonCard/SettlementCard/MakeupWindow) per user; "Location" kept for FT market.
- **Foundation:** types.ts (7 keys) + 4 configs (FM identical, FT incl. Spot/Park Manager, es).
- **Wired (26 surfaces):** dashboard page; MarketManagerCard (buyer dash); 22 components via 3 agents (booth family ×6, schedule/comms/money ×7, nav/invite/misc ×9 minus OptinManager=no nouns); onboarding [step] page copy (3 paras); MarketBrandingCard.
- **Parent prop-threading (me):** all `vertical={vertical}` in dashboard (14) + onboarding (3) + admin SurveyResultsCard (`market.vertical_id`). VendorBoothList `vertical?` → required.
- **REMAINING (un-wired, NON-breaking — render FM copy today, FT would show a few English words; itemized for follow-up):**
  - `MarketVisibilityCard.tsx` — deferred: whitespace-sensitive multi-node JSX (embedded `<strong>`/`<a>`), needs careful {' '} handling + `vertical` prop + dashboard thread.
  - onboarding `STEP_LABELS` module-const (types.ts:16-20 area: "Confirm your market", "Booth inventory", "Vendor booth assignments") — module-level, needs a function or in-component move.
  - `MarketDetailBlock.tsx`, `MarketAgreementBlock.tsx`, `MarketManagerAssignment.tsx` (admin) — agent-C-flagged, not yet wired.
  - Season family (MarketSeasonCard/SettlementCard/MakeupWindow) — DELIBERATELY skipped per user (held pending FT rental-unit data).
  - Emojis (🌾 in MarketManagerCard, 🧺/📍 icons) — branding, separate pass.
  - ManagerSupportCard `support@farmersmarketing.app` + intake emails/branding — separate FT-branding task (plan §B4).
- **Not committed. Not pushed.** Next: optionally finish the remaining tail, then commit (staging) with user approval.

## THE THREE STRATEGIC OPTIONS (day-grained FT rental) — FM-risk tradeoffs
Week-grain is enforced at 4 layers of differing hardness:
  (i) DB RPC primitive — date-keyed, Sunday NOT enforced → SOFT
  (ii) route gate (book/route.ts:209) — hard Sunday check → MEDIUM (parameterizable)
  (iii) app math: season-weeks Sunday-bucketing, cancelled-days `sundayOf`, settlement `weekCount×activeDaysPerWeek`, cancel-date-cascade `weekStartSunday`, ~6 `getDay()`→Sunday helpers → HARD (genuinely week-coupled)
  (iv) pricing/inventory: `calculateBoothRentalFees(weeklyPriceCents)` is UNIT-AGNOSTIC math + `weekly_price_cents` naming → SOFT (rename/reinterpret)

- **(a) PARALLEL FT day model** — new `daily_spot_rentals` + own date-keyed RPC + per-day inventory/price; FM weekly tables untouched. FM blast radius on SHARED tables ≈ 0 (additive only). Money path (pricing.ts + payments.ts fee math + destination-charge) is unit-agnostic → SHAREABLE via a new checkout metadata.type, so real duplication is smaller than it looks (mainly enumeration + settlement/cancel math get a day-variant). LOWEST FM risk; some duplication.
- **(b) GENERALIZE the unit** (`period_type` day|week or date-range on shared `weekly_booth_rentals`) — least duplication, touches all 62-64 files, is EXACTLY the "risky unit change" FM explicitly REJECTED for v1 (phase_e plan §1). FM is live on staging → HIGHEST FM risk; re-opens what was closed.
- **(c) DAY-AS-DEGENERATE** — reuse tables, put the actual calendar date in `week_start_date` (not a Sunday). DB RPC + UNIQUE(vendor,market,date) + capacity + booth-assign all WORK per-exact-date. But: must bypass/param book/route.ts:209; and the Sunday-bucketing settlement/cancel math (sundayOf, weekCount×daysPerWeek, weekStartSunday, season-weeks) would MISINTERPRET FT day-rows → corrupts shared settlement/cancel unless made unit-aware. Mixing FM=Sunday-anchor + FT=actual-date semantics in ONE column is a latent trap for every Sunday-assuming query. MEDIUM risk.

Recommendation framing (NOT a decision — user picks): (a) best protects the just-shipped FM system; (b) is the rejected high-risk path; (c) is deceptively cheap but pollutes shared settlement math. Money path is unit-agnostic in all three → the fork's real cost is enumeration + settlement/cancel + naming, not the charge path.

## AGENTS (all complete) — full outputs in task files
- A (ade98c87): blast radius — 62-64 files. B (a137ff8c): FT reality + 5 collision flags. C (a4cb4c96): manager surface — structurally agnostic, cosmetically FM (intake:223 only true write-hardcode; 0 term() usage).
