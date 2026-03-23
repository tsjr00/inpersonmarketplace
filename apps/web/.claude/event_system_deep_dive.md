# Event System Deep Dive & Strategy

Created: 2026-03-18 (Session 61)
Status: Planning — no code changes approved yet

---

## Part 1: Current State (Code Audit Findings)

### What's Built & Working
1. Catering request submission (public form → admin)
2. Admin dashboard for request management (status workflow: new → reviewing → approved → declined → completed)
3. Auto market creation when approved (market_type='event', is_private=true)
4. Vendor event-readiness questionnaire (14 fields) + admin approval flow
5. Vendor invitations to events (admin selects → vendor gets notified)
6. Vendor accept/decline response flow
7. Event markets → normal buyer ordering
8. Settlement reports with financial breakdown per vendor
9. Event repeat (create new request from template)

### Key Architecture Decision
Events are **special markets** (market_type='event'), not a separate system. This means the existing ordering, checkout, and fulfillment flows all work for events without duplication.

---

## Part 2: User Feedback & Priorities

### Issue A: Navigation Placement
**Problem:** Events link is in the top page navigation — this was never requested.
**Fix:** Remove from top nav. Events should be accessible from:
- Footer of the landing page
- Settings dropdown
- NOT the primary navigation bar

### Issue B: Vendor Profile — Event Approved Badge
**Problem:** The green "Event Approved" badge doesn't match the branding. It should use an outlined style like the "Pro" badge next to it.
**Fix:** Change to outlined badge style (charcoal/dark grey outline, no filled background). Match the existing tier badge design pattern.

### Issue C: Vendor Profile — "Want this vendor at your event" Button
**Problem:** The circus icon + large button doesn't convey business catering or professionalism. It also competes with the "View Menu" button which was designed to be the primary CTA for QR code scans.
**Fix:** Remove the large CTA button from the top of the profile. Instead:
- Add an "Event & Catering" section at the bottom of the profile page (alongside accepted payments, listings, certifications)
- Also show event/catering eligibility on the listing detail screen for catering-eligible listings

### Issue D: Listing Detail — Event Badge Consolidation
**Problem:** Two separate badges at the top of the listing detail ("Event Ready" + "Advance Order • Prepaid"). Too cluttered, distracting from the listing content.
**Fix:**
- Consolidate into one badge: "Event / Catering Eligible"
- Style: outlined (no background fill), checkmark OK, charcoal/dark grey
- Move from top of page to below the description area (desktop: top-right section, beneath description, above pickup options)
- Highly visible but not distracting

### Issue E: Listing Status Bug — Catering Toggle Reverts to Draft
**Problem:** When a vendor marks a published listing as catering-eligible, the listing status reverts to 'draft' silently. No notification, no warning. The vendor loses visibility on the browse page without knowing.
**Root cause:** Needs investigation — likely the listing update trigger `enforce_listing_tier_limit` or similar fires on UPDATE and resets status, or the client-side save doesn't preserve the current status.
**Impact:** HIGH — this costs vendors real sales. Must be investigated and fixed.
**Action:** Research the listing update flow to find what changes status to 'draft' when catering fields are modified.

---

## Part 3: Event Organizer Experience (New Feature Planning)

### 3.1 Event Page (Secure Token Link)

**Concept:** When an event is approved and vendors are confirmed, a unique secure URL is generated (e.g., `/events/{token}`). This URL is:
- Shared by the organizer with event attendees (via Slack, email, Teams, etc.)
- NOT searchable or indexable (no SEO, no public directory)
- Active from event confirmation through ~1 week post-event (for feedback)
- Then expires/deactivates

**What the page shows:**
- Event name, date, time, location
- Participating vendors (only those approved by admin for this specific event)
- Menu items (only listings the vendor has connected to this event)
- Each item shows: image, brief description, allergen info
- Time slot selection (wave-based ordering — see section 3.3)
- Ordering flow (see section 3.4)

**Post-event:** The page transitions to a feedback/review mode where attendees can rate vendors and leave comments. This data feeds back to the admin settlement page and future vendor curation.

### 3.2 Vendor-to-Event Listing Connection

**Current state:** Vendors mark listings as "catering eligible" globally. There's no per-event menu curation.

**Proposed flow:**
1. Vendor is invited to event → accepts
2. Vendor selects which of their catering-eligible listings to include for this specific event
3. Those selected listings appear on the event page
4. This does NOT remove them from the daily menu (see Issue E above)

