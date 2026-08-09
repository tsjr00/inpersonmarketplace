# Event dataflow deep dive — organizer / admin / vendor

Started 2026-08-08. Owner's framing: *"there has been persistent problems with info flowing among the 3 people involved in event setup (organizer, admin, vendors) — it has never been consistent and is why we have not pursued events yet. I have a good idea how data should flow but not what is stopping it."*

Method: 4 sweeps. (1) every write to event facts, (2) every channel out, (3) per-role read surfaces, (4) the joins — a fact-ownership matrix. Findings written as each sweep completes; this file is a recovery point, not a deliverable — the owner works through it in chat.

**Working discipline for this file:** every claim carries `path:line`. Absence claims ("nothing does X") require an unfiltered read of the unit, never a grep.

---

## SWEEP 1 — every write to event facts ✅ COMPLETE

Enumerated by grep over `.from('<table>')` + 3 lines, across all of `src`, for `catering_requests`, `markets`, `market_schedules`, `market_vendors`. Not from memory.

### 1.1 The two copies — what approval duplicates

`approveEventRequest` (`lib/events/event-actions.ts:88-175`) is the fork in the road. It reads a `catering_requests` row and writes two new rows:

**→ `markets`** (`:119-142`) — `name` (from `company_name` + a per-vertical suffix), `address`, `city`, `state`, `zip`, `event_start_date` (from `event_date`), `event_end_date`, `cutoff_hours` (clamped 12–168 at `:132`), `event_allow_day_of_orders`, `headcount`, plus `market_type='event'`, `is_private=true`, `catering_request_id`.

**→ `market_schedules`** (`:153-159`) — `day_of_week` **derived** from `event_date` (`:150-151`, `getUTCDay`), `start_time` from `event_start_time` (default `'11:00:00'`), `end_time` from `event_end_time` (default `'14:00:00'`), `active: true`.

From that moment there are **two copies of every one of those facts and no rule about which wins.**

### 1.2 Who writes `catering_requests` (the organizer's copy)

| Writer | What it writes |
|---|---|
| `api/event-requests/route.ts` | insert (intake); `approvalUpdate` on auto-approve; `auto_invite_sent_at` |
| `api/admin/events/route.ts` | insert (admin-created) + update |
| `api/admin/events/[id]/route.ts` | `.update(updates)` — status, admin_notes, address, city, state, zip, event_date, contact_email |
| `api/admin/events/[id]/repeat/route.ts` | insert (clone) |
| `api/events/[token]/details/route.ts` | `.update(updateData)` — the organizer editor, 31 allowed fields (`:28-75`) |
| `api/events/[token]/select/route.ts` | `status:'ready'` + `vendor_preferences.organizer_contact`; `selection_email_sent_at` |
| `api/events/[token]/cancel/route.ts` | `status:'cancelled'` |
| `api/vendor/events/[marketId]/respond/route.ts` | **`status:'ready'`** (`:424`) — a VENDOR action moves the ORGANIZER's event status |
| `api/cron/expire-orders/route.ts` | `address_reminder_sent_at`; `status` → ready / active / review / completed |
| `[vertical]/dashboard/page.tsx` + `event-manager/page.tsx` | `organizer_user_id` claim-on-first-visit |

### 1.3 Who writes `market_schedules` (the copy buyers actually read) — 🚨 THE FINDING

Grep for every `market_schedules` write in `src`, then read of each hit. **Exactly one writer lives in the events code path: the INSERT at `lib/events/event-actions.ts:153`.** There is no update, anywhere, on any event path.

Every other writer is a non-event surface: `api/admin/markets/*`, `api/markets/[id]/schedules/*`, `api/market-manager/[marketId]/schedules`, `api/vendor/markets/*`, `lib/stripe/webhooks.ts`.

So the schedule is written **once, at approval, and never again**. `event_start_time` / `event_end_time` / `event_end_date` remain freely editable by the organizer at any status (`details/route.ts:52-54` in `ALLOWED_FIELDS`, absent from `PRE_APPROVAL_ONLY_FIELDS` at `:111-125`). This is A-AUDIT part 3, now confirmed by enumeration rather than by reading one file.

### 1.4 The guard list, and why it is the smell not the fix

