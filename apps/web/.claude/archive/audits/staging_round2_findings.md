# Staging Round 2 Testing Findings
Date: 2026-02-23

## Finding 1: Buyer Orders List Missing Pickup Time ✅ COMPLETE
**Where:** Buyer "My Orders" list page
**Issue:** When buyer views their orders list, they can see the order and payment method (cash at pickup) but NOT the preferred pickup time they selected during checkout.
**Expected:** Should show "Scheduled for pickup at [time]" so buyer doesn't have to remember or tap into details.
**Fix:** Added `preferred_pickup_time` to buyer orders API query + response. Display shows "Pickup: Mon, Feb 10 at 2:30 PM".
**Files:** `src/app/api/buyer/orders/route.ts`, `src/app/[vertical]/buyer/orders/page.tsx`

**USER FEEDBACK**: This is NOT "preferred" — it's a CONFIRMED/PROMISED pickup time. Language refinement in progress.

---

## Finding 2: Notification Bell Badge Needs Color-Coded Urgency ✅ COMPLETE
**Where:** NotificationBell component — the circle badge showing unread count
**Fix:** 3-tier badge: GREEN (#16a34a) info-only, YELLOW (#f59e0b) warning, RED (#dc2626) critical. Number stays same.
**File:** `src/components/notifications/NotificationBell.tsx`

---

## Finding 3: Vendor Orders Page Lost Formatting/UI Regression ✅ COMPLETE
**Where:** Vendor dashboard orders page (`/[vertical]/vendor/dashboard/orders/page.tsx`)
**Root cause:** Dashboard orders page used a simple inline OrderCard. The standalone `/vendor/orders/page.tsx` (which uses the shared rich OrderCard) was intact — user was navigating to the dashboard version.
**Fix:** Rewrote dashboard orders page to use shared OrderCard from `src/components/vendor/OrderCard.tsx`. Added "Customer Orders" heading, status stat pills, urgency sorting with separators, all 6 action handlers.
**File:** `src/app/[vertical]/vendor/dashboard/orders/page.tsx`

---

## Finding 4: Abandoned/Stale Confirmed Orders — No Contingency Process ✅ COMPLETE
**Where:** System-wide order lifecycle gap
**Fix:** Added Phase 4.5 to expire-orders cron + 2 new notification types.
- `stale_confirmed_vendor` (immediate push + in-app, critical severity)
- `stale_confirmed_buyer` (standard email + in-app, warning severity)
- Runs daily, checks confirmed items where pickup_date < today (7-day lookback max)
- Dedup via notifications table query
**Files:** `src/lib/notifications/types.ts`, `src/app/api/cron/expire-orders/route.ts`

**USER FEEDBACK**: 7-day lookback is fine (not a delay). Food truck vertical needs daily checks (already implemented). User clarified that F4 is good as-is.

---

## Terminology Refinement (IN PROGRESS)
User feedback: "preferred pickup time" should be "confirmed/scheduled pickup time" in all user-facing language. Pre-checkout selection = preference. Post-vendor-confirmation = commitment/promise. See `current_task.md` for detailed list of remaining changes.

---

## Previous Session Context
- All 12 items from the original staging round 2 plan are COMPLETE and committed (`fee48fb`)
- Pushed to staging, 0 type errors, 94 tests pass
- Main is ahead of origin/main by 24+ commits
