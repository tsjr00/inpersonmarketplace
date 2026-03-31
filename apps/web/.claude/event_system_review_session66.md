# Event System End-to-End Review — Session 66

## Purpose
Complete code review of the event system before fixing `validate_cart_item_schedule`.

## Event Lifecycle (verified from code)

### 1. Event Request Submission
**File:** `src/app/api/event-requests/route.ts` (481 lines)

- Public form, no auth required (service client)
- Validates: company_name, contact_name, contact_email, event_date (not past), headcount (10-5000), address/city/state/zip
- Content moderation via `checkFields()`
- Vendor-as-organizer prevention: checks `vendor_profiles.profile_data->>email` against contact_email
- Two service levels:
  - **full_service**: Insert → status `new` → admin reviews manually
  - **self_service**: Insert → auto-approve → auto-match → auto-invite (no admin)
- Self-service auto-approve calls `approveEventRequest()` + `autoMatchAndInvite()` from `event-actions.ts`
- Sends admin email + organizer confirmation email (both verticals, differentiated language)
- Event types: corporate_lunch, team_building, grand_opening, festival, private_party, other
- Payment models: company_paid, attendee_paid, hybrid
- New fields (migration 104): has_competing_vendors, competing_food_options, is_ticketed, estimated_dwell_hours, children_present, is_themed, theme_description, estimated_spend_per_attendee_cents, preferred_vendor_categories

### 2. Event Approval (Market + Token + Schedule Creation)
**File:** `src/lib/events/event-actions.ts:approveEventRequest()` (lines 65-129)

- Called by both self-service flow AND admin PATCH route
- Generates event token: `company-name-slug-[base36-timestamp]`
- Creates market in `markets` table:
  - `market_type = 'event'`
  - `is_private = true`
  - `cutoff_hours = 48`
  - `event_start_date = request.event_date`
  - `event_end_date = request.event_end_date || request.event_date`
  - `vendor_profile_id = null` (no owner vendor)
- Creates schedule in `market_schedules`:
  - `day_of_week = eventDate.getUTCDay()` (calculates from event_date)
  - `start_time = request.event_start_time || '11:00:00'`
  - `end_time = request.event_end_time || '14:00:00'`
  - `active = true`
- Returns market_id + event_token

**IMPORTANT FOR CART FIX:** The schedule is created with the correct day_of_week matching the event date, but the schedule system is designed for recurring weekly markets. The `validate_cart_item_schedule` function likely generates future dates from day_of_week + some window — it doesn't know the event date is a one-time occurrence.

### 3. Admin Review (Full-Service)
**File:** `src/app/api/admin/events/[id]/route.ts` (PATCH, lines 33-249)

- Status transitions: new → reviewing → approved → declined/cancelled/ready/active/review/completed
- On approve: same market+token+schedule creation as auto-approve (duplicated logic, not calling shared function)
  - **NOTE:** Admin PATCH has its OWN copy of the approval logic at lines 112-173, not using `approveEventRequest()`. This is a maintenance risk.
- On ready: sends event confirmed email to organizer with event page URL
- On completed: fires feedback notifications to buyers + settlement notifications to vendors + cleans up `listing_markets` rows

### 4. Vendor Matching & Invitation
**File:** `src/lib/events/event-actions.ts:autoMatchAndInvite()` (lines 132-341)

- Queries all event-approved vendors for the vertical
- Gets listing categories + catering item counts per vendor
- Skips vendors with < 4 event-eligible items
- Skips vendors whose email matches organizer email
- Scores each vendor via `scoreVendorMatch()` from viability.ts
- Filters out: red scores, deal-breakers, score < 2.5
- Sorts by lead_time_advantage then platform_score (descending)
- Limits to MAX_AUTO_INVITE = 15
- Creates `market_vendors` rows with `response_status = 'invited'`
- Sends `catering_vendor_invited` notification to each vendor

**Admin manual invite:** `src/app/api/admin/events/[id]/invite/route.ts`
- Requires event_approved vendors
- Creates market_vendors rows + sends notifications
- Checks for duplicate invitations

**Admin re-match:** `src/app/api/admin/events/[id]/rematch/route.ts`
- Re-runs autoMatchAndInvite — it naturally skips already-invited vendors

### 5. Vendor Response (Accept/Decline)
**File:** `src/app/api/vendor/events/[marketId]/respond/route.ts` (385 lines)

- Vendor sees event at: `src/app/[vertical]/vendor/events/[marketId]/page.tsx`
  - Before acceptance: city/state only (no full address, no company name)
  - After acceptance: full address + setup instructions revealed
- Accept requires listing_ids (event-eligible items):
  - FM: 1+ items
  - FT: 4-7 items