`PRE_APPROVAL_ONLY_FIELDS` (`details/route.ts:111-125`) = `city, state, zip, event_date, headcount, company_name`. Server-enforced at `:258-268` when `event.market_id` is set.

Six fields frozen for one identical reason: approval copied them. The frozen set does **not** include `address`, `event_end_date`, `event_start_time`, `event_end_time` — which are copied too. So the boundary is inconsistent: **four copied fields are frozen post-approval, four are freely editable and silently desync.**

### 1.5 Cross-role writes — actions that change someone else's record

- A **vendor** accepting can flip the **organizer's** event `status` to `ready` (`respond/route.ts:420-427`), atomically gated so only the first accept sends the email.
- A vendor accepting writes `event_vendor_listings` **and** upserts `listing_markets` (`respond/route.ts:344-351`) — the latter is what cart/checkout validates against.
- The **organizer** selecting vendors sets `is_backup: true` on non-selected accepted vendors (`select/route.ts:239-243`) and recalcs wave capacity.
- **Admin** un-cancelling sets `markets.active = true` (`admin/events/[id]/route.ts`) — the only place that happens.

---

## SWEEP 2 — every channel out (IN PROGRESS)

### 2.1 Vendor invitation — what a vendor is actually told

`autoMatchAndInvite` (`event-actions.ts:372-390`), template `catering_vendor_invited`:
- `companyName: 'Private Event'` — organizer identity **deliberately withheld** (`:380-381`)
- `headcount`, `headcountPerVendor` (`:370`, headcount ÷ vendor_count)
- `eventDate` — long-form formatted (`:367-369`)
- `eventAddress: \`${city}, ${state}\`` (`:385`) — **city and state only. No street address.**
- `reason: timeRange` — the field is repurposed to carry `HH:MM to HH:MM` (`:375-377`, `:386`)
- `marketId`

So at invitation a vendor knows a date, a time range, a city, and a headcount. Not where.

### 2.2 Vendor selection notice — carries LESS than the invitation

`select/route.ts:298-306` reuses the **same template** with `companyName: 'Event Confirmed'` and passes `headcount`, `eventDate` (raw ISO, unformatted — inconsistent with 2.1), `eventAddress` (city/state), `marketId`. **No `headcountPerVendor`, no time range.**

### 2.3 Non-selected vendors are never told

Unfiltered read of `select/route.ts:225-261`: the `notSelectedIds` branch performs `.update({ is_backup: true })` and a `recalculate_wave_capacity` RPC. There is no `sendNotification` and no email in that block. A vendor who accepted and was not chosen is silently marked a backup.

### 2.4 Admin IS notified on every vendor response — but the recipient query is loose

`respond/route.ts:373-393` sends `catering_vendor_responded` to admins found by:
```
.from('user_profiles').select('user_id').in('role', ['admin','platform_admin']).is('deleted_at', null).limit(5)
```
Two problems visible in that query: it is **not scoped to the event's vertical** (an FM admin is notified about FT events), and it is **truncated at 5** with no ordering — so which admins get told is arbitrary. It also hand-rolls the role check rather than using the shared helpers, the same shape as backlog item D.

### 2.5 Organizer emails — two, both Resend-direct, not `sendNotification`

- **Results email** ("N vendors are interested") — fired from the **vendor's** respond route (`respond/route.ts:446-472`) when the accept threshold is met, gated atomically so it sends once.
- **Confirmation + marketing kit** (QR code, email/social/signage copy) — `select/route.ts:355-426`, then stamps `selection_email_sent_at` (`:429-432`) to stop the admin ready-transition sending a duplicate.

Both bypass `sendNotification`, so neither produces an in-app notification record.

### 2.6 The full channel inventory

Enumerated by grep for `sendNotification(` and `emails.send(` across `app/api/events`, `app/api/event-requests`, `app/api/admin/events`, `app/api/vendor/events`, `lib/events`, plus the events phases of the cron.

**In-app (`sendNotification`) — 17 call sites:**

