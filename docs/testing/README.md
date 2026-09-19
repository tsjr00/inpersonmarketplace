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
| `TEST_PROTOCOL_open_items.md` | Claude, in the SAME push as every shipped fix | **The owner's working list** — the registry's open rows rendered as runnable blocks, grouped by workflow (colored dots), with a "★ WHAT'S NEW" section at the top listing the retests shipped since the owner's last results (date + staging build). A fix is not "ready for retest" until its block is here. Owner 2026-09-19. |

## The loop (every session that has new reports)

1. Owner pastes new reports (free or structured text) → Claude appends them to `OBSERVATIONS.md` as `OB-nnn`, verbatim.
2. Claude triages each observation → maps it to a `TR-nnn` row (existing row: record pass/fail + evidence; no row:
   create one) and proposes a ruling.
3. Owner rules: **fix now · backlog · by-design · duplicate · needs more info.** Claude writes the ruling on the
   triage line and updates the registry status.
4. Fixes ship through the normal staging-first process; the registry row moves to `fixed-unverified` until a tester
   or the owner re-runs it, then `pass`. **In the same push**, the fix's block goes into `TEST_PROTOCOL_open_items.md`
   under its workflow group AND into the "★ WHAT'S NEW" section (with the staging build id). When the owner reports
   results, the answered blocks leave both places; when WHAT'S NEW is empty, the owner runs the regular groups.
5. In chat, name a test by WHAT it checks with the TR id as a tag — never a bare range of ids (owner 2026-09-19).

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