**Data model consideration:** This likely needs a junction table (`event_listings` or similar) linking market_id + listing_id, rather than putting listings directly on the event market.

### 3.3 Wave-Based Ordering (Solving the Line Problem)

**The core problem to solve:** Long lines ruin events. If 200 people all try to order at noon, vendors are slammed and attendees spend half the event waiting.

**Proposed solution: Time-slot waves**

How it works:
- Event has a food service window (e.g., 11:30 AM - 1:30 PM)
- Broken into 30-minute waves (e.g., 11:30, 12:00, 12:30, 1:00)
- Each wave has a capacity (determined by vendor prep capacity data)
- Attendees select a wave when ordering — first come, first served for wave slots
- When a wave is full, it closes (same UX pattern as current time slot closing)
- The event organizer can either:
  - Let attendees self-select waves (first come first served)
  - Assign groups to waves ("Marketing team: 11:30, Engineering: 12:00")

**Capacity calculation:**
- Each vendor's `max_headcount_per_wave` (from event readiness form) tells us throughput
- Sum across accepted vendors = total wave capacity
- `ceil(total_headcount / wave_capacity)` = number of waves needed
- This math is communicated to vendors so they know prep quantities

**Key insight:** This is the differentiator. If we can guarantee "your team gets fed in 30 minutes, not 90," that's the pitch that wins corporate accounts.

**Implementation note:** This is similar to the existing pickup time slot system but with a capacity limiter per slot. The UI pattern already exists — we're adding a `remaining_slots` counter.

### 3.4 Event Ordering Flow

**One item per attendee** (default for corporate events):
- Encourages vendors to create meal bundles (entree + side + drink)
- Prevents attendees from visiting multiple trucks and creating chaos
- Simplifies capacity planning

**Pre-event questions for the organizer:**
- "Will beverages be provided separately?" (if yes, vendors skip drinks)
- "Will dessert be provided separately?" (if yes, vendors skip desserts)
- These answers shape what vendors should include in their bundles

**Ordering UX:**
1. Attendee opens event link
2. Sees participating vendors with menu items (image + description + allergens)
3. Selects one item
4. Selects a time wave
5. Confirms order

**Payment model options (decision needed):**
- Company-paid: organizer pays upfront for all attendees (external payment, company invoice)
- Employee-paid: each attendee pays via Stripe at ordering time
- Hybrid: company covers base meal, employee pays upgrades
- This affects checkout flow significantly

### 3.5 Admin-Vendor Communication Model

**User's direction:** Event organizers communicate with OUR ADMIN, not directly with vendors. Admin coordinates with vendors. This is part of the platform's value proposition — we handle the logistics.

**Implication:** No organizer ↔ vendor messaging feature needed. The admin dashboard is the coordination hub. Admin communicates event details, prep expectations, and setup instructions to vendors.

### 3.6 Event Page Lifecycle

```
Request submitted     → Page doesn't exist yet
Request approved      → Page created (shows event info, "vendors being confirmed")
Vendors confirmed     → Page updated (shows vendor menus, ordering opens)
Event day             → Page active (ordering may close at cutoff)
Event +1 day          → Page transitions to feedback mode
Event +7 days         → Page deactivated (returns 404 or "event has ended")
```

---

## Part 4: Technical Considerations

### Performance Isolation
**User's concern:** Event traffic shouldn't drag down regular food truck ordering.