| Trigger | → Recipient | Type |
|---|---|---|
| auto-match (`event-actions.ts:379`) | vendor | `catering_vendor_invited` |
| organizer selects (`select/route.ts:298`) | selected vendor | `catering_vendor_invited` |
| admin manual invite (`admin/events/[id]/invite/route.ts:173`) | vendor | — |
| vendor responds (`respond/route.ts:382`) | admin ×≤5 | `catering_vendor_responded` |
| vendor cancels (`vendor/events/[marketId]/cancel:312`) | admin ×≤5 | `catering_vendor_responded` |
| vendor cancels (`:369`) | organizer (if account) | `catering_vendor_responded` |
| vendor cancels (`:404`) | **backup vendor** | `catering_vendor_invited` |
| admin confirms (`admin/events/[id]/route.ts:390`) | organizer | `event_confirmed` |
| event cancelled (`events/[token]/cancel:121`, `admin/…:590`) | vendors | `event_cancelled_vendor` |
| event cancelled (`:155`, `admin/…:479`) | buyers | `order_cancelled_by_vendor` |
| cron Phase 11 (`expire-orders:2372`) | accepted vendors | `event_prep_reminder` |
| cron Phase 13 (`:2621`) | admins | `event_vendor_gap_alert` |
| completion (`complete-event.ts:65,199`) | vendors | unfulfilled / settlement |

**Email (Resend direct, no in-app record) — 10 call sites:** intake confirmation ×2 (`event-requests:453,554`), organizer results (`respond:446` **and** cron `:2507` — the same email from two places), selection confirmation + marketing kit (`select:355`), event cancelled (`events/[token]/cancel:266`), admin organizer-link + confirm (`admin/events/[id]:680,737`), vendor cancellation notice to organizer (`vendor/…/cancel:339`), vendor→organizer message (`vendor/…/message:123`), settlement (`complete-event:235`).

### 2.7 🚨 The backup-vendor promotion sends an EMPTY event

`vendor/events/[marketId]/cancel/route.ts:403-412` — when a vendor cancels, the top backup is auto-promoted to `invited` and notified with:
```
headcount: 0,
eventAddress: '',
```
Literal zero and literal empty string. The one vendor who most needs the details — brought in late, replacing someone — is told the least. And they must re-confirm (`response_status: 'invited'`, `:395`) on the strength of that.

### 2.8 The organizer-identity privacy rule is not applied consistently

At invitation the company name is withheld on purpose: `companyName: 'Private Event'` with the comment *"organizer identity protected"* (`event-actions.ts:380-381`). But cron Phase 11's prep reminder passes `marketName: event.company_name` (`expire-orders:2373`) — the real name, to the same vendors. Either the privacy rule is wrong or the reminder is; today it is both.

### 2.9 Admin recipient lists are ad-hoc and differ per site

Three different queries for "the admins":
- `respond:373-378` — `.in('role',[...]).is('deleted_at',null).limit(5)`
- `vendor/…/cancel:303-308` — same, also `limit(5)`
- cron Phase 13 `:2613-2616` — `.or('role.eq.admin,role.eq.platform_admin')`, **no `deleted_at` filter, no limit**

None is scoped to the event's vertical, so FM admins receive FT event notifications and vice versa. Two truncate at an arbitrary 5 with no ordering. All hand-roll the role test instead of the shared helpers (same shape as backlog item D).

---

## SWEEP 3 — per-role read surfaces: WHICH COPY does each role read? ✅

This is the sweep that explains the owner's "it has never been consistent."

| Role | Surface | Reads event facts from |
|---|---|---|
| **Organizer** | `event-manager/[id]/dashboard/page.tsx:104` | `catering_requests` (+ `market_vendors:147` for counts) |
| **Admin** | `api/admin/events/route.ts:70` `select('*')` | `catering_requests` **only** |
| **Vendor** | `api/vendor/events/[marketId]/route.ts:85-147` | 🚨 **BOTH — split per field** |
| **Buyer (display)** | `lib/events/shop-data.ts:126-129` | `catering_requests` |
| **Buyer (booking)** | `lib/events/shop-data.ts:146-153` | 🚨 **`market_schedules`** — this is the `schedule_id` the cart/order attaches |

### 3.1 🚨 The vendor's page reads two different copies on one screen

`api/vendor/events/[marketId]/route.ts` — unfiltered read of `:84-190`:

