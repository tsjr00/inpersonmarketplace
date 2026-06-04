# Verification Discipline — Cite the Code, Not Your Memory

**Priority: ABSOLUTE — Every claim about what code does, what data exists, or what columns are available must be backed by a fresh read or marked UNVERIFIED.**

## The Shared Principle

Agents, prior audits, documentation, memory files, schema snapshots — all of these are useful for **finding where to look**. None of them are sources of truth about **what is actually true right now**. Only the live code, the live database, and the live response payload are truth.

Treating any source of indirect knowledge as ground truth is the most common form of misinformation Claude introduces. The damage compounds: a wrong claim leads to a wrong fix, which leads to a wrong commit, which leads to a wrong deploy, which leads to a real-world incident.

The four rules below all enforce a single discipline: **verify before claiming, verify before changing, verify before recommending.** Each rule starts with a mechanical gate that you run before the action — the gate is the rule. The narrative below the gate explains why and shows what failure looks like.

---

## Rule 1: Cite the Code or Mark as Unverified

### THE GATE — Run before sending any message containing code claims

Before sending any user-facing message, scan it for these verbs followed by code/data behavior:

> returns, allows, calls, fails, lacks, has, is missing, does not, requires, blocks, prevents, throws, sets, fetches, queries, inserts, updates, deletes, validates, checks, enforces, skips, handles, routes, redirects

For EACH sentence containing one of those verbs applied to code/data behavior:

- Does it have a `path:line` citation? → OK to send
- Does it have the literal word `UNVERIFIED` at the start of the sentence? → OK to send
- Neither? → **STOP.** Either:
  - Read the code now and add the `path:line` citation, OR
  - Rewrite the sentence to start with `UNVERIFIED: ` to flag it as a hypothesis

**This scan applies to every user-facing message. Not "important" messages. Every message.**

The scan takes seconds. The cost of skipping it has been multi-day debugging spirals, wrong fixes shipped to prod, and broken trust.

### The Rule

**Before presenting any claim about what the code does, doesn't do, or should do, you must cite the specific file and line number where you personally read the evidence. If you cannot cite a line, you must either read the code first or explicitly label the claim as "UNVERIFIED."**

This applies to:
- Audit findings ("this function allows overselling")
- Feature claims ("market boxes are premium-exclusive")
- Bug reports ("this route has no authentication")
- Risk assessments ("this system has a race condition")
- UI copy about what features do ("vendors see your premium badge")

### Indirect Knowledge Is Not Truth

Research agents, prior audits, documentation, and memory files are useful for **finding where to look**. They are NOT sources of truth about **what the code does**. Only the code is.

**Pattern:** Agent finds → Claude reads → Claude verifies → Claude presents with citation.
**Anti-pattern:** Agent finds → Claude presents agent's conclusion as own finding.

**An unverified claim presented as fact is a lie.** It doesn't matter that an agent said it, that a prior session documented it, or that a translation file implies it. If you didn't read the implementation, you don't know.

### How Agents Should Be Used

Agents are valuable for:
- Finding which files to read (search, glob, grep)
- Identifying areas of the codebase relevant to a question
- Gathering file paths and function names to investigate

Agents are NOT a substitute for:
- Reading the code yourself
- Verifying that a claimed behavior exists in the current code
- Confirming that a previously-documented bug still exists

### Why (incidents → `rule-incidents.md`)

**Session 63** — a "review the code base" request was answered with agents' conclusions presented as verified facts; multiple were wrong (a fix already shipped, a premium check that didn't exist, a feature claim with no implementation) — each disprovable in seconds of reading. **Session 65** — "how will the app handle this?" (an analysis request) was answered by editing 4 production files on memory/pattern-matching; required a revert. Full write-ups: `apps/web/.claude/rule-incidents.md` → verification-discipline · Rule 1.

---

## Rule 2: Schema Mechanical Gate — Verify Before Composing SQL

### THE GATE — Run before composing any SQL

**Before composing ANY SQL that references a public-schema table column, the immediately preceding tool call MUST be either:**

**(a)** A `Read` of `supabase/SCHEMA_SNAPSHOT.md` for the affected tables, OR
**(b)** A successful `information_schema.columns` query result for those tables

This applies equally to:
- SQL Claude runs via Bash
- SQL Claude gives the user to paste into the Supabase SQL Editor
- SQL embedded in code, comments, or migrations

**There is no "earlier in session" exception (loophole removed 2026-05-10).** Every SQL composition turn requires a fresh tool call before the SQL. Memory of an earlier read does not satisfy the gate. Sessions 73 and 74 both broke this gate by claiming "I read it earlier" — that is the loophole this revision closes.

### What Does NOT Count

