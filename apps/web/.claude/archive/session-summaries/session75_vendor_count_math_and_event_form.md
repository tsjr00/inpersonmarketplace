# Session 75 — Event Form + Vendor Count Math (As Shipped)

**Date:** 2026-04-30 → 2026-05-01
**Status:** Shipped to staging. Pending prod (within 9pm–7am CT window).
**Companion docs:** `session75_event_consolidated_plan.md` (the plan), `session75_event_data_gathering_plan.md` (analysis), this doc (the as-shipped record + math reference).

---

## What shipped

| Commit | Purpose |
|---|---|
| `f236f85b` | Pre-push hook now runs `npm run build` BEFORE Playwright; Protocol 5 updated |
| `3210f64e` | Vertical admin Phase B Batch 2: error-logs + admins compressed mobile rows (B2.0/B2.1/B2.2) |
| `14cf11e7` | Migration 129 — DROP NOT NULL on `catering_requests.address` |
| `8a4a2328` | Vendor count suggestion: layered formula + helper text decoupled |

Plus earlier in the session:
| Commit | Purpose |
|---|---|
| `8a2a5a1f` | Audit batch 1 (P0-1, P0-2, P1-1, P1-3 [later refined], P1-6, P1-7) |
| `c96f3ee9` | Audit batch 2 (P1-2 chargeback dedup) |
| `dad58074` | P1-7 directory rename (`[id]` → `[listingId]` for Next.js slug consistency) |
| `5dea312b` | Event data gathering: form rework + 3-payment-model wiring (Stage 1/Stage 2 design) |
| `eea40abd` | Vercel build hotfix — added `sourceType` to NotificationTemplateData |

---

## The vendor_count formula (6 layers)

Pre-fills the suggestion in the public events form based on event_type + headcount + times + selected cuisines + real vendor pool data.

### Layer 1 — Demand estimation

```
buyerRate by event_type:
  corporate_lunch:    1.0   (captive — everyone eats)
  team_building:      1.0   (captive)
  private_party:      0.9   (mostly captive)
  grand_opening:      0.2   (crowd, low conversion)
  festival:           0.2   (crowd, low conversion)
  other:              0.6   (moderate)

estimatedOrders = headcount × buyerRate
```

### Layer 2 — Event timing → wave count

```
durationMin = event_end_time − event_start_time  (in minutes)
numWaves    = max(1, ceil(durationMin / 30))
```

Both times come from the form; both are required fields. If somehow missing, the suggestion just doesn't compute (UI shows "Pick an event type and headcount above…").

### Layer 3 — Peak load profile (different demand curves per event type)

Lunch crowds compress; festivals spread. Capacity needed at the WORST 30-minute window matters more than total capacity over the event.

```
For CONCENTRATED demand (corporate_lunch, private_party, other):
  // ~50% of orders compress into a single peak 30-min wave
  // (lunch crowd hits like a wave, parties cluster around food drop)
  peakLoadPerWave = estimatedOrders × 0.5

For SUSTAINED demand (team_building):
  // 50% of orders cluster in peak ~25% of event waves
  peakWaves = max(1, ceil(numWaves × 0.25))
  peakLoadPerWave = (estimatedOrders × 0.5) / peakWaves

For SPREAD demand (grand_opening, festival):
  // Foot traffic distributed evenly across all waves
  peakLoadPerWave = estimatedOrders / numWaves
```

### Layer 4 — Capacity-driven vendor count

```
capacityVendors = ceil(peakLoadPerWave / avgVendorThroughput)
```

`avgVendorThroughput` is **computed at form-load** in `events/page.tsx` from the real event-approved vendor pool's `event_readiness.max_headcount_per_wave` JSON field. Falls back to 30 (platform default) if the pool is empty or no vendors have declared throughput.

### Layer 5 — Variety floor (multi-category-aware)

```
categoryVendors = max(1, ceil(numCategoriesPicked / avgCategoriesPerVendor))
                  // when numCategoriesPicked > 0; otherwise 0
```

`avgCategoriesPerVendor` is **computed at form-load** by counting distinct categories per vendor (across their published listings) in the event-approved pool, then averaging. Respects that some vendors cover multiple categories — a vendor with [BBQ, Tex-Mex] satisfies 2 of the organizer's selected categories alone, so we don't blindly suggest 1 vendor per cuisine.

