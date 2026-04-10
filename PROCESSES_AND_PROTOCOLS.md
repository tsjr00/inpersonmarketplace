# Processes & Protocols

**Purpose:** Structured systems that make every Claude Code session more consistent, efficient, and productive. These protocols exist because ad-hoc workflows led to scope creep, lost decisions, repeated mistakes, and wasted time.

**For the user:** Reference this file when starting a session, ending a session, or when you feel a session is going off-track. Each protocol includes the specific prompt you can use to invoke it.

**For Claude:** You MUST read this file at the start of every session. Proactively recommend these protocols when the situation calls for them. Redirect the user to the appropriate protocol when you see patterns that these systems were designed to prevent.

---

## Supporting Files

| File | Location | Purpose |
|------|----------|---------|
| Backlog | `apps/web/.claude/backlog.md` | Prioritized list of pending work items |
| Decision Log | `apps/web/.claude/decisions.md` | Record of business and architecture decisions |
| Smoke Test Checklist | `apps/web/.claude/smoke-test-checklist.md` | Post-deployment verification steps |
| Current Task | `apps/web/.claude/current_task.md` | Active session state (already exists) |

---

## Protocol 1: Session Kickoff

### Problem It Solves
Sessions that start broad ("what else do we need?") lead to scope creep. We've had sessions that started as "fix one thing" and became 17 commits across unrelated areas.

### The Protocol
At the start of every session, before any code work:

1. **Claude reads** `current_task.md`, `backlog.md`, and this file
2. **Claude summarizes** the current state: carryover items, top backlog priorities, any uncommitted changes
3. **User states goals** — 1-3 items maximum for this session
4. **Both agree on scope** before any work begins
5. **Anything else** mentioned goes on the backlog, not into the current session

### User Prompt
> "Let's do a session kickoff."

### Claude's Responsibility
- If the user jumps straight into work without a kickoff, say: *"Before we dive in — let me do a quick session kickoff so we're aligned on scope."*
- If scope creep happens mid-session (new ideas, tangential fixes), say: *"That's a good idea — want me to add it to the backlog so we stay focused on [current goal]?"*

### When to Skip
- Single-task sessions where the user says exactly what they want (e.g., "fix the typo on the login page")
- Urgent production issues — fix first, process second

---

## Protocol 2: Backlog Management

### Problem It Solves
Ideas come up mid-session and either derail current work or get forgotten. The vendor trial → tier restructure chain has been "next" for 3+ sessions.

### The Protocol
- All non-urgent work items go in `apps/web/.claude/backlog.md`
- Items are organized by priority tier
- At session kickoff, review the backlog and pick items to work on
- At session end, add any new items that came up

### File Structure
See `apps/web/.claude/backlog.md` for the template.

### User Prompts
> "Add [X] to the backlog."
> "What's on the backlog?"
> "Let's pick from the backlog."
> "Reprioritize the backlog."

### Claude's Responsibility
- When the user mentions something not in the current session scope, proactively offer: *"Want me to add that to the backlog?"*
- At session end, always check: *"Any new items for the backlog from this session?"*
- Never silently drop ideas — they either get worked on now or go on the backlog

---

## Protocol 3: Pre-Push Smoke Test

### Problem It Solves
We push to staging, user manually tests, finds issues, we fix, push again. No structured verification means inconsistent testing and missed regressions.

### The Protocol — Three Tiers

| Tier | When | Time | What |
|------|------|------|------|
| **Tier 1: Targeted** | Every staging push | ~2 min | Claude provides 2-3 specific items to check based on the diff |
| **Tier 2: Critical Path** | Every production push | ~5 min | 6-item "is the app broken?" check |
| **Tier 3: Full Verification** | Major releases / monthly | ~30 min | Complete walkthrough of all flows |

Full checklist details at `apps/web/.claude/smoke-test-checklist.md`.

**Stress & resilience testing:** `apps/web/.claude/stress-test-protocols.md` — 8 protocols covering concurrent checkout, webhook resilience, full money path tracing, Vercel timeout limits, rate limit verification, Stripe Connect onboarding, failure recovery scenarios, and production environment verification. Run before go-live and after significant payment flow changes.

### User Prompts
> "Running smoke test." (then reports results)
> "Smoke test passed."
> "Smoke test failed on [X]."

### Claude's Responsibility
- **After staging push:** Provide a Tier 1 targeted list — 2-3 specific things to verify based on what changed. Do NOT point to the full checklist.
- **Before production push:** If staging wasn't tested, flag it: *"We haven't verified staging yet. Here are the 2-3 things to check before we push to prod."*
- **After production push:** Remind about Tier 2: *"Production is live. Quick 5-minute critical path check: can you confirm pages load, login works, and browse shows listings?"*
- **After major releases:** Recommend Tier 3: *"This was a big release — worth doing a full Tier 3 verification."*

