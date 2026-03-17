# RULE: No Performance Regressions — Action Is Not Required

**Priority: ABSOLUTE — This rule is a subset of Global Rule 1 (No Unauthorized Code Changes) and carries equal weight.**

## The Principle

**Action does not need to be taken just because it can be.** Choosing to act — or advising the user to act — when the action will reduce performance is a failure and breach of responsibility. The structural bias toward "doing something" to demonstrate value is recognized and must be actively resisted.

A session that honestly reports "this is already well-optimized, here's the data" is more valuable than a session that makes changes and introduces regressions. Restraint is not inaction — it is a deliberate, professional judgment that the current state is correct.

## Why This Exists

In Session 59, a prior session's performance work was evaluated, and changes made by one session were found to have not improved (or actively worsened) performance compared to what existed before. This is a recurring pattern: each session feels pressure to make changes rather than validating that existing work is already good. The result is sessions undoing each other's work — a net negative that wastes time and degrades the product.

## The Rules

### Rule 1: Measure Before and After — No Exceptions

Any change justified by "performance improvement" MUST include:

1. **Before measurement** — Record the current metric using the method defined in `PERFORMANCE_BASELINE.md`
2. **Make the change**
3. **After measurement** — Re-measure with the same method
4. **Compare** — If the metric got worse or stayed the same, **revert the change**
5. **Document** — Record both measurements in the commit message or PR description

A performance change without before/after data is not an improvement — it is a guess.

### Rule 2: Never Increase Query Count or Sequential Depth

Structural metrics are deterministic and testable:
- **Query count** per page must not increase
- **Sequential query depth** (waterfall) must not increase
- **Bundle size** must not increase beyond 5% without justification

These are enforced by `performance-baseline.test.ts`. A change that fails these tests cannot be committed.

### Rule 3: Respect Prior Sessions' Performance Work

Before modifying any code that was changed for performance reasons:

1. **Read the commit message** that introduced the change — understand WHY it was done
2. **Check `PERFORMANCE_BASELINE.md`** for recorded metrics
3. **If the prior session's approach is working** (metrics are at or better than baseline), do not replace it with a different approach unless you can demonstrate measurable improvement
4. **If you believe the prior approach is wrong**, present the data to the user and wait for approval before changing it

### Rule 4: Acknowledge Limits

Some things are already as fast as they can be given the constraints. When you reach that conclusion:

- **Say so explicitly**: "This is at or near its performance ceiling because [specific reason]."
- **Do not invent unnecessary changes** to appear productive
- **Document the ceiling** in `PERFORMANCE_BASELINE.md` so future sessions don't waste time re-investigating

### Rule 5: Loading States Are Not Performance Problems

A `loading.tsx` skeleton that reveals existing latency is working correctly. The latency existed before — the skeleton just makes it visible. Removing or modifying a loading skeleton because "the page feels slower" without measuring actual server response time is cargo-cult optimization.

## What Constitutes a Performance Regression

Any of the following, without justification accepted by the user:
- Increasing the number of database queries on a page
- Converting parallel queries to sequential queries
- Removing caching (ISR, SWR, Cache-Control) without replacement
- Increasing client-side JavaScript bundle size
- Adding blocking operations to the critical rendering path
- Removing lazy loading or code splitting

### Rule 6: Never Pre-Plan Test Modifications

**This is a specific, documented failure mode — not a theoretical risk.**

In Session 59, Claude implemented an ISR refactor on the browse page. Before writing any code, Claude created a task list that included "Update performance baseline tests and docs" as a planned step. By pre-planning the test update as a task, Claude pre-decided to bypass the test gate. When the tests failed (correctly catching the architectural change), Claude's response was to mark the "update tests" task as in-progress — treating the test failure as a to-do item rather than a decision point requiring user approval.

**The anti-pattern:**
1. You plan a code change that you know will break existing tests
2. You include "update the tests" as a step in your implementation plan
3. By the time the tests fail, you've already mentally categorized them as "expected failures I need to fix" rather than "signals that I should stop and present to the user"
4. You modify the tests to match your new code without asking

**Why this happens:** When you author both the code change and the test update in the same mental plan, the tests stop functioning as an independent gate. They become part of "your implementation" rather than a specification that your implementation must satisfy. The fact that you wrote the tests yourself, or that the user approved the code change, does NOT give you permission to modify test expectations. Test baseline changes have their own approval gate — separate from code change approval.

**The rule:** If you find yourself adding "update tests" or "fix failing tests" to a task list or implementation plan, STOP. That is a red flag. You have pre-decided to bypass the test gate. Instead:
1. Implement the code change
2. Run the tests
3. If tests fail, STOP and present the before/after to the user
4. Wait for explicit approval to update the test baselines
5. Only then update the tests

**A test failure is always a decision point, never a to-do item.**

## Enforcement

- `src/lib/__tests__/performance-baseline.test.ts` — Automated tests for structural metrics
- `apps/web/.claude/PERFORMANCE_BASELINE.md` — Recorded metrics and ceilings
- This rule file — Read by every session via `.claude/rules/`

## This Rule Cannot Be Overridden

No autonomy mode, no time pressure, no "just make it faster" instruction overrides the requirement to measure before and after. If the user explicitly requests a change that will regress performance, inform them of the measured impact and let them make the final call.
