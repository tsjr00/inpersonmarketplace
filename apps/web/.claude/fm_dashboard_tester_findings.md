# FM Manager Dashboard — Tester Feedback Triage (2026-07-11)

Source: FM tester on prod. Each item validated against code (cite-or-verify). Report mode — no changes yet.

## Legend
- **BUG** = real defect. **UX** = works-as-coded but confusing/needs clarity. **DESIGN** = needs product decision + build. **NOT-A-BUG** = correct behavior.

---

## Item 5 — make-up buffer / "cap 1 days" — **NOT-A-BUG (UX labeling)**
- Summary line renders `… · N market days · cap {refund_cap_days} days · make-up buffer {potential_makeup_days}` (`MarketSeasonCard.tsx:369`).
- "cap 1 days" = **refund cap**, auto-derived `Math.max(1, floor(declared*0.10))` (`seasons/route.ts:127`, `:12`). 16 days → 1. Correct.
- make-up buffer rule (0 or 2+) enforced correctly (`seasons/route.ts:85-86`, `:252-253`; label `MarketSeasonCard.tsx:141`).
- Confusion: "cap" not labeled "refund cap"; sits next to the make-up-buffer control → tester read the 1 as an invalid make-up value.
- **Fix:** rename "cap N days" → "refund cap N days" in the summary line.

## Item 3 — booth #1 (manager) vs #2 (vendor) — **BUG (two connected)**
- Two independent booth-number fields: `market_vendors.booth_number` (manager manual roster, set in `vendor-booth/route.ts:126-127`) vs `weekly_booth_rentals.booth_number` (actual paid rental; vendor sees it at `vendor/bookings/page.tsx:398`, source `:117`; season prepay sets it via `book_season_atomic` RPC, `season-booking.ts:73,91`).
- **A (data reconciliation):** manager assigned #1 in roster; season prepay auto-assigned #2 (next free after #1 manual + #3 placeholder). Same vendor, two numbers. [split=Confirmed; next-free mechanism=High-conf inference, lives in book_season_atomic RPC not yet read]
- **B (occupancy week-anchoring):** `BoothOccupancyGrid` anchors to current calendar week `weekStart = mondayOf(today)` (`:70-71`) and pulls paid rentals only WHERE `week_start_date = current week` (`:99-101`); market_vendors + placeholders always show (`:82-92`). Season bookings are future weeks → paid #2 not in "this week" (shows #1 + #3 only). Confirmed.
- Same root as the "wrong date" cluster (below): occupancy/next-day anchored to real current week while activity is a future season.

## Item 8 — "marketsee" missing space — **BUG (trivial)**
- `MarketScheduleCard.tsx:267-268`: `{term(vertical,'vendors')} at this {term(vertical,'market').toLowerCase()}\n          see the same info` — JSX drops the newline-whitespace between the `{expr}` and "see" → renders "marketsee".
- **Fix:** add explicit `{' '}` (or space) after the market term before "see".

## Item 2 — "next market day" ignores season window — **BUG**
- `computeNextMarketDate(schedules, tz)` walks `market_schedules` day-of-week rows for the soonest upcoming weekday (`manager-dashboard-stats.ts:62`, fn `:167`). It takes ONLY schedules + tz — **season_start/season_end not considered.**
- Season Aug 29–Dec 12 but Saturday is an active schedule day → "next market day" = next Saturday (Jul 11), even though the market isn't operating until the season starts.
- MarketScheduleCard copy says the season window "limit[s] when this schedule applies" (`:343`) — so operating on Jul 11 contradicts that. Real bug.
- **Fix:** clamp computeNextMarketDate to the season window (skip dates before season_start / after season_end when a season window is set). NOTE: need to confirm which season source is authoritative — markets.season_start/end vs market_seasons rows (see Item 9).

