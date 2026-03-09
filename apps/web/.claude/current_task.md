# Current Task: Session 54 — Event Approval Process + Event-Ready Listing Badge

Started: 2026-03-09
Status: **IN PROGRESS — ~75% complete**

## Goal
Add event approval workflow for FT vendors: admin toggle, listing checkbox, display badges.

## Plan File
`C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md` — full plan with 8 build items.

## Key Decisions
- **FT only** — FM pop-up vendor approval is a different pattern (future)
- **`listing_data` JSONB** for event flag (no new column on listings, matches existing allergen pattern)
- **Green palette** for all event badges (`#d1fae5` bg, `#065f46` text)
- **Blue palette** for event checkbox when checked (`#eff6ff` bg, `#3b82f6` border) — differentiates from yellow allergen checkbox
- **Capability profile data** (truck length, generator, etc.) is deferred — this build is the approval flag + badge foundation

## Completed Items

### 1. Migration 076 ✅
**File:** `supabase/migrations/20260309_076_vendor_event_approval.sql`
- `event_approved BOOLEAN DEFAULT false`
- `event_approved_at TIMESTAMPTZ`
- Partial index on `event_approved = true`
- **NOT YET APPLIED** to any environment — migration file created but user hasn't run it

### 2. Notification Type ✅
**File:** `src/lib/notifications/types.ts`
- Added `vendor_event_approved` to NotificationType union (line ~80)
- Added template definition at end of NOTIFICATION_TEMPLATES (after `event_feedback_request`)
- audience: vendor, severity: success, channels: inApp + email + push
- actionUrl: `/{vertical}/vendor/listings`

### 3. Admin Event-Approval API ✅
**New file:** `src/app/api/admin/vendors/[id]/event-approval/route.ts`
- PATCH endpoint
- Admin auth via `hasAdminRole()`, rate limiting via `rateLimits.admin`
- Validates: vendor exists, `status === 'approved'`, `vertical_id === 'food_trucks'`
- Updates `event_approved` + `event_approved_at`
- Sends `vendor_event_approved` notification on approve
- Uses `createServiceClient()` for update

### 4. Admin Vendor Detail UI ✅
**Modified:** `src/app/admin/vendors/[vendorId]/VendorActions.tsx`
- Added props: `eventApproved: boolean`, `verticalId: string`
- Added `eventApprovedState` local state + `toggleEventApproval()` + `executeEventApproval()` handlers
- UI: "Approve for Events" green button (when not approved) OR "✓ Event Approved" badge + "Revoke" orange button (when approved)
- Only visible when `currentStatus === 'approved'` AND `verticalId === 'food_trucks'`
- Uses existing ConfirmDialog for confirmation

**Modified:** `src/app/admin/vendors/[vendorId]/page.tsx`
- Passes `eventApproved={!!vendor.event_approved}` and `verticalId={verticalId}` to VendorActions
- Shows green "✓ EVENT APPROVED" badge next to status badge in header

### 5. Listing Edit Form Checkbox ✅
**Modified:** `src/app/[vertical]/vendor/listings/ListingForm.tsx`
- Added prop: `eventApproved?: boolean` (default false)
- Added state: `eventMenuItem` initialized from `listing?.listing_data?.event_menu_item`
- Added "Available for Events" checkbox below allergen section (blue highlight when checked)
- Only rendered when `vertical === 'food_trucks' && eventApproved`
- Updated `listing_data` save payload to include `event_menu_item`

**Modified:** `src/app/[vertical]/vendor/listings/new/page.tsx`
- Added `event_approved` to vendor profile SELECT
- Passes `eventApproved` to ListingForm

**Modified:** `src/app/[vertical]/vendor/listings/[listingId]/edit/page.tsx`
- Added `event_approved` to vendor profile SELECT
- Passes `eventApproved` to ListingForm

### 6. Buyer Listing Detail "Event Ready" Pill ✅
**Modified:** `src/app/[vertical]/listing/[listingId]/page.tsx`
- Added "✓ Event Ready" green pill inline with price/quantity row
- Only shown when `listing_data.event_menu_item === true`
- Green palette: `#d1fae5` bg, `#065f46` text

### 7. Vendor Public Profile "Event Approved" Badge — PARTIALLY DONE
**Modified:** `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx`
- Added "✓ Event Approved" badge after TierBadge in DESKTOP view (~line 580)
- **STILL NEEDS:** Same badge in MOBILE view (~line 788, after second TierBadge)

## Remaining Items

### 7b. Vendor Profile Badge — MOBILE view
**File:** `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` (~line 788)
- Add same "✓ Event Approved" badge after the mobile TierBadge (line 788)
- Same style as desktop version

### 8. Admin Events Page: Badge + Sort in Vendor Invite List
**File:** `src/app/api/admin/events/route.ts` (GET handler, line 75-88)
- Add `event_approved` to vendor_profiles SELECT (line 77)
- Include `event_approved` in mapped vendors array

**File:** `src/app/[vertical]/admin/events/page.tsx` (line 714-751)
- Show small green "Event ✓" pill next to vendor name in invite checkbox list
- Sort vendors: event-approved first, then alphabetical

### 9. Type check + lint
- `npx tsc --noEmit`
- `npm run lint`

## Files Modified This Session
- `supabase/migrations/20260309_076_vendor_event_approval.sql` — NEW
- `src/lib/notifications/types.ts` — MODIFIED (added vendor_event_approved)
- `src/app/api/admin/vendors/[id]/event-approval/route.ts` — NEW
- `src/app/admin/vendors/[vendorId]/VendorActions.tsx` — MODIFIED
- `src/app/admin/vendors/[vendorId]/page.tsx` — MODIFIED
- `src/app/[vertical]/vendor/listings/ListingForm.tsx` — MODIFIED
- `src/app/[vertical]/vendor/listings/new/page.tsx` — MODIFIED
- `src/app/[vertical]/vendor/listings/[listingId]/edit/page.tsx` — MODIFIED
- `src/app/[vertical]/listing/[listingId]/page.tsx` — MODIFIED
- `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` — MODIFIED (desktop badge only)

## NOT YET Modified (still needed)
- `src/app/api/admin/events/route.ts` — add event_approved to vendor query
- `src/app/[vertical]/admin/events/page.tsx` — badge + sort in invite list

## Commits This Session
- None yet — all changes uncommitted

## Previous Session (53) Context
- Main is 17 commits ahead of origin/main
- Staging synced through `f80f791`
- Migrations 072-075 applied to all 3 environments
- URL rename /catering → /events completed

## Gotchas
- `vendor_profiles` uses `*` select in admin detail page, so `event_approved` is automatically available without changing the query
- `listing_data` is JSONB — the `event_menu_item` field is stored alongside `contains_allergens` and `ingredients`
- The vendor public profile page has TWO TierBadge instances (desktop ~line 579, mobile ~line 788) — both need the Event Approved badge
- Migration 076 has NOT been applied yet — needs user to run on environments
