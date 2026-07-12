# Session 89 — Diagnostic Findings

**Date:** 2026-06-03
**Author:** Session 89 Claude
**Mode:** Report only. No code changes, no migrations, no commits made this session.

## Executive summary

Work slowed mainly because the **per-turn context load has grown to ~27k tokens** — 5 rule files + both CLAUDE.md files + the memory index, all loaded on *every* turn (verified: all present in this session's opening system-reminder), much of it **duplicated three ways** across rule files, `feedback_*.md` memories, and the MEMORY index. That load costs latency and money on every turn and dilutes attention, which is the best fit for the recent error pattern (enumeration and branch-state slips, not knowledge gaps). The **hooks and gates are not the bottleneck** — pre-commit runs in ~25s (measured, 1493 tests) and catches real issues; the actual human time sinks are staging round-trips and the two-pass, all-3-env migration ceremony. The bloat is **self-inflicted by scope creep**: sessions reflexively add new rules/memories/docs, each a permanent tax on all future turns. The highest-leverage fixes — de-duplicating governance content (~27k→~17k tokens/turn), archiving ~25 now-codified memories, bounding session scope, query-driven enumeration, and a fast path for low-risk migrations — restore throughput **without weakening any safety gate**.

---

## Per-target findings

### Target 1 — Rule + hook proliferation

**What I found:**

Five rule files in `apps/web/.claude/rules/`, **1,131 lines total**:

| File | Lines | Chars |
|---|---|---|
| `change-discipline.md` | 176 | 11,996 |
| `code-stability.md` | 167 | 8,839 |
| `git-and-deployment.md` | 313 | 17,478 |
| `test-integrity.md` | 203 | 13,039 |
| `verification-discipline.md` | 272 | 18,081 |
| **rules subtotal** | **1,131** | **69,433** |

These are **auto-loaded in full on every turn** — confirmed this session: the opening `<system-reminder>` contained all five files verbatim, plus both `CLAUDE.md` files and the full `MEMORY.md` index. Combined always-loaded governance context:

| Source | Chars |
|---|---|
| Project `CLAUDE.md` | 13,646 |
| 5 rule files | 69,433 |
| Global `~/.claude/CLAUDE.md` | 9,189 |
| `MEMORY.md` index | 16,630 |
| **Total** | **108,898 (~27,000 tokens)** |

**~27k tokens are spent before any work on every single turn.** That is the single largest structural cost I found, and it cross-cuts Targets 2, 4, and 8.

Duplication is the biggest waste inside that budget:
- The 3 ABSOLUTE rules are printed **verbatim in full** in `CLAUDE.md` (lines ~70-160) AND again in the rule files. `CLAUDE.md` ABSOLUTE RULE 1 ≈ `change-discipline.md` Rule 1; ABSOLUTE RULE 3 ≈ `verification-discipline.md` Rule 2. Each is loaded twice per turn.
- Within `change-discipline.md`, Rule 1 (present-before-changing) and Rule 2 (no-unauthorized-changes) restate the same principle from two angles (~176 lines for what is one rule with two gates).
- Rule 7 of `git-and-deployment.md` (teaching mode, ~110 lines incl. 5 worked examples) is self-described as temporary and is the largest single block in the largest rule file (see Target 8).

Husky hooks: **4 files, 341 lines**: `pre-commit` (94), `prepare-commit-msg` (76), `pre-push` (97), `pre-rebase` (74). Measured timing:
- **pre-commit ≈ 22-25s**: lint-staged (1-2s) + `tsc --noEmit` (~6s, documented) + `vitest run` — **measured 15s wall, 1493 tests, all pass** (`.husky/pre-commit:85-94`).
- **pre-push ≈ 2-3 min**: `npm run build` (30-60s) + Playwright `--max-failures=1` (documented 1-2 min) (`.husky/pre-push:93-97`).

The hooks are well-targeted and catch real issues (see Target 3). They are **not** the slowness culprit — pre-commit at ~25s and infrequent pushes are reasonable. The cost is the per-turn context load, not the gates.

**What I recommend:**
1. Stop double-loading the ABSOLUTE rules. In `CLAUDE.md`, replace the verbatim ABSOLUTE RULE 1/2/3 blocks with a 2-3 line summary each + the existing pointer to the rule file. The rule files remain the detailed home. (~3-4k chars/turn saved.)
2. Merge `change-discipline.md` Rule 1 + Rule 2 into one "Permission Before Action" rule with two gates. (~40-50 lines.)
3. Remove or collapse Rule 7 teaching mode (Target 8). (~110 lines / ~4k chars.)
4. Leave the hooks alone — they earn their keep.

**Estimated impact:** Trimming duplicate/temporary rule content takes the per-turn governance load from ~27k toward ~17-19k tokens. Over a 100-turn session that is ~800k-1M fewer tokens processed → measurably lower latency per turn and less attention dilution (which itself reduces the error rate in Target 4). Hook changes: none recommended.

### Target 2 — Memory file count + retrieval cost

**What I found:**

**45 `.md` files, ~111,875 chars total** in the memory dir. Of these, only `MEMORY.md` (16,630 chars / ~4k tokens) loads every turn as the index. The individual `feedback_*.md` files load on recall. So the per-turn cost here is the **index**, and it is bloated: many pointer lines are 3-5 lines long with full lesson text, defeating the "one line per memory" design. The index alone is ~4k tokens/turn.

The deeper problem is **triple coverage**. The same lesson now lives in three places at once: (1) a rule file loaded every turn, (2) a `feedback_*.md` file, and (3) a multi-line pointer in `MEMORY.md`. The feedback memories were the *precursors*; the rule files are the *codification*. Once a lesson is mechanically gated, the memory is redundant.

Mapping the 38 `feedback_*.md` files to their codifying rule:

| Cluster (lesson now codified) | Redundant feedback files | Codified in |
|---|---|---|
| Present before changing / `?` gate | `present_before_changing`, `present_before_implementing`, `stop_before_fixing`, `no_acting_without_approval`, `question_mark_gate`, `commit_push_approval` | `change-discipline.md` R1 + the mechanical `?` gate |
| Critical-path file protection | `critical_path_protection` | `change-discipline.md` R3 |
| Cite-or-verify / data-first | `verify_before_writing`, `verify_schema_before_changing`, `data_not_memory`, `data_integrity_traceability`, `verify_output_before_hypothesizing`, `confidence_calibration`, `assumptions_kill_businesses`, `real_numbers_only`, `no_silent_fallbacks` | `verification-discipline.md` R1-R4 |
| Git / deploy mechanics | `explicit_branch_chain`, `one_push_at_a_time`, `verify_push_by_remote_tip`, `staging_only_push`, `build_before_commit`, `foreground_for_long_ops`, `clear_full_next_dir`, `proceed_after_migration_confirmed` | `git-and-deployment.md` R1-R6 + hooks |
| Action bias / restraint | `action_bias` | `change-discipline.md` R2, `code-stability.md` R2 |

That is **~25 of 38 feedback files whose lesson is already enforced by a rule file or a hook.** They are paying index rent every turn for guidance that fires mechanically.

What is genuinely still memory-only (keep): `no_ask_question_tool` (hard UI preference, not in any rule), `token_efficiency` / `consistent_brevity` / `clear_instructions` / `preserve_pasted_content` / `test_instructions_specificity` (communication style), `dont_ask_obvious` / `ask_basic_questions_first` (when-to-ask judgment), `work_cadence_role_split` / `pause_between_meaningful_steps` (cadence), and the `project_*` files (live state). `session59_location_regression` and `verify_policy_claims_not_just_code` carry incident specifics worth keeping but could be one-line.

**What I recommend:**
1. Archive the ~25 redundant `feedback_*.md` files (the four codified clusters above) to a `memory/archive/` folder — keep the history, stop carrying the index lines.
2. Collapse the communication/cadence feedback files into **one** `feedback_working_style.md` (style + when-to-ask + cadence + role-split in one file).
3. Rewrite `MEMORY.md` so every pointer is one true line. Target: index under ~6k chars (~1.5k tokens), down from 16.6k.

**Estimated impact:** Index drops from ~4k to ~1.5k tokens/turn (~2.5k saved every turn). More importantly, recall stops surfacing 5 near-identical "present before changing" memories when one rule already governs it — less noise, faster relevant recall.

### Target 3 — Per-commit feedback loop time

**What I found:**

Measured hook overhead:
- **pre-commit ≈ 22-25s/commit**: lint-staged + `tsc --noEmit` (~6s) + `vitest run` (**measured 15s, 1493 tests passing**).
- **pre-push ≈ 2-3 min/push**: `npm run build` + Playwright.

~62 commits in the last 60 days (2026-05-10 → 2026-06-03). I scanned every `fix(` message for fix-forwards attributable to a **hook failure** (typecheck/build/lint that should have been caught earlier). I found essentially **one** clear case:
- `68638348 fix: use typography.sizes.base (md doesn't exist)` — a fix-forward for the prior commit `6ae50a3d`. A non-existent token key reached the committed code. (Medium confidence hypothesis: `tsc --noEmit` didn't catch it because `typography.sizes` is accessed in a way that typechecks against an index signature — UNVERIFIED, I did not read `design-tokens.ts` this session.)

Every other `fix(` commit I read (`cc9d23ba` tier dropdown response shape, `d38e940f` vendor-docs crash, `0dae0243` queueMicrotask, the X2/X3 security fixes) is **normal product iteration or runtime-behavior bugs found through manual/staging testing** — not hook failures. The hooks are passing cleanly and silently, which means they are working, not generating fix-forward churn.

**The conclusion that matters:** the per-commit feedback loop is **not** dominated by the hooks. It is dominated by the human **staging round-trip**: commit → push staging → wait for Vercel build → manually test → find issue → fix → repeat. That loop is where 30-min tasks become 2-hr tasks, and the hooks are a rounding error against it.

**What I recommend:**
1. Keep all gates. pre-commit at ~25s and infrequent pushes are high-value, low-friction. There is no friction-without-value gate here.
2. Reduce the *number* of round-trips, not the hook cost: batch related changes into one commit/push (already a stated preference in `consistent_brevity` memory) so a feature costs one ~25s pre-commit + one ~3-min pre-push instead of 5 of each.
3. The one real gate gap (token key slipping past tsc) is minor; worth a 5-min check of the `design-tokens` typing if it recurs, not a process change.

**Estimated impact:** Process change is small (the hooks aren't the problem). The leverage is on round-trip count — see Target 5 (scope) and Target 7 (migrations), which is where the human-turn time actually goes.

### Target 4 — Recent error rate

**What I found:**

Session 88's six errors, classified (from `current_task.md:64,68` and the diagnostic prompt):

| Error | Caught by | Category |
|---|---|---|
| `typography.sizes.md` doesn't exist | pre-push `npm run build` (late, but caught) | rule-coverage gap (tsc missed it) |
| mig 154 missing SCHEMA_SNAPSHOT entry | pre-commit migration gate (caught) | bookkeeping completeness |
| mig 152 missed `validate_cart_item_schedule` | **nothing** — found next session | **enumeration / completeness** |
| PERF-R8 doc gap on mig 154 | self-noticed | bookkeeping completeness |
| fix-forward landed on wrong branch (staging not main) | recovered via `merge --ff-only` | **git state drift** |

The important pattern: **most errors were caught or recovered by existing gates.** The build caught the type slip; the pre-commit gate caught the missing snapshot. The two that *weren't* caught are both the same shape — **enumeration/completeness on a multi-item mechanical task** (mig 152 was "REVOKE on all N anon-executable functions" and one of N was dropped) and **git state drift** (the exact failure `explicit_branch_chain` memory + the chain rule were written to prevent, which still happened because a prior chain left the working branch on staging).

Classifying against the prompt's three buckets:
- **Not knowledge gaps** — the model knew the rules (5 rule files guarantee that).
- **Not primarily fatigue** — they cluster at *enumeration* and *state-tracking* points, not late-session sloppiness specifically.
- **Best fit: attention/context dilution + manual enumeration.** When "revoke on every function in this list" or "which branch am I on" competes with ~27k tokens of loaded rules + accumulated session docs for attention, the mechanical item-by-item tracking is what slips. More rules have not reduced these errors; the categories they cause (enumeration, state-drift) are not knowledge problems that another rule fixes.

Compounding clutter: **36 `session*.md` audit/plan docs (13,190 lines) accumulate in `.claude/`** and are never cleaned up (the start-of-session `git status` showed ~50 untracked `.claude/*.md` files). `CLAUDE_CONTEXT.md` is **stale — last updated Session 84** though we are at 88+, despite a CLAUDE.md rule to update it every session. So the canonical "what happened" doc is 4 sessions behind, forcing each session to re-derive state from scattered docs.

**What I recommend (highest-impact prevention):**
1. **Stop enumerating multi-item mechanical lists from memory.** For "apply X to all N functions/tables" tasks, generate the list with a query (`SELECT proname ... WHERE anon-executable`) and operate on the query output. This directly prevents the mig 152 class — the single highest-frequency uncaught error.
2. **Reduce context load (Targets 1+2)** to lower attention dilution on the state-tracking errors.
3. **Keep CLAUDE_CONTEXT.md current** (it's the antidote to re-auditing) and **archive old session*.md docs** to `.claude/archive/` — they are noise in the active workspace.

**Estimated impact:** Query-driven enumeration eliminates an entire recurring error class (would have caught the mig 152 miss). Context reduction + a current CLAUDE_CONTEXT.md reduces per-session re-orientation time, which is a hidden multiplier on every task.

### Target 5 — Scope creep per session

**What I found:**

I have verifiable stated-goal-vs-shipped data for Sessions 83, 84, 88 (from `CLAUDE_CONTEXT.md:7-24` and `current_task.md`); for 80-82, 85-87 I have only git-log commit clustering, because **CLAUDE_CONTEXT.md's session history stops at Session 84** (it never got the 85-88 entries the per-session rule requires). I will not fabricate goals for sessions I can't verify.

What the verifiable sessions show — consistent expansion from a narrow stated goal into 6-8 deliverables:

| Session | Stated/implied goal | Actually shipped | Deliverables |
|---|---|---|---|
| 83 | "Phase C" (booth rentals) | Phase C complete + **new rule (Schema Intent Gate)** + 6 locked decisions + editable schedule | ~5 |
| 84 | "v1 feature-complete" | Phase E surveys end-to-end + booth uniqueness + booth tier + occupancy grid + intake polish + polish bundle + test-data cleanup + **3 new memory files** | ~8 |
| 88 | "close-out + Phase 1A" | testing protocol doc + prod-readiness audit + 20 KB export/lockout plan + micro-market concept doc + Phase 1A code + mig 154 + diagnostic prompt | ~7 |

The pattern is clear and **self-reinforcing**: sessions routinely triple or quadruple their stated scope, and a large share of the additions are **permanent context taxes** — Session 83 added a rule file (loaded every turn forever after), Session 84 added 3 memory files, Session 88 added two planning docs + a concept doc. So this session's "while I'm here" work becomes next session's per-turn load (the Targets 1+2 bloat is *built by* the Target 5 scope creep). A "close-out" session (88) produced a 20 KB design doc and a brand-new concept — neither was the stated goal.

The market-manager feature itself has sprawled across ~Sessions 82-88 as Phases B/C/D/E + 1A/1B, continuously absorbing new scope (surveys, booth rentals, intake, lockout, export). Small commits are good; the open-ended feature scope is what stretches sessions.

**What I recommend:**
1. **Bound each session to its stated goal; "out of scope → backlog" should be the default answer**, not the exception. The memory `feedback_dont_ask_obvious` and the kickoff protocol already exist — enforce the scope-agreement step at kickoff.
2. **Treat new rules / new memory files / new concept docs as their own decision**, never a mid-build "while I'm here." Each one is permanent per-turn weight; creating one should require the same deliberation as a schema change.
3. **Keep CLAUDE_CONTEXT.md's session table current** so scope can actually be tracked session-over-session (it can't right now).

**Estimated impact:** Bounding scope is the highest-leverage *throughput* fix — it directly shortens sessions and, by suppressing reflexive rule/memory/doc creation, stops the per-turn context tax from compounding (which is what slowed things in the first place).

### Target 6 — Tool-call efficiency

**What I found:**

**Honest limitation first:** serial-vs-parallel tool patterns and agent-spawn decisions live in conversation transcripts, which are not in the repo artifacts I can read this session. I will not reconstruct past tool-call cadence from memory or infer it — that would be exactly the unverified-claim failure the rules warn against. So I can't quantify "how often calls were serial when parallel would work."

What I *can* observe from artifacts:

1. **The permission allowlist is badly bloated.** `apps/web/.claude/settings.local.json` has **251 allow entries**, and the majority are **one-off hyper-specific commands** — full multi-line commit messages (e.g. lines 66-93), exact file-path lists for single `git add`s (line 65), specific commit SHA loops (line 61), one-time `mv` commands (lines 216-219). These can never match a future command, so they provide no future value but every new command still triggers a permission prompt. That is real per-session friction (a prompt-and-wait on most Bash calls).
   - Side note, out of scope but worth flagging: lines 48 and 130 embed **live `SUPABASE_SERVICE_ROLE_KEY` values**. The file is gitignored (`current_task.md:41`) so not committed, but secrets in a settings file is a risk worth a separate look.

2. **The verification rules mandate some serialization** (e.g., Schema Mechanical Gate requires a snapshot read *immediately before* SQL). That serialization is correct and should stay — it's a safety gate, not waste.

**What I recommend:**
1. **Run the `fewer-permission-prompts` skill** (it's available) to replace the 251-entry one-off list with a small prioritized set of broad glob patterns (e.g. `Bash(git diff:*)`, `Bash(npx vitest:*)` — many of which already exist and make the one-offs redundant). Fewer prompts = less stop-and-wait friction every session.
2. **Default behavior to adopt explicitly** (principled, not from measured history): batch independent read-only calls (Read/Grep/Glob/read-only git) into one message so they run in parallel; prefer targeted `Grep`/`Glob` with `path`/`glob`/`type` filters over broad `find`; reserve subagents for genuine multi-file fan-out where only the conclusion is needed, not for single-file lookups the main thread can do in one Read.
3. If quantifying tool efficiency matters, capture it going forward (note parallel-vs-serial in `current_task.md`) rather than trying to reconstruct it.

**Estimated impact:** The allowlist cleanup is concrete and immediate — fewer permission interrupts per session. The parallel-read default is a steady per-turn latency win but unmeasured here; I'm flagging it as a practice, not a quantified saving.

### Target 7 — Migration application overhead

**What I found:**

The prescribed flow (`docs/migration-workflow.md:24-53`) is a **two-pass, all-3-env ceremony** for *every* migration regardless of risk:
- Pass 1 (Dev+Staging confirmed): update SCHEMA_SNAPSHOT (changelog + functions + structured tables) + update MIGRATION_LOG row + commit — **but do not move the file**.
- Pass 2 (Prod confirmed): move file to `applied/` + update MIGRATION_LOG + update SCHEMA_SNAPSHOT changelog + commit.

Human turns per migration (estimated from the workflow structure — exact transcript counts aren't in the artifacts): the user manually runs the SQL in **3 separate Supabase environments** and gives **≥2 confirmation turns** ("applied to dev+staging", "applied to prod"), spanning **2 sessions** in practice (Prod often lags — e.g. `current_task.md:33-36`, Phase 1A's mig 154 is intentionally held on Dev+Staging while Prod waits for Phase 1B). Sessions 85-88 applied migs 148-152 + 154; the git log shows the bookkeeping is **sometimes well-batched** (`5f4f9dd1`: "13 migs to applied/" in one commit — good) and sometimes per-migration (`fddbc75b`, `36031815`, `8caf174c` are individual mig bookkeeping commits).

Which verification is real vs ceremonial:
- **Real:** the post-apply existence query (`current_task.md:91-101` checks the table/column actually exists per env) — this catches the genuine "user forgot to run it on staging / Prod silently behind" drift the workflow doc itself cites (Session 71 incident, `migration-workflow.md:53`). Keep for anything non-trivial.
- **Ceremonial for additive-only migs:** running the full per-env verification + two-pass bookkeeping for a pure `ADD COLUMN ... NULL`/`CREATE TABLE`/additive-index/`REVOKE` (like mig 154's additive table+column with idempotent backfill) is heavier than the risk warrants. Such migrations cannot break existing reads.

**What I recommend:**
1. **Add a "low-risk additive" fast path.** Define it narrowly: only `ADD COLUMN` (NULL or safe DEFAULT), `CREATE TABLE`, additive `CREATE INDEX [CONCURRENTLY]`, and `REVOKE`. For these: apply to all 3 envs in the same coordinated push, do a **single** bookkeeping commit (skip the dev+staging-then-prod two-pass), and keep one existence-check query. Everything destructive or behavioral (`DROP`, `ALTER TYPE`, trigger/function rewrites, RLS policy changes) keeps the full staging-first two-pass ceremony unchanged.
2. **Always batch bookkeeping** — the "13 migs in one commit" pattern should be the norm, not per-mig commits.
3. Keep the all-3-env move trigger for `applied/` (it prevents the real Session 71 drift) — the fast path changes *pace*, not the safety invariant.

**Estimated impact:** For the common additive migration, collapses ~2 sessions / ~2 confirmation turns / 2 commits into 1 coordinated push + 1 commit. The risky migrations — where the ceremony earns its cost — are untouched.

### Target 8 — Rule 7 (teaching mode) overhead

**What I found:**

Rule 7 of `git-and-deployment.md` ("Explain Git Operations to User") is **~110 lines** — the single largest section in the largest (313-line) rule file. It requires a one-paragraph explanation (type / which hooks fire / which rules apply / risk / what to watch) before *every* commit, amend, rebase, and push, and it carries **5 verbose worked examples** (plain commit, staging push, prod push, amend, rebase).

The rule's own text states its purpose: it was added Session 80 (2026-05-10) "because the mechanical hooks introduce behaviors the user is still learning… Tracy explicitly requested this explainer mode to internalize the new commit/push mechanics."

Two facts that bear on it:
1. **It is purely pedagogical, not protective.** Every safety behavior it explains is already enforced mechanically — I verified the push-window check (`.husky/pre-push:46-91`), the amend-of-pushed-commit heuristic (`.husky/pre-commit:42-83`), plus `prepare-commit-msg` and `pre-rebase` exist. Removing Rule 7 removes *explanation*, not *safety*.
2. **~3-4 weeks have passed** (2026-05-10 → 2026-06-03) across many commits/pushes. Whether the mechanics are now internalized is **Tracy's call** — the rule itself defines the disable phrases ("stop explaining git operations" / "disable teaching mode" / "remove rule 7"). The prompt forbids me asking implementation questions, so I report the option rather than ask.

I cannot measure "load-bearing vs noise" from transcripts. But since the hooks are the safety net and the rule is self-described as a temporary learning aid, it is a strong cut candidate on a chars-per-value basis.

**What I recommend (Tracy decides):**
- **Preferred:** slim it to a 4-line reminder ("before any git op, state: type · hooks that fire · risk · what to watch") and delete the 5 worked examples (~90 lines / ~3.5k chars saved from the every-turn load).
- **Or** disable entirely if Tracy has internalized the mechanics — the hooks keep enforcing correctness regardless.
- **Keep as-is** only if Tracy still actively reads the explanations to learn.

**Estimated impact:** Slim or disable saves ~3.5-4k chars (~1k tokens) from the per-turn load and removes a pre-action paragraph before every git operation. No safety loss — the hooks are unaffected.

---

## Cross-cutting themes

1. **The dominant cost is per-turn context load, not the gates.** ~27k tokens of rules + 2 CLAUDE.md files + memory index load on *every* turn (verified — they were all in this session's opening system-reminder). That is latency + money on every turn, and it dilutes attention.
2. **Triple coverage.** The same lesson lives in a rule file *and* a `feedback_*.md` *and* a `MEMORY.md` line. The ABSOLUTE rules are even printed verbatim twice (CLAUDE.md + rule file). Codification didn't replace the memory — it stacked on top of it.
3. **The slowness is self-inflicted by scope creep.** Sessions that add new rules / memories / docs "while I'm here" (Target 5) are the mechanism that built the Target 1+2 bloat. It compounds: this session's governance addition taxes every future turn.
4. **Errors are attention/enumeration slips, not knowledge gaps.** More rules don't fix "dropped one of N functions" or "wrong branch" — they make them likelier by competing for attention. The fixes are mechanical (query the list) and lighter context, not another rule.
5. **The real human time sinks are round-trips:** staging test cycles and the two-pass, all-3-env migration ceremony. The hooks are a rounding error against those.
6. **Doc hygiene has decayed:** CLAUDE_CONTEXT.md is 4 sessions stale, 36 `session*.md` audit docs + ~50 untracked `.claude/*.md` files clutter the workspace, forcing re-orientation each session.

## Recommended action list (ranked by impact / effort)

1. **De-duplicate governance content** — collapse the verbatim ABSOLUTE rules in CLAUDE.md to summary+pointer, merge change-discipline R1/R2, slim/disable Rule 7. (~27k → ~17-19k tokens/turn.) *High impact, low effort.* [T1, T8]
2. **Bound session scope; gate new rules/memories/docs as deliberate decisions.** Stops the bloat from re-accumulating. *Highest throughput impact, low effort (behavioral).* [T5]
3. **Archive ~25 now-codified feedback memories; rewrite MEMORY.md to one true line each.** (Index ~4k → ~1.5k tokens/turn.) *High impact, low-med effort.* [T2]
4. **Query-driven enumeration for multi-item mechanical tasks** (revoke/alter "all N"). Eliminates the highest-frequency uncaught error class. *Medium impact, low effort.* [T4]
5. **Run `fewer-permission-prompts` skill; prune the 251-entry allowlist** to broad patterns. *Medium impact, low effort.* [T6]
6. **Low-risk-additive migration fast path** (ADD COLUMN/CREATE TABLE/index/REVOKE → single coordinated push + single bookkeeping commit). *Medium impact, low-med effort.* [T7]
7. **Bring CLAUDE_CONTEXT.md current; archive old `session*.md` docs** to `.claude/archive/`. *Medium impact, low effort.* [T4, T5]

## What I deliberately did NOT change

(Constraint: this session recommends only — it executes nothing. Listed here are things I considered recommending against but concluded should stay.)

- **The husky hooks** — pre-commit (~25s, measured) and pre-push catch real issues with low friction; not the slowness. Keep all four.
- **The substance of the 3 ABSOLUTE rules** — I recommend ending their *double-loading*, never weakening them.
- **Staging-first + production push window + one-push-at-a-time** — safety invariants tied to real financial risk; untouched.
- **The all-3-env trigger for moving migrations to `applied/`** — prevents the real Session 71 prod-drift; the fast path changes pace, not this invariant.
- **The Schema Mechanical / Intent gates and cite-or-verify discipline** — these prevent money-affecting bugs; they stay even though they serialize some work.
- **I did not delete, archive, edit, or move any file** beyond writing this findings doc — per the session constraints.
