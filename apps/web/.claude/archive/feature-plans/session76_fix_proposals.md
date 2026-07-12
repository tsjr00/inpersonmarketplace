# Session 76 — Events Review Fix Proposals

**Source audit:** `session76_events_review.md`
**Format:** Each proposal lists file:line, current code, planned change, risk, decision needed.
**Approval model:** I will NOT implement any of these without explicit per-batch approval. For critical-path files (cart/checkout/payment) any change requires explicit per-file approval per `critical-path-files.md`. None of these proposals touch critical-path files.

---

## User answers (2026-05-01 reply)

- **Q1.** Use the existing `term()` system — don't create new branches. Update FM config values and migrate hardcoded ternaries to call `term()`. Add new keys only where the system has none (e.g. singular `event_request_name_suffix`).
- **Q3.** Option A — hard error: vendor can't accept until capacity declared. No silent fallback.
- **Q4.** No backfill — there are no real events on prod yet.
- **Q5.** Close as investigated — `event_end_date` exists, no fix needed.

---

## Original open questions (resolved above — kept for reference)

Q1. **"Pop-Up Market" → what exactly?** I have these contexts:

| Context | Current | Proposal |
|---|---|---|
| FM event feature H1 | "Pop-Up Markets" | "Vendor Events"? |
| FM form heading | "Host a Pop-Up Market" | "Host a Vendor Event"? |
| FM hero subtitle | "Host a pop-up market at your office..." | "Host a vendor event at your office..."? |
| FM submit button | "Submit Pop-Up Request" | "Submit Event Request"? |
| Admin notification title | "New Pop-Up Market Request" | "New Vendor Event Request"? |
| Admin notification message | "...pop-up market request..." | "...vendor event request..."? |
| Admin email subject | "New Pop-Up Market Request: ..." | "New Vendor Event Request: ..."? |
| FM organizer confirmation email body | "...the popup market..." | "...the vendor event..."? |
| Auto-generated event name suffix | "{Company} Pop-Up Market" | "{Company} Vendor Event"? **Note:** new events created after the change get the new name; existing markets in DB keep the old name unless we backfill. |
| FM events page metadata title | "Book a Pop-Up Market" | "Book a Vendor Event"? **Note:** changes the social-share title and SEO. |
| FM events page metadata keywords | "pop-up market, farmers market event, ..." | Add "vendor event, private market event"? Drop "pop-up market"? |
| OG title | "Book a Pop-Up Market" | "Book a Vendor Event"? |
| Vendor profile copy | "private events and pop-up markets" | "private events and vendor events"? (reads awkward) — alternative: "private events and on-site vendor events" |
| Comments in code (types.ts:13, farmers-market.ts:38) | comment only | drop or update — your call |

→ **Need:** confirmation on each of the above OR a single rule like "everywhere in user-facing copy, replace 'Pop-Up Market(s)' with 'Vendor Event(s)' and 'Submit Pop-Up Request' with 'Submit Event Request'". Backfill of existing market names: yes/no?

Q2. **"Cuisine" on FM** — clear that label "Cuisine Preferences" → "Category Preferences" and helper text "cuisines" → "categories" on FM. But what about the FM placeholder `'e.g. BBQ, Mexican, Asian fusion...'` (`OrganizerEventDetails.tsx:733`) — this is FT-flavored even though the field name is shared. Replace per-vertical placeholder?

Q3. **Wave capacity default 25** (D1, the silent fallback) — which approach?
   - **A.** Hard error: vendor cannot be invited unless `event_max_orders_per_wave` is set in their event_readiness profile.
   - **B.** Soft warning: log + use 0 capacity for that vendor (they get no wave slots until they fill it in).
   - **C.** Keep 25 as default but surface a flag to admin in the event dashboard.
   - **D.** Make the default configurable per-vertical (e.g. FT default 30, FM default 15) and log when used.

Q4. **Backfill existing event names** — there are existing `markets` rows with names like `"Acme Corp Pop-Up Market"`. Update them to `"Acme Corp Vendor Event"`? Or only apply the new naming to events created from now on?

Q5. **`m.event_end_date` backlog item** — finding D11 confirms this column exists, not a phantom. OK to remove from backlog?