**Approach:**
- Event pages are static-ish (vendor menus don't change frequently) — can use ISR or heavy caching
- Wave capacity checks are lightweight (single row count query)
- Event ordering uses the same checkout flow — no new payment infrastructure
- The event page token lookup is an indexed query (fast)
- If events scale significantly, the event page could be a separate Vercel deployment sharing the same Supabase backend

### Data Model Additions (Estimated)
- `event_listings` junction table (market_id + listing_id) — per-event menu curation
- `event_waves` or wave columns on market_schedules — capacity per time slot
- `event_attendee_orders` or use existing order_items with event metadata
- ~~`event_tokens` table or token column on catering_requests~~ — DONE: `event_token` column on `catering_requests` (migration 091)
- `event_feedback` table — post-event ratings/comments

### Existing Code Reuse
- Time slot UI: `PickupScheduleGrid` / pickup date selection — adapt for wave selection
- Capacity limiting: similar to `max_subscribers` on market boxes
- Token-based access: similar to password reset tokens
- Feedback: similar to existing review system (if one exists) or simple form

---

## Part 5: Prioritized Action Items

### Immediate Fixes (No architectural changes)
1. [x] **Fix listing status bug** — canPublish initial state was `false`, forcing draft on save before API responded. Changed to `null`. Session 61.
2. [x] **Remove events from top nav** — removed from desktop + mobile nav. Stays in user dropdown. Session 61.
3. [x] **Restyle event badges** — outlined charcoal style on vendor profile (desktop + mobile) + listing detail. Session 61.
4. [x] **Move event CTA on vendor profile** — "Book for Your Event" now in bottom section near payments/certifications. Session 61.
5. [x] **Move event badge on listing detail** — single "Event / Catering Eligible" badge below description, above pickup. Session 61.
6. [x] **Consolidate listing badges** — two badges (Event Ready + Advance Order) merged into one. Session 61.

### Phase 1: Event Page Foundation
7. [x] **Secure token generation** — `event_token` column on `catering_requests` (migration 091). Token generated on approval. Session 61.
8. [x] **Event page** (`/events/{token}`) — public page shows event details, confirmed vendors, menus. No ordering yet. Session 61.
8b. [x] **Admin "Create Event"** — button on admin events dashboard, creates event directly (skips public form, goes straight to approved). Session 61.
9. [ ] **Per-event listing connection** — vendors select which items for each event
10. [ ] **Event page lifecycle** — activation, deactivation, feedback mode

### Phase 2: Wave-Based Ordering
11. [ ] **Wave capacity system** — time slots with attendee limits
12. [ ] **Capacity calculation** from vendor readiness data
13. [ ] **Wave selection UI** on event page
14. [ ] **Ordering flow** — one item per attendee, wave-aware

### Phase 3: Post-Event & Growth
15. [ ] **Attendee feedback form** — ratings + comments per vendor
16. [ ] **Automated reminders** — vendor prep, organizer share link, event day
17. [ ] **Recurring events** — auto-repeat for trusted organizers
18. [ ] **Settlement enhancements** — include feedback data, capacity utilization metrics

### Business Process Items (Non-Technical)
- [ ] Define payment model for events (company-paid vs employee-paid vs hybrid)
- [ ] Define event booking fee structure (flat fee? per-head? included in transaction fees?)
- [ ] Create B2B sales asset (one-pager for HR/office managers)
- [ ] Define admin SLA for event coordination (response time, vendor confirmation timeline)
- [ ] Pre-event questionnaire refinement (beverages provided? dessert? dietary requirements?)

---

## Part 6: Refinements from Discussion (2026-03-18)

### 6.1 Admin-Created Events
**Gap identified:** The current flow requires an external organizer to fill out the form. Some organizers would rather call/email the admin and discuss.
**Fix:** Add an "Create Event" button on the admin events dashboard that opens the same form fields but allows the admin to fill it in on behalf of the organizer. This skips the public submission step and goes directly to `reviewing` or `approved` status.

### 6.2 Live Feedback (Not Just Post-Event)
**Refinement:** Feedback section should be available at the bottom of the event page DURING the event, not just after. Attendees can leave reviews while they're eating — that's when impressions are freshest. The feedback section stays available through the post-event window.

### 6.3 Wave-Based Ordering — Detailed Mechanics

**Two-step attendee flow:**

**Step 1: Select time slot (days/week before event)**
- Attendee visits event page
- Sees available waves with remaining slots (e.g., "11:30 AM — 12 spots left")
- Selects a wave → slot is reserved
- This happens in advance — attendees lock in their time window early

**Step 2: Select food item (same visit or later)**
- After wave is locked, attendee sees available items FOR THAT WAVE
- Each item shows remaining quantity for that specific wave
- Items can sell out per-wave independently (tacos sell out in wave 2, but pizza still available)
- Attendee selects one item → confirmed

**Per-wave inventory mechanics:**
- Each vendor sets capacity per wave (from their event readiness data: `max_headcount_per_wave`)
- Vendor also sets per-item quantity per wave (how many tacos can they produce per 30 min)
- Wave inventory resets at the start of each wave (vendor has prep time between waves)
- Example: Taco vendor says 25 tacos per wave. Wave 1 sells 25, Wave 2 starts fresh with 25.

**Decrement logic (two levels):**
1. **Wave slot decrement:** When attendee selects a wave, total wave capacity decreases. When full, wave closes.
2. **Item decrement per wave:** When attendee selects an item, that item's per-wave quantity decreases. When item sells out in a wave, it's unavailable for remaining attendees in that wave — they pick from other vendors/items.

**Rebalancing consideration:** If wave 1 has 50 slots but only 30 people signed up, the unused capacity doesn't roll to wave 2 (each wave is independent). This keeps lines short and predictable.

### 6.4 Event Page Menu Display

**Layout:** Horizontal rows (similar to browse page listings but wider/flatter)
- Item image (left)
- Name + brief description + allergen info (center)
- Remaining quantity for selected wave (right)
- Checkbox/select button (right edge)

**Key UX:** The menu section only shows available items for the attendee's selected wave. If they haven't selected a wave yet, they see all items with a prompt to "Select your time slot first."

---

## Part 7: Gap Analysis & Opportunities

### Gaps (Things That Need Solving)

**Gap 1: Vendor Prep Quantity Communication** — RESOLVED
Daily summary updates (not live). Shows order counts per item per wave. Becomes their prep sheet. 24-48 hr prep window gives plenty of time.

**Gap 2: What Happens When an Attendee Doesn't Order?** — RESOLVED
Walk-ups allowed — added to next available wave, order from whatever items remain. Vendors prep 10% over organizer's estimate to handle this.

**Gap 3: Cancellation / No-Show by Attendee** — STILL OPEN
Decision needed on whether attendees can cancel their wave+item selection.

**Gap 4: Dietary / Allergy Safety** — RESOLVED
Allergen data already exists on listings. For events, emphasize to vendors the importance of filling it in. No new schema needed.

**Gap 5: Event Day Operations — Vendor Check-in** — RESOLVED
Pick-ticket system. Platform generates order list per wave per vendor. Order number format: `{EventName}-{Wave}-{Sequence}` (e.g., "Bizbash-2-16"). Attendee shows number, vendor checks off the list. Similar to existing Pickup Mode but wave-organized.

**Gap 6: Multi-Vendor Coordination at Setup**
Still relevant — admin handles this during coordination phase. Surface setup instructions prominently in vendor event view. Consider supporting "setup map" upload from organizer.

### Opportunities (Things That Would Make Us Stand Out)

**Opportunity 1: "Event Capacity Planner" for Admin**
When reviewing a catering request, show the admin:
- Headcount: 200
- Recommended vendors: 4 (based on avg throughput)
- Available event-approved vendors: 12
- Suggested vendor mix (based on cuisine diversity, capacity, ratings)
This turns the admin from a coordinator into a consultant. It's the kind of intelligence that justifies the platform fee.

**Opportunity 2: Event Cost Estimator for Organizer**
Before submitting a request, show the organizer:
- "Based on 200 attendees at ~$12-15/person, estimated total: $2,400-$3,000"
- "Average food truck meal cost on our platform: $12.50"
This removes the #1 friction point: "How much will this cost?" Most organizers need a budget number before they can get approval from their boss.

**Opportunity 3: Vendor Revenue Opportunity Visibility**
When inviting vendors, show them: "Event for 200 people, estimated 50 orders per truck, at your average order value of $14 = ~$700 revenue opportunity."
Vendors who see real numbers are more likely to accept and more motivated to prepare well.

**Opportunity 4: Repeat Business Automation**
For companies that do monthly team lunches:
- After 3 successful events, offer a "recurring schedule" option
- Same vendors, same format, different dates
- Auto-creates events with pre-filled details
- Organizer just confirms each month
- This is the B2B subscription model — predictable revenue for vendors and the platform

**Opportunity 5: Event Success Metrics**
After each event, generate a summary for the organizer:
- Participation rate (orders / headcount)
- Average wait time per wave (if we track fulfillment timestamps)
- Attendee satisfaction (from feedback)
- Cost per person actual vs estimated
- "Your team's favorite vendor was Smokestack BBQ (4.8 stars)"
This makes the organizer look good to their boss and guarantees they'll use us again.

**Opportunity 6: Corporate Account / Dashboard**
For companies that do 3+ events/year:
- Dedicated company dashboard (login-based, not just token links)
- Event history, spending, favorite vendors
- Simplified repeat booking
- Volume discounts or negotiated rates
- This is a Phase 3+ item but worth designing toward

---

## Part 8: Decisions Made

| # | Question | Decision | Notes |
|---|----------|----------|-------|
| 1 | Payment model | TBD | Still needs decision — company-paid vs employee-paid vs hybrid |
| 2 | Items per attendee | 1 per attendee | Encourage vendors to create meal bundles |
| 3 | Vendor bundle guidance | Yes | Encourage bundling (entree + side + drink). Ask organizer if beverages/dessert provided separately. |
| 4 | Event page expiry | ~7 days post-event | Feedback available during + after event, then page deactivates |
| 5 | Wave assignment | First-come-first-served | Organizer can tell groups which wave, but platform doesn't enforce |
| 6 | Event pricing | $75/truck + normal platform fees | $75 per truck due with 50% deposit when agreement signed/uploaded. Transaction fees = standard 6.5% buyer + 6.5% vendor (13% total exceeds 10% target). Decided Session 63. |
| 7 | Walk-up ordering | Yes — added to next available wave | Walk-ups order from whatever items remain. Vendors encouraged to prep 10% over estimate. |
| 8 | Catering pre-order minimum | 10 items per vendor | Catering orders (not private events) require min 10 items per vendor. Decided Session 63. |
| 9 | Catering advance notice tiers | Size-based | 10-29 items: 1 day. 30-49: 2 days. 50+: 3 days. All prepaid. Decided Session 63. |
| 10 | Event approval = quality gate | Intentional coupling | Event-approved status gates BOTH advance ordering AND event participation. Ensures vendor capability. Incentivizes event readiness for $75/truck + fee revenue. Decided Session 63. |
| 8 | Attendee cancellation | TBD | Needs decision |
| 9 | Allergen data | Already exists on listings | Emphasize importance of filling it in for event-eligible items. No new fields needed. |
| 10 | Admin-created events | Yes — add "Create Event" to admin dashboard | TBD on whether it skips approval step |
| 11 | Vendor prep updates | Daily updates, not live | 24-48 hr prep window. Daily summary is sufficient — more informed than usual. |
| 12 | Event day fulfillment | Pick-ticket / order list per wave | Order number format: `{EventName}-{Wave}-{Sequence}` e.g., "Bizbash-2-16" = 16th customer, wave 2. Platform generates pick tickets for vendors. |
| 13 | Feedback timing | During AND after event | Feedback section at bottom of event page, available from event start through post-event window |
| 14 | Cost estimation | Yes — provide range | Use actual menu prices. Range when attendees choose; near-exact when organizer chooses menu. Feeds into vendor revenue visibility too. |

## Part 9: Product Definitions (Finalized 2026-03-18)

The "events" umbrella actually covers **four distinct use cases**, each with different payment models, ordering flows, and business rules.

### Product A: Company-Paid Event (Corporate Catering Event)
**Example:** Company hires food trucks for an employee appreciation day, team building, client event.

**Who pays:** The company. Deposit upfront, settle day-of.

**Payment flow:**
1. Company gets a final price beforehand (based on headcount × menu prices + $75/truck fee)
2. Company puts down a deposit (check or CC)
3. Platform pays vendors Part 1 when deposit received (Stripe transfer)
4. Day-of: settle remaining balance (cash, check, or CC) — adjusted if more attendees than anticipated
5. Platform pays vendors Part 2 after settlement (Stripe transfer)

**Ordering flow:** Wave-based pre-ordering via secure event link. Walk-ups added to available waves.

**Platform revenue:** $75 per truck + normal transaction fees on all orders.

### Product B: Employee-Paid Event
**Example:** Company arranges food trucks at the office but employees pay for their own meals.

**Who pays:** Each attendee pays individually. All orders pre-paid (any payment method we support).

**Ordering flow:** Same wave-based pre-ordering. Standard checkout per attendee.

**Platform revenue:** $75 per truck + normal transaction fees.

### Product C: General Crowd Event (Promotional / Grand Opening)
**Example:** Store having a grand opening sale, community festival, charity walk. The host doesn't pay for food but wants trucks there to draw/serve a crowd.

**Who pays:** Attendees pay individually (like regular food truck orders).

**Business model:**
- Platform charges the TRUCKS a participation fee to be at the event (amount TBD)
- Platform makes the host's life easy — one request brings multiple trucks
- Host gets a professional food service presence at their event for free
- Trucks get guaranteed foot traffic

**Ordering flow:** Could be wave-based or standard ordering depending on scale. Smaller events might just use regular ordering.

**Platform revenue:** Vendor participation fee + normal transaction fees.

**Note:** This is a growth opportunity — being the go-to platform for "I need food trucks at my event" is a strong market position.

### Product D: Paid Crowd Event (Fairs, Festivals)
**Example:** County fair, food festival that charges trucks a booth fee to sell to their attendees.

**Status: NOT pursuing yet.** These events have their own established vendor relationships and fee structures. Revisit later.

### Product E: Catering Orders (NOT an event)
**Example:** Office manager orders 25 pulled pork sandwich lunches for a Tuesday team meeting.

**Key distinction:** This is NOT an event. It's a catering order — one company, one truck, advance ordering.

**Flow:**
1. Company rep browses the catering menu (catering-eligible listings)
2. Places an order for X quantity, scheduled days in advance
3. Truck preps the order (25 lunches)
4. Company picks up OR truck delivers to location (depending on truck's capability)

**How it differs from events:**
- No waves, no multiple trucks, no attendee-level ordering
- Single order, single vendor, single payment
- Very similar to how offices order lunch from restaurants
- Uses existing advance-order functionality with catering quantities

**Platform revenue:** Normal transaction fees. No per-truck fee (it's just an order).

---

## Part 10: All Decisions (Final Reference)

| # | Question | Decision |
|---|----------|----------|
| 1 | Company-paid events | Deposit + day-of settlement. Deposit via check/CC. Day-of via cash/check/CC. Vendors paid in 2 parts via Stripe transfer. |
| 2 | Employee-paid events | All orders pre-paid by individual attendees. Any payment method. |
| 3 | General crowd events | Trucks pay a participation fee. Host pays nothing. Platform facilitates. |
| 4 | Paid crowd events (fairs) | Not pursuing yet. |
| 5 | Catering orders | Separate from events. Single vendor, advance order, standard checkout. Uses catering-eligible listings. |
| 6 | Items per attendee | 1 per attendee for events. Encourage meal bundles. |
| 7 | Event page expiry | ~7 days post-event for feedback, then deactivates. |
| 8 | Wave assignment | First-come-first-served. Organizer can coordinate externally. |
| 9 | Walk-ups | Yes — added to next available wave. Vendors prep 10% over estimate. |
| 10 | Attendee cancellation | Up to 24 hours before event. Slot + item go back to pool. Inside 24hr, no cancellation. |
| 11 | Allergen data | Already exists on listings. Emphasize for event items. |
| 12 | Admin-created events | Skip approval — go directly to approved. |
| 13 | Vendor wave capacity | Set once, same for all waves. |
| 14 | Vendor prep updates | Daily summaries, not live. |
| 15 | Event day fulfillment | Pick-ticket with order numbers: `{EventName}-{Wave}-{Sequence}`. |
| 16 | Feedback timing | During AND after event. |
| 17 | Cost estimation | Yes — range when attendees choose, near-exact when organizer picks menu. |
| 18 | Platform event fee | $75 per truck that shows up. |
| 19 | Events in navigation | Footer + settings dropdown. NOT top nav. |
| 20 | Event badges | Outlined style, charcoal/dark grey. No filled background. |

## Part 11: All Questions Resolved

All open questions have been answered. Decisions added to Part 10 table.

| # | Question | Decision |
|---|----------|----------|
| 21 | Crowd event vendor fee | Per-event flat fee. ~$50 (TBD final amount). |
| 22 | Catering delivery | Pickup only for now. |
| 23 | Catering minimum | 10 items minimum per catering order. |
| 24 | Company-paid deposit | 50% down. Settle remainder day-of. |
| 25 | Catering listings display | Mixed with regular items, badge + sortable via filters. |

1. **Payment model:** Who pays at events — the company or the individual attendees?
2. **Items per attendee:** Confirmed as 1 per attendee. Should there be an override for the organizer?
3. **Vendor bundle guidance:** Should we provide templates or guidelines for what a "meal bundle" listing should include?
4. **Event page expiry:** 7 days post-event for feedback, then deactivate. Confirm?
5. **Wave assignment:** Should organizers be able to pre-assign groups to waves, or is it always first-come-first-served?
6. **Event pricing:** Same 6.5%+6.5% transaction fees, plus a flat event booking fee? Or different structure?
