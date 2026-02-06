# Current Task: Codebase Audit & Optimization Plan
Started: 2026-02-06

## Goal
Complete systems review of pricing, availability/cutoff, inventory, and security.
Present audited plan to user for approval before making any changes.

## Status
- [x] Pricing/financial system review
- [x] Availability/cutoff system review
- [x] Inventory management review
- [x] Security & API audit
- [x] Synthesize findings into audited plan
- [ ] User approval
- [ ] Implementation

## Key Findings Summary
- CRITICAL: Race condition in inventory decrement (read-then-write, not atomic)
- CRITICAL: Sensitive data in 211 console.log statements
- HIGH: Cart validation skips private pickup cutoff checks
- HIGH: No inventory re-validation at Stripe session creation
- HIGH: N+1 queries in checkout/success (sequential per-listing)
- MEDIUM: LOW_STOCK_THRESHOLD duplicated in 3 files
- MEDIUM: Missing rate limiting on admin endpoints
- GOOD: Unified pricing module correctly used everywhere
- GOOD: Security headers excellent
- GOOD: Stripe webhook verification solid
- GOOD: Idempotency on payment processing works correctly

## Approved Implementation Plan

| Step | What | Files |
|------|------|-------|
| 1 | Atomic inventory decrement (fix race condition) | `checkout/success/route.ts` |
| 2 | Batch inventory queries (combine with step 1) | Same file |
| 3 | Add order ownership check | Same file |
| 4 | Sanitize console.logs + add withErrorTracing to touched routes | ~15 files (see below) |
| 5 | Fix cart validation for all market types | `cart/validate/route.ts` |
| 6 | Add inventory check to session creation | `checkout/session/route.ts` |
| 7 | Centralize LOW_STOCK_THRESHOLD | `constants.ts` + 3 consumer files |
| 8 | Document fee tiers | `vendor-fees.ts`, `pricing.ts` |
| 9 | Rate limit admin routes | Admin route files |

### Step 4 Detail - Error Tracking Upgrade
For routes I'm already touching to clean console.logs:
- Remove ~80 debug console.log statements
- Sanitize ~41 statements logging sensitive data (keep error logging, strip PII)
- Add withErrorTracing() wrapper to routes that don't have it:
  - admin/admins/route.ts
  - admin/feedback/route.ts
  - admin/order-issues/route.ts
  - admin/vendor-activity/settings/route.ts
  - admin/vendor-activity/flags/[id]/route.ts
  - vendor/fees/pay/route.ts
- For checkout/success (already has withErrorTracing): replace manual console.logs with crumb.info() breadcrumbs
- DO NOT touch the ~78 remaining unwrapped routes (do incrementally in future tasks)
