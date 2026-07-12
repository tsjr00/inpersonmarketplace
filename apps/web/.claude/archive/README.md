# `.claude/` Archive — backward-looking history

This folder is the **historical library** of completed audits, reviews, session
recaps, and legacy build instructions — the working-doc equivalent of
`supabase/migrations/applied/`. Nothing here is loaded by the rules or read for
functionality; it exists to **find and learn from past work**.

Organized by **type**. Filenames and their `path:line`/date references are
preserved as-written; treat each file as a point-in-time snapshot, not current
state. For what's true *now*, see the live docs in `.claude/` root
(`current_task.md`, `backlog.md`, `decisions.md`, `CLAUDE_CONTEXT.md`,
`SCHEMA_SNAPSHOT.md`) and the `rules/` folder.

## Folders

| Folder | What's in it | Count |
|--------|--------------|-------|
| `audits/` | Audits, code reviews, findings, diagnostics, error/perf/security sweeps, investigations (incl. all `sessionNN_*audit*` files) | 47 |
| `session-summaries/` | Per-session recaps (Jan 2026 genesis → recent); the earliest is the FastWrks BuildApp Phase-0 review that became this app | 35 |
| `legacy-cc-instructions/` | The pre-direct-pairing "Claude-chat → CC" build instructions (Jan 2026 phase builds, DB reconciliation, deployment, RLS fixes) | 43 |
| `feature-plans/` | Build/design/implementation plans for **shipped** features | 29 |
| `research/` | Exploration/research that fed **shipped** work | 4 |

## Cleanup status

- **Sweep 1 (done):** `audits/`, `session-summaries/`, `legacy-cc-instructions/` centralized here from `.claude/` root, `Session_Summaries/`, and `Build_Instructions/`.
- **Sweep 2 (done):** shipped `feature-plans/` + `research/` centralized here; future plans/research kept in `.claude/` root. Deleted one 0-byte junk file (`_mwl_diff.txt`).
- **Sweep 3 — dedup (done, 2026-07-12):** content-comparison pass over the audit + event-plan clusters. Removed **5 files** — 4 fully-superseded working-file→final-report pairs (`session36_audit_findings`, `session55_audit_research`, `session62_audit_research`, `session83_mm_audit`) and `market_box_audit.md` v1 (superseded by `_v2`; its one open item, the biweekly `original_end_date` term-length decision, was lifted to `backlog.md`). Everything else was verified as a distinct audit/plan with unique content and kept — the archive is a genuine timeline, not a duplicate pile.
- **Deliberately NOT archived (still live in `.claude/` root):** business-rules docs, future concepts/plans, wave-ordering how-to, catering plan (events reference), timezone-drift plan (until prod push), and all living/gateway docs the rules reference.
