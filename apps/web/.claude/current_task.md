# Current Task: Fix Push Notifications + Multi-Vendor Order Status Display
Started: 2026-02-11

## Status: ALL 5 STEPS COMPLETE — Ready to commit + push staging

## Previous Task (COMPLETED)
UI Overhaul (9 batches, 15 files) — committed as `0e9400f`, pushed to staging.

## Plan
Plan file: `nested-gliding-dove.md`

## User Clarifications
- Do NOT change `order_confirmed` urgency (standard is intentional)
- Do NOT add buyer purchase notification (buyer knows they purchased)
- In-app notifications ARE working for all status changes
- Push is the only broken channel — `push_enabled` never gets set
- "There should be a notification when the order is marked ready" — already works via in-app + push (once push_enabled fixed)

## Steps

### Step 1: Auto-set `push_enabled` in push subscribe route
**File:** `src/app/api/notifications/push/subscribe/route.ts`
- POST: after subscription upsert, set `push_enabled: true` in `user_profiles.notification_preferences`
- DELETE: after subscription delete, count remaining subs — if 0, set `push_enabled: false`
- Status: COMPLETE

### Step 2: Fix status fallthrough + add count metadata in API
**File:** `src/app/api/buyer/orders/route.ts`
- Added `else if (activeStatuses.some(s => s === 'fulfilled'))` block after confirmed check
- Added readyCount, fulfilledCount, handedOffCount, totalActiveCount to response
- Status: COMPLETE

### Step 3: Fix order detail page — status, primaryItem, hero
**File:** `src/app/[vertical]/buyer/orders/[id]/page.tsx`
- Fixed computeEffectiveStatus() — filters cancelled, handles fulfilled+confirmed mix
- Fixed primaryItem selection (prioritize ready → handed_off → active → any)
- Added partial readiness context to hero ("X of Y items ready")
- Added multi-vendor count display
- Passes readyCount/totalActiveCount to OrderStatusSummary
- Status: COMPLETE

### Step 4: Update OrderStatusSummary + orders list page
**Files:** `src/components/buyer/OrderStatusSummary.tsx` + `src/app/[vertical]/buyer/orders/page.tsx`
- Added readyCount/totalActiveCount optional props to OrderStatusSummary
- "Partially Ready" title + "X of Y items ready" message when partial
- Updated Order interface for count fields
- Updated ready banner for partial messaging
- Status: COMPLETE

### Step 5: Update dashboard card for partial readiness
**File:** `src/app/[vertical]/dashboard/page.tsx`
- Added lightweight query for total active item counts per ready order
- Shows "X of Y items ready" when partial, "X items ready" when all ready
- Status: COMPLETE

## Files To Modify (~6 total)
- `src/app/api/notifications/push/subscribe/route.ts` (Step 1)
- `src/app/api/buyer/orders/route.ts` (Step 2)
- `src/app/[vertical]/buyer/orders/[id]/page.tsx` (Step 3)
- `src/app/[vertical]/buyer/orders/page.tsx` (Step 4)
- `src/components/buyer/OrderStatusSummary.tsx` (Step 4)
- `src/app/[vertical]/dashboard/page.tsx` (Step 5)

## Deferred Items (from previous session)
- Item 14: Size/measurement field on listings
- Item 15: Vendor listing best practices guide