---

## P0 — Hotfix (single-file edit, ship today)

### F1. Fix broken vendor invitation actionUrl (B1 / D3)

**File:** `src/lib/notifications/types.ts:770`
**Current:**
```ts
actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketName}`,
```
**Proposed:**
```ts
actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketId}`,
```
**Risk:** None — `marketId` is already passed by all 2 call sites (`src/lib/events/event-actions.ts:374`, `src/app/api/events/[token]/select/route.ts:288`). Page route slug at `src/app/[vertical]/vendor/events/[marketId]/page.tsx` uses `[marketId]`.
**Effort:** 1 line change. No tests required (no existing test for this URL builder).
**Approval needed:** Yes — to make the edit. **Recommend ship same-day after F2 batch.**

---

## P1 — Coordinated batches (need user answers above first)

### F2. Language pass — "Pop-Up Market" → "Vendor Event" (depends on Q1, Q4)

Once Q1 wording is confirmed, this is a coordinated string-replace across **9 files**. I will write each Edit individually:

1. `src/lib/vertical/configs/farmers-market.ts:39,40,45,46`
2. `src/lib/notifications/types.ts:749,751`
3. `src/app/api/event-requests/route.ts:430,502`
4. `src/app/[vertical]/events/page.tsx:24,30,32`
5. `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx:1387`
6. `src/lib/events/event-actions.ts:101`
7. `src/lib/vertical/types.ts:13` (comment update — optional)
8. `src/lib/vertical/configs/farmers-market.ts:38` (comment update — optional)
9. **(Conditional on Q4)** `supabase/migrations/<new>.sql` — backfill `markets.name` for existing FM events with the new naming

**Risk:** Low for code changes. The backfill migration is data-mutating and would need separate per-environment approval (dev → staging → prod). I'd write the migration but not apply it.

**Effort:** ~30 min once Q1 is answered.

### F3. Language pass — "Cuisine" → "Category" on FM (depends on Q2)

Affected files (all user-facing labels/text only — DB column stays `cuisine_preferences`):

1. `src/components/events/EventRequestForm.tsx:764-765` — helper text both branches (with-pool and no-pool)
2. `src/components/events/OrganizerEventDetails.tsx:495` — field label `'Cuisine Preferences'`
3. `src/components/events/OrganizerEventDetails.tsx:733` — placeholder (depends on Q2 answer)
4. `src/lib/events/viability.ts:505,558` — match-detail strings shown to admin

**Approach:** Branch on `vertical === 'farmers_market'` to render "category/categories" instead of "cuisine/cuisines" in those strings. Don't change the FT branch.

**Risk:** Low. All visible-only label changes.

**Effort:** ~20 min.

### F4. Mobile responsiveness for EventRequestForm (C1)

**File:** `src/components/events/EventRequestForm.tsx`
**Approach:** Add a `<style>` tag using the precedent at `src/components/admin/AdminResponsiveStyles.tsx`. Define classes like `event-row-2col` and `event-row-3col` and use them instead of inline `gridTemplateColumns`. The breakpoint:
```css
@media (max-width: 600px) {
  .event-row-2col, .event-row-3col {
    grid-template-columns: 1fr !important;
  }
}
```
- Replace inline `rowStyle` (L147-151) with className `event-row-2col`
- Replace inline city/state/zip grid (L615) with className `event-row-3col`
- Add the `<style>` block at the top of the form's return JSX

**Risk:** Medium. The existing form is heavily inline-styled, so introducing a class name pattern is a small architectural shift for this file. I'll keep all other styles inline; only the responsive grids get classes.

**Effort:** ~30 min. **Manual verification needed** on a real phone or DevTools mobile view.

### F5. Fix misleading vendor notification on event force-complete (B6 / D5)

**File:** `src/app/api/admin/events/[id]/route.ts:344-348`
**Problem:** Currently fires `event_settlement_summary` template with marketName = `"{company} — N unfulfilled order(s) need attention"`. The template at `src/lib/notifications/types.ts:817` then renders "Settlement is complete… Thank you for participating!" — wrong tone for vendors who actually have unfulfilled orders.

