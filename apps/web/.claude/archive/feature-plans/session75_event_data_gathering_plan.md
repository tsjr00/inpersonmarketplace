# Event Data Gathering & Payment Model Build-Out — Plan

**Status:** Plan, awaiting user decisions on open questions before implementation
**Trigger:** Tester report — organizers cannot submit the event request form. Investigation surfaced a much broader issue: the data flow between the public form, the post-signup dashboard card, and the matching/viability calculations is inconsistent, with critical fields collected nowhere.
**Companion docs:** `events_comprehensive_todo.md` (Session 71), `event_system_audit.md` (Session 68), `events_e2e_review.md`, `event_system_deep_dive.md`

---

## Step 1 — Immediate fix (the actual blocker)

**File:** `src/components/events/EventRequestForm.tsx`
**Bug:** Lines 212 and 215 — frontend validation requires `address` and `zip`, but neither field is rendered. Form is unsubmittable for everyone.
**File:** `src/app/api/event-requests/route.ts:77-90` — backend doesn't require either.

### Fix per user's direction

1. **Render address + zip input fields** in the form (after city/state row at line 444).
2. **Zip is mandatory** in frontend validation. Address remains in validation as required (or relax — see open question Q1).
3. **API also validates zip** — currently doesn't. Add to required-field block at lines 77-90.

This is a small, contained change. Can ship as a separate hotfix-style commit before the broader work below.

---

## Step 2 — Verified system understanding

### The three sources of event data, and what each captures

#### Source A: Public-facing form (`EventRequestForm.tsx`)
The "Quick-Start" intake. Comment at line 393: *"Start with the basics — you can add more details from your event dashboard after signing in."*

**Visible fields** (what users actually see):
- `contact_name` (line 398)
- `company_name`, `contact_email` (lines 404, 410)
- `event_date`, `headcount` (lines 419, 423)
- `city`, `state` (lines 435, 440)
- `setup_instructions` — **misused** as Indoor/Outdoor/Either button group (lines 446-471). The DB column is meant for free-text setup notes.
- `payment_model` — only 2 of 3 options (`company_paid`, `attendee_paid`); hybrid hidden per Session 71 T0-1
- `preferred_vendor_categories` — chips at lines 521-545; joined into `cuisine_preferences` string at submission (line 276)
- `company_max_per_attendee` — shown ONLY when `payment_model === 'hybrid'` (line 497-513), but hybrid is unselectable, so this field is dead UI

**Hidden but defaulted in form state**:
- `vendor_count = '2'` (line 180) — every event request defaults to wanting 2 vendors
- `service_level = 'self_service'` (line 185)
- `cutoff_hours = '24'` (line 186)
- `event_allow_day_of_orders = true` (line 187)
- `vendor_stay_policy = 'vendor_discretion'` (line 188)

**Hidden and always null/empty/false** (no UI, never user-set):
- `event_type` — `EVENT_TYPES` constant defined at lines 77-84 (6 types) but zero render references. Submitted as `null` (line 253).
- `contact_phone`
- `event_end_date`
- `event_start_time`, `event_end_time`
- `expected_meal_count`
- `total_food_budget`, `per_meal_budget`
- `has_competing_vendors`, `competing_food_options`
- `is_ticketed`, `estimated_dwell_hours`
- `children_present`, `is_themed`, `theme_description`
- `estimated_spend_per_attendee`
- `dietary_restrictions`, `dietary_other`, `budget_notes`
- `beverages_provided`, `dessert_provided`
- `additional_notes`
- `is_recurring`, `recurring_frequency`

**Required by validation but not rendered**: `address`, `zip` ← **the active bug**

#### Source B: Post-signup organizer dashboard card (`OrganizerEventDetails.tsx`)
The "Stage 2" — accessed from the organizer's `/dashboard` after signing up via the post-submit email link. Editable when event status ∈ `{new, reviewing, approved, ready}` (line 38, also enforced by `details/route.ts:46`).

**Allowed PATCH fields** (`details/route.ts:21-43`, 21 fields):
- `cuisine_preferences`, `dietary_notes`, `preferred_vendor_categories`
- `total_food_budget_cents`, `per_meal_budget_cents`, `estimated_spend_per_attendee_cents`, `expected_meal_count`, `budget_notes`
- `beverages_provided`, `dessert_provided`, `competing_food_options`
- `setup_instructions`, `additional_notes`, `vendor_stay_policy`, `estimated_dwell_hours`
- `is_themed`, `theme_description`, `children_present`, `has_competing_vendors`, `is_ticketed`
- `vendor_count`

