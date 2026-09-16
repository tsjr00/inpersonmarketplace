# Events round research — OB-024 (2026-09-15/16)

Owner rulings received 2026-09-16:
- **A** = the vendor MUST hold the multi-location declaration (`profile_data.multiple_trucks`) to accept an
  event invitation that conflicts; the acknowledgment box may NOT stand in. "They can leave the page and go
  change their profile but we can't just let them check a box in the moment."
- **B** = owner undecided; wants the implications. Either lock + TELL the organizer, or allow + handle the mess.

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
