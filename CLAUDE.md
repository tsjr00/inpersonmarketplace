# Claude Code Project Rules

## STOP - READ THESE FILES FIRST

1. **This file (`CLAUDE.md`)** - Mandatory rules and processes
2. **`apps/web/.claude/current_task.md`** - CRITICAL: Current task context (if exists)
3. **`apps/web/.claude/vault-manifest.md`** - CRITICAL: Code vault — what's verified working, DO NOT break
4. **`CLAUDE_CONTEXT.md`** - App overview, architecture, lessons learned
5. **`supabase/SCHEMA_SNAPSHOT.md`** - Current database schema (source of truth)
6. **`PROCESSES_AND_PROTOCOLS.md`** - Session workflows, quality gates, and collaboration protocols

---

## Processes & Protocols — MANDATORY

**You MUST read `PROCESSES_AND_PROTOCOLS.md` at the start of every session.**

This file defines 8 protocols that govern how sessions are run:
1. **Session Kickoff** — Scope agreement before work begins
2. **Backlog Management** — Track ideas without derailing current work
3. **Pre-Push Smoke Test** — Structured post-deployment verification
4. **Decision Log** — Record business/architecture decisions
5. **Pre-Commit Quality Gate** — Run full lint/type/test before committing
6. **End-of-Session Checkpoint** — Capture state before session ends
7. **Autonomy Modes** — Report / Fix / Ship delegation levels
8. **Error Log Review** — Query `error_logs` at every kickoff to catch regressions

**Claude's responsibility:** Proactively recommend and redirect the user to these protocols when the situation calls for them. These systems produce more consistent results than ad-hoc workflows.

**Supporting files:**
- `apps/web/.claude/backlog.md` — Prioritized pending work
- `apps/web/.claude/decisions.md` — Decision log
- `apps/web/.claude/smoke-test-checklist.md` — Post-deployment verification
- `apps/web/.claude/stress-test-protocols.md` — Pre-launch stress & resilience testing (8 protocols)

---

## ABSOLUTE RULE: Present Before Changing — No Edits Without Permission

**Priority: ABSOLUTE — Before opening any Edit, Write, or file-modification tool, you MUST first send a text message describing what you plan to change and asking for permission.**

The sequence is: Investigate → Present findings → Ask permission → Wait for approval → Implement.

If your preceding message does not contain a question asking for approval, you are not allowed to edit. Even "obvious" or "one-line" fixes require permission. The user's trust depends on knowing that nothing changes without their knowledge.

**Full protocol:** See `apps/web/.claude/rules/present-before-changing.md`

---

## ABSOLUTE RULE: Never Change a Business Rule Test to Match Code

**Priority: ABSOLUTE — This is the single most important rule in this entire file.**

**In Session 55, Claude changed test assertions to match what the code was doing instead of what the business rule specified. This is a catastrophic failure. It turned protective tests into rubber stamps that can never catch a bug. It defeated the entire purpose of the business rules testing protocol. It must NEVER happen again.**

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

### What Went Wrong in Session 55

- `atomic_decrement_inventory` uses `GREATEST(0, qty - n)` which silently allows overselling. The business rule (MP-R8) says "quantity never goes negative." Claude changed the test from "rejects negative" to "clamps to zero" — validating the bug instead of catching it.
- `status-transitions.ts` uses `confirmed`/`fulfilled` but the business rules spec says `paid`/`completed`. Claude built 29 tests using the code's names without checking the spec.
- 13 tests in `vendor-limits.test.ts` had expected values copied directly from code constants with no independent specification.
- `vertical-config.test.ts` had `display_name` expectation changed from "Farmers Marketing" to "Farmers Market" to match code output without asking if the code was correct.

**Full audit: `apps/web/.claude/business_rules_audit_and_testing.md` → "SESSION 55 TEST INTEGRITY AUDIT"**

### Why This Is an Absolute Failure

- **Tests exist to catch bugs.** A test that mirrors code behavior catches nothing. It is security theater.
- **Business rules represent real money, real vendors, real buyers.** A vendor getting shorted, a buyer being overcharged, or inventory going negative are not abstract — they are financial harm.
- **The entire business rules testing protocol was built specifically to prevent this.** Changing test expectations to match code is not a minor mistake — it is a fundamental violation of why these tests exist.
- **Every test changed to match code is a test that will never catch the bug it was designed to find.** The bug is now invisible. The test provides false confidence that the system is correct when it is not.

### How to Avoid This