- From **`markets`** (`:85-91`, surfaced at `:165-174`): `event_date` (from `event_start_date`), `event_end_date`, `address`, `city`, `state`, `zip`, `headcount`
- From **`catering_requests`** (`:119-147`, surfaced at `:167-168`, `:177-189`): `event_start_time`, `event_end_time`, `setup_instructions`, `cuisine_preferences`, `dietary_notes`, `vendor_count`, `event_type`, `payment_model`, `vendor_stay_policy`, themed/children/ticketed flags

So on the vendor's single event screen the **date comes from the frozen copy and the time comes from the live record.** Organizer moves the start time → the vendor sees the new time immediately and the old everything-else. Organizer's address is corrected → the vendor never sees it.

The privacy model here is deliberate and worth preserving: full address and setup instructions are withheld until `response_status === 'accepted'` (`:159`, `:171`, `:180`), and `company_name` is never sent (`:175-176`).

### 3.2 🚨 Admin cannot see the desync at all

`api/admin/events/route.ts:70-71` reads `catering_requests.select('*')` and never reads `markets` or `market_schedules` for display. The admin console shows the **always-correct** copy. The person whose job is to fix a broken event is looking at the one view where nothing is ever broken.

### 3.3 🚨 The buyer is SHOWN one time and BOOKED into another

`shop-data.ts` fetches display facts from `catering_requests` (`:126-129`) and the schedule — `id`, `start_time`, `end_time`, `day_of_week` — from `market_schedules` (`:146-153`), returning it as `schedule` (`:325-328`) for the cart's `schedule_id` + `pickup_date`.

So after a post-approval time change the attendee page **displays the new hours** and **writes an order against the old window**. Not merely stale — internally contradictory on the same page.

### 3.4 🚨 The admin address repair (shipped today) never reaches the vendor

`api/admin/events/[id]/route.ts:127-136` writes `updates.address` with no status guard, and `updates` is applied to `catering_requests` only. Unfiltered read of the route's markets access: the **sole** `from('markets')` write is `.update({ active: true })` on un-cancel (`:216-219`).

So an admin correcting the address on an approved event fixes the organizer's view, the admin's own view and the buyer's display — and **not** the vendor's page, which reads `markets.address`. That gap shipped in today's commit.

---

## SWEEP 4 — the fact-ownership matrix ✅

`req` = `catering_requests` · `mkt` = `markets` · `sch` = `market_schedules`

| Fact | Organizer edit | Admin edit | Organizer sees | Admin sees | Vendor sees | Buyer sees | Propagates? |
|---|---|---|---|---|---|---|---|
| `address` | ✅ any status | ✅ any status | req | req | **mkt** | req | ❌ |
| `city` / `state` / `zip` | pre-approval only | ✅ any status | req | req | **mkt** | req | ❌ |
| `event_date` | pre-approval only | ✅ any status | req | req | **mkt** | req | ❌ (+ `sch.day_of_week` never recomputed) |
| `event_end_date` | ✅ any status | ❌ | req | req | **mkt** | req | ❌ |
| `event_start_time` / `end_time` | ✅ any status | ❌ | req | req | req | req (display) | ❌ → **`sch` drives the booking** |
| `headcount` | pre-approval only | ❌ | req | req | **mkt** | — | ❌ |
| `company_name` | pre-approval only | ❌ | req | req | withheld | req | ❌ (it is the market NAME) |
| `cutoff_hours`, `event_allow_day_of_orders` | ❌ nobody | ❌ nobody | — | — | — | mkt | frozen at approval |

**Reading the matrix:** there is no consistent owner. Four copied fields are frozen post-approval, four are freely editable and desync. Two roles read the request, one reads the market, one reads both, and the buyer reads the request for display but the schedule for booking. **No rule is being violated — there is no rule.**

### 4.1 The trigger precedent is already in the schema

`supabase/migrations/applied/20260412_121_event_data_integrity.sql:61-63` — `trg_cleanup_cancelled_event`, `AFTER UPDATE OF status ON catering_requests`. The house already does propagation-by-trigger on this exact table. A sync trigger is an extension of an established pattern, not a new one.

---

## SWEEP 5 — the vision, and the plumbing that doesn't reach it (owner briefing 2026-08-08)

The owner supplied the product intent mid-session. Recorded here because sweeps 1–4 measured the code against itself; this sweep measures it against what it was **for**.

### 5.0 The intent, condensed

