# Current Task: Session 35 Audit Fixes + Error Resolution Strategy
Started: 2026-02-19

## Goal
Fix critical/high issues from audit, then build Layer 1 of error resolution strategy.

## Audit Report
**Full report:** `apps/web/.claude/session35_audit_report.md`
**Error strategy:** `apps/web/.claude/error_resolution_strategy.md`

## Status: Layer 1 ALL 4 ITEMS COMPLETE. TSC CLEAN. Ready to commit.

## Phase 1 (Critical Fixes) — ALL COMPLETE
- [x] C1: `src/lib/stripe/config.ts` — STRIPE_CONFIG imports from FEES (pricing.ts)
- [x] C2: `src/lib/stripe/webhooks.ts` — FT subscription cancel downgrades to 'free'
- [x] C3: `src/lib/vendor-limits.ts` + `src/lib/constants.ts` + `new/page.tsx` — canCreateListing + getListingLimit accept vertical
- [x] C4: `src/lib/notifications/types.ts` — all 19 action URL fallbacks fixed farmers-market→farmers_market
- [x] C5: REVISED — see Layer 1 Item 1

## Layer 1 Error Resolution (4 items) — ALL COMPLETE
### Item 1: Revert C5 + split gate — DONE
- `src/lib/errors/with-error-tracing.ts` — renamed shouldShowErrorCodes→shouldShowErrorDetails
- `src/lib/errors/traced-error.ts` — toResponse() always includes code, only hides pgDetail in prod
- `src/lib/errors/types.ts` — updated TracedErrorResponse comment, added userGuidance/selfResolvable/retryable to ErrorCatalogEntry

### Item 2: Add userGuidance to error catalog — DONE
- All 6 catalog files populated: auth-errors, cart-errors, order-errors, db-errors, rls-errors, market-box-errors
- ~40 entries total with userGuidance, selfResolvable, and retryable fields

### Item 3: Update ErrorDisplay to show guidance — DONE
- `src/components/ErrorFeedback.tsx` — imports lookupError, shows userGuidance prominently
- selfResolvable errors show subtle "Still having trouble?" link instead of Report button
- Non-resolvable errors keep the bordered "Report this error" button

### Item 4: Fix critical severity alert bug — DONE
- `src/lib/errors/logger.ts` — alerts on both 'high' and 'critical' severity

## All Files Modified This Session
- `src/lib/stripe/config.ts` — C1
- `src/lib/stripe/webhooks.ts` — C2
- `src/lib/vendor-limits.ts` — C3
- `src/lib/constants.ts` — C3
- `src/app/[vertical]/vendor/listings/new/page.tsx` — C3
- `src/lib/notifications/types.ts` — C4
- `src/lib/errors/with-error-tracing.ts` — C5/Item 1
- `src/lib/errors/traced-error.ts` — Item 1
- `src/lib/errors/types.ts` — Item 1+2
- `src/lib/errors/catalog/auth-errors.ts` — Item 2
- `src/lib/errors/catalog/cart-errors.ts` — Item 2
- `src/lib/errors/catalog/order-errors.ts` — Item 2
- `src/lib/errors/catalog/db-errors.ts` — Item 2
- `src/lib/errors/catalog/rls-errors.ts` — Item 2
- `src/lib/errors/catalog/market-box-errors.ts` — Item 2
- `src/lib/errors/logger.ts` — Item 4
- `src/components/ErrorFeedback.tsx` — Item 3
- `apps/web/.claude/session35_audit_report.md` — status updates
- `apps/web/.claude/error_resolution_strategy.md` — NEW

## Key Context
- 28 commits ahead of origin/main (production push pending from prior sessions)
- All Phase 1 + Layer 1 fixes are code-only — no migrations
- TSC clean after all changes
- Phase 2 (H1-H11) not started yet
- User wants error codes VISIBLE (helps reporting). Only pgDetail hidden in prod.
