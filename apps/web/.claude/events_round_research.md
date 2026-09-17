# Events round research — OB-024 (2026-09-15/16)

## ▶ 2026-09-17 PRE-BUILD DEEP READ (owner: "read all the code that touches your changes… then proceed")

### Change 1 (item 6) — ⚠ NOT a two-file display fix. The 09-16 plan line "shop treats attending = SELECTED" is UNSAFE as written.
Read this session, unfiltered:
- Public page `app/[vertical]/events/[token]/page.tsx:57-68` — accepted + `is_backup !== true`. Display only
  (poster + item links). Statuses shown: approved/ready/active/review/completed (`:31`). Heading `:232`.
- Shop `lib/events/shop-data.ts:155-184` — same filter + fee paid/covered. Tagged `@paired-rule
  event-sells-on-acceptance` (`:155`).
- **PAIRED RULE** `lib/paired-rules.ts:88-102`: shop payload "must apply the SAME filter" as the SQL sell gate;
  authoritative = newest definer of `get_available_pickup_dates`. Drift = "menus that error at cart time (or
  hides sellable ones)".
- **SQL sell gate**, newest definer = mig 238 (`applied/20260827_238_…sql:186-206`): event listing sells iff
  accepted + `COALESCE(is_backup,false)=false` + (no fee OR fee paid/covered). NO `organizer_selected_at`, NO
  `service_level`, NO event-status check anywhere in the function.
- Pins: `flow-integrity.test.ts:1625-1719` (newest definer keeps accepted branch / bench exclusion / fee gate /
  vms scope; `:1706-1719` shop mirror must contain `is_backup !== true`, paid/covered, `feeCents > 0`).
- CONSEQUENCE: tightening ONLY the shop makes shop ≠ SQL gate = the exact drift the paired rule forbids. On a
  FREE self-service event an accepted-never-selected vendor is ORDERABLE today (SQL gate) — hiding them in the
  shop would hide a sellable menu, not stop the sale (listing page/cart still pass the gate). The owner's test
  hid the 3rd vendor on the order page most likely via the FEE gate (unpaid — never selected), not a stage rule.
- SAFE SCOPING: (1a) public page only → attending = selected (self-service); no paired rule, no SQL. Fixes the
  reported TR-022 symptom. (1b) SEPARATE, owner ruling + migration: should the SELL gate require selection on
  self-service events? = function replace of the 19×-rewritten gate (pull `pg_get_functiondef` on 3 envs first)
  + shop mirror + paired-rule text + new pin. NOT to be folded into 1a silently.

Owner rulings received 2026-09-16:
- **A** = the vendor MUST hold the multi-location declaration (`profile_data.multiple_trucks`) to accept an
  event invitation that conflicts; the acknowledgment box may NOT stand in. "They can leave the page and go
  change their profile but we can't just let them check a box in the moment."
- **B** = owner undecided; wants the implications. Either lock + TELL the organizer, or allow + handle the mess.

- Public page empty state exists (`page.tsx:334-345` "Vendors Are Still Responding"); hero label "Pre-Orders
  Open" keys on status only (`:176, :189`) → with 1a and zero selected it would say Pre-Orders Open over an
  empty roster; gate the label on `vendors.length > 0` in the same change.
- Select route comment `:186-190`: the RESPOND route sets status 'ready' at the acceptance threshold, BEFORE any
  selection (verify in respond route) → on a FREE self-service event every accepted vendor is orderable before
  the organizer picks anyone, and a late responder is orderable after. Fee events are protected by the fee gate.

### Change 3 (ruling B) — select route read IN FULL (800 lines) 2026-09-17
- Event-wide gate `:397-402`; `priorRows` (`:368-372`) already carries `is_backup` + `organizer_selected_at` per
  vendor, captured BEFORE the stamp write (`:429-434`) → per-vendor gate needs no new query: pareable iff vid ∈
  selected list (`:403-407` already) AND no prior stamp AND prior `is_backup !== true`.
- GET `can_pare` `:275` is one boolean → becomes per-vendor (`can_pare` on each vendor row); select page UI reads it.
- Re-submit trap CONFIRMED `:463-474`: anyone accepted and not in the submitted list is benched + blackout lifted
  + fee refunded/released (`:492-546`, real Stripe refund via refundEventFeePayment). A rolling UI MUST pre-tick
  and carry already-selected vendors; an accidental omission = a real refund. ⚠ money-adjacent.
