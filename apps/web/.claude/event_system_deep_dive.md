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

---

## Part 12: Path A — Event System Strengthening (Session 63+)

**Created:** 2026-03-26
**Status:** In Progress
**Goal:** Strengthen the existing event flow with better data collection, viability scoring, vendor matching indicators, and admin workflow visibility — enough to handle real incoming business inquiries.

### 12.1 Status Definitions (No Schema Change — Document Only)

Keep existing DB statuses. Add code comments to every file that references them:

| Status | Meaning | Admin Actions Available |
|--------|---------|----------------------|
| `new` | Request received, not yet reviewed | View details, change to `reviewing` or `declined` |
| `reviewing` | Admin is evaluating viability and logistics | View viability scores, change to `approved` or `declined` |
| `approved` | Passes viability check, market + token created, ready to invite vendors | Invite vendors, view vendor match scores |
| `declined` | Request doesn't meet platform criteria | Add decline reason (visible to organizer) |
| `cancelled` | Organizer or admin cancelled | No further actions |
| `ready` | Enough vendors confirmed, event page shareable | Send organizer the event link, advance lifecycle |
| `active` | Event day | Monitor orders |
| `review` | Post-event, feedback collection window | Review feedback, prepare settlement |
| `completed` | Settled, all payouts processed | View settlement report |

### 12.2 New Form Fields + Migration

**Migration:** Add nullable columns to `catering_requests`:

```sql
ALTER TABLE catering_requests ADD COLUMN event_type TEXT;
-- Values: corporate_lunch, team_building, grand_opening, festival, private_party, other

ALTER TABLE catering_requests ADD COLUMN payment_model TEXT;
-- Values: company_paid, attendee_paid, hybrid

ALTER TABLE catering_requests ADD COLUMN total_food_budget_cents INTEGER;
-- Only relevant for company_paid/hybrid. Null for attendee_paid.

ALTER TABLE catering_requests ADD COLUMN expected_meal_count INTEGER;
-- Distinct from headcount. "How many people do you expect to order food?"
-- For company_paid: usually = headcount. For attendee_paid: typically 40-70% of headcount.

ALTER TABLE catering_requests ADD COLUMN beverages_provided BOOLEAN DEFAULT false;
-- "Will beverages be provided separately?" Affects vendor menu planning.

ALTER TABLE catering_requests ADD COLUMN dessert_provided BOOLEAN DEFAULT false;
-- "Will dessert be provided separately?" Affects vendor menu planning.

ALTER TABLE catering_requests ADD COLUMN is_recurring BOOLEAN DEFAULT false;
-- "Is this a recurring event?" Increases scoring weight.

ALTER TABLE catering_requests ADD COLUMN recurring_frequency TEXT;
-- Values: weekly, biweekly, monthly, quarterly. Only if is_recurring=true.
```

All nullable — existing requests unaffected.

**Form field additions** (EventRequestForm.tsx):

| Field | Type | Shows When | Question Phrasing |
|-------|------|-----------|-------------------|
| Event Type | Dropdown | Always | "What type of event is this?" |
| Payment Model | Radio | Always | "Who will be paying for food?" (Company pays for everyone / Each person pays for themselves / Mix — company covers base, individuals can upgrade) |
| Total Food Budget | Currency input | company_paid or hybrid | "What is your total food budget?" |
| Expected Meal Count | Number | Always | "How many people do you expect to order food?" (with helper: "This may be different from your total guest count — not everyone orders at every event") |
| Beverages Provided | Checkbox | Always | "Beverages will be provided separately (not from food trucks)" |
| Dessert Provided | Checkbox | Always | "Dessert will be provided separately" |
| Recurring | Checkbox | Always | "This is a recurring event" |
| Recurring Frequency | Dropdown | is_recurring | "How often?" |

### 12.3 Auto-Calculated Viability Scores

**New file:** `src/lib/events/viability.ts` — pure functions, no DB, fully testable.

Calculations displayed to admin on the event detail view:

**Budget Score** (company_paid/hybrid only):
- `per_meal = total_food_budget_cents / expected_meal_count`
- Green: $10+ per meal (realistic for food truck pricing)
- Yellow: $7-10 (tight but possible)
- Red: <$7 (unrealistic — flag for admin)

