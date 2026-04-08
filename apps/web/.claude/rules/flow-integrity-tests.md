# RULE: Flow Integrity Tests — Run on Every Feature Audit

**Priority: HIGH — These tests catch bugs that file-level audits miss.**

## What This Is

Flow integrity tests verify cross-file contracts: auth redirects land on pages with handlers, APIs return fields frontends read, RPCs are actually called, status transitions are reachable. See `.claude/flow-integrity-protocol.md` for the full protocol.

## When to Run

### Automatic (every commit)
Flow integrity tests are part of the vitest suite at `src/lib/__tests__/flow-integrity.test.ts`. They run on every commit via the pre-commit hook. **If a flow integrity test fails, do NOT modify the test — fix the code.**

### Manual (feature audits)
When auditing a feature area, run the Level 1 flow traces from `.claude/flow-integrity-protocol.md`. This means actually reading the code at each step of the user journey — not summarizing from memory.

## How to Add Tests

When building a feature that creates new cross-file contracts:

1. **New auth flow?** Add the redirect path and target page verification to the "Auth flow integrity" section.
2. **New API consumed by frontend?** Add a contract test to "Frontend-backend param contracts".
3. **New RPC?** Add it to the "RPC usage completeness" list (or document why it's intentionally unused).
4. **New payment model?** Add checkout + fulfillment path tests.
5. **New status field?** Add reachability + exit path tests.

## Why This Exists

Session 68: signup confirmation emails linked to `/dashboard` which requires auth, but auth couldn't succeed until `verifyOtp()` was called on that page. Each file was correct alone. The bug was the missing connection between them. No file-level audit caught it because there was nothing wrong to find — only something missing to find.
