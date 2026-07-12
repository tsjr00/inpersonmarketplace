# Session 76 — Events Code Review

**Trigger:** Tester feedback during Session 75 staging test:
1. Events language is FT-focused even on FM vertical (cuisine vs category)
2. "popup market" → should be "vendor event"
3. Generic language/placeholders in event notifications & emails
4. Events page isn't native mobile — just shrinks desktop view

**Goal:** Thorough events code review. Report gaps, bad code, UI/UX problems with file:line cites.

---

## Executive summary

**Total findings:** 1 P0, 7 P1, 11 P2, 6 P3. All cited with file:line.

**Most urgent (recommend fix this week):**
1. **P0 — `catering_vendor_invited` notification has broken actionUrl.** Every auto-matched vendor invitation produces a 404 link. Template at `src/lib/notifications/types.ts:770` interpolates `${d.marketName}` but call sites (`src/lib/events/event-actions.ts:374`, `src/app/api/events/[token]/select/route.ts:288`) pass `marketId`. Page route slug is `[marketId]`. → B1 / D3.
2. **P1 — "Pop-Up Market" everywhere on FM.** User wants "Vendor Event." 14 occurrences across configs, notifications, emails, page metadata, and the auto-generated event name. → A1.
3. **P1 — "Cuisine" used in FM organizer-facing copy.** Helper text on EventRequestForm + dashboard label say "cuisines" / "Cuisine Preferences" on FM. → A2.
4. **P1 — EventRequestForm uses fixed `1fr 1fr` and `2fr 1fr 1fr` grids on mobile.** No media queries. State + zip fields cramped to ~65px on phone. → C1.
5. **P1 — Force-completing an event with unfulfilled items fires a "thank you for participating!" notification to vendors who actually have unfulfilled orders.** → B6 / D5.
6. **P1 — Wave generation silently defaults to 25 orders/wave per vendor when capacity unset.** Conflicts with the user's "no silent fallbacks" rule and risks over-promising buyer slots. → D1.
7. **P1 — `event_settlement_summary` template unconditionally says "vendors"** without branching for FT. → B4.

**Architectural debt (P2):**
- 6 separate inline Resend HTML email blocks for events, with copy-pasted FM/FT branching boilerplate (B7).
- Notification actionUrl across 10+ event templates falls back to `food_trucks` when `vertical` field missing — only an issue if data ever drops vertical (B9).
- Inconsistent organizer auth: GET details = email-only; PATCH details = email or organizer_user_id (D2).

**Mobile responsiveness reality:** the events form needs structural mobile work (C1), but the shop and event-detail pages are mostly OK because they already use `flex-direction: column` or `auto-fill` grids.

**Schema notes from this audit:**
- `event_token` is UNIQUE (verified at `supabase/migrations/applied/20260319_091_event_token.sql:6`) — defense-in-depth missing on some queries but not exploitable.
- `event_end_date` exists on both `catering_requests` and `markets` — **the backlog item suggesting it's a phantom column can be closed** (D11).

**Recommendation for sequencing the fix work:**
1. **Hotfix B1/D3** (broken vendor invite link) — single-file edit, deploy immediately.
2. **Language pass (A1, A2, A3)** — coordinated string-replace across 8-10 files. Needs user input on exact replacement wording for "Pop-Up Market" → "Vendor Event" in different contexts (button text, headings, auto-generated names).
3. **Mobile pass (C1)** — add a `<style>`-tag-based responsive breakpoint to the events page following the AdminResponsiveStyles pattern.
4. **Notification message accuracy (B4, B6, D1)** — message templates + the wave-capacity fallback.
5. **Architectural cleanup (B7)** — extract event email helpers — do later, after the user-visible fixes.

**Out of scope (not in this report):** deeper API security audit (covered by Session 75 audit), payment-model build-out, vendor pool sizing logic.

---

## Working checklist (per Incremental Research Protocol)

- [x] Component A: Language audit (cuisine, popup market, FT-only terms in event UI)
- [x] Component B: Notification + email template audit (placeholders, vertical-aware copy)
- [x] Component C: Mobile responsiveness audit (events pages)
- [x] Component D: Event API/lib code review (bad code, broken connections, gaps)
- [x] Final consolidation

---