**Proposed:**
- **Option A** (recommended): introduce a new notification type `event_force_completed_with_unfulfilled` with appropriate copy. Add to `NotificationType` union, register in NOTIFICATION_REGISTRY. Update `route.ts:344` to use the new type.
- **Option B**: add a conditional in `event_settlement_summary` template that branches on a `unfulfilledCount` data field. Less clean; couples two concerns into one template.

**Risk:** Low (new notification type — additive). Need migration of `notification_log` enum if there's a CHECK constraint on type — verify first.

**Effort:** ~45 min including type union + migration check.

**Decision needed:** Option A or B.

### F6. Wave capacity hard-error (D1) — Q3=A confirmed

**Layered fix — all 4 layers needed for end-to-end coverage:**

**F6a. REMOVED — FT-only validation at respond/route.ts:127 is correct.**

Per user clarification (2026-05-01): FM has no waves. FM inventory controls capacity (no at-market prep time). Per-wave throughput is an FT-only concept. Don't touch `respond/route.ts:125-139`.

**F6b. App: wave-generation hard error**
- File: `src/lib/events/wave-generation.ts:115-119`
- Current:
  ```ts
  const capacityPerWave = acceptedVendors.reduce((sum, v) => {
    return sum + (v.event_max_orders_per_wave || 25)
  }, 0)
  ```
- Proposed:
  ```ts
  const vendorsMissingCapacity = acceptedVendors
    .filter(v => !v.event_max_orders_per_wave || v.event_max_orders_per_wave < 1)
    .map(v => v.vendor_profile_id as string)
  if (vendorsMissingCapacity.length > 0) {
    return {
      success: false,
      wavesCreated: 0,
      capacityPerWave: 0,
      error: `Cannot generate waves — ${vendorsMissingCapacity.length} vendor(s) have not declared per-wave capacity: ${vendorsMissingCapacity.join(', ')}`,
    }
  }
  const capacityPerWave = acceptedVendors.reduce((sum, v) => sum + (v.event_max_orders_per_wave as number), 0)
  ```
- Risk: low. `generateEventWaves()` callers already handle a `success: false` response. Existing call sites (`src/app/api/admin/events/[id]/route.ts:206-211`) catch errors via `.catch()`.

**F6c. DB: new migration to rewrite `recalculate_wave_capacity` SQL function**
- New file: `supabase/migrations/20260502_130_wave_capacity_no_silent_fallback.sql`
- Drops the `COALESCE(..., 25)` from the SQL function added by migration 120
- Replaces with a `RAISE EXCEPTION` if any accepted vendor has NULL `event_max_orders_per_wave`
- Migration body:
  ```sql
  CREATE OR REPLACE FUNCTION public.recalculate_wave_capacity(p_market_id UUID)
  RETURNS INTEGER AS $$
  DECLARE
    v_missing_count INTEGER;
    v_capacity INTEGER;
    v_updated INTEGER;
  BEGIN
    SELECT COUNT(*) INTO v_missing_count
    FROM market_vendors
    WHERE market_id = p_market_id
      AND response_status = 'accepted'
      AND event_max_orders_per_wave IS NULL;

    IF v_missing_count > 0 THEN
      RAISE EXCEPTION 'Cannot recalculate wave capacity: % accepted vendor(s) missing event_max_orders_per_wave', v_missing_count;
    END IF;

    SELECT COALESCE(SUM(event_max_orders_per_wave), 0) INTO v_capacity
    FROM market_vendors
    WHERE market_id = p_market_id AND response_status = 'accepted';

    UPDATE event_waves SET capacity = v_capacity WHERE market_id = p_market_id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

  COMMENT ON FUNCTION public.recalculate_wave_capacity IS
    'Recalculates wave capacity from accepted vendor sums. Hard-errors if any accepted vendor is missing event_max_orders_per_wave (no silent fallback).';

  NOTIFY pgrst, 'reload schema';
  ```
- Risk: any in-flight events with NULL values in `market_vendors.event_max_orders_per_wave` would error on next recalc. Per Q4 there are no real events on prod, so this is safe.

