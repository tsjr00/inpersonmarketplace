# Session 63 Summary
**Dates:** 2026-03-22 through 2026-03-27 (multi-day session)
**Commits:** 15 on main (all pushed to staging, pending production push after 9PM CT)
**Migrations:** 100-103 applied to all 3 environments

---

## Part 1: Vendor Onboarding Improvements

### Unified Documents & Certifications
**What:** Combined two separate document systems into one UI on the vendor edit profile page.
- System 1: Onboarding gate docs (`vendor_verifications.category_verifications`) — per-category permits with admin review, disappeared after onboarding
- System 2: Profile certifications (`vendor_profiles.certifications`) — voluntary badges (Organic, GAP, etc.), no admin review

**Why:** A vendor uploading a Cottage Food Registration for onboarding compliance should automatically get a badge on their public profile. Previously they'd have to upload the same document twice in two different places.

**How:** Option C architecture — no data migration, no schema changes. New `DocumentsCertificationsSection.tsx` reads both JSONB sources, presents them in one "Required Documents" + "Optional Certifications" interface. Public vendor profile now shows approved gate doc badges alongside voluntary certifications, deduplicated by label. `CertificationsForm.tsx` preserved intact for rollback.

### DSHS Reference Links
**What:** Added `referenceUrl` field to category requirements, linking to TX DSHS permit pages.
**Why:** Vendors frustrated by permit requirements can see the state source directly — deflects frustration from platform to the state regulation.
**Links:** Cottage Food Production, Retail Food Permitting, Meat Safety.

### Two-Phase Vendor Tutorial
**What:** Split the single vendor tutorial into two phases:
- Tutorial 1 ("Getting Approved"): 6 slides — preliminary approval, business docs, registrations, COI (soft gate), Stripe Connect, next steps
- Tutorial 2 ("Your Dashboard"): 7 slides — locations → schedules → listings → Stripe. Teaches the pre-order chain.

**Why:** Tutorial 1 helps new vendors understand the onboarding gates. Tutorial 2 helps fully-onboarded vendors understand how the platform works — specifically that listings + locations + schedules must be connected for buyers to purchase.

**Key design decisions:**
- Tutorial 2 only triggers when `canPublishListings` is satisfied (all gates complete)
- Tutorial 2 tracked via `notification_preferences` JSONB (no migration needed)
- Slide order in Tutorial 2: locations → schedules → listings (dependency chain, not alphabetical)
- FT-specific schedule slide mentions time slots, catering orders, event approval
- FM-specific schedule slide mentions 18hr/10hr cutoff windows
- Used generic "meal/food" language, not "lunch" (works for any time)

---

## Part 2: Event System — Strategic Planning

### Business Context
A local business inquired about food truck events. We needed to assess what was built vs what was missing and close gaps to serve real events.

### Event System Audit Findings
The system had a complete admin-managed flow (intake → approve → invite → respond → event page → settlement) but lacked:
- Viability scoring (is this event realistic?)
- Vendor matching intelligence (which trucks fit best?)
- Self-service option (no-admin crowd events)
- Full lifecycle visibility for admin
- Event manager communication back-channel

### Product Type Analysis
Defined three distinct planning models for five product types:

| Product | Payment | Wave Model | Admin | Platform Fee |
|---------|---------|-----------|-------|-------------|
| A: Company-Paid | Company pays all | Full waves | Required | $75/truck + tx fees |
| B: Employee-Paid | Individual checkout | Optional waves | Required | $75/truck + tx fees |
| C: Crowd Event | Individual checkout | No waves | None (self-service) | Tx fees only |
| D: Paid Crowd | N/A | N/A | N/A | Not pursuing |
| E: Catering Order | Individual checkout | N/A | None | Tx fees only |

**Key insight:** Product B (employee-paid) works end-to-end today. Product C (crowd events) needed the self-service pipeline. Product A needs company invoicing (future).

### Viability Scoring (3 Models)
Created `src/lib/events/viability.ts` with event-type-aware scoring:

**Company-paid:** Wave capacity math (meals ÷ throughput × waves), budget per meal vs platform average ($13.50), duration check. Shows explicit assumptions: "10 waves = 5hr ÷ 30min per wave."

**Attendee-paid:** Buyer rate estimation (60-80% lunch, 30-50% other), orders per truck, revenue opportunity ($300/600 thresholds). No wave math assumed.

**Crowd events:** Foot traffic × buy rate (10-30%, ticketed: 15-40%), "is it worth it?" threshold, dwell time consideration.

