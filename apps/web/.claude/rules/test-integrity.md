# Test Integrity — Tests Are the Spec

**Priority: ABSOLUTE — Tests assert what the business rule SAYS should happen. The code conforms to the test, never the reverse.**

## The Shared Principle

A test that mirrors the code's current behavior catches nothing. It is security theater. The entire point of writing a test against a business rule is to detect the day the code stops doing what the rule requires. Modifying the test to "make it pass" deletes that detection capability and substitutes false confidence for real verification.

This file consolidates four rules that share a single root pattern. Each rule starts with a mechanical gate — the gate is the rule. The narrative below explains why and shows what failure looks like.

The four rules name specific ways test-integrity gets eroded:

1. **Don't change a test's expected value to match the code's actual value.**
2. **Don't skip, conditional-skip, or soft-fail a business rule test.**
3. **Don't pre-plan test modifications inside an implementation plan.**
4. **Don't ship a feature that breaks a cross-file integration without an integrity test catching it.**

---

## Rule 1: Never Change a Business Rule Test to Match Code

**This is the single most important rule in this file.**

### THE GATE — Run before writing or modifying any test assertion

Before writing or modifying any `expect(...)` line, ask:

1. **Where does this expected value come from?**
   - "I read it from the business rule spec" → OK to write
   - "I read it from the code being tested" → **STOP.** Find the business rule spec. If no spec exists, flag to the user — do NOT silently use the code's value.
   - "I'm changing the test because it's failing" → **STOP.** A failing test is a decision point, not a to-do item. Present the conflict to the user (see "When Code and Business Rule Conflict" below).

2. **Is the expectation a count-only assertion** (e.g., `expect(arr.length).toBe(4)`)?
   - YES → upgrade it to assert specific values: `expect(arr).toEqual([...])`. Counts pass when the wrong items are present.

If you find yourself reasoning "the test expectation is wrong" before you've read the business rule, STOP. The test is the spec. The code's behavior is the suspect.

### The Rule

When writing or maintaining a test that validates a business rule:

1. **The test asserts what the business rule says SHOULD happen.** Period.
2. **If the code does something different from what the business rule says, THAT IS A BUG IN THE CODE — not a problem with the test.**
3. **You must NEVER change a test expectation to match code behavior.** The test is the specification. The code must conform to the test, not the other way around.

### When Code and Business Rule Conflict

If you discover that the code does X but the business rule says Y:

1. **STOP.** Do not change the test. Do not change the code.
2. **Explicitly state to the user:** "CONFLICT: Business rule [ID] says [Y], but the code does [X]. The test should assert [Y]. The code needs to be fixed, or the business rule needs to be updated by the user. I will not change either without your direction."
3. **Leave the test asserting the business rule (Y).** A failing test that documents correct behavior is infinitely more valuable than a passing test that validates a bug.
4. **Add a comment in the test** explaining the conflict: `// BUG: Code does X. Business rule [ID] requires Y. Code needs fix.`

### Incident: Session 55

- `atomic_decrement_inventory` uses `GREATEST(0, qty - n)` which silently allows overselling. The business rule (MP-R8) says "quantity never goes negative." Claude changed the test from "rejects negative" to "clamps to zero" — validating the bug instead of catching it.
- `status-transitions.ts` uses `confirmed`/`fulfilled` but the business rules spec says `paid`/`completed`. Claude built 29 tests using the code's names without checking the spec.
- 13 tests in `vendor-limits.test.ts` had expected values copied directly from code constants with no independent specification.
- `vertical-config.test.ts` had `display_name` expectation changed from "Farmers Marketing" to "Farmers Market" to match code output without asking if the code was correct.

Full audit: `apps/web/.claude/business_rules_audit_and_testing.md` → "SESSION 55 TEST INTEGRITY AUDIT"

### Why This Is an Absolute Failure

- **Tests exist to catch bugs.** A test that mirrors code behavior catches nothing. It is security theater.
- **Business rules represent real money, real vendors, real buyers.** A vendor getting shorted, a buyer being overcharged, or inventory going negative are not abstract — they are financial harm.
- **Every test changed to match code is a test that will never catch the bug it was designed to find.** The bug is now invisible.

### This Rule Cannot Be Overridden

No autonomy mode, no auto-continue prompt, no time pressure, no "just make the tests pass" instruction overrides this rule. If the user explicitly says "change the test to match the code," confirm that they understand the business rule conflict first.

---

## Rule 2: Tests Must Never Be Skipped, Conditional, or Soft-Failed

**A test that doesn't run is not a test. It is a lie.**

### THE GATE — Run before writing or modifying test setup code

Before writing or modifying any test file, scan for these patterns. If you're about to add or keep any of them in a business rule test file, **STOP** and present to user:

- `describe.skip(`
- `it.skip(`
- `xit(`
- `xdescribe(`
- `describe.runIf(`
- `it.runIf(`
- `it.todo(` — only acceptable if the test is converted to a real test in the same session
- Conditional `return` at the top of a test that bypasses execution based on env vars

If a test cannot run because infrastructure is missing, the correct response is to make the infrastructure available — not to silence the test.

### The Rule

1. **Never use `describe.skip`, `it.skip`, `describe.runIf`, or conditional test execution on business rule tests.** Every business rule test must run and must pass.

2. **No sub-system takes priority over the main system.** CI pipelines, deployment workflows, preview environments, and automation tooling exist to serve the app. If a sub-system (like CI) would break because a test actually runs, the sub-system must be fixed to support the test — not the other way around.