- **Two categories.** *Self-service*: no admin. Organizer self-describes, the engine matches against vendor characteristics captured at event verification (truck length, generator, odors…), and the organizer is hooked by an immediate no-commitment result — *"based upon your criteria we've already matched you with two trucks"* — then laddered up: email → account → richer data → tighter matching. Competitive frame is the Facebook-group scramble. Monetized at 10% of transaction volume; this is the volume bet. *Admin-assisted*: same engine, admin watches the panel and adds human dialogue; organizer still has a dashboard and still approves menus. Not monetized yet.
- **Focus is self-service** — harder, because no admin catches anything.
- **Backups are meant to be a differentiator**, against the industry problem of trucks double-booking and no-showing. Enforcement + a deliberate bench. Workflows, timing, compensation: open business decisions.

### 5.1 🚨 THE CONVERSION NUMBER IS NOT A MATCH COUNT

The hook the whole self-service funnel rests on is built, prominent, and **wrong**.

`api/event-requests/route.ts:400-408` computes what the post-submit screen displays:
```
.from('vendor_profiles').select('id',{count:'exact',head:true})
  .eq('vertical_id', verticalId).eq('status','approved')
  .eq('event_approved', true).is('deleted_at', null)
```
That is **every event-approved vendor in the vertical**. No cuisine, no capacity, no runtime, no geography, no score — none of the criteria the organizer just typed.

`EventRequestForm.tsx:495-498` renders it as the largest element on the success screen (`2xl`, bold, accent): **"{N} qualified food trucks found in your area."** Neither clause is true: not qualified (unfiltered), not in your area (no location predicate anywhere in the query).

And the real number already exists. `autoMatchAndInvite` ran ~40 lines earlier and returned `{invited, matched, skipped}` — scored, filtered, deal-breakered, capped. It is written to a `console.log` (`:363`) and discarded.

### 5.2 🚨 The self-service branch is told to wait; the full-service branch gets the hook

Same route, `:412-421`. Self-service message: *"We're notifying qualified food trucks now. You'll hear back within 48 hours."* Full-service message: *"We found N qualified food trucks in your area."*

The instant-gratification hook is worded for the branch that has an admin, and the 48-hour wait is given to the branch whose entire thesis is beating a Facebook group on speed. (The `match_count` field is returned to both, so the big number renders on both screens — but only the full-service *copy* leans on it.)

### 5.3 🚨 The backup bench does not exist by design — only by accident

Every write of `is_backup` in the codebase: **one** site, `api/events/[token]/select/route.ts:241` — non-selected *accepted* vendors. Reads: vendor dashboard (`vendor/dashboard/page.tsx:687`), wave capacity exclusion (`wave-generation.ts:100`), auto-escalation on cancel (`vendor/…/cancel:378-412`).

Consequence: backups exist **only** when more vendors accepted than the organizer chose. If exactly `vendor_count` accept, the bench is empty and the auto-escalation on cancel finds nothing. Nothing anywhere deliberately recruits backups, flags a vendor as bench-standby, or asks a vendor to hold a date.

Combined with 2.7 — the one backup who *does* get promoted is notified with `headcount: 0` and `eventAddress: ''` — the flagship differentiator is, today: an accidental bench, notified with a blank event.

### 5.4 ✅ Commitment enforcement is further along than expected

`vendor/…/cancel:415-425` writes a `late_event_cancellation` finding (severity `high`) to `vendor_quality_findings` inside a 72-hour window. That table **is** consumed — `api/admin/quality-checks/route.ts` and a vendor-facing `api/vendor/quality-findings/route.ts`. So the record and its visibility exist; what's missing is consequence, which is policy, not plumbing.

### 5.5 What the vision SETTLES from sweep 4

- **Fact ownership** — self-service has no admin in the loop, so the organizer must own their facts and the platform must propagate. Admin-assisted is the same data with a different hand on the keyboard. One rule serves both: **request = source of truth, market + schedule = derived.** This was open question 1; the vision closes it.
- **Admin in the loop on changes** — in self-service there is nobody to be in the loop, so notification cannot depend on admin. This was open question 3; it closes as "the system must be self-sufficient."
- **Why the fork is worst here** — every desync is silent, and self-service is precisely the category with no human to notice. The design is most dangerous exactly where the business bet is.

