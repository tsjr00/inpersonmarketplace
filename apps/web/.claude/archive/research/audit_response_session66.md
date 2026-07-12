# Audit Response — Session 66
**Date:** 2026-03-31
**Status:** Research complete — no code changes made

---

## C-1: Children Present — Additional Variables Beyond Smells

### Current State
`children_present` is only used once in the codebase: `viability.ts:618` checks `vendor.strong_odors && event.children_present` as a deal-breaker. This is one filter out of many that should exist.

### Variables That Should Factor In When Children Are Present

**Deal-Breakers (should exclude vendor):**
| Variable | Why | Where Data Exists |
|----------|-----|-------------------|
| Strong odors | Already implemented | `event_readiness.strong_odors` |
| Loud standard generator at children's event | Noise is more disruptive for young children | `event_readiness.generator_type === 'standard'` — currently only filtered for corporate/private events, not children's |
| Alcohol/beverage vendors | Age-restricted products inappropriate | FT has "Beverages" category, FM has no alcohol category — but no `serves_alcohol` flag exists |

**Warnings (flag but don't exclude):**
| Variable | Why | Where Data Exists |
|----------|-----|-------------------|
| Immediate-perishability food at long event | Food safety risk amplified for children | `event_readiness.food_perishability === 'immediate'` + `eventHours >= 4` — currently a deal-breaker, appropriate |
| Sharp/fragile display items (FM) | Injury risk at children's height | No field exists — FM categories Art & Decor, Home & Functional could contain sharp/breakable items |
| Allergen-heavy menu without labeling | Children more vulnerable to allergic reactions | `listing_data.contains_allergens` exists per-listing but is NOT checked during vendor matching |

**Opportunities (positive match for children):**
| Variable | Why | Where Data Exists |
|----------|-----|-------------------|
| Desserts & Sweets category (FT) | Kid-friendly | Listing category field |
| Baked Goods category (FM) | Kid-friendly | Listing category field |
| Family-friendly theme alignment | Vendor's items match event theme | `is_themed` + `theme_description` + vendor categories |

### Vendor-as-Organizer Email Check

**Verified working as designed.** The check at `event-requests/route.ts:118-134`:
- Checks `vendor_profiles.profile_data->>email` against `contact_email`
- Scoped to the event's vertical only (`.eq('vertical_id', verticalId)`)
- Case-insensitive (`ilike`)
- A vendor CAN use a different email to request an event — this is the desired behavior
- Secondary safety net in `event-actions.ts:221` skips the vendor during auto-matching if emails match

**Cross-vertical note:** A vendor in `food_trucks` can request an FM event with the same email — the check is per-vertical. This is likely acceptable since they're separate verticals with separate vendor profiles.

**Self-service missing field (from C-1 original finding):** `contact_email` is NOT in the self-service `requestData` object (`event-requests/route.ts:234-252`). This means the secondary safety net in `autoMatchAndInvite` is bypassed for self-service events. The primary check (lines 118-134) still works because it runs before auto-approval.

---

## C-2: Make Prep Reminder Work for Both Verticals

### Current Problem
`expire-orders/route.ts:1993`: `{ vertical: 'food_trucks' }` hardcoded.

### Fix
Change line 1993 from:
```typescript
}, { vertical: 'food_trucks' })
```
To:
```typescript
}, { vertical: event.vertical_id || 'food_trucks' })
```

The `event` object at this point is from `catering_requests` which includes `vertical_id` (selected at line 1955 but not in the select list). Need to add `vertical_id` to the select at line 1955:
```typescript
.select('id, market_id, event_date, company_name, event_start_time, headcount, vertical_id')
```

Also need to adjust notification language per vertical — the `event_prep_reminder` template in `notifications/types.ts` should use vertical-aware terms (vendor vs food truck, items vs menu, etc.).

---

## C-3: Event-Specific Dedup for Gap Alerts

### Current Problem
`expire-orders/route.ts:2178-2186`: Dedup checks for ANY `event_vendor_gap_alert` in 48hr, not THIS event.

### Fix
The notification's `action_url` should include the event ID, and the dedup should filter by it:
```typescript
// Current (too broad):
.like('action_url', `%/admin/events%`)

// Fixed (event-specific):
.like('action_url', `%/admin/events?id=${event.id}%`)
```

Also ensure the `sendNotification` call passes an `action_url` that includes the event ID:
```typescript
await sendNotification(admin.user_id, 'event_vendor_gap_alert', {
  vendorName: event.company_name || 'Unknown Event',
  pickupDate: eventDateFmt,
  quantity: accepted,
  pendingOrderCount: requested,
  eventId: event.id,  // for dedup
}, { vertical: event.vertical_id })
```

The notification type definition should generate `actionUrl` with the event ID.

---

## C-4: Atomic Threshold Check — Prevent Duplicate Emails

### Current Problem
`respond/route.ts:349-410`: Two concurrent vendor acceptances both read market_vendors, both determine threshold met, both send organizer email. The `.eq('status', 'approved')` prevents double status update but not double email.

### Fix
Use a conditional update as the gate — only proceed with email if the update actually changed a row:

```typescript
const { data: updated, count } = await serviceClient
  .from('catering_requests')
  .update({ status: 'ready' })
  .eq('id', cReq.id)
  .eq('status', 'approved')
  .select('id')

// Only send email if THIS request was the one that changed the status
if (updated && updated.length > 0) {
  // Send the results email — guaranteed only one sender
}
```

The key is making the email conditional on the update succeeding, not on the count check. Only one concurrent request will successfully update `status` from `approved` to `ready` — the other will match 0 rows and skip the email.

---

## C-5 + H-1: Root Cause — Duplicated Approval Logic + Schedule Error

### Root Cause
Three files contain identical event approval logic (token generation + market creation + schedule creation):
1. `event-actions.ts:approveEventRequest()` (lines 65-129) — shared function
2. `admin/events/[id]/route.ts` (lines 112-173) — DUPLICATES instead of calling shared function
3. `admin/events/route.ts` (lines 289-331) — ALSO DUPLICATES

All three have the same bug: `market_schedules.insert()` is awaited but the error is never checked. If the insert fails, the event appears approved but has no schedule — buyers can't add items to cart.

### What Breaks When Schedule is Missing
1. `get_available_pickup_dates()` joins `market_schedules` — returns 0 rows → no pickup dates
2. `validate_cart_item_schedule()` calls the above — returns FALSE → cart add fails
3. Shop page shows vendors but "Add to Cart" fails silently
4. Vendor appears committed but no orders can be placed

### Remediation Plan

**Phase 1:** Fix the error handling in `event-actions.ts:approveEventRequest()`:
```typescript
const { error: scheduleError } = await serviceClient.from('market_schedules').insert({...})
if (scheduleError) {
  console.error('[event-actions] Failed to create market schedule:', scheduleError)
  return { success: false, error: 'Failed to create market schedule' }
}
```

**Phase 2:** Replace the 62-line duplication in `admin/events/[id]/route.ts` with a call to `approveEventRequest()`:
```typescript
if (status === 'approved' && cateringReq.status !== 'approved') {
  const approval = await approveEventRequest(serviceClient, cateringReq)
  if (!approval.success) {
    return NextResponse.json({ error: approval.error }, { status: 500 })
  }
  updates.event_token = approval.event_token
  updates.market_id = approval.market_id
}
```

**Phase 3:** Do the same for `admin/events/route.ts` (the POST route).

**Result:** 62 + 42 lines removed, replaced with ~10 lines each. Bug fixed once, applies everywhere.

---

## H-2: Timezone Standardization

### Current State
| File | Pattern | Timezone Used | Risk |
|------|---------|--------------|------|
| `get_available_pickup_dates()` | `NOW() AT TIME ZONE market.timezone` | Market timezone | Correct |
| `expire-orders/route.ts` (most phases) | `new Date().toISOString().split('T')[0]` | UTC | Inconsistent with SQL |
| `event-requests/route.ts:99` | `new Date(event_date + 'T00:00:00')` | Server local | Wrong |
| `cancel/route.ts:101` | `new Date(event_start_date + 'T00:00:00')` then `Date.now()` | Mixed local/UTC | Wrong |
| `admin/events/[id]/route.ts:161` | `new Date(event_date + 'T00:00:00')` then `getUTCDay()` | Local parse, UTC day | Inconsistent |

### Fix
The SQL function is the gold standard — it uses market timezone consistently. All JavaScript date comparisons should either:
1. Use UTC explicitly (`+ 'T00:00:00Z'` with the Z suffix), or
2. Query the market's timezone and convert

For cron Phases 14-15, the safest fix is comparing in UTC:
```typescript
const todayUTC = new Date().toISOString().split('T')[0]
// event_date is stored as DATE (no timezone) — treat as UTC for comparison
.lte('event_date', todayUTC)
```

For the late cancellation check in cancel/route.ts, use the event's timezone if available, or default to CT:
```typescript
const tz = 'America/Chicago' // or from market.timezone
const eventDateMs = new Date(`${market.event_start_date}T00:00:00`).getTime()
// Adjust for timezone offset if needed
```

---

## H-3: Settlement Includes Unfulfilled Orders — Is This Intentional?

### Finding: YES, This Is Intentional Design

The settlement report at `settlement/route.ts` is a **projection report**, not a payment execution tool:
- Line 268: Each order has a `fulfilled: !!item.pickup_confirmed_at` boolean
- Line 307: `totalFulfilledOrders` counted separately
- Both fulfilled and pending contribute to payout calculation

**Why it's intentional:** Payment occurs at checkout (Stripe charges immediately). The vendor's payout is based on what was sold, not what was picked up. If a buyer paid but didn't pick up, the vendor still earned that revenue. The settlement shows the admin the full picture with fulfillment status visible.

**Recommendation:** No change to the filter. But add a **clear label** in the settlement UI: "Projected payout (includes X unfulfilled orders)" so the admin knows the numbers aren't all final.

---

## H-4 + H-5: FT Language in FM Events

### Locations Found (8 total)

| # | File | Line | Current Text | Needs |
|---|------|------|-------------|-------|
| 1 | `expire-orders/route.ts` | 1993 | `vertical: 'food_trucks'` | Use `event.vertical_id` |
| 2 | `expire-orders/route.ts` | 2108 | `"food trucks interested"` (Phase 12 subject) | Vertical-aware noun |
| 3 | `expire-orders/route.ts` | 2113 | `"food trucks have"` (Phase 12 body) | Vertical-aware noun |
| 4 | `respond/route.ts` | 380 | `"food trucks interested"` (instant threshold subject) | Vertical-aware noun |
| 5 | `respond/route.ts` | 386 | `"food trucks have"` (instant threshold body) | Vertical-aware noun |
| 6 | `events/[token]/select/route.ts` | 273 | `companyName: 'Your event is confirmed!'` (notification) | Use actual event name |
| 7 | `events/[token]/select/route.ts` | 333 | Subject uses "food truck" | Vertical-aware noun |
| 8 | `events/[token]/select/route.ts` | 339 | Body uses "food truck" | Vertical-aware noun |

### Fix Pattern
Each location already has `isFM` or `event.vertical_id` available. Replace hardcoded "food truck(s)" with:
```typescript
const vendorNoun = isFM ? 'vendor' : 'food truck'
const vendorNounPlural = isFM ? 'vendors' : 'food trucks'
```

---

## H-6: Privacy Model — Default to Private

### Current Inconsistency
- Auto-invite (`event-actions.ts:324`): `companyName: 'Private Event'` — identity hidden
- Manual invite (`invite/route.ts:171`): `companyName: cateringReq.company_name` — identity disclosed
- Market name (`event-actions.ts:81`): `"CompanyName Pop-Up Market"` — always includes name in DB

### Fix
1. Auto-invite: Keep `'Private Event'` — correct
2. Manual invite: Change to `'Private Event'` for consistency
3. Market name: Consider using generic name for vendor-facing display, keep company name in `catering_requests` only
4. Vendor event GET API: Already hides company_name (comment at `vendor/events/[marketId]/route.ts:173`) — correct

The market name in the DB is used on the event info page and admin UI where disclosure is appropriate. For vendor-facing notifications, always use `'Private Event'`.

---

## H-7: N+1 Query — Root Cause and Fix

### Current State (Verified)
`[vertical]/events/[token]/page.tsx:63-118` loops through vendors with per-vendor queries:
- Query 1: `event_vendor_listings` with embedded `listings` (per vendor)
- Query 2: `listings` fallback if no event_vendor_listings found (per vendor)
- Total: 3 baseline + up to 2N queries for N vendors

### Comparison to Shop API (The Working Pattern)
`api/events/[token]/shop/route.ts:98-139` does it right:
- 1 batch query for all `event_vendor_listings` (line 98-102)
- 1 batch query for all `listings` by ID (line 109-114)
- Group by vendor in JavaScript
- Total: 6 constant queries regardless of vendor count

### Session 65/66 History
This page was the source of the PostgREST FK ambiguity issue in Session 65. The shop API was built to avoid the ambiguity by using separate queries instead of embeds. The info page still uses the embed at line 52 (`vendor_profiles:vendor_profile_id`), which works but is fragile with `replaced_vendor_id` FK on `market_vendors`.

### Fix Plan
Rewrite the vendor loop to match the shop API pattern:
1. Batch-fetch all `event_vendor_listings` for the market in one query
2. Batch-fetch all `listings` by collected IDs in one query
3. Group by vendor in JavaScript
4. Avoid PostgREST embed on `market_vendors` (use separate vendor_profiles query)

This is the same pattern already proven in the shop API — copy the approach, not the code.

---

## H-8: Prices Exposed to Unauthenticated Users

### Current State
`api/events/[token]/shop/route.ts` is a public endpoint (no auth check). It returns `price_cents` for all listings at line 122. The frontend hides prices for logged-out users, but the API data is accessible.

### Fix
Filter `price_cents` from the response when the request is unauthenticated:

```typescript
// At the top of the handler, check auth (optional — don't block)
const supabaseAuth = await createClient()
const { data: { user } } = await supabaseAuth.auth.getUser()
const isAuthenticated = !!user

// In the listing mapping, conditionally include price
allListingMap[l.id] = {
  id: l.id,
  title: l.title,
  description: l.description,
  price_cents: isAuthenticated ? l.price_cents : null,
  primary_image_url: ...,
  quantity: isAuthenticated ? l.quantity : null,
  unit_label: ...,
}
```

This makes the API consistent with the UI intent — prices are server-side hidden, not just client-side hidden.

---

## M-1: Rapid Double-Click on Add to Cart

### Current Problem
Shop page `addVendorToCart()` uses `setAddingToCart(vendorId)` as a guard, but React state updates are async. Two rapid clicks can both enter before state updates.

### Fix Using Existing Pattern
Use a ref (like checkout does at `checkout/page.tsx:47`):
```typescript
const isSubmittingRef = useRef(false)

async function addVendorToCart(vendorId: string) {
  if (isSubmittingRef.current) return
  isSubmittingRef.current = true
  // ... existing logic ...
  isSubmittingRef.current = false
}
```

This is the same pattern the checkout page already uses (`isSubmittingRef` at line 47). No new components needed.

---

## M-2: Division by Zero on vendor_count

### Fix
Add a guard at the top of `autoMatchAndInvite`:
```typescript
if (!request.vendor_count || request.vendor_count < 1) {
  return { success: false, invited: 0, matched: 0, error: 'vendor_count must be at least 1' }
}
```

**Reasoning:** The frontend already defaults to 2 and clamps to 1-20, but the backend function should not trust frontend validation. Division by zero produces `Infinity` which propagates to notification data.

---

## M-3: Wrong Field in Notification

### Problem
`cancel/route.ts:154`: `eventDate: market.name` — sends event name where date is expected.
Same issue in `respond/route.ts:330`: `eventDate: market.name`.

### Fix
Both should use `market.event_start_date` (which is the event date from the markets table):
```typescript
eventDate: market.event_start_date || market.name,
```

The notification template `catering_vendor_responded` uses `eventDate` in its message template. The current code sends "Chef Prep Pop-Up Market" where "2026-04-11" is expected.

---

## M-4: Late Cancellation Not Persisted

### Fix
Insert into `vendor_quality_findings` (the table already exists per the cron quality check system):
```typescript
if (isLateCancellation) {
  await serviceClient.from('vendor_quality_findings').insert({
    vendor_profile_id: vendorProfile.id,
    finding_type: 'late_event_cancellation',
    severity: 'high',
    description: `Cancelled event ${marketId} within 72hr window. Hours until event: ${Math.round(hoursUntilEvent)}`,
    market_id: marketId,
  }).catch(err => console.error('[late-cancel] Failed to persist finding:', err))
}
```

**Reasoning:** The `vendor_quality_findings` table is already used by the cron quality check system. This keeps all vendor quality data in one place.

---

## M-5: replaced_vendor_id Missing FK Constraint

### Fix
Add migration:
```sql
ALTER TABLE market_vendors
  ADD CONSTRAINT fk_market_vendors_replaced_vendor
  FOREIGN KEY (replaced_vendor_id)
  REFERENCES vendor_profiles(id)
  ON DELETE SET NULL;
```

**Reasoning:** `ON DELETE SET NULL` is the safest option — if a vendor profile is deleted, the replaced_vendor_id becomes NULL rather than blocking the delete or cascading. The data is historical context ("who was replaced"), not an active relationship.

---

## M-6: Item Cap — Two Sources of Truth

### Current State
- API validates: FT 4-7 items, FM 1+ items (`respond/route.ts:87-107`)
- UI enforces: FT max 7 (`page.tsx:163`: `vertical !== 'food_trucks' || next.size < 7`)

### Fix
Move the cap values to the vertical config and read them in both places:

**In vertical config** (e.g., `vertical/configs/food-trucks.ts`):
```typescript
event_item_min: 4,
event_item_max: 7,
```

**In vertical config** (e.g., `vertical/configs/farmers-market.ts`):
```typescript
event_item_min: 1,
event_item_max: null, // unlimited
```

**API** reads from config instead of hardcoding. **UI** reads from API response (add `event_item_min`/`event_item_max` to vendor event GET response).

**Reasoning:** Single source of truth. Adding a new vertical doesn't require code changes in two places.

---

## M-7: Hardcoded Notification Name — Privacy Impact?

### The Code
`select/route.ts:273`: `companyName: 'Your event is confirmed!'` sent to selected vendors.

### Privacy Assessment
This is NOT a privacy violation — it's a UX issue. The vendor already knows the event exists (they accepted it). The hardcoded string is a missed variable substitution, not an intentional privacy measure.

### Impact
Vendors receive "Your event is confirmed!" as the company name in their notification, which is confusing if they're managing multiple events. They can't tell which event was confirmed.

### Fix
Use the event name, which vendors have already seen on their event detail page:
```typescript
companyName: market.name || 'Your event',
```

This is consistent with the privacy model (market.name is already visible to accepted vendors).

---

## M-8: Race Condition on Select Submission

### Fix
The server-side validation at line 207 (`selected_vendor_ids.length > event.vendor_count`) is correct but could be bypassed by concurrent requests. Add a conditional update:

```typescript
// Only update if status is still 'approved' or 'ready' (prevents double-submit)
const { data: updatedEvent, count } = await serviceClient
  .from('catering_requests')
  .update(updateData)
  .eq('id', event.id)
  .in('status', ['approved', 'ready'])
  .select('id')

if (!updatedEvent || updatedEvent.length === 0) {
  return NextResponse.json({ error: 'Selections already submitted' }, { status: 409 })
}
```

**Reasoning:** Same atomic-update pattern as C-4. The conditional update acts as a mutex.

---

## M-9: Cart Validate Warning for Mixed Market Types

### Source of Problem
`cart/validate/route.ts:116-119` warns about mixed market types. The warning text mentions "events" but relies on `market_type` from the `markets` table join. This DOES work — verified that the cart GET endpoint at `cart/route.ts:382` includes `market_type: item.markets?.market_type`, and event markets have `market_type = 'event'`.

### The Actual Issue
The cart validate GET endpoint (`cart/validate/route.ts:30-48`) queries cart_items with a PostgREST embed to get market info. The `market_type` is available via `listing_markets → markets`. However, event items go through `listing_markets` (inserted when vendor accepts). If `listing_markets` rows are cleaned up prematurely (e.g., event status changed), the market_type won't resolve.

### Fix
No code change needed for the validation itself — it works. But add a test scenario: add event + regular items to the same cart and verify the warning triggers. If it doesn't, the issue is in how `listing_markets` rows are managed (cleanup on completed may be premature if items are still in carts).

---

## M-10: listing_markets Not Cleaned Up on Vendor Soft-Delete

### Source of Problem
`listing_markets` rows are created at `respond/route.ts:245-252` (vendor accepts). Cleaned up at:
- `cancel/route.ts:129-136` (vendor cancels)
- `admin/events/[id]/route.ts:232-244` (event completed)

But NOT cleaned up when:
- Vendor profile soft-deleted (`deleted_at` set)
- Vendor's listing deleted or unpublished
- Event moved to cancelled/declined status

### Fix
Add cleanup in the event status transition to `cancelled` or `declined` (in admin PATCH route), same pattern as the `completed` cleanup. Also, the `listing_markets` rows reference listings that have `deleted_at` checks — the shop API already filters `deleted_at IS NULL`, so stale rows won't show items. But they should still be cleaned up for data hygiene.

---

## M-11: Phase 14 Doesn't Verify Update Succeeded

### Fix
```typescript
const { count } = await supabase
  .from('catering_requests')
  .update({ status: 'active' })
  .eq('id', event.id)
  .eq('status', 'ready')
  .select('id', { count: 'exact' })

if (count && count > 0) eventsActivated++
```

**Reasoning:** Only increment when the update actually changed a row. Prevents inflated counts in the cron response when concurrent runs happen.

---

## M-12: Settlement Payment Method Breakdown — No Change

Per your instruction: don't change. Noted for future company-paid event work.

---

## M-13: Missing Vendor Profile Status Check in Shop API

### Fix
Add `.eq('status', 'approved')` and `.is('deleted_at', null)` to the vendor profile query at `shop/route.ts:62-65`:

```typescript
const { data: profiles } = await supabase
  .from('vendor_profiles')
  .select('id, profile_data, profile_image_url, description, pickup_lead_minutes')
  .in('id', acceptedVendorIds)
  .eq('status', 'approved')
  .is('deleted_at', null)
```

**Reasoning:** A vendor banned after accepting an event should not appear in the shop. The `market_vendors` check only verifies `response_status = 'accepted'`, not current profile status.

---

## M-14: Repeat Event Doesn't Validate Future Date

### Fix
Add validation in `repeat/route.ts` before the insert:
```typescript
const eventDateObj = new Date(event_date + 'T00:00:00')
const today = new Date()
today.setHours(0, 0, 0, 0)
if (isNaN(eventDateObj.getTime()) || eventDateObj < today) {
  return NextResponse.json({ error: 'Event date must be in the future' }, { status: 400 })
}
```

**Reasoning:** Same validation as `event-requests/route.ts:99-107`. Copy the pattern.

---

## L-1: Import Path Inconsistency

### Fix
Standardize all event routes to import from `@/lib/notifications/service` (the direct path) rather than `@/lib/notifications` (the re-export). Search-and-replace in the 2 files that use the re-export path.

**Reasoning:** Direct imports are faster (no barrel file resolution) and make dependencies clearer.

---

## L-2: Redundant Vertical in Notification Data + Options

### Fix
Remove `vertical` from template data in `cancel/route.ts:153`:
```typescript
// Before:
{ companyName, responseAction, eventDate: market.name, vertical: market.vertical_id }

// After:
{ companyName, responseAction, eventDate: market.event_start_date }
```

The vertical is already in the options (4th arg). Having it in both places creates ambiguity about which one the template system reads.

---

## L-3: Fragile Date Parsing in Late Cancellation

### Fix
Add null check before parsing:
```typescript
if (!market.event_start_date) {
  console.error('[cancel] Event missing start date:', marketId)
  // Default to not late cancellation if date is missing
}
const eventDate = market.event_start_date
  ? new Date(market.event_start_date + 'T00:00:00')
  : null
const hoursUntilEvent = eventDate
  ? (eventDate.getTime() - Date.now()) / (1000 * 60 * 60)
  : Infinity
const isLateCancellation = hoursUntilEvent < 72 && hoursUntilEvent > 0
```

**Reasoning:** Explicit null handling prevents `NaN` propagation. `Infinity` as default means "not a late cancellation" which is the safe fallback.

---

## L-4: Message Route Body Parsing

### Question: Designed vs Used — Which Is Better?

**Designed** (from JSDoc comment): `Body: { message: string (required, 10-1000 chars) }`
**Used**: Manual destructuring + manual validation:
```typescript
const body = await request.json()
const { message } = body
if (!message || typeof message !== 'string' || message.trim().length < 10 || ...)
```

**Both work correctly.** The validation is thorough and matches the design. No Zod schema exists in this file, and the route is simple enough that adding one would be over-engineering.

**Minor cleanup:** Replace `const body = await request.json(); const { message } = body` with `const { message } = await request.json()` — one line instead of two, same result.

---

## L-5: Empty Token Validation

### Source of Problem
Next.js dynamic route segments (`[token]`) require at least one character. An empty path segment would not match the route. The framework prevents the problem before the page component renders.

### Fix
No code change needed — framework-level protection. If extra safety is desired, add a token format check (e.g., minimum length, allowed characters) but this is low priority.

---

## L-6: Generic Error Message on Shop Page

### Fix
Differentiate errors in the fetch handler:
```typescript
if (!res.ok) {
  const err = await res.json()
  if (res.status === 404) {
    setError('Event not found. The link may be incorrect or the event may no longer be available.')
  } else if (res.status === 400) {
    setError(err.error || 'This event is not currently open for pre-orders.')
  } else {
    setError('Something went wrong. Please try again later.')
  }
  return
}
```

**Reasoning:** 404 = wrong link, 400 = event not open, 500 = server issue. Each has a different user action (check link, wait, retry).

---

## L-7: Hardcoded Vertical String Comparisons

### Source
29 instances of `=== 'food_trucks'` or `=== 'farmers_market'` across 22 files.

### Assessment
All 29 use consistent patterns. The string literals match the `vertical_id` TEXT values in the `verticals` table. This is the standard approach throughout the codebase.

### Fix (if desired)
Extract constants:
```typescript
// lib/vertical/constants.ts
export const VERTICAL_IDS = {
  FOOD_TRUCKS: 'food_trucks',
  FARMERS_MARKET: 'farmers_market',
  FIRE_WORKS: 'fire_works',
} as const
```

Then replace `=== 'food_trucks'` with `=== VERTICAL_IDS.FOOD_TRUCKS`. This prevents typos and makes rename-refactoring possible. Low priority — the current approach works, this is a maintainability improvement.
