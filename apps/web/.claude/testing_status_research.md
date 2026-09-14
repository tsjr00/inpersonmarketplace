# Testing-status research — events + market bundles (started 2026-09-14, session 2 continuation)

**Question (owner):** which event / market-bundle items that need testing have NO confirmed result?
**Tracking mechanism found:** `current_task.md` session blocks carry "STAGING TEST PROTOCOL" lists with IDs
(ST-n 2026-08-16 · workflow tags 2026-08-28 · A/E/P series 2026-09-03→06) plus "OWNER TESTING OWED /
NEXT SESSION PICKS UP" lists; results come back as owner replies and get triaged in the next block. Plan docs
(`market_bundles_build_plan.md`, `event_ux_findings_2026-09-03_plan.md`) hold the build record + intended tests.
The owner's pasted A–E list (chat, ~2026-09-07/08) was generated from these; it is not saved anywhere in the repo.

## Checklist (write findings under each as read — recovery points)
- [ ] S1 current_task 539-585 — 2026-09-07 close + 2026-09-06 wrap (bundles arc; "NEXT SESSION PICKS UP")
- [ ] S2 current_task 586-828 — 2026-09-05 block: staging results triage, test round 3, E1/E2, E4/E5, notif fix, STAGING TEST PROTOCOL 09-05
- [ ] S3 market_bundles_build_plan.md — test section / E-series definitions
- [ ] S4 current_task 913-936 — 2026-09-03 wrap: OWNER RETEST (P1-P6 events UX)
- [ ] S5 current_task 937-957 — 2026-08-31 event-testing triage
- [ ] S6 backlog "OUTSTANDING STAGING TESTS — 2026-08-15" (5 event items) + "STAGING RESULTS 2026-09-05"
- [ ] S7 current_task 3490-3591 — ST-1…ST-26 protocol (08-16) + workflow edition (08-28): event items only
- [ ] S8 current_task ~1829 — EVENTS MODULE tester findings 2026-08-06
- [ ] S9 owner's pasted A–E list → map each item to a source + status
- [ ] S10 consolidate → deliverable table

## Findings

### S1 — 2026-09-07 close (current_task 539-563) + 2026-09-06 wrap (564-585) ✅ read
- **The numbered 1–17 list existed by 2026-09-07** (in chat). 09-07 close says: "AWAITING RETEST of that round
  [= apply-button managed-only, mig-247 FM trigger, booking-days line, VIP by-design] + outstanding items 2-10 &
  14-16 (fresh-order bundle notifications, cancel-bundle fee paths, E6/A9 via curl, browse pill, cancel-date card,
  survey email link, insights, day-of copy, week-strip hold, admin blocking flag) + §11.14 + A6-A8 when testable."
  → So on 09-07 the ONLY confirmed items were 1 (bundle money loop) and whatever "that round" retest covered.
- **Bundle money loop VERIFIED IN STRIPE end-to-end 2026-09-07** (margin $9.00, cause $1.00, booth $24.31×2,
  reconciled to formulas) — closes the 09-06 "LAST untested money move" (FA-2026-48926539 handoff → buyer ack →
  margin pays). Owner-confirmed per the close block (not a Claude assertion).
- 09-06 "NEXT SESSION PICKS UP" test tail: fresh-order notification sequence · E6 via curl · bundle_ready email
  copy re-check — all three still listed as outstanding on 09-07 → **not confirmed as of 09-07**.
- Tonight (09-13) the owner confirmed: 12, 13 (+layout ask), 14, 17 PASS; 11 ran → surfaced the FM double-book
  ruling. **Still no recorded result for 2–10, 15, 16** unless a later block (09-08/09-10) has one → check S2+.

### S2a — 2026-09-05 STAGING TEST PROTOCOL (current_task 865-884) + RESULTS TRIAGE (603-668) ✅ read
Protocol IDs: A1–A9 VIP loop · B1–B3 week strip · **C1–C4 events board** (/food_trucks/admin/events) · **D1–D2 event
gate fixes** (invitations-held state). Results that came back (triage block):
- A1b/A4 FAIL → fix D1 (favorites VIP gap) · A2 FAIL → fix D2 (perk save) · B3 FAIL → fix D3 (cancel-date silent
  for roster vendors) · survey-email 404 → fix D4 (getAppUrl) · B1 explained (standing hold >7d = backlog, later
  built as week-strip v2.2) · A5 "closed listings" CLOSED (day-of-only by design → day-of copy built).
  Fixes shipped `3954f307` 2026-09-05. **Retests of D1–D4 were owed** → they reappear in the owner's list as
  items 8 (cancel-date card = D3), 10 (survey email = D4); VIP retests A1–A8 out of scope here.
