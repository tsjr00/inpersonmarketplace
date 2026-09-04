# Build Plans — Owner Testing Thoughts 2026-09-03

Six items from the owner's event-testing pass. Backlog entry: `backlog.md` → "🎪 OWNER TESTING THOUGHTS — 2026-09-03".
**Status: PLANS ONLY — nothing approved to build.** All code anchors below read 2026-09-03.

---

## Side note first: how to manufacture a schedule conflict for testing

The availability check (`lib/events/availability.ts`, wired into the accept route) fires on:
1. An **active `vendor_market_schedules` row** whose day-of-week matches the event date, OR
2. A **paid `park_spot_bookings` row** on the exact event date.

The 10-day intake floor pushes every event ≥10 days out, so the reliable recipe is source 1:
- As the test truck: any park → **Set Schedule** → pick a weekday (e.g. Tuesday).
- Create the event on a **Tuesday** ≥10 days out.
- Invite + accept as that truck → the amber conflict box (R3-4 A) should gate the Accept.

A paid booking placed on the event date also works (source 2), but bookings 10+ days out are the unusual path. Note: the DB trigger `check_vendor_schedule_conflict` is a separate, older mechanism — the R3-4 box is the one under test.

---

## P4 — "Vendors confirmed" → accepted-language (Vendor Event Page) — **XS**

**Defect:** `[vertical]/vendor/events/[marketId]/page.tsx:773` renders `Vendors confirmed: {accepted_count} of {vendor_count}`, and `:534` says "(N of M confirmed so far)". Both use "confirmed" for mere acceptance — while `:146-148` correctly use "Confirmed & paid" / "Confirmed · free event" for the SELECTED stage. Same word, two stages. Owner: an undecided vendor reading "2 of 4 confirmed" may write the event off.

**Fix:** align with the unified status vocabulary shipped 2026-08-29 (`4c8a42e8`: *said yes / selected / attending*):
- `:773` label → `Said yes so far`, value → `{accepted_count} of {vendor_count} invited`
- `:534` → `(… {accepted_count} of {vendor_count} have said yes so far)`
- `:146-148` untouched — those are genuinely the confirmed stage.
- Sweep the rest of the page for any other "confirm" that means "accepted" (one unfiltered read of the file at build time, per verification-discipline Rule 7).

**Files:** `page.tsx` only. No API/migration. **Pairs naturally with P5** (same root cause) and with the still-open ST-20d status-copy-drift backlog item.

---

## P5 — Locations-page event pill accuracy — **S**

**Defect:** `components/vendor/markets/EventMarketsSection.tsx:242`:
`status === 'accepted' || market.hasAttendance ? 'Attending'` — an accepted-but-never-selected truck reads "Attending". The T-68 comment (`:229-238`) shows the pill was fixed FROM a schedule fact TO the invitation response, but it conflated accepted with selected. Vendors planning their week trust this pill.

**Data gap:** the pill only receives `responseStatus`. `api/vendor/markets/route.ts` builds `eventResponseByMarket` (`:218-223`) as `market_id → response_status` from a `market_vendors` query that does not select `is_backup` / `organizer_selected_at`.

**Fix:**
1. **API** (`api/vendor/markets/route.ts`): extend the `market_vendors` select with `is_backup, organizer_selected_at, standby_opted_in_at`; change the map value to an object; emit `responseStatus` (unchanged, back-compat) plus `isBackup`, `organizerSelectedAt`, `standbyOptedInAt` on event markets. **Schema gate at build time** before touching the select (Rule K precedent: every new column reference gets the snapshot read in the same turn).
2. **Shared stage classifier** — the Vendor Event Page already computes this ladder in `eventStage()` (`vendor/events/[marketId]/page.tsx:~146-148, :562` region), including the pre-mig-228 fallback (ready-and-not-backup ⇒ selected). **Extract it to `lib/events/vendor-stage.ts`** and consume it from BOTH the page and the pill — one classifier, two surfaces, can't drift (paired-surface principle; consider a `@paired-rule` tag or a flow-integrity guard asserting both import it).
3. **Pill ladder** (`EventMarketsSection.tsx:239-249`):
   - selected (organizerSelectedAt, not backup) → `Attending` (green)
   - isBackup → `On the bench` (amber)
   - accepted, not selected → `Said yes — awaiting selection` (blue/info)
   - declined → `Declined` · invited → `Invited` · null → `Not attending` (unchanged)
   - `hasAttendance` fallback stays only for non-invitation public events.