### Layer 6 — Combine

```
suggested = clamp(max(capacityVendors, categoryVendors), 1, 20)
```

Whichever layer is the binding constraint wins. Hard cap at 20 (matches `details/route.ts:152` PATCH validation).

### Worked examples

Assume `avgVendorThroughput = 25`, `avgCategoriesPerVendor = 1.5`:

| event_type | headcount | hours | est | peak/wave | capV | cats | catV | **Suggested** |
|---|---|---|---|---|---|---|---|---|
| corporate_lunch | 85 | 2 (4 waves) | 85 | 43 | 2 | 1 | 1 | **2** |
| corporate_lunch | 85 | 2 | 85 | 43 | 2 | 4 | 3 | **3** |
| corporate_lunch | 200 | 2 | 200 | 100 | 4 | 1 | 1 | **4** |
| team_building | 200 | 4 (8 waves) | 200 | 50 (100/2 peak waves) | 2 | 4 | 3 | **3** |
| private_party | 50 | 3 (6 waves) | 45 | 23 | 1 | 2 | 2 | **2** |
| grand_opening | 200 | 2 | 40 | 10 (40/4) | 1 | 2 | 2 | **2** |
| festival | 500 | 6 (12 waves) | 100 | 8.3 | 1 | 4 | 3 | **3** |
| festival | 5000 | 8 (16 waves) | 1000 | 62.5 | 3 | 5 | 4 | **4** |

For the actual staging-test case that exposed the bug (85-person grand_opening with [Produce, Baked Goods, Pantry, Health & Wellness]):
- est = 85 × 0.2 = 17 orders
- peak/wave = 17 / numWaves (varies; for 2.5hr = 5 waves: 3.4)
- capV = ceil(3.4 / 25) = 1
- catV = ceil(4 / 1.5) = 3
- **Suggested = max(1, 3) = 3 vendors**

