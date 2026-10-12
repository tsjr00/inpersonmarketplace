# Markets, vendors and days — the scenarios and the triggers (planning paper, 2026-10-11)

**Status: PLANNING ONLY. Nothing is being built. Owner 2026-10-11:** "I don't want to make this change yet … a really
thorough design and planning session … cleanest most elegant solution … a process that starts with some qualifier
scenarios and only adds complexity when necessary … as if it had yes/no switches that turn on layers."

What this paper is: an inventory of how users interact with markets today, every automatic reaction ("trigger") that
fires, and the switches that decide which rule applies. Facts marked **[code]** were read this session (file:line in
`approval_days_rule_research.md` and below); facts marked **[doc]** come from `decisions.md` / `booth_model_design.md`
and were not re-read in code today. Where the current behaviour is a known wart, it is marked ⚠.

---
## 1. The one object everything rests on — the DECLARATION

A declaration is a `vendor_market_schedules` row: "vendor V attends market M on operating day D" (`is_active` on/off).
It is the only place the app records *which days a vendor is at a market*. Everything downstream reads it:

| Reader | What it does with the declaration | Source |
|---|---|---|
| Shopper visibility of a market | a traditional market is listed only if some vendor has a published listing AND a declaration there (+ a paid week at a fee market) | `visible-markets.ts:55-84` [code] |
| Shopper pickup dates / cart | a vendor sells on a date only where a declaration covers the weekday (+ paid week at fee FM / paid park) | mig 131/238/255 [doc]; `cart/route.ts:225` [code] |
| Booking gate BR-13 | at a managed market, ≥1 declaration before booking a week/season; the booking page shows the inline day picker when there is none | `booking-gates.ts:84-89`, `book/page.tsx:355-357` [code] |
| Cancel-day credit BR-9 | credit only for declared days | `booth-cancel-credit.ts:48-52` [code] |
| Schedule-conflict rule | a declaration is a COMMITMENT: two overlapping declarations on the same weekday are refused unless the vendor's profile says "I can staff more than one location" | conflict trigger (mig 253/262), `schedules/route.ts:304-361` [code] |
| Manager week strip / stats / weekly survey | who is expected on which day | `manager-week-strip.ts:167`, `manager-dashboard-stats.ts:113`, `surveys/weekly.ts:85` [code] |
| Vendor Markets card | "Set Schedule" is done when any active declaration exists → decides the NEXT button | `api/vendor/markets/route.ts:90,298`, `market-steps.ts` [code] |

Owner 2026-09-19 [doc]: "The declaration system … is NOT changed — those core elements rest on it." This paper keeps that:
the question is only **WHO writes the declaration and WHEN**, never what it means.

