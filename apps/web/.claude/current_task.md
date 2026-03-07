# Current Task: Session 51 — Payment Method Display/Filter + Available Now Toggle

Started: 2026-03-07

## POST-COMPACTION: STOP and wait for user instructions before making any changes.

## Goal
Two features from tester feedback:
1. **Payment method display + filter** on Vendors page, listing detail, vendor profile
2. **"Available Now" segmented control** on Browse page

## Plan File
`C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md` — approved by user

## Key Decisions Made
- Payment badges: **outlined grey pills** (border: 1px solid #6b7280, transparent bg) — NOT colored fills
- Payment filter goes on **Vendors page** (not Browse listings) — payment is a vendor-level attribute
- Listing detail: payment methods go **above Add to Cart button** (not in "Sold by" card — too low on page)
- "Available Now" toggle: segmented control, uses `branding.colors.primary` for active state
- No migrations needed — payment columns already exist in vendor_profiles

## What's Been Completed

### Earlier this session (before these features):
- [x] Global CLAUDE.md created at `C:\Users\tracy\.claude\CLAUDE.md`
- [x] Removed dual-session autonomy grants from 5 build instruction files + deleted test-autonomy folder (commit `54a5469`)
- [x] Added post-compaction STOP rule to both global and project CLAUDE.md (commit `9a26f79`)

### Feature 1: Payment Methods (Steps 1-5 of 10)
- [x] **Step 1**: Created `src/components/vendor/PaymentMethodBadges.tsx` — reusable outlined pill component
- [x] **Step 2**: Updated `src/app/[vertical]/vendors/page.tsx` — added payment columns to query, `?payment=` param, filter logic, enriched vendor objects with `paymentMethods`
- [x] **Step 3**: Updated `src/app/[vertical]/vendors/VendorFilters.tsx` — added Payment dropdown (All Payments / Cards / Venmo / Cash App / PayPal / Cash)
- [x] **Step 4**: Updated `src/app/[vertical]/vendors/VendorsWithLocation.tsx` — extended interface, added PaymentMethodBadges to vendor cards, passes `payment` param to API
- [ ] **Step 5**: `src/app/api/vendors/nearby/route.ts` — **PARTIALLY DONE**:
  - ✅ PostGIS path: payment columns added to SELECT, paymentMethods in enrichment, payment filter added, `payment` param parsed
  - ✅ Fallback function signature updated to accept `payment` param
  - ❌ Fallback path: payment columns NOT yet added to SELECT query (line ~370)
  - ❌ Fallback path: paymentMethods NOT yet added to enrichment (line ~425)
  - ❌ Fallback path: payment filter NOT yet added (after line ~449)

### Feature 1: Remaining (Steps 6-7)
- [ ] **Step 6**: `src/app/[vertical]/listing/[listingId]/page.tsx` — add payment columns to query, display above Add to Cart
- [ ] **Step 7**: `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` — add PaymentMethodBadges display

### Feature 2: Available Now Toggle (Steps 8-10)
- [ ] **Step 8**: Create `src/app/[vertical]/browse/AvailabilityToggle.tsx`
- [ ] **Step 9**: Update `src/app/[vertical]/browse/page.tsx` — availability pre-filter + toggle rendering
- [ ] **Step 10**: Update `src/app/[vertical]/browse/SearchFilter.tsx` — preserve `available` param

## Files Modified This Session
- `C:\Users\tracy\.claude\CLAUDE.md` (global) — created
- `CLAUDE.md` (project) — post-compaction STOP rule
- `docs/Build_Instructions/Build_Instructions_Archive/Build_Instructions_Component_Library.md` — stripped autonomy
- `docs/Build_Instructions/Build_Instructions_Archive/Initialize_Logs.md` — stripped autonomy
- `docs/Build_Instructions/Build_Instructions_Archive/Save_Docs_to_Git.md` — stripped autonomy
- `docs/Build_Instructions/Build_Instructions_Archive/CC_End_of_Session_Protocol.md` — stripped parallel ref
- `docs/Build_Instructions/Build_Instructions_TEMPLATE.md` — stripped autonomy
- `apps/web/docs/test-autonomy/` — deleted
- `src/components/vendor/PaymentMethodBadges.tsx` — NEW
- `src/app/[vertical]/vendors/page.tsx` — payment query + filter
- `src/app/[vertical]/vendors/VendorFilters.tsx` — payment dropdown
- `src/app/[vertical]/vendors/VendorsWithLocation.tsx` — badges + filter pass
- `src/app/api/vendors/nearby/route.ts` — PARTIALLY updated (PostGIS path done, fallback incomplete)

## Git State
- Commits this session: `54a5469` (autonomy cleanup), `9a26f79` (post-compaction rule)
- All feature work is UNCOMMITTED
- Branch: main, up to date with origin/main at `d27817e` (prior commits not yet pushed)

## Gotchas
- Nearby API has TWO paths: PostGIS (primary) and fallback. BOTH need payment columns + filter
- `stripeChargesEnabled` prop exists on PaymentMethodBadges but is unused — Cards badge always shows
- Vendor profile page uses `select('*')` so payment data is already fetched — just needs display component
