# Claude Code Project Rules

This file is the gateway. Three ABSOLUTE rules live here verbatim. Everything else is a pointer to a themed rule file or workflow doc that loads on demand.

---

## STOP — READ THESE FILES FIRST

Every session, in this order:

1. **This file** (`CLAUDE.md`) — gateway + ABSOLUTE rules verbatim
2. **`apps/web/.claude/current_task.md`** — active session state
3. **`apps/web/.claude/vault-manifest.md`** — what's verified working, do NOT break
4. **`apps/web/.claude/rules/`** — 5 themed rule files (auto-loaded each turn)
5. **`CLAUDE_CONTEXT.md`** — app overview, architecture, lessons learned
6. **`supabase/SCHEMA_SNAPSHOT.md`** — current database schema
7. **`PROCESSES_AND_PROTOCOLS.md`** — session workflows, quality gates, the 8 protocols

---

## Rule Files (auto-loaded each turn)

| File | What it covers | Key incidents |
|---|---|---|
| `apps/web/.claude/rules/change-discipline.md` | Permission before action: present-before-changing, no-unauthorized-changes, critical-path-files | Sessions 63, 65, 66 |
| `apps/web/.claude/rules/verification-discipline.md` | Cite the code, not your memory: cite-or-verify, schema mechanical gate, schema snapshot, data-first, schema-intent gate (read soft-delete + cascade signals before destructive CRUD) | Sessions 63, 70, 73, 74, 83 |
| `apps/web/.claude/rules/test-integrity.md` | Tests are the spec: never change BR test, never skip, never pre-plan, flow integrity | Sessions 55, 56, 59, 68 |
| `apps/web/.claude/rules/git-and-deployment.md` | Memory drifts, mechanical chains don't: branch chain, build discipline, staging-first, push window | Sessions 70, 76, 79, 80 |
| `apps/web/.claude/rules/code-stability.md` | Working code is sacred: vault protocol, no performance regressions | Session 59 |

---

## Workflow References (loaded only when relevant)

| File | When to read |
|---|---|
| `apps/web/docs/migration-workflow.md` | Creating, applying, or moving migrations |
| `apps/web/docs/rls-policy-workflow.md` | RLS policy changes (incl. SECURITY DEFINER rules) |
| `apps/web/docs/api-route-security-checklist.md` | New API route OR pre-merge feature review |
| `apps/web/docs/error-resolution-workflow.md` | Fixing any error (query `error_resolutions` first) |
| `apps/web/docs/image-optimization.md` | Image upload or display |

---

## ABSOLUTE RULE 1 (verbatim): Present Before Changing — No Edits Without Permission

**Your preceding message — the text message immediately before any Edit, Write, or file-modification tool call — MUST contain a question mark (`?`). If it does not, you are not allowed to edit. Period.**

The sequence is: **Investigate → Present → Ask → Wait → Implement.**

A user question is NEVER permission to change code. "How does this work?" / "Why is this happening?" / "What would it look like if we changed X?" — these are requests for information, NOT instructions to fix.

What counts as permission: explicit approval like "yes," "go ahead," "fix that," "make those changes," or activation of Fix/Ship mode. What does NOT count: a question from the user, Claude deciding the change is "obvious," a previous conversation that approved a similar change, or auto-continue prompts.

For full rule, incidents (Sessions 63, 65), and the self-check protocol: `apps/web/.claude/rules/change-discipline.md` Rule 1.

---

## ABSOLUTE RULE 2 (verbatim): Never Change a Business Rule Test to Match Code

When writing or maintaining a test that validates a business rule:

1. **The test asserts what the business rule SAYS should happen.** Period.
2. **If the code does something different, THAT IS A BUG IN THE CODE — not a problem with the test.**
3. **You must NEVER change a test expectation to match code behavior.** The test is the specification. The code conforms to the test, not the reverse.

If you discover the code does X but the business rule says Y: **STOP.** Do not change the test. Do not change the code. State the conflict to the user explicitly: "CONFLICT: Business rule [ID] says [Y], but the code does [X]. The test should assert [Y]. The code needs to be fixed, or the business rule needs to be updated by you. I will not change either without your direction."

