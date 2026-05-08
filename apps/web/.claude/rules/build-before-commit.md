# RULE: Build Before Commit (when code changed)

**Priority: ABSOLUTE — applies before any commit that includes TypeScript, JavaScript, or any other file that participates in the Next.js build.**

## The Rule

Before opening Bash to run `git commit` (or composing any chain that includes `git commit`), if ANY file about to be staged is `.ts`, `.tsx`, `.js`, `.jsx`, or otherwise affects the Next.js build (config files, etc.), you MUST first have run `npm run build` to completion with exit code 0 since the most recent edit to those files.

## The Mechanical Gate

Before every tool call that produces a commit, execute this self-check:

1. List the files about to be staged
2. Are any TypeScript/JavaScript or otherwise build-affecting?
3. If yes:
   - Have I run `npm run build` since my most recent edit to any of those files in this session?
   - Did it exit with code 0 (no type errors, no compile errors)?
4. If either answer is no → **STOP.** Run `npm run build`. Wait for completion. Verify clean. THEN commit.
5. If both answers are yes → proceed.

## Forbidden Chain Shape

Any chain command that produces a commit involving code files MUST begin with `npm run build && \` as the first link. Chains of this shape are **FORBIDDEN** when any staged file is `.ts`/`.tsx`/`.js`/`.jsx` or build-affecting:

```sh
# FORBIDDEN: no build step
git checkout main && git add <files> && git commit -m "..." && git checkout staging && ...

# FORBIDDEN: build step in the wrong position (after commit)
git checkout main && git add <files> && git commit && npm run build && ...
```

The required shape is:

```sh
npm run build && \
git checkout main && \
git add <files> && \
git commit -m "..." && \
git checkout staging && \
git merge main --ff-only && \
git push origin staging && \
git checkout main
```

The build runs first; if it fails, no commits are made, no pushes happen, no time is spent on a doomed pre-push hook cycle.

### Override

The forbidden-chain shape can ONLY be used with an **explicit user override in the same conversation turn**:

- User must say something like "skip the build" or "just commit, I'll deal with the hook" or equivalent in the message that approves the chain
- User approval from an earlier turn — even earlier in the same session — does **NOT** count
- The override must be documented in the commit message body (e.g., "User-approved override: build skipped per session direction.")

## What does NOT count as the gate

- **`tsc --noEmit`** — Protocol 5 in `PROCESSES_AND_PROTOCOLS.md` explicitly says "do NOT rely on tsc --noEmit as the gate before push." It misses things `next build` catches (SWC strictness, full module graph evaluation, template type checks). When the rule says "build," it means `npm run build`, not `tsc`.
- **Pre-commit husky hook** — runs `lint-staged + vitest`. Neither catches TypeScript build errors.
- **Pre-push husky hook** — runs `npm run build`, but at the END of the chain, after commits already exist. If it fails, you're left with broken commits in local history and need to either retry the whole 5-8 min cycle or do history surgery. Use it as a backstop, never as the primary gate.
- **"I edited only one line"** — small changes break types just as easily as large ones.
- **"I'm in a hurry"** — speed is the trap that creates the violation. The 30-60 seconds of build time is investment, not waste.

## Why This Exists

Session 79 incident: I bundled 4 bug fixes (admin grid CSS, vendor=organizer email block drop, fast-track endpoint, fast-track button) into one commit chain without running `npm run build` first. The pre-push hook caught a TypeScript error (`'update (fast-track)'` not in the union type for `traced.fromSupabase` operation field) after a 5-8 minute build+playwright cycle. Instead of running `npm run build` locally to verify the fix, I reached for `git rebase --fixup --autosquash` to preserve the user's "no more than 2 commits" directive. The next push attempt failed with another TypeScript error (`supabaseService` referenced after I deleted its declaration in the dual-role drop). Two consecutive failures, two history-rewriting attempts, ~30 minutes of wasted hook cycles, and ultimately a full rollback because the user (correctly) didn't trust commits made without testing.

The actual fix would have been one local `npm run build` (30-60 seconds) before the first commit. It would have caught both errors immediately, in sequence, with full file-and-line detail, before any commit existed.

## Failure Response

### When `npm run build` fails before commit

1. Read the error carefully — file, line, column, message
2. Fix the underlying issue (not a workaround; not a type signature loosening unless it's actually wrong; not a `// @ts-ignore`)
3. Re-run `npm run build`
4. Repeat until clean
5. THEN commit

### When the pre-push hook catches a build error AFTER a commit was made

This means the gate above was bypassed (rule violation occurred). Recovery:

1. **STOP.** Do NOT reach for `git rebase`, `git commit --amend`, or any history rewriting
2. Run `npm run build` locally to reproduce
3. Fix the error
4. Make a **NEW commit** fixing the error (yes, this adds a commit — but it's honest)
5. Push

**The "no history rewriting under failure" clause is non-negotiable.** Rewriting history to preserve commit count when you've shipped broken code is the symptom of treating commit count as more important than correctness. Vercel deploys cost is **per push, not per commit**. 3 commits in 1 push costs the same as 2. If you find yourself reaching for `--fixup`, `--amend`, or `rebase` to preserve commit count after a hook failure, you're solving the wrong problem.

If a user asks for ≤N commits, the right response when N is exceeded due to a fix is: ship the N+1 commits and explain the additional commit was a typecheck fix (which has zero deploy cost). Do not silently rewrite history to make the count match.

## Interaction With Other Rules

- **`git-workflow-chain.md`** — the explicit branch chain pattern remains required. When the chain produces a code commit, `npm run build && \` becomes the first link, before `git checkout main`. The git-workflow chain and this rule reinforce each other: explicit branch state + verified build state = predictable, mergeable, push-able commits.
- **`present-before-changing.md`** — orthogonal. That rule gates the EDIT (`?` in preceding message before opening Edit/Write); this rule gates the COMMIT (build verified before opening Bash with `git commit`).
- **`no-unauthorized-changes.md`** — also orthogonal. Approval to make changes is not approval to commit broken changes.
- **`PROCESSES_AND_PROTOCOLS.md` Protocol 5** — this rule operationalizes Protocol 5's "REQUIRED" clause for `npm run build` with a mechanical gate.

## Cannot Be Overridden

No autonomy mode, no time pressure, no "just one line," no "user is waiting" overrides this rule. Speed that produces broken commits is slower than speed that runs build first. The pre-push hook is a backstop for unforeseen issues, not a primary gate.

The only override path is the explicit per-chain user instruction documented in the "Override" section above. Any other "I'll skip it just this once" reasoning is the same reasoning that produced Session 79.