## Component A — Language audit findings

### A1. "Pop-Up Market" still in product copy (user wants "Vendor Event")

User stated: *"we are not using 'popup market' as a term anymore we are using 'vendor event'"*. Current occurrences:

| File:line | Current text | Audience |
|---|---|---|
| `src/lib/vertical/configs/farmers-market.ts:39` | `event_feature_name: 'Pop-Up Markets'` | FM events page H1 |
| `src/lib/vertical/configs/farmers-market.ts:40` | `event_request_heading: 'Host a Pop-Up Market'` | FM form heading |
| `src/lib/vertical/configs/farmers-market.ts:45` | `event_hero_subtitle: 'Host a pop-up market at your office...'` | FM hero |
| `src/lib/vertical/configs/farmers-market.ts:46` | `event_submit_button: 'Submit Pop-Up Request'` | FM submit button |
| `src/lib/notifications/types.ts:749` | `'New Pop-Up Market Request'` | Admin notification title |
| `src/lib/notifications/types.ts:751` | `'pop-up market request'` | Admin notification message |
| `src/app/api/event-requests/route.ts:430` | `requestType = 'Pop-Up Market Request'` | Admin email subject + body |
| `src/app/api/event-requests/route.ts:502` | `'...the popup market...'` | FM organizer confirmation email |
| `src/app/[vertical]/events/page.tsx:24` | metadata title `'Book a Pop-Up Market'` | SEO/social title |
| `src/app/[vertical]/events/page.tsx:30` | keywords `'pop-up market, ...'` | SEO meta keywords |
| `src/app/[vertical]/events/page.tsx:32` | OG title `'Book a Pop-Up Market'` | OG card |
| `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx:1387` | `'private events and pop-up markets.'` | Vendor profile copy |
| `src/lib/events/event-actions.ts:101` | `eventSuffix = 'Pop-Up Market'` | Auto-generated event name (`{Company} Pop-Up Market`) |
| `src/lib/vertical/types.ts:13` | comment `// Event system (catering / pop-up markets)` | (low priority — comment only) |
| `src/lib/vertical/configs/farmers-market.ts:38` | comment `// Event system (pop-up markets)` | (low priority — comment only) |

**Severity: P1.** This is user-visible across FM events page, the form, the auto-generated event name, the admin notification, and the organizer confirmation email. Search-and-replace with appropriate substitution per context (most → "Vendor Event"; but "Submit Pop-Up Request" → e.g. "Submit Event Request"; auto-generated name → "{Company} Vendor Event"). Need user input on whether tagline stays the same or gets reworked.

### A2. "Cuisine" used in FM context (user wants "Category")

User: *"on FM its not cuisine, it's category"*. Current occurrences in user-facing copy:

| File:line | Current text | Vertical context |
|---|---|---|
| `src/components/events/EventRequestForm.tsx:765` | helper text: `${n} ${n === 1 ? 'cuisine' : 'cuisines'}` (no-pool branch) | Both verticals — bug |
| `src/components/events/EventRequestForm.tsx:764` | helper text: `avg ${avgCategoriesPerVendor.toFixed(1)} cuisines per vendor` (with-pool branch) | Both verticals — bug |
| `src/components/events/EventRequestForm.tsx:764` | helper text: `${preferred_vendor_categories.length} cuisines at a... event` | Both verticals — bug |
| `src/components/events/OrganizerEventDetails.tsx:495` | field label: `cuisine_preferences: 'Cuisine Preferences'` | Both verticals — bug on FM |
| `src/components/events/OrganizerEventDetails.tsx:733` | placeholder: `'e.g. BBQ, Mexican, Asian fusion...'` | Both verticals — wrong placeholder on FM |
| `src/lib/events/viability.ts:505` | match detail string: `'No cuisine preference specified'` | Both verticals — bug on FM |
| `src/lib/events/viability.ts:558` | match detail: `No match for "${cuisinePreferences}"` | Both verticals — bug on FM |
| `src/app/api/events/[token]/select/route.ts:308-326` | builds `cuisineList` for marketing copy in confirmation email; uses literal "cuisine" naming internally | Both verticals — variable name internal, but the email body at L372 uses `${cuisineList}` interpolated directly — needs check |
| `src/app/[vertical]/events/page.tsx:385` | `'Diverse cuisines — tacos, BBQ, Asian, pizza, Mediterranean...'` | FT-only branch — OK |
| `src/app/[vertical]/events/[token]/select/page.tsx:260` | rendered chip label uses `v.cuisine_categories` array values — values from API at `select/route.ts:139` are listing categories which on FM would be e.g. "produce", on FT "tacos" — **render is fine, label naming internal** | Both verticals (chip rendering of categories themselves is OK) |