- Memory of column names from prior conversations
- An earlier read in this session (loophole removed)
- Code that uses the column (the code may be using a column that doesn't exist on this branch)
- TypeScript types (these are also just code)
- "I'm pretty sure" or "this is a standard column"

### Snapshot-May-Be-Wrong Escalation

If the snapshot fails — column missing from a live query result that the snapshot claimed exists, OR the snapshot has a "STALE" warning for the affected tables — STOP and run `information_schema.columns` discovery against the live database before composing any further SQL. **The snapshot is best-effort; only `information_schema` is authoritative for the live env.**

### Self-Check Before Any SQL

1. List the tables the SQL touches.
2. For each table: does the IMMEDIATELY preceding tool call (this turn) include a Read of its section in `SCHEMA_SNAPSHOT.md` OR a successful `information_schema.columns` result?
3. If ANY table answer is no → STOP. Do the discovery first.
4. For each column the SQL references: did I see it in the verified column list?
5. If ANY column answer is no → STOP. Either find it in the schema or remove it.

`information_schema.columns` discovery queries are exempt from the gate — that's the gate's escape hatch. The result then qualifies as a fresh read for the tables it covered.

### Why (incidents → `rule-incidents.md`)

**Session 73** — changed code on a belief about DB structure without checking the snapshot; caught by user. **Session 74** — drafted regression SQL with `o.payment_status` (nonexistent), then `o.vendor_payout_cents` which the snapshot claimed but live staging lacked — two failed queries on an urgent regression. Both occurred AFTER the gate existed, via a memory loophole (closed 2026-05-10); the snapshot was itself wrong about 4 columns, proving rule (b) is necessary, not just (a). Full write-ups: `apps/web/.claude/rule-incidents.md` → verification-discipline · Rule 2.

This gate cannot be overridden by autonomy mode, time pressure, urgency of the issue under investigation, or "just a quick query." Speed that produces wrong queries is slower than accuracy. The cost of the gate is one tool call.

---

## Rule 3: Schema Snapshot Must Be Updated After Every Migration

### THE GATE — Run after any user confirmation that a migration was applied

When the user says "migration X applied to dev/staging/prod," before composing any other response:

1. Open `supabase/SCHEMA_SNAPSHOT.md`
2. Add a Change Log entry: date, migration filename, what changed
3. If the migration contains `CREATE OR REPLACE FUNCTION`, `CREATE TRIGGER`, or `CREATE OR REPLACE TRIGGER`: update the Functions/Triggers section
4. If the migration adds/alters columns/tables/indexes: ask the user to run `REFRESH_SCHEMA.sql` and rebuild the structured tables

If you skip any of these steps, the next session's Schema Mechanical Gate (Rule 2) will be operating on stale data and will produce wrong SQL. The cost of this rule failing is paid by the next session, not yours — which is exactly what makes it easy to skip.

### The Rule

**After ANY migration is confirmed applied, you MUST update `supabase/SCHEMA_SNAPSHOT.md` BEFORE moving the migration file or committing the "applied" status.**

This is NOT optional. This is NOT just for column additions. This applies to ALL migration types:
- Column/table additions or alterations
- Trigger function logic changes (even "logic-only" rewrites)
- RLS policy changes
- Index additions
- Config/JSONB data updates (e.g., `verticals.config`)
- RPC function changes
- Any DDL statement

### Why This Exists

Migration 026 changed trigger function logic and added JSONB config data to the `verticals` table. The schema snapshot was NOT updated because the migration didn't add columns — only changed trigger behavior and config values. This was caught by the user, not by Claude. The root cause: prior rules only emphasized column/table changes, causing Claude to skip the snapshot for "logic-only" migrations.

For the full migration workflow (file moves, MIGRATION_LOG updates, dev/staging/prod bookkeeping), see `apps/web/docs/migration-workflow.md`.

---

## Rule 4: Data-First Policy — Verify Before Hypothesizing

### THE GATE — Run before stating any factual claim

Before stating any fact about the system (schema, configuration, business rules, user state, current behavior):

1. Can I verify it with a tool I have available right now? (Read, Grep, SQL query, file inspection)
2. If YES → verify it before stating
3. If NO (would require external dashboard, manual UI test, third-party API call) → state it as a hypothesis with confidence marker:
   - **Confirmed** — direct evidence (cite the source)
   - **High** — strongly supported by indirect evidence
   - **Medium** — plausible but not verified
   - **Low** — guess based on pattern matching

**Never use the language "the actual root cause" / "here's what's happening" / "found it" for unproven hypotheses.** That language signals certainty you don't have. List what would prove or disprove each hypothesis so the user can decide whether to spend time verifying.

### The Rule

When you need information (schema, configuration, business rules):

1. **Hypothesize** where the data lives (config files, existing code, docs)
2. **Look** — actually read the file or query the source
3. **Confirm** you found the correct data
4. **Use** — only then proceed with actual data

**If data is NOT available:** STOP and ask before making any assumption. State: "I need to assume X because I cannot find this data. Is this acceptable?"

### Why This Matters

Assumptions waste time and tokens when data exists. Wrong assumptions cause bugs that cost business. Example: hard-coding 24hr cutoff when `cutoff_hours` column existed in the database.

### Why (incident → `rule-incidents.md`)

**Session 70** — 4 rounds speculating about a market-page bug (filter/RLS/deleted_at/cache), all disproved; the fix was already shipped and the symptom was deploy lag. **Read direct page output (raw HTML/JSON/SQL) BEFORE hypothesizing about filters, RLS, cache, or rendering.** Full write-up: `apps/web/.claude/rule-incidents.md` → verification-discipline · Rule 4.

### Enumerate multi-item sets by query, never from memory

When a task is "apply X to **all** the rows/functions/tables that match Y" (e.g. REVOKE on every anon-executable function, ALTER every table with column Z, update every route that calls W), **generate the list from the source and operate on that output** — do not type the list from memory. A `SELECT` against `information_schema`/`pg_catalog`, or a `Grep`, produces the authoritative set; an enumerated-from-memory list silently drops items.

Session 88 incident: mig 152 was meant to REVOKE on all anon-executable cart-validation functions, but `validate_cart_item_schedule` was dropped from the hand-written list and shipped incomplete. A query would have included it.

---

## Rule 5: Schema Intent Gate — Read the Design Signals Before CRUD Operations

### THE GATE — Run before writing any DELETE, replace-all, or destructive CRUD pattern

Rule 2 (the Schema Mechanical Gate) is about reading column NAMES before composing SQL. **This rule is about reading column INTENT and FK consequences before designing CRUD operations.** Both gates are required.

Before writing code that DELETEs rows from a table, or designing a "replace the whole set" save pattern, run these three checks:

#### Check 1 — Soft-delete column present?

Open the relevant migration (or query `information_schema.columns`). Does the target table have any of:

- `active`, `is_active`
- `deleted_at`, `archived_at`, `removed_at`
- `is_deleted`, `is_archived`, `is_removed`
- `status` column with values like `'inactive'`, `'archived'`, `'deleted'`

If YES → **the schema designer expected soft-delete.** The column exists for exactly this purpose. DELETE is wrong; UPDATE-the-flag is right.

#### Check 2 — Cascade FK present?

Does any OTHER table reference this one via FK with `ON DELETE CASCADE`? Grep the migration files for the pattern `REFERENCES <target_table>.*ON DELETE CASCADE`. If yes, DELETE here triggers silent data loss in those other tables — possibly across many rows.

#### Check 3 — Pattern reuse without diff?

If reusing a pattern from a recent build (especially within the same session — **pattern momentum is the #1 source of design mistakes**), state EXPLICITLY: "this is similar to X build I did earlier" — then ask "what's different about THIS table?"

Force the comparison. Common differences that matter:
- Soft-delete column presence (the recent build didn't have one; this one does)
- FK direction with CASCADE (one is referenced; the other isn't)
- Vendor-facing vs internal-only data
- Whether downstream tables hold "history" or "current state"

### What to do when checks reveal a problem

- **Soft-delete column present** → Design as UPDATE-the-flag. Never DELETE rows. Vendor / downstream history is preserved; toggle on/off without losing data.
- **CASCADE FK present** → Either (a) design as UPDATE-the-flag (preferred), OR (b) explicitly enumerate every cascade consequence in the design doc + the user-facing copy. If the user-facing copy needs an acknowledgment dialog warning about radiating data loss, **the design is wrong; redesign**. Acknowledgment dialogs are not a substitute for non-destructive design.
- **Pattern reuse without diff** → Stop. Read the target table's schema. Re-run Checks 1 and 2 explicitly. Document the "what's different" answer in code comments before writing the new pattern.

### Why (incident → `rule-incidents.md`)

**Session 83** — a manager-schedule editor built with delete-and-replace on `market_schedules` despite an `active BOOLEAN` soft-delete column AND an `ON DELETE CASCADE` FK both visible in the same migration; the pattern was carried over from a build (optin selections) that had neither signal. The acknowledgment dialog was designed AROUND the destructive cascade instead of away from it. Caught by user before shipping. **The information was not hidden — the three checks cost ~30s each; skipping them would have destroyed vendor attendance data on every Save.** Full write-up: `apps/web/.claude/rule-incidents.md` → verification-discipline · Rule 5.

### This rule does not lift in "Fix" mode

Fix mode authorizes code changes without per-change approval. It does NOT authorize skipping design verification. The user's "proceed" is approval to build; it is not approval to skip Checks 1, 2, 3. Those checks happen BEFORE the build begins. They are the design phase, not the implementation phase.

---

## Cannot Be Overridden

No autonomy mode, no time pressure, no "just give me a quick summary" overrides the requirements above. Speed that produces wrong answers is slower than accuracy. A 10-finding report with 3 wrong findings is worse than a 7-finding report that's 100% correct — the user now has to verify everything because trust is broken.
