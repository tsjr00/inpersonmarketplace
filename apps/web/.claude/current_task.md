# Current Task: Session 63 (continued)
Started: 2026-03-22, still active as of 2026-03-27

## What's Happening RIGHT NOW

Event system strategic planning complete. Implementation of Path A done. Waiting for vendor signup on production.

### Completed This Session (2026-03-26 — 2026-03-27):

**Vendor Onboarding:**
- Unified Documents & Certifications — combined gate docs + profile certs UI
- DSHS reference links on category requirements
- Tutorial 1 rewrite ("Getting Approved" — 6 slides)
- Tutorial 2 new ("Your Dashboard" — 7 slides, locations → schedules → listings → Stripe)
- Tutorial 2 gate: only shows when canPublishListings satisfied
- Schema snapshot updated for migrations 096-099

**Event System Path A (implemented):**
- Migration 100: event_type, payment_model, budget, meal count, beverages/dessert, recurring fields
- Migration 101: per_meal_budget, competing_food, is_ticketed, estimated_dwell_hours
- Event-type-aware viability scoring v2 (3 models: company_paid, attendee_paid, crowd)
- Dual budget fields (total OR per-meal, auto-calculate)
- Admin lifecycle stepper (7-step visual workflow)
- Admin viability scores with explicit assumptions shown
- Revenue opportunity per truck (Products B & C)
- Vendor pricing match (avg listing price vs budget target)
- Wave duration flexibility (15-min recommendation)
- Organizer identity protection (company_name hidden, address after acceptance only)
- Event confirmed notification (email to organizer at ready status)
- Notification type count 51 → 52

**Event System Strategic Planning (documented, not coded):**
- Part 13: Refined product type analysis (A/B/C models with detailed characteristics)
- Part 14: Event manager direct truck selection + self-service crowd events
- Part 15: Gap resolutions — multi-truck scheduling, event manager accounts, vendor contact auth, backup vendor system, catering menu 4-7 limit, communication tiers

**Infrastructure:**
- Vercel Authentication enabled on staging (blocks outsiders)
- Real vendor signup redirected from staging to production

### Commits on main (7 ahead of origin/main, all pushed to staging):
1. feat: unified documents & certifications section
2. feat: two-phase vendor tutorial + DSHS reference links
3. fix: Tutorial 2 requires canPublishListings before launching
4. feat: event system Path A — form fields, viability scoring, lifecycle UI
5. feat: event-type-aware viability scoring + refined form fields
6. feat: vendor pricing match, wave flexibility, organizer identity protection
7. docs: event deep dive Parts 14-15 — self-service events + gap resolutions

### Migrations Applied (all 3 environments):
- 100: event request fields (8 columns on catering_requests)
- 101: event form fields v2 (4 more columns on catering_requests)

### Key Decisions This Session
- Keep existing catering_request statuses (no rename) — add code comments
- Tutorial 2 triggers only when ALL onboarding gates pass
- DSHS Temp Food Permit requirement stays — link to state page
- Event viability: 3 scoring models by product type
- Organizer identity hidden from vendors (company_name never shared)
- Full address only after vendor accepts invitation
- 15-min wave recommendation when all vendors support it
- Catering menu: 4 minimum, 7 maximum per event
- Self-service crowd events: free tier, no admin, transaction fees only
- Event managers should create app accounts (guest first, required for selection)
- Vendor event contact info: authorization + custom fields in readiness questionnaire
- Backup vendor system with auto-escalation on cancellation
- Two-tier communication: direct contact (opt-in) or platform relay (default)

### NOT Pushed to Production Yet
All 7 commits on staging need production push after verification.

### Next Steps (Event Implementation)
Phase 1 (next session):
- Form path toggle: self-service vs full-service
- In-form vendor search/select widget
- Increase catering menu limit 5 → 7 (floor: 4)
- vendor_preferences JSONB column

Phase 2 (2 sessions):
- Auto-matching trigger on self-service submission
- Response threshold cron (48hr)
- Organizer selection page
- Terms agreement
- Event manager account flow

Phase 3 (1 session):
- Vendor date conflict detection
- Backup vendor escalation
- QR code generation
- Marketing templates
- Contact sharing opt-in + message relay