**Files:** `api/vendor/markets/route.ts`, `EventMarketsSection.tsx`, new `lib/events/vendor-stage.ts`, `vendor/events/[marketId]/page.tsx` (swap to the shared helper), `components/vendor/markets/types.ts` (Market type). No migration.

---

## P3 — Organizer dashboard: per-truck roster — **S/M**

**Gap (verified):** `event-manager/[id]/dashboard/page.tsx` shows only the EVENT-level status line (`STATUS_LABELS` `:51-61`, rendered `:205`) and an accepted **count** (`:156`). No per-truck list anywhere on the organizer dashboard; the select page shows only accepted vendors. Owner's test event (3 invited / 1 declined / 2 accepted / 1 selected / 1 standby) is already hard to track; 10-15 trucks would be hopeless.

**Build:** a "Your trucks" roster card on the organizer dashboard (server component — the page already runs server-side with the event + market_id in hand):
- Query: `market_vendors` where `market_id = event.market_id`, selecting `response_status, is_backup, organizer_selected_at, standby_opted_in_at, invited_at` + vendor name join. **Reuse `lib/events/vendor-stage.ts` from P5** for the stage label so organizer/vendor/pill vocabulary all match: Invited → Said yes → Selected → On the bench → Standby → Declined → Cancelled.
- Group by stage (selected first, then said-yes, standby, invited, declined) with counts in the group headers; each row = truck name + stage badge. Link the card to the select page for actions — the roster is read-only.

