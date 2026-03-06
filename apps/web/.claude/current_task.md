# Current Task: Session 50 — Multi-Fix Round

Started: 2026-03-05

## Goal
Fix multiple issues found during user's walkthrough video testing.

## What's Been Completed This Session
1. ✅ Processes & Protocols system (commit `b7d4616`)
2. ✅ Tier pricing unification — FM Premium $25, FT Pro $25, FT annual billing (commit `b852836`)
3. ✅ 815 Enterprises hub pages — /terms, /privacy, /support for Stripe compliance (commit `e49cced`)
4. ✅ Fix /support middleware allowlist + combine terms & privacy on single /terms page (commit `ea27025`)
5. ✅ Input field visibility fix (inputBg design token) + Setup Guide page for notifications & PWA (commit `47fd0fd`)
6. ✅ Help & FAQ card added to buyer section of dashboard (commit `c4d1fc7`)
7. ✅ 5 bugs from user walkthrough testing (pending commit)

## 5 Bug Fixes — ALL COMPLETE

### Bug 1: ✅ Notification bell dropdown off-screen on mobile
**File:** `src/components/notifications/NotificationBell.tsx`
**Fix:** Added `isMobile` state (viewport < 480px). On mobile, dropdown uses `position: fixed; left: 8px; right: 8px; top: 56px; width: auto` — fills viewport width with 8px margins. On desktop, unchanged (`position: absolute; right: 0; width: 340px`).

### Bug 2: ✅ Notification click on notifications page doesn't navigate
**File:** `src/app/[vertical]/notifications/page.tsx`
**Root cause:** `await fetch()` to mark-as-read was blocking before `router.push()`. On slow connections, the UI appeared frozen.
**Fix:** Removed `await` from the mark-as-read fetch (fire-and-forget with optimistic state update). Navigation now fires immediately. Added fallback URL (`/${vertical}/dashboard`) for unknown notification types.

### Bug 3: ✅ Notification color mismatch between bell and notifications page
**File:** `src/components/notifications/NotificationBell.tsx`
**Root cause:** Bell badge (count bubble) used hardcoded `#16a34a` (bright green) for info severity, while the notification dots/page use `colors.primary` (CSS var, theme green). Different greens.
**Fix:** Changed `BADGE_COLORS.info.bg` from `#16a34a` to `primaryColor` — now matches the theme's primary color everywhere.

### Bug 4: ✅ My Orders card shows ALL orders instead of current
**File:** `src/app/[vertical]/dashboard/page.tsx`
**Fix:** Added `.in('status', ['pending', 'paid', 'confirmed', 'ready'])` to order count query. Changed label from "X orders placed" to "X active orders".

### Bug 5: ✅ Issue reporting messages updated with payment/refund info
**File:** `src/app/[vertical]/buyer/orders/[id]/page.tsx`
**Fix:** Updated 4 locations:
1. Confirm dialog message: now warns about payment already processed, no auto-refunds
2. Single-item success banner: includes payment processed + contact vendor for refund
3. Submit-all success banner: same payment/refund language
4. Static "Issue reported" badge: now says "payment has been processed — contact vendor"

## Git State
- Main is **6 ahead** of origin/main (commits `b7d4616` through `c4d1fc7`)
- Staging is synced with main (all 6 pushed to staging)
- Bug fixes ready to commit (not yet committed)

## Key Decisions Made This Session
- inputBg token: FM = `#FFFEF5` (warm cream), FT = `#f5f8ff` (light blue-white)
- Setup guide at `/{vertical}/help/setup` (static page, not knowledge articles)
- Terms + Privacy combined on single `/terms` page per user request
- FM Premium: $25/mo, FT Pro: $25/mo, FM Premium annual: $208.15/yr
- Smoke test: 3-tier approach (Targeted 2min / Critical Path 5min / Full 30min)
