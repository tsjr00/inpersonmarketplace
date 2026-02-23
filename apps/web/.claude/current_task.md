# Current Task: Staging Testing Fixes — Round 2 (12 items)
Started: 2026-02-23

## Goal
Implement 9 bug fixes + 3 changes from staging testing round 2.

## ALL 12 ITEMS IMPLEMENTED — NEEDS VERIFICATION

### Completed Items
- [x] **B5 Part A** — Bumped notification urgencies in `src/lib/notifications/types.ts`:
  - `order_cancelled_by_buyer`: standard → immediate
  - `new_paid_order`: standard → immediate
  - `payout_failed`: standard → urgent
  - `order_cancelled_by_vendor`: urgent → immediate
- [x] **B5 Part B** — Added `severity: 'critical' | 'warning' | 'info'` field to ALL 24 notification types
  - Critical: order_cancelled_by_buyer, order_cancelled_by_vendor, payout_failed, pickup_issue_reported, vendor_quality_alert
  - Warning: new_paid_order, new_external_order, inventory_out_of_stock, inventory_low_stock, external_payment_reminder, vendor_cancellation_warning, issue_disputed
  - Info: everything else
- [x] **B6** — Dashboard notifications: brand colors replace hardcoded blue, maxHeight 280px, severity left-borders/dots, default limit 4
- [x] **B5 Part C** — NotificationBell: severity-aware dots, 60s polling, hasCriticalUnread state. DashboardNotifications: severity left-border + colored dots.
- [x] **B1** — Created `src/app/[vertical]/notifications/page.tsx` — paginated, grouped by date, mark-all-read, severity indicators
- [x] **B2** — OrderCard: `preferred_pickup_time` in interface/display, `formatPickupTime12h()`, pickup badge shows "at 2:30 PM"
- [x] **B3** — OrderCard: payment badge always shows. Stripe=blue "CARD", external=yellow with method name
- [x] **B7** — Cross-sale: API accepts `marketIds`, inner join `listing_markets`, dedup. Checkout passes `marketIds`.
- [x] **C3** — Browse: removed allergen badge from card, moved CutoffBadge to absolute top-right
- [x] **C1** — Dashboard: "Analytics & Insights" consolidated card with Location Insights as second row
- [x] **C4** — Home park: explanation text on home market badge + near "Set as Home Park" button
- [x] **C2** — Multiple trucks: checkbox in EditProfileForm (FT only), saves to `profile_data.multiple_trucks`, quality checks skip conflicts
- [x] **B4** — Buyer order page: ALL confirm()/alert() replaced with ConfirmDialog + inline status banners

### What's Remaining
- [ ] Run `npx tsc --noEmit` — verify 0 type errors
- [ ] Run `npx vitest run` — verify tests pass
- [ ] Fix any errors found

## Files Modified (13 files, 1 new)
1. `src/lib/notifications/types.ts` — severity field + type export, urgency bumps
2. `src/components/notifications/NotificationBell.tsx` — FULL REWRITE: severity dots, 60s polling, critical badge
3. `src/components/notifications/DashboardNotifications.tsx` — FULL REWRITE: brand colors, constrained height, severity borders
4. `src/app/[vertical]/notifications/page.tsx` — **NEW**: full notification list page
5. `src/components/vendor/OrderCard.tsx` — pickup time display, always-show payment badge
6. `src/app/api/listings/suggestions/route.ts` — marketIds filter + dedup
7. `src/app/[vertical]/checkout/page.tsx` — passes marketIds to suggestions API
8. `src/app/[vertical]/browse/page.tsx` — removed allergen badge, moved CutoffBadge top-right
9. `src/app/[vertical]/vendor/dashboard/page.tsx` — consolidated Analytics+Insights card
10. `src/app/[vertical]/vendor/markets/page.tsx` — home park explanation text
11. `src/app/[vertical]/vendor/edit/EditProfileForm.tsx` — multiple trucks checkbox
12. `src/lib/quality-checks.ts` — skip schedule conflicts for multi-truck vendors
13. `src/app/[vertical]/buyer/orders/[id]/page.tsx` — ConfirmDialog + status banners replace all confirm/alert

## Key Design Decisions
- Severity colors: critical=#dc2626 red, warning=#f59e0b yellow, info=transparent/primary
- NotificationBell fetches unread list (not just count) to detect critical severity
- Cross-sale dedup needed because `listing_markets!inner` join returns dupes
- B4 uses single reconfigurable `confirmDialog` state object
- Quality checks query all vendor_profiles for multi-truck flag (ok for nightly cron)