**NOT editable from the dashboard** (you'd have to re-submit or admin edits):
- `event_type`
- `event_date`, `event_end_date`, `event_start_time`, `event_end_time`
- `payment_model`, `service_level`
- `address`, `zip`, `city`, `state`
- `contact_phone`, `contact_name`, `company_name`
- `is_recurring`, `recurring_frequency`
- `company_max_per_attendee_cents`
- `cutoff_hours`, `event_allow_day_of_orders`

#### Source C: Admin event edit (`admin/events/[id]/route.ts`)
Admin PATCH only handles `status` and `admin_notes` (lines 109-110). **No admin UI exists to edit any other catering_request field directly.** If a field is wrong on a live event, admin's only options are SQL or API-via-curl.

### What the calculations actually consume

#### Viability scoring (`calculateViability` at `viability.ts:381`)
**Input shape `EventScoreInput`** (lines 39-53) — 13 fields:

| Field | Form? | Dashboard? | Used for |
|---|---|---|---|
| `event_type` | ❌ never set | ❌ not editable | Product model, deal-breakers, lunch detection, kid bonuses |
| `payment_model` | ✅ visible | ❌ not editable | Product model |
| `total_food_budget_cents` | ❌ never set | ✅ editable | Budget scoring (company_paid only) |
| `per_meal_budget_cents` | ❌ never set | ✅ editable | Budget scoring (company_paid only) |
| `expected_meal_count` | ❌ never set | ✅ editable | Capacity, revenue opportunity |
| `headcount` | ✅ visible | ❌ not editable | Capacity (all models) |
| `vendor_count` | ✅ default '2', no UI | ✅ editable | Capacity, vendor matching |
| `event_start_time` | ❌ never set | ❌ not editable | Wave count, lunch detection, runtime fit |
| `event_end_time` | ❌ never set | ❌ not editable | Wave count, runtime fit |
| `is_recurring` | ❌ never set | ❌ not editable | Strategic value note |
| `is_ticketed` | ❌ never set | ✅ editable | Crowd buyer rate, ticketed bonus |
| `competing_food_options` | ❌ never set | ✅ editable | Buyer rate adjustment |
| `estimated_dwell_hours` | ❌ never set | ✅ editable | Crowd capacity scoring |

**Of 13 viability inputs:**
- 2 reach the calc from the form (payment_model, headcount)
- 6 reach the calc only after dashboard editing (budget x2, expected_meal_count, vendor_count, is_ticketed, competing_food_options, estimated_dwell_hours)
- **5 never reach the calc** (event_type, event_start_time, event_end_time, is_recurring) ← critical gaps

#### Product model determination (`getProductModel` at `viability.ts:133-150`)
Logic:
1. `payment_model = 'company_paid' || 'hybrid'` → `company_paid` model
2. `event_type ∈ ['grand_opening', 'festival']` → `crowd` model
3. `payment_model = 'attendee_paid'` → `attendee_paid` model
4. `event_type ∈ ['corporate_lunch', 'team_building']` → `company_paid` (override)
5. `event_type = 'private_party'` → `attendee_paid`
6. Default → `attendee_paid`

**Without `event_type`:** Steps 2, 4, 5 never trigger. Festival/grand_opening events misclassified as attendee_paid → wrong buyer rates, wrong viability scores. The `crowd` product model is unreachable.

#### Vendor matching (`scoreVendorMatch` at `viability.ts:563-724`, called from `autoMatchAndInvite` at `event-actions.ts:292`)
Uses event-side fields:
- `cuisine_preferences` ✅ from form
- `headcount` ✅ from form
- `expected_meal_count` ❌ defaults to null (uses headcount as fallback)
- `vendor_count` ❌ defaults to '2'
- `event_start_time`, `event_end_time` ❌ never set → wave count defaults to 4 waves of 30min (= 2hr assumed event)
- `children_present` ❌ defaults false → kid-friendly bonuses + alcohol-deal-breaker never fire
- `event_type` ❌ defaults null → quiet-generator deal-breaker, weather-sensitive warnings never fire

#### When does matching run?
**`autoMatchAndInvite` runs IMMEDIATELY** after form submission via `/api/event-requests/route.ts` (UNVERIFIED in this session — assumed from event-actions.ts being called from event-requests POST, need to confirm).

This means: **matching runs on degraded inputs**, then the organizer signs up, then they fill in the richer dashboard data — but matching has already happened. The richer data is not automatically applied to a re-match.

**Re-match exists**: `admin/events/[id]/rematch/route.ts` — admin-only manual trigger.

---

## Step 3 — The Stage 1 / Stage 2 design intent

Per user: *"hide several fields from the form so that we could move the organizer towards setting up an account quickly and then viewing the event details from a dashboard card."*

**Stage 1 (public form)**: minimal commitment, capture enough to show value, push to signup.
**Stage 2 (dashboard card)**: richer data after signup commits the user.

This is a sound design intent. **The execution gap is:**

1. **Stage 1 is currently TOO minimal for matching to work well.** Without `event_start_time/end_time`, every event is treated as a 2-hour event — wave counts, runtime fit, lunch detection, capacity per wave all use wrong assumptions. Without `event_type`, the entire crowd-event product model is unreachable and corporate-event deal-breakers don't fire.

2. **Stage 2 doesn't include the fields that would most improve matching.** event_type, event_start_time, event_end_time aren't in the dashboard PATCH ALLOWED_FIELDS list (`details/route.ts:21-43`). Even after the organizer signs in, these can't be added without admin intervention.

3. **No re-match trigger when Stage 2 fields update.** The dashboard PATCH writes to DB but doesn't fire `autoMatchAndInvite` or `rematch`. So providing better data has no effect on which vendors are invited unless admin manually re-runs.

4. **Some Stage 1 fields are unreachable**: `event_type` is in DB and used by calculations, but no UI surfaces it.

5. **Some "Stage 2" fields exist in form state but never render**: `is_themed`, `theme_description`, `expected_meal_count`, `total_food_budget`, etc. The form component has the state plumbing but no JSX. Dashboard renders these. So the form's dead code is duplicating the dashboard.

---

## Step 4 — Three payment models — what each needs

Per user: *"we want to build out all 3 models and we need to get specific around which data elements we need in what order so that the platform can do the necessary calculations."*

### Model 1 — `attendee_paid` (each attendee buys for themselves)
**Status:** ~95% functional per Session 71 audit
**Calculations:**
- `scoreCapacityAttendeePaid` (viability.ts:256) — needs `headcount`, optionally `expected_meal_count`, `vendor_count`, `eventHours` (from start/end times), and `isLunch` (from start_time)
- `scoreRevenueOpportunity` (viability.ts:328) — needs estimated orders per truck (derived from above)
- Vendor matching (no payment-model-specific logic)
- Buyer rate: 60-80% if lunch hour (11-13), else 30-50%

**Required Stage 1 data (for initial matching):**
- headcount ✓
- vendor_count ✓ (default 2 OK as starting point)
- payment_model ✓
- preferred_vendor_categories → cuisine_preferences ✓
- city, state ✓
- event_date ✓
- **event_start_time + event_end_time** ← MISSING from form
- **event_type** (corporate_lunch / private_party flags affect matching) ← MISSING

**Helpful Stage 2 data (for refined matching):**
- expected_meal_count
- competing_food_options (depresses buyer rate)
- is_ticketed (slight bonus)
- estimated_spend_per_attendee_cents (helps vendor pricing)
- children_present (affects vendor selection)
- has_competing_vendors

**Checkout flow:** standard Stripe checkout (`api/checkout/session`) — no per-event RPC. Wave reservations optional (only if `wave_ordering_enabled`).

### Model 2 — `company_paid` (company sponsors all orders, attendees order via access code)
**Status:** ~60% functional per Session 71 audit; per-attendee cap enforcement was added in migration 119
**Calculations:**
- `scoreCapacityCompanyPaid` (viability.ts:223) — needs `meals` (= expected_meal_count or headcount), `vendor_count`, `numWaves` (from start/end times), `waveDurationMin` (default 30)
- `scoreBudget` (viability.ts:182) — needs total_food_budget OR per_meal_budget + expected_meal_count
- Wave reservation REQUIRED for ordering
- Per-attendee cap enforced via `company_max_per_attendee_cents` (already in DB, enforced in `create_company_paid_order` RPC per migration 119)

**Required Stage 1 data:**
- All of attendee_paid + the items below
- **event_start_time + event_end_time** ← truly required for waves
- **expected_meal_count or total_food_budget** (for budget scoring + capacity)

**Helpful Stage 2 data:**
- per_meal_budget_cents
- budget_notes
- company_max_per_attendee_cents (currently only for hybrid — should also apply to pure company_paid for cost control)

**Checkout flow:**
- Standard cart → /api/events/[token]/order calls `create_company_paid_order` RPC (bypasses Stripe checkout)
- Order tied to `event_wave_reservation`
- Vendor settlement via `event_company_payments` table (admin manual for now per Session 71 T1-4)

**Open gaps from Session 71** still unfixed:
- T1-1: per-attendee cap NOW enforced (migration 119 fixed this)
- T1-2: no company budget validation at order time
- T1-3: fee structure now standard 6.5% + $0.15 (migration 119)
- T1-4: no automated vendor payout for company-paid (admin manual)
- T1-5: orders↔payments link via `event_company_payment_id` (migration 119 added this)

### Model 3 — `hybrid` (company covers up to $X per attendee, attendee pays the rest)
**Status:** ~20% functional, dead end per Session 71 T0-1
**Currently:**
- `payment_model='hybrid'` selectable in form (but PAYMENT_MODELS only shows 2 options — hybrid is hidden by config, kept in DB schema)
- Access code generates ✓
- `company_max_per_attendee_cents` field exists ✓
- `/api/events/[token]/order` rejects hybrid explicitly (line 57: only allows company_paid)
- `/api/checkout/session` has zero hybrid logic
- No RPC for split-payment order creation
- No UI for "company covers $X, you pay the rest"

**To build:**
1. **UI: re-add hybrid to PAYMENT_MODELS** in form (currently commented out)
2. **Show `company_max_per_attendee` field** when hybrid selected (already wired conditionally at form line 497, just needs hybrid to be reachable)
3. **New RPC `create_hybrid_order`** that:
   - Takes line items + reservation
   - Splits each item: `companyPortionCents = MIN(item_price, remaining_cap)`, `attendeeOwesCents = item_price - companyPortionCents`
   - Creates Stripe checkout session for `attendeeOwesCents` total
   - Records company portion against `event_company_payments`
   - Records the order with both portions
4. **Modify `/api/checkout/session`** (CRITICAL-PATH file — needs explicit per-file approval) to handle hybrid: detect hybrid event in cart, reduce charge by company portion, surface "$X covered by company" in UI
5. **Cap-tracking**: same per-attendee cap enforcement as company_paid (already in migration 119)

**Calculations:**
- Use `company_paid` viability model (per `getProductModel` at viability.ts:137: `payment_model === 'hybrid'` returns `company_paid`)
- That's correct — hybrid events behave like company_paid for capacity/budget planning, with attendee covering the overage

**Recommendation:** Build hybrid AFTER the data-gathering issues (Step 5) are resolved, since hybrid amplifies any "missing field for matching" problem.

---

## Step 5 — Recommended data-gathering architecture

### Principle (per user's direction)
- **Stage 1 (public form):** Minimum viable for initial matching. Friction = lost organizers.
- **Stage 2 (dashboard):** Refined data, post-signup commitment.
- **Re-match on Stage 2 update** so richer data improves vendor selection without admin intervention.

### Proposed Stage 1 (public form) — fields to render

**Currently visible (keep):**
1. contact_name
2. company_name + contact_email
3. event_date + headcount
4. city + state
5. preferred_vendor_categories (chips)
6. payment_model (3-button selector — add hybrid back)

**Missing — add to Stage 1:**
7. **address + zip** — fix the bug (per user direction; zip mandatory, address possibly mandatory — Q1)
8. **event_start_time + event_end_time** — needed for matching to work AT ALL (Q2: time-range slider, two time inputs, or single duration slider?)
9. **event_type** — needed for product model + deal-breakers (Q3: keep all 6 from EVENT_TYPES, or simplify to 3-4?)

**Drop from Stage 1 (move to Stage 2 or remove entirely):**
- setup_instructions — currently misused as Indoor/Outdoor enum. Decision needed (Q4).
- All FormData fields that are never user-set today (20+ fields). Either delete from FormData or keep state and add Stage 2 UI.

**Conditional in Stage 1:**
- `company_max_per_attendee` (shown when payment_model = hybrid OR company_paid)

### Proposed Stage 2 (dashboard card) — fields to add

**Currently editable (keep):**
- All current FIELD_GROUPS

**Add to ALLOWED_FIELDS in `details/route.ts` and to FIELD_GROUPS:**
- `event_start_time`, `event_end_time` (Q5: also editable, or fixed at signup?)
- `event_type` (Q5)
- `event_end_date` (multi-day events)
- `is_recurring`, `recurring_frequency`
- `company_max_per_attendee_cents` (was hybrid-only; should be editable for company_paid too)

**Trigger re-match when Stage 2 update materially changes the matching inputs** (Q6: auto re-match on save, or button "Update vendor matches"?)

### Proposed admin event edit — close the gap

Admin PATCH currently only handles status + admin_notes. **For "extenuating circumstances" cases** (organizer can't reach dashboard, fields wrong, etc.), admin should be able to edit any field. **Q7: build a full admin edit UI, or accept SQL/API for now?**

---

## Step 6 — What NOT to delete

Per user: *"don't delete them"* (the existing calculations).

The viability scoring at `src/lib/events/viability.ts` is the right shape. It's just running on degraded inputs. The plan KEEPS:
- `calculateViability`, `getProductModel`, `scoreCapacityAttendeePaid`, `scoreCapacityCompanyPaid`, `scoreCapacityCrowd`, `scoreBudget`, `scoreDuration`, `scoreRevenueOpportunity`, `scoreVendorMatch`, `scoreCuisineMatch`
- All the per-vendor matching logic, deal-breakers, warnings, kid-friendly bonuses
- The `EVENT_TYPES` constant (just needs to be wired to the form)

What the plan ADDS:
- Stage 1 form fields that feed missing inputs
- Stage 2 dashboard fields that feed remaining inputs
- A re-match trigger on Stage 2 updates

What the plan REMOVES:
- The dead `address`/`zip` validation that doesn't render fields (replaced by adding the fields)
- The `setup_instructions` indoor/outdoor enum misuse (Q4)
- 20+ FormData fields that are never user-set (deleted from form state if not added back to UI)

---

## Step 7 — Open questions for user (please answer before code)

### Q1: Address — required or optional?
Your instruction: *"show zip & address fields and make zip code mandatory."* Address rendered, but is address ALSO mandatory, or only zip? Recommendation: zip mandatory (precise location), address optional (organizer can refine later).

### Q2: How to capture event start/end times in Stage 1?
Three UI options:
- (a) Two `<input type="time">` fields (start time + end time)
- (b) One time + duration slider (e.g., 11:00 AM, then "How long? 2hr / 3hr / 4hr / 8hr")
- (c) Common-event presets (Lunch 11-1pm, Lunch 12-2pm, Half-day, Full-day, Custom)

Recommendation: (a) — most flexible, lowest UX risk. Two `<input type="time">` fields with a hint "Start time and end time on event date."

### Q3: Event type — show all 6, or simplify?
Current `EVENT_TYPES`: corporate_lunch, team_building, grand_opening, festival, private_party, other.

These map to product models:
- corporate_lunch / team_building → company_paid (with payment_model override)
- grand_opening / festival → crowd model
- private_party → attendee_paid
- other → defaults

Recommendation: keep all 6. They're not redundant with payment_model — they capture context (corporate vs public vs private) that affects matching beyond who-pays. Group visually: "Private (corporate / team_building / private_party) | Public (grand_opening / festival) | Other".

### Q4: setup_instructions — what to do?
Currently misused as Indoor/Outdoor/Either button group (line 446-471) overwriting a free-text field meant for vendor setup notes.

Options:
- (a) Add a proper `event_setting` column ('indoor' / 'outdoor' / 'either'), use the buttons for that, restore setup_instructions for free-text in Stage 2
- (b) Remove the Indoor/Outdoor buttons entirely; add a single Stage 2 setup_instructions text field for organizer to type
- (c) Keep current misuse but rename the field

Recommendation: (a). Indoor/outdoor genuinely affects vendor matching (weather-sensitive vendors, generator-required vendors). Worth a real column.

### Q5: Are event_type, event_start_time, event_end_time editable in Stage 2 dashboard?
If captured in Stage 1, can the organizer change them later from the dashboard? My recommendation: yes, editable while status ∈ EDITABLE_STATUSES (same gate as other dashboard fields). They're currently NOT in the ALLOWED_FIELDS list — would need to be added.

### Q6: Re-match trigger on Stage 2 updates
When organizer updates Stage 2 fields that affect matching (event_type, expected_meal_count, etc.), should the system:
- (a) Auto re-match silently in the background
- (b) Auto re-match and notify organizer "matches refreshed — N new vendors invited"
- (c) Show a "Update vendor matches" button on the dashboard
- (d) Wait until admin manually triggers via the existing rematch endpoint

Recommendation: (c) — gives organizer control. Some Stage 2 updates are minor (typos, polish) and shouldn't trigger re-invite spam. Others (event_type change, headcount change) genuinely should re-match.

### Q7: Admin edit UI for any catering_request field
Currently admin can only edit status + admin_notes. For "extenuating circumstances" event corrections, do you want a full admin edit UI for catering_requests, or is SQL/API acceptable?

Recommendation: build a minimal admin form covering the fields that organizers can't reach (event_date, payment_model, address, etc.). 1-2 hour build. Defer to later if other priorities outweigh.

### Q8: Hybrid build-out timing
Build hybrid now (alongside the data-gathering fixes), or after data-gathering ships and we verify Stage 1/Stage 2 works for company_paid + attendee_paid first?

Recommendation: data-gathering first. Hybrid amplifies any missing-field problem. Once Stage 1/Stage 2 architecture is solid, hybrid is a smaller incremental build.

### Q9: Stage 1 fields beyond what I listed
I'm proposing Stage 1 = current visible fields + address/zip + start/end times + event_type. Anything else you consider essential for first-touch (before signup)?

### Q10: setup_instructions for vendor — Q4 raised the indoor/outdoor question. Separately, the FREE-TEXT setup_instructions (vendor setup notes) — does that even matter at first touch, or is it always Stage 2?

---

## Step 8 — Suggested ship sequence (after open questions answered)

1. **EVT-1 hotfix** — render address+zip in form, add zip to API validation, verify CI green, ship as standalone commit
2. **Wire Stage 1 missing fields** — add event_start_time, event_end_time, event_type to the form (per Q2/Q3 decisions)
3. **Update API validation** to require new mandatory fields
4. **Update viability calls** to consume the new fields (mostly automatic — they're already in EventScoreInput)
5. **Wire Stage 2 missing fields** — add event_type, event_start_time, event_end_time to ALLOWED_FIELDS in details/route.ts, add to FIELD_GROUPS, add input UI
6. **Add re-match trigger** per Q6 decision
7. **Add `event_setting` column** (per Q4 decision) — migration + form + dashboard
8. **Clean up FormData dead state** — delete fields with no UI in either form or dashboard
9. **Hybrid build-out** (per Q8 decision) — show 3rd payment_model option, RPC, checkout integration
10. **Admin edit UI** (per Q7 decision)

Steps 1-8 keep all existing calculations, fix the missing-input problem, and don't touch the critical-path checkout file. Step 9 (hybrid) touches `checkout/session/route.ts` — needs file-specific approval per critical-path-files rule.

---

## Files that will need changes (anticipated)

| File | Change | Critical-path? |
|---|---|---|
| `src/components/events/EventRequestForm.tsx` | Add fields, fix validation, restore hybrid option, fix EVENT_TYPES wiring, fix setup_instructions misuse | No |
| `src/app/api/event-requests/route.ts` | Update required-field validation | No |
| `src/components/events/OrganizerEventDetails.tsx` | Add new field groups for event_type / start_time / end_time / etc. | No |
| `src/app/api/events/[token]/details/route.ts` | Update ALLOWED_FIELDS, add re-match trigger | No |
| `src/lib/events/event-actions.ts` | Possibly extract a `runMatchingForEvent()` callable from PATCH | No |
| `src/lib/events/viability.ts` | NO CHANGE — calculations are correct, just receive better inputs | No |
| New migration: `event_setting` column on catering_requests | Add column | No |
| `src/app/api/checkout/session/route.ts` | Hybrid checkout split logic | **YES (critical-path)** |
| `src/lib/events/wave-generation.ts` | Possibly: better default wave duration calculation | No |
| New: admin event-edit UI | Build form for admin to edit catering_request fields | No |

---

## What this plan does NOT cover

- The Session 71 backlog items (T0-2 cancel/refund — already covered by `session75_p0-3_event_cancel_plan.md`; T1-4 vendor payout for company-paid; T2-2 wave enforcement at Stripe checkout; etc.)
- Schema regeneration (P1-8 from audit)
- Any non-event audit items
- `pickup_confirmed_at` / `status='fulfilled'` agreement check (raised in P0-3 plan)
- External payment legacy data (per user direction, no new external orders being created; existing flag handles)