## Items 1 & 7 — Setup-first ordering + schedule/season in onboarding — **DESIGN**
- Current FM order (`FmDashboardBody.tsx:114-203`): ① triage · ② booths & this week · ③ vendors · ④ **Setup** (collapsible, collapsed when `onboardingComplete`) · ⑤ money · ⑥ communicate.
- Schedule + season cards ARE already inside Setup (`:154-172`) — but Setup is group ④ (after booths/vendors), and the guided onboarding wizard/checklist (`OnboardingChecklist` → `/onboarding`, 4 steps: inventory, opt-in, vendors, placeholders per `onboarding-progress.ts`) does NOT include schedule or season.
- Tester asks: (1) Setup should lead for a new manager (onboarding-style); (7) schedule (and season) belong in the onboarding steps.
- **Needs decisions:** exact reordering (Setup-first only when incomplete? always?), and whether to add schedule + season as onboarding wizard steps (grows the 4-step checklist).

## Item 9 — weekly booth availability (7/11–8/30) ignores the season — **BUG**
- Weekly booth booking page builds weeks via `nextSundays(tz, 8)` — the next 8 Sundays from today (`markets/[id]/book/page.tsx:204`, fn `:40`). **Neither season source is consulted** (not markets.season_start/end, not market_seasons).
- So a market whose season is Aug 29–Dec 12 still offers weekly booths for the next 8 weeks (~7/11–8/30), overlapping/preceding the season. The season pre-sale flow (`SeasonBookingSection`) separately uses the market_seasons window, so the vendor sees BOTH windows at once → the mismatch.
- Same root as Item 2: **the season window is displayed but not enforced** where operating/bookable dates are generated.

## Item 6 — occupancy tier "no date / looks season-booked" — **BUG (= Item 3B)**
- Same week-anchoring cause as 3B: `BoothOccupancyGrid` is locked to the current calendar week and market_vendors show regardless of week, so a season-based market's occupancy looks static/undated.

## Item 11 — agreement statements no bullets on vendor side — **BUG**
- App uses Tailwind v4 (`globals.css:1` `@import "tailwindcss"`); preflight resets `ul { list-style: none; margin:0; padding:0 }`.
- `MarketAgreementBlock` renders statements in a `<ul>` that sets `paddingLeft: spacing.md` but NOT `listStyleType` (`:171-183`) → indented, no bullet markers, tight spacing → "indented sentences with no breaks."
- **Fix:** add `listStyleType: 'disc'` (+ keep paddingLeft) to the agreement-statement list. Audit other statement lists for the same omission (PendingMarketInvitations DOES render bullets; MarketAgreementBlock is the vendor-facing agreement surface = probable one the tester saw).

## Item 4 — invite vendor before payments — **NOT-A-BUG (by design; optional policy)**
- `InviteVendorLink` gates the copy button on `onboardingComplete` (`:11-16,57`) — but `onboardingComplete` = the 4 onboarding steps (inventory, opt-in, vendors, placeholders per `onboarding-progress.ts`), which **excludes Stripe**. So a manager can invite before connecting payments.
- Rationale in code: the gate ensures a complete AGREEMENT lands for the invited vendor; Stripe isn't needed to invite (the vendor can't complete a PAID booking until Stripe is connected — `book` route checks `stripe_charges_enabled`).
- **Decision for user:** leave as-is, OR add Stripe-connected to the invite gate / add "connect payments before vendors can pay" messaging.

---

# FIX PLAN (proposed — no code yet)

**The dominant theme:** `markets.season_start`/`season_end` is shown but **not enforced** anywhere that generates operating/bookable dates (Items 2, 6, 9, and part of 3B). That's the highest-value cluster and needs a design decision first.

## Phase 1 — Trivial display/copy — ✅ BUILT 2026-07-11 (gates green tsc0/lint0, UNCOMMITTED)
Files: `MarketScheduleCard.tsx` (space fix + comment), `MarketSeasonCard.tsx` ("refund cap" label + field-legend comment), `MarketAgreementBlock.tsx` (`listStyleType:'disc'` + preflight comment). Display-only, no migration, no money path, no test changes.

### (original scope)
1. **Item 8** — add `{' '}` after the market term in `MarketScheduleCard.tsx:267` ("market see").
2. **Item 5** — relabel "cap N days" → "refund cap N days" in `MarketSeasonCard.tsx:369`.
3. **Item 11** — add `listStyleType:'disc'` to the agreement-statement `<ul>` (`MarketAgreementBlock.tsx:171`); audit sibling statement lists.
- No migration, no money path. Pure UI. Add/adjust no business-rule tests (display-only).

