# Session 89 starting prompt — Diagnose slowness + inefficiency

**For Tracy: copy the block below and paste it as your first message to a fresh session. Do not edit unless you want to add context.**

---

## START OF PROMPT

You are starting a new session focused on a single mission: **diagnose why work on this project has gotten slower over the last several sessions, and produce concrete cuts that restore throughput**.

Do NOT make code changes this session. Do NOT apply migrations. Do NOT commit anything. Your output is a written report.

### What this project is

**InPersonMarketplace** is a multi-vertical platform connecting buyers, vendors, and market managers for in-person transactions. Production at `https://farmersmarketing.app` (FM = Farmers Market vertical) and `https://foodtruckn.app` (FT = Food Trucks vertical). The umbrella business entity is 815 Enterprises.

Stack: Next.js 14 App Router · Supabase (Postgres + Storage + RLS) · Stripe Connect (vendors + market managers) · Vercel · Resend for email · TypeScript with `exactOptionalPropertyTypes` strict mode enabled.

Real vendors run their businesses on this platform. Real buyers pay real money. The user (Tracy) is the founder + sole engineer. Mistakes have direct financial consequences.

### How sessions work — read in this order before anything else

1. `CLAUDE.md` in the repo root — the gateway file. It contains 3 ABSOLUTE rules verbatim and points to themed rule files. Read every line.
2. `apps/web/.claude/rules/` — 5 themed rule files: `change-discipline.md`, `verification-discipline.md`, `test-integrity.md`, `git-and-deployment.md`, `code-stability.md`. These are loaded each turn and govern behavior.
3. `apps/web/.claude/current_task.md` — current state at end of Session 88 (the session that requested this diagnostic).
4. `apps/web/.claude/vault-manifest.md` — what's verified working, do NOT break.
5. `CLAUDE_CONTEXT.md` in the repo root — app overview, architecture, lessons learned, session history table.
6. `supabase/SCHEMA_SNAPSHOT.md` — current database schema + migration changelog (top of file).
7. `apps/web/.claude/PROCESSES_AND_PROTOCOLS.md` — session workflows and quality gates.
8. Your own memory at `C:\Users\tracy\.claude\projects\C--GitHub-Projects-inpersonmarketplace\memory\MEMORY.md` — feedback memories, project context. Reload at start of every session.

You will see `<system-reminder>` wrappers throughout the conversation. Pay attention to them — they convey rules, hooks, user-state, and tool-availability changes.

### The 3 ABSOLUTE rules (verbatim from CLAUDE.md, never overridden)

1. **Present Before Changing** — your preceding message must contain a `?` asking for permission for any specific edit before Edit/Write fires. A user question is NEVER permission to change code.
2. **Never Change a Business Rule Test to Match Code** — tests are the spec; code conforms to tests.
3. **Schema Mechanical Gate** — before composing ANY SQL referencing a public-schema column, the immediately preceding tool call MUST be either a `Read` of `SCHEMA_SNAPSHOT.md` for the affected table OR a successful `information_schema.columns` query.

This session is a research session — none of the three should fire because you are not writing code or composing SQL.

### Autonomy modes

Default is **Report mode** — research, read files, analyze. Any code change requires Tracy to switch you to Fix or Ship mode. For this session, stay in Report mode the entire time.

### Critical user preferences (from memory)

- **No `AskUserQuestion` tool with structured options/checkboxes.** Plain text questions only. Tracy has confirmed this is a hard rule.
- Concise responses. Tracy gets frustrated with walls of text that push their messages off-screen.
- When Tracy pastes content (errors, query results), quote it back at the top of your response in a code block so it remains visible in their chat UI.
- Don't make changes just to demonstrate value. Restraint is professional judgment.
- Cite file:line for every code claim, or label it UNVERIFIED.
- Tracy is the sole user — there is no team to coordinate with.

### Your mission this session — the diagnostic

Tracy has flagged that work has slowed materially over recent sessions. Tasks that used to take 30 minutes now take 2 hours. The cause is unknown. Investigate the following 8 named diagnostic targets, in this order. For each, read what's there, measure something concrete, identify what should change, and write your findings to a single output file at `apps/web/.claude/session89_diagnostic_findings.md`.

#### Diagnostic target 1 — Rule + hook proliferation

Read `apps/web/.claude/rules/` and count: how many files? Total lines? Approximate tokens? Compare to what's reasonable for a working ruleset. Identify rules that have not been cited / fired recently. Identify rules that could be merged. Read the 4 husky hooks at `.husky/`: how long does each take to run on average? Look at recent commit/push output for timing. Recommend specific cuts: which rule files to archive, which hooks to slim or remove.

#### Diagnostic target 2 — Memory file count + retrieval cost

Read `C:\Users\tracy\.claude\projects\C--GitHub-Projects-inpersonmarketplace\memory\MEMORY.md` — the index. Count the files. Read each `feedback_*.md`. Identify: which are still active vs stale? Which overlap and could be merged? Which were written for a specific incident that has been mechanically gated and no longer needs the memory? Recommend specific files to archive, merge, or delete.

#### Diagnostic target 3 — Per-commit feedback loop time

