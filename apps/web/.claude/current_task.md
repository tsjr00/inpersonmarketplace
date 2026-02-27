# Current Task: Session 46/47/48/49 — Business Rules Audit & Testing Protocol
Started: 2026-02-25 | Updated: 2026-02-26

## Goal
Build a business rules test suite to replace recurring broad audits. Create named workflows + testable rules for 8 domains, then map their interactions.

## Status: Domains 1-3 Under Validation — Code Changes In Progress

## Key Context
- **Reference file**: `apps/web/.claude/business_rules_audit_and_testing.md` — THE persistent document
- **RULE**: Ask user before making any code changes (user reminded us of this rule during this session)

## Code Changes Made (All Sessions)

### Committed: `cd702f0`
1. **Cron Phase 4 tip fix** (`src/app/api/cron/expire-orders/route.ts`)
2. **MP-R5 fix** — `calculateSmallOrderFee` uses displayed subtotal
3. **MP-R13 fix** — per-vertical small order fee config (FM=$10/$1.00, FT=$5/$0.50, FW=$40/$4.00)
4. **Minimum order removal** — removed dead code, added `amountToAvoidSmallOrderFee()`

### Committed: `ed20081`
5. **OL-R5** — Cancel route: blocklist → allowlist (`pending`, `confirmed`, `ready`)
6. **OL-R7/R8** — Per-vertical early cancel windows (FM=1hr, FT=15min)
7. **OL-R14** — Migration 055: per-vertical item expiration (FT=24hr from creation, FM=24hr after pickup window)

### Uncommitted (this session)
8. **OL-R17 / Phase 3.5** — Per-vertical external payment reminder (FT=15min, FM=12hr). Was hardcoded 2hr.
9. **VI-R14** — FT lead time 30→31 minutes in `time-slots.ts`

## Domain Validation Progress

### Domain 1 Money Path — All Rules Validated ✅
- MP-R1 through MP-R28: ALL confirmed by user
- MP-Q1: CODE VERIFIED — fees always identical
- MP-Q2: CONFIRMED — External: Buyer 6.5%, Vendor 3.5%
- MP-Q3: CONFIRMED — Not shown to buyer. T&C only.

### Domain 2 Order Lifecycle — Partially Validated
- OL-R1 through OL-R15: CONFIRMED ✅
- OL-R16: CONFIRMED with per-vertical timing (code already correct)
- OL-R17: CONFIRMED with per-vertical timing → CODE CHANGED (FT=15min, FM=12hr)
- OL-R18: CONFIRMED + need to document cash status progression (OL-Q7)
- OL-R19: NEEDS USER DECISION on FT time-aware no-show (OL-Q8)
- OL-R20 through OL-R22: NOT YET REVIEWED by user
- New questions: OL-Q5 (Chef/Market Box Phase 3), OL-Q6 (Chef/Market Box Phase 3.5), OL-Q7 (cash progression), OL-Q8 (FT no-show timing)

### Domain 3 Vertical Isolation — Partially Validated
- VI-R1: CONFIRMED ✅
- VI-R2: CONFIRMED + strengthened (no data crosses verticals except platform admin)
- VI-R3: CONFIRMED + corrected (ONLY platform admin sees cross-vertical)
- VI-R4: CONFIRMED ✅
- VI-R5: CONFIRMED ✅
- VI-R6: CONFIRMED + clarified (notification-only emails)
- VI-R7: CONFIRMED ✅
- VI-R8: CONFIRMED + question about other vertical terms (VI-Q4/Q5)
- VI-R9: CONFIRMED ✅
- VI-R10: CONFIRMED ✅ (code already correct: No Tip, 10%, 15%, 20%, Custom)
- VI-R11: CONFIRMED ✅
- VI-R12: CONFIRMED ✅
- VI-R13: CONFIRMED ✅
- VI-R14: CORRECTED → CODE CHANGED (FT 31min lead time, FM 18hr/10hr cutoffs)
- VI-R15: CORRECTED (FT same-day + 31min lead, FM 7-day window with auto-drop)
- New questions: VI-Q4 (other vertical terms), VI-Q5 (missing term differences)

### Domains 4-8: NOT YET REVIEWED by user

## Open Questions Awaiting User Input
- OL-Q1 GAP: Vendor confirm route has no time check — should it reject expired items?
- OL-Q5: Chef Box / Market Box corollary for Phase 3 cancellation timing?
- OL-Q6: Chef Box / Market Box corollary for Phase 3.5 reminder timing?
- OL-Q7: Cash order full status progression — user referenced prior conversation
- OL-Q8: FT no-show detection — should it use pickup_date + preferred_pickup_time?
- VI-Q1: Cross-vertical auth — shared identity intentional?
- VI-Q2: Root admin unscoped queries — intentional?
- VI-Q3: Referral codes — vertical-scoped?
- VI-Q4/Q5: Other vertical-specific terms?

## Key Files
- `apps/web/.claude/business_rules_audit_and_testing.md` — PRIMARY reference
- `apps/web/.claude/current_task.md` — THIS FILE
- `src/lib/payments/cancellation-fees.ts` — Per-vertical grace periods
- `src/app/api/cron/expire-orders/route.ts` — Phase 3.5 per-vertical reminders
- `src/lib/utils/time-slots.ts` — FT 31min lead time
- `supabase/migrations/20260226_055_per_vertical_item_expiration.sql` — Pending migration