DB column itself — `catering_requests.cuisine_preferences` — is fine to leave (rename would require migration; column is internal). The user-facing labels are what matter.

**Severity: P1.** The helper text on the FM events form will say "cuisines" to a farmers-market organizer — a mismatch the user explicitly called out. Also the field label "Cuisine Preferences" in the dashboard.

### A3. "food trucks" / "trucks" leak into FM contexts via fallbacks

| File:line | Current behavior |
|---|---|
| `src/lib/notifications/types.ts:763` | `vendorWord = vertical === 'farmers_market' ? 'vendors' : 'food trucks'` — branch is correct, but if `vertical` field is missing from data, falls through to `'food trucks'` |
| `src/lib/notifications/types.ts:767` | catering_vendor_invited FT branch hardcodes "select from 4 to 7 items from your catering menu" — FM branch correctly says "items from your event-ready items" but the FT copy still uses "catering menu" terminology that may not match how this is described elsewhere |
| `src/lib/notifications/types.ts:754,770,779,809,818,828,840,849,858,867` | actionUrl falls back to `'food_trucks'` when `d.vertical` missing — broken deep-links for FM events if data is missing |
| `src/components/events/EventRequestForm.tsx:453` | `vendorWord = vertical === 'farmers_market' ? 'vendors' : 'food trucks'` — used in success page H1 and bullets |
| `src/components/events/EventRequestForm.tsx:494` | conditional "Monitor pickup wave reservations" only for FT — but waves may apply on FM too? (need to check; if so, FM users miss a feature mention) |
| `src/app/api/event-requests/route.ts:480` | `eventType = 'Market event' / 'Food truck event'` — used in subject line, OK |

**Severity: P2.** The fallbacks are mostly defensive (data should always include vertical), but the food_trucks default in actionUrl across 10+ notification entries is a real risk. Fix is low-cost: derive vertical from event/notification context or require it.

### A3a. Marketing-kit email mentions "Fresh food vendors" / "Food trucks" but uses generic structure

`src/app/api/events/[token]/select/route.ts:382` — social media template:
```
${isFM ? 'Fresh food vendors' : 'Food trucks'} at our event on ${event.event_date}!
```
This is fine on FT but on FM "Fresh food vendors" is a single-vertical phrasing that doesn't match the term system (vendor_people = "farmers, bakers, and artisans"). Consider tying it to terminology config so it stays in sync.

`src/app/api/events/[token]/select/route.ts:372` — email-to-staff template:
```
We've arranged ${vendorLabel}s for our event on ${event.event_date} featuring ${cuisineList}.
```
"featuring tacos, BBQ, ..." reads natural for FT. For FM the same template renders e.g. "featuring produce, baked goods, dairy" which sort of works but the word "cuisineList" is internal — what matters is the text. Probably acceptable but consider relabeling to "options" or "offerings" for vertical-neutrality.

### A4. SEO metadata uses old language for FM

`src/app/[vertical]/events/page.tsx:24-33` returns FM metadata:
- title: "Book a Pop-Up Market | {brand}"
- keywords: "pop-up market, farmers market event, local food event, artisan market booking"
- og title: "Book a Pop-Up Market"

If "Vendor Event" is the new term, these should follow. Need user input — SEO inertia matters; "pop-up market" is what people search for, so changing keywords might cost discoverability. Recommend: change UI copy + visible page text, but consider keeping SEO metadata as-is OR augmenting (not replacing) keywords with "vendor event" + "private market event."

---

## Component B — Notification + email template findings

### B1. **BUG (P0): catering_vendor_invited actionUrl uses `marketName`, but call sites pass `marketId`**

- Template: `src/lib/notifications/types.ts:770`
  ```ts
  actionUrl: (d) => `/${d.vertical || 'food_trucks'}/vendor/events/${d.marketName}`
  ```
