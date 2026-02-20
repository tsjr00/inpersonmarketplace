# Current Task: Session 36 — Medium Items Batch 2 IN PROGRESS
Started: 2026-02-19

## STATUS: M3+M4, M18, M19, M21, M22 DONE. TSC clean. ALL UNCOMMITTED.

## CANONICAL REFERENCE
**`apps/web/.claude/session36_audit_report.md`** — Master todo list with checkboxes.

## COMMITTED + PUSHED (from earlier in session — 5 commits)
- **ffdd0de**: C1-C7 critical fixes (on prod + staging)
- **7fc84f3**: H1-H17 high priority fixes (on prod + staging)
- **7dea597**: H5,H7,H9-H11,H18,M10 (staging only)
- **2542f66**: H15,H16,H19 (staging only)
- **a5cb8e6**: M2,M5,M9,M13,M15,M16,M25 quick wins (staging only)
- **main is 3 commits ahead of origin/main** (7dea597, 2542f66, a5cb8e6)

## MIGRATION 036 — APPLIED TO ALL 3 ENVS ✅ (moved to applied/)

## UNCOMMITTED CHANGES — Batch 2 (ready to commit)

### M21: Vendor markets page — non-approved vendor banner — DONE
- Files: `src/app/api/vendor/markets/route.ts`, `src/app/[vertical]/vendor/markets/page.tsx`
- API: Added `status` to vendor_profiles select, returns `vendorStatus` in response
- Page: Added `vendorStatus` state, shows yellow "Complete Your Setup" banner when status !== 'approved'
- Banner has link back to dashboard, explains pending approval

### M22: Market Boxes dashboard card — upgrade prompt for free FT — DONE
- File: `src/app/[vertical]/vendor/dashboard/page.tsx`
- Added `import { getTierLimits } from '@/lib/vendor-limits'`
- Checks `getTierLimits(vendorProfile.tier, vertical).totalMarketBoxes === 0`
- When locked: dimmed card style + amber "Upgrade to Basic or higher" message
- Card stays as Link (user said "keep visible and accessible")

### M18: Vendor signup file upload wired up — DONE
- File: `src/app/[vertical]/vendor-signup/page.tsx`
- Added `useRef` import, `fileObjectsRef` to store actual File objects
- File input now stores File object + displays filename
- After successful form submit, uploads files to `/api/vendor/onboarding/documents?vertical=` API
- Non-blocking: if upload fails, vendor profile is already created
- Changed hint text from "File upload coming soon" to "Accepted: PDF, JPG, PNG (max 10MB)"
- Added `accept="image/jpeg,image/png,application/pdf"` to file input

### M19: Image upload available on listing creation — DONE
- File: `src/app/[vertical]/vendor/listings/ListingForm.tsx`
- After creating listing, redirects to edit page (`/${vertical}/vendor/listings/${savedListingId}/edit`) instead of listings list
- Updated placeholder text: "After saving, you'll be taken to the edit page where you can upload photos."
- Changed placeholder style from grey to blue info-style to indicate upcoming action

### M3+M4: Hardcoded hex → design tokens — DONE
- **checkout/page.tsx**: All ~20 hex values replaced with design tokens
  - Purple (#F5F3FF, #DDD6FE, #E9D5FF, #A78BFA, #8b5cf6) → colors.primary/primaryLight/border
  - Bootstrap red #dc3545 → statusColors.danger
  - Info blues → statusColors.info/infoLight/infoBorder/infoDark
  - Amber #ffc107 → statusColors.warningBorder
  - Neutral #f8fafc → statusColors.neutral50
- **vendor/markets/page.tsx**: All 152 hex values replaced with design tokens
  - Non-brand purple (#7c3aed, #5b21b6, #6b21a8, #f5f3ff, #ddd6fe) → colors.primary/primaryDark/primaryLight/border
  - Grey scale → statusColors.neutral50-900
  - Semantic colors → statusColors.danger*/warning*/info*/success*
  - Border strings converted from single-quoted to template literals
  - Also added `statusColors, spacing, typography, radius` to imports

## FILES MODIFIED THIS BATCH (7 files)
- `src/app/[vertical]/vendor/dashboard/page.tsx` — M22 (upgrade prompt)
- `src/app/api/vendor/markets/route.ts` — M21 (vendorStatus in response)
- `src/app/[vertical]/vendor/markets/page.tsx` — M21 (banner) + M4 (152 hex → tokens)
- `src/app/[vertical]/vendor-signup/page.tsx` — M18 (file upload wiring)
- `src/app/[vertical]/vendor/listings/ListingForm.tsx` — M19 (redirect to edit after create)
- `src/app/[vertical]/checkout/page.tsx` — M3 (20 hex → tokens)

## REMAINING TASKS (task #33 — not yet started)
User said "resolve others the best way or ask for clarification" for:
- **M1**: Admin layout redirects to `/login` without vertical context
- **M6**: `any` type usage in 41 files (skip — too large, low impact)
- **M7**: No React error boundaries (skip — would be a new system, not a quick fix)
- **M8**: No input sanitization (low risk — Supabase parameterizes, React escapes)
- **M11**: Email template has hardcoded #166534 color (needs brand color from vertical config)
- **M14**: Tier badge component not used consistently
- **M23**: Analytics gating for FT tiers not implemented
- **M24**: N+1 query patterns in 5 API routes
- **M26**: Hardcoded config values
- **M27**: Transfer failure doesn't revert order status

## WHAT'S NEXT
1. **Commit this batch** (7 files for M3+M4, M18, M19, M21, M22)
2. **Push to staging**
3. **Tackle remaining M items** (task #33) — or user decides which to do
4. **User verifies staging**
5. **Push all commits to production** (main is 3+ commits ahead of origin/main)

## TASK LIST STATE
- #29 [completed] M21+M22
- #30 [completed] M18
- #31 [completed] M19
- #32 [in_progress] M3+M4 — DONE, needs commit
- #33 [pending] Remaining medium items
