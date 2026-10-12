# Approval-declares-days rule change — impact trace (2026-10-11)

Owner ruling 2026-10-11 (OB-038): at a farmers market, approval must NOT declare every market day for the vendor.
- MULTI-day market → the vendor picks their own days after approval (no auto-declare).
- SINGLE-day market → the one day is assigned on approval; the vendor makes no selection.
- Food trucks: untouched (the approval-side triggers already return early for food_trucks).
Owner: "before you make this change, trace the items that will be impacted … do not undo other items that are working."

## Checklist (write findings per item IMMEDIATELY)
- [ ] A. Origin + the three triggers (mig 002 / 095 / 262) — what fires, when, for which markets (events too?)
- [ ] B. Approval route `market-manager/[marketId]/vendor-approval` + `approval-skipped-days.ts` (skipped-day report assumes rows were created)
- [ ] C. Invitation accept `vendor/markets/[id]/respond` + unmanaged `join` (does anything app-side create rows?)
- [ ] D. Vendor day picker `vendor/markets/[id]/schedules` route + Markets card (`vendor/markets/route.ts` hasAttendance → `market-steps.ts`)
- [ ] E. Manager adds/reactivates a day → `auto_add_schedule_to_vendors` (multi-day rule interaction)
- [ ] F. Readers that assume approved ⇒ rows: visibility (`visible-markets.ts`, `market-visibility.ts`), booking gates (BR-13), cancel credit (BR-9), cancel-date notices, week strips, dashboard stats, surveys, cart
- [ ] G. Events: do event vendor approvals touch `market_vendors.approved` + `market_schedules` (trigger would fire)?
- [ ] H. Tests that pin the current behaviour (flow-integrity mig-262 pins, approval-conflict integration, approval-skipped-days unit)
- [ ] I. Open questions for the owner

## Findings
### A. Origin + triggers — DONE
- mig 002 (2026-01-28) "Default behavior: Vendors attend ALL active schedules at their markets … until they specify otherwise" — a buyer-visibility default from before approval meant anything (managed-market model came 2026-09, mig 255/256). Three functions, four triggers (`20260128_002_backfill_vendor_schedules.sql:54,86,122,129`): UPDATE approved false→true, INSERT approved=true, market_schedules INSERT active / UPDATE active false→true.
- Live bodies = mig 262 (Dev+Staging; Prod = 095/002 bodies + no FT skip on insert variant? — 262 header says live insert-variant carries the FT skip that no repo migration recorded). Approval-side fns return early for `vertical_id = 'food_trucks'` (`262:162-164`). `auto_add_schedule_to_vendors` has NO vertical skip — FT parks adding a day still insert rows for approved trucks (262 header :53-55, "unchanged behaviour").
- Events: `markets.market_type = 'event'` rows ARE markets; if an event has `market_schedules` rows and `market_vendors.approved` flips, the trigger fires too → check G.

### B. Approval route + skipped-days — DONE
- `vendor-approval/route.ts:186-217`: after the UPDATE, for non-FT markets calls `findSkippedDays` and puts the sentence in the vendor's `vendor_market_approval_granted` notice (`:250`) and in the response (`:270-271`) → manager row (`VendorBoothList.tsx`).
- `approval-skipped-days.ts:38-53`: a "skipped day" = an ACTIVE market day with NO row for the vendor. **Under the new rule a multi-day approval creates no rows → every day would be reported as "not added: the vendor is scheduled at another market at that time" — a FALSE message to both manager and vendor.** Must change together with the trigger: skipped-day reporting only where approval assigns (single-day market); multi-day approval notice says "pick your days on your Markets page" instead. Unit test `approval-skipped-days.test.ts` + flow pins reference this helper (H).

### C. Invitation accept + join — DONE
- `vendor/markets/[id]/respond/route.ts:169-186`: accepting an invitation sets `approved = true` by UPDATE → the UPDATE trigger fires → today every active day is declared with NO skipped-day report and no notice about days. Under the new rule the accept path at a multi-day market leaves the vendor with no days — the accept response / Markets card must point them to "Set Schedule" (the card already does: Next = schedule when no attendance, D). Events refused here (`:100-109`).
- `join/route.ts:160-171`: inserts `approved: false` → the INSERT trigger does nothing. Only app path that INSERTs approved=true: none found (`grep "approved: *true"` → only respond). The INSERT-variant trigger is reachable only by SQL/admin.

