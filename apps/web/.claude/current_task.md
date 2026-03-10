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
- Files: ListingForm.tsx, markets/page.tsx, backlog.md, notifications/types.ts, ProfileEditForm.tsx, vendor/profile/route.ts, vendor/edit/page.tsx

### Commit 2: `2b28533` — Layout tightening on edit profile page (pushed to staging)
- Yellow notice box: icon inline with bold text, helper spans full width
- Image upload: helper text below preview row, button centered, hints combined
- Business info: removed nested red border, reduced input padding/spacing
- Certifications: badge above details (not columns), details on one line
- Event readiness: utensils/seating radios stacked vertically, removed conditional indentation
- Trial banner: icon inline with text, reduced padding
- Upgrade page: tier button padding 14→10px
- Files: page.tsx, EditProfileForm.tsx, EventReadinessForm.tsx, ProfileImageUpload.tsx, CertificationsForm.tsx, TrialStatusBanner.tsx, upgrade/page.tsx

## What's Remaining — APPROVED BY USER

### Fix icon+text patterns on 2 more pages:

**1. `src/app/[vertical]/vendor/markets/page.tsx`** — HIGH PRIORITY
- 5 instances of icon+text flex-start pattern (lines ~600, ~872, ~915, ~1289, ~1860)
- Fix: Put icon inline with bold text, helper text spans full width (same pattern as yellow notice box fix)

**2. `src/app/[vertical]/vendor/pickup/page.tsx`** — HIGH PRIORITY
- 2 instances of icon+text flex-start pattern (lines ~643, ~1793)
- Excessive padding (40px on lines ~714, ~726)
- Fix: Same icon-inline pattern + reduce padding

**3. `src/app/[vertical]/vendor/dashboard/page.tsx`** — LOW PRIORITY (do if time allows)
- 1 minor icon+text instance (lines ~692-695)

### After fixes:
- Run `npx tsc --noEmit` + `npx vitest run`
- Commit + push staging

## Key Decisions
- Icon+text pattern fix: Put icon inline with bold text on same line, helper text below spans full width
- Radio options with long labels: Stack vertically (flexDirection: column) instead of horizontal
- Conditional fields: Remove paddingLeft indentation — conditional visibility is sufficient context
- Input minHeight: 44→38 for form inputs, 48→44 for submit buttons
- Button padding: Reduce to 8-10px vertical for single-line text
- Nested borders: Remove inner borders when parent card already provides visual containment

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

## Git State
- Branch: main, 31 commits ahead of origin/main
- Staging: synced at `e6ef965`
- 2 uncommitted WIP files: current_task.md, settings.local.json