- Conflict detection: checks for overlapping events on same date
  - Single-truck: BLOCKED (409)
  - Multi-truck: WARNING in response_notes
- On accept:
  1. Updates market_vendors → `accepted`
  2. Validates listings belong to vendor + are catering-eligible (`listing_data.event_menu_item === true`)
  3. Inserts into `event_vendor_listings` table
  4. **Inserts into `listing_markets` table** (lines 245-252) — upsert on `listing_id,market_id` conflict
     - This is the critical bridge: cart validates via `listing_markets`, not `event_vendor_listings`
- Self-service instant threshold check (lines 300-377):
  - If enough vendors accepted or all responded → sends results email to organizer immediately
  - Updates catering_request status to 'ready'

### 6. Vendor Cancellation
**File:** `src/app/api/vendor/events/[marketId]/cancel/route.ts` (269 lines)

- Requires reason (10+ chars)
- Updates market_vendors → `cancelled`
- Deletes `event_vendor_listings` for this vendor
- **Deletes `listing_markets` rows** for this vendor's cancelled listings (lines 129-136)
- Notifies admin + event organizer (email)
- Auto-escalates backup vendor if one exists
- Late cancellation tracking (< 72hr window)

### 7. Organizer Selection (Self-Service)
**Files:**
- Page: `src/app/events/[token]/select/page.tsx`
- API: `src/app/api/events/[token]/select/route.ts`

- Token-based access (no auth required)
- Shows accepted vendors with ratings, categories, catering items, lead times
- Organizer selects up to `vendor_count` vendors
- Non-selected vendors marked as `is_backup = true`
- Updates event status → `ready`
- Sends confirmation email with:
  - QR code for event page URL
  - Marketing kit (email template, social media blurb, signage text)
  - Pre-order promotion tips

### 8. Event Page (Public — Browsing)
**File:** `src/app/events/[token]/page.tsx` (322 lines, server component)

- Displays event info, vendors, menus with prices
- Per-vendor loop queries (could be optimized)
- Uses PostgREST embed on `event_vendor_listings` → `listings` (works here, failed in shop page)
- Shows "Tap to order →" linking to listing detail pages (individual listing purchase flow)
- Feedback form during active/review phases
- **NOTE:** Footer says "Powered by Food Truck'n" hardcoded — should be vertical-aware

### 9. Event Shop Page (Purpose-Built Shopping)
**Files:**
- Page: `src/app/events/[token]/shop/page.tsx` (614 lines, client component)
- API: `src/app/api/events/[token]/shop/route.ts` (189 lines)

**API:**
- Public endpoint, no auth to browse (prices visible in data but hidden in UI until login)
- Batch queries — avoids per-vendor loops and PostgREST embed ambiguity
- Returns: event details, schedule (id, start/end), pickup_date, vendors with listings
- Key: passes `pickup_date = event.event_date` for cart API

**Page:**
- Auth check (client-side) — shows "Sign in to see prices" when logged out
- Per-vendor sections with listing grids (140px min cards)
- Quantity selectors per item (respects max quantity)
- FT: pickup time selector (30-min or 15-min slots based on vendor lead times)
- Per-vendor "Add to Cart" button with total
- Sticky cart bar at bottom with item count, total, "View Cart" link
- Cart message display for success/error
- Calls `POST /api/cart/items` with: vertical, listingId, marketId, scheduleId, pickupDate, quantity, preferredPickupTime

### 10. Cart Add (The Blocker)
**File:** `src/app/api/cart/items/route.ts` (476 lines)

The add-to-cart flow for listings (line 44-273):
1. Validate vertical exists
2. `validate_cart_item_inventory` RPC — checks listing exists + has enough stock
3. Validate listing vertical matches request
4. **Validate listing_markets** — confirms listing is at the requested market (line 127-147)
   - This works for events because vendor accept inserts into listing_markets
5. **`validate_cart_item_schedule` RPC** — THE BLOCKER (line 150-168)
   - Passes: p_listing_id, p_schedule_id, p_pickup_date
   - Returns FALSE → throws `ERR_CART_003: "This pickup date is no longer accepting orders"`
6. FT: validates preferredPickupTime format (HH:MM, 15-min boundary)
7. Gets/creates cart
8. Upserts cart item (increment quantity if exists)

### 11. Cart Validation
**File:** `src/app/api/cart/validate/route.ts` (241 lines)

- GET: validates market compatibility (mixed types, same market for traditional)
- POST: validates item availability (inventory, cutoff status)
- Uses `get_listings_accepting_status` RPC — separate from `validate_cart_item_schedule`
- **No special handling for event-type markets**

