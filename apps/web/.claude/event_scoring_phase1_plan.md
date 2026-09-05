# Event Scoring Phase 1 — Build Plan (written 2026-09-04, owner: "write it up and add it to backlog")

Source of record: `Market Research/Event scoring/` — Formula v3 + Scoring_Engine_Developer_Handoff_v1
(owner-supplied research, reviewed in full 2026-09-04; assessment in chat). Phase 1 = the
front-loaded cheap wins: denominator typing, food centrality, ranges + confidence, config
layer, calibration capture. Phases 2 (EDS/VMS/gates/vendor-capture weights/FM branch) and
3 (benchmark dual-forecast/sponsored funnel) deferred — this file is Phase 1 only.

## Design rules carried from the handoff (non-negotiable in the build)
- Coefficients live in a versioned CONFIG module, never inline (handoff §3/§22) — matches house no-hardcode rule.
- Missing input NEVER silently becomes zero; null = today's behavior + an assumption note (handoff §21).
- Admin-only display v1 = shadow/advisory mode (handoff §31). Organizer/vendor surfaces UNCHANGED.
- No auto-learning; every displayed number traceable to a config entry with an evidence/assumption note.

## Build items (against current code)

### 1. One additive migration (paste-and-go, inert): `catering_requests` +3 columns
- `population_type TEXT NULL` CHECK IN ('eligible_population','registered','estimated_attendance','counted_attendance') — NULL = legacy/unspecified.
- `food_centrality SMALLINT NULL` CHECK 1..5.
- `actual_attendance INTEGER NULL` — post-event calibration capture (Policy §29; we already capture orders/revenue via order data, attendance is the gap).
All nullable, no backfill, zero behavior change until code reads them.

### 2. Config module: `lib/events/scoring-config.ts` (NEW)
`SCORING_MODEL_VERSION = '1.0.0'` + config objects, each entry carrying an evidence/assumption comment:
- `TURNOUT_FACTORS: Record<population_type, {low, high, note}>` — counted 1.0 · estimated ~0.8 (research worked example) · registered ~0.6 (free-event no-show benchmarks) · eligible_population ~0.2–0.4 (S7 class; deliberately wide) · null → 1.0 (legacy identity). ⚠ STARTING VALUES ARE PROVISIONAL — owner approves the numbers before ship (D1).
- `CENTRALITY_RATES: Record<1|2|3|4|5, {low, high, label}>` — the research's 5/12 · 10/20 · 20/35 · 35/55 · 60/70 table.
- `BUYER_RATES` RELOCATED here from demand-model.ts, VALUES IDENTICAL (owner-approved table survives; demand-model re-exports so no import/test churn).
- `CONFIDENCE_RULES` — v1 simple 3-level derivation (below), not the research's 7-part score.

### 3. `lib/events/demand-model.ts` — three surgical changes
- `estimateOrders` gains an ATTENDANCE STAGE: `attendance = headcount × turnout(population_type)` before the buyer rate. NULL type → factor 1.0 → bit-identical to today.
- Crowd profile + centrality present → band from CENTRALITY_RATES instead of the flat crowd band (D2: crowd-only in v1). NULL centrality → current bands.
- Return shape gains a RANGE: `{ordersLow, orders, ordersHigh}` (band edges already computed, currently collapsed to midpoint) + `confidence: 'high'|'medium'|'low'` + `confidenceReasons: string[]` (organizer-count basis + counted attendance = high; eligible-population or unknown type = low; else medium). Existing `orders` field keeps midpoint semantics so current consumers are UNAFFECTED until updated.

### 4. Intake + admin-create forms — TWO questions, no more (form-bloat rule)
- Next to headcount: "What does this number represent?" (4 plain-language options → population_type). EventRequestForm.tsx + admin create form (EventsAdminPage).
- "How central is food/shopping to this event?" 1–5 with plain labels → food_centrality.
Both optional; skipping = today's behavior.

### 5. Admin surfaces (shadow mode — admin only)
- Viability card (EventsAdminPage detail): capacity + revenue lines show RANGES ("35–65 orders/vendor") + confidence chip with reasons; assumptions list gains turnout/centrality lines + model_version.
- Wrap-up stage detail: "actual attendance" input → PATCH (calibration capture; joins the existing wrap-up actions).

### 6. Tests + guards
- demand-model spec: turnout stage math, centrality override, NULL-inputs = legacy identity (regression pin), range ordering low≤mid≤high, confidence derivation.
- Flow-integrity pin: demand-model imports rates from scoring-config (no literal rate tables outside config); model_version constant exists.

## Owner decisions (block ship, not build start)
- **D1**: turnout factor starting values (proposals above — approve or tweak before they affect a real score).
- **D2**: centrality modulates CROWD profile only in v1 (recommended) or all attendee-paid too?
- **D3**: confirm admin-only display v1 (organizer/vendor surfaces untouched until calibrated).
- **D4**: BUYER_RATES values stay identical in the relocation (recommended; changing them is its own decision).

## Size: 1–2 sessions · 1 migration paste · no money paths · no protected files.
