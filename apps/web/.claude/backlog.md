# Backlog

Last updated: 2026-08-07 (added: EVENTS MODULE tester findings — 13 issues incl. a hard deadlock)

## 🔴 EVENTS MODULE — owner testing 2026-08-06, logged 2026-08-07

**Nothing below is fixed. No code was changed.** Owner: *"you will need to review the appropriate code before fixing."* Leads are marked **UNVERIFIED** where I traced the file but did not confirm behaviour at runtime.

---

### 🚨 A — THE ADDRESS DEADLOCK (highest priority: an event can reach a state with NO way out)

An event created without a street address becomes **permanently stuck**. Four separate gaps combine:

| # | Gap |
|---|---|
| **A1** | Street address is **NOT mandatory** in the event intake form |
| **A2** | Vertical admin **CANNOT APPROVE** an event without a street address |
| **A3** | Event manager **cannot see or tap into their event** from the dashboard to edit it **until it is approved** |
| **A4** | Admin **cannot add the address themselves**, even after talking to the organizer |
| **A5** | Event manager **cannot cancel the event** from the dashboard either |

**The loop:** can't approve without an address → can't edit before approval → admin can't supply it → and it can't be cancelled to escape. **An event in this state is unreachable, unfixable and undeletable.**

#### ✅ ROOT CAUSE FOUND 2026-08-07 — it is `event_token`, not the address

The address is the symptom. The mechanism:

1. **`event_token` is assigned at APPROVAL, not at intake** — `app/api/event-requests/route.ts:328` gates on `approval.success && approval.market_id && approval.event_token`. A brand-new event has **no token**.
2. The organizer's editor **already exists and already permits `address`** — `components/events/OrganizerEventDetails.tsx`, PATCHing `/api/events/[token]/details`, which lists `'address'` as an allowed field (`:49`) and is organizer-authed. Its `EDITABLE_STATUSES` (`:48`) **already includes `'new'`**.
3. But it is rendered **`{evt.event_token && …}`** — `[vertical]/dashboard/page.tsx:931`. **No token ⇒ the editor never renders.**
4. And it is keyed by token throughout, so there is no id-based fallback.

**So the capability exists and is correctly permissive. It is simply unreachable before approval, because the key it needs does not exist yet.** The admin-side error message even says *"Ask the organizer to add one via their dashboard"* (`app/api/admin/events/[id]/route.ts:130`) — written against an editor the organizer cannot see.

⚠ **The same flaw is in what I built 2026-08-07:** the event-manager picker filters `.not('event_token', 'is', null)`, so **pending events do not appear there either.** Fixing A must include that filter.

#### Options (needs an owner decision — do NOT pick silently)

- **(a) Issue `event_token` at intake instead of approval.** Cleanest structurally — everything downstream is keyed by token and would just work. ⚠ **But the token is a bearer credential for attendee access** (`14_Events.md` documents a three-level token model), so minting it earlier has security implications that need thinking through, not assuming.
- **(b) Let admin set the address.** Fixes events **already stuck**. Does not prevent new ones.
- **(c) Make address required at intake.** Prevents new ones. Does **not** free existing stuck events.
- **(d) Give the editor an id-based path for pre-approval events.** Avoids touching token semantics; more plumbing.

**(b) + (c) together** is the smallest combination that both frees existing events and stops new ones, without touching the token model. **(a)** is the tidiest end state if the security review clears it.

**Still unverified:** A5 (cannot cancel) — the cancel path was not traced. Likely the same token dependency.

Fixing any ONE of these breaks the deadlock, but the owner's read is that the real problem is the class of bug, not the instance: *"my guess is there are similar gaps with other fields or other areas we have loops in there."* **So: audit every required-for-approval field against what the intake form actually requires, and against who can edit it at each status.** A field required downstream but optional upstream, with no editor in between, is the general shape.