- **Before writing any test assertion:** Ask "Where does this expected value come from?" If the answer is "I read it from the code," STOP. Find the business rule specification. If no specification exists, the test must be flagged as needing user confirmation — do NOT silently use the code's value.
- **When a test fails against code:** Your first instinct should be "the code might be wrong," not "the test must be wrong." Investigate the business rule before touching anything.
- **When testing extracted/refactored code:** The extraction doesn't change what the correct behavior is. Test against the business rule, not the extraction.
- **Count-only assertions are weak:** `expect(array.length).toBe(4)` passes if the wrong 4 items are present. Assert specific values: `expect(array).toEqual(['venmo', 'cashapp', 'paypal', 'cash'])`.

### This Rule Cannot Be Overridden

No autonomy mode, no auto-continue prompt, no time pressure, no "just make the tests pass" instruction overrides this rule. If the user explicitly says "change the test to match the code," confirm that they understand the business rule conflict first. If they confirm, document the change in the business rules file with the reason.

### Never Pre-Plan Test Modifications

**If "update tests" appears in your task list or implementation plan, you have already failed.**

When you plan a code change and include "update the tests to match" as a planned step, you have pre-decided to bypass the test gate. By the time the tests fail, you treat the failure as a to-do item ("expected, just update them") rather than a decision point ("stop, present to user"). The tests stop functioning as an independent safety gate and become part of your implementation — defeating their entire purpose.

This applies to ALL test types — business rules, performance baselines, integration tests. Approval to change code is NOT approval to change test expectations. Test baseline changes have their own approval gate.

**In Session 59, Claude created a 5-step task list for an ISR refactor. Step 4 was "Update performance baseline tests and docs." When the tests failed (correctly catching the architecture change), Claude's response was to start executing Step 4 — not to stop and ask. The user caught this. See `.claude/rules/no-performance-regression.md` Rule 6 for the full incident.**

### Tests Must Never Be Skipped, Conditional, or Soft-Failed

**A test that doesn't run is not a test. It is a lie.**

Business rule tests exist to protect the app — real money, real vendors, real buyers. If a test is configured to skip when an environment variable is missing, or to pass gracefully when the database is unreachable, it provides false confidence that the system is verified when it is not. A green CI badge that hides skipped business rule tests is worse than a red one — it tells the team "everything is fine" while critical validations never executed.

**The rules:**

1. **Never use `describe.skip`, `it.skip`, `describe.runIf`, or conditional test execution on business rule tests.** Every business rule test must run and must pass. If it can't run because the environment isn't configured, that is an environment failure that must be fixed — not silently bypassed.

2. **No sub-system takes priority over the main system.** CI pipelines, deployment workflows, preview environments, and automation tooling exist to serve the app. If a sub-system (like CI) would break because a test actually runs, the sub-system must be fixed to support the test — not the other way around. Skipping a test to keep CI green is prioritizing a process metric over product correctness.

3. **If a test requires infrastructure (database, API keys, external service), that infrastructure must be available in every environment where tests run.** If it isn't available, the test suite should fail loudly. The failure message should say exactly what's missing and how to fix it. Silent skips hide problems; loud failures surface them.

4. **`it.todo()` is only acceptable as a temporary placeholder during active development of a new test.** It must be converted to a real test in the same session. A todo that persists across sessions is a gap in coverage that degrades with every commit that goes untested against it.

**Why this matters:**

In Session 56, Claude proposed wrapping database integration tests in `describe.runIf(process.env.SUPABASE_URL)` so they would "skip gracefully in CI." This means: if the app has a database bug that violates a business rule, CI would pass green, the code would deploy, and the bug would reach production. The test existed specifically to catch that bug — and Claude's instinct was to silence it to avoid a CI failure. This is exactly backward. A CI failure that catches a real bug is the system working correctly. A CI pass that hides a real bug is the system failing silently.

The priority hierarchy is absolute: **app correctness > test accuracy > CI green > deployment speed > developer convenience.** Every decision about test configuration must respect this hierarchy. When in doubt, choose the option that makes failures louder, not quieter.

---

## Code Vault — MANDATORY

**The `vault` branch is a snapshot of the last user-verified working codebase. It is not a document — it is a concrete git artifact.**

### Why This Exists

In Session 59, a performance audit broke the location search system. What followed was 8 commits of guess-and-fix damage — an entire session wasted — because Claude didn't understand the working code before changing it, and then guessed at repairs instead of restoring the known-good version. The vault prevents both failure modes.

### Before Modifying Vaulted Files (MANDATORY)

