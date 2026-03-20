# Current Task: Session 62 — Independent Audit + Fixes
Started: 2026-03-20

## Goal
Comprehensive independent audit → fix authorized items

## Completed Fixes

### E-3: Resolve-issue refund now includes buyer fees (FIXED)
- `api/vendor/orders/[id]/resolve-issue/route.ts` — refund amount now calculates `subtotal + 6.5% + prorated $0.15` (matches reject route)
- Added imports for `FEES` and `proratedFlatFeeSimple`
- Documented in decisions.md: platform absorbs Stripe processing fee on refunds

### E-5: Admin approval tier assignment (FIXED)
- `api/admin/vendors/[id]/approve/route.ts:85` — changed `'basic'`/`'standard'` → `'free'`
- Notification label changed to `'Free'`

### E-7: Event invite now checks event_approved (FIXED)
- `api/admin/events/[id]/invite/route.ts:101` — added `.eq('event_approved', true)` filter

### E-10: Admin vendor table tier filter (FIXED)
- `admin/vendors/VendorsTableClient.tsx:221-225` — dropdown now shows Free/Pro/Boss instead of Standard/Premium/Featured

### E-11: Admin vendor/listing tier badge colors (FIXED)
- `admin/vendors/VendorsTableClient.tsx:351-357` — colors keyed on 'pro'/'boss' instead of 'premium'/'featured'
- `admin/listings/ListingsTableClient.tsx:301-312` — same fix, hide badge for 'free' instead of 'standard'
- Both tables now capitalize tier name for display

### E-13: Inventory restore vertical-aware (FIXED)
- `api/vendor/orders/[id]/resolve-issue/route.ts:146-149` — FT fulfilled items no longer restore inventory (cooked food can't be resold). FM items and non-fulfilled items still restore.

### E-15: Event requests reject past dates (FIXED)
- `api/event-requests/route.ts` — validates `event_date >= today` before inserting

### E-18: JSONB race condition on doc upload (FIXED)
- `api/vendor/onboarding/category-documents/route.ts` — optimistic concurrency with `updated_at` check + retry (max 3 attempts)

### E-24: Where-today rate limit (FIXED)
- `api/trucks/where-today/route.ts` — added `checkRateLimit()` with `rateLimits.api`

### E-3 UI: Vendor resolve-issue UI (BUILT)
- `components/vendor/OrderCard.tsx` — issue alert box with "Resolve Issue" button, plus resolved display
- `app/[vertical]/vendor/orders/page.tsx` — `handleResolveIssue` handler + passed to OrderCard
- `api/vendor/orders/route.ts` — added `issue_status` and `issue_resolved_at` to API response

### E-4: Admin order issues page (BUILT)
- `app/admin/order-issues/page.tsx` — new page with status filter tabs, issue cards, inline edit (status + notes)
- `app/admin/layout.tsx` — added "Order Issues" nav link

## Documented
- External payment fee flow documented in `decisions.md` with all 5 file paths
- Refund policy (platform absorbs Stripe fee) documented in `decisions.md`
- Refund amount formula documented in `decisions.md`

## Files Modified
- `src/app/api/admin/vendors/[id]/approve/route.ts` — tier fix
- `src/app/api/admin/events/[id]/invite/route.ts` — event_approved check
- `src/app/api/vendor/orders/[id]/resolve-issue/route.ts` — refund math + inventory logic
- `src/app/api/vendor/orders/route.ts` — issue fields in response
- `src/app/api/event-requests/route.ts` — past date validation
- `src/app/api/trucks/where-today/route.ts` — rate limit
- `src/app/api/vendor/onboarding/category-documents/route.ts` — JSONB race fix
- `src/app/admin/vendors/VendorsTableClient.tsx` — tier names + colors
- `src/app/admin/listings/ListingsTableClient.tsx` — tier names + colors
- `src/components/vendor/OrderCard.tsx` — issue UI
- `src/app/[vertical]/vendor/orders/page.tsx` — resolve handler
- `src/app/admin/order-issues/page.tsx` — NEW admin page
- `src/app/admin/layout.tsx` — nav link
- `.claude/decisions.md` — 3 new entries + flow documentation

## Still Pending from Audit
- E-12: Migration 085 verification (user to run query)
- E-14: Vendor expiration notification (backlog)
- E-20: Vendor notification i18n (backlog)
- E-21: Timezone centralization (needs design discussion)
- E-22: Geocode/browse silent failure (needs investigation with user)
- E-25: UserRole dedup (simple fix, not yet authorized)
- BR-1 through BR-10: Business rules documentation
- T-1 through T-10: Missing test coverage
- Opportunities 1-4: Feature builds