**Files:** `app/api/event-requests/route.ts` (intake) · `app/api/admin/events/route.ts` + `[id]/route.ts` (approval) · `lib/events/event-actions.ts` · the organizer band in `[vertical]/dashboard/page.tsx` and the new `[vertical]/event-manager/[token]/dashboard` (⚠ the new dashboard was built 2026-08-07 as a shell — **A3/A5 may be partly solvable there**, since it is the organizer's own surface).

---

### 🟠 A-FOLLOWUP — approved events desync from their market on location/date edits (found 2026-08-08)

**Not shipped. Deliberately out of scope of the 2026-08-08 deadlock fix; needs its own decision.**

Approval **copies** `address`, `city`, `state`, `zip` and `event_date` from `catering_requests` into the new `markets` row, and derives `market_schedules.day_of_week` from the date (`lib/events/event-actions.ts:126-159`). The market is what vendors and shoppers actually see.

Two consequences:

1. **Pre-existing, live today:** `address` and `event_end_date` are in the organizer editor's allowed-field list with **no market guard**, so an organizer editing them on an approved event updates the request and **not** the market. The attendee page keeps showing the old address. Nobody is told. This predates 2026-08-08 and was left alone rather than silently restricted — restricting it removes a capability people may be using, and that is the owner's call.
2. **The 2026-08-08 fix side-stepped it** by making `city`/`state`/`zip`/`event_date` **pre-approval only**, enforced server-side in `api/events/[token]/details` and `api/admin/events/[id]`. Correct and safe, but it means an approved event with a typo'd city still cannot be corrected by anyone through the UI.

**The real fix** is a location/date edit path that updates the market alongside the request — and for a date change, recomputes `market_schedules.day_of_week`, which otherwise leaves the market operating on the old weekday. Consider also whether vendors already invited should be re-notified, since they accepted for a specific place and day.

**Decide:** (a) build the market-syncing edit path, (b) also guard `address`/`event_end_date` post-approval so the desync stops getting worse, or (c) accept it and document the workaround (cancel + re-create).

---

### 🟠 B — EVENT SCORING: math unverified, and undocumented

- **B1** Revisit the math and assumptions. Owner: *"I'm not sure its assumptions are correct. They may be."* Not asserted as wrong — **unvalidated**.
- **B2** Revisit **what is scored in each section**.
- **B3** **Document it.** Not optional: *"that's definitely going to be something that admins will need training on."*
- **B4** It is **not transparent in the UI**. Platform admin needs to understand it to train vertical admins.

**File:** `lib/events/viability.ts` — has a `warnings` concept (*"yellow: concerns that need admin attention but don't exclude"*, `:84`). Likely the scoring core.

---

### 🟠 C — PLATFORM ADMIN CANNOT SEE MARKETS OR EVENTS

*"As platform admin I can't see markets or events or anything via the admin dashboard — there's no UI for a lot of the functionality."* Discovered while trying to work around **A4**.

⚠ **Not the same as B or D — this is missing UI, not a broken gate.** The vertical admin console has pages the platform console does not.

**Explicitly NOT a bug (owner):** vertical admin only seeing events once approved — *"that makes sense."*

**Files:** compare `app/admin/**` against `app/[vertical]/admin/**` (the latter has: admins · analytics · cause · error-logs · errors · event-ratings · events · feedback · knowledge · listings · markets · order-issues · reports · stripe-reconcile · users · vendor-activity · vendors).

---

### 🔴 D — VERTICAL ADMIN → ALL USERS → "Admin access required"

Owner was **in the FT vertical admin panel** and was refused.

**STRONG LEAD, UNVERIFIED:** `app/[vertical]/admin/users/page.tsx:53` hand-rolls its gate —
```ts
const isAdmin = userProfile?.role === 'admin' || userProfile?.roles?.includes('admin')
```
That is a **literal string match on `'admin'`**, not the shared `hasAdminRole()` / `verifyAdminScope()` helpers the rest of the app uses. After the mig-204 admin hierarchy work (platform ⊃ vertical), a legitimate admin whose role is not the bare string `'admin'` fails this check. **Suspect other pages hand-roll the same check — grep for it.**

⚠ The owner saw *"need admin permissions to view"* in **green**; this file says *"Admin access required."* Similar but **not identical** — either the message moved or there is a second surface. **Confirm which page produced it before fixing.**

---

### 🟡 E — VERTICAL ADMIN → EVENT SCORING → "Failed to load event ratings"

Red banner. Owner: *"might be because there are no scores yet, but it might be a different bug."*

**Traced:** `app/[vertical]/admin/event-ratings/page.tsx:62` shows that banner when the fetch to `/api/admin/event-ratings` fails. That route **does** use `verifyAdminScope(vertical)` correctly (`:27`), so it is NOT the D bug. Most likely an empty-result path being treated as an error, or a genuine 500. **Needs a runtime check — cannot be settled by reading.**

⚠ Owner said *"event scoring"*; the page is **event-ratings**. Scoring may be `lib/events/viability.ts` (a different surface). **Confirm which page they clicked.**

---

**Suggested order:** **A** (a deadlock with no escape beats everything) → **D** (admins locked out of a working page) → **E** (small, and it may just be an empty state) → **C** (build work) → **B** (analysis + documentation, the largest and least urgent).


## 🔴 HIGH — FT day-to-day pickup capacity ("skip the line" is currently unenforceable) — added 2026-08-02

**Status 2026-08-02: BUILT + TESTED; mig 216 APPLIED to Dev + Staging** (`3d3d13c3` schema/UI, `cebc18cb` checkout enforcement, + uncommitted 216 revisions & tests). Prod still pending.
- ✅ Step 1 migration 216 (5 `vendor_profiles` columns, `check_pickup_slot_capacity`, `validate_pickup_slot_time`, counting index) — **revised before applying, see "216 review" in `current_task.md`: two real bugs fixed (abandoned checkouts held a slot ~24h; `LIMIT 1` schedule lookup rejected dinner-time orders at two-window markets)**
- ✅ Step 2 checkout enforcement (`checkout/session/route.ts`, +63/−0, owner per-file approved) — also closes the unvalidated `preferred_pickup_time` hole
- ✅ Step 3 vendor card `PickupCapacityForm` on `/[vertical]/vendor/edit` · ✅ Step 4 buyer "— Full" slots · ✅ Step 5 lead-time-change warning
- ✅ **Test coverage** — `pickup-slot-capacity.integration.test.ts`, 21 DB-backed tests, 21/21 green; `guardrail-contracts.test.ts` Rule F markers on both RPCs + Rule F2 (UI mirrors enforcement). The earlier "no test coverage" warning is closed.
- ⬜ **Step 6 day-of "short-staffed today" override** — 2 more columns (`..._today_override`, `..._today_date`; use override when date = today) + a dashboard control near Pickup Mode + a small RPC tweak. **216 is now applied, so this needs its own migration (217)** — do not edit 216.
- ⬜ **Step 7 listing cross-reference** line near `quantity` in `ListingForm`: *"Daily inventory limits how much you can sell. Pickup capacity limits how fast — right now, {orders} app orders or {items} items per {slot} minutes. Change it in Pickup Settings →"*

All copy below is signed off. Do NOT redesign — the sections below are the reference for steps 6-7 and for anyone changing the copy.

### The problem (verified 2026-08-02, all citations checked by reading the file)

Nothing limits how many app orders a food truck can receive for the same pickup time. 40 buyers can all choose 12:00, all be told to come, and the truck has a line it never agreed to. This directly breaks the `_platform_skip_line` clause (`lib/markets/platform-agreement-clauses.ts:76`) that every truck accepts and that the marketing promises.

**What actually exists today:**
- Buyers **DO** pick a mandatory pickup time — `cart_items.preferred_pickup_time` / `order_items.preferred_pickup_time` (mig `20260217_028_add_preferred_pickup_time.sql`, still in root `migrations/`, NOT `applied/`). Required for FT at `api/cart/items/route.ts:174-178`.
- Slots are generated **client-side only** — `lib/utils/time-slots.ts:38-70`. Its own comment at `:26` says it plainly: **"Multiple buyers can pick the same slot — slots are waves, not reservations."**
- **Slot length is 15 OR 30 min**, derived from the vendor's lead time: `time-slots.ts:49` → `slotInterval = minLeadMinutes <= 15 ? 15 : 30`. `vendor_profiles.pickup_lead_minutes` (mig 096, `INTEGER DEFAULT 30`, `CHECK IN (15,30)`) flows `listing/[listingId]/page.tsx:430` → `AddToCartButton.tsx:62,77` → `generateTimeSlots`.
- **Nothing counts orders per slot.** Full untruncated grep of `preferred_pickup_time` across `apps/web/src`: every hit is select/store/display. No COUNT, no aggregate, no cap comparison.
- Server validates the chosen time **only** for a 15-minute boundary (`cart/items/route.ts:179-185`). ⚠️ **Security-adjacent hole:** "inside the vendor's hours", "in the future", and "past lead time" live ONLY in client-side `generateTimeSlots` — a crafted API call can book 3:07 AM or a slot 2 minutes out.
- FT non-event `cutoff_hours` is **hardcoded 0** (mig 200:113) — orders accepted until the truck closes.
- Only defense today is `listings.quantity`, which sells out the **whole day** instead of pacing. (NOTE: "NULL = unlimited" is **UNVERIFIED** at the enforcement layer — `validate_cart_item_inventory`'s body is not in the repo, only the signature in `supabase/.temp/functions.md`. UI placeholder says "Leave blank for unlimited", `ListingForm:953`.)

> ⚠️ **Two corrections for whoever builds this** — I asserted both of these wrongly during design and had to retract: (1) day-to-day orders are **NOT** date-only, buyers pick a time; (2) `pickup_lead_minutes` is **NOT** event-only, it drives day-to-day slot generation. Both errors came from grepping a narrow scope (`migrations/applied/` only; `head -8`) and treating no-hits as proof. **Read the files.**

### Precedents to copy (do not invent new patterns)
- **Atomic capacity:** `pg_advisory_xact_lock` then count then allow/reject — exactly `book_weekly_booth_atomic` (mig 186:82-116). Same shape works keyed on (vendor, market, date, slot).
- **Profile default + per-context override + shown math:** `vendor/events/[marketId]/page.tsx:743-800` — explains the model, offers "Use my profile default (N)" vs "Custom for this event", and puts the derived total **in the label**: *"Total event capacity (N waves × M per wave = X)"*. Mirror this.
- **Setup-question card:** `vendor/edit/EventReadinessForm.tsx:574-593` asks "Max Headcount Per 30-Minute Wave" with a hint. New card sits on the same page.
- **Slot key already exists on `order_items`:** `vendor_profile_id` + `market_id` + `pickup_date` + `preferred_pickup_time`.

### Design decisions (OWNER-APPROVED — do not re-open)
1. **Two caps, whichever hits first** (orders/slot AND items/slot). Orders alone lets six 1-item orders swamp a slot; items alone lets one big order eat it.
2. **Vendor answers 3 plain questions; caps are DERIVED and then STORED + overridable.** Never ask for "prep minutes" (rejected — vendors guess badly). Store the concrete number so the vendor sees exactly what the app enforces, matching the event form's editable `calculatedTotal`.
3. **Ask total pace FIRST, then carve out the app slice.** Owner: *"vendors are walkup / cash focused inherently, the app is the add-on to their process, we can't treat walkup as the afterthought, they will misrepresent."* Asking "app orders minus walk-ups" inverts their mental model and they'll answer with whole-service capacity.
4. **Capacity lives on the PROFILE, not per listing.** One kitchen = one constraint. Per-listing would create N caps for one physical limit (do they sum? does min win?) and a 12-listing truck would answer 12 times. **But** add a cross-reference line in the listing form where `quantity` is set — owner liked this as a reality-check at the moment they think about volume.
5. **Pre-fill Q1 from `profile_data.event_readiness.max_headcount_per_wave`** (set by `EventReadinessForm`), **labeled with its source** so they can correct it. Only pre-fill when present — event_readiness is only filled by trucks applying for events.
6. **Enforce at CHECKOUT, not cart-add** — matches how inventory already works (`atomic_decrement_inventory` runs at checkout). Holding at cart-add would need reservation-expiry cron like events have, and an abandoned tab would starve a truck's lunch rush. Cart-add may show a soft "filling up" hint.
7. **Full slots render DISABLED as "Full", not hidden.** Hidden reads as "truck is closed"; "Full — try 12:30" communicates scarcity and pushes demand to adjacent slots.
8. **All copy is dynamic on `{slot}` = the vendor's 15 or 30.** Never hardcode 15.

### Final vendor-facing copy (SIGNED OFF — use verbatim, `{slot}` = 15 or 30)

> **Pickup Capacity**
> How many **app pre-orders** you'll accept in each **{slot}-minute** time slot, so they spread across your service instead of all landing at once.
> **This only paces app orders — your walk-up line is never limited by it.**
>
> **Q1 — Your normal pace.** During a typical service, about how many orders do you complete in **{slot} minutes** — everyone, walk-ups included?
> *Cooked and handed out, not just handed out. Your steady pace, not your best-ever burst.*
> <sub>Pre-filled from your Event Readiness answer (you serve ~N people per 30-minute wave at events). Day-to-day is usually different — change it if this isn't right.</sub>
>
> **Q2 — Your app slice.** Of those {Q1}, how many can be app pre-orders?
> *Walk-ups will still be your main source of customers until people get used to ordering through the app. Set aside a slice you can comfortably hit today, and raise it as more of your regulars start ordering ahead.*
>
> **Q3 — Typical order size.** About how many items are in a normal order?
> *Your average, not your biggest.*
>
> **Here's what that means**
> You complete about **{Q1} orders** in a normal **{slot} minutes**.
> You're setting aside **{Q2}** of those for app pre-orders.
> A typical order is **{Q3} items** → about **{Q2×Q3} items**.
> **We'll hold each {slot}-minute slot to {Q2} app orders or {Q2×Q3} items — whichever comes first.** When a slot reaches either, app buyers see it as **Full** and pick another time. Walk-ups keep coming as normal. *Adjust ▾*
>
> **Set it too high** and the pacing stops working — everyone picks 12:00, you get slammed, orders run late, and the skip-the-line promise your app customers paid for breaks.
> **Set it too low** and you turn away the app customers you do have — they'll see Full and order somewhere else.
> **Start conservative.** App ordering builds slowly at first; it's easy to raise this once you see how it actually runs.
> **Turn it down when:** short-staffed, running a slower or more complex menu, or working a new location.
> **Turn it up when:** fully staffed, running a fast menu, or slots keep going Full early in the service.
> Leave blank for **no limit** (how it works today).

**Listing cross-reference** (in `ListingForm` near `quantity`):
> *Daily inventory limits how much you can sell. Pickup capacity limits how fast — right now, {orders} app orders or {items} items per {slot} minutes. Change it in Pickup Settings →*

**⚠️ Lead-time-change warning (STRONG — owner-specified wording, not a soft "want to update?"):** fires in `PickupLeadTimeForm` when `pickup_lead_minutes` changes and a capacity is already set:
> **Your order capacity is set based on your order lead time — your order capacity probably needs to be changed to match your new lead time.**
> Your slots just changed from {old} to {new} minutes. Capacity was set for {old}-minute slots. → **[Review capacity]**

### Build order (and WHY this order)

**1. Migration.** On `vendor_profiles`: the 3 answers + 2 derived caps + **the slot length they were set against** (needed so the lead-time-change warning knows when they're stale). All nullable — **NULL = unlimited = today's behavior**, so nothing changes for existing trucks. Add the changelog row (the guardrail-contracts tripwire will fail the build without it).

**2. Checkout RPC + `preferred_pickup_time` validation.** Advisory-locked count on (vendor, market, pickup_date, preferred_pickup_time) vs both caps, called from `checkout/session/route.ts` beside the existing inventory validation. **Fold the validation hole in here** — same file, same RPC, and it's arguably more urgent than capacity itself. **Ships INERT** (all caps NULL), same pattern used for Community Chip In. ⚠️ CRITICAL-PATH money file — needs per-file approval with exact before/after.

**3 + 4 MUST SHIP TOGETHER — hard sequencing constraint.**
 - **3. Setup card** on `/[vertical]/vendor/edit` below Pickup Prep Time (`PickupLeadTimeForm`) — the 3 questions + shown math + editable override.
 - **4. Buyer "Full" state** in `AddToCartButton.tsx:75-78`.
 **Why together:** the moment a vendor sets a cap, enforcement is live. If buyers can still pick a full slot, they hit a hard error at checkout instead of seeing "Full". Never ship 3 without 4.

**5. Lead-time-change warning** in `PickupLeadTimeForm` (copy above).
**6. Day-of override** on the FT dashboard near Pickup Mode — "today only" capacity for a short-staffed shift. Same "use my default / custom" radio as the event page.
**7. Listing cross-reference** line in `ListingForm` near `quantity`.

### Gotchas
- **Don't hardcode 15.** Slot length is the vendor's `pickup_lead_minutes`. Every string and every calculation.
- **Cancelled orders must not consume capacity** — count only non-cancelled `order_items` (mirror how `cart/validate` and the inventory path treat `cancelled_at` / status).
- **Multi-item carts spanning slots:** one cart can hold items for different times; count per (item's) slot, not per order.
- **Events are untouched.** Event orders go through `/api/events/[token]/order` + the wave system and must not hit this path.
- **Capacity is per vendor, not per market** in v1 — a truck at two parks the same day shares one cap. Acceptable for launch (a truck is only physically at one place at a time); per-market override is a later addition if needed.
- Consider whether a date whose slots are ALL full should drop out of `get_available_pickup_dates` — nice-to-have, adds SQL complexity, **phase 2**.

---

Last updated: 2026-07-29 (added: Extra-B residual — expire abandoned park-spot Stripe session)

## 🟠 MEDIUM — "What's Open" should include events + private pickups (scoped 2026-08-04, NOT started)

**Owner ask:** the shopper-dashboard card *"What Markets Are Open?"* (FM) / *"Where Are Trucks Today?"* (FT) must cover **all three market types** — traditional, private_pickup, and events — and must **distinguish the type in the list**, because one vendor can legitimately be in two places on the same day. Applies to BOTH verticals (shared query).

### Verified current state (2026-08-04, read the code)
- `markets.market_type` CHECK is exactly `traditional | private_pickup | event` (SCHEMA_SNAPSHOT:2393).
- The card links to `/[vertical]/where-today`, whose API (`api/trucks/where-today/route.ts:39-71`) queries `vendor_market_schedules` → `market_schedules.day_of_week`. It is **purely schedule-driven**. Events are dated by `event_start_date`/`event_end_date` with **no weekday rows**, so they are excluded *by construction* — no filter is hiding them.
- **No public/private flag exists anywhere** on markets or events (grepped).
- ✅ Working in our favor #1: **browse already labels all three types** (`browse/page.tsx:1263`) via `term(vertical, 'event'|'private_pickup'|'traditional_market')`. Reuse that pattern — do not invent new labels.
- ✅ Working in our favor #2: the API **already dedupes by (vendor_id, market_id, …)** (`:178-190`), not by vendor alone, so "same vendor, two places" is already supported at the data layer. ⚠️ But a `vendorGroups` map at `:195` may collapse it in the display — **verify before assuming**.
- Private pickups are **already publicly visible in browse**, so listing them is consistent with today, not a new exposure.

### Owner decisions (2026-08-04 — these are settled)
1. **Events: private by DEFAULT.** The event **organizer** must explicitly set public.
2. **Private pickups: vendor-controlled toggle** — the vendor decides whether their home/pickup address appears in public search. (This is what makes the flag a general market-visibility flag, not an event flag.)
3. **Multi-day events show on EVERY day** in their range.
4. **Today-and-forward ONLY.** Nothing out of season, nothing in the past (not even yesterday) — for **all three market types**.

### Design — ONE visibility column, and NO DEFAULT (owner clarified 2026-08-04)
Decisions 1 and 2 are the same question asked of two market types, so it is one `markets` column — call it `public_listing`.

**There is deliberately NO default.** The owner's rule: **traditional markets are always public and get no toggle at all; events and private pickups must have the user explicitly choose public or private.** An unanswered question is not the same as "private", and it is certainly not "public".

```sql
public_listing BOOLEAN NULL   -- nullable, NO DEFAULT
```
- `market_type='traditional'` → column is **ignored entirely**. Public by type.
- `event` / `private_pickup` → `NULL` = **not yet chosen** · `true` = public · `false` = private.

Query rule:
```sql
(market_type = 'traditional' OR public_listing IS TRUE)
```
`NULL` therefore **fails closed** — an unanswered market is not listed. That is correct and is why no default is needed: the nullable column IS the "must choose" state.

**Existing rows — OWNER DECISION 2026-08-04:** left as NULL they would all vanish from public search on the day this applies. The owner chose instead to **backfill existing event + private_pickup rows to `true`** so current data stays visible for **testing and demos**:
```sql
UPDATE public.markets SET public_listing = true
 WHERE market_type IN ('event','private_pickup');   -- pre-launch data only
```
**This applies to the migration's one-time backfill ONLY — the column still has NO DEFAULT, so every row created afterward must still make an explicit choice.** Safe today because the platform is effectively empty post-relaunch. ⚠️ **Re-confirm before real vendors onboard:** a private pickup is often someone's home address, and this backfill makes existing ones public without asking them. If any real vendor data lands before this ships, revisit — the fail-closed NULL behavior is the correct end state.

**UI requirement:** the control must be a genuine unselected state (no pre-checked radio, no toggle defaulting to off-looking), and saving an event or private pickup without a choice must be blocked. A pre-selected control silently makes the default we just agreed not to have.

### Work items
1. **Migration** — `public_listing` column + traditional backfill + COMMENT stating the type rule above.
2. **Query rework (the real work)** — `where-today` becomes a UNION of two differently-shaped queries: (a) schedule-driven markets matching the weekday, (b) events whose **date range contains** the target date (this is what makes multi-day events appear on every day). `idx_markets_event_dates (vertical_id, event_start_date, event_end_date) WHERE market_type='event' AND active` already supports (b).
3. **Today-and-forward + season filtering — applies to ALL types, both branches.** ✅ Do NOT hand-roll this: `src/lib/markets/season-window.ts` already provides tested pure helpers — `isWithinSeason(dateYmd, start, end)`, `isBeforeSeason`, `isAfterSeason`, `hasSeasonWindow` (NULL/NULL = year-round). Season bounds live in the **`market_seasons`** table, so the query needs that join. Past exclusion: events whose end date < today drop out; the day-picker already only offers today + future offsets, so verify rather than rebuild. Also confirm whether `markets.expires_at` should participate.
4. **Type in the payload + UI badge** — return `market_type` per entry; label with the same `term()` keys browse uses. This is what makes the same-vendor-twice case readable instead of confusing.
5. **Verify `vendorGroups` (`:195`) does not collapse** a vendor appearing at two places on one day.
6. **Organizer control** for events + **vendor control** for private pickups — both must be a required, genuinely-unselected choice (see the UI requirement above), not a toggle with an implied default.
7. **Copy** — card title, day-picker text, empty state all say "markets" today; should read markets **and events**.

### Still open
- Should `markets.expires_at` participate in the today-and-forward filter alongside `market_seasons`? (Everything else about exclusion is settled: today-and-forward only, no past, no out-of-season, all three types.)

## 🟢 LOW — Supabase advisor cleanup round: 6 FK indexes (added 2026-08-02)

**Trigger:** owner saw **203 security / 27 performance** advisories and asked for triage. Full analysis done 2026-08-02 — the counts are far less alarming than they look. **Environment not recorded** when the queries were run; re-check per project before acting (advisors are per-project).

**Triage result — what the 203 actually is:**
- **`function_search_path_mutable`: raw catalog count 723, but 721 are PostGIS's own functions.** Real count = **2**, and they are already named in the mig 153 item below (Bucket 4): `check_subscription_completion` and `create_market_box_pickups`. Confirmed still the only two as of 2026-08-02. **Do them as part of mig 153, not separately.**
- **ZERO `SECURITY DEFINER` functions are missing `search_path`** — every privileged/money function already sets it. The 2 above are `SECURITY INVOKER`, so there is no privilege-escalation exposure; this is hygiene only.
- **`rls_disabled_in_public: spatial_ref_sys`** — PostGIS system table. Cannot enable RLS without superuser, holds coordinate-system reference data. **ACCEPT.**
- **`security_definer_view` ×2: `geography_columns`, `geometry_columns`** — PostGIS system views, not ours. **ACCEPT.**
- **`extension_in_public: postgis`** — already an "accept" decision in mig 153 Bucket 4. Relocating it means dropping/recreating the extension, which risks the location-search system (protected after the Session 59 regression). **ACCEPT — the fix is riskier than the finding.**
- **`rls_enabled_no_policy` ×20** (booth/park/market-manager tables) — RLS on + no policy = deny-all to anon/authenticated, service role bypasses. That is the intended architecture (cf. mig 122, which deliberately removed organizer RLS and moved that dashboard to the service client). **Verified 2026-08-02: zero `'use client'` components query any of the 20 directly**, so nothing is silently returning empty. **ACCEPT.**

### ⬜ The only real work — 6 indexes out of the 29 flagged FKs

Verified by counting actual query predicates in app code, not by guessing:

```sql
-- Verified query paths (filter counts found in TS: 5, 3, 5, 2 respectively)
CREATE INDEX IF NOT EXISTS idx_booth_credits_related_group
  ON public.booth_credits (related_group_id) WHERE related_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booth_credits_market
  ON public.booth_credits (market_id);
CREATE INDEX IF NOT EXISTS idx_park_vendor_vetting_vendor
  ON public.park_vendor_vetting (vendor_profile_id);
CREATE INDEX IF NOT EXISTS idx_event_vendor_listings_vendor
  ON public.event_vendor_listings (vendor_profile_id);

-- NOT query paths — FK ENFORCEMENT. Deleting a booth inventory tier is a real
-- manager action (see booth-label-drift-server.ts, which handles the DELETE
-- case), and Postgres must scan these children on every such delete.
CREATE INDEX IF NOT EXISTS idx_weekly_booth_rentals_inventory
  ON public.weekly_booth_rentals (inventory_id);
CREATE INDEX IF NOT EXISTS idx_booth_booking_groups_inventory
  ON public.booth_booking_groups (inventory_id);
```

**Re-verify column names against `SCHEMA_SNAPSHOT.md` before writing the migration** (schema mechanical gate) — the names above came from a live `pg_constraint` query, but that was 2026-08-02.

### 🚫 Do NOT index the other 23 — record of WHY, so a future session doesn't "finish the job"

- **The five `vertical_id` FKs** (`notifications`, `vendor_quality_findings`, `vendor_leads`, `user_agreement_acceptances`, `catering_requests`) — 195 query sites, and still skip. **`vertical_id` has TWO distinct values.** A 2-value index is not selective; the planner won't use it, so it is pure write cost. If vertical filtering ever gets slow the fix is a **composite** index (`vertical_id` + the other predicate) — which prior sessions already added where it mattered (`idx_markets_vertical_status`, `idx_orders_vertical_created`, mig 015's transactions composite). The advisor's blanket "every FK needs an index" rule is simply wrong for a low-cardinality tenant column.
- **Nine audit columns** (`*_approved_by`, `*_created_by`, `moderated_by`, `sender_user_id`, `assigned_by_user_id`, `ended_by_user_id`, `manager_confirmed_by`, `replaced_vendor_id`) — zero query predicates; parent is `auth.users`, which is essentially never deleted in prod.
- **`transactions.listing_id`** — `transactions` is the legacy table orders/order_items replaced; mig 132 dropped the last functions querying it. Dead table.
- **Remaining zero-predicate FKs** (`order_items.wave_id`, `event_wave_reservations.order_id`/`user_id`, `support_tickets.user_id`, `market_optin_selections.statement_id`, the `agreement_acceptance_id` columns) — no filters found. *Caveat: the grep covered `.eq()`/`.in()` in TS and would miss PostgREST embed joins and SQL inside RPCs, so revisit if one shows up in a slow query log.*

**Priority is genuinely LOW.** With the platform near-empty post-relaunch none of the six cost anything measurable today, and `booth_credits` / `park_vendor_vetting` hold very few rows. This is insurance for real traffic, not a present problem. **Bundle with mig 153** if that gets picked up — one migration closes both advisor tabs.

---

## 🟢 LOW — Expire the abandoned park-spot Stripe session (added 2026-07-29)

Follow-up to the Extra-B fix (`f141c6e6`, `book-park-spot/route.ts`): re-booking now cancels the caller's OWN stale `pending_payment` rows so an abandoned checkout no longer blocks re-booking, and the cancel keeps the Stripe webhook a clean skip. **Residual edge:** if a vendor leaves the old Stripe tab open unpaid, re-books + pays the NEW session, then goes back and *also* completes the OLD session, Stripe charges both — the old booking stays `cancelled` (no phantom booking) but the money on the old session is taken with nothing to show. Self-inflicted, needs two live Stripe tabs both paid, and Stripe auto-expires open sessions after 24h — hence LOW.

**Fix (one-function add, feasible — session id IS stored):** the route writes `park_spot_bookings.stripe_checkout_session_id = session.id` per `booking_group_id` (`book-park-spot/route.ts:541-542`). In the Extra-B cancel step, first `SELECT DISTINCT stripe_checkout_session_id` from the caller's own pending rows being cancelled, then call `stripe.checkout.sessions.expire(id)` for each non-null one (wrap each in try/catch — expiring an already-completed/expired session throws and should be ignored). Then reopening the old tab shows "expired" and it can't be paid → edge closed. Do it when next editing that route.

---

Last updated: 2026-07-20 (added: 3 low-severity A2 deferrals from the logic-testing money-fix session)

## 🟢 LOW — A2 money-fix deferrals (added 2026-07-20; owner chose to skip)

From the logic-testing A2 money-fix session. The meaningful items (S2-2, S1-1, S1-4, S1-6, S1-7, S5-3) were fixed; these three were judged not worth the spend now. Full detail in `logic_testing_round_research.md` FIX-SESSION PLANNING MATRIX (A2/A3 rows).

- **S1-8** (`src/lib/payments/cancellation-fees.ts:72`) — small-order-fee proration uses `Math.round` not floor+remainder → cancellation refund off by **≤1¢** vs fee collected. Fix: swap to `proratedFlatFeeSimple(...)` to match the flat fee. Cosmetic.
- **S2-4** (`vendor/orders/[id]/fulfill/route.ts:445-451`) — dev-mode payout insert uses the USER client (RLS default-deny → silent fail). **Dev-only**, zero prod impact. Fix: use `serviceClient`.
- **S3-2** (`cron/expire-orders` Phase 4 no-show ~:836-893 + Phase 7 auto-fulfill ~:1870-1940) — cron payout paths never call `claimVendorFeeDeduction`, so a vendor paid ONLY via cron never has fees collected. Fee stays on the ledger (deferred, **not lost**) and is claimed on the next manual payout. Fix when someone's already editing expire-orders.

---

## 🔴 HIGH PRIORITY — Finish deep code coverage of the logic-testing round (added 2026-07-19)

The 2026-07-19 two-pass logic-testing round (`apps/web/.claude/logic_testing_round_research.md`) covered all 12 slices, but DEPTH varied by design: slices 1-4 (checkout, vendor orders, crons, auth) + 5 money RPCs got full-file code reads; slices 5-9 got money-path reads + Codebase-Map for the rest; slices 10-12 (notifications, buyer/public, lib) were map-driven with targeted spot-checks. Every finding reported is code-cited, but COVERAGE completeness is lower on the map-skimmed surfaces. Two areas still warrant full-file rigor to match slices 1-4:

1. **Manager/park route surface (~48 routes under `market-manager/**` + `vendor/markets/[id]/**`)** — the largest money area that was map-skimmed rather than fully read. Book/settlement/cancel money paths were spot-checked clean, but per-route full reads are outstanding.
2. **Booking-atomic + season RPC internals** (Category H): `book_weekly_booth_atomic` (mig 186), `book_park_spot_atomic` (172), `book_season_atomic` (165), `confirm_season_paid`/`cancel_season_group` (167), selling gate `get_available_pickup_dates` (199, pinned by guardrail-contracts Rule F). Call sites mapped clean; SQL bodies unread.

Method for the return pass: same two-pass (blind read → ledger diff) at the slice-1 depth. The FIX-SESSION PLANNING MATRIX in the research file already holds everything found so far, sorted by category — resume from there.

---
Last updated: 2026-07-18 (agreement-version decision added; CRN-11 deferred; VOR-11 stays open per user; company-paid assumptions for the VOR-10 fix documented in the package below)

## 🔷 OWNER DECISION NEEDED — Agreement version bump after legal text corrections (added 2026-07-18)

**`CURRENT_AGREEMENT_VERSION` (`src/lib/legal/index.ts:9`) is still `'2026-03-v2'`, but the vendor service agreement text has changed twice since vendors accepted under that string.** It is a hand-set constant stamped onto each acceptance record (`OnboardingChecklist.tsx:197`, `api/user/accept-agreement`), so past acceptances now point at text that no longer matches what was shown.

**What changed (both 2026-07-18, commit in the pricing/trial batch):**
1. **`VENDOR_TIERS` corrected** — was FM `"Standard (free) and Premium ($24.99/month)"` / FT `"Free, Basic ($10/month), Pro ($30/month), and Boss ($50/month)"`; both now derive to **`"Free, Pro ($25/month), and Boss ($50/month)"`**. The old strings quoted prices the platform does not charge — vendors were accepting a contract with wrong figures.
2. **`TRIAL_TERMS` removed for FT** — was `"90-day complimentary Basic tier upon approval"`; the trial was retired (owner decision, same day) and `TRIAL_SYSTEM_ENABLED` is false, so the clause promised a benefit never delivered. Now `null`, and the resolver strips the sentence.

**The decision:** does correcting factually-wrong prices and removing a retired benefit constitute a NEW agreement version requiring re-acceptance by all existing vendors, or a correction of the existing one?
- **Bump** (e.g. `'2026-07-v1'`) → every vendor re-accepts; clean audit trail; friction for vendors mid-season.
- **Don't bump** → no vendor friction, but acceptance records for `2026-07-v2` point at text that has been edited since signing.

Claude should NOT decide this — it is a legal/business call. Note this is distinct from the market-level `computeAgreementVersionFromSnapshot` hash (opt-in statements), which is a separate, automatic system.

**Related, same file:** the market-manager-program page still hardcodes a booth-fee worked example (`$25 booth → vendor pays $26.78, manager receives $23.37`). The math is currently correct against `FEES`, but it is a hand-typed copy of fee arithmetic and would silently go stale if rates ever change — a candidate for pricing-display derivation (pricing item "C", also backlogged).

## 🔶 DEFERRED FEATURE PACKAGE — Company-paid events (USER DECISION 2026-07-14: "WE WILL NEED IT LATER, BUT NOT NOW")

**State discovered in review slice 5 (full detail: `apps/web/.claude/review/FINDINGS_LEDGER.md` slice-5 section): company-paid ordering has NEVER been executable end-to-end.** Three independent breaks, plus adjacent items. Nothing here leaks money today — the flow is dead, and cron/webhook transfer paths were verified unreachable by company-paid orders (session-id-scoped gates). When the feature is scheduled, fix as ONE project in this order:

1. **EVT-1 (P0) + EVT-17** — `create_company_paid_order` (mig 119) INSERTs non-existent `orders` columns (`user_id, market_id, buyer_fee_cents, service_fee_cents, vendor_payout_cents`) and omits NOT-NULL `buyer_user_id`; cap-check queries the same phantoms. Rewrite the RPC against the real schema (**run `information_schema.columns` on `orders` FIRST**; per-item money belongs on `order_items`), add `FOR UPDATE` on the reservation + guarded final UPDATE (EVT-17 double-order race), swap the order route's `console.error` → `logError`. MIGRATION.
2. **EVT-2** — ShopClient's order POST never sends `access_code`; the route 403s without it. One-line client fix (`ShopClient.tsx:416-424`).
3. **EVT-7** — self-service `ready`-flips never generate waves, and ShopClient silently degrades wave-less company-paid to attendee-paid. Generate waves on all ready-flips when `payment_model='company_paid'`, or block the self-service+company-paid combo.
4. **EVT-11** — admin settlement report balances company payments against bare subtotals, omitting the buyer-side 6.5%+15¢/order mig 119 defines the company as owing → under-invoices ~6.7%.
5. **EVT-13** — access code is `Math.random()` (not CSPRNG) and the order route uses the general rate limiter (second guessing surface).
6. **VOR-14** (already in ledger, open) — buyer-confirm edge path lacks a company-paid branch → would attempt a real Stripe transfer for an organizer-settled order. Unreachable while the feature is dead; MUST land with this package.
7. **EVT-15 (company-paid half)** — buyer-cancel needs a company-paid early-branch mirroring fulfill's (no Stripe refund math on paymentless orders). The wave-freeing half of EVT-15 is being fixed NOW (wave lifecycle batch).
8. **Reminder:** the eventual VOR-10 fix (reject's silent refund-skip logging) must exempt `payment_model='company_paid'` or it logs an error on every company-paid reject. **VOR-10 fix SHIPPING 2026-07-18 (Batch 3) with that exemption built in. Assumptions it bakes in — MUST still hold when this package is built:** (a) company-paid orders NEVER get a `payments` row (organizer settles out-of-band via the manually-recorded `event_company_payments` ledger — no Stripe payment, so no-succeeded-row is normal, not an error); (b) buyer refunds on company-paid rejects/issue-resolutions flow through organizer settlement, NOT Stripe `createRefund` (consistent with fulfill/route.ts:92,199-219 which skips all Stripe money movement for `payment_model='company_paid'`). If the package's design ever gives company-paid orders a payments row or Stripe refunds, revisit the reject/resolve-issue exemption.
9. **Design notes:** RPC fee math (6.5%+15¢ both sides) is hardcoded in SQL — must mirror pricing.ts if rates ever change; `event_company_payments` is a manually-recorded admin ledger (no code moves organizer money); event cancellation (EVT-3/4) is being fixed NOW and is independent of this package.

## 🔷 FOLLOW-UP (added 2026-07-18) — Pricing item "C": full `getTierPricing()` accessor

Items **A** (stripe/config.ts imports `SUBSCRIPTION_AMOUNTS`; ~22 literals removed) and **B** (`src/lib/pricing-display.ts` derives all customer-facing price/tier prose; wired into legal placeholders + llms.txt) **SHIPPED 2026-07-18**. Seven pin tests in `subscription-amounts-functional.test.ts` now fail if the two sources diverge.

**C (not built, optional):** a single `getTierPricing(vertical, tier, cycle) → {amountCents, display, priceId}` accessor as the one entry point for every surface, replacing the current split between `SUBSCRIPTION_AMOUNTS` (amounts), `SUBSCRIPTION_PRICES` (amount+priceId pairing) and `pricing-display` (strings). Cleaner end state, but it touches `lib/pricing.ts` — a protected critical-path file — so it needs per-file approval with exact diffs. A+B already closed the actual defects; C is architecture, not a bug fix. Remaining hardcoded-price sites to sweep when C is done: the market-manager-program booth-fee worked example.

## 🔷 GUARDRAIL-AUDIT FOLLOW-UPS (2026-07-18 — decision/timing items from the audit; the mechanical batch [Rules F/G/H + design-fidelity rule] SHIPPED same day)

- **C1 / VOR-11:** `status-transitions.test.ts` = 51 green tests asserting a spec production ignores (zero imports, re-verified) — the suite's largest false-confidence source. Resolve the parked decision: wire `isValidItemTransition` into routes OR rewrite the spec to sanctioned reality and demote it from "spec".
- **C3:** `KNOWN_UNCATALOGED` legacy error-code baseline (~60 codes) — shrink-only but static. Burn down 5-10 per quiet session so Rule E means what it says.
- **C5:** SCHEMA_SNAPSHOT structured tables are stale (every park-family table absent — schema gates needed migration archaeology on 2026-07-18). Run `REFRESH_SCHEMA.sql` + regenerate right after the prod push.
- **C6:** Vault is pre-cycle (69 verified commits behind). After the user's staging test passes: user-authorized vault update + manifest refresh (money suites, park systems, guardrail contracts).

## 🔷 DEFERRED (user 2026-07-18): CRN-11 — survey per-recipient notification fan-out

Surveys cron sends per-recipient (surveys route :441,:569) because the payload is NOT uniform (surveyId/accessToken per recipient) — `sendNotificationBatch` can't be used without building a per-recipient-templateData batch variant (bulk-prefetch + per-recipient data). Since COMM-4 made surveys daily + lazy-on-return, frequency and volume are low → low value. Leave as is until notification volume justifies the variant.

## ✅ MOSTLY DONE (2026-07-13) — Money-authorization tests built; VOR-11 decision still open (user 2026-07-18: leave as is for now)

**BUILT 2026-07-13 (user-approved 8-rule spec, commit `556b34e0`):** `src/app/api/__tests__/money-authorization.test.ts` (8-rule spec driving the real fulfill/buyer-confirm handlers) + `src/lib/__tests__/money-structure.test.ts` (5 structural defect-class rules, self-policing allowlists) + `src/lib/__tests__/pricing-conservation.test.ts` (conservation properties). Suite 1628→1674, all in pre-commit. **REMAINING from this item: the VOR-11 decision only** — `lib/orders/status-transitions.ts` is a tested spec module production ignores; user picks: wire `isValidItemTransition` into routes (behavior change, care in resolve-issue) or rewrite the spec to sanctioned reality. Original rationale kept below.

## ⭐ ORIGINAL ITEM (added 2026-07-12) — Money-authorization business-rule tests + VOR-11 decision

**Why now:** the pre-re-release review's P0 fixes (VOR-1/2/3, CRN-1/2/9) all live in the route-handler/cron *authorization* layer — and the entire 1628-test suite stayed green both while those bugs existed AND through the fixes. The suite thoroughly specs the money *math* (pricing/tips/fees/settlement) but asserts nothing about whether money was *allowed* to move. The new gates are one confident refactor away from silently disappearing.

**Scope (own focused session, AFTER the current review slices or interleaved when convenient):**
1. **Business-rule tests for the new gates** — route-level with seeded/mocked state:
   - An item on an order with no succeeded payment (status not paid/completed) can NEVER produce a vendor transfer — via fulfill, buyer-confirm edge path, cron Phase 4 (no-show), or cron Phase 7 (auto-fulfill). (VOR-1 / CRN-1 gates, ERR_ORDER_007.)
   - A cancelled or refunded item can NEVER flip to `fulfilled`/`expired` — fulfill both branches, buyer-confirm update, cron Phases 4/4.6/7. NB: refund webhook sets `status='refunded'` WITHOUT `cancelled_at` (webhooks:1015) — tests must cover both the status-list and cancelled_at legs. (VOR-2 / CRN-9.)
   - A non-23505 `vendor_payouts` insert failure blocks the transfer (buyer-confirm; VOR-15 will extend this to fulfill).
   - Phase 2 / checkout-cleanup never cancels an order whose Stripe session can't be expired (CRN-2/CHK-1 skip-if-possibly-paid rule).
2. **VOR-11 decision (user call):** `lib/orders/status-transitions.ts` is a tested spec module imported by NOTHING in production, and live routes contradict it (pending→fulfilled, fulfilled→cancelled). Either wire `isValidItemTransition` into the routes (behavior change — needs care in resolve-issue) or rewrite the spec to the sanctioned reality. Current limbo = 51 green tests giving false confidence.

**Test-integrity constraint:** the asserted rules must be USER-approved as the spec (not inferred by Claude from the code just written) — present the rule list for sign-off before writing assertions. Never weaken an assertion to match code.

---

## ✅ DONE (2026-07-10) — Timezone drift: UTC "today" vs market-local date columns

**RESOLVED.** Full fix shipped to `main` + staging (commits `0b913b22` G1, `a76b6a4d` mig184+G2, `62e01fad` G3 money, `6279cad6` #11). Every site below now resolves dates in the market's own timezone via the new `src/lib/time/market-dates.ts` helpers; backstops (webhooks/checkout-success) intentionally left on UTC; external-payment sites (#4/#5) out of scope (inactive). mig 184 applied Dev+Staging (Prod PENDING — rides the tz prod push, not yet done). Plan: `apps/web/.claude/timezone_drift_fix_plan.md`. Original audit kept below for reference.

**The bug class migration 054 fixed has reappeared in server code 054 never covered.** `pickup_date` / `event_date` / `scheduled_date` / `end_date` columns hold **market-local** calendar dates (from `local_today` in mig 054). Several server jobs compare them against a **UTC** "today"/"tomorrow" (`new Date().toISOString().split('T')[0]` / `.slice(0,10)`). Every US market is behind UTC, so this drifts by ONE DAY **every evening** (after UTC midnight, before market midnight). All sites below personally verified 2026-07-05.

**INTACT — do NOT touch:** the open/close "accepting orders" window. `get_available_pickup_dates` uses `(NOW() AT TIME ZONE COALESCE(m.timezone,'America/Chicago'))::DATE` (`applied/20260223_054_fix_availability_timezone.sql:48`); `is_listing_accepting_orders`, the batch status RPC, and the availability route all funnel through it (absolute-instant `NOW() < cutoff_at`). This fix holds.

- [ ] **`expire-orders/route.ts` — money-moving day-boundary drift (HIGHEST; ⚠ money path).** UTC "today" vs local date columns:
  - Phase 3 (`:350`) — cancels unpaid external-payment orders (`pickup_date < today`); a valid same-day order looks past-due in the evening.
  - Phase 4 (`:656`) — missed-pickup → **pays vendor** + notifies buyer.
  - Phase 4.6 (`:922`,`:933`) — expires `confirmed` orders (`pickup_date < today`) a day early.
  - Phase 20 (`:2771`,`:2776`) — season auto-end / settlement (`end_date < todayStr`) a day early.
  - Phase 11 (`:2028-2030`,`:2037`) — event 24h prep reminder (`event_date = tomorrowStr` UTC) fires on the wrong calendar day.
  - **THE TELL (inconsistency):** Phases 14/15 in the SAME file (`:2307-2308`) do it CORRECTLY via `new Date(new Date().toLocaleString('en-US',{timeZone: tz}))`. The tz pattern is known + present — it was skipped in the phases above.
- [ ] **`lib/cron/no-show.ts` (⚠ payout timing).** `:47-56` builds the pickup instant as `` `${pickupDate}T${timePart}Z` `` — stamps the market-LOCAL pickup time as UTC, fires the no-show 1h later (`:55-56`) → ~5–6h off for CT markets (comment admits "UTC — cron runs on Vercel/UTC"). Fallback `:62` also uses UTC `today`.
- [ ] **`lib/cron/external-payment.ts:43-47` `getAutoConfirmCutoffDate`.** Returns UTC `yesterday` date → auto-confirms digital external-payment orders a day early relative to the market.
- [ ] **`buyer/orders/route.ts:385-389` (buyer-facing).** UTC `today` vs local `scheduled_date` for "next pickup" — a buyer in the evening sees the wrong next pickup at the day boundary.
- [ ] **`lib/quality-checks.ts:149-150` (+ `:288`,`:477` per sweep, not re-read) — internal scans, low impact.** UTC today/nextWeek windows for low-stock-event detection.
- [ ] **Display-only SQL (low):** `get_listing_market_availability` (`applied/20260203_001_security_fixes.sql:213-214`, per sweep) orders "next schedule" by `EXTRACT(DOW FROM NOW())` (UTC) — wrong upcoming schedule near UTC midnight; `is_accepting` verdict unaffected.
- [ ] **Fallback-only (very low):** membership `start_date` fallbacks (`webhooks.ts:238`, `checkout/success/route.ts:226`, only when startDate missing); server-hour polling heuristic (`polling-config.ts:14`, refresh cadence only, no data correctness).

**Fix approach:** route each site through the per-market tz resolution already in the same files — `nowInTimezoneAsLocalIso(tz)` (`lib/surveys/cron-helpers.ts:75`) or the Phase-14/15 inline pattern — using the row's `markets.timezone`; for cron phases batching across markets, resolve "today" PER market (like Phase 14/15) or filter by absolute instants. **⚠ `expire-orders` is money-moving** — do it as a FOCUSED session with before/after verification + tests (cancel / payout / no-show / season-end timing), NOT bundled with feature work. Separate from the FT-port push.

## Priority 2 — Events: gap fixes + manager/park cross-pollination (2026-07-07 research)

Full code-verified map + gap list + impact/risk/ease matrix: **`apps/web/.claude/events_manager_crosspollination_research.md`**. Goal: raise event quality + recycle manager/park capabilities into events for partner outreach. Actors = event organizer (`catering_requests`, may be account-less) + (NOT YET EXISTING) event-market manager.

**G1/G3/G5 PLANNED + DECIDED 2026-07-10 → `apps/web/.claude/events_booth_gapfix_plan.md`** (verified against current code). Build not started; awaiting go.
- **G1 `review→completed`** — REAL (cron stops at `review`; only admin PATCH completes → events hang, feedback/settlement-summary notifications never fire). **DECIDED:** auto-complete cron, **3-day** grace after `event_end_date` (market-local), unfulfilled → **complete anyway + notify vendor AND vertical admin**; extract completion side-effects into a shared fn; keep admin manual-complete. (No money moves — settlement = notifications, not transfers.)
- **G3 `is_recurring`** — DEAD flag: intake form hardcodes `false`; organizer-editable post-intake; only reader is `viability.ts:482` (a note); NO generator. **DECIDED: REMOVE the promise** (strip organizer toggle + admin display + viability note + details-PATCH accept; leave columns dormant). **Recurrence MAY be built later** — if so, it's a real project: organizer cadence + a cron that materializes the next `catering_requests` occurrence (new event market + token, re-invite vendors, notifications). Not scheduled.
- **G5 no-address self-service** — REAL (stays `new`, no recovery; organizer confirmation email overstates progress). **DECIDED: copy + nudge** — corrected no-address organizer email + a light cron re-surfacing events stuck in `new` after N days.
- **Other event gaps (undecided):** G2 organizer Stripe UNBUILT (company_paid out-of-band) · G7 no `manager_user_id` on event markets → no manager persona (foundational). Tier-1 ports (broadcasts · opt-in statements at join · post-event surveys), Tier-2 (per-event vetting/docs · check-ins · organizer checklist), Tier-3 (manager persona · vendor-paid events) still open.
- **Remaining gating decisions (user):** (1) event-market manager persona (G7)? (2) vendor-paid events? — (G3's "build recurring?" is deferred, not gating.)

## ⭐ NEXT UP (1st to finish AFTER events G1/G3/G5) — FT park-operator public signup form + persona (2026-07-10)

**✅ BUILT 2026-07-11 (UNCOMMITTED, gates green tsc0/lint0), one vertical-aware route (Option 1), NO migration.** Decisions: `park_mode='paid'` on FT create; onboarding-checklist rework deferred (FM-booth-centric — separate item). Files: `api/market-manager/intake/route.ts` (vertical body field → `vertical_id` + FT `park_mode='paid'`; `getEmailFromAddress`/`getEmailBranding` for branded from-address + signup base + park-correct next-steps email), `[vertical]/market-manager-program/page.tsx` (full vertical-switched copy via `copy` object, FT park-operator voice; mailto vertical-aware), `landing/ManagerIntakeForm.tsx` (posts `vertical`; FT "Park name" label + success from-address), `landing/Footer.tsx` (FT footer link → "Park Operators"), `locale/messages/en.ts`+`es.ts` (`footer.park_operators`). **FT pricing copy deliberately soft** (no fixed "$25→$23.37") because `operator_keep_pct` is admin-set per park (0.935→1.000) so the operator's keep varies — user to revise copy. **NEXT: user staging test → commit+push staging (explicit go).** Ships with the FT-port batch (already staged) — no new prod migration.

---

## Market Box — biweekly subscription `original_end_date` term-length mismatch (RESOLVED in DB 2026-07-12 review; one display bug remains → ledger MBX-2)

**VERIFIED 2026-07-12 (slice-6 review):** the mig 124:66-68 formula was SUPERSEDED by mig 125 (`original_end_date = start_date + term_weeks*7`) and preserved by mig 163 — the DB now stores the full term duration (remediation (a), buyer-friendly) for both cadences. `original_end_date` is display-only (completion counts pickups; auto-miss uses scheduled_date+grace; capacity uses active-count). **Remaining:** `buyer/market-boxes/[id]` GET recomputes a third, wrong end date — tracked as MBX-2 in `FINDINGS_LEDGER.md`. The product decision below is settled; kept for history.

Extracted from `market_box_audit.md` (2026-04-24) before that audit was deleted in the 2026-07-12 archive cleanup.

**Bug:** the `original_end_date` trigger math in `supabase/migrations/applied/20260420_124_market_box_biweekly_frequency.sql:66-68` sets `original_end_date = start_date + ((num_pickups - 1) * interval)`. So a **"4-week" / "1 Month"** biweekly sub (`num_pickups=2`, `interval=14`) ends at **week 2**; an **"8-week" / "2 Months"** biweekly (`num_pickups=4`) ends at **6 weeks** — but the buyer was sold the longer term (`api/market-boxes/[id]/route.ts:166-175`). Affects the buyer "subscription ends" display (`buyer/subscriptions/page.tsx`), the completion cron reading `original_end_date`, and vendor capacity planning.

**Two remediations (pick one):**
- **(a) Buyer-friendly:** a 4-week biweekly lasts 4 weeks total (pickups weeks 0 & 2, ends week 4) → `original_end_date = start_date + (term_weeks * 7)`.
- **(b) Compact-pickups:** keep current behavior, relabel UI ("2 weeks of biweekly pickups", not "1 Month").

The two CRITICAL payout bugs from the same original audit were already resolved (per `market_box_audit_v2.md`, kept in the archive).

---

**Gap (verified, now built):** there was NO food-truck park-operator public signup. The public manager intake was farmers-market-only:
- `/[vertical]/market-manager-program` (renders `ManagerIntakeForm`) → `/api/market-manager/intake`, which **hardcodes** `vertical_id: 'farmers_market'` + `market_type: 'traditional'` (`intake/route.ts:223-225`). Even at `/food_trucks/market-manager-program` it creates an FM market, and the confirmation email/signup links default to `farmersmarketing.app`. Both the page (`market-manager-program/page.tsx:16-21`) and the route (`intake/route.ts:24-25`) docstrings state the FT park-operator persona is deferred.
- **Today the only way to get a park manager** is admin/seed sets `manager_email` on an FT (`vertical_id='food_trucks'`) market → manager logs in (first dashboard load backfills `manager_user_id`, the Option A auto-link) → sets `park_mode='paid'` on `/food_trucks/market-manager/[marketId]/dashboard` → `ParkSpotsManager` (spots). No self-serve public entry.

**To build:** an FT-flavored public intake that (a) creates a `food_trucks` market with `park_mode`-ready defaults (not a hardcoded FM `traditional` market), (b) FT/park copy on the program page (spots, not booth tiers), (c) FT signup/confirmation emails using the `foodtruckn.app` base + `food_trucks` vertical + FT signup URL, (d) ties into the **park-shaped FT onboarding checklist** (existing backlog item below — add spots → park to paid → Stripe → agreement statements). Likely: a `vertical`/`market_type` param on the intake route (or a separate FT intake route) + a park-operator landing page variant. Confirm whether one intake route with a vertical switch is cleaner than a second route.

**Testing note (current, pre-build):** to exercise the park end-to-end now, start from the seeded staging park **"Sixth Street Food Park"** (manager_email `foodtrucknapp+parkmgr1@gmail.com`, `manager_user_id` already linked) → log in → dashboard → park_mode paid → add spots → (truck account) `/food_trucks/markets/<id>/book-spot`. Related: the "Park-shaped FT onboarding checklist" item below.

## Priority 1 — Sales tax: Stripe Tax (calc) + TaxCloud (filing) — readiness mapped, BUILD AFTER current features

Full readiness map + checklists + open questions: `apps/web/.claude/sales_tax_readiness.md`. **Priority once current in-flight features land.** Reframes the long-pending "sales tax module": Stripe Tax calculates/collects, TaxCloud files — we are NOT building a calculator.

- **We are the Merchant of Record (marketplace facilitator):** platform calculates/collects/remits using the PLATFORM's Stripe Tax registrations; vendors (connected accounts) don't collect or file.
- [ ] **⚠️ Critical-path:** withhold tax from vendor payouts — buyer pays subtotal + our fees + tax; the vendor's cut must EXCLUDE tax. Touches `pricing.ts`, checkout-session creators, `payments.ts`/`webhooks.ts`, payout/transfer math (all protected — per-file approval, record before/after).
- [ ] Enable `automatic_tax[enabled]=true` + `liability[type]=self` + `invoice issuer=self` on every Checkout Session creator; capture `total_details.amount_tax` in webhooks/orders.
- [ ] Product → Stripe tax-code classification (FM produce often exempt vs FT prepared food taxable — real over/under-charge risk).
- [ ] Account setup (no code): Stripe tax settings + per-nexus-state registrations; TaxCloud business profile (FEIN, origin, nexus states), TIC code, Link Stripe → Go Live.
- [ ] **Verify before building:** (1) does TaxCloud file off Stripe-collected tax or re-derive via TIC (reconciliation risk)? (2) does TaxCloud's Stripe integration support the Connect/platform-level model? (3) nexus/facilitator obligations per state (tax advisor); (4) correct tax codes per food category; (5) exact Stripe Tax + TaxCloud non-SST (Texas) pricing.
- [ ] **WHEN THIS SHIPS — update the `vendor-sales-tax` opt-in statement** (`market_optin_statement_catalog`). Currently (mig 178) it's vendor-responsibility ONLY, because claiming "the platform collects & remits sales tax on my behalf" would be false until this module is live (same principle as the SNAP exclusion). Once the platform is MoR and actually collecting/remitting: reword `vendor-sales-tax` to note the platform handles tax on platform sales while the vendor stays responsible for cash/other off-platform sales (user request 2026-07-04). Do it as a data migration UPDATE on that row.

## Priority 1 — Vendor product categories: keep selling exclusive, capture booth revenue (Session 92, 2026-06-13)

Full concept + phased plan + locked decisions: `apps/web/.claude/vendor_product_categories_concept.md`. FUTURE build, not scheduled.

Principle (verified): selling and booth-renting are separate code paths — add a `sell_eligible` selling gate, leave booth-rent open. 4 categories: 1 Homemade/Handmade/Homegrown + 2 Hand-finished/Personalized = sell-eligible; 3 Personal-design/machine-produced + 4 Retail/Resale/Pre-owned = NOT sell-eligible (booth rent only). Strict cat 1&2; self-categorize at first interest before onboarding; no retro-classify existing vendors.

- [ ] **Phase 1 — Exclusivity gate (priority, ships alone):** signup front-step self-categorization (cat 3/4 blocked from selling, reinforced messaging); `vendor_profiles.production_category TEXT[]` + `sell_eligible` (1 mig); enforce `sell_eligible` at listing-publish + market-box-create (airtight — every selling entry point); opt-in clause "products must stay in supported categories / may be removed without notice"; manager-onboarding messaging (platform for cat 1&2; invite cat 3&4 for booth rent only — use judgment).
- [ ] **Phase 2 — Option C booth revenue:** manager attaches a booth-rent payment link to an off-platform `market_booth_placeholders` row → vendor pays no-login → webhook records. Reuses `calculateBoothRentalFees` + destination-charge pattern. ~1 mig + manager UI + no-auth payment page + webhook.
- [ ] **Phase 3 (later) — Option B:** lite self-serve booth accounts for cat 3/4 (`sell_eligible=false`, selling UI hidden, buyer-invisible, bookings-only dashboard). Re-decide COI then.
- To draft when picked up: exact cat-3/4 rejection copy; signup placement; whether event vendors are gated too.

## Priority 1 — Growth feature set: Regional-Manager / market-operations (Session 92 deep dive)

Full spec + user decisions: `apps/web/.claude/session92_events_mm_growth_research.md` §J (+ §H/§I for the RM model corrections). Composable-roles principle: roles stack, never merge. FUTURE build — user-approved direction, not yet scheduled.

- [ ] **Phase 1B (manager suspend/restore + history UI)** — already designed (`manager_export_and_lockout_plan.md`); PRIORITY BUMPED: it's the RM governance + future license-fee enforcement lever (`manager_status` = the off-switch). Includes mig 154 → Prod.
- [ ] **Build-now candidates** (small/low-risk, ~½-1 session each): manager visibility-gate transparency card; manager-net earnings card (calculateBoothRentalFees().managerReceivesCents over paid rentals); open-booth counts on vendor's CONNECTED markets only; market follows (mirror vendor_favorites) + market-day-morning + special-date notifications w/ audience-resolution helper; manager broadcast (one-way, rate-limited, existing rails — supersedes the Session 85 "broadcast to existing market vendors" item below).
- [ ] **Design-first**: (a) per-market rental granularity (weekly|daily|half-day) + SEASON PREPAY (user design 2026-06-12: manager-set prepay window, X-day refund cap, cancelled-day counter, season-end settlement menu: make-up days via date-overrides / rollover credit / booth upgrade / cross-market credit / cash last resort — vendor picks from manager's offers; ONE Stripe checkout, NO subscriptions — avoids destination-charge clawback exposure); (b) market_date_overrides (cancel-a-date + special dates; booth fees → credit, buyer product orders → existing refund machinery — user-accepted exception); (c) vendor check-ins: start/stop day, server timestamp, Geolocation API + distance-from-market, self-attestation primary; OPEN: FT-law jurisdiction requirements + whether manager counter-signature is needed.
- [ ] **Survey-proof pipeline** — cron already LIVE (vercel.json:17-19 hourly, verified Session 92); once real data accumulates: exportable stats (pairs w/ manager_export plan) + optional public market-profile badge (manager acquisition + non-profit funding numbers).
- [ ] **Deferred within this set**: VIP customer tagging (launch with flash sales, not before); market templates ("copy from my other market"); RM program pitch page + license fee model (user decision pending — geo/population-protected territory).

## Priority 2 — Schedule-conflict trigger: vendor dead-end for event/inactive-market commitments (2026-07-03)

**Real vendor-facing dead-end** found while testing (staging, `foodtrucknapp+truck3`): a single-truck vendor got `Schedule conflict: overlapping times with "TruckTime - Parking lot roundup"` and could NOT clear it from any UI. Root cause: the DB trigger `check_vendor_schedule_conflict()` (`supabase/migrations/applied/20260303_066_schedule_conflict_trigger.sql:52-66`) counts an active `vendor_market_schedules` row at ANY other market on the same day with overlapping hours — but it does **not** filter on `markets.market_type` or `markets.active`. So a commitment at an **event-type** (or archived) market blocks booking a **traditional location**, and the vendor UI only lets them manage traditional-location attendance → no self-serve way out. Manual fix used: `UPDATE vendor_market_schedules SET is_active=false WHERE id=<row>` (found via a by-market-name SELECT; the email→user_profiles path failed — emails may live in `auth.users`, `user_profiles.email` null).

- [ ] **Pick a direction (user, undecided):**
  - **(a) Narrow the trigger** — only conflict against active **traditional** markets (events already have their own date-based commitment check in `api/vendor/events/[marketId]/respond/route.ts:204`); a DB migration replacing the trigger fn + snapshot update. Simplest; removes the false conflict class entirely.
  - **(b) Vendor "my commitments" view** — surface event + all attendance the vendor can toggle off (self-serve clear). More work; also helps beyond this bug.
- [ ] Regardless of direction: consider a robust vendor-lookup-by-email helper (this session's email join broke because `user_profiles.email` was null — confirm where email actually lives before relying on it in future support SQL).

## Priority 2/3 — FT park-manager: post-P5 gaps (2026-07-03, from staging testing)

- [x] ~~**Vendor-facing agreement acceptance not wired for park bookings (P2 — compliance gap).**~~ **DONE 2026-07-05** (commit `724ad3ce`): `BookParkSpotForm` renders `MarketAgreementBlock` (gates Book + Request-hold); `book-park-spot` + `standing-reservation` record `vendor_market_agreement_acceptances` (mirror of FM `book/route.ts`) and pass `p_acceptance_id`. Original report kept for reference: [book-park-spot passed p_acceptance_id null; P5 shipped the manager-side picker; vendor-side acceptance was the missing half].
- [ ] **Reconcile the booth money paths under one operator-keep mechanism (P3 — no hurry unless something breaks).** P6 wires `markets.operator_keep_pct` for **FT park-spot only** (`createParkSpotCheckoutSession` via the booking route + `pricing.ts`). FM booth (`createBoothRentalCheckoutSession`) + season (`createSeasonBoothCheckoutSession`) use the SAME `calculateBoothRentalFees` math but won't read the keep rate. Once FT is proven, evaluate whether all three booth checkouts should share one operator-keep mechanism (they're the same fee surface) — combine/reconcile so an admin-granted rebate applies uniformly. Not urgent; revisit if a manager operates both an FM market and an FT park, or if the projection-tool's cross-vertical framing needs it live. Plan: `ft_p6_operator_keep_plan.md`.
- [ ] **B (book-then-vet) — non-blocking vendor vetting for park bookings (2026-07-05, user-directed).** Direction locked: FT adopts FM's vetting spirit but **does NOT block booking on docs**. Pieces: **B1** required doc-responsibility acknowledgment at booking (checkbox; "provide accurate/timely/complete docs or the operator may cancel without refund + decline future bookings" — wording in `fm_regroup_ft_money_vetting_plan.md` Part 3); **B2** auto-create a pending `market_vendors` row on first park booking so the truck lands on the manager's roster to vet; **B3** required-doc upload UX + manager vetting surface + cancel-without-refund enforcement (ties to HB2844 doc-vault). **Key requirement (user):** without blocking booking, the **park manager gets a notification when a truck has new docs to review**, plus the surrounding required communications/steps so vetting runs smoothly. Build AFTER the FM-regroup + FT-port prod push.
- [ ] **Park-shaped FT onboarding checklist (2026-07-05).** The shared `OnboardingChecklist` tracks `market_booth_inventory` (FM booth tiers) → never completes for FT parks, so it's hidden (`dashboard/page.tsx:202-209`, P2.5). Build an FT-appropriate checklist: add spots → switch park to paid → connect Stripe → pick agreement statements. Small; own effort.
- [ ] **Seed-vendor `stripe_payouts_enabled` inconsistency (P3 — test-data hygiene).** Seeded FT vendors can have `status='approved'` + `onboarding_completed_at` + published listings + a `stripe_account_id` but `stripe_payouts_enabled=false` (found on `802ad912…`, category_verifications "Seed data"). That makes onboarding read incomplete (`canPublishListings` requires `stripePayoutsEnabled`, `onboarding/status/route.ts:223`) and the dashboard prompt for Stripe — even though the vendor looks set up. Not a prod risk (real vendors can't publish without the flag). Fix in the seed scripts: set `stripe_payouts_enabled=true` (and `stripe_charges_enabled`/`stripe_onboarding_complete`) for any seeded vendor with published listings, so testers don't hit the false "set up Stripe" loop. Workaround used this session: re-run Stripe test onboarding (or one-field UPDATE).

## Priority 2 — FT vertical: HB 2844 DSHS licensing (Texas) — direction set, BACKLOGGED (2026-06-21)

Full plan + authoritative statute (Health & Safety Code Ch. 437B) + info-gaps revisit checklist: `apps/web/.claude/ft_hb2844_licensing_plan.md`. **Deferred behind more urgent work (sales tax).**

- **Direction = Option C (Hybrid), decided 2026-06-21:** `texasfoodtrucklaw.com` (owned) = public SEO funnel + heavy/volatile truck-owner compliance tooling (the law, classification wizard, doc checklist, deadline countdown, license lookup); **the app** = a thin, durable compliance-*status* layer serving the **FT-park-manager "premium destination" thesis** (truck doc vault + renewal reminder, park-dashboard "X of Y trucks license-ready" signal reusing FM manager-views-vendor-docs, "DSHS-licensed" trust badge, auto-itinerary §437B.154 from existing schedule data). Principle: **app = source of truth for identity + status; TFTL = mostly public/stateless.** v1 coupling = TFTL→app deep-link handoff + pre-fill (no live sync); bidirectional sync + shared license-lookup = later. Do NOT put TFTL on core marketplace tables. Data weight is NOT the concern (all 5 features reuse existing doc + location data) — volatility/liability/audience are, and Option C pushes those onto the standalone domain.
- [ ] **When un-backlogged (cheap, no build):** (1) validate `texasfoodtrucklaw.com` search-volume thesis (checklist §C); (2) scope which thin app-side signals reuse existing FM-manager components 1:1; (3) re-pull DSHS adopted rules (Type I/II/III categories, fees, inspection cadence — due ~May 1 2026) + map the live Tyler/Online-Licensing portal screens. See the plan's "Information gaps — revisit checklist."

## Priority 1.5 — Session 92 fresh-review deferrals

- [~] **F6: expire-orders cron Phase 1 N+1 batch prefetch** — **PARTIALLY DONE 2026-07-11 (option a).** Collapsed the two loop-invariant per-item reads into per-batch prefetch (JS Maps): total-items count + succeeded-payment lookup now 2-per-batch instead of 2×N. Structural: ~2N → 2 for those (for N=100, ~200 → 2; total flagged reads ~300 → ~102). Per-item UPDATE/inventory RPC/remaining-items/notifications untouched. Code-stability Rule 2.1: before 3 reads/item, after 1 read/item + 2/batch.
  - [ ] **Remaining-items check (#3) — REVISIT: is it worth collapsing?** The `remaining-items` query (`expire-orders` Phase 1, `.eq('order_id').is('cancelled_at', null)`) reads LIVE state that changes as the loop cancels items AND catches concurrent manual cancels. Collapsing it needs an in-memory cancelled-set, which would miss a concurrent mid-batch manual cancel in the order-status rollup (minor status edge on a refund-adjacent path). Deferred (user, 2026-07-11) — evaluate whether the extra ~N-query saving justifies the concurrent-cancel trade-off before doing it.
  - [ ] Same minor N+1 shape in surveys cron (`surveys/route.ts:263-270`) — not yet touched.

- [ ] **Admin notification on failed Stripe refunds** — follow-up to Session 92 F4 (failed refunds now logError ERR_REFUND_001 → visible in error-log review). v2: fire an admin notification (new template + registry entry + i18n keys) so failed refunds page someone instead of waiting for the next kickoff review. Also consider a cron retry sweep for refund failures (relates to F3 in `session92_fresh_review_research.md` — webhook auto-refund failures ERR_WEBHOOK_011 have no retry either).

## Priority 2 — Mig 153 (X1b): lock down ~28 trigger/utility SECURITY DEFINER functions (Session 87)

> **⚠️ READ FIRST when picking this up:** `validate_cart_item_schedule` was MISSED from mig 152's scope. It follows the same pattern as `validate_cart_item_inventory` and `validate_cart_item_market` (both covered by mig 152) but was overlooked when drafting. Include it in mig 153's REVOKE list — same DO-block pattern, REVOKE FROM PUBLIC + anon + authenticated. Confirmed via Session 87 Prod advisor: function still appears in the anon-callable list.

- [ ] **REVOKE EXECUTE FROM PUBLIC + anon + authenticated on ~28 trigger/utility functions** — Discovered during Session 87 Prod advisor re-check post mig 152. Mig 152 closed the X1a financial-RPC gap (confirmed by advisor — all 17 financial functions no longer flagged as anon-callable). Remaining ~186 advisor warnings split into 4 buckets:
  - **Bucket 1 (real concern, ~28 functions — this work):** Internal trigger/utility functions designed to be called by Postgres on table events or by service code, NOT by external API callers. They're SECURITY DEFINER + PUBLIC EXECUTE so they appear at `/rest/v1/rpc/<name>`. Functions: `auto_add_schedule_to_vendors`, `auto_cancel_order_if_all_items_cancelled`, `auto_create_vendor_schedules`, `auto_create_vendor_schedules_insert`, `auto_create_vendor_verification`, `check_vendor_schedule_conflict`, `check_subscription_completion`, `cleanup_cancelled_event`, `cleanup_cart_items_invalid_schedules`, `create_market_box_pickups`, `create_profile_for_user`, `enforce_listing_tier_limit`, `enforce_market_box_tier_limit`, `ensure_admin_premium_tier`, `ensure_user_profile`, `handle_market_schedule_deactivation`, `handle_new_user`, `notify_transaction_status_change`, `refresh_all_vendor_locations`, `refresh_vendor_location`, `scan_vendor_activity`, `set_listing_premium_window`, `set_market_box_premium_window`, `sync_verification_status`, `track_vendor_status_change`, `trg_refresh_vendor_location`, `trigger_cleanup_cart_on_schedule_change`, `update_vendor_activity_on_listing`, `update_vendor_activity_on_order`, `update_vendor_fee_balance`, `update_vendor_last_login`, `build_pickup_snapshot`, `calculate_order_item_expiration`, `find_next_available_wave`, `validate_cart_item_schedule` (missed from mig 152 — similar to the other `validate_cart_item_*`).
  - **Bucket 2 (auth helpers — bundle into mig 153 with REVOKE from anon only, keep authenticated EXECUTE):** `is_admin`, `is_admin_for_vertical`, `is_any_admin`, `is_platform_admin`, `is_regional_admin`, `is_verifier`, `is_vertical_admin`, `has_role` (2 overloads), `can_admin_market`, `can_admin_order`, `can_admin_vendor`, `can_delete_schedule`, `can_vendor_add_fixed_market`, `can_vendor_add_listing_to_market`, `can_vendor_publish`, `can_access_pickup`, `can_access_subscription`, `user_owns_vendor`, `user_is_subscription_buyer`, `user_is_subscription_vendor`, `user_buyer_order_ids`, `user_vendor_order_ids`, `user_vendor_profile_ids`, `get_buyer_order_ids`, `get_vendor_order_ids`, `get_user_admin_verticals`, `get_user_vendor_ids`, `get_vendor_fixed_market_count`, `get_vendor_fixed_market_limit`, `get_vendor_listing_count_at_market`, `get_schedule_active_order_count`, `is_order_buyer`, `vendor_has_active_schedules`, `vendor_skip_week`.
  - **Bucket 3 (accept — intentional public buyer browse):** `get_listings_within_radius`, `get_markets_within_radius`, `get_vendors_within_radius`, `get_nearby_zip_codes`, `get_region_zip_codes`, `get_zip_coordinates`, `get_listing_fields`, `get_vendor_fields`, `get_listing_markets_summary`, `get_listing_open_markets`, `get_listings_accepting_status`, `get_available_pickup_dates`, `get_vendor_next_pickup_date`, `is_listing_accepting_orders`, `get_event_waves_with_availability`, `get_vertical_config`, `st_estimatedextent` (3 PostGIS overloads). Per mig 149 file comments, these are confirmed-intentional. Long-term refactor option: convert each to SECURITY INVOKER + add RLS on underlying tables; for now, accept and document the advisor warnings.
  - **Bucket 4 (misc — bundle into mig 153 if convenient):** Add `SET search_path = public` to `check_subscription_completion` and `create_market_box_pickups` (the 2 mutable-search-path warnings). **✅ Re-confirmed 2026-08-02: still exactly these two.** A fresh catalog query (excluding extension-owned functions) returned a real count of 2, and **zero** `SECURITY DEFINER` functions are missing `search_path` — so this bucket is hygiene, not exposure. The scary-looking 723/203 advisor counts are PostGIS. See the *"Supabase advisor cleanup round"* LOW item above for the full triage + 6 FK indexes to bundle here. Verify `buyer_interests` RLS policy `WITH CHECK (true)` for INSERT is intentional (likely yes — public form). `listing-images` + `vendor-images` "Public can view" SELECT policies kept intentionally per mig 150 (for `<img src>` URLs) — accept. PostGIS extension in public schema — accept (Supabase default).
  - **Verified caller audit needed** before drafting mig 153 — same Explore-agent approach as mig 152. Especially scrutinize Bucket 1's `validate_cart_item_schedule` (likely auth-gated cart route only) and the trigger functions (should be zero RPC callers; if any exist in code that's a bug).
  - **Estimate:** ~1 hr to audit + draft mig 153, ~30 min to apply across all 3 envs (Dev → Staging → Prod). Apply mig 152 pattern: paste-and-verify on Dev, then Staging, smoke test, then Prod. Add a verification query at the bottom that confirms zero `=X/...` (PUBLIC) entries remain in `proacl` for the ~60 functions.
  - **Estimated impact on warnings:** drops the advisor count from ~186 to ~17 (only Bucket 3 + Bucket 4 minor warnings remain).

## Priority 2 — Broadcast to existing market vendors (deferred from NEW-8 Commit 7)

- [ ] **Manager broadcast surface for already-affiliated vendors** — Session 85 design intent (2026-05-26): when a manager wants vendors who are ALREADY at their market to know about new platform capabilities (e.g., "you can now book booths week-by-week via the platform"), the invitation flow can't reach them — they're filtered out by spam protection that excludes any vendor with an existing `market_vendors` row at the market. A separate one-off announcement / broadcast surface is needed.
  - **Options to consider:** (a) in-app banner on `/[vertical]/vendor/markets` shown to vendors at managed markets ("Your market manager mentions: ..."), (b) one-shot manager-initiated email blast via existing notification template registry, (c) market-profile-page banner visible to anyone affiliated with the market.
  - **Out of scope for v1 NEW-8** — invitation flow is for NEW affiliations only; this is informational outreach to EXISTING affiliations.
  - **Estimate:** depends on approach; in-app banner ~30 min, email blast ~1.5hr with rate-limit safeguards.

## Priority 2 — Manager-initiated invitation revoke (deferred from NEW-8 Commit 5)

- [ ] **Allow manager to revoke a pending invitation they sent** — User's design intent (2026-05-25): "if a manager invites a vendor to the market they can uninvite them — but they cannot remove them from the market on the app. that is a separate issue." Captures the carve-out that should exist: managers MAY revoke an invitation while it's still in `response_status='invited' AND approved=false`, but MAY NOT remove an active vendor (any other state).
  - **Current blocker:** flow-integrity test at `src/lib/__tests__/flow-integrity.test.ts:340-397` enforces a blanket "no manager API endpoint deletes from market_vendors" rule. The rule was written before manager-initiated invitations existed and doesn't anticipate the pre-response-revoke carve-out.
  - **Two options at design time:**
    - **(A) Soft-revoke** — add `'revoked'` as a 4th `response_status` value. Manager PATCH sets it instead of DELETE. Row stays for audit (admin can see manager invited then revoked). Test passes unchanged. Manager re-inviting same vendor flips the revoked row back to `'invited'`. **Recommended.**
    - **(B) Hard-delete with rule refinement** — update flow-integrity test to allow DELETE only when `response_status='invited' AND approved=false`. Weakens the boundary slightly but reflects user's stated intent more directly.
  - **Without revoke (today's state):** vendors who never respond get auto-declined by cron Phase 17 after 30 days. Clutters the manager's pending-invitations view for up to 30 days but is self-cleaning.
  - **Estimate:** ~1hr for A, ~30 min for B.

## Priority 1 — COI upload button hidden for vendors with grandfathered placeholders (Session 87, 2026-06-02)

- [x] ~~**Vendors with grandfathered_coi placeholder rows can't see an Upload COI button**~~ — RESOLVED (verified 2026-06-24): Option A already implemented in `COIUpload.tsx:65-71` (`hasRealDoc` placeholder check → `showUploadButton = coiStatus !== 'approved' || !hasRealDoc`) + button label switches to `'+ Upload COI'` at `:170`. Backlog entry was stale (fixed in a prior session, never checked off). Original report kept for reference. Discovered during the Session 87 Prod smoke test. The vendor's `vendor_verifications.coi_documents` JSONB array contains rows where both `url` and `path` are null/empty (filenames like `grandfathered_coi`, `test_coi`, `coi_2026.pdf`) — placeholders inserted when admin approved the vendor without an actual file upload. `coiStatus` ends up `'approved'` (because the verification record is approved), and `COIUpload.tsx:146` hides the upload button entirely when `coiStatus === 'approved'`. New `VendorDocLink` (X3) correctly renders "Document unavailable" for the placeholder row, replacing the prior `<a href="">` no-op clickable link. Net effect: vendor can SEE that the doc is missing but has NO way to upload a real COI without admin intervention. On staging ~19 of 20 COI rows are placeholders; likely similar on Prod.
  - **Recommended fix (Option A from session 87 discussion):** relax `COIUpload.tsx:146` condition from `coiStatus !== 'approved'` to also show the upload button when every `coiDocuments[]` entry lacks both `path` AND a parseable `url` (i.e., all rows are placeholders). When the vendor uploads, status flips to `'pending'` and admin re-reviews the real file. Button label switches to `'+ Upload COI'` (not `'Replace COI'`) when only placeholders exist. **Estimate:** ~15 min, one-file frontend change.
  - **Alternative (Option B):** correct the status server-side at `/api/vendor/onboarding/status` — return `coiStatus='not_submitted'` when all docs are placeholders. Touches an API consumed by several callers. ~30 min.
  - **Independent of mig 151** — upload button visibility is purely client-side; signed-URL / private-bucket changes don't affect it.

## Priority 1 — Phase C Prod deploy + Session 83 follow-ups

- [x] ~~**Migrations 138/139/140/141/142/143 to Prod + push 23 commits to `origin/main`**~~ — Shipped Session 87 (2026-06-02). Actual scope ended up larger: migs 138-148 + 149 re-run + 152 (new — REVOKE FROM PUBLIC closing the X1a inheritance gap) applied to Prod; 52 commits pushed via `PUSH_WINDOW_OVERRIDE=hotfix`; mig 151 application + bookkeeping commit pending in same session.

- [x] ~~Notification: failed booth rental purchase~~ — Shipped in commit `e4c5206c` (Session 83). Fires `booth_rental_payment_failed_vendor` from cron Phase 16.

- [x] ~~Notification: vendor + manager when booth rental is PAID~~ — Shipped in commit `e4c5206c` (Session 83). Fires `booth_rental_paid_vendor` + `booth_rental_paid_manager` from webhook.

- [x] ~~**Booth-renter notification gap on schedule changes**~~ — RESOLVED (verified 2026-06-24): `schedules/route.ts:389-402` queries paid future-week renters (`.eq('status','paid').gte('week_start_date', thisWeekStartStr)`) and adds them to the deduped `recipientUserIds` Set alongside approved vendors. Backlog entry was stale. Original report below.

- [ ] **Refund policy notice on booking form** — Locked design: "Once you book and pay, the booth is yours for the selected week. If the market is closed or cancelled for that week, the market manager will either refund you or invite you to set up on a future market date — their call." Placement: below the price card, above the agreement block in `BookBoothForm.tsx`. The block was built then reverted mid-session — re-add when ready. **Estimate:** 15 LOC.

- [ ] **Stage 3 amount reconciliation** — Webhook handler currently trusts `session.amount_total` matches expected `vendor_pays_cents`. Add a defensive check that flags discrepancies via TracedError. Low priority — destination charge model guarantees consistency unless Stripe mid-flight changes our `transfer_data.amount`, which it doesn't.

- [ ] **Stage 3 `account.updated` webhook → markets.stripe_* sync** — Currently lazy-sync via the status route works fine. Webhook-driven sync would be marginally faster for status changes but adds complexity. Defer until real ops experience shows it's needed.

## Priority 1.5 — Booth allocation time-awareness (gap G13 from session83_mm_audit.md)

- [x] ~~**Off-platform booth placeholders aren't time-aware + same-week double-booking is possible**~~ — **CLOSED 2026-07-10 (verified).** (1) Placeholder "always occupied" is **BY DESIGN** (user 2026-07-10): off-platform placeholders = season-long renters who predate the platform, so week-blind capacity counting is correct; anyone attending only some weeks uses the weekly-rental flow. No `week_start_date` needed. (2) Same-week double-booking is **ALREADY FIXED** — mig 144 partial unique index `idx_wbr_market_week_booth (market_id, week_start_date, booth_number)` + mig 146 cross-table trigger; manager PATCH maps conflicts to 409. Original report kept below.
- ~~Two connected problems:~~
  1. `market_booth_placeholders` is time-invariant. A placeholder for booth #5 reduces capacity EVERY week, even if the off-platform vendor only shows up some weeks. Schema change needed: add `week_start_date DATE NULL` to `market_booth_placeholders` (NULL = always-occupied today's default; specific date = that-week-only). Update the capacity check in `/api/vendor/markets/[id]/book` accordingly. Also update `market_booth_placeholders` UNIQUE constraint from `(market_id, booth_number)` to allow multiple rows for the same booth on different weeks. Tricky: needs `UNIQUE NULLS NOT DISTINCT` semantics or partial index.
  2. Manager assigns `booth_number` AFTER booking — two paid bookings for the same week + same size could both get the same booth_number with no system check. Add `UNIQUE (market_id, week_start_date, booth_number) WHERE booth_number IS NOT NULL` partial index on `weekly_booth_rentals`.
  Raised by user 2026-05-19. ~2 hr work. Session 83.

- [ ] **Two-vendors-share-a-booth edge case** (task #31 — see notes there). User has flagged this as a real case (e.g., two vendors splitting one booth on different days of a market week or rotating). Currently no system support — manager just assigns same booth_number to two vendors and the UI doesn't surface the share. Needs design pass before code. Session 83 noted.

- [x] ~~**Booth label range can drift from inventory total after initial save (mig 144 follow-up)**~~ — **LARGELY RESOLVED 2026-07-10 (verified).** `reconcileBoothLabelsAfterInventoryChange` (`lib/markets/booth-label-drift-server.ts:24`) is called on all 3 inventory mutation routes (POST `booth-inventory/route.ts:135`, PATCH/DELETE `[inventoryId]/route.ts:124,174`) and auto-clears the label range on drift; save-time validator still enforces equality. **Residual narrow gaps only:** `detectBoothLabelDrift` (`booth-labels.ts:139-141`) returns null (no clear) on unparseable labels / prefix mismatch / `end<start`; reconcile is non-transactional vs an in-flight booking. Optional tiny hardening (clear on those edge cases too) or accept+document. Original report below.
- ~~The PUT /booth-labels validator enforces `range count === sum(market_booth_inventory.count)` at save time. But the booth-inventory routes (POST / PATCH / DELETE on `/api/market-manager/[marketId]/booth-inventory/...`) have NO equivalent check.~~ Sequence that drifts the state: manager saves labels `"1"..."8"` when total inventory is 8 → later adds another size tier with 2 more booths → inventory total = 10 but range is still 1..8. At booking time the RPC raises `LABELS_EXHAUSTED` (P0004) once the 9th vendor tries to book, OR if either column is NULL the RPC silently falls back to defaults. Manager sees no warning until the failed booking surfaces in `error_logs`. Surfaced 2026-05-20 (Session 84) alongside mig 144 (`apps/web/.claude/booth_auto_assignment_plan.md` § Known edge cases).

  **Fix options (decide before code):**
  1. **Validate on inventory mutation** — booth-inventory POST/PATCH/DELETE routes check whether the new total matches the configured range. If not, return 409 telling the manager to re-save labels first, OR auto-clear labels with a returned warning. ~30 LOC.
  2. **Auto-extend on growth** — if inventory total grows and the prefix is purely numeric, auto-extend `booth_label_end` by the delta. Doesn't handle shrinks or non-numeric prefixes cleanly. ~20 LOC.
  3. **Dashboard warning banner** — surface "Booth labels are out of sync with your inventory (range covers 8 booths, you have 10)" on the manager dashboard. Doesn't fix the broken-booking failure mode but makes the inconsistency visible. ~25 LOC.

  Recommendation: ship option 1 (auto-clear with explanation) as the v1 fix — simple, deterministic, surfaces the problem at the moment the manager caused it.

- [ ] **Admin dashboard data disconnect — "9 orders stuck for 24+ hours" banner vs Vendor Activity page shows all zeros (Session 84, 2026-05-22)** — Bottom-of-admin-panel red banner reports "9 orders stuck for 24+ hours" but `/farmers_market/admin/vendor-activity` shows all category counts at 0. Two different queries against (likely) two different sources — banner uses one stale-order filter, the page uses category-grouped counts that filter differently. Need to: (1) trace both query sites, (2) align the filter definitions OR have the page show the same number(s) the banner uses, (3) verify both refresh on the same cadence. Unrelated to market-manager work — separate admin-dashboard investigation. Found during manager-intake testing pass.

- [ ] **Require booth-tier selection when adding off-platform + on-platform vendors (feedback item #4, Session 84)** — Surfaced from manager testing 2026-05-22. Currently:
  - `market_booth_placeholders.inventory_id` is OPTIONAL ("— No size —" in the dropdown); manager can save an off-platform placeholder without declaring which size tier it occupies. Capacity math correctly subtracts the placeholder from the relevant tier ONLY when `inventory_id` is set; un-tiered placeholders just reduce the total count without telling the system WHICH tier is full.
  - On-platform vendors via `market_vendors` have a `booth_number TEXT` but no link to a booth-inventory tier — manager has no way to declare "Smith Farm is in the 10×10 row." The auto-assignment / capacity check has no way to know which tier each existing vendor occupies, so the "how many of each tier remain" math is fuzzy.

  Fix (needs code review before changing):
  1. Make `inventory_id` REQUIRED on placeholders. UI: dropdown defaults to "— Select size tier —"; Save disabled until selected. API: route returns 400 if missing.
  2. Add a tier selector to on-platform vendor rows in `VendorBoothList`. Schema change needed: `market_vendors.inventory_id UUID NULL REFERENCES market_booth_inventory(id) ON DELETE SET NULL` + same-market integrity trigger (mirror mig 135 pattern).
  3. Existing rows: backfill to NULL initially; UI shows "tier not set" warning. Manager fills in over time.

  Estimate: ~1-2 hr work (schema migration + UI for both placeholders and vendors). Session 84.

- [ ] **Structured manager-verification docs upload (feedback item #6 follow-up, Session 84)** — When the intake form's fuzzy match flags a possible duplicate (same name + city as an existing market), admins are currently told to email the prospective manager and request ownership proof, COI, etc. manually. A v2 build would add a structured docs-upload UI on the manager dashboard (similar to the vendor 3-gate verification system at `src/app/[vertical]/vendor/onboarding/`) so the prospective manager can upload ownership docs + COI directly, admin reviews via a queue UI, and approval moves the market from `pending` → `active`. Scope when ready: new `manager_verification_docs` JSONB column on `markets` (or a separate table), upload UI, admin review queue, decline-with-reason flow. Until then, the email warning + admin detail-page banner cover v1. Session 84.

- [ ] **Existing-vendors step required in onboarding wizard (feedback item #5, Session 84)** — Surfaced from manager testing 2026-05-22. Currently the onboarding wizard's "vendors" step + "placeholders" step are both optional (manager can skip and reach Setup Complete without declaring any vendors). User wants:
  - Make both steps required to complete onboarding.
  - Add an explicit escape checkbox per step: "I don't have any existing vendors at my market yet" (placeholders) / "I don't have any of my market's vendors on the platform yet" (on-platform). Checking the box skips the step legitimately; not checking it means the manager must add at least one entry.

  Fix (needs code review before changing): touch `OnboardingChecklist`, `onboarding/[step]/page.tsx`, possibly `getOnboardingProgress` to add a "skip acknowledged" boolean per step. Probably a new column on markets — `onboarding_no_existing_vendors_ack BOOLEAN`, `onboarding_no_placeholders_ack BOOLEAN` — or store ack values in a JSONB column. Decide schema shape during code review.

  Estimate: ~1 hr work. Session 84.

## Priority 1.5 — Pre-existing reader gaps for `market_schedules.active`

Surfaced by Session 83 Agent A's comprehensive scan; all pre-existing, none made worse by the soft-delete redesign. None affect data integrity. File one ticket per fix; small.

- [x] ~~**R15 — vendor PATCH allows attendance on inactive schedule**~~ — RESOLVED (verified 2026-06-24): the PATCH guard already exists at `schedules/route.ts:455-465` (`.eq('active', true)` on the schedule lookup → 404 if inactive); documented comment `:446-454` cites the deactivation trigger. Backlog entry was stale. Original report below.

- [x] ~~**R7 — admin GET `/api/markets/[id]/schedules` returns inactive**~~ — Fixed Session 84 batch. Added `.eq('active', true)`.

- [x] ~~**R24 — `/api/market-boxes/[id]` returns inactive schedule rows**~~ — Fixed Session 84 batch. JS-side filter on the embedded array.

- [x] ~~**R25 — `/api/buyer/orders/[id]` returns inactive schedule rows in `display.schedules`**~~ — Fixed Session 84 batch. JS-side filter on the embedded array.

- [ ] **R29 / R30 — count selects include inactive** — `src/app/admin/markets/page.tsx:23` and `src/app/api/markets/route.ts:28` use `market_schedules(count)` without filter. Cosmetic. **Not fixed in Session 84 batch** because PostgREST embed-count can't return "all parent rows + filtered embed count" cleanly — would need either a separate query per market (N+1) or a denormalized `active_schedule_count` column. Defer to product decision.

- [x] ~~**R40 — `src/lib/events/shop-data.ts:142-147` event market schedule lookup ignores active**~~ — Fixed Session 84 batch. Added `.eq('active', true)`.

## Priority 1 — Market Manager v1 (FM only)

- [ ] **Market Manager dashboard + invite flow** — Pitch: free dashboard for FM market managers (vendor list with booth + attendance, aggregate market transactions, "invite a vendor" link, schedule view, support card) in exchange for them promoting the platform to their vendors and the public. Mirrors event organizer pattern (same human, different email; buyer dashboard card; admin-assigned via market admin UI). 1:1 manager:market for v1; FT park operator deferred. **Full plan + schema + 9-phase build order:** `apps/web/.claude/market_manager_v1_plan.md`. Awaiting user feedback from 1-2 friendly market managers (Amarillo / Canyon) before kickoff. Estimated 1-2 development sessions for end-to-end MVP. Drafted Session 78 (2026-05-05).

## Priority 1 — Market Manager v1 (FM only)

- [ ] **Market Manager dashboard + invite flow** — Pitch: free dashboard for FM market managers (vendor list with booth + attendance, aggregate market transactions, "invite a vendor" link, schedule view, support card) in exchange for them promoting the platform to their vendors and the public. Mirrors event organizer pattern (same human, different email; buyer dashboard card; admin-assigned via market admin UI). 1:1 manager:market for v1; FT park operator deferred. **Full plan + schema + 9-phase build order:** `apps/web/.claude/market_manager_v1_plan.md`. Awaiting user feedback from 1-2 friendly market managers (Amarillo / Canyon) before kickoff. Estimated 1-2 development sessions for end-to-end MVP. Drafted Session 78 (2026-05-05).

## Priority 0.5 — Dev environment catch-up (Session 78)

- [ ] **Dev is missing migrations 039 and 040 (event date columns) and possibly more** — Discovered 2026-05-04 while verifying migration 131 on Dev. The function `get_available_pickup_dates` errored at runtime with `column m.event_end_date does not exist`. `information_schema.columns` confirmed Dev's `markets` table is missing `event_start_date`, `event_end_date`, and `event_url` (Staging has all three). Per `CLAUDE_CONTEXT.md` Known Issues: "Dev out of sync: Migrations 039-041 on Staging+Prod. Dev needs these applied. Also 105 failed on dev (missing event columns — migration 039 never applied to dev)." This means `get_available_pickup_dates` has been silently broken on Dev for any caller — the browse page's `console.error` swallows it; listing detail returns empty, etc. Audit needed: query Dev's `information_schema` against the migration history (or against Staging) to identify ALL missing migrations, then apply them in order. Files to consider: 039, 040, 041, 110 (event_waves_schema adds more event columns), and any others. Don't apply blindly — some Dev-skipped migrations might have prerequisites that were also skipped. Until Dev is current, Dev cannot be reliably used to verify migration changes that touch event-related code. For migration 131's specific case, runtime verification was done on Staging only and that was sufficient because Staging is the env that mirrors Prod. **Not blocking** the Prod push of migration 131. Found 2026-05-04. Session 78.

## Priority 0 — Cross-Vertical Audit

- [ ] **FT vertical audit for market box changes (Session 74)** — Session 74's market box hardening focused on FM testing flows. Need to verify no FM-hardcoded terms or assumptions broke FT's market box UX. Review: vendor new/edit forms (`vendor/market-boxes/new/page.tsx` + `[id]/edit/page.tsx`), vendor list (`vendor/market-boxes/page.tsx`), vendor detail (`vendor/market-boxes/[id]/page.tsx`), cart drawer (`components/cart/CartDrawer.tsx`), checkout item (`checkout/CheckoutMarketBoxItem.tsx`), browse card (`browse/page.tsx`), subscription detail (`buyer/subscriptions/[id]/page.tsx`). Look for: hardcoded "farmers market" / "FM" terms, `term(vertical, ...)` calls that don't have FT mappings, vertical-conditional logic that may have been broken by display refactors. Particular risk areas: 8-week (2-month) option that's FM-only (`vertical !== 'food_trucks'`), pickup window UI (FT uses time slot, FM uses range). Found 2026-04-26.

## Priority 0 — TOP OF NEXT SESSION (Session 74 discoveries)

- [ ] **Pass platform order number/ID to Stripe metadata** — *PROMOTED FROM 0.5.* Currently Stripe checkout sessions, charges, and payment intents do NOT carry the platform's `order_number` or `order_id`. Looking at the actual Stripe event for Order #FA-2026-34616411, the only platform identifier was `client_reference_id: 295bb0bb-...` (the order UUID), which the user can't easily match to an order number. **Operational consequence:** vendors and admins cannot conclusively trace a Stripe transaction to an order without running DB queries. This blocks routine reconciliation and turns every "did we charge for the right thing?" question into an investigation. Add `order_number` AND `order_id` to the Stripe Checkout session `metadata` field at session creation. Touches `apps/web/src/app/api/checkout/session/route.ts` (CRITICAL-PATH — needs per-file approval with diff). For market box subscriptions, also include `market_box_subscription_id` (set after subscription creation, via Stripe's PaymentIntent metadata update — or wait until next charge cycle). Verify metadata appears on both the checkout session AND the resulting payment intent. Originally raised by user 2026-04-25; promoted to Priority 0 after the Order #FA-2026-34616411 investigation made the operational pain concrete.

- [x] ~~**`processMarketBoxPayout` catch-all eats errors silently**~~ — **RESOLVED (verified 2026-07-11).** The outer catch-all (`market-box-payout.ts:187-193`) already does `logError(new TracedError('ERR_PAYOUT_004', 'Unhandled error in processMarketBoxPayout: …'))` with route/method/subscriptionId/offeringId context. Backlog entry was stale (fixed in a prior session). (Minor optional follow-up: the inner transfer-failure catch at `:134-135` logs to console + sets `vendor_payouts.status='failed'` but doesn't `logError` — the failure IS recorded via status, so low priority.) Original report below.
- [ ] ~~`apps/web/src/lib/stripe/market-box-payout.ts:144-146`.~~ The outer try/catch does only `console.error('[MARKET_BOX_PAYOUT] Error in processMarketBoxPayout:', err)` — never `logError`. ANY thrown error inside the helper vanishes from `error_logs` (only visible in Vercel logs which expire). **This is exactly why the constraint-violation bug took so long to find** — only the specific INSERT path uses `logError(ERR_PAYOUT_003)`, so we got one structured trace; if the throw had come from the vendor lookup, transfer call, or anywhere else, we'd have had zero diagnostic trail. Fix: change the catch-all to `await logError(new TracedError('ERR_PAYOUT_005', \`Unhandled error in processMarketBoxPayout: ${err}\`, { route: source === 'checkout-success' ? '/api/checkout/success' : '/webhooks/stripe', method: source === 'checkout-success' ? 'GET' : 'POST', subscriptionId, offeringId }))`. ~5-line change, dramatically improves debuggability of all future market box payout failures. Found Session 74.

- [x] **Schema snapshot is wrong about 4 columns on `orders` table — phantom columns may be referenced in code** — *RESOLVED 2026-04-26.* Audit results: `orders.vendor_payout_cents`, `orders.buyer_fee_cents`, `orders.service_fee_cents` are NOT referenced in any production code (the matches are all on `order_items` joins or in test fixtures using object literals). `orders.market_id` HAS 4 active references in event-cancellation flows (`events/[token]/cancel/route.ts:116-144` and `admin/events/[id]/route.ts:242-271`) — all 4 silently failed at runtime, breaking the entire event-cancellation buyer-notification + order-cancellation flow. Fixed by querying via `order_items.market_id` (the working pattern documented in `events_comprehensive_todo.md` T0-2 and used correctly elsewhere — e.g. `admin/events/[id]/route.ts:294-298` for the completion flow). Status filter also extended to preserve `'completed'` orders (don't mark already-completed orders as cancelled). **STILL TODO** (separate backlog item below): regenerate `SCHEMA_SNAPSHOT.md` from REFRESH_SCHEMA.sql to clear the 4 phantom columns from the snapshot.

- [x] ~~**Regenerate `SCHEMA_SNAPSHOT.md` to remove 4 phantom `orders` columns**~~ — DONE 2026-06-24: re-confirmed absent on live Staging via `information_schema.columns` (0 rows), removed the 4 rows from the `orders` section + added a Change Log entry. (Full structured-table regen via REFRESH_SCHEMA.sql still optional but the phantom columns are gone.) Original report below. Snapshot at lines 740-743 (approximate) lists `orders.vendor_payout_cents`, `buyer_fee_cents`, `service_fee_cents`, `market_id` which don't exist on live staging. Live verified 2026-04-26 via `information_schema.columns` query. The snapshot rebuild done 2026-04-05 was wrong about these 4 (likely a copy/parse error in the REFRESH_SCHEMA output processing). Action: ask user to run `supabase/REFRESH_SCHEMA.sql` and rebuild the structured tables in `SCHEMA_SNAPSHOT.md`. Until done, the new mechanical schema gate in CLAUDE.md (escalate to `information_schema.columns` when snapshot fails) covers this — but cleaning the snapshot is the proper fix. Found 2026-04-26.

- [ ] **T0-2 step 3: refund Stripe-paid event orders on event cancellation** — When an event is cancelled (organizer or admin), buyer orders are now correctly marked `cancelled` with a notification (Session 74 fix). However per design doc `events_comprehensive_todo.md` T0-2 step 3, Stripe-paid buyers should ALSO get an automatic refund (or be flagged for manual refund). Current implementation marks orders as cancelled but does not initiate refunds. Stripe-paid buyers see "cancelled" status in their dashboard but won't see money returned without separate action. Touches `lib/stripe/payments.ts` (CRITICAL-PATH) — needs per-file approval. Two paths: (a) auto-refund via Stripe API in the cancel routes, (b) flag the orders for manual admin review (intermediate step before full automation). Found 2026-04-26 while fixing the order-cancellation bug; this is the unfinished piece of the original T0-2 design.

- [x] **Audit other webhook handlers for the `if (!existingPayment)` anti-pattern** — *RESOLVED 2026-04-26.* Audited all 13 handlers in `webhooks.ts` + `resend/route.ts`. **No other handlers have the same bug shape.** Findings: (1) `handleMarketBoxCheckoutComplete` has an `if (existing) {...}` pattern at line 372 BUT correctly calls `processMarketBoxPayout` inside the existence branch before returning — this is the GOOD idempotent pattern. (2) All UPDATE-only handlers (`handlePaymentSuccess/Failed`, `handleAccountUpdated`, `handleInvoicePaymentSucceeded/Failed`, `handleSubscriptionCheckoutComplete`, `handleSubscriptionUpdated/Deleted`) are pure UPDATEs and idempotent by nature. (3) `handleTransferCreated/Failed` and `handleChargeRefunded` use `wasNotificationSent` dedup and apply state-based UPDATEs — safe on retry. (4) `handleChargeDisputeCreated` is notification-only with NO dedup — admins receive duplicate notifications on Stripe retry. Logged as a separate Priority 1 cleanup item below (low severity — notification noise only, no monetary risk). The original bug was unique to `handleCheckoutComplete`'s specific combination of payment-row idempotency + nested side effects.

## Priority 0.5 — Buyer Upgrade

- [ ] **Premium buyer upgrade returns "Not authenticated"** — Found 2026-04-26 by user testing. User tried to upgrade buyer to premium and received `Not authenticated` error from the upgrade endpoint. The user WAS authenticated (had to be to reach the upgrade page). Investigation: find the buyer premium upgrade endpoint (likely under `/api/buyer/premium/...` or `/api/buyer/upgrade/...`), check whether it uses `supabase.auth.getUser()` or session check correctly. May be missing the auth context cookie pass-through, or the endpoint may have an auth check that's looking for a `vendor` role when buyer doesn't have one. Cross-reference: this also surfaced the error-reporting form bug (C) — see Priority 0.5 — Market Box UX duplicate-subscription entry. Fix the auth bug AND the form bug together since they're paired in user experience.

## Priority 0 — Stripe Refund Cleanup for Market Box Subscriptions (A4 from Session 75)

- [ ] **Stripe Dashboard refund of a market box subscription doesn't cancel the subscription, future pickups, or reverse the vendor's payout** — `apps/web/src/lib/stripe/webhooks.ts:914-1009` (`handleChargeRefunded`). When admin refunds a charge via Stripe Dashboard, the handler currently:
  - ✅ Marks `orders.status = 'refunded'`
  - ✅ Marks `order_items.status = 'refunded'`
  - ✅ Marks `payments.status = 'refunded'`
  - ✅ Notifies buyer + vendors
  - ❌ Does NOT update `market_box_subscriptions` (status stays 'active')
  - ❌ Does NOT cancel future `market_box_pickups`
  - ❌ Does NOT reverse the vendor's Stripe transfer
  - ❌ Vendor was paid upfront via `processMarketBoxPayout` and keeps the money for boxes never delivered

  **Plan drafted in Session 75** (~50 LOC, scoped diff already prepared) but held for a separate session because of three caveats that need product decisions:

  1. **`vendor_payouts.status = 'reversed'` is a new status value** — schema may have a CHECK constraint or enum that doesn't allow it. Need to verify on staging via:
     ```sql
     SELECT pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conrelid = 'public.vendor_payouts'::regclass
       AND contype = 'c';
     ```
     Decision: (a) reuse existing `'cancelled'` status, (b) ship a small migration adding `'reversed'`, or (c) other. `'cancelled'` is probably fine — semantically the payout is no longer happening, regardless of why.

  2. **Mixed orders (listings + market box)** — full refund of a mixed order would cancel ALL market box subscriptions in that order under the simple `isFullRefund` check. If admin only meant to refund the damaged listing, the market box gets nuked too. May be acceptable for v1 (admin can re-create the market box manually) but worth deciding before shipping.

  3. **`payout_failed` notification template reuse** — the existing `payout_failed` template may have wording specific to "Stripe transfer was reversed by Stripe" that doesn't quite fit the "buyer was refunded by admin" case. Either tweak the template's `reason` parameter handling, or add a new `payout_reversed` notification type.

  **Operational interim:** until A4 ships, when admin refunds a market box charge via Stripe Dashboard they MUST also manually:
  - Cancel the subscription in Supabase (`UPDATE market_box_subscriptions SET status='cancelled', cancelled_at=now() WHERE stripe_payment_intent_id = ?`)
  - Cancel future pickups (`UPDATE market_box_pickups SET status='cancelled' WHERE subscription_id = ? AND status IN ('scheduled','ready')`)
  - Reverse the Stripe transfer manually if the vendor was already paid (Stripe Dashboard → Connect → Reverse Transfer)
  - This is exactly the kind of multi-step manual cleanup that A4 was designed to automate. Document the runbook for now.

  Found 2026-04-26 during Session 75 fresh code audit. Plan + diff captured in `apps/web/.claude/session75_fresh_audit.md`.

## Priority 0.5 — Market Box Wave-Anchor Mechanism (NEEDS DESIGN)

- [ ] **Biweekly market box subscribers can land on different pickup waves (C9 from Session 75 audit)** — Currently when a biweekly vendor accepts new subscribers, each subscriber's `start_date` is computed as "next occurrence of vendor's pickup_day_of_week" (`api/market-boxes/[id]/route.ts:142-152` and `api/cart/items/route.ts:417-427`). For weekly vendors this is fine — every subscriber lands on the same weekly cadence. For biweekly vendors, two subscribers who join in different weeks end up on opposite 2-week waves. Buyer A (joined Mon Jan 6) gets pickups Jan 7 / Jan 21 / Feb 4 / Feb 18. Buyer C (joined Thu Jan 23) gets pickups Jan 28 / Feb 11 / Feb 25. Vendor has to either prep every Tuesday (defeating "biweekly" promise) or have some buyers' pickups go undelivered (auto-marked `missed` by cron Phase 4.7, buyer charged for box not received because `weeks_completed` counts `missed` as resolved per migration 124's `check_subscription_completion` trigger).

  **Why this is on backlog and not a blocking fix:** the system has no concept of a vendor "wave" today. Vendors set a single pickup day-of-week (e.g., Tuesday) and a frequency flag (weekly or biweekly). There's no `anchor_date` — no way for the system to know which Tuesdays are "delivery weeks" and which are "off weeks." The biweekly assumption is implicit in the trigger that schedules pickups every 14 days starting from each subscriber's individual `start_date`. There may also be vendors who genuinely DON'T have a wave (each subscriber gets independent biweekly cadence is fine for them). Need design decision before writing code.

  **Proposed mechanism — vendor wave anchor (sketch):**

  1. **Add `vendors-set anchor` to the offering or vendor profile.** Two design choices:
     - (a) Per-vendor anchor on `vendor_profiles.market_box_wave_anchor_date DATE` — single anchor for all the vendor's biweekly offerings. Simpler; matches the per-vendor `market_box_frequency` setting.
     - (b) Per-offering anchor on `market_box_offerings.wave_anchor_date DATE` — vendor can run different offerings on different waves. More flexible; more complex.
     Recommend (a) for v1.

  2. **Add `wave_mode` to `vendor_profiles`** — `'aligned'` (all biweekly subs use the same wave) or `'independent'` (each sub gets its own 14-day cadence from their start_date — current behavior). Default `'independent'` so existing behavior preserved. Vendors who want aligned waves opt in.

  3. **Update `next_start_date` computation** in `api/market-boxes/[id]/route.ts` and `api/cart/items/route.ts`:
     - If `wave_mode === 'aligned'` AND vendor has `wave_anchor_date`: compute next valid wave date = `anchor_date + N*14` where N is smallest integer making the date >= today.
     - Else: current behavior (next pickup_day_of_week within 7 days).

  4. **Update vendor UI** — when vendor selects biweekly + aligned wave mode, prompt them to set the anchor date (or auto-derive from existing active subscribers).

  5. **Migration considerations:**
     - Existing biweekly subs (currently zero on prod per `current_task.md`) keep their independent cadences — no backfill needed.
     - New biweekly subscribers under aligned mode snap to the wave.
     - If vendor switches modes mid-stream while subs exist, document that existing subs keep their original cadence and only new subs use the new mode.

  6. **`subscribe_to_market_box_if_capacity` RPC update:** validate that for aligned-mode vendors, the supplied `p_start_date` matches a valid wave date. Reject otherwise (defense in depth — the API layer should already snap correctly).

  **Scope estimate:** 1 migration (2 columns + check constraint), 2-3 API routes touched, 1 vendor UI panel for anchor configuration, RPC update. Probably 3-4 hours implementation + testing. Worth scheduling for the next market-box-feature iteration; not urgent for this prod push because biweekly is freshly launched and there are zero biweekly subs in prod today (per `current_task.md`).

  **Stopgap shipped:** vendor UI on `/vendor/market-boxes` page now shows a warning when biweekly is selected explaining that each subscriber's wave starts independently. Vendors can decide whether to (a) accept the operational reality of per-subscriber waves, (b) coordinate manually via skip+extend on out-of-phase subscribers, or (c) wait for the wave-anchor mechanism. (Session 75 fix.)

  Found 2026-04-26 during Session 75 fresh code audit.

## Priority 0.5 — Notification Routing (NEEDS DESIGN DISCUSSION)

- [ ] **Notification deep-link routing for market box pickups is wrong for early/off-day pickups** — Found 2026-04-26 by user testing. When a buyer confirms a market box pickup, the vendor receives an in-app notification. Clicking it currently routes the vendor to **Pickup Mode** (`/[vertical]/vendor/pickup`), which is filtered to show only TODAY's `status='ready'` pickups (per the comment added in Commit C). If the buyer confirms pickup early (vendor marked ready before scheduled date), pickup mode page shows nothing — vendor can't find the pickup, the 30-second confirmation window expires, buyer gets a "vendor missed window" notification, and the cascade gets ugly.

  **Design options to discuss next session:**
  - (a) Always route to the market box manage page (`/[vertical]/vendor/market-boxes/[offering_id]` Pickups tab) — vendor gets full context regardless of date
  - (b) Route by date: today's pickup → pickup mode (current behavior), not-today → manage page
  - (c) Route by notification action type: "ready for pickup" notifications → pickup mode (vendor-initiated flow); "buyer confirmed" notifications → manage page (response to buyer action)
  - (d) Combine (b) + (c) — most complex but most context-sensitive

  Also affects timing/race-condition issues: in user's test, vendor was 30s late confirming because they couldn't find the pickup, system fired "vendor missed" to buyer, vendor confirmed late, buyer reconfirmed within 30s, system marked picked_up. Notification routing is upstream of all this.

- [ ] **Vendor not notified when new market box subscription created** — User created a new market box subscription on 2026-04-26 (Stripe `pi_3TQaLNAUXdXt3w5T28jdCxWJ`); buyer was notified immediately, vendor was not. The subscription DOES appear correctly in the vendor's `/vendor/market-boxes` Subscribers tab with the buyer's email — just no in-app notification fired. Need a `new_market_box_subscription` notification type (or reuse existing `new_paid_order` if the structure fits) sent to the vendor on subscription creation. Trigger point: in `processMarketBoxPayout` after subscription is confirmed, OR in the success route's market box block. Found 2026-04-26.

## Priority 0.5 — Vendor Dashboard

- [x] **Vendor analytics overview does not show today's sales** — *PARTIALLY RESOLVED 2026-04-26 — overview route fixed; 4 sibling routes still need same treatment.* Root cause: not a date-filter bug — analytics queries ONLY `order_items` and market box subscriptions live in `market_box_subscriptions` (separate table, never create order_items rows). Every market box sale was invisible to vendor analytics. Fixed in `api/vendor/analytics/overview/route.ts` by adding parallel SELECT on `market_box_subscriptions` filtered via `market_box_offerings.vendor_profile_id`, then aggregating subscription `total_paid_cents` into the existing revenue/order count buckets ('active' and 'completed' subs count as completedOrders + totalRevenue; 'cancelled' goes to cancelledOrders bucket). Math verified equivalent semantic: subscription `total_paid_cents` = vendor's stated price = same as `order_items.subtotal_cents` (gross before vendor fee).

  **2026-04-26 update:** trends + customers routes also fixed using the same pattern (commit forthcoming). Subscription counted as 1 customer encounter (buyer_user_id is on subscription row directly — no orders join needed). Period bucketing in trends uses an extracted `periodKeyFor` helper applied to both order_items and subscriptions for symmetry.

  **STILL TODO — 2 design-call routes:**
  - `api/vendor/analytics/top-products/route.ts` — currently groups by `listing_id` with title/image. Mixing market_box_offerings as "products" alongside listings would require either (a) adding offerings as separate rows (different "product" shape — name vs title, image_urls array vs listing_images join), or (b) keeping top-products as listings-only and adding a separate "Top Market Boxes" panel to the analytics UI. Recommend (b) — cleaner separation. Add UI section with offerings sorted by subscription count + revenue. UI/design discussion, then code.
  - `api/vendor/analytics/tax-summary/route.ts` — filters by `listings.is_taxable`. `market_box_offerings` doesn't have an `is_taxable` column. Subscriptions cover multiple pickups of varied items — needs a design call: (a) market boxes treated as a unit with vendor-set taxability flag (new column), (b) item-by-item taxability via the menu items in each pickup, (c) market boxes are non-taxable as a category, or (d) vendor-configurable per-offering. Defer until tax compliance work decides the model (TaxCloud vs Stripe Tax decision in Priority 0 Pre-Launch backlog).

- [ ] **Buyer orders progress bar shows "0 of 4 pickups" after pickup confirmed** — Found 2026-04-26 by user testing. After buyer confirmed receipt of pickup #1 on a market box subscription, the progress bar on `/[vertical]/buyer/orders` still shows "0 of 4 pickups." Likely date-triggered (waiting for `scheduled_date` to pass) instead of status-triggered (counting pickups with `status='picked_up'`). Investigation: find the `pickups_progress` rendering logic in `buyer/orders/page.tsx` and switch from a date-based count to a status-based count. Related to (but separate from) the `weeks_completed` trigger bug — this one is purely UI counting; the trigger bug is DB state.

- [ ] **Vendors cannot delete market boxes (only deactivate)** — Found 2026-04-26 by user testing. There's no delete action for market box offerings in the vendor UI. Vendors can deactivate via the active toggle, but a deactivated box still consumes a slot in their offering count and clutters their list. Need design + guardrails before implementing:
  - Hard delete vs soft delete (soft = `deleted_at` column, preserves audit trail and existing subscriptions)
  - Require zero active subscribers before delete (otherwise active subscribers lose their subscription record)
  - What happens to historical `vendor_payouts.market_box_subscription_id` references (use ON DELETE SET NULL or CASCADE? CASCADE would erase payout records — bad)
  - What happens to `market_box_pickups` rows — preserve for audit?
  - Confirm UI flow with double-confirm because it's destructive
  Recommendation: soft delete with `deleted_at` filter on all reads, FK `ON DELETE RESTRICT` on subscriptions, only deletable when zero active subs. Open design question.

- [ ] **Subscribers tab on vendor market box detail page should show order number** — Found 2026-04-26 by user testing. URL: `/[vertical]/vendor/market-boxes/[id]` Subscribers tab. Currently shows buyer email per row but no `order_number`. Vendor cannot see which buyer is associated with which order from the market box management screens. Add the order number column joined from `market_box_subscriptions.order_id → orders.order_number`. Investigation: `vendor/market-boxes/[id]/page.tsx` Subscribers tab render (around line 545 area where current `Subscriber` interface is rendered). Need to add `order_number` to the Subscriber type + the API response from `/api/vendor/market-boxes/[id]`. Found while testing market box flow on 2026-04-26.

- [ ] **`market_box_subscriptions.weeks_completed` not incrementing when pickup confirmed** — Subscription `c6acffda-b05a-42e0-b010-978695c2197b` has pickup #1 with `status='picked_up'`, both `vendor_confirmed_at` and `buyer_confirmed_at` populated, but `weeks_completed` on the parent subscription is still 0. The `check_subscription_completion` trigger (rewritten in migration 124 to count actual pickup rows instead of relying on `term_weeks`) appears to not be firing OR is not updating `weeks_completed`. Verify trigger is attached to `market_box_pickups` AFTER UPDATE, then check what it actually does — may only flip status to `completed`, not bump weeks_completed. Affects subscription lifecycle status, trial-to-paid conversion logic, vendor analytics, and completion notifications. Found 2026-04-26 while investigating Order #FA-2026-34616411.

## Priority 0.5 — Stripe operational improvement

- [ ] **Other 5 silent-return points in `processMarketBoxPayout` should log when triggered** — Beyond the catch-all (Priority 0 above), the helper at `apps/web/src/lib/stripe/market-box-payout.ts` has 5 more places that silently return without any error_logs entry: line 35 (`actualPaidCents <= 0`), line 49 (existing non-terminal payout — fine, but noise-free is OK), line 58 (offering not found), line 66 (vendor not found), line 86 (duplicate insert 23505). The "not found" cases especially should `logError` — if those fire it indicates data integrity issues that should be visible. ~10 lines added, gives observability for "shouldn't happen" cases that, when they DO happen, are critical. Found Session 74.

- [ ] **Yesterday's $16.01 vendor payout still 'processing' 24+ hours later** — Vendor `farmersmarketingapp+vegvendor1` payout `aa74cfda-37da-4a8c-8d32-d1677e9f04ee` (transfer `tr_3TPsV5AUXdXt3w5T15M6RAsF`, $16.01, regular order) has been in `vendor_payouts.status='processing'` since 2026-04-24 22:49 UTC. Either (a) Stripe test-mode transfers genuinely take days to settle (possible — verify in Stripe sandbox), or (b) there's no cron/webhook updating our `vendor_payouts.status` from Stripe's `transfer.paid` event. If (b), processing payouts may stay in that state indefinitely and the dashboard's "Pending Payouts" number will compound forever. **Investigation:** check if a Stripe `transfer.paid` or `payout.paid` webhook handler exists in `webhooks.ts` and whether it updates `vendor_payouts.status='paid'`. If not, this is a real gap. Found Session 74.

- [ ] **Investigate which migration added `vendor_payouts.market_box_subscription_id` without updating the constraint** — Migration 127 had to fix `vendor_payouts_has_reference` to accept the column. The column existed for some time before that (helper code referenced it). Means an earlier migration added the column and missed updating the CHECK constraint. **Worth knowing:** which migration, what else it changed, and whether any other constraints in the codebase have similar "added column / missed constraint update" gaps. Process-quality investigation. Found Session 74.

- [ ] **Order-side cron retry missing `source_transaction`** — `apps/web/src/app/api/cron/expire-orders/route.ts:1089-1094` calls `transferToVendor` without `source_transaction` in the order-side Phase 5 retry block. Commit `121b3d5e` fixed the inline `fulfill` route only — the cron retry path was not touched. Same `balance_insufficient` failure mode as the original Jennifer/Chef Prep incident applies here when funds haven't settled. One-line fix mirroring the order fulfill pattern: look up charge ID from `payments.stripe_payment_intent_id` for the payout's `order_item.order_id`, pass as `sourceTransaction`. Found while auditing the market box payout flow on 2026-04-24.

## Priority 1 — Webhook polish

- [ ] **`handleChargeDisputeCreated` doesn't dedup admin notifications** — `apps/web/src/lib/stripe/webhooks.ts:1015`. The handler notifies all admin users about a Stripe chargeback. If Stripe retries the webhook (which they do for any non-2xx response or sometimes spuriously), all admins get the dispute notification a second time. Other notification-emitting handlers in the same file (`handleTransferCreated`, `handleChargeRefunded`) use `wasNotificationSent(supabase, userId, type, refKey)` to dedup — apply the same pattern here using the dispute ID (`dispute.id`) as the dedup key. Severity: low (notification noise, no monetary risk). Found 2026-04-26 during the webhook anti-pattern audit (Priority 0 item now resolved).

## Priority 1 — Infrastructure / Process

- [ ] **Stripe webhook endpoint cleanup — one endpoint missing Protection Bypass** — Stripe sandbox has 2 webhook endpoints registered. One has Vercel Protection Bypass header set (works — delivers to staging), one doesn't (returns 401 on every delivery). The broken endpoint pollutes the Stripe Events log and could mask real failures. Either add the bypass header to the broken one OR delete it. Cosmetic but worth a 5-min cleanup. Found Session 74.

- [ ] **Pre-existing baseline lint error in `OrganizerEventDetails.tsx:110`** — `react-hooks/set-state-in-effect`. Slipping past pre-commit because lint-staged only checks staged files. Real React anti-pattern (cascading renders). Fix is probably wrapping the setState in `queueMicrotask()` or moving to a `useMemo`. ~1-line fix. Found Session 74 while running `npm run lint` on Batch 1 changes.

- [ ] **Verify `STRIPE_SECRET_KEY` on staging matches Stripe sandbox** — Stripe migrated from legacy "test mode" (orange bar) to "Sandboxes" (blue bar) for this account. If Stripe rotated keys during the migration, staging's `STRIPE_SECRET_KEY` env var could be pointing at the wrong sandbox or stale key. Symptom would be webhook events never delivering to staging at all (different from the Protection Bypass issue above). Quick verify: confirm the key prefix (e.g., `sk_test_51...`) matches what's shown in the active sandbox's Developers → API keys section. Found Session 74.

## Priority 0.5 — Market Box UX (early pickup notification)

- [ ] **Buyer notification when vendor marks pickup ready BEFORE scheduled date should include deep link to confirm-pickup page** — Today, market box pickups have a scheduled date and a face-to-face confirm flow. The two relevant pages are `/farmers_market/buyer/subscriptions/{subscription_id}?from=orders` (buyer side, includes confirm-pickup button) and `/farmers_market/vendor/market-boxes/{offering_id}` (vendor side, mark ready). If a vendor marks the box ready earlier than the scheduled day, the buyer's notification/email needs to (a) tell them the pickup is available now even though it's earlier than expected, and (b) include a direct link to their subscription page so they can navigate straight to confirm. First questions to answer in next session: does the existing notification system fire when vendor marks ready (regardless of date), or only on the scheduled day? Notification template type to update: probably the market_box ready-for-pickup notification. Need to add the deep link to the actionUrl + body. Found 2026-04-25.

## Priority 0.5 — Market Box UX

- [ ] **Market box duplicate-subscription flow has 3 stacked UX bugs** — Found 2026-04-26 by user testing on staging.

  **Repro:** Buyer who already has an active subscription to market box X tries to add box X to cart again (e.g., same vendor's biweekly box).

  **(A) Cart vs. checkout inconsistency:** Cart adds the duplicate item with only a soft warning; checkout then blocks with hard error "You already have an active subscription to this market box." Either both layers should block, or both should warn-and-allow with the duplicate handled at subscription creation. Investigation: grep `apps/web/src/app/api/cart/items/route.ts` for any `market_box_subscriptions` duplicate check; the gate may exist server-side at the RPC level (`subscribe_to_market_box_if_capacity`), and the cart route may not pre-check, OR the cart route checks but only warns.

  **(B) Error code missing from display:** The "active subscription" error UI doesn't show the error code that the system generated. Past convention (per CLAUDE.md error-resolution system) is to display the `ERR_XXX_NNN` code visibly so users can report it. This particular error path is missing that. Investigation: find the error-handling component that renders this, check whether the ErrorPage / ErrorBoundary / inline error component shows `error.code` / `error.errorCode` / `error.traceId`.

  **(C) Error reporting form requires `errorCode`/`traceId` but user never sees them:** Form validation error "Either errorCode or traceId is required" fires when the user submits without a code, but the user was never given a code (per #B). Even if #B is fixed, the form should auto-populate from the parent error's context (no need for the user to re-type a code that's already known to the page). Additionally, the form's validation error displays alongside the original error rather than replacing it — UI ends up showing two errors stacked, confusingly. Investigation: find the error-reporting endpoint (likely `/api/error-resolutions` or `/api/admin/error-resolutions` based on session memory) and the form component; the form should derive `errorCode` from the page's error context as a hidden field, not require user input.

  **Fix order should be:** (B) first — make error codes visible for this error type. (C) auto-populate the form so users don't have to re-enter known data. (A) last — decide cart vs checkout policy and align them.

  **2026-04-26 update:** Another instance of issue (C) confirmed via the buyer premium upgrade flow. User tried to upgrade buyer to premium → got `Not authenticated` error → reported it via the form → got the same `Either errorCode or traceId is required` validation error even when entering an email. Confirms the form validation bug is generic across all error sources (not specific to the duplicate-subscription path), which makes (C) higher priority — every "report this error" attempt is broken until it's fixed. Also see Priority 0.5 — Buyer Upgrade entry below for the underlying `Not authenticated` cause investigation.

- [ ] **Show current pickup frequency on the new-market-box form (read-only reminder)** — `apps/web/src/app/[vertical]/vendor/market-boxes/new/page.tsx`. Pickup frequency is set vendor-wide on the market-boxes list page (`/vendor/market-boxes`), not per box. When a vendor creates a new box, they should see a small read-only banner on the form like "This box will be **Bi-Weekly** — change at /vendor/market-boxes" so they're not surprised by the cadence the box launches with. Same treatment makes sense on the per-box edit form. Found 2026-04-24 by user testing the staging biweekly flow.

- [ ] **"Rate" button on buyer dashboard "Rate Your Recent Orders" card doesn't work** — buyer dashboard prompt offers a Rate button per fulfilled order (e.g., "Order #FA-2026-01646780 $19.30 · Valley Verde Farm"). Clicking the button does nothing — should open the rating flow / modal / link to the rating endpoint. Prompt copy is fine; just the action needs wiring. Found 2026-04-24 staging testing.

- [ ] **Improve traditional-market-cap error message on box activation** — `apps/web/src/app/api/vendor/market-boxes/[id]/route.ts:262`. Current message: "Market limit reached (3/3). Reactivating this box would bring you to 4 traditional markets. Remove a listing or box from another market first, or upgrade your plan." Better: list the vendor's current markets explicitly (e.g., "Your current markets are Amarillo, Canyon, Lubbock") and name the market the activation would add (e.g., "Activating this box would add Westgate Mall as a 4th market"). Helps the vendor decide which listing to drop without having to leave the page. Found 2026-04-24.

## Priority 1 — Documentation drift

- [ ] **`CLAUDE_CONTEXT.md` FM tier limits are stale** — doc says "Standard Traditional Markets: 1, Premium: 4" but `vendor-limits.ts:57,71,85` shows 3 / 5 / 8 (standard / premium / featured). Code is authoritative; doc should be updated. Found 2026-04-24 while investigating an activation enforcement question.

## Priority 0.5 — Market Box Edge Cases

- [ ] **Standalone market box checkout doesn't support biweekly vendors** — `apps/web/src/lib/stripe/webhooks.ts:367` (the `handleMarketBoxCheckoutComplete` function for direct-buy flow via `createMarketBoxCheckoutSession`) hardcodes `p_pickup_frequency: 'weekly'` because the standalone metadata format doesn't carry it. If a buyer ever uses the standalone purchase path on a biweekly vendor's box, the subscription will be created as weekly (4 pickups instead of 2) regardless of vendor settings. Currently MarketBoxDetailClient.tsx routes through the cart flow, so standalone path may be cold — but if it's reactivated or used by an admin, biweekly is broken. Fix: do a vendor_profile lookup in `handleMarketBoxCheckoutComplete` to read `market_box_frequency`, OR push frequency into standalone metadata at session-creation time in `apps/web/src/app/api/buyer/market-boxes/route.ts:309` (call to `createMarketBoxCheckoutSession`) and the corresponding metadata write in `payments.ts:163-201`. Found 2026-04-24 while fixing webhook RPC overload.

- [ ] **Refund on RPC failure can attempt the wrong amount** — `apps/web/src/lib/stripe/webhooks.ts:218,232` `createRefund(paymentIntentId, mbItem.priceCents)`. After today's fix, `mbItem.priceCents` is the food subtotal (pre-fee), not the actual Stripe charge. So a refund will succeed but only return the food portion, leaving the buyer-fee portion stuck. Better: refund the actual line-item charge (food + buyer percentage fee + proportional flat fee), or use Stripe's refund-charge-by-PI semantics that auto-pick the full amount. Low impact — refund only fires if the RPC fails, which after Fix A should be rare. Found 2026-04-24.

- [ ] **Test CashApp payment failure flow on staging** — user note 2026-04-25. Verify what the buyer sees if CashApp authorization fails at Stripe checkout: does the order go to a clean cancelled state? Does inventory get restored properly? Does the buyer get a clear retry path? Stripe test mode supports forcing payment-method failures.

- [ ] **Investigate possible market box term-selector state bug** — user reported choosing "1 Month" but ending up subscribed to a 2 Month term (term_weeks=8 in cart and on success page). May be downstream of cart `pickup_frequency` propagation bug fixed 2026-04-25 — retest first; if still happening, dig into MarketBoxDetailClient term selector state, particularly the `selectedTermWeeks` / `addMarketBoxToCart` handoff at the subscribe button. Found 2026-04-25.

## Priority 0.5 — Vendor Onboarding (Session 73)

- [ ] **Additive vendor categories with documentation gate** — Vendors should be able to add new product categories after signup (currently locked from signup form). When a vendor adds a category that requires documentation (e.g., adding Baked Goods to a Produce vendor), the system should: (1) allow the category to be added from their profile or listing form, (2) prompt for required documents per `category-requirements.ts`, (3) gate publishing of listings in the new category until docs are approved. Touches: listing form category selector, vendor_verifications.requested_categories, category document upload flow, OnboardingChecklist. Session 73 friction audit finding #14.

## Priority 0.5 — Event Rating Follow-ups (Session 71)

- [ ] **Admin moderation UI for `event_ratings`** — page at `/admin/event-ratings` with filters (pending/approved/hidden), approve / hide actions, ability to see the full event + user context. Until built, approve via SQL: `UPDATE event_ratings SET status='approved', moderated_at=now(), moderated_by=<admin_user_id> WHERE id='<id>';`
- [ ] **Organizer dashboard: event rating display** — on the organizer's event detail page, show approved `event_ratings` rows with rating + comment. RLS already allows organizers to read approved rows for events where `organizer_user_id = auth.uid()` — just needs the UI.
- [ ] **Magic-link re-auth for post-event rating** — logout friction fix. Post-event notification email includes a Supabase `admin.generateLink()` signed URL that auto-authenticates the attendee for a one-shot rating. Attach to the existing notification flow. User raised this concern in Session 71.
- [ ] **Aggregate stats on `catering_requests`** — `average_rating` + `rating_count` columns + trigger on `event_ratings` so we can show "4.6 ★ from 23 attendees" publicly (if user wants aggregated bragging). Currently deferred — individual ratings stay private.
- [ ] **Per-vendor "unrated event orders" nudge** — after event completes, notify buyers with an unrated completed order from the event so they rate via the dashboard (not just via the event page).

## Priority 0.5 — Quick Fixes

- [ ] **Browse availability RPC references phantom column `m.event_end_date`** — Surfaced 2026-05-01 during pre-push Playwright run for commit `eea40abd`. Each browse page slice load logs: `[browse] availability RPC failed (page slice): column m.event_end_date does not exist`. The page falls back gracefully (test still passed, no user-visible break), but every browse load fails its availability RPC and likely degrades sort/filter accuracy. Investigation: find the `get_available_pickup_dates()` (or related) function definition; the `m.event_end_date` reference must be either renamed (column was renamed?) or the function predates a column drop. Likely related to the schema phantom-columns issue (P1-8 — `orders.market_id` family). Adjacent question: does `markets.event_end_date` actually exist on the live DB? Schema snapshot shows `markets.event_allow_day_of_orders` and `wave_ordering_enabled` and `wave_duration_minutes` (migration 110) — `event_end_date` was added per migration 110 changelog but on `markets`, so the column should exist. Maybe the alias `m` doesn't bind to markets in that query context. Quick investigation, likely a 1-line fix in the RPC.

- [ ] **Locale switch fetch error unhandled** — `src/lib/locale/client.ts:24` `setClientLocale()` doesn't catch fetch failure. Sentry issue 7382469144.
- [ ] **Organizer cancel API** — new route `POST /api/events/[token]/cancel` with organizer_user_id auth. Current button shows "contact support".
- [ ] **Organizer pre-order detail** — expandable section on My Events card showing order breakdown per vendor.
- [ ] **Event order cap enforcement** — reimplementation via separate validation endpoint (NOT cart/items/route.ts). DB columns exist (migration 106).
- [ ] **Vendor guidance text** — capacity planning message on acceptance UI, pre-order count in prep reminders.
- [ ] **Organization type field** — add to event request form (company, church, school, community group, government). Use "event organizer" instead of "company" generically.

## Priority 0.5 — Event System (from Session 66)

### Event Capacity Safety
- [ ] **Event order volume alert for unlimited-inventory vendors** — When a vendor with `quantity = NULL` listings accumulates event orders exceeding their stated `max_headcount_per_wave × wave_count`, send a proactive notification warning them. The data is in `event_readiness` JSONB on vendor_profiles. Without this, a vendor could get 200 pre-orders with no system-level cap. Regular markets are less risky (daily cadence + vendor can refuse in real-time), but events batch all orders before event day.

### Event System Cleanup (non-blocking, from code review)
- [ ] **Admin PATCH duplicates approval logic** — `admin/events/[id]/route.ts` lines 112-173 duplicates `approveEventRequest()` from event-actions.ts. Should call the shared function instead.
- [ ] **Phase 11 cron hardcodes vertical** — Line 1993 sends `vertical: 'food_trucks'` for all event prep reminders. Should use event's actual vertical_id.
- [ ] **Phase 12 cron email uses FT language for FM** — Results email says "food trucks" regardless of vertical.
- [ ] **Public event page footer hardcodes "Food Truck'n"** — `events/[token]/page.tsx` line 316. Should be vertical-aware.
- [ ] **Public event page N+1 vendor queries** — Shop page already fixed with batch queries; event info page still loops per vendor.

## Priority 1 — Session 72 Findings

### H3: Event completion with unfulfilled order items — refund/reconciliation logic
- [ ] **COMPLEX — requires multi-scenario research + planning before code.**
  
  When admin marks an event 'completed', unfulfilled order items (pending/confirmed/ready) are logged but no refund or correction happens. The right behavior depends on the payment model:
  
  - **Company-paid (host pays for everything):** vendor should get a grace window to correct unconfirmed orders before completion finalizes. Unfulfilled items may represent vendor error (didn't confirm), not buyer no-show. Company already paid — refund goes back to company, not individual attendees.
  - **Attendee-paid (Stripe checkout):** unfulfilled items could be buyer no-show (no refund deserved), vendor no-show (full refund deserved), or handoff failure (partial refund?). Each case has different financial treatment.
  - **Hybrid (future):** combination of both — company portion refunded to company, attendee portion refunded to attendee. Most complex.
  
  **Work required:**
  1. Map every order_items status that could exist at completion time, per payment model
  2. Define the correct financial action for each (refund buyer, refund company, charge vendor, write off, etc.)
  3. Design admin UI: show unfulfilled breakdown, require admin to choose action per item or per vendor before finalizing
  4. Consider: vendor dispute window before completion (e.g., 24h after event to confirm any stragglers)
  5. Consider: auto-complete vs manual-complete distinction (cron auto-complete should be stricter than admin manual)
  
  **Cited code:** `api/admin/events/[id]/route.ts:290-327` — current implementation queries unfulfilled items, notifies vendors, logs warning, proceeds without blocking or refunding.

### Session 72 audit findings (backlog items)
- [ ] **H1: Notification placeholder data gaps** — 9+ notification call sites pass incomplete template data. Buyers see "A customer" and "your vendor" instead of real names. Largest impact: `new_paid_order` at `checkout/success/route.ts:335` (every Stripe order). Full report in Session 72 conversation.
- [ ] **H2: Duplicate organizer confirmation emails** — `admin/events/[id]/route.ts:204` (status→ready) and `events/[token]/select/route.ts:329` (vendor selection) both send nearly identical "X vendors ready" emails. Fix: add `selection_email_sent_at` column to gate duplicates.
- [ ] **C2: Turnstile graceful degradation** — if Cloudflare CDN fails, signup button stays permanently disabled with no error message. Need timeout + fallback (enable button after 10s if widget doesn't load).
- [ ] **M1: Cart isolation — move to DB trigger (Option C).** Current app-level check has race condition + silent bypass on query failure. Replace with BEFORE INSERT trigger on `cart_items` that enforces cross-event isolation atomically. Full risk analysis + implementation plan at `.claude/plans/cart-isolation-db-trigger-plan.md`. Deploy while volume is low — risk increases with scale.
- [ ] **M2: Vendor cancel notification uses wrong template** — `events/[token]/cancel/route.ts:104` sends `catering_vendor_responded` (accept/decline template) for cancellations. Vendor sees grammatically broken message. Needs dedicated `event_cancelled_vendor` notification type.
- [ ] **M4: Event-ratings admin optimistic UI count bug** — `admin/event-ratings/page.tsx:89` decrements wrong status count when moderating a rating while viewing a different one. Fix: capture oldStatus before update.
- [ ] **Admin panel: show user/vendor names not just emails** — user request from Session 72.
- [ ] **`column market_vendors.status does not exist`** — error in prod Postgres logs. Separate bug, not investigated.
- [ ] **`column v.business_name does not exist`** — error in prod Postgres logs. Separate bug, not investigated.
- [ ] **`/api/buyer/location` POST silently swallows profile-update errors** — cookie updates but profile doesn't. User's browse location stays stale.
- [ ] **`browse/page.tsx:531` ignores query errors on rawListings** — root cause of silent empty browse page when RLS errored. Should check error and log.

## Priority 0 — Next Session

### Sales Tax Implementation (UPDATED Session 72 — TaxCloud vs Stripe Tax decision pending)
- [x] **TX Comptroller registration** — DONE. Taxpayer ID obtained, awaiting system processing.
- [ ] **Tax provider decision** — TaxCloud Premium ($79/mo, free filing+audit) vs Stripe Tax (0.5%/txn, simpler integration). At <100 orders/mo Stripe Tax is cheaper. TaxCloud wins on compliance. See Session 72 cost analysis. USER DECISION.
- [ ] **Provider account setup** — Either TaxCloud (API ID + API Key + bank link) or Stripe Tax (add TX registration in dashboard). USER ACTION.
- [ ] **Code: Tax lookup at checkout** — API client skeleton at `src/lib/tax/taxcloud.ts` + TIC mapping at `src/lib/tax/tic-codes.ts` (ready for TaxCloud). Stripe Tax alternative: 2 lines in checkout config.
- [ ] **Code: Display tax line item** — Show tax to buyer before payment.
- [ ] **Code: Report transactions** — TaxCloud: call `captureTransaction()`. Stripe Tax: automatic.
- [ ] **Code: Report refunds** — TaxCloud: call `reportReturn()`. Stripe Tax: automatic.
- [ ] **Code: Withhold tax from vendor transfers** — Exclude tax from vendor_payout_cents.
- [ ] **Code: Track sales_tax_cents** — Add column to orders/order_items.

### Pre-Launch Business Items
- [ ] **Tax compliance consultation** — Partially done (Session 63 research). Remaining: confirm platform fee taxability, verify filing frequency, confirm marketplace facilitator registration process. CPA recommended.

### Catering Pre-Order System (Session 63 decisions)
- [ ] **Catering minimum order enforcement** — 10 items per vendor minimum for catering orders (`advance_order_days > 0`). Enforce at cart validation AND checkout. Show clear message: "Catering orders require a minimum of 10 items per vendor."
- [ ] **Catering advance notice tiers** — Size-based minimum lead time: 10-29 items = 1 day, 30-49 items = 2 days, 50+ items = 3 days. Enforce in SQL `get_available_pickup_dates()` — the advance window should expand/contract based on cart quantity per vendor. Also enforce at checkout validation.
- [ ] **Listing form advance ordering update** — Current dropdown offers fixed 2-7 days. Needs to reflect the new tier logic. The vendor sets their MAX advance window; the system enforces minimums based on order size. May need rethinking — vendor sets "I accept catering orders" (boolean) and the tiers are platform-enforced, not vendor-chosen.
- [ ] **Event $75 per-truck fee** — Due with 50% deposit when agreement signed/uploaded. Needs: fee calculation in event booking flow, payment capture mechanism, tracking in a fees table or on catering_requests.
- [ ] **Zip code visibility across geographic pages** — Research item from Session 63. All geo-search pages should show what zip they're keyed off of. Changing zip on one should change all. DO NOT change until implications understood (browse page has different fallback logic).

### Session 63 Completed
- [x] **Vendor configurable pickup lead time** — DONE. Migration 096, 15/30 toggle, dropdown UI.
- [x] **Password reset** — DONE. verifyOtp with token_hash, bypasses PKCE.
- [x] **Vendor hours display mismatch** — Was already done (Session 31).
- [x] **T-2, T-3, T-11 protective tests** — DONE. 32 new tests.
- [x] **Inventory restore safety** — DONE. shouldRestoreInventory() utility.
- [x] **Buyer premium page rewrite** — DONE. False claims removed.
- [x] **Time slot UX** — Dropdown replaces tiles. End time = valid arrival. 15-min slots for 15-min lead.
- [x] **Vendor profile reorder** — Menu → Chef boxes → Catering → Info at bottom.
- [x] **Cover photo** — Migration 097, upload with resize, 16:9 display.
- [x] **Favorites page** — Simple name+logo cards, no geo search.
- [x] **Landing page button** — "Where are trucks today?" navigates to where-today.
- [x] **Tutorial fix** — Missing notification_preferences column on prod.
- [x] **TypeScript build errors** — All resolved (events page types).
- [x] **Production push** — 49+ commits pushed to prod with revert tag.
- [x] **Stress test protocols** — 8 protocols documented.
- [x] **Cite-or-verify rule** — New absolute rule in CLAUDE.md + global rules.
- [x] **Vendor profile section reorder** — Menu → Chef boxes → Catering → Info at bottom.
- [x] **Cover photo** — Migration 097, upload with resize, 16:9 display.
- [x] **Favorites page** — Simple name+logo cards, no geo search.
- [x] **Catering badge on vendor profile** — Shows on listing cards + gold highlight button.
- [x] **Checkout mobile layout** — Items → tip → payment → Pay Now → cross-sell.
- [x] **Accounting reports (6)** — Transaction reconciliation, refund detail, external fee ledger, subscription revenue, tax summary, monthly P&L.
- [x] **Payment methods expanded** — Card + Cash App + Amazon Pay + Link explicitly listed.
- [x] **External payments hidden** — EXTERNAL_PAYMENTS_ENABLED flag, UI hidden, backend preserved.
- [x] **FT sales tax always-on** — Greyed out checkbox + pre-packaged food block.
- [x] **FM category-based tax rules** — Auto tax by category + trigger questions for Meat/Baked Goods.
- [x] **Signup tax guidance** — Tax notice on vendor signup success page per category.
- [x] **FM vendor_type expanded** — Migration 098, 11 categories matching listing categories.
- [x] **Catering cash restriction removed** — Premature; will rebuild with catering minimum system.
- [x] **Vendor outreach emails** — FT and FM templates written for vendor recruitment.

## Priority 1 — From Session 62

### Notifications & Communication
- [x] **Confirmation email pickup instructions** — DONE Session 62. order_ready notification includes handoff instructions + deep-link to specific order.
- [x] **Vendor expiration notification** — DONE Session 62. Cron Phase 1 now notifies vendor when order expires.
- [ ] **Inventory change notifications (design needed)** — Notify buyers when favorited vendors restock. Design: favorites-only, 15-30 min batch window after last change, max 1 per vendor per buyer per day.
- [ ] **Vendor notification titles i18n** — 20+ vendor notifications use hardcoded English strings. Buyer notifications use `t()`. Should be consistent.
- [x] **Notification deep-linking** — DONE Session 62. All buyer order notifications link to specific order detail page.
- [ ] **Notification click routing review** — 48 actionUrls need review for appropriate destinations. Not a wiring issue — each type's actionUrl needs individual review. Tedious but mechanical.

### Tests — Protect Revenue & Recent Fixes
- [ ] **T-7: External payment fee flow test** — HIGHEST PRIORITY. User said "if it breaks we lose money."
- [ ] **T-2: Refund calculation consistency test** — All 4 refund paths must produce identical amounts.
- [ ] **T-11: Inventory restore vertical awareness test** — FT fulfilled = no restore, FM = restore.
- [ ] **T-3: Tip split protective test** — Confirmed correct, needs protection from accidental changes.

### Business Rules to Document
- [x] **BR-5: Market box missed pickup = no refund** — DONE Session 62. In decisions.md.
- [x] **BR-6: Trial tier = 'free'** — DONE Session 62. In decisions.md.
- [x] **BR-11: FT fulfilled items don't restore inventory** — DONE Session 62. In decisions.md.
- [ ] **BR-4: Event approval prerequisites** — What criteria grants event_approved? Is COI required?
- [ ] **BR-7: Cancellation fee allocation** — No documented percentage for vendor's share.
- [ ] **BR-8: Event headcount range (10-5000)** — Hardcoded, no justification documented.
- [x] **BR-9: Cross-vertical cart isolation** — DONE Session 62. Validation added to add-to-cart API.
- [ ] **BR-10: Radius persistence behavior** — Cookie-only vs profile.

### Investigation Needed
- [x] **E-8/E-9: Cart cross-vertical isolation** — DONE Session 62. Vertical validation added to listing + market box add-to-cart.
- [ ] **E-21: Timezone centralization** — zip_codes table has timezone column. Design centralized utility.
- [x] **E-22: Geocode/browse** — INVESTIGATED Session 62. zip_codes table populated on all 3 envs (33,793 rows). DB lookup should work. Silent fallback is documented in code.
- [ ] **Where-today schedule mismatch** — Need specific example from user to diagnose.

### Small Fixes
- [x] **E-25: UserRole type dedup** — DONE Session 62.
- [x] **E-19: Cart remove endpoint stub** — DONE Session 62. Deleted.

## Priority 1 — From Session 61 (Carried Forward)

### Buyer Premium Upgrade Page
- [ ] **Rewrite premium buyer value proposition** — Remove market box claims, remove "premium support" claim. Focus on early access, premium badge visibility to vendors.

### Vendor Profile (FM)
- [x] **"View Menu" → "View Products"** — ALREADY DONE (prior session).
- [x] **Hide "Free" tier badge** — ALREADY DONE (prior session).
- [x] **Show tier badge on FM vendor cards** — ALREADY DONE (prior session).
- [x] **Resize social buttons on vendor profile** — DONE Session 62. Reduced ~10%, 3-line desktop layout.

### Notification Click Behavior
- [ ] **Notification click routing review** — Each notification type's actionUrl needs review. Most point to orders list; some should point to dashboard, settings, etc. Tedious but mechanical.

### Translation Gaps
- [ ] **Page-by-page translation audit** — Many items not translated to Spanish.

### Order Lifecycle Monitoring
- [x] **Fix "active orders" count on dashboard** — DONE Session 62.
- [x] **Admin dashboard: stuck orders card** — DONE Session 62. Shows count + open issues link.
- [ ] **Integration test: full order lifecycle** — Test order transitions pending → paid → confirmed → ready → completed.
- [x] **Backfill stuck orders** — DONE Session 62. One-time SQL cleanup applied to all 3 envs.

### Event System
- [x] **Event Phase 1 completion** — DONE Session 62. Per-event vendor menus (event_vendor_listings table, vendor picker on accept, 5-item limit). Event lifecycle statuses (approved → ready → active → review → completed). Migration 094 applied all 3 envs.
- [x] **Event Phase 3: Attendee feedback** — DONE Session 62. EventFeedbackForm component on event page during active/review status.
- [x] **Event Phase 3: Vendor prep reminder** — DONE Session 62. Cron Phase 11 sends 24h-before notification.
- [x] **Event Phase 3: Settlement notification** — DONE Session 62. event_settlement_summary type created.
- [x] **Event Phase 4: Revenue estimate** — DONE Session 62. Shows on vendor invitation page.
- [ ] **Event Phase 2: Wave-based ordering** — Time slots with capacity limits, wave-aware checkout. Significant build.
- [ ] **Event Phase 3 remaining: Settlement email trigger** — Send settlement notification to vendors when admin marks event completed. Notification type exists, needs to be called from the admin status transition.
- [ ] **Stripe payouts_enabled flag sync** — Investigate why DB flags don't stay current after vendor completes Stripe setup.

### Stripe Cleanup
- [x] **Delete old pebble02 webhook endpoint** — DONE by user Session 62.

## Priority 2 — Soon

- [x] **Browse page: consolidate filters** — DONE (prior session).
- [ ] **Playwright automated smoke tests** — See detailed plan in archive section.
- [ ] **Test push notifications on staging** — Verify web push end-to-end.
- [ ] **Stripe live mode activation** — Switch from test to live keys when ready.
- [ ] **Prod zip_codes seeded** — DONE Session 62. 33,793 rows via CSV import.

## Priority 2.5 — Session 62 Audit Opportunities

- [ ] **Opportunity 1: Buyer Interest Geographic Intelligence Dashboard** — buyer_interests table has data. Admin page showing interests by zip/count/date + CSV export.
- [ ] **Opportunity 2: Vendor Quality System Activation** — Nightly cron generates findings. Zero UI. Vendor dashboard card + admin findings page.
- [ ] **Opportunity 3: Trial-to-Paid Conversion Funnel** — Dashboard banner "Day X of 90", upgrade page context, 7-day pre-expiry notification.
- [ ] **Opportunity 4: Vendor Leads Management UI** — Admin leads page with status tracking, follow-up, demo scheduling.

## Priority 2.6 — Documentation Deep Dives
- [ ] **Area-specific deep dive series** — Internal reference docs across full stack. Topics: Statuses, Dates/Times, Locations, Hours/Schedules, Tiers/Limits, Financial Flows, Auth/Access, Device/Browser.

## Priority 2.7 — Performance & Infrastructure
- [ ] **AC-4: Optimize heavy RLS policies on markets table** — 2 nested EXISTS subqueries per row.
- [ ] **L4: Zod input validation on API routes** — Gradually add Zod schemas.
- [ ] **L6: SMS send logic when push enabled** — Blocked by A2P 10DLC carrier approval.
- [ ] **L2: External cron monitoring** — Deferred post-launch.
- [ ] **RLS: Consolidate multiple permissive policies** — Supabase linter flags 15 tables with multiple OR'd permissive SELECT policies. Consolidate into single comprehensive policies for performance.
- [ ] **RLS: Audit auth.uid() vs (SELECT auth.uid())** — Supabase flags auth RLS initialization plan warnings. Ensure all policies use `(SELECT auth.uid())` pattern.
- [ ] **RLS: Document buyer_interests INSERT policy** — `WITH CHECK (true)` is intentional (public lead capture). Add SQL comment or tighten to require valid email. Not a real vulnerability — API validates and rate-limits.
- [ ] **Auth: Investigate incognito/regular Chrome session conflict** — Admin in incognito got logged out when vendor logged in on regular Chrome (same domain, same Supabase project). Likely Supabase SSR cookie middleware or BroadcastChannel issue. Not blocking (different browsers work). Workaround: use Chrome + Edge for multi-role testing.
- [ ] **Migration 006: Apply to prod** — DONE Session 65. Remove this item.

## Priority 3 — When Time Allows
- [ ] **Geographic intelligence feature** — Plan at `.claude/geographic_intelligence_plan.md`
- [ ] **A2P 10DLC SMS approval** — Waiting on carrier

## Post-Launch — Growth & Expansion
- [ ] **Ecosystem Partner Platform** — Full design at `docs/CC_reference_data/Ecosystem_Partner_Platform_Design.md`
- [ ] **Growth Ambassador Program** — Design at `docs/CC_reference_data/Growth_Partner_System_Design.md`
- [ ] **Geographic Expansion Planning** — Workbook at `docs/CC_reference_data/Geographic_Expansion_Planner.xlsx`
- [ ] **Property Broker (3-sided marketplace)** — Land/parking lot rentals for vendors. Concept + phased plan at `apps/web/.claude/property_broker_concept.md`. Phase 0 validation required before any build. Reuses ~70% of existing infrastructure (matching, Stripe Connect, onboarding gates, notifications). Closest analogue: Storefront (failed) — but we start with demand side already in place.

## Icebox
- [ ] **Events feature Phase 5+** — Ticketing, capacity management, recurring events
- [ ] **Advanced vendor analytics** — Sales trends, customer demographics, peak hours

## Housekeeping / Tech Debt
- [ ] **Clean up home_market_id remnants** — After Session 70's tier-cap fix, `home_market_id` is no longer used for listing permissions. It still exists for: (1) DB column on `vendor_profiles`, (2) `/api/vendor/home-market` GET/POST endpoint, (3) dashboard home market card display, (4) `vendor/markets/page.tsx` 🏠 badge + "Set as Home Market" button + home market card, (5) `markets/page.tsx:291` stale text "used as your primary position in geographic search results" (geographic search does NOT actually use this column — confirmed via grep in Session 70). Six helper functions in `vendor-limits.ts` (`getHomeMarket`, `setHomeMarket`, `canChangeHomeMarket`, `isHomeMarket`, and usage in `getVendorUsageSummary`). When cleaning up: decide whether home_market_id has any remaining meaningful purpose (maybe as a vendor-preferred display default?), and either (a) fully remove it including the column migration, or (b) repurpose it explicitly for something and update the UI text. DO NOT touch this until geographic search is stable — user's constraint in Session 70.
- [ ] **Retroactively fix misleading commit message on `dfd01923`** — Session 70 accidentally bundled migration folder cleanup (107-109 deletions + 110-113 moves to `applied/` + `ROLLBACK_109.sql` deletion) into the commit titled `docs: Protocol 8 — Error Log Review at every session kickoff`. The commit log doesn't reflect the migration work. **Fix when there's downtime:** either (a) note in decisions.md / session history that migration cleanup happened in `dfd01923`, or (b) if this section of history is ever rebased for another reason, split it cleanly. No functional impact — all work is committed and correct, just the message is incomplete. Caught in Session 70.
- [ ] **Dead code: delete `apps/web/src/components/vendor/CertificationsForm.tsx`** — Only its `Certification` TYPE is imported (by `vendor/edit/page.tsx`). The component itself is never rendered. Either inline the type into a types file or delete the component and keep the type-only export. Session 70.
- [ ] **Refactor events routes to use `getVendorProfileForVertical` for consistency** — 4 of 5 events routes (`route.ts`, `message`, `cancel`, `respond`) were fixed by commit `17fa16cc` with an inline pattern that works correctly but doesn't use the shared utility. Cosmetic refactor, zero behavior change. Session 70.

---

## Completed (Archive)

| Date | Item |
|------|------|
| 2026-03-20 | Active orders count fix (migration 092 + trigger 093 + data cleanup) |
| 2026-03-20 | Admin approval tier names (was basic/standard, now free) |
| 2026-03-20 | Admin vendor/listing table tier filter + badge colors |
| 2026-03-20 | Event invite event_approved check |
| 2026-03-20 | Event request past date validation |
| 2026-03-20 | JSONB race condition on doc upload |
| 2026-03-20 | Where-today rate limit |
| 2026-03-20 | Resolve-issue refund math (now includes buyer fees) |
| 2026-03-20 | Inventory restore vertical awareness (FT fulfilled = no restore) |
| 2026-03-20 | Migration 085 applied (lazy profile + role enums) |
| 2026-03-20 | External payment safety net (buyer cancel + vendor non-payment) |
| 2026-03-20 | Vendor resolve-issue UI on orders page |
| 2026-03-20 | Admin order issues page |
| 2026-03-20 | Listing edit no longer demotes published to draft |
| 2026-03-20 | Where-today FM text (header, subtitle, count labels) |
| 2026-03-20 | Where-today zip persistence (reads from API, not cookie) |
| 2026-03-20 | Cancelled order banner — no refund text for external payments |
| 2026-03-20 | Cancel-nonpayment updates order-level status |
| 2026-03-20 | Resolve-issue updates order status when all items cancelled |
| 2026-03-20 | Migration 093: auto-cancel order trigger |
| 2026-03-20 | UserRole type dedup (import from roles.ts) |
| 2026-03-20 | Cart remove stub deleted |
| 2026-03-20 | BR-5, BR-6, BR-11 documented in decisions.md |
| 2026-03-20 | Vendor profile desktop layout (3 lines) + social button sizing |
| 2026-03-20 | Admin stuck orders + open issues cards on dashboard |
| 2026-03-20 | Notification deep-linking (all buyer notifications → specific order) |
| 2026-03-20 | Vendor expiration notification (cron Phase 1) |
| 2026-03-20 | Order confirmed notification includes handoff instructions |
| 2026-03-20 | Spanish translations for new notifications |
| 2026-03-20 | Cart cross-vertical validation (E-8/E-9) |
| 2026-03-20 | Order-ready notification includes pickup instructions + deep-link |
| 2026-03-20 | Prod zip_codes seeded (33,793 rows) |
| 2026-03-20 | Event Phase 1: per-event vendor menus (migration 094 + vendor picker) |
| 2026-03-20 | Event Phase 1: lifecycle statuses (ready/active/review) + admin transitions |
| 2026-03-20 | Event Phase 3: attendee feedback form on event page |
| 2026-03-20 | Event Phase 3: vendor prep reminder (cron Phase 11) |
| 2026-03-20 | Event Phase 3+4: settlement notification + revenue estimate |
| 2026-03-20 | External payment fee flow documented in decisions.md |
| 2026-03-04 | Upstash Redis rate limiting |
| 2026-03-04 | CI lint fixes (ESLint errors) |
| 2026-03-04 | Sentry setup (staging + production) |
| 2026-03-04 | Legal terms 3-tier system |
| 2026-03-04 | Production push (all infra) |

## 🔶 DEFERRED — P10 stage (b): bound park pickup availability to booked dates (2026-07-15)

**What:** extend `get_available_pickup_dates` so listings at PAID FT parks only offer pickup dates the vendor actually has a paid `park_spot_bookings` row for (intersection). Prevents "buyer orders pickup for a Saturday the truck won't attend" once T4 auto-creates recurring schedules from date-specific bookings.
**Why deferred:** this is the money-gate availability RPC (mig 054 tz fix + mig 131 schedule requirement live in it; standing do-NOT-touch-casually warning; prior breakage incidents). USER DECISION 2026-07-15: own careful build — isolated migration (user applies), verbatim-preserving body except the one park-scoped intersection, before/after availability-output tests.
**Interim exposure (accepted):** after T4, an auto-created recurring schedule persists past the booked dates; trucks can deactivate it; no-show/expiry machinery covers unfulfilled orders. Context: `apps/web/.claude/park_tester_feedback_2026-07-15_research.md`.
