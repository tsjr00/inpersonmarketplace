# RULE: Build Discipline (post Session 80 reform)

**Priority: HIGH — applies to every commit that includes code.**

## What This Rule Says Now

After Session 80, the chain shape is **simpler**, not stricter:

1. **DO NOT include `npm run build` in the commit chain.** The pre-commit hook now runs `tsc --noEmit` (added Session 80) which catches TypeScript errors at commit time. The pre-push hook runs `npm run build + Playwright` as a backstop for the rare Next-only failures.

2. **The required chain shape is:**
   ```sh
   git checkout main && \
   git add <explicit file paths> && \
   git commit -m "..." && \
   git checkout staging && \
   git merge main --ff-only && \
   git push origin staging && \
   git checkout main
   ```
   Seven operations, one chain. No `npm run build` link.

3. **History rewriting after pre-push failure is FORBIDDEN.** If the pre-push hook (build + Playwright) catches an error, make a NEW commit to fix forward. Never `--amend`, `--fixup`, or `rebase` to preserve commit count.

## Why The Reversal

Session 79 added `npm run build` to the chain after a real incident (4 bug-fix commits bundled, pre-push caught a TypeScript error, history-rewriting attempt to preserve commit count). That fix worked — but it solved the symptom, not the root cause. Root cause: `tsc --noEmit` had a gap that let TypeScript errors slip through to `next build`.

Session 80 closed the gap at the type-system level by enabling `exactOptionalPropertyTypes` (Protocol 5 incident class) and adding `tsc --noEmit` to the pre-commit hook. Those two changes together eliminate ~95% of the cases that previously fell through to the pre-push hook.

With the gap closed, including `npm run build` in every chain became a tax on every commit (30-60s warm cache, longer cold) for marginal protection. Removing it from the chain reduces commit-cycle friction without giving up safety — the pre-push hook is still there as the backstop.

## When To Run `npm run build` Manually (escape valve)

The rule doesn't *require* `npm run build` in the chain, but it doesn't *forbid* you from running it. For changes you suspect could break the Next.js build but not the type system, run it before committing:

- **Config-affecting changes:** `tsconfig.json`, `next.config.ts`, `next.config.js`, `package.json` dependency bumps, anything in `.husky/`
- **Large refactors:** changes spanning ≥10 files or touching server/client boundaries
- **Anything that "feels" risky:** trust your judgment; the cost of a manual build is 30-60s, the cost of a pre-push failure is 5-8 min plus the fix-forward commit

This is your call, not a maintenance-list mandate. Lists rot; judgment doesn't.

```sh
cd apps/web && npm run build  # 30-60s warm cache, before composing the commit chain
```

## What Each Hook Catches

| Stage | Tool | Catches | Cost |
|---|---|---|---|
| Pre-commit (gate) | `lint-staged` | ESLint errors on staged files | <1s |
| Pre-commit (gate) | `tsc --noEmit` | TypeScript errors (incl. exactOptionalPropertyTypes) | ~6s |
| Pre-commit (gate) | `vitest run` | Unit + business-rule + flow-integrity test failures | ~9s |
| Pre-push (backstop) | `npm run build` | SWC compilation, SSG runtime errors, manifest issues | 30-60s |
| Pre-push (backstop) | `playwright --max-failures=1` | E2E smoke tests | 1-2 min |

The pre-commit hook is the primary gate. Pre-push is the backstop for cases the type system can't see.

## Failure Response

### Pre-commit hook fails

Fix the error (lint, type, or test), re-stage, retry the chain. Never `--no-verify` to bypass.

### Pre-push hook fails AFTER commit was made

This means a Next-only issue slipped past pre-commit (rare after Session 80). Recovery:

1. **STOP.** Do NOT reach for `git rebase`, `--amend`, or any history rewriting.
2. Run `npm run build` locally to reproduce.
3. Fix the error.
4. Make a **NEW commit** fixing it (yes, this adds a commit — but it's honest).
5. Push.

**The "no history rewriting under failure" clause is non-negotiable.** Vercel deploy cost is per-push, not per-commit. Adding a commit costs nothing. Treating commit count as more important than correctness is the symptom of the wrong priorities (Session 79 incident).

If the user asks for ≤N commits and a fix-forward exceeds N, ship the N+1 commits and explain the additional commit was a typecheck or build fix.

## Interaction With Other Rules

- **`git-workflow-chain.md`** — the explicit branch chain pattern remains required. No `npm run build` link, but the explicit `git checkout main → ... → git checkout main` framing is unchanged.
- **`present-before-changing.md`** — orthogonal; gates the EDIT, not the commit.
- **`PROCESSES_AND_PROTOCOLS.md` Protocol 5** — Protocol 5's pre-Session-80 wording said "do NOT rely on tsc --noEmit." That guidance is now superseded by this rule for the post-Session-80 codebase, where `tsc --noEmit` runs as the pre-commit gate AND `exactOptionalPropertyTypes` is enabled. Update Protocol 5 if it's referenced elsewhere.

## Cannot Be Overridden

Pre-commit and pre-push hooks must NOT be skipped (`--no-verify`) without explicit user instruction in the same conversation turn. The hooks are the safety net.

History rewriting after pre-push failure remains FORBIDDEN regardless of mode, urgency, or instruction. The only legitimate response is a fix-forward commit.

## Why Sessions Need This Doc

Future sessions reading this rule will land mid-conversation, often without context for why the chain looks the way it does. The TL;DR: pre-commit catches type errors fast (~15s total for lint+tsc+vitest), pre-push catches Next-only build issues as a backstop, the chain is short, and the type system has been hardened so the backstop fires rarely.

If a session is tempted to add `npm run build` back to the chain "just to be safe," the answer is: that's what the manual escape valve and the pre-push backstop are for. Adding build to every chain makes every commit slower without measurable benefit after Session 80's hardening.