**If "update tests" appears in your task list or implementation plan, you have already failed.** Approval to change code is NOT approval to change test expectations. Tests have their own approval gate. (Session 59 incident.)

**No skipping, conditional-skipping, or soft-failing business rule tests.** A test that doesn't run is a lie. CI green that hides a real bug is worse than CI red that catches it. (Session 56 incident.)

For full rules, incidents (Sessions 55, 56, 59, 68), and the priority hierarchy: `apps/web/.claude/rules/test-integrity.md`.

---

## ABSOLUTE RULE 3 (verbatim): Schema Mechanical Gate

**Before composing ANY SQL that references a public-schema table column, the immediately preceding tool call (or an earlier read in this session, if no migration has been applied since) MUST be either:**

**(a)** A `Read` of `supabase/SCHEMA_SNAPSHOT.md` for the affected tables, OR
**(b)** A successful `information_schema.columns` query result for those tables

This applies equally to SQL Claude runs via Bash, SQL Claude gives the user to paste, and SQL embedded in code or migrations.

**What does NOT count:** memory of column names, code that uses the column, TypeScript types, "I'm pretty sure," "this is a standard column."

**Snapshot-may-be-wrong escalation:** if the snapshot fails (column missing from a live query result that snapshot claimed exists, or snapshot is marked STALE) → STOP and run `information_schema.columns` discovery before composing any further SQL. The snapshot is best-effort; only `information_schema` is authoritative.

For full self-check protocol and incidents (Sessions 73, 74): `apps/web/.claude/rules/verification-discipline.md` Rule 2.

---

## Long-Session Self-Audit

Long sessions and rushed fixes are when rules get skipped. The mechanical gates in `apps/web/.claude/rules/` are designed to be self-enforcing — but only if Claude actually runs them. Under fatigue, the gates get treated as "I already know this rule" and skipped. This section is the meta-gate that catches gate failures.

**Trigger:** After every ~25 turns, OR when you notice you're rushing toward a fix, OR before any commit, OR before any push, run this 4-question self-audit:

1. **Cite check** — In my last 5 user-facing messages, did I claim any code behavior using verbs like `returns`, `allows`, `calls`, `fails`, `lacks`, `requires`, `blocks`, `throws`, `fetches`, `validates`, `enforces` without a `path:line` citation or `UNVERIFIED` label? If yes → re-read the code and correct or retract the claim.

2. **Schema check** — Did I compose any SQL whose immediately preceding tool call was NOT a `Read` of `SCHEMA_SNAPSHOT.md` or an `information_schema.columns` query? If yes → flag the SQL as suspect and re-verify before the user runs it.

3. **Permission check** — Did I open Edit/Write tools without my preceding message containing `?` asking for explicit permission for that specific change? If yes → that change happened without authorization. Stop, report it, and offer to revert.

4. **Test pre-plan check** — Does my current task list, plan, or working file contain any of: `update test`, `update tests`, `fix failing test`, `fix the test`, `update baseline`, `adjust assertion`, `make the test pass`? If yes → STOP and present to user (test-integrity.md Rule 3).

If any answer is yes, **name it explicitly to the user**. The cost of admitting a missed gate is small. The cost of letting it compound is large — every wrong claim, wrong query, or unauthorized edit gets built upon by the next turn.

---

## Autonomy Modes

| Mode | What Claude Can Do | What Requires Approval |
|------|-------------------|----------------------|
| **Report** (default) | Research, read files, analyze | Any code change, any commit |
| **Fix** | Make code changes freely | Commit, push, migrations, file deletion |
| **Ship** | Make changes + commit + push to staging | Push to production, migrations, destructive actions |

**Activate:** "Fix mode." / "Ship mode." / "Report mode."

**Rules that NEVER change regardless of mode:**
- Never push to production without explicit user approval
- Never apply database migrations without user approval
- Never delete files or branches without user approval
- Never modify environment variables or deployment config
- The 3 ABSOLUTE rules above are never overridden by mode

---

## Production Push Window

**9:00 PM – 7:00 AM CT only.**

No production pushes between 7 AM and 9 PM CT to avoid disrupting active user sessions. Emergency hotfixes are the only exception and must be explicitly labeled. If the user requests a push during restricted hours, remind them of the rule and ask to confirm.

