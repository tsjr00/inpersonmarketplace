# Testing — how results are recorded in this project

**Purpose.** One place where testing progress and results accumulate across testers and sessions, so an informal
report ("I tried to buy a market box and the page said Unknown item") gets matched to the open item it actually
tested — even when the tester didn't know it was open. The owner arbitrates every change; testers supply coverage.

**Method.** Lightweight session-based exploratory testing: a tester picks a **charter** (a short mission with a time
box), uses the app as a real person would, and sends a **four-line report** in their own words. All structure lives
on the project side. Testers never assign severity or decide whether something is a bug.

## The three files

| File | Who writes it | What it is |
|---|---|---|
| `CHARTERS.md` | project (owner sets priorities) | Tester-facing missions by role + the report format. Share this. |
| `OBSERVATIONS.md` | Claude transcribes what the owner pastes | Append-only intake log, one entry per report, tester's words verbatim, never edited after entry. A triage line beneath each entry records the registry match and the owner's ruling. |
| `TEST_REGISTRY.md` | Claude, at triage and at every session close | The source of truth: one row per test item with a stable ID, how to run it, status, last result, linked observations. |
| `TEST_PROTOCOL_open_items.md` | Claude, in the SAME push as every shipped fix | **The owner's working list** — the registry's open rows rendered as **WORKFLOWS** (W1, W2, …): one role's real sequence, numbered steps, one Expect line per step, the TR-ids a step satisfies as small tags the owner ignores. The owner reports per workflow — "W2 pass" · "W2 step 6: <what I saw>" · "W2 step 6 skipped: <why>" — and Claude maps that onto the registry (steps before a failure passed; the failing step's tags are the candidates; skipped = untested). A fix is not "ready for retest" until its step is here; a new fix goes into the workflow where it naturally falls, and a "★ WHAT'S NEW" line at the top names the workflow(s) to run first. Owner 2026-09-19 (list) · 2026-09-21 (workflows: "I am not a machine… design a workflow test that covers multiple items at once"). |

## The loop (every session that has new reports)

1. Owner pastes new reports (free or structured text) → Claude appends them to `OBSERVATIONS.md` as `OB-nnn`, verbatim.
2. Claude triages each observation → maps it to a `TR-nnn` row (existing row: record pass/fail + evidence; no row:
   create one) and proposes a ruling.
3. Owner rules: **fix now · backlog · by-design · duplicate · needs more info.** Claude writes the ruling on the
   triage line and updates the registry status.
4. Fixes ship through the normal staging-first process; the registry row moves to `fixed-unverified` until a tester
   or the owner re-runs it, then `pass`. **In the same push**, the fix becomes a step (or an Expect clause) in the
   workflow where it naturally falls in `TEST_PROTOCOL_open_items.md`, and "★ WHAT'S NEW" names that workflow (with
   the staging build id). When the owner reports a workflow, Claude records every satisfied TR row as `pass` in the
   registry, removes those steps, and re-sequences the workflow if it has become thin.
5. In chat, name a test by WHAT it checks with the TR id as a tag — never a bare range of ids (owner 2026-09-19).
6. Owner's results are per WORKFLOW, not per test: "W2 pass" / "W2 step 6: …" / "W2 step 6 skipped: …". Claude
   never asks the owner to look up a TR id; the mapping is Claude's job (owner 2026-09-21).

## Status vocabulary (registry)

`open` never run or no recorded result · `pass` · `fail` · `fixed-unverified` fix shipped, not re-run ·
`by-design` owner ruled current behaviour correct · `dropped` owner retired the item.

## Rules that keep this honest

- **A result exists only if it is written here.** A pass reported in chat and never transcribed is not a result.
- **Testers' words are never rewritten.** Interpretation goes on the triage line, not in the entry.
- **Steps name the page URL, the visible card/section title, and the widget** (project rule, memory
  `feedback_test_instructions_specificity`).
- **The registry is read at session kickoff and updated at session close** (`PROCESSES_AND_PROTOCOLS.md`
  Protocols 1 and 6).
- The older scripted checklists (`docs/Beta_Testing_Program.md`, `apps/web/docs/staging_test_checklist.md`) remain
  as step libraries; charters link to them when a tester wants exact steps. Their unresulted rows migrate into the
  registry as they get run, not all at once.
