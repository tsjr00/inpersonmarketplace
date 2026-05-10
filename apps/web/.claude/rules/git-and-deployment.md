# Git and Deployment — Memory Drifts, Mechanical Chains Don't

**Priority: ABSOLUTE — Every commit, every push to staging, every push to prod follows a deterministic chain. No standalone commits. No "I think I'm on main." Verify with explicit commands, not memory.**

## The Shared Principle

Each Bash invocation is stateless from git's perspective. Your mental model of "what branch I was on last" drifts from actual git state because there is nothing in the system that updates your model when state changes. Memory is the unreliable thing. "Be more careful" doesn't fix that — only mechanical chains do.

The rules below replace judgment with structure:
- **The branch chain** makes branch state explicit at every operation
- **Build discipline** moves type-checking into the pre-commit hook so failures surface before push
- **No history rewriting** prevents the "preserve commit count" temptation that compounds errors
- **Staging-first deployment** ensures user-verification before production
- **The push window** prevents disruption to active user sessions

---

## Rule 1: Explicit Branch Chain for Commits and Staging Pushes

### The Rule

**Every commit that ships to staging MUST use one deterministic command chain that begins with an explicit `git checkout main` and ends with returning to `main`.** Never rely on memory of the branch from a previous tool call.

### The Mechanical Gate

Before running any `git commit` or `git push origin staging`, the command MUST be part of a chain that explicitly establishes branch state. No standalone commits. No standalone pushes. The full commit-and-ship workflow is **one chain**, not multiple tool calls.

### The Chain Template

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

For commits that do NOT ship to staging (e.g., local-only work in progress), still use the explicit prefix:
```sh
git checkout main && git add <files> && git commit -m "..."
```

### Incident: Session 70 (three failures in one session)

1. **Commit landed on staging instead of main.** Claude had previously run `git checkout staging && git merge main && git push origin staging` for a prior commit, which left the working branch as `staging`. The next commit was meant for main but landed on `staging` because no explicit `git checkout main` ran before it.

2. **Push from wrong branch.** Claude was on `main`, committed a fix, then ran `git push origin staging`. Git pushes from the **local** staging branch, not from `main`. Local staging didn't have the new commit → "Everything up-to-date." The commit never reached the remote even though the push exit code was 0 and Playwright ran successfully.

3. **Pre-push hook passed both times, masking the failure.** Playwright still ran on pre-push (the hook fires on any push command), exit code was 0, notification reported success. Only explicit verification via `git log origin/staging --oneline` caught the drift.

User feedback: *"I don't think more careful is going to work — it's already happened several times. You don't get tired so there's another root cause — what is it?"*

The root cause: **Claude's mental model of "what branch I was on last" drifts from actual git state.** Memory is the broken thing. The chain is a mechanical replacement for memory.

### Background Execution

When running the chain with `run_in_background: true`:

1. The chain runs as one background task.
2. When notification arrives, read the output file for the push's ref-update line (e.g., `abc123..def456 staging -> staging`).
3. Also verify `git log origin/staging --oneline -2` shows the expected tip.
4. **Exit code 0 alone is NOT proof of success** — the previous push could have left the chain in an intermediate state where git push succeeded but nothing new was pushed.

### Failure Response

If the chain fails mid-way:

1. **Stop.** Do not blindly retry.
2. Check `git branch --show-current` to see where you ended up.
3. Check `git status` for working-tree state.
4. Diagnose which step failed and why (hook output, merge conflict, push rejection).
5. Fix the underlying issue.
6. Resume from the failed step — do not re-run the whole chain unless the first steps were idempotent.

---

## Rule 2: Build Discipline (Post Session 80 Reform)

### The Rule

**The chain MUST NOT include `npm run build`.** Pre-commit hook runs `lint-staged + tsc --noEmit + vitest`. Pre-push hook runs `npm run build + Playwright` as a backstop for the rare Next-only failures.

### What Each Hook Catches

| Stage | Tool | Catches | Cost |
|---|---|---|---|
| Pre-commit (gate) | `lint-staged` | ESLint errors on staged files | <1s |
| Pre-commit (gate) | `tsc --noEmit` | TypeScript errors (incl. `exactOptionalPropertyTypes`) | ~6s |
| Pre-commit (gate) | `vitest run` | Unit + business-rule + flow-integrity test failures | ~9s |
| Pre-push (backstop) | `npm run build` | SWC compilation, SSG runtime errors, manifest issues | 30-60s |
| Pre-push (backstop) | `playwright --max-failures=1` | E2E smoke tests | 1-2 min |

### Manual Escape Valve

For changes that *might* break the Next.js build but pass the type system — config files (`tsconfig.json`, `next.config.ts`, `.husky/*`, `package.json` dependency bumps), large refactors, anything that "feels" risky — run `npm run build` manually before composing the chain. **This is judgment, not a maintenance-list mandate.**

```sh
cd apps/web && npm run build  # 30-60s warm cache, before composing the commit chain
```

### Why The Reform (Session 80)

Session 79 added `npm run build` to the chain after a real incident (4 bug-fix commits bundled, pre-push caught a TypeScript error, history-rewriting attempt to preserve commit count). That fix worked — but it solved the symptom, not the root cause. Root cause: `tsc --noEmit` had a gap that let TypeScript errors slip through to `next build`.