- Page route slug: `src/app/[vertical]/vendor/events/[marketId]/page.tsx` (uses `[marketId]`)
- Call site 1: `src/lib/events/event-actions.ts:374` passes `marketId: marketId` (no `marketName` field)
- Call site 2: `src/app/api/events/[token]/select/route.ts:288` passes `marketId: event.market_id` (no `marketName` field)

**Result:** Every "New Event Opportunity" notification produces `actionUrl = /food_trucks/vendor/events/undefined` — clicking it goes to a 404. This affects EVERY auto-matched vendor invitation. Fix: change the template to use `${d.marketId}`, or pass marketName from call sites. Marketid is the safer choice since the page route is `[marketId]`.

### B2. catering_vendor_invited message contains FT-specific copy in the FT branch only — but FM branch also reads stiff

- `src/lib/notifications/types.ts:766-768`
- FM: "select the items from your event-ready items for the event manager to review" — awkward phrasing, repeats "items" twice.
- FT: "select from 4 to 7 items from your catering menu" — references "catering menu" which is the FT term.
- Both branches: opening sentence uses `${d.eventAddress}` (city + state) but reads grammatically odd: "A Springfield, IL event organizer is looking for vendors..." — the word "A" before a city name is wrong; should be "An organizer in {address}" or similar.

**Severity: P2** (functional but reads as auto-generated).

### B3. catering_vendor_invited fixed copy refers to "private event opportunity"

`types.ts:768` — message starts: "We have matched you with an upcoming private event opportunity." This is correct for both verticals (private = not the public marketplace). However on FM the user's new term "vendor event" should likely also surface here. Confirm with user.

### B4. event_confirmed message uses "your vendor" / "your vendors" without checking vertical

`types.ts:797`:
```
`Great news — ${d.vendorCount || 'your'} vendor${(d.vendorCount || 0) > 1 ? 's are' : ' is'} confirmed for your event on ${d.eventDate}!...`
```
On FT this should say "food trucks", not "vendors". Lower-priority because it's grammatically OK either way, but inconsistent with the catering_vendor_invited template (which does branch on vertical).

### B5. event_cancelled_vendor message is generic

`types.ts:787`:
```
`The event on ${d.eventDate || 'the scheduled date'} organized by ${d.companyName || 'the organizer'} has been cancelled. Your participation is no longer needed.`
```
Vendors get this with `companyName: event.company_name` from `cancel/route.ts:106` — fine. **However**, the "Your participation is no longer needed" phrasing reads cold. Recommend warmer phrasing: "We'll let you know about future opportunities" / "We appreciate your willingness to participate." Low priority.

### B6. event_settlement_summary repurposed as unfulfilled-items warning

`src/app/api/admin/events/[id]/route.ts:344-348`: when an event is force-completed with unfulfilled items, the route fires `event_settlement_summary` notification with marketName = `${companyName} — N unfulfilled order(s) need attention`. The template (`types.ts:817`) renders:
```
`Settlement for "${d.marketName}" is complete. ${d.orderCount || 0} order(s) fulfilled${d.payoutAmount ? ` — $${d.payoutAmount} paid out` : ''}. Thank you for participating!`
```
So the vendor receives: `Settlement for "Acme Corp — 3 unfulfilled orders need attention" is complete. 3 orders fulfilled. Thank you for participating!` — the message says "fulfilled" but `orderCount` here is the *unfulfilled* count, and `marketName` becomes a sentence. **Bug: misleading vendor notification on force-completion.** Need a separate notification type for "event completed with unfulfilled items needing attention" or re-use `event_vendor_gap_alert` audience-shifted.

**Severity: P1** — vendor sees a positive "thank you for participating" message when they actually have unfulfilled orders to deal with.

### B7. Email senders use direct Resend.send rather than going through service.ts

Six different ad-hoc Resend HTML email blocks for events (admin alert, organizer confirmation, vendor confirmed-event, organizer status, organizer cancel, etc.). All built inline with template-literal HTML. They share branding decisions (sender name, accent color, sender domain) but there's no abstraction — same FM/FT branch boilerplate copy-pasted 6+ times. If branding (e.g. "Pop-Up Market" → "Vendor Event") changes, every one of these has to be edited individually.