Still genuinely open: **what a date/time change does to orders already placed**, and the backup policy set (recruit how many, told what, when, compensated how).

---

## ✅ BUILT 2026-08-08 (uncommitted at time of writing)

**Item 1 — the honest match count.** `api/event-requests/route.ts` now returns `inviteResult.matched` (scored, filtered, capped) instead of a roster count; the roster query is deleted. `match_count` is `null` when matching never ran and the client no longer coerces null→0. `EventRequestForm.tsx` renders three distinct states: matched N / matched none / matching didn't run.

**Item 2 — schedule sync, NOT a freeze.** `api/events/[token]/details/route.ts` writes changed times through to `market_schedules` for the event's market, and returns a 500 with organizer-readable copy if that write fails rather than swallowing it. Times may be changed but not cleared once a market exists (`ERR_EVENT_DETAIL_014`) because the schedule columns are NOT NULL.

> **Why not the freeze.** Self-service auto-approves at SUBMIT, so a market exists immediately and a post-approval freeze would lock the organizer's times from the click, with no admin able to correct them either — the address deadlock in a different hat.

**Consequence warnings.** `OrganizerEventDetails.tsx` shows an amber warning on the timing group, only once a market exists. `events/[token]/select/page.tsx` gains an acknowledgment bullet at the moment the event goes live — the organizer-side symmetry of the existing vendor-penalty line.

**Guards.** 4 new flow-integrity tests: the sync exists and is scoped to the event's market, a failed sync is not swallowed, times can't be cleared, times are NOT in the freeze list, and the intake number is the scored count with null≠0 preserved.

Gates: tsc 0 · lint 0 errors · **1841 tests pass**.

⚠ One of those tests failed on first run and the TEST was wrong, not the code: a 200-char window after `PRE_APPROVAL_ONLY_FIELDS` overran into `MATCHING_AFFECTING_FIELDS`, which legitimately lists both time fields. Fixed by matching the array literal instead of a character window. The expectation did not move.

---

## SWEEP 6 — owner decisions, 2026-08-08

### 6.1 Date/time change vs. existing orders — DECIDED

Owner: *"Not necessarily, if the attendee still plans on going even though the date has changed then we can preserve the order, we just need to get confirmation that they still want to keep the order because they still plan on going."*

So: **re-confirmation, not cancellation.** A date/time change moves the order's window and asks the buyer to affirm. Design consequences:
- orders need a "pending re-confirmation" state distinct from confirmed
- the vendor's prep count must distinguish confirmed from unconfirmed, or they cook for people who aren't coming
- **still open:** what silence means at the cutoff (auto-refund vs. hold the order)

### 6.2 Backup bench sizing — DIRECTIONAL

Owner: a **percentage** of the trucks requested, or derived from headcount. Exact % TBD.

### 6.3 What a standby vendor is told — DECIDED

Owner: *"they were not chosen as one of the primary vendors but if they want to be listed as a backup in case of a cancellation we will notify them in the event of a cancellation, they will need a certain lead time."* So standby is **opt-in after non-selection**, with a declared lead-time requirement. That is a real state; today `is_backup` is applied silently with no notification and no consent (`select/route.ts:241`).

### 6.4 Compensation & obligation — OPEN, owner wants both

Owner: *"i would like there to be both compensation and obligation but we need to get buy in from the organizer… short answer is i don't think we can obligate them if they are not compensated."* Floated: organizer pays $X for ready-reserve; or the backup attends in **walk-up-only** capacity, without competing much with the chosen trucks. Owner invited a recommendation.

### 6.5 Intake copy — DIRECTION SET

Owner wants a real number plus language implying matching continues: *"We found 2 immediate matches for your event characteristics, and we are working on others that may be a great match as well — log in to your dashboard to see the progress on matching."*

⚠ Accuracy constraint on that copy: the algorithm does **not** keep searching on its own. What is genuinely outstanding is (a) invited vendors **responding** over ~48h and (b) the organizer widening criteria from the dashboard. The second is real and already auth-gated: `api/events/[token]/refresh-matches/route.ts:51-53` 401s with *"Sign in to refresh matches"* and re-runs `autoMatchAndInvite` (`:90`). So "log in to improve your matches" is literally true and already sits behind the account wall — the ladder exists, the copy just doesn't use it.

