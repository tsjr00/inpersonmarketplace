# Event Data Gathering + 3-Payment-Model Build-Out — Consolidated Implementation Plan

**Status:** Plan ready for sign-off. No code changes pending approval.
**Migration written:** `supabase/migrations/20260430_128_event_setting_column.sql` (on disk, not applied)
**Supersedes (in part):** `session75_event_data_gathering_plan.md` (kept for reference; this doc is the action plan)

---

## Decisions locked in (recap from conversation)

| Topic | Decision |
|---|---|
| EVT-1 (the form-submit blocker) | Bundle with broader work, not a hotfix |
| Event types | Keep all 6 (`corporate_lunch`, `team_building`, `grand_opening`, `festival`, `private_party`, `other`); render as chip selector matching `preferred_vendor_categories` style |
| Time gathering | Stage 1 required for ALL event types; two `<input type="time">` fields paired with event_date |
| `event_setting` | New TEXT column (Indoor/Outdoor/Either) via migration 128; restore `setup_instructions` to free-text |
| `vendor_count` | Pull `max_headcount_per_wave` from event-approved vendor pool; suggest accordingly; editable; no hardcoded `'2'` |
| Address — Stage 1 | Shown, optional |
| Address — Stage 2 | Required for status to advance to `approved` (admin can't approve without it) |
| Zip — Stage 1 | Shown, **mandatory** in both frontend + API validation |
| Stage 2 editability | `event_type`, `event_start_time`, `event_end_time`, `event_setting` added to ALLOWED_FIELDS |
| Re-match trigger | Manual button + suggestion banner when matching-affecting fields changed |
| Dead form fields (20+ unused FormData entries) | Leave as-is; no audit, no cleanup |
| Hybrid payment model | Backlog; build after attendee_paid + company_paid are clean |
| Admin edit UI for catering_request | Defer |
| EVENT_TYPES constant misuse | Wire to form (currently dead constant) |
| Q-VENDOR-COUNT ratios | Use real vendor pool data; fallback heuristic only when pool empty |

---

## Step 0: migration (already on disk)

**File:** `supabase/migrations/20260430_128_event_setting_column.sql`

```sql
ALTER TABLE catering_requests ADD COLUMN event_setting TEXT NULL;
ALTER TABLE catering_requests ADD CONSTRAINT catering_requests_event_setting_check
  CHECK (event_setting IS NULL OR event_setting = ANY (ARRAY['indoor'::text, 'outdoor'::text, 'either'::text]));
NOTIFY pgrst, 'reload schema';
```

**Application sequence (you run via Supabase SQL Editor):**
1. Apply to **Dev** Supabase project — verify `SELECT event_setting FROM catering_requests LIMIT 1;` returns no error
2. Apply to **Staging** — same verification
3. Apply to **Prod** — same verification

After Dev + Staging applied: I update `MIGRATION_LOG.md` row, `SCHEMA_SNAPSHOT.md` changelog entry, and note `Pending Prod` per CLAUDE.md migration workflow.
After Prod applied: I move file from `supabase/migrations/` to `supabase/migrations/applied/`.

---

## Step 1: events/page.tsx — vendor throughput query

**File:** `apps/web/src/app/[vertical]/events/page.tsx`
**Critical-path?** No

Add a server-side query before the form renders to compute the vertical-scoped average vendor throughput:

```ts
// Compute average max_headcount_per_wave for this vertical's event-approved vendors.
// Used as the basis for vendor_count suggestion in the form.
// Falls back to 30 (platform-wide constant from viability.ts) if pool is empty.
const supabase = await createClient()
const { data: vendorPool } = await supabase
  .from('vendor_profiles')
  .select('profile_data')
  .eq('vertical_id', vertical)
  .eq('status', 'approved')
  .eq('event_approved', true)

let avgVendorThroughput = 30 // fallback
if (vendorPool && vendorPool.length > 0) {
  const throughputs = vendorPool
    .map(v => {
      const er = (v.profile_data as Record<string, unknown>)?.event_readiness as Record<string, unknown> | undefined
      return er?.max_headcount_per_wave as number | undefined
    })
    .filter((n): n is number => typeof n === 'number' && n > 0)

  if (throughputs.length > 0) {
    avgVendorThroughput = Math.round(throughputs.reduce((a, b) => a + b, 0) / throughputs.length)
  }
}
```

Pass `avgVendorThroughput` and `vendorPoolSize` to `<EventRequestForm />` as new props.

---

## Step 2: EventRequestForm.tsx — the big rework

**File:** `apps/web/src/components/events/EventRequestForm.tsx`
**Critical-path?** No

### Props additions
```ts
interface EventRequestFormProps {
  vertical: string
  vendorPreference?: string | null
  avgVendorThroughput: number   // NEW — server-computed from vendor pool
  vendorPoolSize: number         // NEW — used in helper text "based on N event-approved vendors"
}
```

### FormData additions
- Remove hardcoded `vendor_count: '2'` initialization (line 180); replaced by computed default after event_type + headcount are set
- Add to FormData: `event_setting: ''` (was missing)

### Layout changes (Section 0 → Section 5)

**Section 0: About you** (existing — unchanged)
- contact_name *
- company_name + contact_email *

**Section 1: Event basics** (NEW arrangement)
- event_type * (NEW chip selector — see Step 2.1 below)
- event_date + event_start_time + event_end_time * (3-column row, all required)
- headcount * (existing)

**Section 2: Where** (NEW)
- city + state * (existing)
- zip * (NEW input — required)
- address (NEW input — optional, helper text "Recommended; required before event approval")
- event_setting * (Indoor / Outdoor / Either button group — repurposed from current setup_instructions misuse)

**Section 3: Who pays** (NEW arrangement)
- payment_model * (3-button selector; hybrid still hidden for now)
- IF payment_model = `company_paid`: show `company_max_per_attendee_cents` (currently hybrid-only) — optional but recommended

**Section 4: What kind of food** (existing)
- preferred_vendor_categories * (existing chip selector)

**Section 5: Vendor count** (NEW)
- vendor_count * (number input, pre-filled with computed suggestion based on event_type + headcount + avgVendorThroughput)
- Helper text:
  - When pool size > 0: *"Based on {N} {event_type-display} attendees and our {pool size} event-approved vendors with avg throughput of {avgVendorThroughput} orders/30min, we suggest **{X} vendors**. Adjust if needed."*
  - When pool size = 0: *"For a {N}-person {event_type-display}, we suggest **{X} vendors** based on typical events. Adjust if needed."*

### Step 2.1: event_type chip selector

Render `EVENT_TYPES` (existing constant at lines 77-84) as chips matching `preferred_vendor_categories` style:

```tsx
<div>
  <label style={labelStyle}>What kind of event is this? *</label>
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing['2xs'] }}>
    {EVENT_TYPES.map(et => {
      const selected = form.event_type === et.value
      return (
        <button key={et.value} type="button"
          onClick={() => updateField('event_type', et.value)}
          style={{
            padding: `${spacing['3xs']} ${spacing.xs}`,
            borderRadius: radius.full,
            border: `1.5px solid ${selected ? accent : statusColors.neutral300}`,
            backgroundColor: selected ? accent : 'white',
            color: selected ? 'white' : statusColors.neutral600,
            fontSize: typography.sizes.xs,
            fontWeight: selected ? typography.weights.semibold : typography.weights.normal,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}>
          {selected ? '✓ ' : ''}{et.label}
        </button>
      )
    })}
  </div>
</div>
```

### Step 2.2: vendor_count auto-suggestion logic

Add a `useEffect` that recomputes when `event_type` or `headcount` change:

```ts
useEffect(() => {
  if (!form.event_type || !form.headcount) return
  const headcount = parseInt(form.headcount)
  if (isNaN(headcount) || headcount < 1) return

  // Buyer rate inferred from event_type
  let buyerRate = 0.5 // default
  switch (form.event_type) {
    case 'corporate_lunch':
    case 'team_building':
      buyerRate = 1.0  // captive audience
      break
    case 'private_party':
      buyerRate = 0.9  // mostly captive
      break
    case 'grand_opening':
    case 'festival':
      buyerRate = 0.2  // crowd, low conversion
      break
    case 'other':
    default:
      buyerRate = 0.6
  }

  // Wave count from times if known, else default 4 (2hr × 2)
  let numWaves = 4
  if (form.event_start_time && form.event_end_time) {
    const [sH, sM] = form.event_start_time.split(':').map(Number)
    const [eH, eM] = form.event_end_time.split(':').map(Number)
    const minutes = (eH * 60 + eM) - (sH * 60 + sM)
    if (minutes > 0) numWaves = Math.ceil(minutes / 30)
  }

  const estimatedOrders = Math.round(headcount * buyerRate)
  const servicableOrdersPerVendor = avgVendorThroughput * numWaves
  const suggested = Math.max(1, Math.ceil(estimatedOrders / servicableOrdersPerVendor))

  // Only auto-update if user hasn't manually edited
  setForm(prev => prev._vendorCountManuallyEdited
    ? prev
    : { ...prev, vendor_count: String(Math.min(suggested, 20)) })
}, [form.event_type, form.headcount, form.event_start_time, form.event_end_time, avgVendorThroughput])
```

Track `_vendorCountManuallyEdited` flag set by `updateField('vendor_count', ...)` to prevent the effect from overwriting user edits.

### Step 2.3: Validation update

Replace the validation block at lines 206-219:

```ts
if (
  !form.company_name.trim() ||
  !form.contact_name.trim() ||
  !form.contact_email.trim() ||
  !form.event_type ||                    // NEW required
  !form.event_date ||
  !form.event_start_time ||              // NEW required
  !form.event_end_time ||                // NEW required
  !form.headcount ||
  !form.city.trim() ||
  !form.state.trim() ||
  !form.zip.trim() ||                    // KEPT required (now actually rendered)
  !form.event_setting ||                 // NEW required (replaces setup_instructions misuse)
  form.preferred_vendor_categories.length === 0  // NEW — at least 1 category
) {
  setError(t('erf.required_fields', locale))
  return
}

// Validate end > start
const [sH, sM] = form.event_start_time.split(':').map(Number)
const [eH, eM] = form.event_end_time.split(':').map(Number)
if (eH * 60 + eM <= sH * 60 + sM) {
  setError('Event end time must be after start time.')
  return
}
```

Note: `form.address` removed from required validation (Stage 1 optional per decision).

### Step 2.4: Submit body update

Add `event_setting` to the JSON body. Remove the buttons-overwriting-setup_instructions code at lines 446-471. Submit `setup_instructions` as null at Stage 1 (organizer fills it in Stage 2 dashboard).

```ts
body: JSON.stringify({
  ...
  event_type: form.event_type,
  event_setting: form.event_setting,
  setup_instructions: null,  // Stage 2 collects this as free-text
  ...
})
```

### Step 2.5: Hybrid payment model

Stays hidden in `PAYMENT_MODELS` constant (don't expose yet). Hybrid validation block at lines 233-239 stays (dead code, harmless — backlog item Q-HYBRID will reactivate).

---

## Step 3: api/event-requests/route.ts — validation update

**File:** `apps/web/src/app/api/event-requests/route.ts`
**Critical-path?** No

### Required-field validation (replace lines 77-90)

```ts
if (
  !company_name ||
  !contact_name ||
  !contact_email ||
  !event_type ||                       // NEW
  !event_date ||
  !event_start_time ||                 // NEW
  !event_end_time ||                   // NEW
  !headcount ||
  !city ||
  !state ||
  !zip ||                              // NEW
  !event_setting ||                    // NEW
  !preferred_vendor_categories || preferred_vendor_categories.length === 0  // NEW
) {
  return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
}
```

### Validate event_setting value
```ts
if (!['indoor', 'outdoor', 'either'].includes(event_setting)) {
  return NextResponse.json({ error: 'event_setting must be indoor, outdoor, or either' }, { status: 400 })
}
```

### Validate event_type value
```ts
const validEventTypes = ['corporate_lunch', 'team_building', 'grand_opening', 'festival', 'private_party', 'other']
if (!validEventTypes.includes(event_type)) {
  return NextResponse.json({ error: 'Invalid event_type' }, { status: 400 })
}
```

### Validate event time range
```ts
if (event_start_time && event_end_time) {
  const [sH, sM] = String(event_start_time).split(':').map(Number)
  const [eH, eM] = String(event_end_time).split(':').map(Number)
  if (eH * 60 + eM <= sH * 60 + sM) {
    return NextResponse.json({ error: 'event_end_time must be after event_start_time' }, { status: 400 })
  }
}
```

### Pass event_setting to insert
The route already inserts catering_requests with all the listed fields. Add `event_setting` to the insert object (verify by reading the actual INSERT block — UNVERIFIED in this plan; will check during implementation).

---

## Step 4: api/events/[token]/details/route.ts — ALLOWED_FIELDS expansion

**File:** `apps/web/src/app/api/events/[token]/details/route.ts`
**Critical-path?** No

### Add to ALLOWED_FIELDS (lines 21-43)

```ts
const ALLOWED_FIELDS = [
  // existing 21 fields...
  'cuisine_preferences', 'dietary_notes', 'preferred_vendor_categories',
  'total_food_budget_cents', 'per_meal_budget_cents', 'estimated_spend_per_attendee_cents',
  'expected_meal_count', 'budget_notes',
  'beverages_provided', 'dessert_provided', 'competing_food_options',
  'setup_instructions', 'additional_notes', 'vendor_stay_policy',
  'estimated_dwell_hours', 'is_themed', 'theme_description', 'children_present',
  'has_competing_vendors', 'is_ticketed', 'vendor_count',
  // NEW additions
  'event_type',
  'event_start_time',
  'event_end_time',
  'event_end_date',
  'event_setting',
  'address',
  'zip',
  'is_recurring',
  'recurring_frequency',
  'company_max_per_attendee_cents',
  'contact_phone',
]
```

### Add validation for new fields

```ts
if (updateData.event_type !== undefined) {
  const valid = ['corporate_lunch', 'team_building', 'grand_opening', 'festival', 'private_party', 'other', null]
  if (!valid.includes(updateData.event_type as string | null)) {
    throw traced.validation('ERR_EVENT_DETAIL_003', 'Invalid event_type')
  }
}

if (updateData.event_setting !== undefined) {
  const valid = ['indoor', 'outdoor', 'either', null]
  if (!valid.includes(updateData.event_setting as string | null)) {
    throw traced.validation('ERR_EVENT_DETAIL_004', 'Invalid event_setting')
  }
}

// time validation if either provided
if (updateData.event_start_time !== undefined || updateData.event_end_time !== undefined) {
  // fetch existing values to validate cross-field
  // (implementation detail during coding)
}
```

### Detect matching-affecting changes for re-match banner

```ts
const MATCHING_AFFECTING_FIELDS = [
  'event_type', 'event_start_time', 'event_end_time',
  'headcount', 'vendor_count',
  'preferred_vendor_categories', 'cuisine_preferences',
  'children_present', 'event_setting',
]

const matchingAffectingChanged = MATCHING_AFFECTING_FIELDS.some(f => f in updateData)

return NextResponse.json({
  ok: true,
  updated: Object.keys(updateData),
  matchingChanged: matchingAffectingChanged,  // NEW
})
```

### GET response — add new fields to SELECT

Add `event_setting`, `address`, `zip` (already there per line 67), `event_type` (already there), `event_start_time`/`event_end_time` (already there) to the SELECT at lines 65-77.

### Status-block consideration: address required for `approved`

This is enforced server-side in the admin PATCH route (Step 6). The dashboard PATCH does NOT block saves without address — it just makes address available to fill in.

---

## Step 5: OrganizerEventDetails.tsx — dashboard card updates

**File:** `apps/web/src/components/events/OrganizerEventDetails.tsx`
**Critical-path?** No

### EventDetails interface additions
```ts
interface EventDetails {
  // existing fields...
  event_type: string | null         // NEW
  event_start_time: string | null   // NEW
  event_end_time: string | null     // NEW
  event_setting: string | null      // NEW
  address: string | null            // NEW
  is_recurring: boolean             // NEW
  recurring_frequency: string | null // NEW
}
```

### FIELD_GROUPS additions (line 41-62)

Add a new group "Event Basics" at the top:
```ts
{
  label: 'Event Basics',
  description: 'Type, timing, and location — affects vendor matching',
  fields: ['event_type', 'event_start_time', 'event_end_time', 'event_setting', 'address'],
},
```

Insert before "Food Preferences" so it shows first.

Optionally add `is_recurring`, `recurring_frequency` to a new "Series" group, or include in Logistics — TBD during implementation.

### Render UI for new field types

Currently the file has UI for text/number/textarea/checkbox via `startEditing` → `formData` → save flow. Need to add:
- Time input (`<input type="time">`) for event_start_time / event_end_time
- Select for event_type (from EVENT_TYPES)
- Button group for event_setting (Indoor/Outdoor/Either)

These can reuse the existing form field rendering pattern; just add the new types to the field-type detection.

### Re-match banner

After save, if response includes `matchingChanged: true`:
```tsx
{matchingChanged && (
  <div style={bannerStyle}>
    Your changes affect vendor matching. Want to refresh matches now?
    <button onClick={handleRematch}>Refresh matches</button>
    <button onClick={() => setMatchingChanged(false)}>Skip</button>
  </div>
)}
```

`handleRematch` calls `POST /api/admin/events/[id]/rematch` (need to relax auth — see Step 7).

---

## Step 6: admin/events/[id]/route.ts — block approve without address

**File:** `apps/web/src/app/api/admin/events/[id]/route.ts`
**Critical-path?** No

### When admin attempts status='approved'

Add a check before the existing approval logic at line 113:

```ts
if (status === 'approved' && cateringReq.status !== 'approved') {
  // Address required for approval
  if (!cateringReq.address || !cateringReq.address.trim()) {
    return NextResponse.json(
      { error: 'Cannot approve event without an address. Ask organizer to provide one via their dashboard.' },
      { status: 400 }
    )
  }

  const approval = await approveEventRequest(serviceClient, cateringReq)
  // ...
}
```

This is the natural gate per your decision Q-ADDRESS-STAGE2-TRIGGER.

---

## Step 7: admin/events/[id]/rematch/route.ts — allow organizer self-rematch

**File:** `apps/web/src/app/api/admin/events/[id]/rematch/route.ts`
**Critical-path?** No
**UNVERIFIED:** I haven't read the existing rematch route yet. This step is conditional on what's there.

### Plan
1. Read existing route to understand auth/logic
2. Add organizer-can-rematch-own-event branch:
   - If caller is admin: existing logic
   - If caller is organizer of THIS event (organizer_user_id match or contact_email match): allow
3. Update path or add a separate organizer endpoint if cleaner

Alternative: create new endpoint `POST /api/events/[token]/refresh-matches` that calls the same `autoMatchAndInvite` logic. Cleaner separation; admin and organizer have distinct endpoints. Decision during implementation.

---

## Step 8: viability.ts — use event_setting directly

**File:** `apps/web/src/lib/events/viability.ts`
**Critical-path?** No

### Current state
- Inferred indoor/outdoor from `event_type` (corporate = indoor-likely, festival = outdoor-likely) at lines 631-635, 678-680
- Mostly correct but coarse — a corporate team_building can be outdoor (off-site retreat)

### Changes

Add `event_setting` to the `event` parameter on `scoreVendorMatch` (line 565-574):
```ts
event: {
  cuisine_preferences: string | null
  headcount: number
  expected_meal_count: number | null
  vendor_count: number
  event_start_time: string | null
  event_end_time: string | null
  children_present?: boolean
  event_type?: string | null
  event_setting?: 'indoor' | 'outdoor' | 'either' | null  // NEW
}
```

Update deal-breaker logic at lines 631-635:
```ts
// BEFORE:
const quietRequired = ['corporate_lunch', 'team_building', 'private_party']
if (event.event_type && quietRequired.includes(event.event_type)) {
  deal_breakers.push('Loud generator at corporate/private event (quiet inverter required)')
}

// AFTER:
// Indoor events absolutely require quiet generator. Either-setting events require it
// for the indoor option. Outdoor events tolerate standard generators.
const quietRequiredByType = ['corporate_lunch', 'team_building', 'private_party']
const quietRequiredBySetting = event.event_setting === 'indoor' || event.event_setting === 'either'
if (vendor.requires_generator && vendor.generator_type === 'standard') {
  if (quietRequiredBySetting || (event.event_type && quietRequiredByType.includes(event.event_type))) {
    deal_breakers.push('Loud generator at indoor/quiet event (quiet inverter required)')
  }
}
```

Update warning logic at line 678-680:
```ts
// BEFORE:
const outdoorTypes = ['festival', 'grand_opening']
if (vendor.seating_recommended && event.event_type && outdoorTypes.includes(event.event_type)) {
  warnings.push('Weather-sensitive setup at likely outdoor event...')
}

// AFTER:
// Use explicit event_setting first, fall back to event_type inference
const isOutdoorLikely = event.event_setting === 'outdoor'
  || event.event_setting === 'either'
  || (event.event_type && ['festival', 'grand_opening'].includes(event.event_type))
if (vendor.seating_recommended && isOutdoorLikely) {
  warnings.push('Weather-sensitive setup at likely outdoor event — confirm covered space available')
}
```

### event-actions.ts wiring

Pass `event_setting` from the catering_request through to the matching call:

```ts
// In autoMatchAndInvite, add to eventData:
const eventData = {
  cuisine_preferences: request.cuisine_preferences,
  headcount: request.headcount,
  expected_meal_count: request.expected_meal_count,
  vendor_count: request.vendor_count,
  event_start_time: request.event_start_time,
  event_end_time: request.event_end_time,
  children_present: !!request.children_present,
  event_type: request.event_type,
  event_setting: request.event_setting,  // NEW
}
```

And add `event_setting` to the `CateringRequest` interface at lines 19-42.

---

## Step 9: tests

Add to vitest:

1. **`event-request-validation.test.ts`** — POST `/api/event-requests` with various invalid bodies, confirm 400:
   - Missing event_type / event_setting / event_start_time / event_end_time / zip / preferred_vendor_categories
   - Invalid event_type / event_setting values
   - end_time < start_time
   - Valid body → 200

2. **`event-details-allowed-fields.test.ts`** — PATCH `/api/events/[token]/details`:
   - Setting event_type / event_start_time / event_setting / address now succeeds
   - Setting status (not allowed) is silently dropped
   - Response includes `matchingChanged: true` when matching-affecting fields change
   - Response includes `matchingChanged: false` when only notes/budget change

3. **`vendor-count-suggestion.test.ts`** — pure function for the auto-suggestion math (extract from form into a helper):
   - corporate_lunch + 100 + 30 throughput + 4 waves → suggests 1 (100×1.0 / 30×4 = 0.83 → 1)
   - festival + 500 + 30 throughput + 6 waves → suggests 1 (500×0.2 / 30×6 = 0.56 → 1)
   - corporate_lunch + 1000 + 25 throughput + 3 waves → suggests 14 (1000×1.0 / 25×3 = 13.3 → 14)
   - Capped at 20

4. **`event-approval-requires-address.test.ts`** — PATCH admin/events/[id] with status=approved when catering_request.address is null/empty → 400

5. **`viability-event-setting.test.ts`** — `scoreVendorMatch` deal-breaker/warning logic:
   - event_setting='indoor' + standard generator → deal-breaker fires
   - event_setting='outdoor' + standard generator → no deal-breaker
   - event_setting='either' + standard generator → deal-breaker fires (covers indoor portion)
   - event_setting='outdoor' + weather-sensitive vendor → warning
   - event_setting='indoor' + weather-sensitive vendor → no warning

---

## Step 10: ship sequence

Suggested commit groups:

**Commit 1: Migration + schema docs** (after migration applied to Dev + Staging)
- `supabase/migrations/20260430_128_event_setting_column.sql` (already on disk)
- `supabase/MIGRATION_LOG.md` row added with `Pending Prod` note
- `supabase/SCHEMA_SNAPSHOT.md` changelog entry added

**Commit 2: Backend — API validation + ALLOWED_FIELDS + admin gate**
- `src/app/api/event-requests/route.ts` (validation)
- `src/app/api/events/[token]/details/route.ts` (ALLOWED_FIELDS + matchingChanged response)
- `src/app/api/admin/events/[id]/route.ts` (require address for approval)
- `src/app/api/admin/events/[id]/rematch/route.ts` (allow organizer self-rematch)
- Tests for the above

**Commit 3: Frontend — form rework**
- `src/app/[vertical]/events/page.tsx` (vendor throughput query)
- `src/components/events/EventRequestForm.tsx` (new sections, validation, vendor_count auto-suggest, event_type chips, event_setting button group, removed setup_instructions misuse)
- Tests for vendor_count math

**Commit 4: Frontend — dashboard rework**
- `src/components/events/OrganizerEventDetails.tsx` (new field group, new field-type rendering, re-match banner)

**Commit 5: Viability + matching**
- `src/lib/events/viability.ts` (event_setting in scoreVendorMatch)
- `src/lib/events/event-actions.ts` (pass event_setting in autoMatchAndInvite)
- Tests

After commits 1-5: Tier 1 staging smoke (organizer flow end-to-end), then prod push within 9pm-7am CT window.

After Prod migration applied: Commit 6 (housekeeping)
- Move migration file to `supabase/migrations/applied/`
- Update `MIGRATION_LOG.md` with prod date
- Update `SCHEMA_SNAPSHOT.md` "Applied to all 3 envs"

---

## What this plan does NOT include

- Hybrid payment model build-out (deferred to backlog)
- Admin edit UI for catering_request fields beyond status/admin_notes (deferred)
- Auto re-match on Stage 2 update (manual button only per decision)
- Cleanup of dead form fields (deferred per decision — leave as-is)
- Optional backfill of polluted setup_instructions rows (deferred)
- P0-3 event cancellation refund + cleanup (covered by `session75_p0-3_event_cancel_plan.md`, separate work)
- P1-5 refund underpay (separate)
- P1-8 schema regen (separate, awaiting user SQL run)

---

## Pre-implementation verification I'll do

Before each commit, I'll re-verify by reading the actual code at the cited line numbers (per `.claude/rules/cite-or-verify.md`). Specifically:

1. Read `event-requests/route.ts` INSERT block to confirm field list before adding `event_setting`
2. Read `admin/events/[id]/rematch/route.ts` to confirm what auth and logic needs adjusting
3. Re-read `EventRequestForm.tsx` end-to-end before refactoring (file is large; minimize regression risk)
4. Verify `vendor_profiles.profile_data.event_readiness.max_headcount_per_wave` JSON path is correct via a sample query

---

## Files touched (final list)

| File | Change | Critical-path? |
|---|---|---|
| `supabase/migrations/20260430_128_event_setting_column.sql` | NEW migration | No (DB) |
| `supabase/MIGRATION_LOG.md` | Add row | No (doc) |
| `supabase/SCHEMA_SNAPSHOT.md` | Changelog entry + (eventually) regenerate structured tables | No (doc) |
| `src/app/[vertical]/events/page.tsx` | Add vendor throughput query | No |
| `src/components/events/EventRequestForm.tsx` | Major rework | No |
| `src/app/api/event-requests/route.ts` | Validation update | No |
| `src/app/api/events/[token]/details/route.ts` | ALLOWED_FIELDS + matchingChanged | No |
| `src/components/events/OrganizerEventDetails.tsx` | New field group + re-match banner | No |
| `src/app/api/admin/events/[id]/route.ts` | Require address for approval | No |
| `src/app/api/admin/events/[id]/rematch/route.ts` | Allow organizer self-rematch | No |
| `src/lib/events/viability.ts` | Use event_setting | No |
| `src/lib/events/event-actions.ts` | Pass event_setting in matching | No |
| 5 new test files | Coverage | No |

**No critical-path file changes in this plan.** Hybrid build-out (deferred) is the only piece that would touch `checkout/session/route.ts`.

---

## When you sign off

Path forward (assuming sign-off):
1. **You apply migration 128 to Dev** via Supabase SQL Editor
2. Reply: "migration applied to dev"
3. I write Commit 1 contents (MIGRATION_LOG entry + SCHEMA_SNAPSHOT changelog)
4. I implement Commits 2-5 (code changes)
5. Run tests + lint locally
6. Present each critical step (or batch) for your final approval
7. **You apply migration 128 to Staging**
8. We push commits to staging branch via the explicit chain
9. You smoke-test on staging
10. **You apply migration 128 to Prod** + we push to prod within window
11. After prod confirmed: Commit 6 (move migration to applied/)

Sign-off prompts to use:
- *"Plan approved, proceed"* → I start implementation
- *"Modify [section]"* → I revise the section, re-present
- *"Hold on [item]"* → I park that piece, proceed with the rest

---

## Open items I'd still like your call on (small)

### O-1: setup_instructions Stage 1 vs Stage 2
Form's current Indoor/Outdoor button group writes to setup_instructions, polluting it. After this plan, Indoor/Outdoor goes to event_setting. **Should `setup_instructions` (free-text setup notes — power, water, parking) be Stage 1 too, or Stage 2 only?** Recommendation: Stage 2 only. Setup notes are the kind of detail organizers fill in once they've signed up and are thinking through logistics.

### O-2: Phone number Stage 1
`contact_phone` is in FormData and accepted by API but no UI. **Add to Stage 1 (helpful for admin to call), or leave to Stage 2?** Recommendation: Stage 1 optional. Helpful for admin without burdening the organizer.

### O-3: vendor_count cap at 20
`details/route.ts:152` validation caps at 20. Form will too. Anyone planning a 5000-person event needing 30 vendors would hit this. Recommendation: keep 20 for now, add a "contact us for larger events" hint above 20 attempted. Or raise the cap. Your call.