**Capacity Score:**
- `trucks_needed = expected_meal_count / (platform_avg_throughput × num_waves)`
- `platform_avg_throughput` = average `max_headcount_per_wave` across event-approved vendors (~30)
- `num_waves = ceil((end_time - start_time) / 30 minutes)`
- Compare `trucks_needed` vs `vendor_count` requested
- Green: requested >= needed
- Yellow: requested = needed - 1
- Red: requested < needed - 1 (significantly understaffed)

**Duration Score:**
- `event_hours = (end_time - start_time)`
- Compare against average vendor `max_runtime_hours`
- Green: event ≤ avg runtime
- Yellow: event = avg runtime + 1-2hr
- Red: event > avg runtime + 2hr (vendors may not be able to serve full duration)

**Overall Viability:** Composite — all green = "Strong", any yellow = "Review", any red = "Concerns"

### 12.4 Vendor Matching Indicators

When admin selects vendors to invite, show alongside each event-approved vendor:

| Indicator | Source | Display |
|-----------|--------|---------|
| Cuisine Match | Compare event `cuisine_preferences` keywords vs vendor listing categories | High / Partial / Low |
| Capacity Fit | Vendor `max_headcount_per_wave` × waves vs per-vendor headcount allocation | Good / Tight / Over |
| Runtime Fit | Vendor `max_runtime_hours` vs event duration | Yes / Marginal / No |
| Platform Score | Rating (weighted by count) + reliability (1 - cancellation rate) | 1-5 stars composite |
| Tier | Vendor tier | Badge (free/pro/boss) |
| Experience | `has_event_experience` from readiness questionnaire | Experienced / New |

These are **advisory** — admin makes the final decision. The data just helps them make faster, better-informed choices.

### 12.5 Admin UI: Full Lifecycle Visibility

**Horizontal stepper** at top of event detail page showing all statuses:

```
[new] → [reviewing] → [approved] → [ready] → [active] → [review] → [completed]
                                                              ↗
                                 [declined]  [cancelled] ←──┘
```

- Current status: highlighted/filled
- Completed statuses: checkmark
- Future statuses: greyed out but visible with labels
- Each step shows a tooltip or subtitle: "Evaluate viability" → "Invite vendors" → "Confirm vendors" etc.
- A new admin can look at this and understand the full process without guessing

### 12.6 Event Manager Notification at `ready`

New notification type: `event_confirmed`
- Triggered when admin advances status to `ready`
- Sent to the event organizer (contact_email)
- Contains: "Your event is confirmed! [X] vendors are ready. Share this link with your team: [event_page_url]"
- Includes the shareable `/events/[token]` URL

### 12.7 Implementation Checklist

| # | Task | Complexity | Status |
|---|------|-----------|--------|
| 1 | Add status documentation comments to all event API routes | Low | [x] |
| 2 | Migration: add new columns to catering_requests | Low | [x] Applied all 3 envs |
| 3 | Update EventRequestForm with new fields | Medium | [x] |
| 4 | Update event-requests API to accept new fields | Low | [x] |
| 5 | Create `src/lib/events/viability.ts` scoring functions | Medium | [x] |
| 6 | Update admin events page: viability scores display | Medium | [x] |
| 7 | Update admin events page: vendor matching indicators | Medium | [ ] Deferred — needs admin vendor data enrichment |
| 8 | Update admin events page: lifecycle stepper UI | Medium | [x] |
| 9 | Add `event_confirmed` notification type + trigger | Low | [x] |
| 10 | Update SCHEMA_SNAPSHOT.md after migration | Low | [x] |

**Estimated total:** 4-6 hours across 1-2 sessions

### 12.8 What Path A Does NOT Include (Preserved for Later)

- Wave-based ordering system (Phase 2)
- $75/truck fee collection mechanism
- Catering minimum enforcement at checkout
- Automated vendor ranking algorithm (admin picks manually with data support)
- Corporate account dashboard
- Recurring event auto-scheduling (field collected but automation deferred)
- Settlement email trigger to vendors on completion
- Event page expiry/deactivation after 7 days

---

## Part 13: Refined Product Type Analysis (Session 63+)

**Created:** 2026-03-26
**Status:** Strategic planning — guides form, scoring, and admin UI decisions