All models show assumptions explicitly so admin can see HOW the score was calculated and adjust their judgment.

---

## Part 3: Event System — Implementation (Path A + Self-Service)

### Admin Improvements (Path A)
- **Lifecycle stepper:** Horizontal 7-step progress bar (received → reviewing → approved → confirmed → active → feedback → settled) with current step highlighted, future steps greyed but visible
- **Viability scores:** Budget/capacity/duration with green/yellow/red indicators + assumptions section
- **Vendor matching data:** Avg price per vendor (green/red vs budget target), rating, tier, 15-min lead time badge
- **Wave recommendation:** "15-min waves recommended" when all confirmed vendors support fast service
- **Event confirmed notification:** Email to organizer at 'ready' status with event page link + vendor count
- **Status documentation:** Code comments on all 9 statuses explaining what each means

### Self-Service Automated Pipeline
**Business objective:** Replace Facebook group posts for crowd events. Free for event managers. Platform gains users, trucks, and pre-order transaction fees.

**Full flow built:**
```
1. Organizer submits form (self-service selected)
   → service_level = 'self_service' stored on catering_request

2. Auto-approve: market + token + schedule created immediately
   → No admin review needed for self-service

3. Auto-match: scoreVendorMatch() runs against all event-approved vendors
   → Filters: ≥4 catering items, green/yellow cuisine + capacity match, score ≥2.5
   → Max 15 vendors invited

4. Auto-invite: market_vendors created, notifications sent
   → Vendor sees: city/state (not full address), headcount, cuisine preferences
   → Company name hidden (organizer identity protection)

5. Vendors respond: accept with 4-7 menu items, or decline
   → Conflict detection: single-truck blocked if date overlap, multi-truck warned
   → Instant threshold check: when accepted ≥ requested OR all responded
     → Organizer gets results email IMMEDIATELY (doesn't wait for cron)

6. Cron Phase 12 (safety net): 48hr after invites, sends results if not already sent

7. Organizer clicks "Select Your Trucks" → /events/[token]/select
   → Shows interested vendors: name, cuisine, rating, avg price, catering menu preview
   → Contact sharing opt-in: share name/phone/email with trucks, or use platform relay
   → Terms agreement: platform is facilitator only, not responsible for vendor issues
   → Select up to vendor_count trucks, confirm menu review for each

8. Submit selections → selected vendors confirmed, non-selected marked as backups
   → Organizer gets confirmation email with:
     - QR code (auto-generated via qrcode npm package)
     - Event page link
     - Marketing kit: email template, social media blurb, day-of signage text
     - Tips for maximizing pre-orders

9. Event page live → attendees browse menus + pre-order via normal Stripe checkout
```

### Safety Features
- **Vendor conflict detection:** Single-truck vendors blocked from accepting overlapping events. Multi-truck vendors warned (logged in response_notes for admin visibility). Uses existing `profile_data.multiple_trucks` flag.
- **Backup vendor system:** Non-selected accepted vendors flagged as `is_backup` with priority ordering. Auto-escalated when primary vendor cancels.
- **Vendor cancellation flow:** Requires reason (10+ chars). Notifies admin + organizer (email + in-app). Auto-escalates to backup. Late cancellation (<72hr) flagged for vendor score impact.
- **Organizer identity protection:** Company name never shared with vendors. Full address only after acceptance. Setup instructions only after acceptance.
- **Message relay:** Vendors can message organizer via platform (email relay). Rate limited 5/hour. Organizer email stays private unless they opt in to direct contact.

### Form Enhancements
- **Service level toggle:** Self-Service (Free) vs Full Service (Managed) — first section of form
- **Event type:** 6 options (corporate_lunch, team_building, grand_opening, festival, private_party, other)
- **Payment model:** company_paid, attendee_paid, hybrid (conditional budget fields)
- **Dual budget:** Total OR per-meal (enter one, other greys out)
- **Expected meal count:** Separate from headcount ("not everyone orders")
- **Competing food:** "Are there other food options at the venue?"
- **Ticketed event:** Boolean flag (scores higher — access to attendee inbox)
- **Dwell time:** For crowd events (affects purchase likelihood)
- **Beverages/dessert provided:** Menu planning flags
- **Recurring event:** Boolean + frequency (weekly/biweekly/monthly/quarterly)
- **Vendor search/select:** Type-ahead search within form for "I'll choose" path. Shows name, cuisine, rating, avg price. Priority-ordered list (1-10 max).

---

## Part 4: Infrastructure & Rules

### Vercel Authentication
- Enabled on staging to prevent outsiders from accessing staging URLs
- Triggered by a real vendor signing up on staging instead of production