---

## Protocol 4: Decision Log

### Problem It Solves
Business and architecture decisions get buried in conversation history and lost to context compaction. Examples that caused confusion: "Are FM tiers free or paid?", "What's the trial length?", "Does tip include platform fee?"

### The Protocol
When a meaningful decision is made during a session, Claude records it in `apps/web/.claude/decisions.md`.

### What Counts as a Decision
- Business rules (pricing, trial length, tier limits, fee structure)
- Architecture choices (library selection, data flow design, API patterns)
- UX decisions (where a feature lives, how it behaves, what copy to use)
- Policy decisions (password requirements, rate limits, verification rules)

### What Does NOT Count
- Bug fixes (those go in `error_resolutions` table)
- Temporary implementation choices
- Obvious technical decisions (using Next.js App Router — already established)

### User Prompts
> "Log that decision."
> "What did we decide about [X]?"
> "Show me recent decisions."

### Claude's Responsibility
- When a decision is made in conversation, proactively say: *"I'll log that in the decision log."*
- When a question comes up that might have been decided before, check the decision log FIRST
- Never contradict a logged decision without flagging it to the user

---

## Protocol 5: Pre-Commit Quality Gate

### Problem It Solves
CI has failed multiple times because changes passed local `lint-staged` (only staged files) but failed full `npm run lint` (all files, which is what CI runs). The password validation mismatch also sat unnoticed because there was no consistency check.

### The Protocol
Before committing, Claude runs (or recommends running):

1. **`npm run lint`** — full project lint (matches CI), not just staged files
2. **`npx tsc --noEmit`** — type check
3. **`npx vitest run`** — test suite

### Current Pre-Commit Hook
`.husky/pre-commit` runs `lint-staged` + `vitest` — this catches staged-file issues but NOT full-project lint errors that CI will catch.

### Claude's Responsibility
- Before any commit that touches more than 2-3 files, run `npm run lint` in the `apps/web` directory
- If lint/type errors exist, fix them before committing — don't push and hope CI passes
- If the user says "just commit it," flag: *"There are lint errors that will fail CI. Fix first?"*

### User Prompt
> "Run quality checks."
> "Is this safe to commit?"

---

## Protocol 6: End-of-Session Checkpoint

### Problem It Solves
Sessions end abruptly (context compaction, user needs to leave) and state isn't fully captured. The next session starts with incomplete context.

### The Protocol
Before ending any session, Claude produces:

1. **Update `current_task.md`** — what's done, what's pending, key decisions made
2. **Update `CLAUDE_CONTEXT.md`** — session history entry (one line)
3. **List uncommitted changes** — files modified but not committed
4. **Backlog additions** — any new items from this session
5. **Update `decisions.md`** — any decisions made this session

### User Prompts
> "Let's wrap up."
> "End of session."
> "Save progress." (emergency — do the minimum: update current_task.md)

### Claude's Responsibility
- If the user says "context is getting low" or "auto-compaction soon," immediately execute the checkpoint — don't wait for permission
- At natural stopping points, proactively offer: *"Good stopping point — want me to do an end-of-session checkpoint?"*
- Never end a session without at least updating `current_task.md`

### Emergency Save (Context Running Low)
If there's not enough context for a full checkpoint, prioritize in this order:
1. `current_task.md` (most critical — this is the recovery point)
2. Uncommitted file list
3. Backlog items
4. Everything else

---

## Protocol 7: Autonomy Modes

### Problem It Solves
As the user gets busier, they need to delegate more. But the no-unauthorized-changes rule (correctly) requires approval for each change. This creates friction when the user wants to say "just handle it."

### The Modes

| Mode | What Claude Can Do | What Requires Approval |
|------|-------------------|----------------------|
| **Report** (default) | Research, read files, analyze | Any code change, any commit |
| **Fix** | Make code changes freely | Commit, push, migrations, file deletion |
| **Ship** | Make changes + commit + push to staging | Push to production, migrations, destructive actions |

### How to Activate
> "Fix mode." — Claude can make code changes without asking, but shows summary before commit
> "Ship mode." — Claude makes changes, commits, and pushes to staging. User tests there.
> "Report mode." (or just start a session — this is the default)

### Rules That NEVER Change Regardless of Mode
- Never push to production without explicit user approval
- Never apply database migrations without user approval
- Never delete files or branches without user approval
- Never modify environment variables or deployment config
- Always update `current_task.md` after changes