### D. Vendor day picker + Markets card — DONE
- `vendor/markets/[id]/schedules/route.ts`: PUT/PATCH gate `managedJoinBlocked` (`:46-72`) passes once `approved === true` (`:60`); PUT deactivates existing rows then upserts the chosen ones (`:416-437`); conflict trigger surfaced as 409 (`:445-446`). An approved vendor with NO rows can pick days today — nothing to build here.
- Card: `api/vendor/markets/route.ts:90,298,334` → `hasAttendance` = any active row; `vendor/markets/page.tsx:416-429` → `computeMarketSteps` → with approved + no attendance, Next = "2 Set Schedule" (`market-steps.ts` order). Already the behaviour the owner wants for multi-day; no change.

### E. Manager adds / reactivates a day — DONE (owner question Q2)
- `market-manager/[marketId]/schedules/route.ts`: INSERT new day (active=true) or UPDATE active → `auto_add_schedule_to_vendors` (mig 262 §4) inserts a row for EVERY approved vendor, both verticals. Under the new rule this contradicts "vendor picks" at a multi-day market (and turns a single-day market's vendors into two-day attendees the moment a second day is added). Needs a ruling: (a) stop auto-adding at FM (vendors add the new day themselves — and nobody tells them it exists unless we notify), (b) keep auto-add only when the market was single-day before the add (the assigned day stays assigned; a second day → nobody auto-added), (c) keep as is. FT: untouched either way (owner: leave FT alone).

### F. Readers that assume approved ⇒ rows — DONE (none break; behaviour shifts as intended)
- Visibility `visible-markets.ts:55-84` / `market-visibility.ts`: a multi-day-market vendor is invisible to shoppers until they pick a day (plus paid week at fee markets) — intended under the ruling.
- Booking gates `booking-gates.ts:84-89,196-199` (BR-13) + booking page `DeclareDaysGate` (`book/page.tsx:355-357`): the no-days case is already handled inline — becomes the NORMAL path at multi-day markets. TR-087 becomes testable by approval alone.
- Cancel credit `booth-cancel-credit.ts:48-52`: declared days only; fewer rows = smaller credit base — correct by BR-9.
- Cancel-date notices `cancel-date/route.ts:146-149`: fans out to every APPROVED roster vendor, not by rows — unaffected.
- Week strip / dashboard stats / surveys / cart (`manager-week-strip.ts:167`, `manager-dashboard-stats.ts:113`, `surveys/weekly.ts:85,135`, `cart/route.ts:225`): read rows that exist — unaffected.
- Webhooks `stripe/webhooks.ts:1989-2042`: the FT park-paid handler creates rows per booked day; the FM booth-paid handler creates none (only vms block in the file) — unaffected.
- Listing save `listing-schedule-days.ts`: auto-declares at UNMANAGED markets only (TR-117) — unaffected. Unmanaged markets have no approval, so the triggers never fire there anyway (approved stays false? — the join side door was closed 2026-09-19; unmanaged attendance = schedules route + listing save).

### G. Events — DONE
- Event roster rows are inserted with `response_status: 'invited'` and no `approved` (`event-actions.ts:418-429`); the select route stamps `organizer_selected_at` only (`select/route.ts:449-454`); `vendor/markets/[id]/respond` refuses events (`:100-109`, "events never flip approved", mig 217). So the approval triggers never fire for events today, and the change cannot touch them. (market_vendors.approved default not re-read from the snapshot — the respond-route comment is the evidence.)

### H. Tests that pin the 2026-10-09 rule — DONE (change ONLY with the owner's word; test-integrity Rule 1/3)
- `flow-integrity.test.ts:3869-3886`: "all three auto-create functions insert one row at a time and skip ONLY P0020" + the FT early-return pin — both read mig 262's text. A mig 263 would carry the new bodies; the pins must be re-pointed/re-worded by the owner's authorisation, not silently.
- `approval-conflict.integration.test.ts:106-120`: Market B (Wednesday + Saturday = MULTI-day) — "approving SUCCEEDS; Wednesday created, Saturday skipped" → under the ruling B's approval creates nothing; the conflict-skip scenario needs a SINGLE-day market to stay testable. `:132-135` "manager adding a NEW day creates the vendor's row" → depends on Q2.
- `approval-skipped-days.test.ts` (pure helper) — unchanged helper, but its use is narrowed to single-day markets.
- `flow-integrity.test.ts:3888-3900`: approval route reports skipped days — stays, with the multi-day branch added.

### I. Open questions for the owner (asked 2026-10-11)
Q1 what is "single-day": exactly ONE active market_schedules row (two windows on the same weekday = multi)? Q2 manager adds/reactivates a day at FM (E). Q3 multi-day approval notice wording ("pick your days on your Markets page") and nothing extra on the manager's row. Q4 vendors approved before the change keep their rows (no cleanup). Q5 the tests above change with this ruling — authorise.
Shape of the build once ruled: mig 263 (replaces `auto_create_vendor_schedules` + `_insert`, and `auto_add_schedule_to_vendors` per Q2; FT early return kept; single-day = assign with the P0020 skip; multi-day = no rows) · route: skipped-day report only when the market has one active day, else the "pick your days" note · notification template branch · ROUNDS/registry: TR-087 testable at a multi-day managed market (need one on staging — state query).

---
# PART 2 — END-TO-END REVIEW (owner 2026-10-11: "another end to end review of the full picture in code … propose the best plan to unify how a vendor chooses days and aligns with booth number assignment … must scale to other verticals")
## Checklist
- [ ] R1 Vendor Markets page + card: how days are picked today (UI → route), both verticals
- [ ] R2 Manager roster: approve / booth pin / revoke (`vendor-approval`, `vendor-booth`, VendorBoothList)
- [ ] R3 Booking FM week/season: gates order, pin → assignment on payment (`book`, `book-season`, webhook booth handler)
- [ ] R4 FT park: apply/approve, spot booking, standing holds, payment → declaration (T6), where-today
- [ ] R5 Shopper side: pickup dates fn (mig 238/255), visibility predicates, cart validation
- [ ] R6 Manager day edits: schedules route + T3/T4
- [ ] R7 Listing save auto-declare (T5) and the profile multi-location switch (S8)
- [ ] R8 Tests pinning each piece (flow-integrity sections)
- [ ] R9 Proposal
## Findings
### R1 Vendor Markets page + day picker — DONE
- `MarketScheduleSelector.tsx` (470 lines, read): one selector for BOTH verticals + events. Per-day toggle → PATCH `schedules` (`:101-122`); FT/events pre-fill vendor hours from market hours (`:111-115`), vendor can edit their own start/end per day (`:160-190`). **Precedent for "one day = no choice": single-day EVENTS auto-activate the only schedule in the UI (`:75-80`) and show "You're confirmed for this event" (`:243-245`).** Warning when no day is active: "Your listings/menu won't appear … until you select at least one day" (`:266-268`). Blocking errors by code: `ERR_MARKET_APPLY_REQUIRED` (heading "Manager approval needed"), `ERR_SCHEDULE_CONFLICT`, `ERR_SCHEDULE_HAS_ORDERS` (`:146-151`).
- Page `vendor/markets/page.tsx:416-429` → `computeMarketSteps` (R1 of part 1). Card data from `api/vendor/markets` (806 lines — roster + attendance + listings + bookDone per market).
- `schedules/route.ts` PATCH (`:500-700` read): private_pickup refused (`:515`); BR-1 gate only when activating (`:523-528`, deactivate always allowed); schedule must be an ACTIVE market day (`:539-548`, so a vendor cannot undo a manager's day switch-off); vendor hours must sit inside market hours (`:552-620`); deactivating a day with pending orders refused `ERR_SCHEDULE_HAS_ORDERS` (`:622-644`); upsert on (vendor, schedule) (`:647-663`); conflict trigger → 409 by MESSAGE text (`:669-671`, not P0020 — the backlog "error mapping" item); `vendor_has_active_schedules` RPC → warning (`:680-694`).
### R2 Manager approval — DONE
- `vendor-approval/route.ts` (full read): approval = ONE write setting `approved`, `inventory_id` (size/tier), `booth_number` (PIN), `revoked_at/by` (`:146-165`); number must belong to the size (mig 258, `:88-96`), be free (`checkBoothNumberAvailable`, `:98-117`); revoke clears the pin (BR-12). Days are NOT part of the manager's decision anywhere in the route — only T1 adds them as a side effect. The pin is market-wide (every week, every day); FT's equivalent hold (standing reservation) is per WEEKDAY + spot.
### R3 Booking gates — DONE
- `booking-gates.ts` (full read): order BR-1 approved roster (managed only, `:68-80`) → BR-13 ≥1 active declaration (`:82-98`, message "buyers see you only on the days you pick") → BR-4 tier lock (`:100-118`) → declared-day conflict re-check (`:120-135`, OB-031). Pure decision, shared by `book`, `book-season`, booking page. ⇒ **the booking system already assumes the vendor declared days themselves**; T1 only pre-satisfies BR-13.
- Payment: `webhooks.ts:1604-1615` → `applyPaidBoothAssignment` (`booth-assignment.ts:59`): paid week writes the number onto the roster row (pin → assignment) or transfers a yielded soft pin; `booth-freeze.ts:17-43` (BR-7) freezes the pin while a paid current/upcoming week exists. **The FM number model is: ask at apply → set at approval (pin) → lock at booking → own on payment → frozen while paid → soft after a missed week.** Days play no part in it.
### R4 Food-truck park — DONE
- `book-park-spot/route.ts:22-35` header: "Open booking (no operator approval)… book-then-vet"; `:372-384` upserts a roster row `approved:false` so the truck lands on the operator's roster. The park PAGE still shows Apply now → Applied → Book now (TR-133, roster-driven) — the UI asks for approval, the route does not require it. T6 (webhook) declares the booked weekdays on payment. Standing hold (`standing-reservation/route.ts:11-18`): a request for spot + WEEKDAY, operator approves, paid per occurrence — the FT "pin" is per weekday + spot, while the FM pin is one number for every week.
- `market-steps.ts` (full read): `bookDone === null` on FT (`api/vendor/markets/route.ts:343`) → the Book step is never Next on FT; "schedule" is Next after approval when no rows — at a PAID park that points the truck at the day picker when paying is what declares (T6). ⚠ FT card and FT model disagree (mig 210 note 3 gap, in a different shape).
### R5 Shopper side — DONE (snapshot rows 74-75, 92; not re-read live)
- `get_available_pickup_dates` = declaration covers the weekday AND (paid week at managed fee FM, mig 255) AND (paid booking date at paid park, T5 mig 199) AND not blacked out (238) AND event rules (234/254). TS twins: `managed-fee-gate.ts`, `visible-markets.ts`, `market-visibility.ts` (paired rules). Declaration is necessary on every branch; payment adds the selling right where the market charges.
### R6 Manager day edits — DONE
- `market-manager/[marketId]/schedules/route.ts`: soft-delete via `active` (T4 cascade), INSERT new day (T3 fires), and ALREADY notifies every roster vendor `market_schedule_changed` (`:352-427`, Session 92 fix). ⇒ dropping T3's write loses nothing the vendor is not already told about; the notice copy would need "add the new day on your Markets page if you'll attend".
### R7 Listing save + profile switch — DONE (read 2026-10-09 / today)
- `listing-schedule-days.ts`: declares at OFF-APP markets only; managed → nothing (TR-117 pinned `:2030`). `profile_data.multiple_trucks` = S8, read by the day route, the conflict trigger, the booking gate (`booking-gates.ts:158`).
### R8 Tests — DONE
- Pins: `flow-integrity.test.ts:2030` (listing save never declares at managed), `:2051` (ONE shared booking gate BR-1/13/4), `:2071` (apply asks size, approval sets size+number+note), `:2127` (BR-9 per declared day), `:2206` (event accept never writes declarations), `:3851-3900` (mig 262: three fns loop + P0020, FT early return, route reports skipped days), `approval-conflict.integration.test.ts` (multi-day Market B). Only the `:3851` block + the integration test encode "approval declares all days"; every other pin encodes "the vendor declares" and stays true under the proposal.

## R9 — PROPOSAL (2026-10-11, for the owner's design session; nothing built)

### The one sentence another developer needs
**A vendor's days are written only by the vendor's own act — a pick on the Markets page, or a payment for a date. Approval is vetting plus the booth pin; it never writes days. The single exception: when the market has exactly one operating day there is nothing to choose, so that day is recorded for them and shown as done.**

Why this is the unifying rule and not a fifth one: it is already the rule everywhere except FM approval. Off-app markets (vendor picks / listing save), FT paid parks (payment = the act, T6), events (dates come from the event), single-day events (the selector auto-confirms the only day, `MarketScheduleSelector.tsx:75-80`). The outlier is T1/T3 at FM, inherited from mig 002 (Jan 2026) when approval did not exist as a concept.

### How it aligns with booth numbers (the parallel the owner asked for)
| Step | Booth number (FM, BR-2…7 — unchanged) | Days (proposed) |
|---|---|---|
| Apply | vendor asks for a SIZE | — (nothing to say yet) |
| Approve | manager vets; sets size + number = a PIN (soft hold) | manager vets; writes NO days — except a one-day market: the day is recorded |
| Vendor's act | books a week (accepts size/number) | picks days (or, at a paid park, pays for dates) |
| Pay | number becomes the ASSIGNMENT, frozen while paid | selling right on declared days (fee markets) |
| Manager changes something | pin move → `booth_number_changed` notice (BR-8) | new operating day → existing `market_schedule_changed` notice; no row written for anyone |
Same shape in both columns: **manager decides the vendor and the hold; the vendor decides their own commitment; payment makes it real; changes are told, not imposed.**

### The switches it needs (and only these)
1. Is the market managed? (`manager_user_id`) → gates approval (BR-1) — exists.
2. How many operating days? (`count(active market_schedules)`) → 1 = record it at approval; else nothing — NEW, one COUNT in the trigger.
3. Does the market charge? → payment adds the selling right — exists (mig 255 / T5).
No vertical test anywhere in the rule. Vertical differences fall out of the switches (parks charge per date → T6; FM charges per week → mig 255). A new vertical gets the behaviour from its market rows, not from code.

### What changes (minimal set)
A. **Mig 263 — function replace, paste-and-go class.** `auto_create_vendor_schedules` + `_insert`: replace the all-days loop with "if exactly one active day → insert it (keep the P0020 skip + ON CONFLICT DO NOTHING) else nothing". `auto_add_schedule_to_vendors`: body becomes a no-op RETURN NEW (trigger stays attached, nothing dropped — rollback = re-run 262). **Open: the FT early return.** Keeping it = zero FT change (owner's standing "leave FT alone"). Removing it = one uniform rule; the only FT effect is at a one-day park, where approval would record that day (harmless at a paid park — selling still needs a paid date, T5; helpful at a free one-day park — closes mig 210 note 3 there). Owner's call; default = keep it until FT is reviewed on purpose.
B. **Approval route** (`vendor-approval/route.ts:186-217,250,270-271`): compute the skipped-day report only when the market has one active day (it is the only case approval writes); otherwise the vendor's approval notice carries "Next: pick the days you attend on your Markets page" and the manager row carries nothing extra. One branch, same helper.
C. **Invitation accept** (`respond/route.ts`): no code change — the Markets card already shows "2 NEXT: Set Schedule" (D). Optional: one sentence in the accept confirmation.
D. **Manager day-edit notice copy** (`market_schedule_changed` template): add "if you'll attend the new day, add it on your Markets page". Template text only.
E. **Provenance (recommended, additive, separable): `vendor_market_schedules.source TEXT NOT NULL DEFAULT 'vendor'`** with values vendor / approval / payment / listing / backfill-unknown, set by each writer (3 app writers + 1 trigger). Existing rows → 'backfill-unknown'. Costs one column; it is what mig 211 lacked and what any future cleanup or rule needs. Not required for A–D.
F. **Tests — with the owner's explicit authorisation, not before:** rewrite `flow-integrity.test.ts:3869-3886` (the loop/P0020 pin becomes "one-day → insert with P0020 skip; else nothing; T3 no-op") and the integration test's Market B scenario (single-day market for the conflict skip; multi-day market → zero rows after approval; manager adds a day → zero rows). Every other pin (R8) stays as is.
G. **Testing docs:** TR-087 becomes testable by approval at a multi-day managed market; TR-119's post-approval state = "2 NEXT: Set Schedule" at multi-day, "3 NEXT: Book" at one-day; Round 4 note stays true for River Road.

### What does NOT change
The declaration table and its meaning (owner 2026-09-19) · the day picker and its gates · the booking gate order · the pin/assignment/freeze model · the conflict rule (P0020) and its skip inside the single-day insert · mig 255 selling rule · T4 (manager switches a day off → vendors off that day: protects vendors, keep) · T5 (listing save at off-app markets) · T6 · events · existing rows (forward-only; no cleanup — mig 211 lesson).

### Transition + risk
- Rows already written by T1 stay (indistinguishable without E). Vendors approved before 263 keep their days.
- Prod: 263 supersedes 262 for the three auto-create functions; conflict function unchanged (253/262 text). Apply order on Prod: 253 → 262 → 263, or 263 alone for the three functions + 262's conflict function.
- Blast radius if A has a bug: an approval writes 0 rows instead of 1 at a one-day market → the card shows "2 NEXT: Set Schedule" and the vendor picks the day themselves — degraded to the multi-day path, nothing lost. No money path touched.
- The FT asymmetry R4 found (route does not require approval; page asks for it) is NOT part of this proposal — logged for the FT review.

### Decisions the owner must make (5)
1. The rule sentence above — yes/no.
2. T3 (manager adds a day): no-op + notice copy (proposed) — or keep writing.
3. FT early return: keep (zero FT change) or remove (uniform rule, one-day parks affected).
4. Provenance column E: now, later, or never.
5. Authorise the two test rewrites in F.

## R10 — Reconciliation with the owner's TIER vision (owner message 2026-10-11, pasted in chat)
Owner's tiers: T0 one-day unmanaged · T1 multi-day unmanaged (vendor picks; maybe a vendor-wide "baseline availability") · T2 managed one-day (day assigned, booth model reused) · T3 managed multi-day (vendor picks after approval, booth model). Approval ⇔ managed. Unmanaged: take the vendor's word for days AND booth/spot number. Private pickup: not a market, vendor-controlled, but conflicts still matter. Events: multi-day events need per-day attendance + booth/spot numbers; reuse the assignment logic.
Mapping: the tiers = the 2×2 of two switches already in the code — managed? (`manager_user_id`) × one operating day? (`count(active market_schedules) = 1`). T0/T1 differ only by whether there is anything to pick; T2/T3 likewise. The third axis the tiers omit — charges? — is what the booth model's "assignment on payment" and the selling rule (mig 255/T5) key on.
Deviations found (code vs vision), with recommendation: see chat 2026-10-11 and the table below.
| # | Vision | Code today | Recommendation |
|---|---|---|---|
| D1 | unmanaged multi-day: vendor picks | listing save auto-declares EVERY day at off-app markets (T5, `listing-schedule-days.ts`, TR-147 built 10-09) | change T5 to the same rule: one day → auto; else no guess, card says NEXT: Set Schedule. Cost: small; the 10-09 banner flow stays for refusals |
| D2 | vendor-wide "baseline availability days" | does not exist; per-market declarations + conflict rule (P0020) already prevent two places at once | AGAINST as a gate (two places to edit, second source of truth); FOR as a read-only "My week" view later |
| D3 | unmanaged: vendor states their booth/spot number | no roster row exists at off-app markets; `booth_number` lives on `market_vendors` and is manager-set | defer; if wanted, a vendor-stated label on the declaration row (per market), never on the roster; manager-arrival reconciliation is its own process |
| D4 | private pickup still conflict-checked | excluded on purpose: day route refuses private_pickup (`schedules/route.ts:267,516`), conflict slots read declarations only (`booking-gates.ts:194-218`), owner ruling 2026-08-27 "private locations do NOT count unless they hold pre-orders" | contradicts the 08-27 ruling → owner decides; feasible by reading the vendor's private-pickup `market_schedules` into the slot loader (one function) |
| D5 | multi-day events per-day attendance | selector already branches: single-day event auto-confirms, multi-day event "select which days" (`MarketScheduleSelector.tsx:67-80,243-245`); accept route writes no declarations (pin `:2206`); whether the selector is surfaced for events today: UNVERIFIED | the same rule covers events once the event's days are `market_schedules` rows — verify the surfacing before designing |
| D6 | event booth/spot numbers via the same assignment logic | no booth-number logic in `lib/events` or event routes (grep: no reference) ; events have no manager — the organizer/admin would be the assigner | later; the pin model is reusable only if an "assigner" role exists for events |
| D7 | approval ⇔ managed, before booking | FM: yes (BR-1 shared gate). FT: park booking route is book-then-vet (no approval gate, `book-park-spot/route.ts:22-35,372-384`) while the park page asks for Apply first | resolve in the FT review: either gate the route (matches vision + FM) or make the page honest |
| D8 | managed one-day → booth model reused | booth model's ASSIGNMENT = pin + PAID week (`booth-freeze.ts`); at a FREE managed market nothing is ever paid → pin never becomes an assignment | define: at a free managed market the manager's pin IS the assignment (frozen only while the roster row is approved); one line in `boothAssignmentFrozenUntil` |
| D9 | tiers as the structure | switches already exist; no tier enum | implement as two switches + the charges switch; DOCUMENT as the four tiers (a table in `booth_model_design.md` §0) so a developer reads tiers and the code reads switches |

## R11 — Owner answers 2026-10-11 + Claude's checks
- D1 ruled in principle ("can we do this without messing other stuff up?"): the listing-save declare block is `ListingForm.tsx:441-480` (unmanaged traditional only; one upsert per active day). Change = group `allSchedules` by market and upsert only where the market has exactly ONE active day. Readers unaffected (they read rows that exist); card NEXT covers the multi-day case (`market-steps.ts`, no apply step at unmanaged). Tests touched: `flow-integrity.test.ts:2030` (managed → never) stays; `:3957` "listing save never silently drops a market day" + `listing-schedule-days.test.ts` need the single-day framing → owner authorisation. Prod has seed data only → no live vendor loses visibility.
- D2 RULED: at a free managed market the manager's pin IS the assignment. Check: `boothAssignmentFrozenUntil` (`booth-freeze.ts:17-43`) is paid-week based and read by `vendor-booth` (pin edits) + `weekly-rental` (overrides); yielding (`booth-assignment.ts`) runs only inside a BOOKING's auto-assign — free markets have no priced tiers, so no bookings → no yielding → nothing to break. Build = display/semantics only (vendor copy "Your booth: #7" at free markets; no freeze added — the manager keeps moving pins, BR-8 notice fires). Confirm with the owner that "assignment" at free markets does NOT freeze the manager.
- D3 FT: book-then-vet is deliberate (owner: trucks travel; pay-and-set-up same day). Same-day docs: booking requires the compliance acknowledgment (`doc_ack_accepted`, `book-park-spot` B1) + info-sharing consent; the operator is notified when docs change (`park-docs-review.ts` sweep) and can mark reviewed/flagged or BLOCK future bookings (`park-vetting/[vendorProfileId]/route.ts`). Recurring holds DO require operator approval (`standing-reservations/route.ts:14,121` requested → active). So FT already matches the owner's intent: same-day = book-then-vet; recurring = approval. The only wart is the park PAGE showing Apply now → Applied → Book now, which implies a gate the route doesn't have (TR-133 copy) — resolve by copy, not by gating.
- D4 private pickup: windows are `market_schedules` rows on the vendor's own location, written by `vendor/markets/[id]` PATCH `pickup_windows` (`:141-222`); no declarations, no conflict check anywhere. Owner wants at least a WARNING. Design: non-blocking `warning` in two places using the existing `findScheduleConflicts` util — (a) saving pickup windows → compare against the vendor's active declared slots (`loadActiveDeclaredSlots`, make it exported); (b) picking a market day → compare against the vendor's private-pickup windows. The day selector already renders `data.warning`; the private-pickup editor's warning display: UNVERIFIED. Does not reverse the 08-27 ruling (still not a block, still not counted for events).
- D5 events → events pass. D3-booth: vendor's own number goes in their description; never on the roster.

## R12 — Owner rulings 2026-10-11 (round 3) + plans
### D2 RULED: at a FREE managed market a booth number is either AUTO-assigned or set by the manager
Unifying sentence (mirrors the days rule): **a number becomes the vendor's when their commitment becomes real — at a charging market that is payment (today's pin → assignment, unchanged); at a free market nothing is ever paid, so it is approval.**
Plan (no code yet): in `vendor-approval/route.ts`, after the number/size resolution (`:88-134`) and only when the market charges nothing (`marketChargesVendors` false, `managed-fee-gate.ts`) and the manager left `booth_number` blank and the market has labels for the chosen (or only) tier: pick the lowest label in `tierLabels(row)` (`booth-types.ts:88`) for which `checkBoothNumberAvailable` (`booth-conflict-checks.ts:57`) returns no conflict, and write it as the pin with its tier (mig 258 pairing). No labels defined → no number (manager may type one later; today's behaviour). The approval notice already carries `boothNumber`. No freeze at free markets (nothing paid; manager keeps moving pins, BR-8 notice fires). Paid markets: untouched — auto-assign stays at booking (`book_weekly_booth_atomic`). Tests: one new pin + a unit test for the picker; nothing existing changes.
### D3 RULED: keep FT book-then-vet; recurring holds keep operator approval. Only the park page copy (Apply now → Applied → Book now) overstates the gate → wording item for the FT review.
### D4 RULED: trace + plan a WARNING for private-pickup vs market overlaps
Trace (code): private-pickup windows = `market_schedules` rows on the vendor's own `markets` row (`market_type='private_pickup'`), created by `api/vendor/markets` POST (`:621-658`) and replaced by `api/vendor/markets/[id]` PUT (`:85-104` validation, `:141-256` soft-upsert per (day,start,end), deactivate the rest). Editor: `components/vendor/markets/PrivatePickupSection.tsx` (`:159-188`, PUT/POST, shows only `error` — no `warning` channel today). No declaration rows are written for private pickups (day route refuses them `:267,:516`), so the conflict trigger (mig 253/262), the day picker check (`schedules/route.ts:304-361`) and the booking gate (`booking-gates.ts:120-135`, slots from declarations only `:194-218`) never see them. Owner ruling 2026-08-27 (events): private locations don't count unless they hold pre-orders — a conflict RULE question; a warning is not a rule and does not reverse it.
Plan (warning, never a block):
1. `booking-gates.ts`: export `loadActiveDeclaredSlots` and add `loadPrivatePickupSlots(service, vendorProfileId)` → `ScheduleSlot[]` from the vendor's private-pickup markets' active `market_schedules` (name = the location's name). Pure overlap via the existing `findScheduleConflicts` (`schedule-overlap.ts:62`).
2. Day picker route (PUT + PATCH, when activating): after the blocking conflict check passes, compute overlaps against private-pickup slots → return in the existing `warning` field ("Heads up: this overlaps your pickup window at <location> on <day> <times>. Shoppers could expect you in two places."). `MarketScheduleSelector.tsx:142-144` already renders `data.warning`.
3. Private-pickup PUT/POST: after a successful save, compute overlaps of the saved windows against `loadActiveDeclaredSlots` → `{ market, warning }`; `PrivatePickupSection.tsx` gains a warning banner (one state + one block, same look as the selector's amber box).
4. Multi-location box (`profile_data.multiple_trucks` = true) → no warning (the vendor has said they can be in two places).
5. Tests: unit test for the overlap-to-sentence helper; two flow pins (both routes call the warning helper; the warning is never an error status).
Not in scope: events (08-27 ruling), the pre-orders nuance (no change), blocking.
