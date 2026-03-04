# Current Task: Cross-Vertical Isolation Fix (Option B)

Started: 2026-03-03 (Session 51)

## Goal
Fix cross-vertical isolation gaps where notifications, auth, and page access leak across verticals.

## Status: ALL 4 BATCHES COMPLETE — Ready to commit

- TypeScript: 0 errors
- Vitest: 342 passing, 67 todo, 0 failures
- Migration 065 created (not yet applied)

## What Was Implemented

### Batch 1: Migration (DONE)
- `supabase/migrations/20260303_065_add_notification_vertical_id.sql`
- Adds nullable `vertical_id TEXT` column with FK to verticals
- Index: `idx_notifications_user_vertical` on (user_id, vertical_id)

### Batch 2: Store vertical in notifications (DONE)
- `src/lib/notifications/service.ts` — sendInApp() now accepts `vertical` param, inserts `vertical_id`
- sendNotification() threads `options?.vertical` into sendInApp()
- Fixed 7 call sites missing vertical:
  - `webhooks.ts` — 3 payout_processed notifications (added vertical_id to vendor selects)
  - `checkout/success/route.ts` — inventory_out_of_stock, inventory_low_stock, new_paid_order, payout_processed

### Batch 3: Filter notifications by vertical (DONE)
- `GET /api/notifications` — accepts `?vertical=` param, filters: `vertical_id.eq.X OR vertical_id.is.null`
- `POST /api/notifications/read-all` — accepts `?vertical=` param, same filter
- `NotificationBell.tsx` — passes `vertical` prop to all API calls
- `notifications/page.tsx` — passes `vertical` from useParams() to API calls

### Batch 4: Vertical access gate (DONE)
- NEW `src/lib/auth/vertical-gate.ts` — `enforceVerticalAccess(vertical)` utility
  - Unauthenticated → redirect to login
  - Platform admin → bypass
  - Checks user_profiles.verticals array
  - Fallback: checks vendor_profiles for this vertical
  - No verticals (new user) → allow
  - Wrong vertical → redirect to home vertical
- `login/page.tsx` — Post-login vertical check (client-side, same logic)
- 8 server pages gated:
  - `[vertical]/dashboard/page.tsx`
  - `[vertical]/settings/page.tsx`
  - `[vertical]/vendor/dashboard/page.tsx`
  - `[vertical]/vendor/listings/page.tsx`
  - `[vertical]/vendor/listings/new/page.tsx`
  - `[vertical]/vendor/edit/page.tsx`
  - `[vertical]/vendor/listings/[listingId]/page.tsx`
  - `[vertical]/vendor/listings/[listingId]/edit/page.tsx`

## Files Modified (13 total)
| File | Change |
|------|--------|
| NEW `supabase/migrations/20260303_065_add_notification_vertical_id.sql` | vertical_id column + FK + index |
| `src/lib/notifications/service.ts` | sendInApp stores vertical_id |
| `src/lib/stripe/webhooks.ts` | 3 payout calls get vertical |
| `src/app/api/checkout/success/route.ts` | 4 notification calls get vertical |
| `src/app/api/notifications/route.ts` | ?vertical= filter |
| `src/app/api/notifications/read-all/route.ts` | ?vertical= filter |
| `src/components/notifications/NotificationBell.tsx` | Pass vertical to API |
| `src/app/[vertical]/notifications/page.tsx` | Pass vertical to API |
| NEW `src/lib/auth/vertical-gate.ts` | enforceVerticalAccess() |
| `src/app/[vertical]/login/page.tsx` | Post-login vertical check |
| `src/app/[vertical]/dashboard/page.tsx` | enforceVerticalAccess() |
| `src/app/[vertical]/settings/page.tsx` | enforceVerticalAccess() |
| `src/app/[vertical]/vendor/dashboard/page.tsx` | enforceVerticalAccess() |
| `src/app/[vertical]/vendor/listings/page.tsx` | enforceVerticalAccess() |
| `src/app/[vertical]/vendor/listings/new/page.tsx` | enforceVerticalAccess() |
| `src/app/[vertical]/vendor/edit/page.tsx` | enforceVerticalAccess() |
| `src/app/[vertical]/vendor/listings/[listingId]/page.tsx` | enforceVerticalAccess() |
| `src/app/[vertical]/vendor/listings/[listingId]/edit/page.tsx` | enforceVerticalAccess() |

## Git State
- Main branch, commits ahead of origin/main
- Migration 065 NOT YET APPLIED — user needs to apply to Dev + Staging
- Vitest: 342 passing, 67 todo, 0 failures
- TypeScript: 0 errors
