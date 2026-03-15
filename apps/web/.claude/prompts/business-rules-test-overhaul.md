# Prompt: Business Rules Extraction & Functional Test Overhaul

## Context for Claude

You are working on a multi-vertical marketplace app (Farmers Marketing + Food Truck'n). The app has ~900+ tests, but many of them are **static analysis tests** that read source files as strings and check for keywords — they verify *form* (does the file exist, does it contain this word) but not *function* (does the logic produce the correct output for a given input). A test that checks `expect(file).toContain('cutoff')` will pass whether the cutoff logic is correct, backwards, or completely broken.

**The goal of this session is to produce two deliverables:**
1. A comprehensive, authoritative **Business Rules Document** extracted from the actual codebase
2. A set of **functional tests** that validate those rules by testing inputs and outputs — not by string-matching source files

---

## Phase 1: Audit Existing Tests (Research Only)

Before writing anything, understand what exists. Read every test file under `src/lib/__tests__/` and categorize each test as one of:

| Category | Definition | Example |
|----------|-----------|---------|
| **Functional** | Calls a real function with inputs, asserts outputs | `expect(calculateCancellationFee({...})).toBe(270)` |
| **Integration** | Hits a real database or service, asserts results | `expect(rpcResult.is_accepting).toBe(true)` |
| **Static (strong)** | Reads source to verify a structural invariant that CAN'T be tested functionally (e.g., "this file imports from X, not Y") | `expect(route).toContain('get_listings_accepting_status')` — valid because the alternative is calling the wrong RPC |
| **Static (weak)** | Reads source to check for a keyword that proves nothing about correctness | `expect(file).toContain('cutoff')` — passes even if cutoff logic is inverted |

Write results to `.claude/business-rules-test-audit.md` as a table:

```
| Test File | Test Name | Category | Business Rule | Notes |
```

**Do NOT change any code in this phase.** Research only.

---

## Phase 2: Extract Business Rules from Code

For each major system area below, read the actual implementation code (not tests, not docs — the code that runs in production) and extract every business rule as a numbered, testable statement.

### System Areas to Cover

**A. Pricing & Fees**
- Files: `src/lib/pricing.ts`, `src/lib/constants.ts`
- Rules about: platform fee %, buyer fee %, flat fee, how fees are calculated, rounding behavior
- Every fee percentage and dollar amount must be explicitly stated with its source

**B. Cancellation & Refunds**
- Files: `src/lib/payments/cancellation-fees.ts`, `src/app/api/buyer/orders/[id]/cancel/route.ts`, `src/app/api/vendor/orders/[id]/reject/route.ts`
- Rules about: grace periods per vertical, fee percentages, fee split (platform vs vendor), refund calculation, which statuses can be cancelled

**C. Order Lifecycle**
- Files: `src/lib/orders/status-transitions.ts`, all routes under `src/app/api/vendor/orders/[id]/` and `src/app/api/buyer/orders/`
- Rules about: valid status transitions, who can trigger which transition, what side effects each transition has (notifications, inventory, payouts)

**D. Availability & Cutoffs**
- Files: SQL function `get_available_pickup_dates()` (read from migration files in `supabase/migrations/applied/`), `src/lib/utils/availability-status.ts`, `src/types/pickup.ts`
- Rules about: cutoff hours per vertical/market type, FT same-day ordering, FT catering lead time, vendor attendance requirements, timezone handling, badge derivation logic

**E. Vendor Tiers & Limits**
- Files: `src/lib/vendor-limits.ts`, `src/lib/constants.ts`
- Rules about: what each tier allows (listing count, market count, features), tier names per vertical, trial system behavior

**F. Inventory**
- Files: `atomic_decrement_inventory` RPC (in migrations), checkout flow
- Rules about: quantity can never go negative, concurrent purchase handling, stock tracking

**G. Notifications**
- Files: `src/lib/notifications/types.ts`, `src/lib/notifications/service.ts`
- Rules about: which events trigger which notification types, channel priorities (push vs SMS vs email), deduplication, vertical-specific behavior

**H. Vendor Onboarding**
- Files: `src/app/api/vendor/onboarding/status/route.ts`, related routes
- Rules about: 4 gates for publishing, COI requirements, partner agreement, grandfathering

**I. Payments & Payouts**
- Files: `src/lib/payments/`, payout-related routes, Stripe webhook handler
- Rules about: when vendor gets paid, payout calculation, market box payout timing, double-payout prevention, tip handling

**J. Cron Jobs**
- Files: `src/app/api/cron/expire-orders/route.ts` and other cron routes
- Rules about: what each phase does, timing, no-show detection, trial lifecycle, subscription expiry

### Business Rule Format

Each rule must be:
- **Numbered** with a domain prefix (e.g., `PF-001` for Pricing & Fees)
- **Stated as a testable assertion** — "When X, then Y" or "X must always be Z"
- **Sourced** — which file and line number implements this rule
- **Typed** — whether it's testable as a unit test (pure function), integration test (needs DB), or static analysis (structural check)

Example:
```
PF-001: Platform fee is 6.5% of food subtotal, rounded to nearest cent.
  Source: src/lib/pricing.ts:23
  Test type: Unit (call calculateBuyerPrice, assert output)

PF-002: Buyer flat fee is $0.15 per ORDER (not per item), prorated across items.
  Source: src/lib/pricing.ts:45
  Test type: Unit (call with different totalItemsInOrder values)

CX-003: Cancellation grace period for food_trucks is 15 minutes.
  Source: src/lib/payments/cancellation-fees.ts:18
  Test type: Unit (call getGracePeriodMs('food_trucks'), assert 900000)
```

Write all rules to `.claude/business-rules-document.md`.

**Do NOT write tests yet. Present the document to the user for review first.**

---

## Phase 3: Identify Test Gaps

Compare the business rules document (Phase 2) against the test audit (Phase 1). For each rule, determine:

1. **Covered functionally** — a test calls the actual function and asserts the correct output. No action needed.
2. **Covered weakly** — a static analysis test checks for a keyword but doesn't verify behavior. Needs a functional test to replace or supplement it.
3. **Not covered** — no test validates this rule. Needs a new test.

Write the gap analysis to `.claude/business-rules-test-gaps.md`.

**Present the gap analysis to the user before writing any tests.**

---

## Phase 4: Write Functional Tests (After User Approval)

For each gap identified in Phase 3, write a test that validates the **business rule**, not the code structure. Follow these principles:

### Test Writing Principles

**1. Test inputs and outputs, not source code.**
```typescript
// BAD — proves nothing about correctness
const file = readFile('src/lib/pricing.ts')
expect(file).toContain('0.065')

// GOOD — proves the function calculates correctly
expect(calculateBuyerPrice(1000)).toBe(1065)
```

**2. Expected values come from the business rule, not the code.**
Before writing any `expect()`, ask: "Where does this expected value come from?" If the answer is "I read it from the code," STOP. The expected value must come from the business rules document, which was derived from the code but stated as an independent specification. If the code later changes to do something different, the test should FAIL — that's the entire point.

**3. Test boundary conditions, not just the happy path.**
For every rule, test:
- The normal case
- The boundary (e.g., exactly at the grace period cutoff)
- The edge case (e.g., zero, null, negative, empty)
- The error case (e.g., invalid status, missing data)

**4. Group tests by business rule, not by file.**
```typescript
describe('PF-001: Platform fee is 6.5% of subtotal', () => {
  it('calculates 6.5% for a $10 item', () => { ... })
  it('rounds to nearest cent', () => { ... })
  it('handles sub-dollar amounts', () => { ... })
})
```

**5. Never skip, conditionally run, or soft-fail a business rule test.**
See CLAUDE.md "Tests Must Never Be Skipped" section. This is an absolute rule.

**6. For rules that require database access — use the existing integration test infrastructure.**

The project already has 3 integration test files that hit the dev Supabase instance. Use the same patterns:

**Existing infrastructure:**
- `src/lib/test-utils/supabase-test-client.ts` — `createTestClient()` creates a service-role client from `.env.local` (bypasses RLS for test setup/teardown)
- `.env.local` must have `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (dev project)
- `TEST_PREFIX = '__test_'` — prefix all test data for identification
- All tests (unit + integration) run under the same `vitest.config.ts` which loads `.env.local`

**Existing integration tests to use as examples:**
- `src/lib/__tests__/db-constraints.integration.test.ts` — tests `atomic_decrement_inventory` RPC, payout unique index
- `src/lib/__tests__/order-lifecycle.integration.test.ts` — tests status transitions, inventory, payouts against real DB
- `src/lib/__tests__/subscription-lifecycle.integration.test.ts` — tests market box subscription rules

**Required patterns for new integration tests:**
```typescript
import { createTestClient } from '../test-utils/supabase-test-client'

let supabase: SupabaseClient
const createdIds: { table: string; id: string }[] = []

beforeAll(async () => {
  supabase = createTestClient()
  // Create test data, push IDs to createdIds[]
})

afterAll(async () => {
  // Delete in reverse FK order
  for (const { table, id } of [...createdIds].reverse()) {
    await supabase.from(table).delete().eq('id', id)
  }
  // Delete test auth user if created
})
```

**Rules:**
- Do NOT mock the database — call the real dev instance
- Do NOT skip tests when the database isn't available — fail loudly with a clear error
- Always clean up test data in `afterAll` (reverse FK order)
- Use `__test_` prefix in emails, order numbers, etc. for easy identification
- New integration test files should be named `[domain].integration.test.ts` and placed in `src/lib/__tests__/integration/` or `src/lib/__tests__/`

**7. Static analysis tests are acceptable ONLY for structural invariants.**
A static analysis test is valid when the thing being tested is "which function does this call site use" — because calling the wrong function is a category of bug that can't be caught by testing the right function's output. Example: verifying that the browse page calls `get_listings_accepting_status` (the SQL RPC) instead of `calculateMarketAvailability` (the deleted JS function) is a legitimate structural check.

### Where to Put Tests

- **Pure function tests** (pricing, fees, formatting, status derivation): `src/lib/__tests__/[domain].test.ts`
- **Integration tests** (database RPCs, triggers, constraints): `src/lib/__tests__/integration/[domain].test.ts`
- **Structural/coverage tests** (call site verification): keep in `business-rules-coverage.test.ts` but only for legitimate structural checks

### What to Do with Weak Static Tests

**Do NOT modify or delete existing tests.** All current test files stay exactly as they are. The existing `business_rules_audit_and_testing.md` and all current test files are off-limits for changes in this session.

Instead:
1. Write all new functional tests in **new test files** alongside the existing ones
2. Name them clearly to distinguish: `[domain]-functional.test.ts` or similar
3. The new tests stand on their own — they are a parallel set that validates behavior

After this session is complete, the user will compare the old and new test files side by side in a separate session to merge the best of both — keeping strong structural checks from the old set and functional behavior validation from the new set. That consolidation is out of scope for this session.

---

## Constraints

- **Report mode until Phase 4.** Phases 1-3 are research only. No code changes without user approval.
- **Incremental research protocol.** Write findings to working files after each system area. Do not research everything then write from memory.
- **ABSOLUTE RULE: Never change a test to match code.** If code behavior conflicts with a business rule, flag it — do not silently align the test with the code. See CLAUDE.md for the full rule.
- **Present deliverables for user review** at the end of Phase 2 and Phase 3 before proceeding.
- **Scope control.** This session is about business rules and tests. Do not fix bugs, refactor code, or add features — even if you find issues during the audit. Document them in the gap analysis and move on.

---

## Success Criteria

When this session is complete:
1. Every business rule in the app is documented with a number, a testable statement, and a source location
2. Every business rule has at least one **new** functional test that validates behavior (not form)
3. All new tests are in **new files** — no existing test files or the `business_rules_audit_and_testing.md` were modified
4. The test suite catches real bugs: if someone inverts a fee calculation, changes a grace period, or breaks a status transition, a test fails
5. The business rules document serves as a living spec that future sessions can reference
6. A follow-up session can compare old and new test files to merge the strongest coverage from both