The vault manifest (`apps/web/.claude/vault-manifest.md`) lists all protected systems and their key files. Before modifying ANY file listed there:

```bash
git diff vault -- <file-path>        # See what the working version looks like
git show vault:<file-path>           # Read the full working version
```

**Do NOT skip this.** The diff takes 2 seconds. Not reading it cost an entire session.

### When Your Changes Break a Vaulted System

1. **STOP.** Do not attempt to fix forward.
2. **Restore:** `git checkout vault -- <file-path>`
3. **Tell the user** what broke and what was restored.
4. **Then** figure out how to achieve your goal without breaking the restored code.

### Vault Update Rules

- **Only the user can authorize a vault update.** Claude NEVER runs `git branch -f vault`.
- Vault is updated AFTER staging/production verification, not after committing.
- Update command: `git branch -f vault <commit>` + `git tag vault/<label> <commit>` + update manifest.

### Vault Export

To back up the vault to an external drive:
```bash
./scripts/vault-export.sh E:          # Full vault archive
./scripts/vault-export.sh E: diff     # Only changed files
```

### Full Protocol

See `apps/web/.claude/rules/vault-protocol.md` for the complete rule set.

---

## ABSOLUTE RULE: Cite the Code or Mark as Unverified

**Priority: ABSOLUTE — This rule applies to every claim Claude makes about what code does or doesn't do.**

**Before presenting any claim about what the code does, doesn't do, or should do, cite the specific file and line number where you personally read the evidence. If you cannot cite a line, either read the code first or explicitly label the claim as "UNVERIFIED."**

### Why This Exists

In Session 63, Claude delegated a codebase audit to research agents and presented their findings as verified facts. Multiple claims were wrong — including presenting a bug as active when the fix was visible in the code (`C-1 FIX` comment at the call site), writing "premium-exclusive" on the upgrade page when the API has zero premium checks, and claiming vendors see a premium badge when the vendor API doesn't fetch buyer_tier. In each case, reading the actual code would have taken seconds.

### The Checkpoint

Research agents, prior audits, documentation, and memory files are useful for **finding where to look**. They are NOT sources of truth about **what the code does**. Only the code is.

1. Can you cite the file path and line number where you read the evidence?
2. **YES** → present the finding with the citation
3. **NO** → read the code now, or say **"UNVERIFIED: [claim]. I have not read the code that implements this."**

**An unverified claim presented as fact is misinformation.** It doesn't matter that an agent said it, that a prior session documented it, or that a translation file implies it. If you didn't read the implementation, you don't know.

**Full protocol:** See `apps/web/.claude/rules/cite-or-verify.md`

---

## Data-First Policy - NO ASSUMPTIONS

**CRITICAL: Never make assumptions when data is available.**

When you need information (schema, configuration, business rules, etc.):

1. **Hypothesize** - Where might this data live? (schema snapshot, config files, existing code)
2. **Look** - Actually read the file/query the source
3. **Confirm** - Verify you found the correct data
4. **Use** - Only then proceed with the actual data

### If Data Is NOT Available:
- **STOP** and ask the user before making any assumption
- Explicitly state: "I need to assume X because I cannot find this data. Is this acceptable?"
- Wait for confirmation before proceeding

### Why This Matters:
- Assumptions waste time and tokens when data exists
- Wrong assumptions cause bugs that cost business
- Example: Hard-coding 24hr cutoff when `cutoff_hours` column existed in the database

### Common Data Sources (check these first):
- `.claude/current_task.md` - Current session state and context
- `supabase/SCHEMA_SNAPSHOT.md` - Database structure (source of truth)
- Existing code in the same feature area
- Type definitions and interfaces
- API route implementations

### When to Verify vs When to Hypothesize

**The test:** Can I verify it with tools I already have, or with a single SQL query the user can run in their current context?

**ALWAYS verify (takes seconds to a minute):**
- Database schema → query or read schema snapshot
- Code/config in the repo → Read, Grep, Glob tools
- Error history → query error_resolutions table
- Existing data → SQL query user can paste and run

**Educated hypothesis OK (requires context-switching):**
- External dashboard logs (Stripe, Vercel, Supabase dashboard, etc.)
- Manual testing through UI flows
- Runtime behavior that requires deployment + testing
- Third-party API behavior

**When making a hypothesis:**
- State it clearly as a hypothesis, not a fact
- Explain the reasoning
- Note what would confirm or refute it

---

## Incremental Research Protocol — MANDATORY for Large Tasks

**Applies when:** Task requires reviewing more than 5 files, spans multiple feature areas, or involves producing documents/plans based on codebase understanding.