**F6d. REMOVED — CHECK constraint can't easily be vertical-aware.**

A blanket `CHECK (event_max_orders_per_wave IS NOT NULL OR response_status != 'accepted')` would block FM vendors from accepting (they're not supposed to set this field). To make it FT-only would require a trigger that joins `markets → catering_requests → vertical_id`, which is more complexity than it's worth. App-layer FT validation (already in place) plus wave-gen + SQL-function hard errors are sufficient.

**Total effort:** ~30-45 min for F6b + F6c + migration testing on dev.

### F7. event_settlement_summary uses "vendors" without vertical branch (B4)

**File:** `src/lib/notifications/types.ts:797`
**Current:**
```ts
message: (d) => `Great news — ${d.vendorCount || 'your'} vendor${(d.vendorCount || 0) > 1 ? 's are' : ' is'} confirmed for your event on ${d.eventDate}!...`
```
Wait — this is `event_confirmed`, not `event_settlement_summary`. Let me re-check the audit. Looking at audit B4: yes, this is the `event_confirmed` template at `types.ts:797`. **Audit text was correct, my batch label is wrong** — call this F7 = fix `event_confirmed` vertical wording.

**Proposed:**
```ts
message: (d) => {
  const word = d.vertical === 'farmers_market' ? 'vendor' : 'food truck'
  const wordPl = d.vertical === 'farmers_market' ? 'vendors' : 'food trucks'
  const count = d.vendorCount || 0
  const subj = count > 1 ? `${count} ${wordPl} are` : `${count || 'your'} ${word} is`
  return `Great news — ${subj} confirmed for your event on ${d.eventDate}! Share this link with your team so they can browse menus and pre-order: ${d.eventPageUrl || '(link pending)'}`
}
```
**Risk:** Low. Only changes display string.
**Effort:** 5 min.

### F8. catering_vendor_invited message phrasing (B2)

**File:** `src/lib/notifications/types.ts:766-768`
**Issue:** "A Springfield, IL event organizer is looking for vendors..." — the "A" before a city name reads wrong. Also FM branch repeats "items" twice.
**Proposed:**
```ts
return `We've matched you with an upcoming private event opportunity. An event organizer in ${d.eventAddress || 'your area'} is looking for ${vendorWord} for ${d.headcount} people on ${d.eventDate}${timeRange}. ${acceptInstructions} Tap to view details and respond.`
```
And rewrite FM acceptInstructions:
```ts
"If you accept, you'll choose which of your event-ready items to feature for the organizer to review. We recommend updating those items now so descriptions match what you plan to sell."
```
**Risk:** Low. Both verticals' wording smoothed.
**Effort:** 5 min.

### F9. GET vs PATCH organizer auth inconsistency (D2)

**File:** `src/app/api/events/[token]/details/route.ts:115`
**Current:**
```ts
const isOrganizer = event.contact_email?.toLowerCase() === user.email?.toLowerCase()
```
**Proposed:** Mirror the PATCH pattern:
```ts
const isOrganizerById = event.organizer_user_id === user.id
const isOrganizerByEmail = event.contact_email?.toLowerCase() === user.email?.toLowerCase()
const isOrganizer = isOrganizerById || isOrganizerByEmail
```
Also add `organizer_user_id` to the SELECT at L91-106 (currently not in the projection).

**Risk:** Low. Strictly broadens GET access in the same way PATCH already allows.
**Effort:** 5 min.

---

## P2 — Lower priority polish (next round)

### F10. Hardcoded "food_trucks" fallback in 10+ notification actionUrls (A3 / B9)

**Files:** `src/lib/notifications/types.ts` lines 754, 770, 779, 788, 798, 808-809, 818, 828-829, 840, 849, 858, 867, 876
**Pattern:**
```ts
actionUrl: (d) => `/${d.vertical || 'food_trucks'}/...`
```
**Proposal:** Helper at top of file:
```ts
const requireVertical = (d: NotificationTemplateData, ctx: string): string => {
  if (!d.vertical) {
    console.warn(`[notification ${ctx}] Missing vertical in template data — defaulting to farmers_market`)
    return 'farmers_market'
  }
  return d.vertical
}
```
Then `actionUrl: (d) => '/${requireVertical(d, 'event_confirmed')}/admin/events'`. Default changed from `food_trucks` to `farmers_market` (more conservative — admins see both, so the fallback URL would still work for admin-routed notifications).

**Risk:** Medium. The default change could affect any consumer that reads actionUrl assuming it never throws — verified that callers only use the string. The console.warn helps surface upstream bugs (callers that forgot to pass vertical).

**Effort:** ~45 min including grep for any test that asserts the old default.

### F11. event_cancelled_vendor warmer phrasing (B5)

**File:** `src/lib/notifications/types.ts:787`
**Current:** "Your participation is no longer needed."
**Proposed:** "We appreciated your willingness to participate. We'll keep matching you to future opportunities."
**Effort:** 1 min.

### F12. Extract shared event email helper (B7)

**Architectural:** 6 inline Resend HTML blocks across 4 files. Build `src/lib/email/event-emails.ts` with:
```ts
export interface EventEmailContext {
  vertical: string
  to: string
  contactName: string
  eventDate: string
  // ...
}
export async function sendEventConfirmationEmail(ctx: EventEmailContext): Promise<void>
export async function sendOrganizerStatusEmail(ctx: EventEmailContext, status: string, message: string): Promise<void>
// ...
```

**Risk:** Medium. Refactoring 4 files. Each removed inline block must produce identical email output (compare HTML strings). Skip until language pass is done — otherwise we churn the same files twice.

**Effort:** ~3 hours including manual email diff verification.

**Recommend:** defer to a separate session.

### F13. Event landing — value-prop grid 1-col on mobile (C2)

Same approach as F4. Add `event-vp-grid` class with `@media (max-width: 600px) { grid-template-columns: 1fr; }`.
**Effort:** 5 min once F4's `<style>` block exists.

### F14. event-actions divide-by-zero guard (D12)

**File:** `src/lib/events/event-actions.ts:356`
**Proposed:**
```ts
const headcountPerVendor = request.vendor_count > 0
  ? Math.ceil(request.headcount / request.vendor_count)
  : request.headcount
```
**Effort:** 1 min. Belt-and-suspenders — current path is gated by the form, but cheap to harden.

---

## P3 — Nits (skip unless bored)

### F15. Comment cleanup
- `src/lib/vertical/types.ts:13` — comment mentions "pop-up markets"
- `src/lib/vertical/configs/farmers-market.ts:38` — same

### F16. Hero h1 long-name handling on mobile (C7)
Add `wordBreak: 'break-word'` to `src/app/[vertical]/events/[token]/page.tsx:184`.

### F17. Tighter top padding on mobile (C3)
Conditional padding via the same `<style>` block from F4. Not blocking.

### F18. SEO metadata (A4) — defer
Recommend keeping SEO keywords stable; only update on-page H1/copy. Decide later when traffic data is available.

---

## How I'd sequence the actual work

**Day 1 (today):**
- F1 (P0 hotfix — broken vendor invite link). Single 1-line edit. Push to staging, verify, push to prod.
- Get user answers to Q1-Q4.

**Day 2:**
- F2 + F3 + F8 + F11 (language pass). One coordinated commit. Push to staging.
- F7 (event_confirmed vertical). Same commit.
- F9 (GET auth mirror). Same commit.

**Day 3:**
- F4 + F13 (mobile responsive). Push to staging. Manual phone verification.
- F5 (force-complete misleading notif). Same commit.

**Day 4:**
- F6 (wave default — depends on Q3).
- F10 (notification fallback hardening) — only if user wants it now.
- F14 (divide-by-zero guard).

**Defer:**
- F12 (architectural extraction) — separate session.
- F15-F18 (nits) — bundle into next polish pass.

---

## Approval requested

Please respond with one of:

- **"Answer Q1-Q4: [your answers]"** — I'll then write the actual Edit calls in batched proposals as listed above, asking for explicit approval before each batch ships.
- **"Just do F1"** — single hotfix only, get the broken link fixed today.
- **"Different priorities"** — point me to which findings matter most to you.
- **"Drop everything except [X]"** — narrow scope.