### 12. Event Lifecycle Cron Jobs
**File:** `src/app/api/cron/expire-orders/route.ts`

- **Phase 11 (lines 1945-2001):** Event prep reminders 24h before
  - Finds events with status ready/active happening tomorrow
  - Sends `event_prep_reminder` to accepted vendors
  - Dedup check via notifications table
  - **BUG:** Hardcodes `vertical: 'food_trucks'` in notification — should use event's vertical_id

- **Phase 12 (lines 2003-2141):** Self-service 48hr threshold
  - Checks self-service events where 48hr passed since auto_invite_sent_at
  - Sends results email to organizer with vendor list + "Select Your Trucks" CTA
  - Updates status → ready if accepted vendors exist
  - **Language issue:** Email says "food trucks" regardless of vertical

- **Phase 13 (lines 2144-2210):** Vendor gap alert
  - 24hr after auto-invite, if accepted < requested → notify admins
  - `event_vendor_gap_alert` notification type
  - Dedup check via notifications table

### 13. Event Completion (Admin)
**File:** `src/app/api/admin/events/[id]/route.ts` (on status → completed, lines 222-245)

- Sends feedback notifications to buyers who ordered
- Sends settlement notifications to accepted vendors
- **Cleans up listing_markets rows** created for the event

## Data Flow Diagram

```
EventRequest → catering_requests (status: new/approved)
                   ↓ (on approve)
              markets (market_type: 'event')
              market_schedules (day_of_week + times)
                   ↓ (on invite)
              market_vendors (response_status: invited)
                   ↓ (on vendor accept)
              event_vendor_listings (market_id, vendor_id, listing_id)
              listing_markets (listing_id, market_id) ← BRIDGE FOR CART
                   ↓ (buyer shops)
              /events/[token]/shop → /api/cart/items
                   ↓ (BLOCKED HERE)
              validate_cart_item_schedule(listing_id, schedule_id, pickup_date)
              → returns FALSE for event dates
                   ↓ (if it worked)
              cart_items → checkout → order_items
```

## Key Tables Involved

| Table | Role in Events |
|-------|---------------|
| catering_requests | Event request details, status, token, market_id |
| markets | Event market (market_type='event', is_private=true) |
| market_schedules | One schedule entry per event (day_of_week matches event date) |
| market_vendors | Vendor invitations + responses |
| event_vendor_listings | Which listings each vendor committed for this event |
| listing_markets | Bridge table — cart validates listings belong to market via this |
| cart_items | Buyer's cart (references market_id, schedule_id, pickup_date) |
| order_items | Orders (references market_id, vendor_profile_id) |

## Issues Found During Review

### BLOCKER: validate_cart_item_schedule returns FALSE
- **Root cause (hypothesis):** Function generates valid dates from recurring schedule logic. Events are one-time.
- **Need:** Read the actual function source (`SELECT prosrc FROM pg_proc WHERE proname = 'validate_cart_item_schedule'`)
- **Fix will be in SQL** — add event market_type awareness

### Issue 2: Admin approve has duplicated approval logic
- `admin/events/[id]/route.ts` lines 112-173 duplicates `approveEventRequest()` logic
- Both create market + schedule, but admin route doesn't call the shared function
- Risk: changes to one won't propagate to the other

### Issue 3: Phase 11 hardcodes vertical
- Line 1993: `vertical: 'food_trucks'` — should be event's vertical_id

### Issue 4: Phase 12 email language
- Uses "food trucks" regardless of vertical
- Should differentiate FM vs FT language

### Issue 5: Public event page footer
- `events/[token]/page.tsx` line 316: "Powered by Food Truck'n" hardcoded
- Should be vertical-aware

### Issue 6: Public event page N+1 queries
- `events/[token]/page.tsx` loops through vendors with individual queries (lines 74-101)
- Shop page API fixed this with batch queries — this page still has the issue

### Issue 7: Admin PATCH route duplicates approval logic
- Line 112-173: Full approval logic (market creation, schedule creation) is duplicated
- Should call `approveEventRequest()` from event-actions.ts instead

## What Needs to Happen for Cart Fix

1. **Read `validate_cart_item_schedule` source** (user runs SQL query)
2. **Modify function** to recognize `market_type = 'event'` markets and:
   - Accept the pickup_date if it falls within `event_start_date` to `event_end_date`
   - Skip the recurring-date-generation logic for events
   - Still validate schedule_id belongs to the market
3. **Test** with the known test data:
   - Schedule ID: c8a55720-fc01-42b7-b546-d520622f6392
   - Listing: ee300000-0301-4000-8000-000000000001
   - Pickup date: 2026-04-11
4. **Verify** no regression for regular markets (traditional, private_pickup)