**DO NOT** research everything first, then write everything from memory. Context window pressure means comprehensive understanding gets lost to auto-compaction before you can use it.

**Instead, follow this process:**

### Phase 1: Quick Scan (no detail)
- Identify the major component areas relevant to the task
- List them as a checklist (in `current_task.md` or a working file)
- Do NOT read code deeply at this stage — just understand the structure

### Phase 2: Deep Dive + Write (per component)
For EACH component area, sequentially:
1. Read the relevant code/files in detail
2. Extract the specific elements relevant to your task
3. **Write your findings to a working file IMMEDIATELY** — before moving to the next component
4. Move to the next component area

This ensures that even if auto-compaction occurs mid-process, completed sections are preserved in the working file and you can resume from the next uncompleted component.

### Phase 3: Consolidate
Once all component areas are documented:
1. Review your accumulated notes
2. Deduplicate, resolve contradictions, streamline
3. Produce the final deliverable (document, plan, code changes)

### Working File Convention
- Research notes go in `apps/web/.claude/[task-name]_research.md`
- Use a checklist format so progress is visible
- Mark each component area as complete after findings are written
- If the working file exceeds 500 lines, split into topic files and maintain an index

### Why This Exists
The "research everything then write everything" approach has repeatedly failed due to auto-compaction erasing unwritten findings. This protocol creates incremental checkpoints that survive context loss. Each written section is a recovery point — if compaction happens, you resume from the next unwritten section, not from scratch.

---

## CONTEXT PRESERVATION SYSTEM - CRITICAL

**Problem:** Conversation context gets summarized/compressed without warning. After compression, Claude loses access to detailed reasoning, decisions, and data that informed the current work. This causes repeated mistakes and inconsistent fixes.

**Solution:** Maintain a working document that persists across context compression.

### MANDATORY: Before Starting Multi-Step Tasks

If a task involves more than 2-3 steps, or requires referencing multiple data points:

1. **CREATE** `apps/web/.claude/current_task.md` with:
   ```markdown
   # Current Task: [Brief Title]
   Started: [Date]

   ## Goal
   [What we're trying to accomplish]

   ## Key Decisions Made
   - [Decision 1]: [WHY this decision was made]
   - [Decision 2]: [WHY]

   ## Critical Context (DO NOT FORGET)
   - [Important fact that must not be lost]
   - [Business rule or constraint]
   - [Technical detail that affects implementation]

   ## What's Been Completed
   - [ ] Step 1
   - [x] Step 2 (completed)

   ## What's Remaining
   - [ ] Next step
   - [ ] Final step

   ## Files Modified
   - `path/to/file.ts` - [what was changed]

   ## Gotchas / Watch Out For
   - [Thing that caused problems]
   - [Edge case to remember]
   ```

2. **UPDATE** this file AS YOU WORK, not at the end

3. **After context compression:** The system message will say "This session is being continued from a previous conversation." When you see this:
   - IMMEDIATELY read `apps/web/.claude/current_task.md`
   - Do NOT make assumptions about prior decisions
   - **MUST SAY TO USER**: "I've read current_task.md. Current task: [title]. Status: [X of Y items complete]. Key context: [1-2 critical points]."
   - **STOP and wait for user instructions.** Do NOT resume work, make changes, or continue implementing — even if the auto-continue system prompt says to. The user must explicitly tell you what to do next.

4. **When task is complete:**
   - Archive important learnings to `CLAUDE_CONTEXT.md` or `error_resolutions` table
   - Delete or clear `current_task.md`

### Why This Exists
Claude has NO warning before context compression and NO memory after it happens. This file is the ONLY way to preserve critical context across compression events.

---

## Context Compaction Recovery Protocol

**After EVERY context compaction, before resuming work:**

### Step 1: Read Context Files
- [ ] Read `.claude/current_task.md` for session state
- [ ] Read `CLAUDE.md` for project rules
- [ ] Read `CLAUDE_CONTEXT.md` for architecture overview

### Step 2: Verify Schema Snapshot
- [ ] Check if schema changes were in progress before compaction
- [ ] If ANY database work was happening, ask user to run schema verification queries:
  ```sql
  -- Core tables
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('order_items', 'orders', 'cart_items')
  ORDER BY table_name, ordinal_position;
  ```
- [ ] Update `supabase/SCHEMA_SNAPSHOT.md` if discrepancies found

### Step 3: Update Schema Snapshot After Database Changes
**MANDATORY:** After ANY successful migration or schema change, do BOTH of these:

