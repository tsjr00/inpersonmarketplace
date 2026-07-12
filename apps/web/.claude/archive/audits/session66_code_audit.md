# Transaction & Event System — Code Audit Report
**Date:** 2026-03-31
**Scope:** End-to-end review of event request → approval → vendor response → shopping → cart → checkout → order lifecycle → settlement
**Method:** Code-only review — no reliance on prior documentation
**Author:** Claude (Session 66)

---

## Findings Summary

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 8 |
| Medium | 14 |
| Low | 7 |
| **Total** | **34** |

---

## CRITICAL FINDINGS

### C-1: Self-Service Path Missing Key Fields for Vendor Matching
**Files:** `src/app/api/event-requests/route.ts:234-252`
**Category:** Data Consistency

The self-service auto-approval path constructs a `requestData` object that is passed to `approveEventRequest()` and `autoMatchAndInvite()`. This object is **missing** `children_present` and `contact_email`, both of which are extracted from the form, validated, and saved to the database at lines 26-44 — but never included in the object.

**Impact:**
- `children_present` is used by `scoreVendorMatch()` to detect deal-breakers (e.g., strong cooking odors at events with children). Without it, dangerous vendor matches are not filtered.
- `contact_email` is used to prevent vendor-as-organizer conflicts. Without it, a vendor could be invited to their own event.
- The admin-initiated rematch (`rematch/route.ts:89-93`) passes the full `cateringRequest` (via `select('*')`), so rematch works correctly. Only self-service is broken.

---

### C-2: Cron Phase 11 Hardcodes `vertical: 'food_trucks'`
**File:** `src/app/api/cron/expire-orders/route.ts:1993`
**Category:** Hardcoded Vertical

```typescript
}, { vertical: 'food_trucks' })
```

Event prep reminders sent 24hr before events always use `food_trucks` as the vertical, regardless of the event's actual vertical. FM event vendors receive reminders tagged as FT, which breaks notification filtering and UI rendering.

The event object has `vertical_id` available at this point but it's not used.

---

### C-3: Cron Phase 13 Dedup is Per-Type, Not Per-Event
**File:** `src/app/api/cron/expire-orders/route.ts:2178-2186`
**Category:** Dedup Failure

```typescript
const { count: alreadySent } = await supabase
  .from('notifications')
  .select('id', { count: 'exact', head: true })
  .eq('type', 'event_vendor_gap_alert')
  .like('action_url', `%/admin/events%`)  // matches ANY event
  .gte('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
```

The dedup checks if ANY `event_vendor_gap_alert` was sent in the past 48 hours — not whether THIS specific event was alerted. If Event A triggers a gap alert at 2pm Monday, Event B's gap alert at 5pm Monday is silently skipped.

---

### C-4: Race Condition in Self-Service Threshold Check
**File:** `src/app/api/vendor/events/[marketId]/respond/route.ts:349-410`
**Category:** Race Condition

When two vendors accept simultaneously for the same self-service event:
1. Both read `market_vendors` and count accepted vendors
2. Both determine `thresholdMet = true`
3. Both send the organizer results email (duplicate email)
4. Both attempt `.update({ status: 'ready' }).eq('status', 'approved')` — one succeeds, one fails silently

The count-check-decide-update sequence is not atomic. The `.eq('status', 'approved')` prevents double status updates but does NOT prevent duplicate emails.

---

### C-5: Unhandled Error on `market_schedules` Insert
**Files:** `src/lib/events/event-actions.ts:116`, `src/app/api/admin/events/[id]/route.ts:164`
**Category:** Silent Failure

Both the shared `approveEventRequest()` function and the admin PATCH route create the event market, then insert into `market_schedules` without checking the result:

```typescript
await serviceClient.from('market_schedules').insert({
  market_id: market.id,
  day_of_week: dayOfWeek,
  start_time: request.event_start_time || '11:00:00',
  end_time: request.event_end_time || '14:00:00',
  active: true,
})
// No error check — returns { success: true } regardless
```

If the schedule insert fails, the market exists with no schedule. The event appears approved but cart validation fails because `validate_cart_item_schedule` finds no schedule. The same bug exists in both files (duplicated logic, Issue H-1).

---

## HIGH SEVERITY FINDINGS

### H-1: Admin PATCH Route Duplicates Approval Logic
**Files:** `src/lib/events/event-actions.ts:69-129` vs `src/app/api/admin/events/[id]/route.ts:113-173`
**Category:** Redundancy

100% identical logic for: token generation, market creation (same fields, same hardcoded `cutoff_hours: 48`), schedule creation, vertical naming. The admin route should call `approveEventRequest()` instead. Bugs (like C-5) must be fixed in two places.

---

### H-2: Timezone Mismatch in Cron Phases 14-15
**File:** `src/app/api/cron/expire-orders/route.ts:2215, 2240`
**Category:** Timezone Issue

```typescript
const todayStr = new Date().toISOString().split('T')[0]  // UTC
```

Phase 14 (ready→active) and Phase 15 (active→review) compare UTC "today" against `event_date` which is stored as a plain date string (no timezone). The cron runs at 12pm UTC / ~6am CT. An event on "2026-04-15" (CT) won't match until 12pm UTC — 6am CT that day. Events could activate 6 hours late or transition to review a day early depending on timezone offset.

