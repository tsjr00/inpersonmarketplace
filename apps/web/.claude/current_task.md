# Current Task: Session 46/47/48 — Business Rules Audit & Testing Protocol
Started: 2026-02-25 | Updated: 2026-02-26

## Goal
Build a business rules test suite to replace recurring broad audits. Create named workflows + testable rules for 8 domains, then map their interactions.

## Status: ALL 8 DOMAINS MAPPED ✅ — Domain 1 Validated, Domain 2 Being Restructured

## Key Context
- **Reference file**: `apps/web/.claude/business_rules_audit_and_testing.md` — THE persistent document
- **Totals**: 62 named workflows, ~107 business rules (97 original + 10 tip rules), 34 gaps, 17 open questions
- **RULE**: Ask user before making any code changes (user reminded us of this rule during this session)

## ACTIVE WORK — Domain 2 Order Lifecycle Restructure

### What the user asked for:
User wants Domain 2 restructured to clearly differentiate:
1. Buyer-facing process vs vendor-facing process
2. Order status vs financial status
3. Clarify terminology confusion (same terms used for different events/contexts)

### What was done:
- First attempt: Rewrote Domain 2 with separated sections (Terminology table, 4 state machines, buyer lifecycle, vendor lifecycle, reorganized rules by context)
- **User feedback**: "I have to read all of one section then scroll and translate it into another section — just add the clarification into the info that was being presented with each proposed rule so I can see each one as its own thing"

### What the user ACTUALLY wants (not yet done):
- DON'T separate into multiple reference tables that require cross-referencing
- DO add context/clarification INLINE with each business rule so each rule is self-contained
- Each rule should specify: which status type (order/item/payment/payout), which actor (buyer/vendor/cron), and what the term means in THAT specific context
- The reader should understand each rule WITHOUT scrolling to a separate terminology section

### What needs to happen next:
1. Restructure Domain 2 rules so each one is self-explanatory inline
2. Keep the state machine diagrams as quick reference BUT the rules themselves should not depend on reading them
3. Each rule's description should say things like "Item status `pending` (awaiting vendor acceptance) → `confirmed` (vendor accepted)" rather than just "pending → confirmed"

## Code Changes Made (All Sessions — COMMITTED)
1. **Cron Phase 4 tip fix** (`src/app/api/cron/expire-orders/route.ts`)
2. **MP-R5 fix** — `calculateSmallOrderFee` uses displayed subtotal
3. **MP-R13 fix** — per-vertical small order fee config (FM=$10/$1.00, FT=$5/$0.50, FW=$40/$4.00)
4. **Minimum order removal** — removed `meetsMinimumOrder()`, `amountToMinimum()`, `getMinimumOrderCents()`, `VERTICAL_MINIMUM_DEFAULTS`, `FEES.minimumOrderCents`. Added `amountToAvoidSmallOrderFee()`.
- Commit: `cd702f0` — all tests pass (74/74), type-check clean

## Domain 1 Money Path — All Rules Validated ✅
- MP-R1 through MP-R28: ALL confirmed by user

## What's Remaining After Domain 2 Restructure
1. Continue user validation of Domains 2-8 rules
2. Document workflow interactions across all 8 domains
3. User answers remaining open questions (17 total)
4. Write Vitest test files implementing validated business rules

## Key Files
- `apps/web/.claude/business_rules_audit_and_testing.md` — PRIMARY reference (read FIRST)
- `apps/web/.claude/current_task.md` — THIS FILE (session state)
- `src/lib/pricing.ts` — Modified (all pricing changes committed)
- `src/app/api/cron/expire-orders/route.ts` — Modified (Phase 4 tip fix committed)

## Critical Facts for Domain 2 Restructure
- `handed_off` is NOT a DB enum — it's computed in buyer orders API when item DB status is `fulfilled` but `buyer_confirmed_at` is NULL
- `expired` is also display-only — computed from `cancelled` + cancellation source
- DB enums: order_status (pending/paid/completed/cancelled/refunded), order_item_status (pending/confirmed/ready/fulfilled/cancelled/refunded), payment_status (pending/processing/succeeded/failed/cancelled/refunded/partially_refunded), payout_status (pending/processing/completed/failed/cancelled)
- Confirmation window: 30s hardcoded, buyer sets `buyer_confirmed_at` + `confirmation_window_expires_at`, vendor must click fulfill within window
- Cron Phase 7 auto-fulfills stale windows >5min
- Cancellation fees: within 1hr or pre-confirm = 100% refund; after 1hr + confirmed = 75% refund, 25% fee (13% platform, 87% vendor)