### Production Push Window
- **Rule:** No production pushes between 7:00 AM and 9:00 PM CT
- **Reason:** Minimize risk of disrupting active user sessions
- **Exception:** Emergency hotfixes only
- Added to both project CLAUDE.md and global rules

### Stripe Webhook Fix
- Production webhook returning 307 (redirect) because `farmersmarketing.app` redirected to `www.farmersmarketing.app`
- Fixed by making non-www the primary domain in Vercel
- Events affected: `account.updated` only (informational, no payments lost)
- Supabase auth URLs already matched non-www (no change needed)

---

## Migrations Applied

| # | Migration | What |
|---|-----------|------|
| 100 | event_request_fields | event_type, payment_model, total_food_budget_cents, expected_meal_count, beverages/dessert_provided, is_recurring, recurring_frequency |
| 101 | event_form_fields_v2 | per_meal_budget_cents, competing_food_options, is_ticketed, estimated_dwell_hours |
| 102 | self_service_events | service_level, auto_invite_sent_at, organizer_user_id, vendor_preferences |
| 103 | event_backup_vendors | market_vendors: is_backup, backup_priority, replaced_vendor_id |

---

## Files Created This Session

### New Files
- `src/components/vendor/DocumentsCertificationsSection.tsx` — unified docs UI
- `src/lib/events/viability.ts` — event-type-aware scoring (3 models)
- `src/lib/events/event-actions.ts` — shared approval + auto-invite logic
- `src/app/api/event-approved-vendors/route.ts` — public vendor search for form
- `src/app/api/events/[token]/select/route.ts` — organizer selection API (GET + POST)
- `src/app/events/[token]/select/page.tsx` — organizer truck selection page
- `src/app/api/vendor/events/[marketId]/cancel/route.ts` — vendor cancellation flow
- `src/app/api/vendor/events/[marketId]/message/route.ts` — platform message relay

### Major Modifications
- `src/components/events/EventRequestForm.tsx` — service level toggle, vendor search widget, 12+ new form fields
- `src/app/api/event-requests/route.ts` — self-service auto-flow (approve + match + invite)
- `src/app/api/vendor/events/[marketId]/respond/route.ts` — conflict detection, 4-7 menu limit, instant threshold notification
- `src/app/[vertical]/admin/events/page.tsx` — lifecycle stepper, viability scores, vendor pricing match
- `src/app/api/admin/events/[id]/route.ts` — status docs, event_confirmed notification, ready/active/review statuses
- `src/app/api/cron/expire-orders/route.ts` — Phase 12 (self-service response threshold)
- `src/components/onboarding/TutorialModal.tsx` — Tutorial 1 rewrite + Tutorial 2 new
- `src/lib/onboarding/category-requirements.ts` — badge metadata + referenceUrl
- `src/lib/notifications/types.ts` — event_confirmed type added

---

## Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Keep existing catering_request statuses | Avoid migration risk; add code comments instead |
| Self-service events are free | User acquisition play, not revenue — tx fees only |
| 4 min / 7 max catering items per event | Enough variety for attendees, focused enough for prep |
| Organizer identity hidden from vendors | Prevent direct solicitation outside platform |
| Full address only after vendor accepts | Give vendors enough info to decide (city/state) but protect venue details |
| 48hr response window with instant threshold | Don't make organizers wait if vendors respond quickly |
| Single-truck vendors blocked on conflict | Prevent double-booking; multi-truck vendors warned only |
| Contact sharing is opt-in | Organizer controls whether vendors can reach them directly |
| Message relay as default communication | Keeps organizer email private, still enables logistics questions |
| Production pushes 9PM-7AM CT only | Minimize disruption to active users |
| Non-www as primary domain | Matches Stripe webhook URL, avoids 307 redirects |

---

## What's Ready for Production

All 15 commits are on staging. After 9 PM CT, push to production. This includes:
- Unified docs & certifications
- Two-phase vendor tutorials
- Complete self-service event system
- Admin event management improvements
- Vendor conflict detection + backup system
- QR code + marketing kit emails
- Production push window rule

## What's NOT Built Yet (Future Sessions)

- Wave-based ordering for corporate events
- $75/truck fee collection mechanism
- Company invoicing for Product A events
- Catering minimum enforcement (10 items) at checkout
- Event manager account creation flow (tagged as event_organizer)
- Vendor event readiness contact info fields
- Post-event vendor feedback survey
- Event schedule analysis tools
- Organizer reputation scoring
- Corporate account dashboard