- ⚠ **MY RULING-B RATIONALE WAS WRONG ON FREE EVENTS.** I told the owner "no order can exist against an
  unselected vendor's items". False today: SQL gate sells accepted+not-benched (mig 238 `:186-206`) and the shop
  shows them (`shop-data.ts:169-171`) — a late responder on a FREE event is orderable before the organizer ever
  sees them. True only on fee events. Ruling B is safe only if EITHER (1b) the sell gate requires selection on
  self-service events, OR the pare refuses any listing that already has a live order at this event market.
  → correct decisions.md 2026-09-17 row (additive note) + tell the owner.

### Change 2 (ruling A) — respond route read IN FULL (621 lines) 2026-09-17
- CONFIRMED `:538-557`: self-service + status 'approved' + threshold met (accepted ≥ vendor_count, or all
  responded) → status 'ready' BEFORE any organizer selection. Public page then says "Pre-Orders Open".
- Ack branch `:245-254` (code ERR_CONFLICT_ACK_REQUIRED). Non-declared vendor paths today: another event →
  refuse `:225-234`; open orders → refuse `:235-244`; else acknowledge → accept → blackout write `:322-339` +
  park-operator notice `:340-364`.
- ⚠ CONSEQUENCE OF RULING A the owner has not been shown: once the ack branch refuses, EVERY non-declared vendor
  with a conflict is refused, so the blackout write + "park spot skipped for event" notice (`:322-365`) become
  UNREACHABLE — the whole R3-4 "choose the event, pause pre-orders at the other location" mechanism (mig 238,
  owner rule 2026-08-27) goes dead on the accept path. A genuine single-location vendor who WANTS to skip their
  Saturday market for a Saturday event has no honest path: no per-day skip UI exists (mig 238 header: "future"),
  so they must drop the market schedule or tick a declaration that is untrue. ASK before building.
- Late responder arrives un-benched/un-stamped: route never writes is_backup (read in full — confirmed).

- ⚠ **TEST CONFLICT for ruling A (Absolute Rule 2 — owner decides, never pre-planned):**
  `flow-integrity.test.ts:2351-2353` requires the respond route to contain `code: 'ERR_CONFLICT_ACK_REQUIRED'`;
  `:2356-2363` requires `writeEventBlackouts(` after the status write. Both pin the 2026-08-27 R3-4 rule that
  ruling A reverses. The 09-16 note "tests untouched" covered availability.test.ts only and MISSED these two.
- Vendor page conflict box read (`vendor/events/[marketId]/page.tsx:1247-1308`): four states — declared
  (confirm box `:1274-1280`), blocked by event `:1281`, blocked by orders `:1285`, acknowledge box `:1289-1299`
  (owner wording 2026-08-28). One `conflictAck` state serves BOTH boxes (`:233, :382-383, :1316`) → removing the
  ack box must not break the declared vendor's confirm box.
- availability.ts read in full (547 lines): pure classifier; `needsSkipAcknowledgment` `:246`. No change needed
  there for ruling A; the route + page decide what to do with it.

### Select page (change 3 UI) — partial read `select/page.tsx:100-240`
- Already pre-ticks prior selections (`:138-145`) and asks before dropping a confirmed vendor (`:197-202`) → the
  re-submit trap is handled in the UI today. `canPare` is one page-level boolean (`:115, :134, :176, :220,
  :573-583`) → per-vendor flag needed from GET.

### Schema: `market_vendors.is_backup` snapshot :1338 · `organizer_selected_at` :1346 · `catering_requests.service_level` :645.

### Change 4 ("invite more") — read 2026-09-17
- Sentence lives on the select page's CONFIRMED view, inside the backup-bench box, shown only when standby <
  recommended (`select/page.tsx:378-382`); links to the organizer dashboard.
- The only tool: `handleRefreshMatches` (`OrganizerEventDetails.tsx:229-248`), button rendered ONLY inside the
  banner (`:479-529`) that appears after a save that changed a matching field, the event has a market, and
  invitations are not held (`:362-365`). Route read in full (`refresh-matches/route.ts`, 119 lines): organizer
  auth, approved event, not held → `autoMatchAndInvite`; invites only NEW qualifying vendors, idempotent (`:29-31,
  :99-105`). Without widened criteria a refresh usually finds nobody new → the sentence's "widening your
  criteria" is the real path; it just never says HOW.
