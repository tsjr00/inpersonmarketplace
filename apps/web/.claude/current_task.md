# Current Task: Session 63 (continued)
Started: 2026-03-22, still active as of 2026-03-26

## What's Happening RIGHT NOW

Working on Event System Strengthening (Path A) — see `event_system_deep_dive.md` Part 12.

### Completed This Session (2026-03-26):
- **Unified Documents & Certifications** — new component combining onboarding gate docs + profile certifications into one UI. Badge metadata, edit profile integration, public profile gate doc badges. `DocumentsCertificationsSection.tsx` created. `CertificationsForm.tsx` preserved for rollback.
- **DSHS reference links** — `referenceUrl` field on category requirements. Links to TX DSHS pages for Cottage Food, Temp Food Permits, Meat Safety. Shown in both onboarding checklist and unified docs section.
- **Tutorial 1 rewrite ("Getting Approved")** — 6 slides: preliminary approval, business docs, registrations, COI (soft gate), Stripe Connect, next steps. Header: "Getting Approved".
- **Tutorial 2 ("Your Dashboard")** — NEW. 7 slides: fully approved → how pre-orders work → locations → schedules (FT/FM-specific) → listings (multi-location) → Stripe → recap. Triggered only when `canPublishListings` is satisfied (all gates complete). Tracked via `notification_preferences` JSONB (no migration).
- **Schema snapshot updated** — changelog entries for migrations 096-099.
- **Event system deep dive updated** — Part 12 added: Path A plan with implementation checklist.

### In Progress: Event System Path A
Implementation checklist (from `event_system_deep_dive.md` Part 12.7):

| # | Task | Status |
|---|------|--------|
| 1 | Status documentation comments on event API routes | DONE |
| 2 | Migration 100: new columns on catering_requests | CREATED (not applied) |
| 3 | Update EventRequestForm with new fields | IN PROGRESS |
| 4 | Update event-requests API to accept new fields | NOT STARTED |
| 5 | Create `src/lib/events/viability.ts` scoring functions | DONE |
| 6 | Update admin events page: viability scores display | NOT STARTED |
| 7 | Update admin events page: vendor matching indicators | NOT STARTED |
| 8 | Update admin events page: lifecycle stepper UI | NOT STARTED |
| 9 | Add `event_confirmed` notification type + trigger | NOT STARTED |
| 10 | Update SCHEMA_SNAPSHOT.md after migration | NOT STARTED |

### Files Created/Changed This Session
- `src/components/vendor/DocumentsCertificationsSection.tsx` — NEW
- `src/lib/onboarding/category-requirements.ts` — badge metadata + referenceUrl
- `src/app/[vertical]/vendor/edit/page.tsx` — swap to unified docs component
- `src/app/[vertical]/vendor/[vendorId]/profile/page.tsx` — gate doc badges on public profile
- `src/components/vendor/CategoryDocumentUpload.tsx` — DSHS reference link
- `src/components/onboarding/TutorialModal.tsx` — Tutorial 1 rewrite + Tutorial 2 added
- `src/components/onboarding/TutorialWrapper.tsx` — phase prop support
- `src/app/api/vendor/tutorial/route.ts` — phase 2 tracking via notification_preferences
- `src/app/[vertical]/vendor/dashboard/page.tsx` — Tutorial 2 trigger (canPublishListings check)
- `supabase/SCHEMA_SNAPSHOT.md` — changelog entries 096-099
- `supabase/migrations/20260326_100_event_request_fields.sql` — NEW (not applied)
- `src/lib/events/viability.ts` — NEW (event scoring functions)
- `src/app/api/admin/events/route.ts` — status documentation
- `src/app/api/admin/events/[id]/route.ts` — status documentation
- `.claude/event_system_deep_dive.md` — Part 12 added

### Commits on main (3 ahead of origin/main, pushed to staging):
1. `feat: unified documents & certifications section`
2. `feat: two-phase vendor tutorial + DSHS reference links`
3. `fix: Tutorial 2 requires canPublishListings before launching`

### Key Decisions Made This Session
- Keep existing catering_request statuses (no rename) — add code comments documenting meaning
- Tutorial 2 triggers only when ALL onboarding gates pass (canPublishListings)
- DSHS Temp Food Permit requirement stays — link to state page deflects frustration
- Unified docs component reads both JSONB sources, no data migration
- Event viability scoring: budget/capacity/duration auto-calculated, admin makes final call
- Vendor matching: cuisine/capacity/runtime/rating indicators shown to admin, not automated ranking

### Next Steps (Event Path A remaining)
1. Finish EventRequestForm updates (new fields with conditional visibility)
2. Update event-requests API to accept + validate new fields
3. Apply migration 100 to dev (need user to run SQL)
4. Build admin event detail enhancements (viability scores, vendor matching, lifecycle stepper)
5. Add event_confirmed notification type

### Pending from Prior Work
- Catering minimum enforcement (10 items) — decided but not coded
- Catering advance notice tiers — decided but not coded
- $75/truck fee collection — decided but not coded
- Settlement email trigger to vendors — type exists, trigger not wired
- Wave-based ordering — design only