3. **If a test requires infrastructure (database, API keys, external service), that infrastructure must be available in every environment where tests run.** If it isn't available, the test suite should fail loudly. Silent skips hide problems; loud failures surface them.

4. **`it.todo()` is only acceptable as a temporary placeholder during active development of a new test.** It must be converted to a real test in the same session.

### Incident: Session 56

Claude proposed wrapping database integration tests in `describe.runIf(process.env.SUPABASE_URL)` so they would "skip gracefully in CI." This means: if the app has a database bug that violates a business rule, CI would pass green, the code would deploy, and the bug would reach production. The test existed specifically to catch that bug — and Claude's instinct was to silence it to avoid a CI failure.

This is exactly backward. **A CI failure that catches a real bug is the system working correctly. A CI pass that hides a real bug is the system failing silently.**

### The Priority Hierarchy Is Absolute

**App correctness > test accuracy > CI green > deployment speed > developer convenience.**

Every decision about test configuration must respect this hierarchy. When in doubt, choose the option that makes failures louder, not quieter.

---

## Rule 3: Never Pre-Plan Test Modifications

**If "update tests" appears in your task list or implementation plan, you have already failed.**

### THE GATE — Run before TaskCreate, ExitPlanMode, or writing to current_task.md / *_research.md / *_plan.md

Before creating any task, finalizing any plan, or writing to any working file, scan the content for these keywords (case-insensitive, as substrings):

- `update test`
- `update tests`
- `fix failing test`
- `fix the test`
- `fix the tests`
- `update baseline`
- `update test baseline`
- `adjust assertion`
- `update assertion`
- `update test expectations`
- `make the test pass`
- `make the tests pass`

If ANY of these are present, **STOP**. Do not create the task. Do not finalize the plan. Do not write the file. Send the user this message:

> "I was about to plan a step containing [exact phrase] in [task / plan / file]. That's a red flag for the never-pre-plan-test-modifications rule (test-integrity.md Rule 3). Test failures are decision points, not to-do items. Either:
> (a) The plan needs to remove that step, OR
> (b) You need to explicitly authorize test baseline changes — and explain which tests, why, and what the new expected values should match against (the business rule, not the code).
> Which?"

This scan applies regardless of whether the test change "feels obviously needed." Test baseline changes have their own approval gate, separate from code change approval.

### Why This Anti-Pattern Sneaks In

When you author both the code change and the test update in the same mental plan, the tests stop functioning as an independent gate. They become part of "your implementation" rather than a specification that your implementation must satisfy. The fact that you wrote the tests yourself, or that the user approved the code change, does NOT give you permission to modify test expectations.

### Incident: Session 59

Claude implemented an ISR refactor on the browse page. Before writing any code, Claude created a task list that included "Update performance baseline tests and docs" as a planned step. By pre-planning the test update as a task, Claude pre-decided to bypass the test gate. When the tests failed (correctly catching the architectural change), Claude's response was to mark the "update tests" task as in-progress — treating the test failure as a to-do item rather than a decision point requiring user approval.

The user caught this. **A test failure is always a decision point, never a to-do item.**

### The Rule

If you find yourself adding "update tests" or "fix failing tests" to a task list or implementation plan, STOP. That is a red flag. You have pre-decided to bypass the test gate. Instead:

1. Implement the code change
2. Run the tests
3. If tests fail, STOP and present the before/after to the user
4. Wait for explicit approval to update the test baselines
5. Only then update the tests

This applies to ALL test types — business rules, performance baselines, integration tests. **Approval to change code is NOT approval to change test expectations.**

---

## Rule 4: Flow Integrity Tests — Run on Every Feature Audit

### THE GATE — Run when adding any new cross-file contract

When building a feature that creates a new cross-file contract, before considering the feature complete, identify which contract was added and add a flow-integrity test for it:

- **New auth flow?** Add the redirect path and target page verification to the "Auth flow integrity" section.
- **New API consumed by frontend?** Add a contract test to "Frontend-backend param contracts".
- **New RPC?** Add it to the "RPC usage completeness" list (or document why it's intentionally unused).
- **New payment model?** Add checkout + fulfillment path tests.
- **New status field?** Add reachability + exit path tests.

If you skip this step, the next time the feature breaks, no test will catch it — and the feature will look correct in every individual file it touches.

### When to Run

**Automatic (every commit)**: Flow integrity tests are part of the vitest suite at `src/lib/__tests__/flow-integrity.test.ts`. They run on every commit via the pre-commit hook. **If a flow integrity test fails, do NOT modify the test — fix the code.** (See Rule 1.)

**Manual (feature audits)**: When auditing a feature area, run the Level 1 flow traces from `apps/web/.claude/flow-integrity-protocol.md`. This means actually reading the code at each step of the user journey — not summarizing from memory.

### Incident: Session 68

Signup confirmation emails linked to `/dashboard` which requires auth, but auth couldn't succeed until `verifyOtp()` was called on that page. Each file was correct alone. The bug was the missing connection between them. No file-level audit caught it because there was nothing wrong to find — only something missing to find.

Flow integrity tests catch bugs that file-level audits miss because they assert that pieces work TOGETHER, not just that each piece works alone.

---

## Cannot Be Overridden

No autonomy mode, no auto-continue prompt, no time pressure, no "just make the tests pass" instruction overrides any rule in this file.