**⚠ Decision needed before build — name disclosure:** the select page today exposes names of ACCEPTED vendors only. Showing names of invited-but-unresponded (and declined) trucks to the organizer is new disclosure. Options:
- (a) full names at every stage (owner's phrasing implies this is what they want), or
- (b) names from acceptance onward; invited/declined rows anonymized ("Truck · invited 3d ago") with counts.
No coded rule found blocking (a) — the `organizer-identity` paired rule protects the ORGANIZER from vendors, not the reverse — but it's a product call. **UNVERIFIED** whether any matching surface deliberately withholds candidate names from organizers; check `api/events/[token]/select` GET + matching notes at build time.

**Files:** `event-manager/[id]/dashboard/page.tsx` (+ small roster component). No migration.

---

## P2 — Admin events page: selected / backup / standby chips — **S**

**Gap (verified):** the admin events API's vendor query (`api/admin/events/route.ts:200`) selects only `vendor_profile_id, response_status, response_notes, invited_at` — no selection/bench fields — and the page (`admin/events/page.tsx`) renders per-vendor chips from `responseBadge[mv.response_status]` (`:1536-1558`) with zero references to backup/selected anywhere in the file.

**Build:**
1. API `:200` select += `is_backup, organizer_selected_at, standby_opted_in_at`; pass through the map at `:227-233`. (Schema gate at build time.)
2. Page: extend the vendor type (`:136`) + add chips beside the response badge at `:1536`: `Selected` (organizer_selected_at, not backup), `Bench` (is_backup), `Standby` (standby_opted_in_at). Reuse `vendor-stage.ts` labels for consistency.
3. Fee state (paid/covered per vendor) deliberately OUT of scope — it needs an `event_vendor_fee_payments` join and the admin "Vendor Fee Payments" card already shows it per event.

**Sequencing:** `admin/events/page.tsx` is the exact page **phase 6 (events pipeline board)** rebuilds. If phase 6 is next anyway, fold this in as a phase-6 requirement (the board design should carry per-truck stage). If phase 6 waits, ship standalone — it's additive and small. Owner picks.

---

## P6 — Vendor week-at-a-glance schedule on the locations page — **M**

**Owner:** trucks constantly ask "where am I on what day / is it a park, private pickup, or event" and have no self-view — each location must be opened individually. Wants the public-profile schedule reused at the top of `/vendor/markets`, read-only, next 7-14 days. Rename the dashboard card "Locations & Schedule".

**Good news (verified):** the public profile's grid is a shared component — `components/vendor/PickupScheduleGrid.tsx` — and it already handles all three location types including events with date ranges (`market_type` incl. `'event'`, `event_start_date/end_date`, DOW `schedules[]`, `:7-17`). The profile page feeds it private-pickup schedules from `market_schedules` and traditional/park schedules via `vendor_market_schedules` (`profile/page.tsx:345-412`).

**Build (v1 — reuse as sanctioned):**
1. `vendor/markets/page.tsx`: the page's existing data (from `api/vendor/markets`, which already returns markets + schedules + `vendorTimesBySchedule` + event markets) is transformed into `PickupLocation[]` and rendered in a `PickupScheduleGrid` at the top of the page. If a needed field isn't in the API response, extend the API rather than adding a second fetch.
2. **Which events appear:** only events where the truck is actually going — selected (or accepted at a no-selection event) per `vendor-stage.ts`; a said-yes-awaiting-selection event either omitted or shown with its stage label (ties to P5 — decide with the owner, recommend showing with label so the "which events am I waiting on" question is also answered).
3. Dashboard card rename → "Locations & Schedule" (`vendor/dashboard/page.tsx` tile + `en.ts`/`es.ts` locale keys — the card title is likely localized; verify key at build).

**Known v1 inaccuracies to disclose, not solve:**
- **Park bookings** appear correctly — the paid-booking webhook auto-creates `vendor_market_schedules` rows (`webhooks.ts:1948-1985`), so they render as recurring DOW entries.
- **Event-skipped days do NOT show as skipped**: a DOW grid can't express `vendor_date_blackouts` (the day a truck skips a park to attend an event still renders as a park day). **v2 (separate, later):** a date-based 7-14 day strip that unions schedules + park bookings + events, minus blackouts — essentially the vendor's own availability calendar. Do NOT attempt in v1; it's a different data model than the grid.

**Files:** `vendor/markets/page.tsx`, possibly `api/vendor/markets/route.ts`, `vendor/dashboard/page.tsx`, locale files. No migration.

---

## P1 — Host pare-down of proposed menus — **DESIGN ONLY** (owner: "may just be design work now")

**Current mechanics:** a truck proposes its event menu by selecting listings → `event_vendor_listings` rows (market_id, vendor_profile_id, listing_id — see admin route `:205-208`). The shop shows attending vendors' selected listings. The host has **no item-level control**; the sell gate (mig 234) is vendor-level ("must attend to sell"), not item-level.

**Proposed mechanism (for discussion):** add a status to the proposal row —
`event_vendor_listings.host_status: 'approved' (default) | 'declined'` (one migration, additive, backfill-free since default covers existing rows).
- Organizer UI: on the select page (or event dashboard), each truck's proposed items get keep/decline toggles.
- Shop + prep surfaces filter `host_status = 'approved'`. **⚠ Paired-surface alert:** item visibility must change in every reader of `event_vendor_listings` together — `lib/events/shop-data.ts`, the event shop page, the admin menu display (`admin/events/route.ts:205`), prep sheets. Inventory the readers FIRST (grep `event_vendor_listings`) and register the pair.

**Design decisions for the owner (the actual "design work now"):**
1. **Which events get it?** Always-on for every organizer · opt-in · or admin-assisted/host-paid only (owner leaned this way — hosts paying for the event have the strongest claim to menu control).
2. **Timing guard:** paring an item with live pre-orders must be blocked (or force the refund path) — never silently strand paid orders. Same class as "they must attend to sell."
3. **Vendor consent:** the menu is part of what the truck agreed to at acceptance (mirrors the retroactive-fee design note, backlog 2026-08-14). Does a host pare-down trigger a notification + penalty-free decline window for the truck?
4. **Floor:** can a host pare to zero items (effectively benching the truck without the bench machinery)? Recommend a minimum of 1 or routing "zero items" through deselection instead.
5. Interaction with the invitation gate / matching: none found — matching is vendor-level. **UNVERIFIED** until the reader inventory runs.

**Recommendation:** hold for the admin-assisted / host-paid events design session (which also carries the deposit/fee-tier questions the owner is already thinking about) — the answers to #1 and #3 live there.

---

## Suggested build order + batching

| Batch | Items | Why together |
|---|---|---|
| 1 | **P4 + P5** | One root cause (accepted ≠ selected), one shared classifier (`vendor-stage.ts`), all copy/label — small, safe, immediately improves the owner's current testing |
| 2 | **P3** | Consumes the P5 classifier + API pattern; needs the name-disclosure decision first |
| 3 | **P2** | Standalone if phase 6 waits; else folded into phase 6 |
| 4 | **P6** | Independent; medium |
| — | **P1** | Design session with owner (with admin-assisted events) |

Each batch: one feature per push, traced end-to-end (2026-08-29 rule).