### 13.1 Product A: Company-Paid Events — Refined

**Control level:** Total — organizer mandates pre-ordering, assigns time slots.

**Budget entry (form):**
- Offer BOTH fields: "Total food budget" and "Per-meal budget"
- Once one is populated, the other auto-calculates and greys out
- `per_meal = total / expected_meal_count` or `total = per_meal × expected_meal_count`
- Event organizer enters whichever they've planned around

**Wave duration flexibility:**
- Default to 30-minute waves
- BUT if all confirmed trucks have 15-minute lead time (`pickup_lead_minutes = 15`), waves can shrink to 15 minutes
- 15-minute lead time = higher event scoring weight (faster service = better event experience)
- Admin sees: "All confirmed vendors support 15-min service → 15-min waves recommended (feeds 2× faster)"
- Admin has final approval on wave duration

**Show the math — always:**
- Every recommendation to admin includes the calculation behind it
- "10 waves = 5hr event ÷ 30min per wave"
- "3 trucks needed = 150 meals ÷ (25 throughput × 2 waves per truck per hour)"
- Admin can then adjust: "I know this venue is tight, 2 trucks max" → recalculate

**Revenue:** $75/truck + standard transaction fees. Highest margin, most predictable.

### 13.2 Product B: Employee-Paid Events — Refined

**Control level:** Moderate — organizer can encourage but not mandate.

**Critical new data points:**
- Competing food options on site (cafeteria, nearby restaurants, other catering)
- Per-meal target price from organizer (what they expect employees to spend)
- Time context matters: lunch hour = 60-80% buyer rate, afternoon = 30-50%

**Organizer promotion support (future build):**
- Templated marketing materials the organizer can distribute:
  - **Breakroom flyer:** truck names, cuisine types, QR code to event page
  - **Email template:** "Skip the line — pre-order your lunch" with event link
- Key messaging: "Pre-order and skip the line. More time with your team, less time waiting."
- We provide these to the organizer as part of the service

**Incentive model (theoretical — document now, build later):**
- Set a per-truck revenue target (e.g., $500)
- If trucks hit that threshold, platform discounts the $75/truck fee to the organizer by 5% increments
- Incentivizes organizer to promote → more orders → trucks earn more → platform earns more
- Network effect: organizer sees direct financial benefit from promoting engagement
- Example: target $500/truck → truck makes $600 → organizer's $75 fee drops to $71.25 (5% off)

**Anonymized vendor presentation to organizer:**
- When presenting truck options, do NOT show truck names
- Show: "Truck A — Mexican cuisine, avg $12/meal, 15-min service, 4.8★ rating"
- Organizer selects preferred trucks from anonymized list
- Admin curates which trucks make the list; organizer makes final choice from that curated set
- Truck identity revealed only after both sides confirm
- Prevents organizer from going around the platform

**Per-meal target matching:**
- Organizer sets target: "$15/meal"
- System matches against vendor average pricing from their listings
- Show admin: "Truck A avg $12, Truck B avg $16, Truck C avg $14"
- Admin curates: includes A and C, excludes B (over budget), presents to organizer
- Organizer sees: "Option 1: Mexican, ~$12/meal, 15-min service" / "Option 2: BBQ, ~$14/meal, 30-min service"

**Higher per-truck fee for Product B:**
- Risk is higher (low turnout = trucks lose money)
- Consider $100/truck instead of $75 to account for uncertainty
- Or: $75 base + guaranteed minimum order threshold (if < X orders, organizer pays difference)
- Decision deferred — document as option

**Post-event vendor feedback (build into workflow):**
- After event, ask each vendor:
  - "How accurate was our volume estimate?" (1-5)
  - "How was the crowd engagement?" (1-5)
  - "Would you do an event with this organizer again?" (yes/no)
  - "Any notes for our admin?"
- Feeds back into organizer reputation score for future events
- Helps platform improve estimation accuracy over time

### 13.3 Product C: Crowd Events — Refined

**Control level:** None — public event, random attendance.

**Key distinction: foot traffic ≠ headcount:**
- Reframe "headcount" as "expected visitors" for crowd events
- Buy rate: 10-30% for public events (much lower than corporate)
- Dwell time matters: longer stay = more likely to see trucks and buy