## Phase 2 — Enforce the season window — ✅ BUILT 2026-07-11 (gates green tsc0/lint0, +13 tests, UNCOMMITTED)
Decisions resolved (Q1 = markets.season_start/end; Q2 = Option B; Q3 = no-season unchanged). New shared helper `src/lib/markets/season-window.ts` (pure, 13 unit tests) — single source for the rule. Wired:
- **2a** `manager-dashboard-stats.ts` `computeNextMarketDate` clamps to the window (+ `getManagerDashboardStats` gains seasonStart/End params; dashboard `page.tsx` passes them).
- **2b** `markets/[id]/book/page.tsx` `nextSundays` clamps to the window (Option B: advance to first in-season Sunday, drop past-end); market select adds season cols; empty-window renders a "season runs X–Y" bail-out.
- **2c** `BoothOccupancyGrid.tsx` anchors the displayed week to the first in-season week when today is pre-season; relabels "this week" → "upcoming market week" + description note.
No migration; no critical-path/money file (booth-booking availability is money-*adjacent* — careful, covered by new + existing tests). FT parks unaffected (null season). Buyer path already enforced this (mig 010) — now vendor/manager are consistent.

### (original scope)
Root fix: make date generation respect the season window when one is set.
- **2a** `computeNextMarketDate` (`manager-dashboard-stats.ts:167`) — skip dates before season_start / after season_end.
- **2b** Weekly week-picker `nextSundays` (`markets/[id]/book/page.tsx:204`) — clamp generated weeks to the season window.
- **2c** `BoothOccupancyGrid` (`BoothOccupancyGrid.tsx:70`) — when the current week is outside the season, anchor to the season's first upcoming market week (and/or label the week shown).
- **Open questions (user must answer before build):**
  - (Q1) Which season is authoritative for enforcement — legacy `markets.season_start/end`, or the Phase E `market_seasons` rows? (They can differ; the tester had both = Aug 29–Dec 12.)
  - (Q2) Desired behavior for a market with a future season: should weekly booth booking be *blocked entirely* until the season starts, or offer only in-season weeks?
  - (Q3) Markets with NO season set (season_start/end null) must keep today's behavior (next 8 weeks) — confirm.
- **Care:** money-adjacent (booth booking availability). Not a critical-path file, but changes what vendors can book. Add NEW unit tests asserting season-clamped behavior (business-rule = "no operating/bookable date outside the season window").

## Phase 3a — Booth-number reconciliation (Item 3A) — ✅ BUILT 2026-07-11 (gates green tsc0/flow-integrity+2, UNCOMMITTED, **mig 186 NOT applied**)
Decisions: 3-layer model (Q4); taken-booth = fail-loud (manager double-pin already hard-blocked by mig 146, so the "assign anyway" toggle was DROPPED — it would weaken an existing guarantee). Scope = 4 items:
1. **Mig 186** `20260711_186_booth_assign_honor_manager.sql` — CREATE OR REPLACE `book_weekly_booth_atomic` (same signature): layer-2 honors `market_vendors.booth_number`; layer-3 auto-assign now excludes pinned booths; RAISE `BOOTH_TAKEN` (P0008) when a pinned booth is taken that week. `book_season_atomic` (mig 165) loops this fn → inherits it. No table/column change. **USER applies Dev+Staging; Claude never applies.**
2. `book/route.ts` maps `BOOTH_TAKEN` → clear 409 "contact your manager" (no silent reslot).
3. `vendor-booth/route.ts` stale comment fixed (duplicates ARE blocked via mig 146 — the prior "duplicates allowed" note was wrong).
4. `flow-integrity.test.ts` +2 contract tests (RPC excludes pins + honors + raises BOOTH_TAKEN; route maps it).
**Behavioral verification is manual on staging** (SQL RPC — no DB-fixture unit test); a full booth-booking integration test is a reasonable backlog item.
**NEXT:** user applies mig 186 Dev+Staging → Claude does SCHEMA_SNAPSHOT bookkeeping → commit + push staging (explicit go each).

### (original scope)
- Two booth-number sources assign independently: `market_vendors.booth_number` (manager roster) vs `weekly_booth_rentals.booth_number` (auto-assigned at booking).
- **Open question (Q4):** what's the intended source of truth? Options: (a) manager's roster booth# seeds/locks the vendor's rental booth#; (b) surface both explicitly ("assigned booth #1 · this week booked #2") so they're not confused; (c) manager assignment is advisory only and rentals always auto-assign. Needs product intent before code.

