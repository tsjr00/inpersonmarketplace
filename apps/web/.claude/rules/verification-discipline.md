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

### Incident: Session 63

Claude was asked to "review the code base" for go-live readiness. Instead of reading the code, Claude delegated to research agents and presented their findings as verified facts. Multiple claims were wrong:

1. **"Inventory overselling via GREATEST(0, qty-n)"** — Migration 078 had already rewritten the function to RAISE EXCEPTION. The fix was visible at line 736 of `checkout/session/route.ts`: `"C-1 FIX: RPC now RAISES EXCEPTION if insufficient stock"`. Claude would have seen this in 2 seconds of reading.

2. **"Market boxes are premium-exclusive"** — The cart API has zero premium checks for market box subscriptions. Claude wrote "Only premium members can subscribe" on the upgrade page based on existing (wrong) translation text and an agent's summary, without reading the 30-line function that handles market box cart adds.

3. **"Vendors see your premium badge on orders"** — The vendor orders API doesn't fetch buyer_tier. Claude wrote this as a feature claim without checking whether any code implements it.

In each case, reading the actual code would have taken less time than the incorrect work that followed.

### Incident: Session 65

Claude was asked "how will the app handle this?" — a request for analysis. Claude found a bug and edited 4 production files without reading more of the code or asking. The "find the bug" reasoning relied on memory and pattern-matching rather than verified reads. The user had to demand a revert.

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

### Incident: Session 73

Changed code based on belief about DB structure without checking snapshot. Caught by user. Memory file `feedback_verify_schema_before_changing.md` written then.

### Incident: Session 74

Drafted regression SQL with `o.payment_status` (column doesn't exist on `orders`). User asked "why do we have a schema snapshot file?" Re-tried with snapshot read, but next query used `o.vendor_payout_cents` which the snapshot claimed exists but live staging disagreed. Two failed queries before the user backlogged the investigation. Cost: ~30 min on an urgent regression.

**Both Session 74 failures occurred AFTER the gate existed.** They worked because the gate had a memory loophole — Claude believed a prior read in the same session satisfied it. The 2026-05-10 amendment closes that loophole. The snapshot itself was wrong about 4 columns on `orders`, proving rule (b) above is necessary, not just (a).

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

### Incident: Session 70

Spent 4 rounds speculating about a market-page bug root cause — filter mismatch, RLS, deleted_at, edge cache — all disproved. The fix was already shipped; the symptom was staging deploy propagation lag. Lesson: read direct page output (raw HTML/JSON/SQL result) BEFORE hypothesizing about filters, RLS, cache, or rendering.

---

## Cannot Be Overridden

No autonomy mode, no time pressure, no "just give me a quick summary" overrides the requirements above. Speed that produces wrong answers is slower than accuracy. A 10-finding report with 3 wrong findings is worse than a 7-finding report that's 100% correct — the user now has to verify everything because trust is broken.
