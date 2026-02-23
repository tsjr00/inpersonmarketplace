# Current Task: Staging Round 2 — Follow-up Fixes
Started: 2026-02-23

## Status
ALL 4 FINDINGS COMPLETE + TERMINOLOGY + LOOKBACK WINDOWS + BLOCKING BANNER.
0 type errors, 94 tests pass. Ready for commit + push to staging.

## Stale Confirmed Order System (F4 complete)

### Notification Timeline
- **Day 0 midnight** (end of pickup day): First vendor notification (`stale_confirmed_vendor`) — "Missed Order — Action Needed"
- **Day 1 during**: Second vendor notification (`stale_confirmed_vendor_final`) — "Order Action Required — App Blocked" + Buyer notification (`stale_confirmed_buyer`)
- **Day 1 midnight** (2 days after pickup): Blocking banner activates in vendor UI

### Blocking Banner (OrderCard.tsx)
- Detects items where `status='confirmed'` and `pickup_date` is 2+ days past (browser local time)
- Shows RED blocking banner: "Overdue Order — Action Required"
- Two resolution buttons:
  - "Yes, Order Was Completed" → marks items ready→fulfilled (triggers payout)
  - "There Was a Problem" → rejects items (triggers refund)
- ALL other item action buttons hidden while blocked (same pattern as external payment blocking)
- Wired into both dashboard orders page AND standalone orders page

### Cron Phase 4.5 Timing
- Buyer lookback: 3 days
- Vendor first notification: day 1 (pickup was yesterday)
- Vendor final notification: day 2 (blocking imminent)
- All dedup via notifications table

## Terminology Refinement ✅
**Principle**: Pre-checkout = "Select a pickup time" (preference). Post-vendor-confirmation = "Confirmed/Scheduled pickup" (commitment).

## All Files Modified This Session
1. `src/app/[vertical]/vendor/dashboard/orders/page.tsx` — Full rewrite (F3) + stale order handler
2. `src/components/notifications/NotificationBell.tsx` — 3-tier badge colors (F2)
3. `src/app/api/buyer/orders/route.ts` — Added preferred_pickup_time (F1)
4. `src/app/[vertical]/buyer/orders/page.tsx` — Display pickup time + terminology (F1)
5. `src/lib/notifications/types.ts` — 3 new notification types (F4): stale_confirmed_buyer, stale_confirmed_vendor, stale_confirmed_vendor_final
6. `src/app/api/cron/expire-orders/route.ts` — Phase 4.5 day-based timing (F4)
7. `src/components/vendor/OrderCard.tsx` — Stale confirmed blocking banner + terminology
8. `src/app/[vertical]/vendor/pickup/page.tsx` — "Scheduled pickup:" label
9. `src/app/[vertical]/vendor/markets/[id]/prep/page.tsx` — "Scheduled:" label
10. `src/app/[vertical]/checkout/success/page.tsx` — confirmed_pickup_time display
11. `src/app/api/checkout/success/route.ts` — Added preferred_pickup_time to query
12. `src/app/[vertical]/vendor/orders/page.tsx` — Stale order handler + prop wiring

## Repo State
- Main branch, uncommitted changes
- 0 type errors, 94 tests pass
- NOT yet committed or pushed