Session 80 closed the gap at the type-system level by enabling `exactOptionalPropertyTypes` (Protocol 5 incident class) and adding `tsc --noEmit` to the pre-commit hook. Those two changes together eliminate ~95% of the cases that previously fell through to the pre-push hook. With the gap closed, including `npm run build` in every chain became a tax on every commit (30-60s warm cache, longer cold) for marginal protection.

### Failure Response

**Pre-commit hook fails:** Fix the error (lint, type, or test), re-stage, retry the chain. Never `--no-verify` to bypass.

**Pre-push hook fails AFTER commit was made:** This means a Next-only issue slipped past pre-commit (rare after Session 80). Recovery:

1. **STOP.** Do NOT reach for `git rebase`, `--amend`, or any history rewriting.
2. Run `npm run build` locally to reproduce.
3. Fix the error.
4. Make a **NEW commit** fixing it (yes, this adds a commit — but it's honest).
5. Push.

### Turbopack Flake Recovery

If pre-push Playwright fails with what looks like a Turbopack flake (e.g., timeout on event API tests, stale `.next/dev/types/routes.d.ts`), clear the FULL `.next` directory:

```sh
rm -rf .next
```

Not just `.next/dev/cache`. Stale `.next/dev/types/routes.d.ts` from a killed dev session corrupts the next typecheck. (Session 76 lesson.)

---

## Rule 3: No History Rewriting After Pre-Push Failure

**The "no history rewriting under failure" clause is non-negotiable.**

Vercel deploy cost is per-push, not per-commit. Adding a commit costs nothing. Treating commit count as more important than correctness is the symptom of the wrong priorities (Session 79 incident).

If the user asks for ≤N commits and a fix-forward exceeds N, ship the N+1 commits and explain the additional commit was a typecheck or build fix.

History rewriting after pre-push failure remains FORBIDDEN regardless of mode, urgency, or instruction. The only legitimate response is a fix-forward commit.

---

## Rule 4: Staging-First Deployment

### The Rule

**NEVER push directly to `origin/main` (production) without staging verification.**

### Workflow

1. **Develop & commit** on `main` locally
2. **Merge main → `staging`**, push staging to origin (use the chain from Rule 1)
3. **Wait for Vercel preview deployment** to complete
4. **User tests on staging URL** (`inpersonmarketplace-git-staging-...vercel.app`)
5. **Only after user confirms staging looks good:** push `main` to origin
   ```bash
   git push origin main
   ```

### Verify Vercel Build Status, Not Just Push Success

The push reaching origin is necessary but not sufficient — Vercel must successfully build the commit for staging to actually update. Multiple times in the past, staging served the prior commit for days because Vercel rejected the new commit but Claude only verified the push succeeded.

### Verify Push Reached Remote

After every push, verify by `git log origin/<branch> --oneline` or by reading the push output's ref-update line. **NOT** the background task's exit code. Session 70: an "exit 0" notification masked a silently-failed push, 4 commits accumulated locally, next push batch hit a 6.5-minute Turbopack flake.

### Environments

| Environment | Branch | URL | Supabase |
|-------------|--------|-----|----------|
| Dev | `main` (local) | localhost:3002 | Dev project |
| Staging | `staging` | Vercel Preview | Staging project |
| Production | `main` (origin) | farmersmarketing.app | Prod project |

---

## Rule 5: Production Push Window

### THE GATE — Mechanically enforced by pre-push hook

`.husky/pre-push` reads stdin to detect pushes to `refs/heads/main` on `origin`. If detected and current Chicago time is outside 21:00–06:59, the push is blocked with a helpful error. Pushes to staging or other branches are unaffected.

**Window:** 9:00 PM – 7:00 AM CT only (Chicago time, DST-aware via `TZ='America/Chicago'`).

**Override (emergency hotfixes ONLY):**
```sh
PUSH_WINDOW_OVERRIDE=hotfix git push origin main
```

The override prints a warning naming the override value; you must justify it. Use sparingly. Per the rule, only emergencies bypass this gate.

### The Rule

No production pushes between 7:00 AM and 9:00 PM CT to minimize risk of disrupting active user sessions. If the user requests a push during restricted hours, remind them of the rule and ask to confirm. **Emergency hotfixes are the only exception** — and must be explicitly labeled as such.

### Why this is mechanical now

The rule existed for many sessions but was easy to forget. Time-of-day rules are invisible during work — when fixing something at 3 PM, there's no system-level reminder. The pre-push hook makes the rule unforgettable: it fires on every push to `origin/main` regardless of session state, autonomy mode, or how urgent the work feels. The override exists for genuine emergencies but creates an explicit log line documenting the bypass.

### Smoke Test Reminders

| When | Do |
|------|-----|
| After staging push | Provide 2-3 specific items to verify based on the diff |
| Before production push | Flag if staging wasn't tested yet |
| After production push | Remind about critical path check (pages load, login works, core features function) |

---

## Rule 6: One Push at a Time

**Never push staging + prod in the same command.** Each push is a separate approval gate. Session 66 incident: combined staging+prod push deployed unverified code to production.

If the user has approved a staging push, that does not authorize a production push. Wait for explicit approval after staging verification.

---

## Cannot Be Overridden

No autonomy mode, no time pressure, no "it's just a one-line fix" justification overrides the chain. If a commit needs to ship, the chain is how it ships. Pre-commit and pre-push hooks must NOT be skipped (`--no-verify`) without explicit user instruction in the same conversation turn. The hooks are the safety net.