**Ticketed vs non-ticketed (new scoring factor):**
- **Ticketed events score HIGHER** because:
  - Access to attendee inbox (ticket confirmation email = pre-order promotion opportunity)
  - Welcome packet can include our branding and QR code
  - Known attendee count (more predictable than "expected foot traffic")
  - Organizer has a communication channel to every attendee
- **Non-ticketed:** rely on organizer's general marketing + day-of signage

**Promotion requirements for organizer:**
- Platform provides marketing copy + QR codes for event page
- Copy emphasizes: "Pre-order food, skip the line, enjoy more of the event"
- For crowd events: REQUEST (or require) that organizer includes our materials in their event marketing
- Key: do NOT list truck names in general marketing — list cuisine types + "pre-order to skip the line"
- Prevents attendees from contacting trucks directly

**Event schedule analysis (admin value-add):**
- Organizer shares event schedule (uploaded PDF/image or described in notes)
- Admin identifies meal break opportunities: "3-hour gap at 12-2pm → prime lunch window"
- Admin can suggest to organizer: "Announce lunch break at noon, direct crowd to truck area"
- Even without waves, timing guidance increases order concentration and truck efficiency
- System does NOT need to parse the schedule — admin reads it and makes strategic recommendations

**"Is this worth it?" threshold for vendors:**
- Estimated revenue per truck < $300 → flag as "low revenue opportunity — visibility/marketing event"
- $300-600 → "moderate opportunity"
- $600+ → "strong opportunity"
- This helps admin communicate honestly with vendors about what to expect

**Pre-order promotion at crowd events:**
- QR codes on signage at the event: "Skip the line — scan to pre-order"
- If event has a schedule, align truck availability with break times
- Highlight on event page: "Pre-orders close 30 minutes before your pickup time"
- Even 20-30% pre-order rate at a crowd event is a win for trucks (reduces line chaos)

### 13.4 Cross-Product Insights

**Marketing as a platform service:**
Every event type benefits from organizer promotion. The platform should provide:
1. Breakroom flyer template (Product B)
2. Email template for staff/attendees (Product A, B)
3. QR code + pre-order messaging for event marketing (Product C)
4. Ticket insert / welcome packet copy (Product C — ticketed)

These are NOT in-app features yet. They're PDF/image templates the admin emails to the organizer. Future: auto-generate from event details.

**Anonymized vendor selection (Products A, B):**
- Admin curates a shortlist of qualified vendors
- Presents to organizer as anonymized options with key stats
- Organizer selects preferences
- Admin finalizes and invites selected vendors
- This protects vendor identity AND gives organizer meaningful choice

**Post-event feedback loop:**
- Organizer rates the platform's service (separate from vendor ratings)
- Vendors rate the event accuracy and crowd quality
- Both feed into future scoring: reliable organizers and reliable vendors get matched together

### 13.5 Form & Scoring Implications (Implementation)

**Form changes needed (migration 101):**
- Add `per_meal_budget_cents` (INTEGER, nullable) — alternative to total budget
- Add `competing_food_options` (TEXT, nullable) — "Are there other food options at the venue?"
- Add `is_ticketed` (BOOLEAN DEFAULT false) — ticketed events score higher
- Add `estimated_dwell_hours` (NUMERIC, nullable) — how long do attendees typically stay?
- Reframe headcount label dynamically: "Number of employees" (A/B) vs "Expected visitors" (C)

**Viability scoring v2:**
- Event-type-aware: apply different models per product type
- Wave math only for Product A (and optionally B)
- Product C uses foot_traffic × buy_rate model
- Incorporate vendor lead time (15 vs 30 min) into wave duration
- Show ALL assumptions and math to admin
- Display ranges, not single numbers
- Ticketed event bonus in scoring

**Admin workflow additions:**
- Anonymized vendor presentation view (for organizer communication)
- Per-meal price matching against vendor listing averages
- Post-event feedback collection from vendors
- Marketing material templates (Phase 2)

### 13.6 Priority Sequence (Impact-Ranked)

