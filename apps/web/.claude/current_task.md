# Current Task: Vendor Page Layout Tightening + UX Fixes
Started: 2026-03-10

## Goal
Fix 8 recurring layout anti-patterns across vendor-facing pages to reduce scrolling and improve readability.

## What's Been Completed This Session

### Commit 1: `2896260` — 5 UX fixes (pushed to staging)
- Fix 1: Listing form labels — "Units in Stock", "Serving Size", "Unit Size / Amount"
- Fix 2: Events empty state + CTA on `/markets?type=event`
- Fix 3: Deep dive documentation series added to backlog
- Fix 4: 10 notification actionUrls fixed (orders→/vendor/orders, pickup→/vendor/pickup, etc.)
- Fix 5: Vendor socials premium tier gate removed (all vendors can add website/socials)

### Commit 2: `2b28533` — Layout tightening on edit profile page (pushed to staging)
- Yellow notice box: icon inline with bold text, helper spans full width
- Image upload: helper text below preview row, button centered, hints combined
- Business info: removed nested red border, reduced input padding/spacing
- Certifications: badge above details (not columns), details on one line
- Event readiness: utensils/seating radios stacked vertically, removed conditional indentation
- Trial banner: icon inline with text, reduced padding
- Upgrade page: tier button padding 14→10px

### Commit 3: `db6a103` — Layout tightening on markets + pickup pages (pushed to staging `ab7b89a`)
- Markets: 3 icon+text boxes fixed (onboarding, suggestion guide, cutoff notice)
- Pickup: 1 window-expired box fixed + 2 empty state padding reductions

### Commit 4 (pending): Major markets page restructure + cross-page cleanup
**Markets page (6 fixes):**
1. Market cards: name full width across top (removed space-between flex)
2. Home market badge + helper text on same line below name (not trapped in flex)
3. Non-home: "Set as Home" button on line below name with helper inline
4. Unattended markets collapsed to compact checkbox rows (expandedMarketIds state)
5. Events section: helper text full width, button below (not space-between)
6. Gap between Events and Private Pickups sections (marginBottom: 24)
- Also: coordinates info box + expiration date box icon-inline fix
- Also: suggest market section header restructured (same pattern as events)
- Also: suggestion cards simplified (removed empty space-between wrapper)
- Also: private pickups header restructured (same pattern)
- Button padding reduced across all sections (8px→6px, 16px→12px)

**Other pages cleaned up:**
- FeeBalanceCard.tsx: removed empty space-between wrapper (title only, nothing on right)
- PaymentMethodsCard.tsx: same cleanup
- orders/page.tsx: Stripe Setup Required box — icon inline with text

## Key Decisions
- Icon+text pattern fix: Put icon inline with bold text on same line, helper text below spans full width
- Radio options with long labels: Stack vertically (flexDirection: column) instead of horizontal
- Conditional fields: Remove paddingLeft indentation — conditional visibility is sufficient context
- Input minHeight: 44→38 for form inputs, 48→44 for submit buttons
- Button padding: Reduce to 8-10px vertical for single-line text
- Nested borders: Remove inner borders when parent card already provides visual containment
- Unattended markets: Collapse to compact checkbox rows, expand on click/check
- Section headers: Title → helper text full width → button below (not space-between with button)
- space-between OK for card headers with short title + small action link (dashboard cards)
- space-between NOT OK for sections with long helper text + large buttons

## Files Modified This Session
- `apps/web/src/app/[vertical]/vendor/edit/page.tsx`
- `apps/web/src/app/[vertical]/vendor/edit/EditProfileForm.tsx`
- `apps/web/src/app/[vertical]/vendor/edit/EventReadinessForm.tsx`
- `apps/web/src/components/vendor/ProfileImageUpload.tsx`
- `apps/web/src/components/vendor/CertificationsForm.tsx`
- `apps/web/src/components/vendor/TrialStatusBanner.tsx`
- `apps/web/src/app/[vertical]/vendor/dashboard/upgrade/page.tsx`
- `apps/web/src/app/[vertical]/vendor/listings/ListingForm.tsx`
- `apps/web/src/app/[vertical]/markets/page.tsx`
- `apps/web/.claude/backlog.md`
- `apps/web/src/lib/notifications/types.ts`
- `apps/web/src/app/api/vendor/profile/route.ts`
- `apps/web/src/app/[vertical]/vendor/markets/page.tsx` (major restructure)
- `apps/web/src/app/[vertical]/vendor/pickup/page.tsx`
- `apps/web/src/app/[vertical]/vendor/dashboard/FeeBalanceCard.tsx`
- `apps/web/src/app/[vertical]/vendor/dashboard/PaymentMethodsCard.tsx`
- `apps/web/src/app/[vertical]/vendor/dashboard/orders/page.tsx`

## Git State
- Branch: main, 33 commits ahead of origin/main (32 + pending uncommitted)
- Staging: synced at `ab7b89a` (commit 3)
- Pending: commit 4 changes ready to commit