⚠ The table has no `source`/`created_by` column — a row written by a trigger, by the vendor, by a listing save, or by a
paid booking all look identical (mig 210 note 4; this is what made mig 211's cleanup destroy vendor data).

---
## 2. The switches (qualifiers) — what decides which rule applies

These are the yes/no facts the app already has. Every scenario below is a path through them.

| # | Switch | Where it lives | Values |
|---|---|---|---|
| S1 | Vertical | `markets.vertical_id` | farmers_market · food_trucks |
| S2 | Market type | `markets.market_type` | traditional · event · private_pickup |
| S3 | Managed in the app? | `markets.manager_user_id IS NOT NULL` (events never) | yes · no ("off-app market") |
| S4 | Charges vendors? | FM: any `market_booth_inventory.weekly_price_cents > 0`; FT: `park_mode = 'paid'` | yes · no |
| S5 | How many operating days? | count of active `market_schedules` rows | 0 · 1 · many |
| S6 | Who started the relationship? | `market_vendors.response_status` / `approved` / `revoked_at` | vendor applied · manager invited · vendor self-scheduled (off-app only) |
| S7 | Roster state | `market_vendors` (mig 217 semantics) | none · pending · approved · revoked · declined |
| S8 | Can the vendor staff two places at once? | `vendor_profiles.profile_data.multiple_trucks` | yes · no |
| S9 | Has the vendor PAID for the period? | `weekly_booth_rentals` (FM) / `park_spot_bookings` (FT) | yes · no |

The design goal the owner stated: **a vendor or manager should never need S1–S9 explained to them.** The app asks only
the next question that matters, in the order the work happens (the Markets card already does this: Apply → Set Schedule
→ Book → Listings → Prep, `market-steps.ts` [code]).

---
## 3. The triggers — every automatic reaction that exists today

"Trigger" here = anything that writes or reads on the user's behalf without them asking. DB triggers and app-side
automations are listed together because the user cannot tell them apart.

| T | Fires when | What it does today | Scope | Source |
|---|---|---|---|---|
| T1 | Manager approves (roster `approved` false→true) | declares EVERY active operating day for the vendor; a day that conflicts elsewhere is skipped (P0020) and reported to manager + vendor | FM only (FT returns early) | mig 002 → 210 → 262 [code] |
| T2 | Roster row INSERTED already approved | same as T1 | FM only; no app path inserts approved=true today | mig 262 §3 [code]; `grep` this session |
| T3 | Manager ADDS or REACTIVATES an operating day | declares the new day for EVERY approved vendor (conflicts skipped) | BOTH verticals (no FT skip) | mig 262 §4 [code] |
| T4 | Manager DEACTIVATES an operating day | cascades `is_active=false` to every declaration on that day (rows kept) | both | decisions 2026-05-19 [doc]; `market-manager/[marketId]/schedules/route.ts:35-47` header [code] |
| T5 | Vendor saves a listing with a market ticked | at an OFF-APP market: declares the market's days for the vendor; at a managed market: nothing (TR-117) | both | `listing-schedule-days.ts` [code, read 2026-10-09] |
| T6 | Food truck PAYS for park days | declares (or re-activates) exactly the booked weekdays | FT paid parks | `stripe/webhooks.ts:1989-2042` [code] |
| T7 | Vendor accepts a manager's INVITATION | flips `approved` → T1 fires (no skipped-day report on this path) | FM (events refused here) | `respond/route.ts:169-186, :100-109` [code] |
| T8 | Any declaration INSERT/UPDATE | conflict rule: refuse if it overlaps another active declaration the same weekday and S8 = no | both | mig 253/262 [code] |
| T9 | Vendor applies / is approved / booth changes / day cancelled | notifications (approval notice carries size, number, note, skipped days) | both | `vendor-approval/route.ts:237-256` [code] |

⚠ T1 and T3 are the two the owner questioned. T6 is the food-truck answer to the same question ("approval is vetting,
not scheduling", mig 210) — and mig 210 note 3 records the gap it left: *an approved truck can stay invisible
indefinitely and nothing asks it to set a schedule.* That gap is exactly what the FM Markets card's NEXT button later
solved for FM ("2 NEXT: Set Schedule"). The two verticals have drifted to opposite answers to the same question.

---
## 4. The scenarios — who does what, and what fires

Each scenario names its switches, then walks the path. "→ T#" marks a trigger firing.

### A. Farmers market, MANAGED, charges booth fees, ONE operating day (River Road today — Round 4)
S1 FM · S3 yes · S4 yes · S5 = 1
1. Vendor applies from the market page (size requested, agreement, docs opt-in) → roster pending. Card: "Application sent".
2. Manager approves (size, number = pin, note) → T1 declares the one day → T9 approval notice.
3. Card: "Manage Schedule ✓ · 3 NEXT: Book a Booth Space". Booking page: day already declared, size locked.
4. Vendor pays a week → selling right for that week; market becomes visible to shoppers (first paid vendor).
Result: clean. The owner's ruling keeps this exactly (one day = assigned).

### B. Same market, MANY operating days (Amarillo-type)
S5 = many
2'. Manager approves → T1 declares ALL days. Vendor is now "attending" days they may never come; shoppers see them on
    those days (once paid); BR-9 credit math counts every day; a conflict elsewhere on one day is skipped + reported.
Owner's ruling 2026-10-11: the vendor should pick. Consequence found in the trace: the skipped-day report (T1's
"which days did approval not give") would misreport, T3 contradicts "vendor picks", T7 has no nudge. PARKED.

### C. Farmers market, MANAGED, FREE (no priced tiers)
S4 no
Same as A/B for approval and days (BR-1: veto once, free or not). No booking step on the card. Selling right = the
declaration alone (no paid week). Visibility = listing + declaration.

### D. Farmers market, OFF-APP (no manager in the app)
S3 no
No roster, no approval, no T1/T3 (nothing flips approved). Vendor declares days themselves on the Markets page, or T5
declares them when a listing is linked. Selling right = declaration. ⚠ The "free managed markets must show the terms"
ruling (2026-09-18) is unbuilt [doc]; off-app markets have no terms at all.

### E. Manager INVITES a vendor (any managed FM market)
S6 invited
Vendor accepts → T7 → T1 → all days declared, silently (no skipped-day sentence on this path). Vendor declines → row
declined, nothing fires. Under the owner's new rule the accept path needs the same "pick your days" nudge as approval.

### F. Manager edits operating days after vendors are on the roster
T3 (add/reactivate) gives the new day to every approved vendor on both verticals; T4 (deactivate) switches everyone off
that day. Manager sees a 4-bullet acknowledgment first [doc 2026-05-19]. ⚠ T3 is the one that silently changes
vendors' commitments without asking them — on FT it even contradicts T6's per-booked-day model.

### G. Vendor already declared elsewhere on the same weekday (Round 6, TR-145)
S8 no
Approval at a one-day market whose day collides → T1 skips it (P0020) → manager row + vendor notice name the day and
the way out (free the other day or tick S8). Vendor's own attempt to add the day → T8 refuses. Clean under the ruling.

### H. Food truck at a PAID park
S1 FT · S4 yes
Apply → approve (vetting only; no T1) → truck books + pays specific days → T6 declares exactly those days → visible on
those days. Weekly holds = standing reservations, approved by the operator, paid per week. ⚠ T3 still adds a new park
day to every approved truck (not booking-driven).

### I. Food truck at a FREE park / off-app spot
S4 no
Approve (if managed) → no schedule; truck must save its own days (`schedules` route) — mig 210 note 3's gap: nothing
prompts it. (Does the FT Markets card show NEXT: Set Schedule? — `market-steps.ts` is shared, `bookDone === null` for
FT spot days per its header [code]; the card path for FT not traced today.)

### J. Private pickup location (vendor's own)
S2 private_pickup. Vendor-owned; no roster, no manager; the vendor's own schedule. Not touched by T1/T3 (no approval).

### K. Event (one date or a few)
S2 event. Never managed; roster rows never flip `approved` (invited → accepted → selected); dates come from the event,
not weekday declarations; events "sell on attendance" (mig 234) [doc]. T1/T3 never fire [code]. Out of this paper's
scope except as proof that the approval-declares-days rule is already bypassed for a third market shape.

### L. Vendor approved BEFORE a rule change (transition)
Rows written by T1 are indistinguishable from vendor-entered rows (§1 ⚠). Any new rule must be forward-only; no
cleanup of existing declarations (mig 211 lesson).

---
## 5. What the scenarios show (observations, not proposals)

1. **Three different answers to "who declares the days" already coexist:** FM approval declares all (T1); FT payment
   declares exactly the booked days (T6); off-app markets let the vendor (or a listing save, T5) declare. Events skip
   the question. The inconsistency is the source of every surprise in this area (Round 4 step 6; mig 210's phantom
   conflict; mig 211's data loss; mig 262's rollback incident).
2. **The ruling "one day = assigned, many days = vendor picks" is a fourth answer** unless it is framed as the single
   rule the others collapse into. The FT model is already "vendor picks by paying"; off-app is already "vendor picks".
   The outlier is FM approval (T1/T3).
3. **A trigger that writes a vendor's commitment on their behalf needs a reason the vendor would agree with.** T6 has
   one (you paid for Tuesday → you're at the park Tuesday). T1 at a one-day market has one (there is only one day). T1
   at a multi-day market and T3 do not.
4. **The Markets card's NEXT button is the mechanism that makes "vendor picks" safe** — it closes mig 210's gap on
   FM (and should on FT). Whatever rule is chosen, the card must know the vendor's next step without a paragraph.
5. **The cheapest layered rule, in the owner's switch language, would be:**
   - Switch 1 — *Is there anything to choose?* (S5 = 1) → no choice: assign the day. (Already T1's effect at River Road.)
   - Switch 2 — *Did the vendor already choose by paying?* (S9, FT parks) → the payment declares (T6, exists).
   - Switch 3 — *Otherwise the vendor chooses* — and the card's NEXT says so (exists for FM).
   - Manager changes a day → **tell**, don't write (T3 becomes a notice; T4's switch-off stays, it protects vendors).
   This is not a proposal to build; it is what the inventory points at, written down so the design session starts from it.
6. **Things the trace found that any design must answer** (from `approval_days_rule_research.md` §I): the skipped-day
   report's definition; T3's fate; the invitation-accept nudge; the test pins (integration test's multi-day Market B);
   the "single-day" definition (one active row vs one weekday); no cleanup of existing rows.

---
## 6. Related partial plans already on file (the "booth # stuff" the owner mentioned)
- `booth_model_design.md` — BR-1…BR-13, vocabulary (§0), pins vs assignments; built parts A–D (migs 256/257).
- `managed_market_obligation_design.md` — selling right = declaration + paid week at fee markets (mig 255); "free
  managed markets must show the terms" — ruled, NOT built.
- `approval_schedule_conflict_research.md` → mig 262 (option A, 2026-10-09).
- `approval_days_rule_research.md` — today's impact trace of the 2026-10-11 ruling (A–I).
- `booth_numbering_design.md`, `booth_auto_assignment_plan.md`, `booth_model_review.md` — number assignment, yielding.
- mig 210 header (FT: "approval is vetting, not scheduling") + mig 211 postmortem (over-broad cleanup → prod incident).
- Open backlog items touching this: FT approved-truck-with-no-schedule gap (mig 210 note 3); error mapping for trigger
  refusals at other call sites; the free-managed-market terms.

## 7. Questions for the design session (not for today)
1. Is the owner's layered rule in §5.5 the shape to design toward, or is "one rule per vertical" preferred?
2. Should T3 (manager adds a day) ever write a vendor's declaration, on either vertical?
3. Should declarations carry a `source` column (vendor / approval / payment / listing / manager-day) so future rules and
   cleanups can tell them apart? (mig 211's root cause.)
4. Should the FT card get the same NEXT-step sequence as FM (closing mig 210 note 3)?
5. Transition: forward-only, no cleanup — confirm.