### Claude's Responsibility
- Default to Report mode unless told otherwise
- Confirm mode at session kickoff: *"I'm in report mode. Want to change that?"*
- If the user says "just fix it" without declaring a mode, treat that as Fix mode for that specific task only
- Log mode changes in `current_task.md`

---

## Protocol 8: Error Log Review

### Problem It Solves
The error tracking system writes to the `error_logs` table via `withErrorTracing → logError → logErrorToDb`, but there is no admin UI that surfaces it. Errors accumulate silently. Past sessions have "fixed" issues that kept reappearing because no one noticed the prod error pattern climbing again. The tracking system was built but the visibility loop was never closed.

**This was surfaced in Session 70**: the user thought errors were being tracked automatically (they are), but had no way to see them. A single prod query revealed an actively-broken route that had been failing for 24 hours with zero visibility.

### The Protocol

**At every session kickoff**, run (or ask the user to run) the following query against prod:

```sql
SELECT error_code, route, severity, COUNT(*) AS cnt,
       MAX(created_at) AS last_seen,
       MIN(created_at) AS first_seen
FROM error_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY error_code, route, severity
ORDER BY cnt DESC
LIMIT 20;
```

Review the output with these questions:
- **New error codes** — not seen in prior sessions? Investigate. Add to task list if real bugs.
- **Climbing codes** — were they "fixed" in a prior session but reappearing? That's a regression. Stop and root-cause before doing anything else.
- **High-severity codes** — `high` or `critical`? Flag immediately. These may warrant a hotfix this session.
- **Active vs stale** — is `last_seen` within the last hour? That's an active issue. Within the last day? Recent. Older than a week? Historical.

**At session end**, if new error codes were introduced or notable patterns resolved, document them in `apps/web/.claude/decisions.md`:
- Error code
- Root cause (one sentence)
- Fix commit hash
- How to recognize if it regresses (what route, what conditions)

### User Prompts
> "Run error log review."
> "What's in error_logs?"
> "Any new errors since last session?"

### Claude's Responsibility
- At every session kickoff, proactively offer: *"Want me to run an error log review? Takes 30 seconds and catches regressions from prior sessions."*
- When a new error code appears on the list that wasn't there last session, flag it explicitly: *"New error code `ERR_XXX_NNN` on `[route]` — X occurrences since [date]. Want me to investigate before we start this session's scope?"*
- Never skip the review because "the list looks the same" — the goal is to notice **changes**, not absolutes
- Keep a running mental note of error code counts across sessions in the decision log so regressions are catchable

### What This Does NOT Replace
- **Sentry** for stack traces and exception context (high-severity errors also go there)
- **`error_resolutions` table** — that tracks fix *attempts*, not errors themselves
- **User bug reports** — these catch things users notice that don't throw errors
- **Manual smoke testing** — catches UI/UX issues that pass through without errors

### When This Protocol Fires
Session kickoff, before any code work. If the kickoff protocol (Protocol 1) is being run, error log review is step 1.5 — after reading `current_task.md` / `backlog.md` but before agreeing on scope.

### Future Enhancement (Backlog)
An admin dashboard at `/admin/error-logs` would replace the SQL query with a click. Until then, SQL is the interface.

---

## Quick Reference: Common Prompts

| What You Want | What to Say |
|---------------|-------------|
| Start a session properly | "Let's do a session kickoff." |
| Add something to the backlog | "Add [X] to the backlog." |
| See what's pending | "What's on the backlog?" |
| Record a decision | "Log that decision." |
| Check before committing | "Run quality checks." |
| End a session | "Let's wrap up." |
| Emergency save | "Save progress." |
| Let Claude make changes freely | "Fix mode." |
| Let Claude commit + push staging | "Ship mode." |
| Go back to default | "Report mode." |
| Run post-deploy verification | "Running smoke test." |
| Check what's breaking in prod | "Run error log review." |

---

## When Claude Should Proactively Intervene

Claude should redirect to these protocols when it observes:

| Pattern Observed | Protocol to Invoke |
|------------------|--------------------|
| Session starts without clear scope | Protocol 1: Session Kickoff |
| New idea comes up mid-task | Protocol 2: Add to Backlog |
| About to push to staging/prod | Protocol 3: Smoke Test Reminder |
| Business rule or architecture decision made | Protocol 4: Decision Log |
| About to commit multi-file changes | Protocol 5: Quality Gate |
| User says "gotta go" or context is low | Protocol 6: End-of-Session Checkpoint |
| User says "just handle it" or "fix it" | Protocol 7: Confirm Autonomy Mode |
| Session kickoff begins | Protocol 8: Error Log Review (step 1.5) |
| User mentions a bug that looks familiar | Protocol 8: Error Log Review (check if it's recurring) |