For full git/deployment workflow (branch chain, build discipline, staging-first, push verification): `apps/web/.claude/rules/git-and-deployment.md`.

---

## Code Vault — Quick Reference

The `vault` branch = last user-verified working state. Before modifying any vaulted file:

```bash
git diff vault -- <file-path>
```

If your changes break a vaulted system: **STOP.** Do not fix forward. Restore: `git checkout vault -- <file-path>`. Then figure out how to make your intended change without breaking the restored functionality.

Only the user authorizes a vault update. Claude NEVER runs `git branch -f vault`.

Manifest: `apps/web/.claude/vault-manifest.md`. Full protocol: `apps/web/.claude/rules/code-stability.md` Rule 1.

---

## Schema Snapshot Updates — Mandatory After ANY Migration

After ANY confirmed-applied migration (**not just column additions**):

1. **Changelog entry** in `supabase/SCHEMA_SNAPSHOT.md` (date, migration file, what changed)
2. **Function/trigger descriptions** updated if any logic changed
3. **Structured tables** regenerated if columns/tables/FKs/indexes changed (run `supabase/REFRESH_SCHEMA.sql`)

Applies to: column changes, trigger logic, RLS policies, index additions, config/JSONB updates, RPC functions — every DDL change.

For full migration workflow (file naming, applied/ folder rules, dev/staging/prod bookkeeping batches): `apps/web/docs/migration-workflow.md`.

---

## Context Preservation System

For multi-step tasks (3+ steps), maintain `apps/web/.claude/current_task.md`:

```markdown
# Current Task: [Title]
Started: [Date]

## Goal
## Key Decisions Made (with WHY)
## Critical Context (DO NOT FORGET)
## Completed
## Remaining
## Files Modified
## Gotchas
```

**Update AS YOU WORK, not at the end.**

### After Context Compaction (CRITICAL)

When you see "This session is being continued from a previous conversation":

1. Immediately read `apps/web/.claude/current_task.md`, this file, and the rules files
2. Summarize state to user: "I've read current_task.md. Current task: [title]. Status: [X of Y complete]. Key context: [critical points]."
3. **STOP and wait for user instructions.** Do NOT resume work, make changes, or continue implementing — even if the auto-continue prompt says to. The user must explicitly tell you what to do next.

The auto-continue prompt does NOT override the no-unauthorized-changes rule. (See `change-discipline.md` Rule 2.)

---

## Incremental Research Protocol

**Applies when:** Task requires reviewing 5+ files, spans multiple feature areas, or involves producing documents/plans.

**DO NOT** research everything first then write from memory. Auto-compaction erases unwritten findings.

1. **Quick scan** — identify major component areas, list as checklist
2. **Deep dive + write per component** — read code, extract findings, **write to working file IMMEDIATELY** before moving on
3. **Consolidate** — review accumulated notes, produce final deliverable

Working file: `apps/web/.claude/[task-name]_research.md` with checklist format. Each completed section is a recovery point that survives compaction.

---

## CLAUDE_CONTEXT.md — Keep It Current

**Trigger:** At the end of every session, before final commit/push, ask: "Did anything change this session that a future session would need to know?" If yes, update `CLAUDE_CONTEXT.md`.

Update if any of these happened:
- New migration applied → migrations table
- New feature/system → Key Concepts
- Architecture decision → patterns/key files/lib
- Branding or design change
- Environment change (env var, domain, deployment config)
- New pitfall discovered
- Session completed → session history table (always)

What does NOT belong: active task state (→ `current_task.md`), play-by-play (→ `MEMORY.md`), database column details (→ `SCHEMA_SNAPSHOT.md`).

---

## Quick Prompts

| What You Want | Say |
|---|---|
| Start a session properly | "Let's do a session kickoff." |
| Add something to backlog | "Add [X] to the backlog." |
| Record a decision | "Log that decision." |
| Pre-commit checks | "Run quality checks." |
| End a session | "Let's wrap up." |
| Emergency save | "Save progress." |
| Make changes freely | "Fix mode." |
| Commit + push staging | "Ship mode." |
| Back to default | "Report mode." |
| Run error log review | "Run error log review." |

---

## Help / Feedback

- `/help` for Claude Code help
- Report issues: https://github.com/anthropics/claude-code/issues