Locations:
- `src/app/api/event-requests/route.ts:436` (admin alert)
- `src/app/api/event-requests/route.ts:525` (organizer confirmation)
- `src/app/api/events/[token]/select/route.ts:339` (event confirmed + marketing kit)
- `src/app/api/events/[token]/cancel/route.ts:180` (admin cancel notification)
- `src/app/api/admin/events/[id]/route.ts:507` (event confirmed by admin)
- `src/app/api/admin/events/[id]/route.ts:569` (organizer status update)

**Severity: P2** (architectural debt). Recommend extracting a `sendEventEmail({ template, vertical, to, vars })` helper in `src/lib/email/event-emails.ts` so all event copy lives in one place. Out of scope for the current language fix unless the user wants to address both at once.

### B8. Organizer confirmation email body has FM-specific "popup market" mention

Already covered in A1 row `src/app/api/event-requests/route.ts:502`. Listed here too as it's an email-template issue.

### B9. catering_request_received notification's actionUrl falls back to FT for unknown vertical

`types.ts:754`: `actionUrl: (d) => '/${d.vertical || 'food_trucks'}/admin/events'`. Same pattern across 10+ event templates. Where the data is admin-routed and the event is FM, this is harmless because admins view both verticals. Where the data is vendor-routed, an FM vendor would land in an FT URL, which would 404 the page.

---

## Component C — Mobile responsiveness findings

**Pattern in this codebase:** there's no shared `useIsMobile` hook or media query system in inline styles. The admin section uses a `<style>`-tag injection trick (`src/components/admin/AdminResponsiveStyles.tsx` lines 45-492) with raw `@media (min-width: ...)` rules. The events pages use NO equivalent — they're entirely inline-styled with fixed grid templates. This means:

1. Inline-style props (`gridTemplateColumns: '1fr 1fr'`) cannot have media queries.
2. Layouts that work on desktop simply shrink to phone width without restructuring.
3. The user's complaint ("shrinks but is basically just a smaller version of desktop") is structurally accurate.

### C1. EventRequestForm — fixed 2-column grid on mobile

- `src/components/events/EventRequestForm.tsx:147-151`: `rowStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }` — used for date/headcount, start/end time, company/email pairs.
- On a 360px-wide phone with `padding: 20px` outer + `padding: spacing.md` inner card, the actual content width is ~280px. Each `1fr` column = ~135px. A `<input type="date">` rendered with iOS's native date picker is fine at 135px; an `<input type="number" placeholder="50">` for headcount also OK. The "Company / Organization" + "Email" pair at L570-581 with `1fr 1fr` puts a `placeholder="Company, church, school, etc."` placeholder into 135px of width — placeholder gets clipped.

- `src/components/events/EventRequestForm.tsx:615`: city/state/zip uses `gridTemplateColumns: '2fr 1fr 1fr'`. On a 280px content width: city ≈ 130px, state ≈ 65px, zip ≈ 65px. State auto-uppercases 2-char input (fine), zip is 5-10 chars (gets cramped at 65px). On iOS the keyboard takes half the screen — these tiny inputs are awkward to tap precisely.

**Fix:** Add a useEffect-based mobile detection or, better, wrap form sections in a `<div>` with a `<style>` tag that defines a CSS class with `@media (max-width: 600px) { grid-template-columns: 1fr; }`. The events pages don't currently follow this pattern but other parts of the app do.

**Severity: P1** — actively reported by user as "not native mobile."

### C2. Event landing page (`/events`) — value prop grid is 2-col on mobile

`src/app/[vertical]/events/page.tsx:268-273`:
```ts
gridTemplateColumns: '1fr 1fr',
gap: spacing.sm,
```
Renders 4 value-prop cards in 2x2 on mobile. Each card has a 14px title + 12px description. At 280px content width, each card = ~135px wide, with paragraphs of "Direct from local farms and artisans..." wrapping into 5+ lines. This is acceptable (not broken) but cramped — 1-col stack would read better on phones.

**Severity: P2.**

### C3. Event landing — sticky padding top breaks on small screens

The hero `padding: '40px 20px'` (`page.tsx:110`) plus `marginBottom: spacing.lg` for each section means the top of the page on mobile takes ~140px before the H1 is visible. No problem per se, but combined with the trust line + category chip rows, the user has to scroll a long way before reaching the form. Recommend tighter top padding on mobile.