- **C1–C4 (events board) and D1–D2 (invitations-held gate): NO owner result recorded in this block.** → check
  later blocks; tonight's item 17 (admin event-blocking section) is the 09-05 polish item 4, not C1–C4.
- ⚠ OPEN QUESTION recorded 09-05 then CLOSED same block: "vendor accepted an event but NO blackout row" → both
  acceptances predated mig 238 on staging (same gap now recorded on Prod for the owner's two test vendors).

### S2b — 2026-09-05 TEST ROUND 3 + 09-06 bundle batches (current_task 686-828) ✅ read
- **Round-3 results (owner, 09-05): F1 ✅ · F2 ✅ · C1–C4 ✅ (events board PASSED) · B2 covered · A6–A9 untestable.**
  F3 (cancel-date card) → 3 findings → fixes built (F3a/F3b) + mig 245 (browse pill) → **retests owed = owner's
  items 8 and 9**. F4 (survey email) fix built 09-05 → **retest owed = item 10** (+ Vercel env scoping, owner side).
  **F5 (reverse event guard blocks truck3 booking): no result recorded in this block.** D1–D2 (invitations-held
  gate): no result recorded here either.
- **Bundles:** E3 admin approve loop PASSED (owner 09-06). E1/E2 (two-part confirmation, mig 246) BUILT 09-06; E4/E5
  + cancel-bundle BUILT 09-06; notification-sequence fix BUILT 09-06. Order FA-2026-48926539 SQL ground truth 09-06
  → machine worked (~95%); money loop verified in Stripe 09-07 (S1). **What the 09-06/07 builds left UNTESTED = the
  owner's A1–A5:** fresh-order notification sequence (post-fix), cancel-bundle both fee paths (never-run refund
  money), success-screen pickup spot (E4 built; blank once), bundle_ready email copy, manager-first handoff edge.
- TEST PROTOCOL v2 (chat, 09-05) defined: E-series full bundles loop · F1–F5 · A5–A9 · B1–B2 · C1–C4 · D1–D2.

### S3 — market_bundles_build_plan.md ✅ scanned: its §7 "Tests" = unit specs (spec-first), not owner tests. Owner-facing
E-series lives only in the chat protocol v2 (09-05) + current_task build blocks. No owner-verified marks in the build log
beyond "244 applied" and "checkout diff approved".

### S4 — 2026-09-03 wrap (current_task 913-936) ✅ read
OWNER RETEST issued 09-03 (staging `8df93d4b`): (1) **P1 pare loop** · (2) **week strip** (committed days, booked tag,
selected event; struck lines need fixtures) · (3) **stage surfaces** (pills accepted≠Attending · organizer roster badges ·
admin chips · "Vendors who said yes" · dashboard card). On 09-05 these were STILL listed as owed ("standing 2026-09-03
batch retests (P1 pare loop, week strip, stage surfaces)", current_task ~886). Later results: C1–C4 ✅ 09-05 covers the
admin events BOARD, not P1/stage surfaces. → **P1 pare loop + stage surfaces (P2–P5): no confirmed result found so far.**
Event-gate fixes A+B (= 09-05 protocol D1–D2) "awaiting go since 08-31" on 09-03 → built by 09-05 → **D1–D2 no result.**

### S5 — 2026-08-31 triage (937-957) ✅ read: event fixes A+B proposed (became 09-05 D1–D2); vendor-docs crash awaits
evidence; "Money tests remaining: Events A & B consolidated plan (chat 2026-08-31)".
### S6 — backlog OUTSTANDING STAGING TESTS 2026-08-15 ✅ read: items 1–4 (Not-eligible badge · reuse-button styling ·
capacity copy · below-claim note) have NO result recorded; item 5 fee-language marked ✅ PASS 08-15. Owner said "when I
create a new vendor" — item 1 needs a fresh unapproved vendor.
### S7 — Protocol v6 (2026-08-28 workflow edition, current_task 3571; status at 08-30b wrap 3710) ✅ read:
STILL OPEN at 08-30: **D deselect/refund money · C cancellation money · E reconfirm+prep** (events money) · G7 · B buyer
items + buyer weekly survey · O onboarding copy · L manager new-email invite+resend · F FM mirror · M2 print chrome.
On 09-05 "Protocol v6 C/D/E money tests" still in the standing queue → no later result found.
### S8 — 08-06 tester findings: superseded by 08-13 "10 findings fixed and OWNER-VERIFIED" block (line 1300) — not
re-read; nothing in later blocks reopens them. (Presence-level only.)

