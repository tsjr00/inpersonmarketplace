# Current Task: Session 36 — High-Priority Fixes COMPLETE
Started: 2026-02-19

## STATUS: All high-priority fixes DONE. Ready to commit + push staging.

## CANONICAL REFERENCE
**`apps/web/.claude/session36_audit_report.md`** — Master todo list with checkboxes.

## COMMITTED (pushed to staging)
- **ffdd0de**: C1 (tips→vendors), C2+C3 (double payout), C4 (market vertical filter), C6 (module-level clients), C7 (analytics rewrite)

## UNCOMMITTED — ALL HIGH-PRIORITY FIXES COMPLETE

### H1+H20: Refund Full Buyer-Paid Amount ✅
- `vendor/orders/[id]/reject/route.ts`: Calculates `buyerPaidForItem` (subtotal + 6.5% + prorated flat fee)
- `cron/expire-orders/route.ts`: Same pattern for expired items

### H6: Flat Fee Deducted from Vendor Payout ✅
- `checkout/session/route.ts`: `proratedVendorFlatFee` deducted from each item's `vendor_payout_cents`

### H12+H13: Vertical Filter on Onboarding + Stripe Routes ✅
- 7 routes: onboarding/status, documents, coi, acknowledge-prohibited-items, category-documents, stripe/onboard, stripe/status
- All accept `vertical` query param, conditionally filter vendor_profiles
- stripe/status UPDATE fixed to use `.eq('id', vendorProfile.id)` instead of `.eq('user_id', user.id)`

### H4: Vendor Notifications Inside Idempotency Guard ✅
- `checkout/success/route.ts`: Moved vendor notifications inside `if (!existingPayment)` block

### H14: canPublish Initialized to False ✅
- `ListingForm.tsx`: `useState<boolean | null>(null)` → `useState<boolean | null>(false)`

### H8: Admin Notification on New Vendor Application ✅
- `submit/route.ts`: Queries admin users, sends `new_vendor_application` notification

### H2+H3: External Checkout Validation ✅
- `checkout/external/route.ts`: Added cutoff validation (`is_listing_accepting_orders` RPC), inventory check, and `atomic_decrement_inventory` after order creation

### H17: Admin Role Checks Standardized ✅
- 6 routes replaced inline `role === 'admin'` with `hasAdminRole()` (includes platform_admin)
- markets/route.ts, markets/[id]/route.ts, markets/[id]/vendors/[vendorId]/route.ts, markets/[id]/schedules/route.ts, markets/[id]/schedules/[scheduleId]/route.ts, admin/vendor-activity/settings/route.ts

## FILES MODIFIED (uncommitted)
1. `src/app/api/vendor/orders/[id]/reject/route.ts` — H1
2. `src/app/api/cron/expire-orders/route.ts` — H20
3. `src/app/api/checkout/session/route.ts` — H6
4. `src/app/api/vendor/onboarding/status/route.ts` — H12
5. `src/app/api/vendor/onboarding/documents/route.ts` — H12
6. `src/app/api/vendor/onboarding/coi/route.ts` — H12
7. `src/app/api/vendor/onboarding/acknowledge-prohibited-items/route.ts` — H12
8. `src/app/api/vendor/onboarding/category-documents/route.ts` — H12
9. `src/app/api/vendor/stripe/onboard/route.ts` — H13
10. `src/app/api/vendor/stripe/status/route.ts` — H13
11. `src/app/api/checkout/success/route.ts` — H4
12. `src/app/[vertical]/vendor/listings/ListingForm.tsx` — H14
13. `src/app/api/submit/route.ts` — H8
14. `src/app/api/checkout/external/route.ts` — H2+H3
15. `src/app/api/markets/route.ts` — H17
16. `src/app/api/markets/[id]/route.ts` — H17
17. `src/app/api/markets/[id]/vendors/[vendorId]/route.ts` — H17
18. `src/app/api/markets/[id]/schedules/route.ts` — H17
19. `src/app/api/markets/[id]/schedules/[scheduleId]/route.ts` — H17
20. `src/app/api/admin/vendor-activity/settings/route.ts` — H17

## TSC STATUS: CLEAN ✅