The existing `get_available_pickup_dates()` function handles this correctly by using `NOW() AT TIME ZONE market.timezone`. The cron phases don't.

---

### H-3: Settlement Includes Unfulfilled Orders
**File:** `src/app/api/admin/events/[id]/settlement/route.ts:86-118`
**Category:** Financial Accuracy

```typescript
.not('status', 'in', '("cancelled")')
```

Settlement report includes pending, confirmed, and ready order items — not just fulfilled. A vendor's settlement total could include orders they haven't delivered yet. For accurate financial reporting, should filter to `fulfilled` or `completed`.

---

### H-4: Phase 12 Self-Service Email Uses FT Language for All Verticals
**File:** `src/app/api/cron/expire-orders/route.ts:2108`
**Category:** Hardcoded Vertical

```typescript
subject: `${acceptedCount} food truck${acceptedCount > 1 ? 's are' : ' is'} interested in your event!`,
```

Also at line 2113: "food trucks" in body. The sender and branding are vertically differentiated (lines 2093-2098) but the content nouns are not.

---

### H-5: Vendor Respond Email Uses FT Language for FM Events
**File:** `src/app/api/vendor/events/[marketId]/respond/route.ts:380-386`
**Category:** Hardcoded Vertical

Same pattern as H-4: the instant threshold email in the vendor respond route says "food trucks" for all verticals despite having `isFM` branding at lines 369-372.

---

### H-6: Organizer Identity Disclosure Inconsistency
**Files:** `src/lib/events/event-actions.ts:81,324` vs `src/app/api/admin/events/[id]/invite/route.ts:171`
**Category:** Privacy Inconsistency

Auto-invited vendors see `companyName: 'Private Event'` (identity hidden). Manually invited vendors see `companyName: cateringReq.company_name` (full name disclosed). Meanwhile, the market name in the database (`market.name`) includes the company name regardless. The privacy model is half-enforced.

---

### H-7: Event Info Page N+1 Query Pattern
**File:** `src/app/[vertical]/events/[token]/page.tsx:63-118`
**Category:** Performance

The server-rendered event info page loops through vendors with per-vendor queries to `event_vendor_listings` and a fallback to `listings`. For 5 vendors = 5-10 queries. The shop API (`/api/events/[token]/shop/route.ts:98-139`) already uses batch queries for the same data.

---

### H-8: Prices Exposed to Unauthenticated Users in Shop API
**File:** `src/app/api/events/[token]/shop/route.ts:122`
**Category:** Data Exposure

The shop API is a public endpoint (no auth required). It returns `price_cents` for all listings. The frontend hides prices for logged-out users, but the API exposes them. A competitor can call the API with just the event token (from the shareable URL) to see all vendor pricing.

---

## MEDIUM SEVERITY FINDINGS

### M-1: Race Condition on Rapid "Add to Cart" Clicks
**File:** `src/app/[vertical]/events/[token]/shop/page.tsx:186-225`
Two rapid clicks on "Add to Cart" can both enter `addVendorToCart()` before `setAddingToCart(vendorId)` takes effect (React batching). Items could be double-added. The `addingToCart` guard is client-side state that doesn't prevent concurrent async operations.

### M-2: Division by Zero on `vendor_count`
**File:** `src/lib/events/event-actions.ts:313`
`Math.ceil(request.headcount / request.vendor_count)` — if `vendor_count` is 0, produces `Infinity` sent to vendor notifications. Backend clamps to range 1-20 but doesn't enforce `> 0` in the `CateringRequest` interface.

### M-3: Notification Field `eventDate` Contains Market Name
**File:** `src/app/api/vendor/events/[marketId]/cancel/route.ts:154`
`eventDate: market.name` — sends the event name (e.g., "Corporate Gala") where a date is expected. Same pattern in respond route at line 330.

### M-4: Late Cancellation Not Persisted
**File:** `src/app/api/vendor/events/[marketId]/cancel/route.ts:256-259`
Late cancellations (< 72hr) are logged to `console.warn` but never saved to the database. No audit trail for vendor reliability scoring.

### M-5: `replaced_vendor_id` Has No FK Constraint
**File:** `src/app/api/vendor/events/[marketId]/cancel/route.ts:238`
Backup vendor escalation sets `replaced_vendor_id: vendorProfile.id` but no FK constraint ensures this ID remains valid. If the vendor profile is deleted, this becomes a dangling reference.

### M-6: Hardcoded FT Logic in Vendor Event Page
**File:** `src/app/[vertical]/vendor/events/[marketId]/page.tsx:163`
`if (vertical !== 'food_trucks' || next.size < 7)` — the 7-item cap is hardcoded in the UI component. The API validates 4-7 for FT at `respond/route.ts:96-108`. Two sources of truth.

### M-7: Event Select Notification Uses Hardcoded Name
**File:** `src/app/api/events/[token]/select/route.ts:273`
`companyName: 'Your event is confirmed!'` — hardcoded string instead of `event.company_name`. Vendors receive a generic message instead of the event name.

