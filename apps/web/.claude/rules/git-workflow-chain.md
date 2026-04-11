# RULE: Explicit Branch Chain for Commits and Staging Pushes

**Priority: ABSOLUTE — This rule applies to every commit and every push to staging.**

## The Rule

**Every commit that ships to staging MUST use one deterministic command chain that begins with an explicit `git checkout main` and ends with returning to `main`.** Never rely on memory of the branch from a previous tool call — git state is not retained across Bash invocations in any way that Claude can observe, only remembered, and memory drifts.

## The Mechanical Gate

Before running any `git commit` or `git push origin staging`, the command MUST be part of a chain that explicitly establishes branch state. No standalone commits. No standalone pushes. The full commit-and-ship workflow is **one chain**, not multiple tool calls.

## The Chain Template

```sh
git checkout main && \
git add <explicit file paths> && \
git commit -m "..." && \
git checkout staging && \
git merge main --ff-only && \
git push origin staging && \
git checkout main
```

Seven operations, one command. If any step fails — pre-commit hook failure, merge conflict, push rejection, Playwright timeout — the chain stops at that point, and you diagnose the failed step before resuming.

**For commits that do NOT ship to staging** (e.g., local-only work in progress), still use the explicit prefix:
```sh
git checkout main && git add <files> && git commit -m "..."
```

## Why This Exists

In Session 70, Claude hit this failure mode **three times in one session**:

1. **Commit landed on staging instead of main.** Claude had previously run `git checkout staging && git merge main && git push origin staging` for a prior commit, which left the working branch as `staging`. The next commit was meant for main but landed on `staging` because no explicit `git checkout main` ran before it.

2. **Push from wrong branch.** Claude was on `main`, committed a fix, then ran `git push origin staging`. Git pushes from the **local** staging branch, not from `main`. Local staging didn't have the new commit → "Everything up-to-date." The commit never reached the remote even though the push exit code was 0 and Playwright ran successfully.

3. **Pre-push hook passed both times, masking the failure.** Playwright still ran on pre-push (the hook fires on any push command), exit code was 0, notification reported success. Only explicit verification via `git log origin/staging --oneline` caught the drift.

Three instances across one session, each producing the same "wait, where's the commit?" confusion. The user's feedback:

> *"I don't think more careful is going to work — it's already happened several times. You don't get tired so there's another root cause — what is it?"*

The root cause: **Claude's mental model of "what branch I was on last" drifts from actual git state** because each Bash call is stateless from git's perspective. Memory is the unreliable thing. "Be more careful" is a judgment-based non-fix. The chain is a mechanical replacement for memory.

## What This Rule Replaces

- "I'll check which branch I'm on before each commit" — judgment-based, fails under session pressure
- "I'll verify after each push" — catches the error but doesn't prevent it
- "I'll remember to switch back to main" — memory is the broken thing

The chain makes branch state **explicit at every operation**, so drift is impossible.

## Interaction With Other Rules

- **`present-before-changing.md`**: the chain still requires explicit user approval before the commit step runs. Present the plan, get approval, THEN run the chain.
- **`no-unauthorized-changes.md`**: the chain does not bypass approval. It's a workflow pattern for approved work.
- **`feedback_verify_push_by_remote_tip.md`** (memory): after the chain completes, verify `origin/staging` tip matches the pushed commit. This rule prevents upstream errors; verification catches residuals.

## Background Execution

When running the chain with `run_in_background: true`:

1. The chain runs as one background task.
2. When notification arrives, read the output file for the push's ref-update line (e.g., `abc123..def456 staging -> staging`).
3. Also verify `git log origin/staging --oneline -2` shows the expected tip.
4. Exit code 0 alone is NOT proof of success — the previous push could have left the chain in an intermediate state where git push succeeded but nothing new was pushed.

## This Rule Cannot Be Overridden

No autonomy mode, no time pressure, no "it's just a one-line fix" justification overrides the chain. If a commit needs to ship, the chain is how it ships. If the chain is too verbose for a specific situation, re-examine whether the commit should ship at all — and if yes, the chain still applies.

## Failure Response

If the chain fails mid-way:

1. **Stop.** Do not blindly retry.
2. Check `git branch --show-current` to see where you ended up.
3. Check `git status` for working-tree state.
4. Diagnose which step failed and why (hook output, merge conflict, push rejection).
5. Fix the underlying issue.
6. Resume from the failed step — do not re-run the whole chain unless the first steps were idempotent.

## Related Files

- `~/.claude/projects/.../memory/feedback_explicit_branch_chain.md` — incident history and rationale
- `~/.claude/projects/.../memory/feedback_verify_push_by_remote_tip.md` — verification pattern after the chain completes