## Phase 4 — Dashboard IA + onboarding (Items 1, 7) — **design + build**
- Reorder so Setup leads for a NEW manager (onboarding incomplete); add schedule + season as onboarding-wizard steps.
- **Open questions (Q5):** Setup-first always, or only while onboarding incomplete? (Q6) Add schedule + season to the guided `/onboarding` step sequence (grows the 4-step checklist + `onboarding-progress` gating)?

## Sequencing recommendation
Ship **Phase 1** now (safe quick win). Get answers to Q1–Q6, then do **Phase 2** (highest correctness value) as its own careful change with tests, then Phase 3, then Phase 4.

---

# DECISIONS LOCKED (2026-07-11)

## Cross-cutting principle (applies to EVERY phase) — Explain labels & context
User feedback: most "errors" were really missing explanation of the surface the user is on. TWO deliverables on every surface we touch:
1. **User-facing:** the label/section says what it means and *in what context the feature is used* (e.g., "refund cap" not "cap"; occupancy "this week (Jul 6–12)" not undated; "next 8 in-season weeks"; why a booth is auto- vs manager-assigned).
2. **Code-facing:** add/upgrade comments so the *next reader (incl. Claude) finds the meaning + context on the first pass* — what each label maps to, which table, which flow, why. (This session cost several re-reads that good notations would have prevented.)
Treat this as acceptance criteria, not polish.

## Q1 — authoritative season source = **`markets.season_start/end`**
It's the market-level operating window and is ALREADY enforced for BUYERS via `get_available_pickup_dates()` (`mig 010:59-60`, cascades to cart + is-accepting). `market_seasons` = separate Phase E prepay bundles, NOT an operating window. Phase 2 = make vendor booth booking + manager "next market day" CONSISTENT with the already-live buyer rule. (Lower risk than first thought — aligning to existing behavior, not inventing.)

## Q2 — **Option B** (advance in-season booking)
Weekly picker clamps to `[max(today, season_start) … min(today+8wks, season_end)]`. Future season → offer first in-season weeks now. No season set → keep next-8-weeks (Q3 ✅).

## Q4 — booth # assignment is a **3-layer model matching setup/onboarding**
1. **Off-platform pre-existing vendors** → manager enters them as placeholders in their correct booth #s. (`market_booth_placeholders.booth_number`; auto-assigner already excludes these. ✅ exists.)
2. **On-platform vendors predating the manager's affiliation** → manager invites + **manually assigns them to the booth they already occupy** (`market_vendors.booth_number`). **Their booking must HONOR this manager-assigned #, not auto-assign.**
3. **New on-platform vendors** (invited-and-responded, or self-found) → **automated** booth/spot # assignment like any signup.

**Implications / required changes (money-path RPCs — careful + tests):**
- **(i)** Auto-assigner (`book_weekly_booth_atomic`, mig 144:246-258) currently excludes same-week rentals + placeholders but **NOT `market_vendors.booth_number`** → must also exclude manager-assigned booths so layer-3 vendors don't collide with pinned layer-2 vendors.
- **(ii)** When a booking vendor HAS a `market_vendors.booth_number` (layer 2), the booking must **use that number** instead of auto-assigning (seed/lock). Absent → auto-assign (layer 3).
- **(iii)** Same logic must cover BOTH `book_weekly_booth_atomic` (mig 144) AND the season prepay RPC `book_season_atomic` (mig 165 — NOT yet read; read before building).
- Edge cases to handle: pinned booth already taken that week (double-assignment / conflict), pinned # + tier mismatch, mid-season roster booth# change vs already-booked weeks.
- This is the root cause of tester Item 3A (#1 vs #2): the vendor was layer-2 (manager assigned #1) but the booking auto-assigned #2 because the RPC ignores `market_vendors.booth_number`.

## Q5 — Setup-first **always**; don't change within-screen learning order. "Collapsed by default to save space" allowed **only after onboarding complete** (≈ today's collapse behavior — keep).

## Q6 — **add schedule + season to the onboarding steps** (grows the wizard + `onboarding-progress` gating).
