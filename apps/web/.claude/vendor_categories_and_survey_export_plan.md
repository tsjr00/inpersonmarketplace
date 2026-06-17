# Build Plan — Vendor Product Categories (Phase 1) + Survey Pipeline Completion

**Created:** 2026-06-15 (Session 92 cont.). **Status:** Plan, pre-build. Verified against live code (citations below).
**Design sources:** `vendor_product_categories_concept.md` (locked decisions), `session92_events_mm_growth_research.md` §J.10.

---

## KEY FINDING — Survey pipeline is ~95% built; only EXPORT remains

The "deferred Stages 2–5" note on mig 147 is **stale** — those stages were actually built (Session 84+). Verified live:
- **Generation** (real, not a stub): `cron/surveys/route.ts:340-600` (`generateForMarketDay`) queries `vendor_market_schedules` + `market_vendors` for attended vendors and `order_items` for buyers who picked up, INSERTs `market_surveys` rows, sends in-app + custom-HTML email. Cron scheduling + fire-window logic at `:239-338`.
- **Submission**: `api/surveys/respond/route.ts:32-158` (vendor=auth, buyer=token). Validation `lib/surveys/types.ts:172-230`. Forms `components/surveys/SurveyForm.tsx`. Vendor/buyer list + detail pages exist.
- **Results display**: `SurveyResultsCard.tsx` (full aggregation — response rate, category averages, recent comments) on manager dashboard + admin market page. (Converted to ManagerCard this session.)
- **Email + opt-out**: `lib/surveys/email.ts`; `user_profiles.survey_emails_opted_out` honored.
- **MISSING**: CSV/PDF export of results (no survey export route/component — `export-csv.ts` used elsewhere but not for surveys).

**So "survey completion" = a small build, not a phase.** Frees budget for the vendor-categories work.

---

## PART A — Vendor Product Categories, Phase 1 (Exclusivity Gate)

**Goal:** Keep the *selling* surface exclusive to categories 1 & 2; leave booth-rent open to all (1–4). Vendor-level self-declaration; airtight `sell_eligible` gate at every selling entry point.

### Locked decisions (from concept doc)
- 4 categories: **1** Homemade/Handmade/Homegrown (sell), **2** Hand-finished/Personalized (sell), **3** Personal-design + machine/mass-produced (NO sell), **4** Retail/Resale/Pre-owned (NO sell).
- Strict cat 1 & 2 only for selling. Capture at first interest, before detailed onboarding. No retro-classification of existing vendors. Booth-rent stays open to all.

### A1 — Migration (mig 159)
- `ALTER TABLE vendor_profiles ADD COLUMN production_category TEXT[] NULL` — declared category keys (array; a vendor may declare cat1 + cat2). Keys: `'1'|'2'|'3'|'4'` with element CHECK; labels live in a TS constant.
- `ADD COLUMN sell_eligible BOOLEAN NOT NULL DEFAULT TRUE` — derived (all declared ∈ {'1','2'}). **DEFAULT TRUE grandfathers existing vendors** (no retro-classification). New signups set it explicitly.
- Partial index optional (`WHERE sell_eligible = false`) — small N, skip for now.
- `NOTIFY pgrst`.

### A2 — Qualifying-question front gate (DECIDED 2026-06-15)
- The category question is a **qualifying step at the start of the vendor-interest flow** — asked early (alongside the existing qualifying questions), BEFORE the full vendor application and BEFORE any vendor profile is created.
- **Cat 3/4 are weeded out here.** They do NOT get a partial-access vendor account. If the person is already a buyer, they **stay a buyer** (no vendor role added). They see the block screen (rejection copy), are told they can rent booth space via a market manager, and may apply later if their products change.
- **Cat 1/2 proceed** into the existing vendor application/onboarding; `production_category` is recorded on the `vendor_profiles` row when created (`/api/submit` `:38-150`), `sell_eligible = true`.
- Placement: at the vendor-signup entry (`[vertical]/vendor-signup/page.tsx`), as the first gating question — before the detailed config-driven form (`~:1279`).
- **Consequence for the data model:** since cat 3/4 never create a vendor profile in Phase 1, every created vendor is `sell_eligible = true`. So `sell_eligible` + the A3 gates are a **defense-in-depth backstop** + forward-prep for Option B (Phase 3, where cat 3/4 get lite `sell_eligible = false` accounts). The front gate is the primary mechanism.
- **Block-screen copy (CHOSEN — Option A, 2026-06-15):** "Thanks for your interest in selling with us! Farmers Marketing is built for homemade, handmade, homegrown, and hand-finished or personalized goods that you make yourself. Based on your answers, your products aren't a fit for selling on the platform right now. You can still join a market in person — reach out to a market manager about renting booth space. And if what you make changes down the road, we'd love to have you apply again."

