# Current Task: Legal Terms System — 3-Tier Agreement Pages + Database Tracking
Started: 2026-03-04

## Goal
Implement a 3-tier legal agreement system with separate pages per tier, per-vertical content, database tracking, and integration into vendor signup + onboarding flows.

## Current Status — ALL 6 BATCHES COMPLETE

### Batch 1: COMPLETE — Migration + API Route
- `supabase/migrations/20260304_068_user_agreement_acceptances.sql` — CREATE TABLE, indexes, RLS
- `src/app/api/user/accept-agreement/route.ts` — POST handler with auth, rate limiting, validation
- Migration NOT YET APPLIED to any environment

### Batch 2: COMPLETE — Legal Content Data Layer
- `src/lib/legal/types.ts` — LegalSection, LegalDocument, VerticalPlaceholders, AgreementType interfaces
- `src/lib/legal/placeholders.ts` — FM + FT placeholder mappings (10 placeholders)
- `src/lib/legal/resolve.ts` — resolvePlaceholders() function
- `src/lib/legal/content/platform-user-agreement.ts` — Document 1 (13 articles)
- `src/lib/legal/content/vendor-service-agreement.ts` — Document 2 (5 articles)
- `src/lib/legal/content/vendor-partner-agreement.ts` — Document 3 (7 articles)
- `src/lib/legal/content/privacy-policy.ts` — Document 4 (12 sections)
- `src/lib/legal/index.ts` — barrel export + CURRENT_AGREEMENT_VERSION = '2026-03-v1'

### Batch 3: COMPLETE — Shared Rendering Component
- `src/components/legal/LegalDocument.tsx` — client component rendering LegalDocument structures
  - Placeholder resolution, ToC with hash-scroll, design tokens styling
  - Bold text parsing (**text**), all-caps detection for disclaimers
  - `id` attribute on document title (privacy-policy, platform_user, etc.) for anchor links

### Batch 4: COMPLETE — Terms Pages
- `src/app/[vertical]/terms/page.tsx` — REPLACED (was 801 lines → now ~35 lines)
  - Renders Document 1 (Platform User Agreement) + Document 4 (Privacy Policy)
- `src/app/[vertical]/terms/layout.tsx` — metadata, indexable
- `src/app/[vertical]/terms/vendor/page.tsx` — Document 2 (Vendor Service Agreement), noindex
- `src/app/[vertical]/terms/vendor/layout.tsx` — metadata with noindex
- `src/app/[vertical]/terms/partner/page.tsx` — Document 3 (Vendor Partner Agreement), noindex
- `src/app/[vertical]/terms/partner/layout.tsx` — metadata with noindex

### Batch 5: COMPLETE — Integration Points
**5a. Vendor Signup — Tier 2 Checkbox** (`src/app/[vertical]/vendor-signup/page.tsx`)
- Added `vendorServiceAgreement: false` to acknowledgments state
- Added 6th checkbox with link to `/{vertical}/terms/vendor` (new tab)
- Added non-blocking `fetch('/api/user/accept-agreement')` after successful submit

**5b. Onboarding Status API** (`src/app/api/vendor/onboarding/status/route.ts`)
- Added query for `user_agreement_acceptances` for `vendor_partner` type
- Added `partnerAgreementAccepted` boolean to response JSON
- Added grandfathering: `isGrandfathered = !!verification.onboarding_completed_at`
- Updated `canPublishListings` to require `(isGrandfathered || partnerAgreementAccepted)`

**5c. Onboarding Checklist** (`src/components/vendor/OnboardingChecklist.tsx`)
- Added `partnerAgreementAccepted?: boolean` and `onboardingCompletedAt?: string | null` to OnboardingStatus interface
- Added `partnerAgreementChecked` and `acceptingPartner` state variables
- Added `handleAcceptPartnerAgreement()` handler calling `POST /api/user/accept-agreement`
- Added amber Tier 3 acceptance card (shown when all gates complete, vendor approved, not grandfathered, not yet accepted)
- Card includes: link to read agreement, checkbox to confirm reading, accept button
- Imported `CURRENT_AGREEMENT_VERSION` from `@/lib/legal`

**5d. Vendor Dashboard** (`src/app/[vertical]/vendor/dashboard/page.tsx`)
- Added "Legal Agreements" section after Promote & Grow
- 3 links: Platform User Agreement, Vendor Service Agreement, Vendor Partner Agreement
- Partner link only visible when `vendorProfile.status === 'approved'`

### Batch 6: COMPLETE — Peripheral Updates
- `#privacy-policy` anchor: Fixed by adding `id` attribute to document title in `LegalDocument.tsx`
- `#sms-terms` anchor: Already works — `sms-terms` section exists in platform-user-agreement.ts
- Footer.tsx (`#privacy-policy`), SettingsForm.tsx (`#sms-terms`, `#privacy-policy`), privacy redirect page — all working

## Key Decisions
- **Grandfathering**: Existing approved vendors are grandfathered — no Tier 3 requirement
- **Per-vertical separation**: Each vertical gets own terms via placeholder resolution
- **noindex on Tier 2+3**: robots meta tag prevents search indexing
- **No auth-gating**: URLs aren't secret, protection is in signed acceptance records
- **Agreement version**: `2026-03-v1` stored as constant in `src/lib/legal/index.ts`

## TypeScript Status
- `npx tsc --noEmit` passes with 0 errors after ALL batches

## Files Created (14 new files)
1. `supabase/migrations/20260304_068_user_agreement_acceptances.sql`
2. `src/app/api/user/accept-agreement/route.ts`
3. `src/lib/legal/types.ts`
4. `src/lib/legal/placeholders.ts`
5. `src/lib/legal/resolve.ts`
6. `src/lib/legal/content/platform-user-agreement.ts`
7. `src/lib/legal/content/vendor-service-agreement.ts`
8. `src/lib/legal/content/vendor-partner-agreement.ts`
9. `src/lib/legal/content/privacy-policy.ts`
10. `src/lib/legal/index.ts`
11. `src/components/legal/LegalDocument.tsx`
12. `src/app/[vertical]/terms/layout.tsx`
13. `src/app/[vertical]/terms/vendor/page.tsx` + `layout.tsx`
14. `src/app/[vertical]/terms/partner/page.tsx` + `layout.tsx`

## Files Modified (5 files)
- `src/app/[vertical]/terms/page.tsx` — REPLACED (801→35 lines)
- `src/app/[vertical]/vendor-signup/page.tsx` — added 6th checkbox + accept-agreement API call
- `src/app/api/vendor/onboarding/status/route.ts` — added partner acceptance check + grandfathering
- `src/components/vendor/OnboardingChecklist.tsx` — added Tier 3 acceptance UI
- `src/app/[vertical]/vendor/dashboard/page.tsx` — added Legal Agreements section

## Critical Reference Files
1. `docs/Legal_Terms_Attorney_Ready.md` — source of truth for all legal content (897 lines)
2. `apps/web/.claude/legal_terms_reference.md` — 13 codebase findings backing the legal content
3. `docs/Legal_Strategy_Layered_Business_Relationships.md` — tier framework strategy
4. Plan file: `C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md`

## Git State
- All changes uncommitted
- No new commits since session start
- Main branch, no staging push needed yet

## Next Steps
- Commit all changes
- Apply migration 068 to Dev environment
- Push to staging for testing
- Update SCHEMA_SNAPSHOT.md after migration is confirmed applied