**DONE (this session):**
1. [x] Event-type-aware viability scoring (3 models: company_paid, attendee_paid, crowd)
2. [x] Dual budget fields (total OR per-meal, auto-calculate, grey-out logic)
3. [x] Show math/assumptions explicitly in admin UI
4. [x] Competing food, ticketed event, dwell time fields on form + API + DB
5. [x] Revenue opportunity per truck (Products B & C)
6. [x] Ticketed event scoring bonus

**HIGH IMPACT — Next session:**
7. [ ] **Anonymized vendor presentation for organizer** — Admin curates shortlist, presents to organizer as "Truck A: Mexican, ~$12/meal, 15-min service" without truck names. Organizer selects preferences. Prevents platform bypass. This is the #1 differentiator for our event service.
8. [ ] **Per-meal price matching against vendor listings** — Calculate vendor average menu price from published listings. Compare against organizer's per-meal target. Show in admin UI for vendor selection decisions.
9. [ ] **Wave duration flexibility** — If all confirmed vendors have 15-min lead time, recommend 15-min waves. Show throughput improvement to admin: "15-min waves = 2× faster service." Already scored in vendor matching (lead_time_advantage flag).

**MEDIUM IMPACT — Following sessions:**
10. [ ] **Post-event vendor feedback collection** — After event, survey each vendor: estimate accuracy (1-5), crowd engagement (1-5), would-you-do-this-again (yes/no), notes. Feeds into organizer reputation + platform accuracy improvement.
11. [ ] **Marketing material templates** — Breakroom flyer, email template, QR code for event page. Provided by admin to organizer. Key messaging: "Pre-order and skip the line." For crowd events: require organizer to include our materials in their marketing.
12. [ ] **Event schedule analysis** — Admin reviews organizer's event schedule (uploaded PDF/notes), identifies meal break opportunities, suggests timing to drive truck traffic. Not automated — admin reads and strategizes.

**LOWER IMPACT — Phase 2+:**
13. [ ] **Incentive discount model** — Discount $75/truck fee by 5% increments when trucks hit revenue targets. Incentivizes organizer promotion. Theoretical — design now, build later.
14. [ ] **Organizer reputation scoring** — Track success metrics across events. Repeat organizers with good ratings get priority matching. Unreliable organizers get flagged.
15. [ ] **Corporate account dashboard** — Login-based organizer portal for companies with 3+ events/year. Event history, favorites, simplified rebooking.

### 13.7 Vendor Communication Strategy (for admin reference)

**What to share with vendors when inviting them to events:**

| Data Point | Share? | Why |
|---|---|---|
| Event date, time, general area | Yes | Need to check availability |
| Headcount per vendor estimate | Yes | Need to plan prep quantities |
| Cuisine preferences | Yes | Confirms they're a fit |
| Budget tier ($$, $$$) | Yes | General guidance, not exact $ |
| Payment model | Yes | Affects their checkout expectations |
| Company name | No (until accepted) | Prevent direct solicitation |
| Exact address | No (until accepted) | Prevent drive-by solicitation |
| Contact details | Never | Platform handles all communication |
| Other invited/accepted vendors | No | Prevent competitive pressure |
| Per-meal exact dollar amount | No | Use "budget tier" instead |

**What to share with organizer when presenting vendor options:**

| Data Point | Share? | Format |
|---|---|---|
| Truck name | No | "Option A", "Option B" |
| Cuisine type | Yes | "Mexican", "BBQ", etc. |
| Avg per-meal price | Yes | "$12-14 range" |
| Service speed | Yes | "15-min service" or "30-min service" |
| Platform rating | Yes | "4.8★ from 45 reviews" |
| Event experience | Yes | "Experienced" or "New to events" |
| Capacity fit | Yes | "Can handle your headcount" |
| Vehicle details | No | Not relevant to organizer |

---

## Part 14: Event Manager Direct Selection + Self-Service Crowd Events (Session 63+)

**Created:** 2026-03-27
**Status:** Planning — documented for future implementation

### 14.1 Event Manager Direct Truck Selection

**Problem:** Current flow assumes admin recommends trucks. Many event managers want to browse and choose specific trucks themselves.

**Solution:** Add a path toggle early in the intake form:
> "Would you like to choose specific trucks, or let us recommend?"