(Old formula returned 1; user correctly flagged as wrong because variety wasn't considered.)

### Helper text behavior

- `systemSuggested` is React state, separate from `form.vendor_count`
- Computed by the same useEffect; updates every time inputs change
- `form.vendor_count` pre-fills with `systemSuggested` UNTIL user manually edits
- After manual edit: helper text still reads `systemSuggested`, never `form.vendor_count`
- When user value differs from suggested: appends *"— you're using {N}."*

Helper text shape with pool data:
> *"Based on 85 attendees and 4 cuisines at a grand opening event, balanced against our 12 event-approved vendors (avg 25 orders / 30-min wave, avg 1.5 cuisines per vendor), we suggest **3 vendors**. Adjust if needed."*

When pool empty (fallback):
> *"For an 85-person grand opening event with 4 cuisines, we suggest **3 vendors**. Adjust if needed."*

---

## Stage 1 / Stage 2 design (as shipped)

### Stage 1 — Public events form (`EventRequestForm.tsx`)

**Required fields:**
- contact_name, company_name, contact_email
- event_type (chip selector — 6 types)
- event_date, event_start_time, event_end_time
- headcount (10–5000)
- city, state, zip
- event_setting (Indoor / Outdoor / Either button group)
- payment_model (chip selector — hybrid hidden until built)
- preferred_vendor_categories (≥1)
- vendor_count (auto-suggested via formula above; user can override)

**Optional at Stage 1:**
- address (recommended via helper text; required at Stage 2 to advance to `approved`)

**In FormData but not rendered (intentional dead state, kept for future):**
- contact_phone, expected_meal_count, total_food_budget, per_meal_budget, has_competing_vendors, competing_food_options, is_ticketed, estimated_dwell_hours, children_present, is_themed, theme_description, estimated_spend_per_attendee, dietary_restrictions, dietary_other, budget_notes, beverages_provided, dessert_provided, additional_notes, is_recurring, recurring_frequency, vendor_stay_policy, company_max_per_attendee, cuisine_preferences

These submit as null/false. They get filled in Stage 2 from the dashboard card.

### Stage 2 — Dashboard organizer card (`OrganizerEventDetails.tsx`)

5 field groups (after this session's expansion):

1. **Event Basics** — event_type, event_start_time, event_end_time, event_setting, address, contact_phone (corrections to Stage 1 entries + new fields)
2. **Food Preferences** — cuisine_preferences, dietary_notes, preferred_vendor_categories
3. **Budget** — total_food_budget_cents, per_meal_budget_cents, estimated_spend_per_attendee_cents, expected_meal_count, budget_notes
4. **Event Context** — beverages_provided, dessert_provided, competing_food_options, has_competing_vendors, is_themed, theme_description, children_present, is_ticketed, is_recurring, recurring_frequency
5. **Logistics** — setup_instructions (free-text), vendor_stay_policy, estimated_dwell_hours, vendor_count, additional_notes

Editable while event status ∈ `{new, reviewing, approved, ready}`.

**ALLOWED_FIELDS in `details/route.ts`** — 30 fields. PATCH validation enforces enum values for event_type / event_setting / vendor_stay_policy / recurring_frequency. PATCH also returns `matchingChanged: true` when any matching-affecting field changes (event_type, event_start_time, event_end_time, event_setting, children_present, preferred_vendor_categories, cuisine_preferences, expected_meal_count, vendor_count) so the dashboard can surface a "Refresh matches" banner.

### Re-match flow

Banner appears after a Stage 2 save with `matchingChanged: true`. User clicks "Refresh matches" → POST `/api/events/[token]/refresh-matches`. New endpoint, organizer-auth (organizer_user_id OR contact_email match), calls existing `autoMatchAndInvite` (idempotent — only invites NEW vendors not already in market_vendors).

---

## Migration 129 context

`catering_requests.address` was created NOT NULL in migration 070. The Stage 1/Stage 2 split made address OPTIONAL at Stage 1, but the schema still rejected null. Form 500'd on submit with PostgreSQL code 23502.

Migration 129: `ALTER TABLE catering_requests ALTER COLUMN address DROP NOT NULL`. No data backfill needed (existing rows non-null). Applied to Dev + Staging 2026-05-01. Pending Prod.

The mandatory-at-Stage-2 enforcement happens at `admin/events/[id]/route.ts:113-122` — admin PATCH that sets status='approved' is blocked when address is null/empty. Returns: *"Cannot approve event without a street address. Ask the organizer to add one via their dashboard."*

For self-service auto-approval (event-requests POST), the route at line 263-267 has its own guard: skips the auto-approval block when address is missing. Event stays in `new` status until address is filled in via dashboard or admin intervention.

---

## Process improvements (Protocol 5 + pre-push hook)

### What broke
Late-Apr 2026: commit `8a2a5a1f` introduced `d.sourceType` reference in `notifications/types.ts` template, but didn't add `sourceType` to the `NotificationTemplateData` interface. `tsc --noEmit` (per Protocol 5) accepted it. Vercel's stricter `next build` rejected it. Vercel built nothing for 4 days. Staging served `c490c4bf` while we ran "smoke tests" thinking we were validating new fixes.

### What's now in place
- **`.husky/pre-push`** runs `npm run build` BEFORE Playwright (with `set -e` so build failure blocks Playwright + push). Closes the gap.
- **PROCESSES_AND_PROTOCOLS.md Protocol 5** updated:
  - `npm run build` is REQUIRED for any commit touching types, component props, template interfaces, shared module exports
  - `tsc --noEmit` demoted to optional sanity check
  - Documents the late-Apr incident
  - Adds rule: *"after staging push, verify Vercel BUILD STATUS, not just origin ref-update — the push reaching origin is necessary but not sufficient"*

### Verified — first push under the new gate (`8a4a2328`) ran the gate cleanly. Nothing broken. Gate cost: ~30-60s for build + ~2 min for Playwright. Acceptable for the infrequent push cadence.

---

## B2 batch (vertical admin mobile rows)

| File | Mode | Per-row content |
|---|---|---|
| `error-logs/page.tsx` | state-toggle (onClick) | title=error_code, status=severity chip, secondary=route + count + last_seen, tap toggles detail panel |
| `admins/page.tsx` | action-mode (rightAction) | title=display_name or email, status=role chip (Chief Admin / Admin), secondary=email + added date, rightAction=Remove button (when allowed) or "(You)" italic for self |
| `AdminMobileRow.tsx` | (component) | Now supports onClick + selected props for state-toggle mode (renders as `<button>` with optional highlight) |

JSX structure for admins/page.tsx had a stray opening `<div>` from incomplete pre-Session-75 work. Properly closed and balanced this session.

---

## What's pending after this batch

| Item | Status |
|---|---|
| Vercel build for `8a4a2328` | ✅ Green (verified by user) |
| Tier 1 staging smoke | In progress (user testing) |
| Prod push | After smoke clean + within 9pm-7am CT window |
| Migration 128 + 129 to Prod | Apply BEFORE prod code push (else 500s) |
| `m.event_end_date` phantom column | Backlog (Priority 0.5 — see backlog.md) |
| P1-8 schema regen (REFRESH_SCHEMA.sql) | Pending user SQL run; structured tables ~5 migrations stale |
| P0-3 event cancellation refund + cleanup | Separate plan (`session75_p0-3_event_cancel_plan.md`); not yet shipped |

---

## Files modified this session — final list

**New files:**
- `supabase/migrations/20260430_128_event_setting_column.sql`
- `supabase/migrations/20260501_129_catering_requests_address_optional.sql`
- `apps/web/src/app/api/events/[token]/refresh-matches/route.ts`
- `apps/web/src/app/api/vendor/listings/[listingId]/publish/route.ts`
- `apps/web/.claude/session75_codebase_audit.md` (NOT committed — local working doc)
- `apps/web/.claude/session75_fix_proposals.md` (NOT committed)
- `apps/web/.claude/session75_p0-3_event_cancel_plan.md` (NOT committed)
- `apps/web/.claude/session75_event_data_gathering_plan.md` (NOT committed)
- `apps/web/.claude/session75_event_consolidated_plan.md` (NOT committed)
- `apps/web/.claude/session75_vendor_count_math_and_event_form.md` (this file — NOT committed)

**Modified files (all committed):**
- `apps/web/src/components/events/EventRequestForm.tsx` (major rework — both 5dea312b + 8a4a2328)
- `apps/web/src/components/events/OrganizerEventDetails.tsx` (Event Basics group + refresh-matches banner)
- `apps/web/src/app/[vertical]/events/page.tsx` (vendor pool queries for throughput + categories per vendor)
- `apps/web/src/app/api/event-requests/route.ts` (validation + event_setting + self-service address gate)
- `apps/web/src/app/api/events/[token]/details/route.ts` (ALLOWED_FIELDS + matchingChanged response)
- `apps/web/src/app/api/admin/events/[id]/route.ts` (require address for approve)
- `apps/web/src/app/api/events/[token]/my-order/route.ts` (P0-1 phantom column fix)
- `apps/web/src/app/api/cron/expire-orders/route.ts` (P0-2 source_transaction)
- `apps/web/src/app/api/cart/items/route.ts` (P1-1 cart cross-event isolation for market boxes)
- `apps/web/src/lib/stripe/webhooks.ts` (P1-2 chargeback dedup)
- `apps/web/src/lib/stripe/market-box-payout.ts` (P1-3 enrichment)
- `apps/web/src/lib/notifications/types.ts` (P1-3 + Vercel hotfix)
- `apps/web/src/lib/events/viability.ts` (event_setting in scoreVendorMatch)
- `apps/web/src/lib/events/event-actions.ts` (event_setting in CateringRequest + matching)
- `apps/web/src/components/events/OrganizerEventDetails.tsx` (P1-6 lint fix + Event Basics expansion)
- `apps/web/src/app/[vertical]/vendor/listings/PublishButton.tsx` (P1-7 — fetch new API instead of direct Supabase)
- `apps/web/src/app/[vertical]/admin/admins/page.tsx` (B2.2 finished)
- `apps/web/src/app/[vertical]/admin/error-logs/page.tsx` (B2.1)
- `apps/web/src/components/admin/AdminMobileRow.tsx` (B2.0)
- `apps/web/.claude/backlog.md` (m.event_end_date item added)
- `supabase/migrations/MIGRATION_LOG.md`
- `supabase/SCHEMA_SNAPSHOT.md`
- `.husky/pre-push`
- `PROCESSES_AND_PROTOCOLS.md`