Run `git log --since="60 days ago" --pretty=format:"%H %ad %s" --date=short | head -50` to get recent commit history. From the commit messages, identify commits that failed pre-commit or pre-push and needed a fix-forward — count them. For each, estimate the wasted time. Look at the recent build output cached in `apps/web/.next/` or recall from CLAUDE_CONTEXT.md / current_task.md narratives. Quantify the hook overhead per commit. Recommend: which gates are catching real issues, which are friction without value.

#### Diagnostic target 4 — Recent error rate

Pull the last 20 commits and look for patterns. Today (Session 88) already had: PERF-R8 doc gap, typography.sizes.md vs .base, mig 152 missed validate_cart_item_schedule, mig 154 missed SCHEMA_SNAPSHOT update, fix-forward commit landed on wrong branch. These are six observable errors in one session. Earlier sessions had similar — read `apps/web/.claude/session*.md` files for patterns. Identify: are errors fatigue-driven (long sessions), context-window-driven (forgetting earlier details), or rule-coverage-driven (gates not firing where they should)? Recommend the specific change that would prevent the highest-impact category.

#### Diagnostic target 5 — Scope creep per session

Read `CLAUDE_CONTEXT.md` session history table. For each of Sessions 80-88, identify: what was the stated initial goal? What was actually shipped? How many distinct deliverables per session? Quantify scope expansion. Recommend: should sessions be more aggressively bounded? Should "out of scope" be a more frequent answer?

#### Diagnostic target 6 — Tool-call efficiency

Look at the conversation patterns recorded in `apps/web/.claude/session*` files where present, and in `current_task.md` mid-session updates. Identify: are tool calls being made serially when parallel would work? Are agent subagents being spawned for tasks the main thread could handle directly, with the overhead of the agent setup? Are searches being run with overly-broad scope when targeted would suffice? Recommend specific changes to default behavior.

#### Diagnostic target 7 — Migration application overhead

Look at how migrations get applied: Dev → verify → Staging → verify → smoke test → Prod → verify → bookkeeping commit. Count the human turns per migration in Sessions 85-88. Identify which verification queries are genuinely catching issues vs ceremonial. Recommend specific cuts. Also: should there be a "low-risk additive migration" fast path (e.g., adding a NULL column with safe default) that skips some steps?

#### Diagnostic target 8 — Rule 7 (teaching mode) overhead

Read `apps/web/.claude/rules/git-and-deployment.md` Rule 7. This rule requires explaining every git operation before executing. It was added in Session 80. Tracy may have internalized the mechanics by now — quantify how often the explanations have been "load-bearing" (the explanation prevented an issue) vs "noise" (Tracy reads and moves on). Recommend: keep, slim down, or disable.

### Output format

Single file at `apps/web/.claude/session89_diagnostic_findings.md`. Structure:

```markdown
# Session 89 — Diagnostic Findings

**Date:** [today]
**Author:** Session 89 Claude

## Executive summary (3-5 sentences)

## Per-target findings

### Target 1 — Rule + hook proliferation
**What I found:** [concrete data]
**What I recommend:** [specific action]
**Estimated impact:** [time saved per commit / per session]

### Target 2 — Memory file count + retrieval cost
[same structure]

...etc for all 8 targets

## Cross-cutting themes
[Things you noticed across multiple targets]

## Recommended action list (ranked by impact / effort ratio)
1. [Highest impact, lowest effort]
2. ...

## What I deliberately did NOT change
[List anything you considered changing but didn't, with brief reasoning]
```

### Constraints — what you must NOT do this session

- No code changes.
- No migrations.
- No commits.
- No `git push`, no `git merge`, no `git checkout` other than read-only state checks.
- No notification template additions.
- No new rule files.
- Do not delete or archive anything yourself — recommend, don't execute.
- Do not use the `AskUserQuestion` tool. Plain text questions only.
- Do not ask Tracy questions about implementation decisions — your job is to RESEARCH and REPORT, not collaborate on solutions.

### What you SHOULD do this session

- Read everything in the diagnostic targets list above.
- Use the `Read`, `Grep`, `Glob`, `Bash` (for read-only git commands) tools liberally.
- Use the `TaskCreate` / `TaskUpdate` tools to track your progress through the 8 targets.
- Write incrementally to the findings file — each target written immediately after research, before moving to the next. (Per the Incremental Research Protocol in `CLAUDE.md`: "DO NOT research everything first then write from memory. Auto-compaction erases unwritten findings.")
- At the end, present the findings file path + a 5-sentence summary in chat. Tracy will review and decide what to act on.

### Where Phase 1B picks up after the diagnostic

After Tracy reviews your findings and decides what process changes to make, the next work session resumes Phase 1B of the manager export + lockout plan. That's documented in:
- `apps/web/.claude/current_task.md` (end-of-Session-88 state)
- `apps/web/.claude/manager_export_and_lockout_plan.md` (full Phase 1B scope)

You do not need to look at Phase 1B for this diagnostic session. Mentioned only so you know what the diagnostic is in service of.

### Current state of the codebase (do not assume this is fresh state)

- Local main, origin/staging, origin/main: see `current_task.md` for exact SHAs
- Migrations on Prod: through 152 + 149 + 150 + 151 (all applied). Mig 154 on Dev + Staging only.
- Working tree has uncommitted notes in `apps/web/.claude/*.md` files — these are intentional handoff state from Session 88, do not commit them.

### When you are done

End your final message with the path to your findings file and the 5-sentence summary. Do not propose action items beyond what's in the findings file. Tracy will decide what to do next.

## END OF PROMPT