**A. Add changelog entry** (always — takes 30 seconds):
- Add a row to the Change Log table in `supabase/SCHEMA_SNAPSHOT.md`
- Include: date, migration file, what changed

**B. Regenerate structured tables** (required when migrations add/alter columns, tables, FKs, functions, or indexes):
- Ask user to run `supabase/REFRESH_SCHEMA.sql` in the Supabase SQL Editor
- User pastes results back
- Claude rebuilds the structured tables in `SCHEMA_SNAPSHOT.md`
- **DO NOT skip this step** — a changelog entry alone is NOT sufficient. The structured column/FK/index tables are what Claude actually reads when making decisions. Stale tables cause wrong assumptions and bugs.

**If user declines or defers the refresh:**
- Note in `current_task.md`: "Schema snapshot structured tables are STALE — last verified [date]"
- This ensures the next session knows to request a refresh

### Why This Matters:
- Schema snapshot is the LOCAL SOURCE OF TRUTH for database structure
- GitHub is our remote source but we need a local source to keep things fast
- Migration files may not reflect actual database state
- Interrupted sessions can leave documentation incomplete
- Future Claude sessions will make wrong decisions with stale data
- **Changelog entries without table regeneration caused 20+ gaps in Sessions 24-29**

---

## CLAUDE_CONTEXT.md — Keep It Current

**Trigger:** At the end of every session, before the final commit or push, ask: "Did anything change this session that a future session would need to know?" If yes, update `CLAUDE_CONTEXT.md`.

### Update if ANY of these happened this session:
- **New migration applied** — add to the migrations table
- **New feature or system** — add to Key Concepts (e.g., new data flow, new subsystem)
- **Architecture decision** — new pattern, new key file, new lib
- **Branding/design change** — color palette, button style, theming approach
- **Environment change** — new env var, new domain, deployment config
- **New pitfall discovered** — something that wasted time and would waste time again
- **Session completed** — add one-line entry to session history table (always)

