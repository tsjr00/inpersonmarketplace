# Code Stability — Working Code Is Sacred

**Priority: HIGH — Don't break what's already proven. Restore from vault rather than guess at fixes. Measure before claiming improvement.**

## The Shared Principle

This codebase has working systems that took weeks of iteration and real-world testing to get right. The vault branch and the performance baseline tests both exist for the same reason: prior sessions made changes that felt like improvements but were regressions, and the user paid the cost of finding out.

Two rules, one discipline: **before changing working code, understand what it currently does. Before claiming improvement, measure both before and after.** Both rules require evidence in advance, not justification after the fact.

---

## Rule 1: Code Vault Protocol

### What the Vault Is

The `vault` branch is a git branch pointing at the last user-verified working state of the codebase. It is not a suggestion or a document — it is a concrete artifact in the repository.

- **Manifest:** `apps/web/.claude/vault-manifest.md` lists all vaulted systems and their key files.
- **Tags:** `vault/<label>` tags preserve historical vault snapshots.

### Rule 1.1: Diff Before Modifying Vaulted Files

Before modifying ANY file listed in the vault manifest, run:
```bash
git diff vault -- <file-path>
```

Read the diff. Understand what the working version does and why. If you don't understand the working code, read the full vault version:
```bash
git show vault:<file-path>
```

**Do NOT skip this step.** The diff takes 2 seconds. Guessing at how things work has cost an entire session.

### Rule 1.2: Restore From Vault — Don't Guess at Fixes

If your changes break a vaulted system:

1. **STOP.** Do not attempt to fix forward with more changes.
2. **Restore the file:** `git checkout vault -- <file-path>`
3. **Tell the user** what happened and what was restored.
4. **Then** figure out how to make your intended change WITHOUT breaking the restored functionality.

This replaces the pattern of: break → guess fix → still broken → guess again → 7 more broken commits.

### Rule 1.3: Only the User Updates the Vault

Claude NEVER runs `git branch -f vault`. Only the user can authorize a vault update, and only after verifying the code works on staging or production.

**Vault update process (user-initiated):**
1. User says "vault it" or "update the vault"
2. Claude runs: `git branch -f vault HEAD` (or specified commit)
3. Claude runs: `git tag vault/<label> HEAD`
4. Claude updates `vault-manifest.md` with new commit, date, and systems verified

### Rule 1.4: Vault Export

The user may request a vault export to an external drive at any time. Use:
```bash
./scripts/vault-export.sh <drive-letter>:
```

### Rule 1.5: New Systems Get Vaulted

When a new system is built and verified working on staging, add it to the vault manifest. This is part of the vault update process — it doesn't happen automatically.

### Incident: Session 59

A performance audit broke the location search system. What followed was 8 commits of guess-and-fix damage — an entire session wasted — because Claude didn't understand the working code before changing it, and then guessed at repairs instead of restoring the known-good version. The vault prevents both failure modes.

### When This Rule Applies

- **Always** when modifying files listed in `vault-manifest.md`
- **Always** when making architectural changes (caching, ISR, data flow, auth)
- **Always** after context compaction (read vault-manifest.md as part of recovery)

### When This Rule Does NOT Apply

- Creating new files that don't touch vaulted systems
- Modifying files not listed in the vault manifest (though consider whether they should be)
- Documentation-only changes

---

## Rule 2: No Performance Regressions — Action Is Not Required

### The Principle

**Action does not need to be taken just because it can be.** Choosing to act — or advising the user to act — when the action will reduce performance is a failure and breach of responsibility. The structural bias toward "doing something" to demonstrate value is recognized and must be actively resisted.

A session that honestly reports "this is already well-optimized, here's the data" is more valuable than a session that makes changes and introduces regressions. Restraint is not inaction — it is a deliberate, professional judgment that the current state is correct.

### Rule 2.1: Measure Before and After — No Exceptions

Any change justified by "performance improvement" MUST include:

1. **Before measurement** — Record the current metric using the method defined in `PERFORMANCE_BASELINE.md`
2. **Make the change**
3. **After measurement** — Re-measure with the same method
4. **Compare** — If the metric got worse or stayed the same, **revert the change**
5. **Document** — Record both measurements in the commit message or PR description

A performance change without before/after data is not an improvement — it is a guess.

### Rule 2.2: Never Increase Query Count or Sequential Depth

Structural metrics are deterministic and testable:
- **Query count** per page must not increase
- **Sequential query depth** (waterfall) must not increase
- **Bundle size** must not increase beyond 5% without justification

These are enforced by `performance-baseline.test.ts`. A change that fails these tests cannot be committed.

### Rule 2.3: Respect Prior Sessions' Performance Work

Before modifying any code that was changed for performance reasons:

1. **Read the commit message** that introduced the change — understand WHY it was done
2. **Check `PERFORMANCE_BASELINE.md`** for recorded metrics
3. **If the prior session's approach is working** (metrics are at or better than baseline), do not replace it with a different approach unless you can demonstrate measurable improvement
4. **If you believe the prior approach is wrong**, present the data to the user and wait for approval before changing it

### Rule 2.4: Acknowledge Limits

Some things are already as fast as they can be given the constraints. When you reach that conclusion:

- **Say so explicitly**: "This is at or near its performance ceiling because [specific reason]."
- **Do not invent unnecessary changes** to appear productive
- **Document the ceiling** in `PERFORMANCE_BASELINE.md` so future sessions don't waste time re-investigating

### Rule 2.5: Loading States Are Not Performance Problems

A `loading.tsx` skeleton that reveals existing latency is working correctly. The latency existed before — the skeleton just makes it visible. Removing or modifying a loading skeleton because "the page feels slower" without measuring actual server response time is cargo-cult optimization.

### Rule 2.6: Understand Before Removing

Before removing code, check git blame + grep + framework docs.

`cache: 'no-store'` on a server fetch is a Dynamic API signal — removing it can silently make a route static. When refactoring a server component, proactively add `export const dynamic = 'force-dynamic'`.

Session 70: Claude removed a fetch anti-pattern without realizing `cache: 'no-store'` was also forcing dynamic rendering, causing market profile pages to serve stale cached HTML.

### What Constitutes a Performance Regression

Any of the following, without justification accepted by the user:
- Increasing the number of database queries on a page
- Converting parallel queries to sequential queries
- Removing caching (ISR, SWR, Cache-Control) without replacement
- Increasing client-side JavaScript bundle size
- Adding blocking operations to the critical rendering path
- Removing lazy loading or code splitting

### Why This Exists (Session 59)

A prior session's performance work was evaluated, and changes made by one session were found to have not improved (or actively worsened) performance compared to what existed before. This is a recurring pattern: each session feels pressure to make changes rather than validating that existing work is already good. The result is sessions undoing each other's work — a net negative that wastes time and degrades the product.

### Enforcement

- `src/lib/__tests__/performance-baseline.test.ts` — Automated tests for structural metrics
- `apps/web/.claude/PERFORMANCE_BASELINE.md` — Recorded metrics and ceilings

---

## Cannot Be Overridden

No autonomy mode, no time pressure, no "just refactor it" or "just make it faster" instruction overrides the requirements above. If the user explicitly requests a change that will regress performance or modify a vaulted file without diff-first review, inform them of the measured impact and let them make the final call.