- Options: (a) reword to give the steps (copy only); (b) always-visible "Find more vendors" button on the
  dashboard (new control; sends invitations = comms cost only for NEW vendors).

### Change 5 (FM wording) — OrganizerEventDetails.tsx read IN FULL (1369 lines) 2026-09-17
- `fieldLabel(field, vertical)` already takes the vertical (`:951`) and one label already uses `term()` (`:953`);
  `renderField` (`:1048`) does NOT receive the vertical → placeholders need it passed in.
- Unconditional food/meal wording an FM organizer sees: group label "Food Preferences" `:98`; "plan their menu
  and pricing" `:106`; labels `:954-965` (Dietary Requirements, Total Food Budget, Budget Per Meal, Expected
  Meal Count, Beverages/Dessert Already Provided?, Other Food at Venue, Other Food Vendors Present?);
  placeholders `:1279-1286, :1349` (BBQ, Mexican, Tacos, food court, catering); event type "Corporate Lunch /
  Team Meal" `:1001`; access-code line "company-covered meal" `:470`.
- Already vertical-aware: change-cost warning `:660-666`, request note `:864`, dialog `:933`.
- Asterisks `:555-557, :599-601, :697` have NO vertical condition (asterisk half withdrawn by owner anyway).
- Several labels are QUESTIONS that may not apply to FM at all (beverages/dessert provided, per-meal budget) —
  wording vs relevance = owner call; present a before/after table, don't guess.

## Checklist
- [x] select route (`api/events/[token]/select/route.ts`, 800 lines, read in full)
- [ ] select page UI (`app/[vertical]/events/[token]/select/page.tsx`)
- [ ] respond route + availability.ts (ruling A)
- [ ] public event page `app/[vertical]/events/[token]/page.tsx` + shop-data (item 6)
- [ ] organizer dashboard FM vs FT (item 1) + invite path (item 4)
- [ ] notification click navigation (item 5)

## select route — what is and is not locked after the first selection (READ, cited)
- Re-submission is SUPPORTED. POST accepts status 'approved' or 'ready' (`:337`); the atomic status update
  permits both (`:632-637`). T-80 logic: `previouslySelected` from `organizer_selected_at` (`:369-377`);
  `newlySelectedIds` get the selected notification (`:645-667`); first-confirmation-only kit email (`:675`).
- Selecting MORE vendors later works: newly selected get the stamp (`:432-438`, only if null), is_backup
  cleared (`:585-589`), waves resized (`:595-608`).
- Benching is IMPLICIT: every accepted vendor NOT in the submitted list gets `is_backup = true` (`:459-465`),
  blackouts lifted (`:471-474`), fee refund/release if they had paid (`:483-542`), standby offer if newly
  benched (`:549-577`). So "no option to bench" = not selecting IS benching; the UI evidently does not say so.
- Cap: `uniqueVendorIds.length > event.vendor_count` → 400 (`:346-348`). A later round must include the
  already-selected ids or they get demoted (not-in-list → backup + refund). ⚠ trap for a rolling UI.
- **The ONLY thing locked is the PARE**: GET `can_pare: vendors.every(v => !v.selected)` (`:279`); POST refuses
  any pare when `!isFirstConfirmation` (`:396-401`) with "Menus can only be trimmed on your first confirmation —
  pre-orders may already be open."
- Pare = the PAIR: evl host_status→declined + listing_markets delete (`:445-457`).
- Deselecting a previously selected vendor leaves `organizer_selected_at` set; is_backup=true makes the
  classifier say 'bench' (vendor-stage.ts:36-38 — is_backup outranks the stamp).