### M-8: Event Select POST Allows Exceeding `vendor_count`
**File:** `src/app/api/events/[token]/select/route.ts:207`
The server validates `selected_vendor_ids.length > event.vendor_count` AFTER processing. Two concurrent requests from different tabs could both submit and succeed before the validation catches the second one.

### M-9: Cart Validate Warning Never Triggers for Events
**File:** `src/app/api/cart/validate/route.ts:116-119`
Mixed market type warning says "markets, private pickup, events" but relies on `market_type` from the `markets` table. This DOES work because cart items join to `markets`. However, the message text suggests this was aspirational — it's unclear if the mix of event + regular items in the same cart is actually tested or intentionally supported.

### M-10: `listing_markets` Not Cleaned Up on Vendor Profile Deletion
**File:** Multiple — `listing_markets` rows created at `respond/route.ts:245-252`, cleaned up at `cancel/route.ts:129-136` and `admin/events/[id]/route.ts:232-244`. But there's no cleanup if a vendor profile is soft-deleted (`deleted_at` set). The rows persist, potentially causing stale listings to appear in event shops.

### M-11: Cron Phase 14 Doesn't Verify Update Succeeded
**File:** `src/app/api/cron/expire-orders/route.ts:2224-2230`
`eventsActivated++` runs regardless of whether the update actually changed a row. Two concurrent cron runs could both increment the counter but only one actually transitions the status.

### M-12: Settlement Vendor Breakdown Doesn't Separate Payment Methods
**File:** `src/app/api/admin/events/[id]/settlement/route.ts:308-323`
Employee-paid (Stripe) vs company-paid (external) items are separated for totals but not per-vendor. A vendor's settlement doesn't show which revenue came from which payment method.

### M-13: Missing Vendor Profile Status Check in Shop API
**File:** `src/app/api/events/[token]/shop/route.ts:46-76`
Vendor profiles are loaded without checking `status = 'approved'` or `deleted_at IS NULL` on the profile itself. A banned or deleted vendor who previously accepted would still show in the shop.

### M-14: Repeat Event Doesn't Validate Future Date
**File:** `src/app/api/admin/events/[id]/repeat/route.ts:79-107`
Admin can repeat an event with a past date. The system creates the request but Phase 14/15 cron logic expects future dates.

---

## LOW SEVERITY FINDINGS

### L-1: Import Path Inconsistency for `sendNotification`
**Files:** `respond/route.ts:10` imports from `@/lib/notifications`, `cancel/route.ts:5` imports from `@/lib/notifications/service`. Both work (index re-exports) but inconsistent.

### L-2: Inconsistent Vertical in Notification Data vs Options
**File:** `cancel/route.ts:153-157` — `vertical: market.vertical_id` passed in BOTH template data and options. Redundant.

### L-3: Fragile Date Parsing in Late Cancellation Check
**File:** `cancel/route.ts:101` — `new Date(market.event_start_date + 'T00:00:00')` — if `event_start_date` is null, produces `Invalid Date` and `isLateCancellation` silently becomes false.

### L-4: Unused `body` Variable in Message Route
**File:** `src/app/api/vendor/events/[marketId]/message/route.ts:34` — `const body = await request.json()` then destructures `message` from it. Minor cleanup.

### L-5: No Token Format Validation in Shop Page
**File:** `src/app/[vertical]/events/[token]/shop/page.tsx:121` — Fetches `/api/events/${token}/shop` without validating token is non-empty.

### L-6: Generic Error Message on Shop Page Fetch Failure
**File:** `src/app/[vertical]/events/[token]/shop/page.tsx:136` — All errors show "Failed to load event" — doesn't distinguish 404 from network failure.

### L-7: Hardcoded `'food_trucks'` Vertical Check in Shop API
**File:** `src/app/api/events/[token]/shop/route.ts:157` — `const isFT = event.vertical_id === 'food_trucks'`. Works but brittle if vertical IDs change.

---

## Cross-Cutting Themes

### 1. Vertical Isolation Incomplete
FT-specific language and logic appears in 5+ places that handle both verticals. The most impactful are C-2 (prep reminders), H-4 (Phase 12 email), H-5 (threshold email). These send FT language to FM event organizers and vendors.

### 2. Race Conditions in Status Transitions
Three separate race conditions: C-4 (threshold check), C-3 (dedup), M-11 (cron). All stem from non-atomic read-check-update sequences. The `.eq('status', X)` guard prevents double status updates but doesn't prevent duplicate side effects (emails, notifications).

### 3. Duplicated Logic
H-1 is the most significant — the admin PATCH route reimplements `approveEventRequest()` instead of calling it. This guarantees drift and duplicated bugs (C-5 exists in both copies).

### 4. Missing Error Handling on Fire-and-Forget Operations
C-5 (schedule insert), M-6 (listing insert) — operations that are critical to the event functioning correctly are not checked for errors. The system proceeds as if they succeeded.

### 5. Financial Accuracy Gap
H-3 (settlement includes unfulfilled orders) is a real risk for event settlement. A vendor could appear to owe platform fees on orders they haven't fulfilled.
