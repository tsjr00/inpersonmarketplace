# Current Task: Session 36 — Medium Priority Quick Wins COMPLETE
Started: 2026-02-19

## STATUS: ALL 7 medium quick wins DONE. TSC clean. UNCOMMITTED — ready to commit + push staging.

## CANONICAL REFERENCE
**`apps/web/.claude/session36_audit_report.md`** — Master todo list with checkboxes.

## COMMITTED + PUSHED TO STAGING (4 commits from earlier in session)
- **ffdd0de**: C1-C7 critical fixes
- **7fc84f3**: H1-H17 high priority fixes
- **7dea597**: H5,H7,H9-H11,H18,M10 (Wave 1+2)
- **2542f66**: H15,H16,H19 (Wave 3: Stripe Gate 4, downgrade timing, no-show vendor payout)
- ffdd0de + 7fc84f3 also on production. 7dea597 + 2542f66 on staging only.
- **main is 2 commits ahead of origin/main** — needs prod push after staging verification.

## MIGRATION 036 — APPLIED TO ALL 3 ENVS ✅ (moved to applied/)

## UNCOMMITTED CHANGES — 7 Medium Quick Wins (ready to commit)

### M2: Admin layout use hasAdminRole() — DONE
- File: `src/app/[vertical]/admin/layout.tsx`
- Replaced inline `role === 'admin' || roles.includes('admin')` with `hasAdminRole()` from `@/lib/auth/admin`
- Now catches `platform_admin` role too

### M5: Vendor dashboard parallel queries — DONE
- File: `src/app/[vertical]/vendor/dashboard/page.tsx`
- Stage 1: `auth.getUser()` (must be first)
- Stage 2: `Promise.all([vendorProfile, userProfile])` — both need only user.id
- Stage 3: `Promise.all([9 queries])` — all need only vendorProfile.id (drafts, out-of-stock, low-stock, private pickups, vendor schedules, home market, pending orders, needs fulfillment, upcoming pickups)
- Reduced from 12 sequential queries to 3 sequential stages

### M9: canAddTraditionalMarket missing vertical param — DONE
- File: `src/lib/vendor-limits.ts`
- Added `vertical?: string` param to: `canAddTraditionalMarket`, `canAddPrivatePickup`, `getVendorUsageSummary`
- All pass `vertical` to `getTierLimits(tier, vertical)` so FT vendors get FT limits
- Param is optional — existing callers are backward-compatible

### M13: Deduplicate VENDOR_LIMITS — DONE
- Files: `src/lib/constants.ts`, `src/app/[vertical]/vendor-signup/page.tsx`
- Removed `VENDOR_LIMITS` object from constants.ts (was duplicate of TIER_LIMITS in vendor-limits.ts)
- Updated `getListingLimit()` to use `getTierLimits(tier, vertical).productListings` for ALL verticals
- Updated `getMarketLimit()` to use `getTierLimits(tier, vertical).traditionalMarkets` + added `vertical` param
- Updated vendor-signup caller to pass `vertical` to `getMarketLimit(tier, vertical)`
- Re-exported `VendorTier` type from vendor-limits.ts instead of deriving from VENDOR_LIMITS

### M15: Add rate limiting to 12 routes — DONE
- 12 routes added (excluded 2 cron routes + 1 webhook with signature verification)
- Routes added:
  1. `buyer/market-boxes/[id]/route.ts` — rateLimits.api
  2. `buyer/orders/[id]/route.ts` — rateLimits.api
  3. `cart/items/route.ts` — rateLimits.api
  4. `cart/route.ts` — rateLimits.api
  5. `checkout/success/route.ts` — rateLimits.api
  6. `market-boxes/[id]/route.ts` — rateLimits.api
  7. `user/notifications/route.ts` — rateLimits.api (GET), rateLimits.submit (PUT)
  8. `user/profile/route.ts` — rateLimits.submit
  9. `vendor/market-boxes/pickups/[id]/skip/route.ts` — rateLimits.submit
  10. `vendor/market-boxes/pickups/route.ts` — rateLimits.api
  11. `vendor/onboarding/status/route.ts` — rateLimits.api
  12. `vendor/orders/[id]/confirm-handoff/route.ts` — rateLimits.submit
- Also added `request: NextRequest` param to `user/notifications` GET handler (was `GET()`)

### M16: Add withErrorTracing to 3 routes — DONE
- Files:
  1. `buyer/orders/[id]/rate/route.ts` — wrapped both POST + GET handlers
  2. `vendor/market-boxes/pickups/[id]/skip/route.ts` — wrapped POST handler
  3. `vendor/orders/[id]/confirm/route.ts` — wrapped POST handler
- Each handler extracts params before the wrapper so route path includes the ID

### M25: Deduplicate ZIP_LOOKUP — DONE
- Created: `src/lib/geocode.ts` — shared ZIP_LOOKUP (merged superset with city/state) + geocodeZipCode()
- Updated: `vendor/markets/route.ts` — removed 80 lines, imports from geocode.ts
- Updated: `vendor/markets/[id]/route.ts` — removed 70 lines, imports from geocode.ts
- Updated: `buyer/location/geocode/route.ts` — removed 22-line ZIP_LOOKUP, imports from geocode.ts

## FILES MODIFIED THIS BATCH (26 files)
- `src/app/[vertical]/admin/layout.tsx` — M2
- `src/app/[vertical]/vendor-signup/page.tsx` — M13 caller
- `src/app/[vertical]/vendor/dashboard/page.tsx` — M5
- `src/app/api/buyer/location/geocode/route.ts` — M25
- `src/app/api/buyer/market-boxes/[id]/route.ts` — M15
- `src/app/api/buyer/orders/[id]/rate/route.ts` — M16 + M15 (already had RL)
- `src/app/api/buyer/orders/[id]/route.ts` — M15
- `src/app/api/cart/items/route.ts` — M15
- `src/app/api/cart/route.ts` — M15
- `src/app/api/checkout/success/route.ts` — M15
- `src/app/api/market-boxes/[id]/route.ts` — M15
- `src/app/api/user/notifications/route.ts` — M15
- `src/app/api/user/profile/route.ts` — M15
- `src/app/api/vendor/market-boxes/pickups/[id]/skip/route.ts` — M16 + M15
- `src/app/api/vendor/market-boxes/pickups/route.ts` — M15
- `src/app/api/vendor/markets/[id]/route.ts` — M25
- `src/app/api/vendor/markets/route.ts` — M25
- `src/app/api/vendor/onboarding/status/route.ts` — M15
- `src/app/api/vendor/orders/[id]/confirm-handoff/route.ts` — M15
- `src/app/api/vendor/orders/[id]/confirm/route.ts` — M16
- `src/lib/constants.ts` — M13
- `src/lib/geocode.ts` — M25 (NEW FILE)
- `src/lib/vendor-limits.ts` — M9
- `.claude/current_task.md` — this file
- `.claude/session36_audit_report.md` — checkboxes updated

## WHAT'S NEXT
1. **Commit this batch** — all 26 files
2. **Push to staging** (merge main → staging → push)
3. **User verifies staging**
4. **Push all 3 commits** (7dea597 + 2542f66 + this) to production
5. **Remaining medium items** (not quick wins — user reviewing): M1, M3, M4, M6, M7, M8, M11, M12, M14, M18, M21, M22, M23, M24, M26, M27
6. **Low priority items**: L1-L12

## USER NOTES
- User is reviewing the other medium items (M3, M4, M18, M19, M21, M22) while I do quick wins
- All critical + high priority items are DONE
- Only medium (M1-M27) and low (L1-L12) priority remain