## S9/S10 — CONSOLIDATED: events + bundles tests with NO RECORDED RESULT (as of 2026-09-14)
⚠ "No recorded result" = not found in current_task.md / backlog.md / plan docs. A result given in chat and never written
down would look identical. Owner to confirm.

| # | Test (owner's numbering where it exists) | Area | Source | Status |
|---|---|---|---|---|
| A1 | Fresh-order notification sequence (post-storm-fix) | bundles | 09-06 notif fix batch; 09-06 wrap item 1 | open |
| A2 | Cancel bundle — (a) grace full refund (b) 25% fee path + tip full + dialog wording | bundles $ | 09-06 E4/E5 batch (route never run by owner) | open |
| A3 | Success-screen pickup spot | bundles | 09-06 E4 (blank once) | open |
| A4 | bundle_ready email copy re-read | bundles | 09-06 wrap item 1 | open |
| A5 | Manager-first handoff (margin HOLDS until buyer ack) | bundles $ | 09-06 E1/E2 edge branch | open (optional) |
| B6 | E6 bundle-sold sweep via curl ×2 → one manager notice, no dupe | bundles cron | 09-06 wrap; crons never run on previews | open |
| C8 | Cancel-date result card (F3a/F3b) | events/parks | 09-05 round-3 fixes | open (retest) |
| C9 | Browse "Closed" pill for event-selected listing (mig 245) | events | 09-05 round-3 fix | open (retest) |
| C10 | Survey email links to staging (D4) + Vercel env scoping (owner) | events/surveys | 09-05 fix D4 | open (retest) |
| E15 | Day-of buyer copy | FT listings | 09-05 polish item 2 | open |
| E16 | Week-strip standing hold (v2.2) | FT parks | 09-05 polish item 3 | open |
| P1 | Host menu pare-down loop (select → pare → shop/public/vendor page) | events | 09-03 OWNER RETEST 1 | open |
| P2–P5 | Stage surfaces: pills accepted≠Attending · organizer roster badges · admin chips · "Vendors who said yes" · dashboard card | events | 09-03 OWNER RETEST 3 | open |
| D1–D2 | Invitations-held gate: "Open Pre-Orders — invitations held" disabled+tooltip; forced-ready copy | events | 09-05 protocol D | open |
| F5 | Reverse event-conflict guard blocks truck3 booking (409 withdraw-first) | events/parks | 09-05 protocol v2 F5 | open |
| v6-C | Event cancellation money | events $ | Protocol v6 (08-28) | open since 08-30 |
| v6-D | Event deselect/refund money | events $ | Protocol v6 | open since 08-30 |
| v6-E | Event reconfirm + prep | events | Protocol v6 | open since 08-30 |
| v6-B/O/L/F/M2/G7 | buyer items + weekly survey · onboarding copy · manager new-email invite+resend · FM mirror · print chrome · G7 | events/mgr | Protocol v6 | open since 08-30 |
| 08-15 #1–4 | Not-eligible badge (needs fresh unapproved vendor) · reuse-button styling · capacity copy · below-claim note | events | backlog 08-15 | open |
| 08-31 #3 | ParkMGR vendor-docs crash — evidence (Vercel log line / 3 SQLs) | mgr | 08-31 triage | open (evidence) |

**Confirmed (for contrast):** bundle money loop in Stripe (09-07) · E3 admin approve loop (09-06) · C1–C4 events board (09-05) ·
F1/F2 VIP fixes (09-05) · 09-07 round items 12/13/14/17 (09-13) · 11 ran → ruling · 08-15 #5 fee language · 08-13 ten event findings.
