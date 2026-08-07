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

## Rule 6: Codebase Map Must Track What the Code Does

### THE GATE — Run before committing a change that alters what a file DOES

`docs/Codebase_Map/` is the code-side twin of `SCHEMA_SNAPSHOT.md`: the single place a new engineer, a CTO, or a future session is sent to understand the system. It is enforced two ways, because only half of the problem is machine-checkable.

**The machine half** (`apps/web/src/lib/__tests__/codebase-map-coverage.test.ts`, runs in pre-commit): a NEW source file with no map entry fails the commit; a DELETED file named in the map fails the commit; an undocumented cron fails the commit; a protected money file without its ⚠ marker fails the commit. You do not have to remember these — the test blocks you.

**The procedural half** (this rule — no test can check it):

> When a commit changes what a file DOES — its purpose, its flow, or its money behavior — update that file's line in the map and bump the domain's `verified=` stamp in `00_INDEX.md`, **in the same commit.**

A test can verify a file is *mentioned*. No test can verify its one-line description is still *true* after someone changes the behavior. That is why stamps exist: semantic drift becomes VISIBLE as a stale stamp instead of silently misleading the next reader.

### What does NOT require a map update

Bug fixes that preserve the file's purpose · refactors with no behavior change · test-only and docs-only commits · copy changes. Do not perform ritual map edits on every commit — that trains rubber-stamping, which is how the count-only test assertions became worthless (test-integrity Rule 1).

### What DOES require one

A new file or route (the test forces this) · a file whose responsibility changed · a new or changed money path · a new cross-file contract · a new integration or environment variable · a retired pattern or a newly protected file · a decision that invalidates something the map asserts.

### Why

A map that drifts is worse than no map, because it is *trusted*. The proof is in this repo: the earlier one-shot `apps/web/.claude/review/SYSTEM_MAP.md` (2026-07-12) was accurate when written and carried a stale "prod pending" claim within six days. The bootstrap pass on 2026-07-18 also found the vendor-tier prices quoted in a memory file were obsolete against `pricing.ts`. Enforcement is what separates a map from a snapshot.

---

## Rule 7: Structural and Inventory Claims Need the Same Gate as Behavior Claims

### THE GATE — Run before any claim about WHERE something is or HOW MANY there are

Rule 1 gates claims about what code *does* — its verb list is `returns`, `calls`, `validates`, `enforces`. That framing leaves a hole, and **every miss in the 2026-08-07 dashboard session fell through it.** Not one was a behavior claim.

**Before sending any sentence that asserts structure, location, or completeness, the same turn must contain the command output that proves it.** Trigger phrases:

- "these are all the X" · "there are N of X" · "the only X is…"
- "X is inside Y" · "X renders in/outside Y" · "X lives in Y"
- "there is no X" · "X doesn't exist" · "nothing uses X"
- "X is unaffected" · "the blast radius is just Y"

A `grep`, `find`, `ls`, or `wc` in the same turn satisfies it. Memory of a file you read earlier does **not** — and neither does a plan or design doc, **including one you wrote yourself last session.**

### Why documents are the specific trap here

Rule 1 already says agents and docs are leads, not truth. In practice that gets applied to *other people's* documents. **The 2026-08-07 session repeated two false claims straight out of `dashboard_redesign_plan.md` — a file Claude had authored the session before:** that the vendor dashboard's eight `2xl` uses were "the wrapping problem" (seven were emoji, which cannot wrap) and that the shopper dashboard had three `<h2>` sections (it had four). Both were disproved by a single grep once someone asked.

**A plan file is a hypothesis with good provenance. It is not evidence.** Re-verify its factual claims at the moment you rely on them, exactly as you would an agent's output.

### Inventory before design, not during

When the task is "define a rule / taxonomy / standard that will apply across surfaces," **map every surface first, then write the rule.** Deriving a universal rule from one sample and patching it as counter-examples surface is slower and it burns the user's trust in the rule itself.

2026-08-07 incident: the tile/card taxonomy was written from the vendor dashboard alone. "Cards are full-width and stacked" was contradicted within minutes by a card that belonged in a grid, then again by two more, then the "these render outside the grid" claim about the leftovers turned out to be false — two of them sat in a grid beside four converted siblings. Three correction rounds, all avoidable by inventorying the containers first.

### Visual judgments are not yours to make confidently

You cannot see the rendered screen. For claims about how something **looks or feels in place** — spacing, balance, whether a layout "fits" — present the options and say plainly that the user is the one who can evaluate it. Do not lead with a confident recommendation dressed in reasoning.

2026-08-07: a full-width placement was recommended with confident rationale and rejected by the owner the moment it was seen on staging.

---

## Cannot Be Overridden

No autonomy mode, no time pressure, no "just give me a quick summary" overrides the requirements above. Speed that produces wrong answers is slower than accuracy. A 10-finding report with 3 wrong findings is worse than a 7-finding report that's 100% correct — the user now has to verify everything because trust is broken.
