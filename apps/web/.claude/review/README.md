# Review Kit — read this first (for end-to-end review / audit runs)

Purpose: make each review pass **cheap and high-signal**. These four docs pre-load
what an auditor would otherwise burn thousands of tokens rediscovering, and pre-empt
the re-reporting of things already known or intentional.

**Read order for any review agent:**
1. `SYSTEM_MAP.md` — what exists (routes, crons, webhooks, lib subsystems, money paths). Skips discovery.
2. `KNOWN_AND_OUT_OF_SCOPE.md` — what NOT to report (decided, intentional, inactive, already-in-backlog). Skips noise.
3. `FINDINGS_CONTRACT.md` — how to report (severity, required fields, dedupe key, one ledger). Skips waffle.
4. `COST_EFFICIENCY_ANCHORS.md` — where the API-call / token / query cost actually lives. Aims the efficiency pass.

**Operating rules for review agents (token discipline):**
- **Report only — do NOT fix.** Edit loops are expensive; the user triages, then a separate targeted fix pass runs. (Also: critical-path/protected files can't be edited without per-file approval anyway.)
- **One slice per pass.** Don't review the whole app in one context. Pick a slice from `SYSTEM_MAP.md`, read only its files.
- **Cite or retract.** Every claim about code behavior needs a `path:line`, or the word UNVERIFIED. No memory-based findings.
- **Verify cheaply.** Confirm with `npx tsc --noEmit`, `npx vitest run`, and grep before asserting — don't reason in circles.
- **Parallel agents get disjoint file sets.** If fanning out, partition by slice so two agents never read the same file.

Source of truth these docs sit on top of (do not duplicate — link):
`CLAUDE_CONTEXT.md` (architecture/history), `supabase/SCHEMA_SNAPSHOT.md` (schema),
`.claude/PERFORMANCE_BASELINE.md` (perf metrics), `.claude/decisions.md` (locked decisions),
`.claude/backlog.md` (open work), `.claude/rules/` (the always-loaded gates).

## Provenance (how much to trust each claim)
- **Code-verified 2026-07-12 (treat as fact):** the structural inventories — route counts/areas, crons, webhooks, lib subsystems, external-call site lists, the geocode/moderation/surveys-cron cost facts, Next.js version, `EXTERNAL_PAYMENTS_ENABLED`. These were read directly this session and carry `path:line` where it matters.
- **Sourced from the project's own source-of-truth docs (`decisions.md`, `PERFORMANCE_BASELINE.md`, `backlog.md`, `rules/`) — treat as a strong lead, verify at point of use:** the money model/fees, ISR config, critical-path list, and every item in `KNOWN_AND_OUT_OF_SCOPE.md`.
- **A few lines are long-standing project convention (e.g. `sendNotification` never throws / must be awaited; payments use the service client; `zip_codes` is empty) — not independently re-read this session.** Verify before relying on one for a finding.
- The `cite-or-retract` rule above is what makes this safe: nothing here gets filed as a finding without the reviewer re-confirming it against the live code.

Generated 2026-07-12 for the pre-re-release review series (new model). Regenerate the
inventories if the route/cron/external-call surface changes materially.