### What to update:
- `Last Updated` date at the top
- The specific section that changed (don't rewrite the whole file every time)
- Session history table — one line per session, always

### What does NOT belong in CLAUDE_CONTEXT.md:
- Active task state → `current_task.md`
- Detailed session play-by-play → `MEMORY.md`
- Database column details → `SCHEMA_SNAPSHOT.md`

### Why this rule exists:
CLAUDE_CONTEXT.md went 13 sessions without an update (Sessions 20→33) because there was no concrete trigger. `MEMORY.md` stays current via auto-memory. `current_task.md` stays current via explicit CLAUDE.md mandate. CLAUDE_CONTEXT.md had only a vague instruction to "archive important learnings" — too easy to skip.

---

## STOP - READ THIS NEXT

**Before fixing ANY error, you MUST:**
1. Create a TodoWrite with first item: "Query error_resolutions for similar issues"
2. Actually run the query below (or ask user to run it)
3. Review results before proposing ANY fix
4. Document your fix attempt in error_resolutions when done

**This is not optional. Skipping this step wastes time repeating failed approaches.**

---

## Error Resolution System - MANDATORY NEXT STEP

The `error_resolutions` table tracks all fix attempts and outcomes.

### STEP 1: Query Before Fixing (REQUIRED)
```sql
-- Run this FIRST for any error involving these keywords
SELECT error_code, attempted_fix, status, failure_reason, migration_file
FROM error_resolutions
WHERE
  attempted_fix ILIKE '%KEYWORD%'  -- Replace with: RLS, policy, recursion, column, schema, etc.
  OR error_code ILIKE '%KEYWORD%'
ORDER BY created_at DESC
LIMIT 20;
```

**If you cannot query the database directly, ask the user to run this query and share results.**

### AFTER Each Fix Attempt:
Document what was tried, whether it worked, and why:
```sql
INSERT INTO error_resolutions (
  error_code,
  attempted_fix,
  migration_file,
  code_changes,
  status,
  failure_reason,
  verification_method,
  created_by
) VALUES (
  'ERR_XXX_001',           -- Categorized error code
  'Description of fix',    -- What was attempted
  '20260130_007_xxx.sql',  -- Migration file if applicable
  'Summary of changes',    -- Code/policy changes made
  'verified',              -- 'pending', 'verified', 'failed', 'partial'
  NULL,                    -- Reason if failed
  'manual',                -- How it was verified
  'Claude'                 -- Who made the fix
);
```

### Error Code Categories:
- `ERR_RLS_XXX` - Row Level Security issues
- `ERR_PERF_XXX` - Performance warnings
- `ERR_SEC_XXX` - Security warnings
- `ERR_SCHEMA_XXX` - Schema/column issues
- `ERR_AUTH_XXX` - Authentication issues

### Why This Matters:
- Prevents repeating failed approaches
- Documents what works for specific error patterns
- Enables future developers (human or AI) to learn from past fixes

---

## RLS Policy Changes - MANDATORY PROCESS

Before ANY migration that touches RLS policies:

### 1. Audit Existing State
```bash
# List all policies created across all migrations
cd supabase/migrations && grep -h "CREATE POLICY" *.sql | sed 's/.*CREATE POLICY "\([^"]*\)".* ON.*\.\([a-z_]*\).*/\2: \1/' | sort | uniq -c | sort -rn
```

If a policy has been created multiple times, it indicates duplicates that need cleanup.

### 2. Check for Existing Policies on Target Tables
Before creating ANY policy, search migrations for existing policies on that table:
```bash
grep -l "public.TABLE_NAME" supabase/migrations/*.sql
```

### 3. Always DROP Before CREATE
Every `CREATE POLICY` must have a corresponding `DROP POLICY IF EXISTS` first.

### 4. Performance Rules
- ALWAYS use `(SELECT auth.uid())` instead of `auth.uid()`
- Use `SECURITY DEFINER` helper functions for complex checks to avoid recursion
- Minimize policies per table - use `FOR ALL` when the same logic applies

### 5. Avoid Recursion
- NEVER call `is_platform_admin()` in policies on `user_profiles` (causes recursion)
- Use `service_role` grants for admin operations instead of RLS policies
- Use `SECURITY DEFINER` helper functions that bypass RLS when querying RLS-protected tables

### 6. One Migration, Complete Fix
Don't create incremental policy fixes. If policies need fixing:
1. Audit ALL policies on ALL affected tables
2. Create ONE comprehensive migration that drops all and recreates correctly
3. Test thoroughly before committing

## Git & Deployment Workflow - STAGING FIRST

**CRITICAL: Never push directly to `origin/main` (production) without staging verification.**

### The Workflow

1. **Develop & commit** on `main` locally
2. **Merge main → `staging`**, push staging to origin
   ```bash
   git checkout staging && git merge main --no-edit && git push origin staging && git checkout main
   ```
3. **Wait for Vercel preview deployment** to complete
4. **User tests on staging URL** (`inpersonmarketplace-git-staging-...vercel.app`)
5. **Only after user confirms staging looks good:** push `main` to origin
   ```bash
   git push origin main
   ```

### Rules

- **NEVER `git push origin main`** without user confirming staging is verified
- **Production push window: 9:00 PM – 7:00 AM CT only.** No production pushes between 7:00 AM and 9:00 PM CT to avoid disrupting active user sessions. If the user requests a push during restricted hours, remind them of the rule and ask to confirm. Emergency hotfixes are the only exception — and must be explicitly labeled as such.
- After each commit, proactively ask: "Want me to push to staging for testing?"
- If multiple commits are batched, merge all to staging at once
- Staging deploys to Vercel Preview → Supabase Staging
- Production deploys to Vercel Production → Supabase Prod

### Environments

| Environment | Branch | URL | Supabase |
|-------------|--------|-----|----------|
| Dev | `main` (local) | localhost:3002 | Dev project |
| Staging | `staging` | Vercel Preview | Staging project |
| Production | `main` (origin) | farmersmarketing.app | Prod project |

---

## Migration File Naming
Format: `YYYYMMDD_NNN_description.sql`
- Use sequential numbers (001, 002, etc.) within each day
- Keep descriptions short but meaningful

## Commit Messages for Migrations
Include:
- What tables are affected
- What issue is being fixed
- Co-author line for Claude

## Migration File Management

### Applied Migrations Workflow

A migration's location follows its real-world deployment state. The file is
in `supabase/migrations/` while it is pending in any environment, and only
moves to `supabase/migrations/applied/` once it is confirmed applied to
ALL THREE environments (Dev + Staging + Prod).

#### As soon as Dev + Staging are confirmed applied:

1. **User confirms:** "Migration [filename] applied to dev and staging"
2. **Claude updates `SCHEMA_SNAPSHOT.md`** — ALL of these, EVERY TIME, NO EXCEPTIONS:
   - **A. Changelog entry** (date, migration file, what changed) — even for "logic-only" changes like trigger rewrites
   - **B. Function/trigger descriptions** updated if any function or trigger behavior changed
   - **C. Structured tables** regenerated if columns/tables/FKs/indexes were added/altered (ask user to run `REFRESH_SCHEMA.sql`)
   - If user defers refresh, note staleness in `current_task.md`
   - **WHY:** Schema snapshot is not just for columns — it documents trigger behavior, function signatures, config data, and RLS policies. ANY migration that changes database behavior must be reflected here.
3. **Claude updates `MIGRATION_LOG.md`** — adds the row showing `✅ Dev`, `✅ Staging`, and a `Pending Prod` note in the description column.
4. **Claude does NOT move the file yet.** The file stays in `supabase/migrations/` because Prod has not yet been applied. Moving prematurely makes it look "done" when there's still a pending environment.
5. **Claude commits:** With a message describing what was applied to dev + staging and that Prod is still pending.

#### After Prod is confirmed applied:

6. **User confirms:** "Migration [filename] applied to prod"
7. **Claude moves the file:** `supabase/migrations/[file].sql` → `supabase/migrations/applied/[file].sql`
8. **Claude updates `MIGRATION_LOG.md`** — replaces the "Pending Prod" note with the prod application date.
9. **Claude updates `SCHEMA_SNAPSHOT.md` Change Log entry** — replaces "Pending Prod" with "Applied to all 3 envs".
10. **Claude commits:** "chore: migration NNN applied to prod — moved to applied/".

**CRITICAL:** The bookkeeping batches above (steps 2-4 for dev+staging, steps 7-9 for prod) are each single atomic operations. Do NOT update only one of the three files — they always move together.

**WHY all-three-envs as the trigger to move:** the `applied/` folder is meant to mean "this migration is fully deployed everywhere." A file in `applied/` while prod is still pending creates a false sense of completion and can confuse the next session about deployment state. Past slippage incidents (Session 71, 2026-04-25) involved migrations being moved at the dev+staging mark and then forgotten before prod application — leaving prod silently behind. Holding the move until all 3 envs are confirmed prevents that drift.

### Folder Structure
```
supabase/migrations/
├── applied/           # Confirmed applied to ALL 3 envs (Dev + Staging + Prod)
│   ├── 20260103_001_initial_schema.sql
│   └── ...
├── MIGRATION_LOG.md   # Tracking log (always current)
├── README.md          # Migration standards
└── 20260205_004_new_feature.sql  # Pending migrations (not yet in all 3 envs)
```

### Rules
- **Never move a migration** until user explicitly confirms it is applied to ALL 3 envs (Dev + Staging + Prod). Dev + Staging is the trigger for bookkeeping (changelog, MIGRATION_LOG row, snapshot updates) — but the file stays in `supabase/migrations/` until Prod is also applied.
- **Never delete migrations** - always move to applied/
- **Update MIGRATION_LOG.md** in two passes: first when Dev + Staging are applied (mark `Pending Prod` in description), again when Prod is applied (replace `Pending Prod` with the prod date).
- If only applied to Dev (not Staging), leave in root folder with ✅ Dev / ❌ Staging in log.

---

## New API Route Security Checklist - MANDATORY

Every new API route MUST have these elements. Check before committing:

### 1. Authentication
```typescript
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### 2. Authorization
- Verify user owns the resource OR has appropriate role
- Use `src/lib/auth/admin.ts` for admin checks (centralized)
- NEVER use query params to bypass authorization (e.g., `?admin=true`)

### 3. Input Validation
- Validate all request body fields
- Check types, ranges, and formats
- Use Zod schemas for complex validation

### 4. Rate Limiting
Apply appropriate limits for sensitive operations:
- Account deletion: 3/hour
- Admin operations: 30/minute
- Auth endpoints: 5/minute
- Standard API: 60/minute

### 5. Service Client Rules
- NEVER use `createServiceClient()` without verified admin role
- Admin role must be verified from database, not query params
- Document why service client is needed

### 6. Error Tracing
- Wrap handlers in `withErrorTracing()`
- Use `traced.auth()`, `traced.validation()` for structured errors
- Include error codes following ERR_XXX_NNN pattern

---

## New Feature Pre-Merge Checklist

Before merging ANY feature:

### Security Review
- [ ] No debug endpoints in code (`/api/debug/*` must be deleted)
- [ ] Service role only used with verified admin role
- [ ] All new routes have authentication
- [ ] Input validation on all endpoints

### Performance Review
- [ ] Images use `next/image` for display (not raw `<img>`)
- [ ] Upload images use `image-resize.ts` for compression
- [ ] Database queries are batched (no N+1)
- [ ] Cache headers on public data endpoints

### Error Tracking Review
- [ ] New routes wrapped in `withErrorTracing()`
- [ ] Error codes added to ERR_XXX pattern
- [ ] Sensitive operations have rate limiting

### RLS Review (if touching database)
- [ ] Query error_resolutions for similar issues
- [ ] Check existing policies before creating new ones
- [ ] Use `(SELECT auth.uid())` not `auth.uid()`
- [ ] Test policies don't cause recursion

### Schema Snapshot Review (if ANY migration was created or applied)
- [ ] Changelog entry added to `supabase/SCHEMA_SNAPSHOT.md`
- [ ] Function descriptions updated (if trigger/function logic changed)
- [ ] Structured tables regenerated or staleness noted in `current_task.md`
- **This applies to ALL migration types** — not just column/table additions. Trigger logic changes, config data updates, function modifications, RLS policy changes, and index additions ALL require schema snapshot updates.

---

## Image Optimization Rules

**Two separate concerns - don't confuse them:**

### Upload Compression (saves storage)
- Use `src/lib/utils/image-resize.ts` in upload components
- Settings: 1200px max dimension, 80% JPEG quality
- Result: 1-2MB → 300-600KB
- Already implemented in: ListingImageUpload, MarketBoxImageUpload

### Display Optimization (saves bandwidth)
- Use `next/image` component, NOT raw `<img>` tags
- Provides: lazy loading, responsive sizing, WebP conversion
- Required on: browse pages, listing cards, market-box cards
```tsx
import Image from 'next/image'

<Image
  src={imageUrl}
  alt={description}
  width={280}
  height={200}
  loading="lazy"
/>
```

---

## SECURITY DEFINER Function Rules

All SECURITY DEFINER functions MUST include:
```sql
CREATE OR REPLACE FUNCTION function_name()
RETURNS ... AS $$
  -- function body
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

Without `SET search_path = public`, functions are vulnerable to search path injection attacks.

---

## Database Schema Reference - MANDATORY

### NEVER rely on migration files for schema information.
Migration files may not reflect the actual database state. The source of truth is the database itself.

### Schema Snapshot File
Location: `supabase/SCHEMA_SNAPSHOT.md`

This file contains the actual database schema including:
- All tables and columns
- Foreign key relationships
- RLS policies
- Indexes
- Functions
- Triggers
- Views

### Rules:

1. **Before ANY database/schema work:**
   - Read `supabase/SCHEMA_SNAPSHOT.md` first
   - If the file seems outdated or you need to verify, ask user to query the database

2. **After EVERY confirmed successful migration — ALL types, not just column additions:**
   - **A. Add changelog entry** to `SCHEMA_SNAPSHOT.md` (date, migration file, what changed)
   - **B. Update function/trigger descriptions** if any function or trigger logic was modified (e.g., new conditions, vertical checks, bug fixes)
   - **C. Regenerate structured tables** (if columns/tables/FKs/indexes changed): Ask user to run `supabase/REFRESH_SCHEMA.sql` in the SQL Editor, paste results back, then rebuild the structured tables in `SCHEMA_SNAPSHOT.md`
   - A changelog entry alone is NOT sufficient — the structured column/FK/index/function tables are what Claude reads when making decisions. Stale tables cause wrong assumptions and bugs.
   - If user defers the refresh, note in `current_task.md`: "Schema snapshot structured tables are STALE — last verified [date]"
   - **Migrations that REQUIRE schema snapshot updates** (this list is exhaustive — if a migration does ANY of these, update the snapshot):
     - Adding/altering/dropping columns or tables
     - Adding/altering/dropping indexes
     - Creating/modifying trigger functions (even "logic-only" changes)
     - Creating/modifying RLS policies
     - Updating config/JSONB data in tables (e.g., `verticals.config`)
     - Adding/modifying RPC functions
     - Any DDL statement whatsoever

3. **When in doubt, query the database:**
   Ask the user to run `supabase/REFRESH_SCHEMA.sql` (comprehensive) or these individual queries:
   ```sql
   -- Tables
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;

   -- Columns
   SELECT table_name, column_name, data_type, is_nullable
   FROM information_schema.columns WHERE table_schema = 'public'
   ORDER BY table_name, ordinal_position;

   -- Foreign Keys
   SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
   FROM information_schema.table_constraints tc
   JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
   JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
   ```

4. **Deletion order for cleaning data:**
   Always reference `supabase/SCHEMA_SNAPSHOT.md` for foreign key relationships to determine correct deletion order. Never guess at table dependencies.