**Severity: P3.**

### C4. ShopClient — mostly OK on mobile (uses auto-fill grid)

`src/app/[vertical]/events/[token]/shop/ShopClient.tsx:878,1113`: uses `gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))'` — collapses to 1 column on screens < 220px content width. Listing cards are 220px wide minimum, so they stack on mobile. **Good.**

The sticky cart bar at L1257 uses `position: 'fixed', bottom: 0, left: 0, right: 0` — full-width sticky bottom. **Good.** It's a typical mobile pattern.

### C5. Event detail page (`/events/[token]`) — vendor cards stack OK

`src/app/[vertical]/events/[token]/page.tsx:228`: `display: 'flex', flexDirection: 'column', gap: spacing.md` — stacks vendors vertically. Menu items inside use `display: flex, gap: spacing.sm` for image + title + price (L267-289). On mobile this stays as a horizontal row with a 64px image, which works.

**Verdict:** This page is mobile-OK.

### C6. Vendor select page (`/events/[token]/select`) — vendor cards stack OK

`src/app/[vertical]/events/[token]/select/page.tsx:235`: `flexDirection: 'column'` for vendor list. Inside each card, a `display: flex, justifyContent: 'space-between'` row puts business name on left and rating + price on right — this can wrap awkwardly if business names are long, but `flexShrink: 0` on the right cluster (L273) protects it. **Generally OK.**

### C7. Hero on event detail page wraps but has long h1

`src/app/[vertical]/events/[token]/page.tsx:184`: `fontSize: typography.sizes['3xl']` for company_name H1. On a 360px phone with company names like "Springfield Chamber of Commerce 2026 Summer Bazaar" this may overflow or wrap into 3 lines. No `wordBreak` or max-width control. Probably acceptable but worth noting.

**Severity: P3.**

### C8. OrganizerEventDetails (the post-signup dashboard) is desktop-only

This is the post-signup organizer dashboard — long forms with input groups. On mobile each FIELD_GROUP renders as a stack already (no `1fr 1fr` grids). **OK structurally**, but the inline buttons at L429-468 (Save / Cancel) sit in a row that may or may not fit on mobile depending on label lengths. Generally low risk.

### C9. Viewport meta — auto-set by Next.js, no issue

Verified `src/app/layout.tsx:1-57` — no explicit viewport meta. Next.js 14 App Router auto-injects `<meta name="viewport" content="width=device-width, initial-scale=1">` by default, so this is fine. **Not a finding.**

### C10. Form submit button is full width — good

`EventRequestForm.tsx:794`: `width: '100%'` — proper mobile-friendly tap target. Good.

---

## Component D — Event APIs/lib code review findings

**Verification note:** I delegated a broad sweep to a research agent and then verified each significant claim by reading the code or migrations. The agent's "missing vertical_id filter" findings on token-based lookups are NOT P1 bugs — verified at `supabase/migrations/applied/20260319_091_event_token.sql:6` that `event_token` has a UNIQUE constraint, so adding `.eq('vertical_id', ...)` would be defense-in-depth, not a fix for a real exploit. Findings below are filtered to actual issues I read myself.

### D1. **Silent fallback default for event wave capacity (P1, breaks "no silent fallbacks" rule)**

`src/lib/events/wave-generation.ts:117-119`:
```ts
const capacityPerWave = acceptedVendors.reduce((sum, v) => {
  return sum + (v.event_max_orders_per_wave || 25)
}, 0)
```
When a vendor has not declared `event_max_orders_per_wave`, this silently fills in 25. Per `feedback_no_silent_fallbacks.md` (memory), the user's standing rule is to never mask bad data with defaults — surface it instead. The 25 default could cause:
- Over-promised capacity → buyers reserve waves the vendor cannot fulfill → day-of fulfillment failure
- Under-promised capacity → buyers turned away unnecessarily

**Fix options:** (a) error-out and require event_readiness completion before vendor can be invited; (b) log a warning + use 0 capacity for that vendor; (c) keep 25 default but surface a flag to admin. User preference needed.

