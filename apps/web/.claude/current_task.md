# Current Task: Session 71 — Event Feedback Fix + Event-General Rating
Updated: 2026-04-11

## Session kickoff state
- Session 70 (348 commits) pushed to prod this session. Protocol 8 error log
  review showed zero new regressions post-push.
- User reported broken event feedback form on prod: form shows "Missing
  required fields" with no visible fields. Root cause traced to a
  schema mismatch between the form body and the `/api/buyer/feedback`
  endpoint — the form had never successfully saved a single submission
  since Session 62.

## Goal
Fix the broken event feedback form and give it a real destination. Scope
expanded per user direction: also add a separate "How was the event
overall?" rating that goes to the event organizer (moderated first).

## Key design decisions
- **Vendor ratings from events use the existing `order_ratings` flow.**
  Zero schema changes. Event attendees who ordered from a vendor hit
  the same `/api/buyer/orders/[id]/rate` endpoint that regular buyers
  use. One unified star rating per vendor, aggregated by the existing
  `update_vendor_rating_stats` trigger.
- **Event-general rating lives in a new `event_ratings` table.**
  Separate from vendor ratings. Organizer + admin read approved rows.
  Attendees insert with `status='pending'`; admin moderates.
- **Form shows two sections to logged-in users:** Section A (per-vendor
  rating cards, hidden if user has no completed event orders), Section
  B (event-overall rating, always shown when logged in).
- **Not-logged-in state** shows a login prompt with the current event
  URL as the redirect target.
- **Vertical-neutral heading:** "How was your experience?" replaces the
  old FT-centric "How was the food?"
- **Logout friction** (user raised the concern) — not solved this
  session. Backlogged as a magic-link re-auth flow using Supabase
  `admin.generateLink()` bound to post-event notification.
- **Admin moderation UI** — deferred to next session. Pending rows can
  be approved via SQL in the meantime.
- **Organizer dashboard display** — deferred. RLS already allows
  organizers to read approved rows for their own events; UI can be
  built later.

## Files changed
### Database
- `supabase/migrations/20260411_116_event_ratings_table.sql` (NEW,
  PENDING apply)
  - Creates `event_ratings` table: id, catering_request_id (FK→
    catering_requests ON DELETE CASCADE), user_id (FK→auth.users ON
    DELETE CASCADE), rating int2 (CHECK 1-5), comment text, status
    text default 'pending' (CHECK 'pending'/'approved'/'hidden'),
    created_at, updated_at, moderated_at, moderated_by, UNIQUE
    (catering_request_id, user_id)
  - 3 indexes (event, user, status)
  - `update_event_ratings_updated_at` BEFORE UPDATE trigger
  - 5 RLS policies:
    - `users_insert_own_event_rating` — INSERT: `user_id=auth.uid()` +
      event must be in active/review/completed status
    - `users_update_own_event_rating` — UPDATE: own row, pending status
      only (admin-approved rows are locked)
    - `users_read_own_event_rating` — SELECT: own rows, any status
    - `organizer_read_event_ratings` — SELECT: approved rows for
      events where user is `organizer_user_id`
    - `admin_all_event_ratings` — FOR ALL: via `is_platform_admin()`

### API routes (new)
- `apps/web/src/app/api/buyer/events/[token]/rate/route.ts` — POST
  - Auth required, rate-limited (`rateLimits.submit`)
  - Resolves event_token → catering_requests, validates active/review/
    completed status
  - Content moderation on comment
  - Upsert on `(catering_request_id, user_id)` with `status='pending'`
  - Returns 201 with pending status message

- `apps/web/src/app/api/buyer/events/[token]/review-state/route.ts` — GET
  - Auth required, rate-limited (`rateLimits.api`)
  - Returns `{ rateable_orders, event_rating }` for the current user
  - `rateable_orders`: completed orders at the event's market, grouped
    by (order_id, vendor_profile_id), with existing `order_ratings` if
    any (so the form can pre-populate edits)
  - `event_rating`: the user's existing `event_ratings` row (or null)

### Component rewrite
- `apps/web/src/components/events/EventFeedbackForm.tsx`
  - New props: `{ eventToken, vertical, isLoggedIn }` (removed `vendors`)
  - Fetches `/review-state` on mount for logged-in users
  - Three states: not logged in (login prompt), loading, loaded
  - Section A — vendor rating cards that post to existing
    `/api/buyer/orders/[id]/rate`
  - Section B — single event rating card that posts to new
    `/api/buyer/events/[token]/rate`
  - `StarRating` + `VendorRatingCard` + `EventOverallRating` internal
    sub-components
  - Approved event ratings show a locked "✓ Thanks for rating this
    event" state; pending ratings show an edit state

### Page wiring
- `apps/web/src/app/[vertical]/events/[token]/page.tsx`
  - Added `createClient` import alongside `createServiceClient`
  - Server-side auth check (`authClient.auth.getUser()`) to compute
    `isLoggedIn` boolean
  - Changed feedback form render: passes `vertical` + `isLoggedIn`
    instead of `vendors`, and shows for `['active', 'review',
    'completed']` statuses (was `['active', 'review']`)

## Verification
- `npx tsc --noEmit` clean (no errors)
- `npx vitest run` — 51 files / 1472 tests all passing
- No cross-file contract tests affected — `EventFeedbackForm` is not
  referenced by any test file (it's a UI-only component with no
  business rule assertions)

## Deployment sequence
1. Commit migration file on local main (not pushed)
2. Commit code changes on local main
3. User applies migration 116 to **dev** first, verify clean
4. Push local main → staging via branch chain
5. User applies migration 116 to **staging**
6. User tests on staging (log in, visit event, submit vendor rating,
   submit event rating, re-submit to test upsert)
7. User approves migration for **prod**
8. User approves code push to prod (separate approval, after 9pm CT
   window)
9. After prod, update schema snapshot (changelog + regenerate
   structured tables) + move migration 116 to `applied/` + update
   MIGRATION_LOG.md

## Open items (not this session)
- Magic-link re-auth for post-event rating (logout friction fix)
- Admin moderation UI at `/admin/event-ratings`
- Organizer dashboard display for approved event ratings
- Aggregate stats on `catering_requests` (average_rating, rating_count)
  if we want public bragging
- Session 70 `ERR_VENDOR_001` prod verification — re-run Protocol 8
  query tomorrow to confirm no new errors since the push

## Autonomy mode
Report. Every commit/push/migration still requires explicit approval.