**If "I'll choose":**
- Show an in-form type-ahead search widget for event-approved vendors
- Event manager searches by name, sees mini-cards (name, cuisine, rating, avg price)
- Adds vendors to an ordered preference list (1st choice, 2nd, etc.) — max 10
- System runs scoring against event parameters and shows inline guidance:
  - "Great match — Mexican cuisine aligns with your preferences"
  - "Note — this truck's max runtime is 4hr, your event is 6hr"
  - "Note — this truck uses a generator that may produce noise"
- Guidance doesn't block selection — just informs
- Selected vendors are stored in the catering_request for admin to review/approve

**If "Recommend for me":**
- Current flow (admin curates + scoring system recommends)

**Technical needs:**
- Public-facing API endpoint: `/api/event-approved-vendors?vertical=X` — returns event-approved vendors with name, cuisine categories, avg price, rating (no sensitive data)
- Type-ahead search component in EventRequestForm
- New DB column: `vendor_preferences` (JSONB array of { vendor_id, priority_order })
- Inline scoring display using existing `scoreVendorMatch()`

**Catering menu item limit:** Increase from 5 to 7 per vendor per event.

### 14.2 Self-Service Crowd Event System (Product C Lite)

**Problem:** The most common event request in the market right now is crowd-style: businesses post to Facebook groups asking for 2-3 trucks for a grand opening, community event, etc. No budget for managed service. Event managers get flooded with responses and have no insight into which truck fits best.

**Our opportunity:** Build a free, fully automated self-service funnel that replaces Facebook group posts. Event managers get curated, scored truck recommendations. Trucks get organized event opportunities. Platform gets users, pre-orders, and network growth.

**No admin involvement.** This is a user-acquisition play, not a revenue play (transaction fees on pre-orders only).

#### Full Flow:

**Step 1: Intake Form (self-service path)**
- Event manager selects "Self-Service" (vs "Full Service — admin managed")
- Simplified form: event type, date/time, location (city/state only), headcount, cuisine preferences, truck count needed
- NO budget fields (attendees pay individually)
- NO admin notes or setup instructions (those are for managed events)

**Step 2: Auto-Match + Auto-Invite**
- On form submission, system runs `scoreVendorMatch()` against all event-approved vendors
- Filters to green/yellow matches on cuisine + capacity + runtime
- Auto-creates anonymized event opportunity (company_name + address hidden)
- Auto-sends `catering_vendor_invited` notification to matched vendors
- Invitation includes: event date, city (not address), headcount per truck, cuisine match info

**Step 3: Vendor Response Collection**
- Vendors respond via existing accept/decline flow
- On "interested": vendor confirms date availability
- System tracks response count

**Step 4: Threshold Trigger → Results Email**
- Cron checks hourly for self-service events where:
  - 48 hours have passed since invitations sent, OR
  - Response count >= requested vendor_count
- When triggered: compile results + email to event manager
- Results email shows each interested vendor with:
  - Truck name (NOT anonymized — no reason to hide from event manager)
  - Cuisine type, rating, truck length, generator info
  - Catering menu preview (item names + prices)
  - Odor/utensil/seating notes from readiness questionnaire
  - "View full profile" link to vendor's public profile page

**Step 5: Event Manager Selection Page**
- New page: `/events/[token]/select`
- Shows interested vendors with details from Step 4
- Checkboxes to select (max = requested vendor_count)
- For each selected vendor: "I have reviewed this vendor's catering menu" checkbox
- Terms agreement: "I understand that [platform] is a facilitator only. The arrangement for food service is between me and the selected vendor(s). [Platform] is not responsible for food quality, vendor no-shows, or any issues arising from the event."
- Submit button

**Step 6: Confirmation + Event Page Creation**
- System creates event market + token + schedule (existing logic)
- Sends confirmation to selected vendors → prompts them to connect catering listings + set schedule
- Sends event manager: event page link, QR code, marketing recommendations:
  - "Share this link with your audience so they can pre-order"
  - "Pre-ordering means less waiting and more time enjoying your event"
  - "Include the QR code on flyers, social media, and event signage"

**Step 7: Vendor Commitment**
- Selected vendors connect their catering listings to the event (existing menu picker)
- Once connected, they're committed — cancellation policy applies

#### Gaps to Address:

| Gap | Impact | Resolution |
|---|---|---|
| Vendor date conflict detection | Prevents double-booking | Check market_vendors + market_schedules for date overlap before accepting |
| No vendor responses | Event manager gets nothing | "No matches" email after 48hr with suggestions to broaden criteria |
| Vendor backs out after confirmation | Event manager loses a truck | 72hr cancellation deadline, affects vendor score, auto-notify event manager |
| Day-of support | Nobody to call if truck no-shows | Terms make clear: self-service = no platform support. Upsell to full-service. |
| Post-event feedback | Still valuable for scoring | Keep existing feedback form on event page |

#### Revenue Model:
- Free for event managers (no $75/truck fee)
- Transaction fees on pre-orders (built into Stripe checkout, automatic)
- Upsell path: "Want day-of coordination and vendor guarantees? Upgrade to Full Service."
- Network effect: more trucks + more event managers = more marketplace users

### 14.3 Implementation Phases

**Phase 1 — Form Enhancements (next session):**
- [ ] Form path toggle: self-service vs full-service
- [ ] In-form vendor search/select widget (for "I'll choose" path)
- [ ] Increase catering menu limit from 5 to 7
- [ ] `vendor_preferences` JSONB column on catering_requests

**Phase 2 — Self-Service Pipeline (2 sessions):**
- [ ] Auto-matching trigger on self-service form submission
- [ ] Response threshold cron (48hr or vendor_count responses)
- [ ] Results email template with vendor details
- [ ] Organizer selection page (`/events/[token]/select`)
- [ ] Terms agreement component + legal text
- [ ] Confirmation trigger → event page creation + vendor notification

**Phase 3 — Polish + Safety (1 session):**
- [ ] Vendor date conflict detection (see 14.4 decisions)
- [ ] Vendor cancellation policy + penalties + backup escalation
- [ ] "No vendors found" fallback email
- [ ] QR code generation for event page link
- [ ] Marketing copy templates in confirmation email
- [ ] Post-event feedback collection (already exists, just verify it works for self-service events)
- [ ] Event organizer contact sharing opt-in
- [ ] Vendor → organizer message relay (platform-mediated email)

---

## Part 15: Gap Resolutions — Decisions Made (2026-03-27)

These decisions resolve the gaps identified in Parts 13-14. Each includes rationale and implementation notes.

### 15.1 Multi-Truck Vendor Scheduling

**Decision:** The system already asks vendors during onboarding if they operate more than one truck. Multi-truck vendors are responsible for managing their own scheduling conflicts. For single-truck vendors, the system enforces conflict prevention.

**Implementation:**
- On event acceptance, check if vendor has `multi_truck = true` (or equivalent flag — verify field name in profile_data)
- If single-truck: query `market_vendors` + `market_schedules` for overlapping dates/times. If conflict found, BLOCK acceptance with message: "You already have a commitment on this date. Cancel the existing commitment first, or contact admin for help."
- If multi-truck: allow acceptance, show WARNING: "You have another event on this date. As a multi-truck operator, please ensure you have a truck available for each commitment."
- On acceptance, auto-block the time slot for single-truck vendors (create a schedule entry or flag that prevents other event acceptances for that date/time range)

### 15.2 Event Manager App Accounts

**Decision:** Event managers should create an app account for the best experience, but first engagement can be guest (email-only) to reduce friction.

**Flow:**
- **Initial intake form:** No login required. At form submission, prompt: "Create a free account for the fastest experience — track your event, browse vendors in-app, and get instant notifications" OR "Continue as guest — we'll send updates via email"
- **Secondary stage (truck selection):** Account REQUIRED. If they were a guest, prompt sign-up at this point. Explain: "To select your trucks and manage your event, you'll need a free account. We'll also send you in-app notifications for urgent updates like vendor cancellations."
- **Account type:** Standard buyer account with `event_organizer` flag on user_profiles. This lets them:
  - Browse vendor profiles in-app (filtered for event-eligible)
  - See an "Event Management" card on their buyer dashboard
  - Receive in-app notifications for event updates
  - Place catering orders (cross-sell opportunity)
- **Tagging:** Accounts created from the event intake form get `event_organizer = true` automatically. This flag controls dashboard UI (show event management card).

### 15.3 Vendor Contact Info for Events

**Decision:** During event readiness application, vendors authorize sharing of contact info with event managers AND can provide event-specific contact details (may differ from their account email/phone).