### A3 — Sell-eligible gates (ENFORCEMENT SURFACE — must be airtight)
- **Listing publish** — `api/vendor/listings/[listingId]/publish/route.ts`: extend the profile select at `:67-71` to include `sell_eligible`; add a gate right before the "flip to published" UPDATE at `:152` (after the `allAuthorized` check `:150`): `if (!vendorProfile.sell_eligible) throw traced.validation('ERR_LISTING_GATE', '<booth-rental-only copy>')`. **Verified insertion point.**
- **Market-box create** — `api/vendor/market-boxes/route.ts` POST: same `sell_eligible` check after profile fetch, before tier checks. (Confirm exact line at build.)
- **Event selling** (DECIDED 2026-06-15: category determines event eligibility) — event sales require vendor status, which cat 3/4 won't have, so the front gate already covers it. Add the `sell_eligible` backstop at event-vendor selling entry points (`event_approved` path) as defense-in-depth.
- **Sweep for other selling entry points** — audit for any other "publish/activate a sellable thing" path. Miss one = a slip-through (matters once Option B lite accounts exist).

### A4 — Manager opt-in statement
- Add one statement to `market_optin_statement_catalog` (mig 136) via seed migration: *"I understand my products must remain in supported categories (handmade / hand-finished). If I change to unsupported product types, those listings may be removed without notice."* Accepted at market join (snapshotted in `vendor_market_agreement_acceptances`).

### A5 — Manager onboarding messaging
- Copy: platform is built for cat 1 & 2; you may invite cat 3 & 4 for BOOTH RENTAL (you keep that revenue) but they can't sell — use judgment. (Shared authority + responsibility.)

### Enforcement realism (set expectations, don't over-promise)
Can't auto-detect a "t-shirt" is hand-printed (cat 2 ok) vs 3rd-party-printed (cat 3 banned). Model is layered: vendor-level self-declaration gates selling; item-level drift policed by the clause + manager judgment + admin spot-check + delete-without-warning. No per-item automation.

### Phase A scope estimate
1 migration + signup front-step (1 page + block screen) + 2–3 gate insertions + 1 statement seed + copy. Medium build. Phase 2 (Option C booth-payment-link) and Phase 3 (Option B lite accounts) are SEPARATE, later.

---

## PART B — Survey Pipeline Completion (just the export)

### B1 — Results CSV export (core)
- New route: `GET /api/market-manager/[marketId]/surveys/export` (manager-auth gated, mirrors broadcast/schedule manager-auth pattern) → CSV via existing `lib/export-csv.ts`. Columns: kind, market_date, each rating column, comment, submitted_at, response status. Reuse the `SurveyResultsCard` query shape (`market_surveys` for the market, windowed).
- Admin parity: same export reachable from `/admin/markets/[id]` (or a shared helper).
- "Download CSV" button on `SurveyResultsCard` (only when there's data).
- No migration (data exists).

### B2 — Public market-profile rating badge (OPTIONAL, per §J.10)
- Aggregate rating shown on the public market profile ("manager acquisition + funding numbers" selling point). Separate, optional; defer unless wanted. No schema.

### Phase B scope estimate
B1 = small (one export route + button, reuse export-csv + existing query). B2 = optional add.

---

## Suggested build order
1. **Part B1 (survey CSV export)** first — small, self-contained, no migration, no open decisions. Quick win.
2. **Part A (vendor categories)** — needs the 2 open user decisions first (rejection copy + placement; event-vendor scope). Bigger build.

## Open decisions blocking Part A
- [x] Front-step placement — RESOLVED: qualifying-question front gate at first interest; cat 3/4 weeded out before any vendor account; existing buyers stay buyers; reapply later if products change.
- [x] Event-vendor scope — RESOLVED: category determines event eligibility (event selling requires vendor status; cat 3/4 can't be selling vendors).
- [x] Rejection copy — RESOLVED: Option A (warm & encouraging). Text in A2. **Part A fully unblocked.**
