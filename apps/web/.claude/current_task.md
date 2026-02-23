# Current Task: Cash Order Two-Step Flow + Deferred Fees
Started: 2026-02-23

## Status
IMPLEMENTATION COMPLETE. 0 type errors, 94 tests pass.
Ready for commit + push to staging.

## What Changed — Cash Order Flow
**Problem:** Cash orders used single-step `confirm-cash-complete` that recorded fees + fulfilled instantly. Vendor couldn't prep in advance, got charged fees even if buyer no-showed.

**Fix:** Cash now follows same Confirm → Ready → Fulfill pipeline as Stripe/digital. Fees deferred to fulfill time.

### New Cash Lifecycle
1. Buyer places cash order → `pending`
2. Vendor confirms ability → order `paid`, items `confirmed` (NO fees recorded)
3. Vendor marks ready → items `ready`, buyer notified
4. Buyer shows up, pays cash → vendor fulfills → fees recorded NOW
4b. Buyer no-shows → vendor clicks "Buyer Didn't Show Up" → item cancelled, no fees

## All Files Modified (this commit, not yet committed)

### Backend
1. `src/app/api/vendor/orders/[id]/confirm-external-payment/route.ts` — Skip `recordExternalPaymentFee()` when `payment_method === 'cash'`
2. `src/app/api/vendor/orders/[id]/fulfill/route.ts` — Added `recordExternalPaymentFee` import, added `subtotal_cents` + `vendor_profile_id` to select, records cash fees at fulfill time
3. `src/app/api/vendor/orders/[id]/confirm-cash-complete/route.ts` — DEPRECATED: returns 410 Gone
4. `src/app/api/cron/expire-orders/route.ts` — Phase 3.5: removed 'cash' from payment_method list (no more "unconfirmed payment" reminders for cash)

### UI
5. `src/components/vendor/OrderCard.tsx` — Cash banner: blue "Confirm Order" (was green "Confirm Cash & Complete"). Dialog: "Confirm you can prepare this order...customer will pay cash when they arrive." Removed `onConfirmCashComplete` prop. Added "Buyer Didn't Show Up" button for cash orders in `ready` status. Cash confirm now calls `onConfirmExternalPayment` (same endpoint).
6. `src/app/[vertical]/vendor/dashboard/orders/page.tsx` — Removed `handleConfirmCashComplete` handler and prop
7. `src/app/[vertical]/vendor/orders/page.tsx` — Removed `handleConfirmCashComplete` handler and prop

## Previous Commit (already pushed to staging: a6ad62e)
Staging round 2 follow-ups: stale order blocking + pickup terminology + notifications
- F1: Buyer orders show confirmed pickup time
- F2: NotificationBell 3-tier severity badge
- F3: Vendor dashboard orders rewrite using shared OrderCard
- F4: Stale confirmed order system with blocking banner
- 3 notification types: stale_confirmed_buyer, stale_confirmed_vendor, stale_confirmed_vendor_final

## All Files Modified This Full Session (both commits)
1. `src/app/[vertical]/vendor/dashboard/orders/page.tsx` — Full rewrite + stale handler + removed cash-complete
2. `src/components/notifications/NotificationBell.tsx` — 3-tier badge colors
3. `src/app/api/buyer/orders/route.ts` — Added preferred_pickup_time
4. `src/app/[vertical]/buyer/orders/page.tsx` — Display pickup time + terminology
5. `src/lib/notifications/types.ts` — 3 new notification types + stale_confirmed_vendor_final
6. `src/app/api/cron/expire-orders/route.ts` — Phase 4.5 + removed cash from Phase 3.5
7. `src/components/vendor/OrderCard.tsx` — Stale blocking + cash two-step + no-show button
8. `src/app/[vertical]/vendor/pickup/page.tsx` — "Scheduled pickup:" label
9. `src/app/[vertical]/vendor/markets/[id]/prep/page.tsx` — "Scheduled:" label
10. `src/app/[vertical]/checkout/success/page.tsx` — confirmed_pickup_time display
11. `src/app/api/checkout/success/route.ts` — Added preferred_pickup_time to query
12. `src/app/[vertical]/vendor/orders/page.tsx` — Stale handler + removed cash-complete
13. `src/app/api/vendor/orders/[id]/confirm-external-payment/route.ts` — Skip fees for cash
14. `src/app/api/vendor/orders/[id]/fulfill/route.ts` — Record cash fees at fulfill time
15. `src/app/api/vendor/orders/[id]/confirm-cash-complete/route.ts` — Deprecated (410)

## Repo State
- Main branch, uncommitted changes (cash flow changes)
- Previous commit a6ad62e already pushed to staging
- 0 type errors, 94 tests pass
- NOT yet committed — needs commit + push to staging

## Key Design Decisions
- Cash confirm uses SAME `confirm-external-payment` endpoint (just skips fee recording)
- Fees recorded at fulfill time via `recordExternalPaymentFee()` in fulfill endpoint
- "Buyer Didn't Show Up" uses existing reject flow (cancels item, restores inventory, no fees since none recorded)
- Existing buyer handoff confirmation + issue reporting system handles dispute guard (no new code needed)
- Admin can issue fee credit via existing `recordFeeCredit()` if dispute arises