### D2. **GET /events/[token]/details is email-only auth, but PATCH allows email OR organizer_user_id (P2 inconsistency)**

`src/app/api/events/[token]/details/route.ts:115` (GET):
```ts
const isOrganizer = event.contact_email?.toLowerCase() === user.email?.toLowerCase()
```

vs L153-154 (PATCH):
```ts
const isOrganizerById = event.organizer_user_id === user.id
const isOrganizerByEmail = event.contact_email?.toLowerCase() === user.email?.toLowerCase()
```

Edge case: organizer signs up with a different email than their event's contact_email, then their `organizer_user_id` gets linked on first PATCH (L232-234). Subsequent PATCHes work, but GET still 403s because GET only checks email. Result: organizer can save changes but cannot read them back.

**Fix:** GET should mirror PATCH's two-way auth check.

### D3. **catering_vendor_invited actionUrl uses wrong field — also flagged in B1, repeated here for completeness (P0)**

Already documented in B1. Belongs in both lists because it's an API/template integration bug.

### D4. event-actions.ts auto-generated event name has hardcoded "Pop-Up Market" (already in A1)

`src/lib/events/event-actions.ts:101`: `eventSuffix = isFM ? 'Pop-Up Market' : 'Private Event'`. Same fix as A1 — once we rename, this name is permanently stamped on the markets row at creation time. Migration of existing rows would be required if the user wants old events renamed too.

### D5. event_settlement_summary fired with misleading payload on force-completion (already in B6)

Documented in B6 — adding here for completeness as the bug is in `src/app/api/admin/events/[id]/route.ts:344-348`.

### D6. **Refresh-matches lacks idempotency rate limit beyond IP-based (P2)**

`src/app/api/events/[token]/refresh-matches/route.ts:38`: rate-limit is keyed on `clientIp` only. An organizer could refresh repeatedly across IPs, each invoking `autoMatchAndInvite` (which is idempotent on re-invites per L88 comment, so the *result* is fine — no spam — but the work happens each time). Per-event rate limit would cap server cost and notification storm risk. Low severity since work is bounded.

### D7. **wave-generation default 25 collides with check that no vendors are accepted (P3 logic order)**

`wave-generation.ts:106-113`: returns "No accepted vendors found" if zero vendors. That's correct. But consider that `acceptedVendors.length > 0` check is sufficient — the fallback `|| 25` at L118 should arguably be a hard failure: if a vendor was accepted but has no event_max_orders_per_wave, that's a data-quality issue from event_readiness onboarding. See D1.

### D8. **Wave-generation has no vertical_id check on market_vendors (P3 defense-in-depth)**

`wave-generation.ts:91-95`: filters by `market_id` only. Same UNIQUE-id rationale as event_token, so not a real exploit, but consistency with other queries argues for adding it.

### D9. The agent flagged "code smell" at order/route.ts:43 about early service client instantiation — verified as non-issue

`src/app/api/events/[token]/order/route.ts:43`: `const serviceClient = createServiceClient()` is fine — instantiating a client object is ~free, and the code path always reaches a query. Not a real concern.

### D10. **Event-actions autoMatchAndInvite — verified clean for vertical scoping**

`src/lib/events/event-actions.ts` — the agent's implication that this might leak across verticals was wrong. Reading the code: `request.vertical_id` is consistently used and threaded through. **Not a finding.**

### D11. **`event_end_date` column investigation (resolved)**

The backlog item suggested `m.event_end_date` was a phantom column. Verified at `supabase/migrations/applied/20260307_070_corporate_catering.sql` that `catering_requests.event_end_date` exists. Verified at `supabase/migrations/20260221_039_add_event_market_type.sql:1` that `markets.event_end_date` exists. **Not a phantom column — backlog item can be closed.** (However, the schema snapshot may not reflect this — that's a separate snapshot-staleness concern.)

### D12. event-actions.ts headcountPerVendor calculation can divide by zero if vendor_count is 0

`src/lib/events/event-actions.ts:356`:
```ts
const headcountPerVendor = Math.ceil(request.headcount / request.vendor_count)
```
If `request.vendor_count === 0`, this returns `Infinity`. Path probably impossible in practice (Stage 1 form requires vendor_count >= 1, API validates `1-20` at PATCH), but a guard would be cheap. Low priority.

---