**Implementation:**
- Add to event readiness questionnaire:
  - "If selected for an event, we will share your contact information with the event organizer so they can reach you for logistics. You may provide event-specific contact details below, or we will use your account information."
  - `event_contact_name` (TEXT, defaults to profile business_name)
  - `event_contact_phone` (TEXT, optional but strongly recommended)
  - `event_contact_email` (TEXT, defaults to account email)
  - Checkbox: "I authorize sharing my contact information with event organizers" (REQUIRED for event approval)
- Store in `profile_data.event_readiness.contact_info`
- Share with event organizer ONLY after terms are agreed and trucks are confirmed

### 15.4 Backup Vendor System

**Decision:** When vendors respond to an event invitation, they can indicate willingness to serve as a backup. Event managers rank preferences. If a primary vendor cancels, the platform auto-escalates to the backup.

**Flow:**
1. Invitation includes question: "If you are not selected as a primary vendor, would you be willing to serve as a backup?" (yes/no)
2. Vendor responds: interested (primary) + backup_willing (boolean)
3. Event manager selects their preferred trucks in priority order
4. Non-selected vendors who said backup_willing = true are tagged as backups
5. If a primary vendor cancels (72hr+ before event):
   - System auto-notifies the highest-priority backup
   - Backup has 24 hours to confirm
   - If backup confirms → they become primary, event manager is notified of the swap
   - If backup declines or doesn't respond → next backup is tried, or event manager is notified "no backup available"
6. If cancellation is <72hr before event: admin is notified for manual intervention (even on self-service events — this is an exception)

**New fields on market_vendors:**
- `is_backup` (BOOLEAN DEFAULT false) — vendor is willing to be backup
- `backup_priority` (INTEGER, nullable) — admin/system-assigned priority among backups
- `replaced_vendor_id` (UUID, nullable) — if this vendor replaced a cancelled primary

### 15.5 Catering Menu Requirements

**Decision:** Minimum 4 catering-eligible listings, maximum 7 per event. Enforce at event approval time.

**Implementation:**
- When admin sets `event_approved = true`, check: does vendor have ≥4 published listings with `listing_data.event_menu_item = true`?
- If not: block approval with message: "Vendor needs at least 4 catering menu items to be event-approved. Currently has X."
- At event acceptance: vendor selects 4-7 items (changed from 1-5)
- Vendor browse/profile for event managers should NOT show vendors with <4 catering items (filter them out of event-eligible results)
- Throughput info (`max_headcount_per_wave`) must also be filled in before event approval — already required by readiness questionnaire

### 15.6 Event Manager ↔ Vendor Communication

**Decision:** Two-tiered system based on event manager opt-in.

**Tier 1 — Direct contact (opt-in):**
- During truck selection (secondary form), event manager is asked: "Would you like to share your contact information with your selected vendors? This allows them to reach you directly for logistical questions."
- If yes: provide `organizer_contact_name`, `organizer_contact_phone`, `organizer_contact_email`
- Shared with selected vendors after confirmation
- Note shown to event manager: "If you choose not to share your contact info, vendors can still send you messages through the platform."

**Tier 2 — Platform relay (default):**
- Vendor sees a "Message event organizer" button on their event detail page
- Message is sent as an email to the organizer FROM the platform (not from the vendor's personal email)
- Organizer can reply to the email — reply goes to a platform relay that forwards to the vendor
- This keeps the organizer's email private while enabling communication

**For managed events (full-service):** All communication goes through admin. Neither party gets the other's contact info.

### 15.7 Self-Service Event Expectations

**Decision:** Set clear expectations in the intake form for self-service events.

**Messaging at form submission:**
- "We'll send your invitation to matching food trucks right away."
- "If we don't receive enough interested trucks within 48 hours, we'll notify you with the option to broaden your criteria."
- "We recommend keeping your criteria broad (cuisine types, not specific trucks) to maximize responses."

**Do NOT tell event managers:**
- Exact matching criteria or scoring algorithm
- Number of vendors notified
- Internal scoring thresholds

**DO tell them:**
- Approximate timeline (48hr for responses)
- That broader criteria = more responses
- That we match based on cuisine, capacity, availability, and experience