## Ruling B analysis (draft)
The P1 #2 concern is "no paring against LIVE ORDERS". The lock is implemented per EVENT (first confirmation)
but the risk is per VENDOR: a late responder who has never been selected has no items in the shop (shop shows
selected vendors only — VERIFY in shop-data), so no orders can exist against their items. Paring them is safe.
Candidate rule: pare allowed for any vendor receiving their FIRST selection stamp (no `organizer_selected_at`)
who is NOT an activated backup (P1 #5: `is_backup === true` at submit = promoted from the bench → full menu).
Late responder after round 1: is_backup null (VERIFY respond route does not set it) → pareable.

## Item 6 — public event page counts unselected vendors (READ)
- `app/[vertical]/events/[token]/page.tsx:59-67`: accepted vendors filtered by `is_backup !== true` ONLY. No
  `organizer_selected_at`. A late responder (never benched) or ANY accepted vendor before the first selection
  shows as attending. Count at `:232`.
- `lib/events/shop-data.ts:165-181`: same is_backup filter + a fee-settled filter (paid/covered) when the event
  charges a fee. Which of the two hid the third vendor on the order page is UNVERIFIED (fee unpaid is the
  likely one — they were never selected so never paid).
- Correct rule (decisions 2026-09-03 P2–P5, vendor-stage.ts): attending = classifier 'selected'. Fix = both
  surfaces select `organizer_selected_at` and keep only stamp-set + not-backup rows. SQL cart gate
  (get_available_pickup_dates, mig 234) is is_backup-based — untouched by an app-level fix; note as such.
- DEPENDENCY: who else writes organizer_selected_at (admin-assisted events)? → grep.

## Item 2 — ruling A (READ)
- `api/vendor/events/[marketId]/respond/route.ts:245-255`: non-flagged vendor, conflicts, nothing blocking →
  `skip_conflicts_acknowledged === true` lets them accept (then whole-day blackout, mig 238). Ruling A removes
  this branch: refuse with a message pointing at the profile declaration. `availability.ts:62`
  `needsSkipAcknowledgment` becomes unused on the accept path. ⚠ R3-4 owner rule 2026-08-27 is REVERSED on
  this point → decisions.md row + any unit test pinning the acknowledgment path is a DECISION POINT (owner
  approves the expectation change explicitly; never silently).

## Item 4 — "Invite more vendors" (READ)
- `select/page.tsx:380` links to `/${vertical}/event-manager/${event.id}/dashboard`. The dashboard page has
  no invite/rematch control at all (grep 'invite|Invite' on dashboard/page.tsx: 0 UI hits). Candidate entry:
  `api/events/[token]/refresh-matches` — who calls it? → grep.

## Item 5 — stale page after notification click (READ)
- `NotificationBell.tsx:312` and `DashboardNotifications.tsx:88`: `router.push(actionUrl)`. Same-URL push
  does not refetch server data. Fix shape: push then `router.refresh()` (or refresh when pathname equal).

## Ruling B — facts
- Late responder after round 1: respond route never writes is_backup (grep: 0 hits) → they arrive un-benched,
  un-stamped. Organizer re-submit INCLUDING them = selected (stamp + notification); EXCLUDING them = benched +
  standby offer. Both paths exist today. ONLY pare is locked (event-wide first-confirmation gate).
- Recommendation: move the pare gate from per-event to per-vendor: pareable iff the vendor has no stamp yet
  AND is not being promoted from the bench (is_backup true at submit → P1 #5 full menu). No live orders can
  exist against an unselected vendor's items (shop filters them out) → P1 #2's intent is preserved exactly.

## Final reads (2026-09-16)
- Stamp writers = TWO: select route `:431` and vendor cancel route `:549-553` (step-in promotion). Admin-managed
  events NEVER stamp (admin/events/[id]/route.ts sets status 'ready' at `:520-545`, no market_vendors stamp).
  → Item 6 fix must branch: self_service → attending = stamp && !backup (classifier 'selected'); managed →
  accepted && !backup (unchanged).
- Item 1 asterisks: OrganizerEventDetails `:556` (group-level) and `:600` (field-level) render with NO vertical
  condition; dashboard renders the same component for both verticals (`dashboard/page.tsx:489, :501`);
  invitation-gate.ts has no vertical branch. WHY the owner saw none on FM is UNVERIFIED — ask which FT screen
  was the comparison. Wording half is real: labels `:98` "Food Preferences", `:956-:1001` meal/food terms are
  unconditional.
- Ruling A UI: vendor event page already has a "blocked, button disabled, box says why" pattern (`:232`);
  `skip_conflicts_acknowledged` sent at `:382`. Fix = treat needsSkipAcknowledgment as blocked with
  profile-declaration guidance; route `:245-255` refuses regardless of the box. availability.ts + its tests
  untouched (test `:117-119` "must acknowledge the skip (blackout follows)" keeps passing as a classifier
  test; its title becomes a stale narrative → owner decides whether to retitle = test change gate).
- Item 4: the only organizer re-invite mechanism is "Refresh matches" inside OrganizerEventDetails
  (`:234`, `:506`) — shown only when Stage-2 details changed (`:488` banner). No standalone "invite more".
