# Current Task: Session 52 (continued) — Pop-Up Markets + Private Events Extension

Started: 2026-03-07 | Continued: 2026-03-08

## Session Goal
Extend the FT "Corporate Catering" system to support both verticals:
- **FT**: Rebranded to "Private Events" (from "Corporate Catering")
- **FM**: "Pop-Up Markets" — same infrastructure, different copy
- **`is_private`** flag on markets — private events hidden from browse, shared by URL
- **Share button** on event market pages
- **Repeat event creation** for both verticals
- **Post-event feedback** notification to buyers

## Approach: Extend, Not Fork
Same `catering_requests` table (already has `vertical_id`), same routes, same admin pages. Changes are primarily:
1. Remove FT-hardcoded strings, use `term()` terminology system
2. Add `is_private` column to markets
3. Add share button, repeat event API, feedback notification

## Plan File
Full approved plan at: `C:\Users\tracy\.claude\plans\ticklish-jumping-spark.md`

## Git State — ALL CHANGES UNCOMMITTED
- Branch: main, 14 commits ahead of origin/main
- Staging synced through `885eb54` (settlement report commit)
- Latest commit: `885eb54` — settlement report (pushed to staging)
- **ALL pop-up/private events work below is UNCOMMITTED**

## Build Items — Status

### COMPLETED (Items 1-12 of 14)

- [x] **1. Migration 072**: `supabase/migrations/20260308_072_add_markets_is_private.sql`
  - Adds `is_private BOOLEAN DEFAULT false` to markets
  - Backfills `is_private = true` for existing catering event markets
  - Partial index on `is_private WHERE true`
  - **NOT YET APPLIED** — migration file created, needs to be run in all 3 envs

- [x] **2. Terminology keys**: 9 new keys added to `TerminologyKey` type + both vertical configs
  - Files: `src/lib/vertical/types.ts`, `configs/food-trucks.ts`, `configs/farmers-market.ts`
  - Keys: `event_feature_name`, `event_request_heading`, `event_vendor_count_label`, `event_vendor_unit`, `event_preference_label`, `event_preference_placeholder`, `event_hero_subtitle`, `event_submit_button`, `event_success_message`

- [x] **3. API fix**: `src/app/api/catering-requests/route.ts`
  - Accepts `vertical` from request body, validates against allowlist
  - Replaced hardcoded `vertical_id: 'food_trucks'` with `verticalId`
  - Admin email now vertical-aware (sender name, domain, accent color, request type label)

- [x] **4. Form fix**: `src/components/catering/CateringRequestForm.tsx`
  - Sends `vertical` in POST body
  - Uses `term()` for: vendor count label, vendor unit, preference label, preference placeholder, submit button, success message
  - Setup instructions placeholder vertical-aware

- [x] **5. Public page copy**: `src/app/[vertical]/catering/page.tsx`
  - Hero title: `term(vertical, 'event_feature_name')`
  - Hero subtitle: `term(vertical, 'event_hero_subtitle')`
  - Request heading: `term(vertical, 'event_request_heading')`
  - How It Works steps: FT keeps pre-order/pickup language, FM uses browse-and-buy language
  - Value props: FT keeps catering props, FM gets Fresh & Local / Browse & Buy / Curated / Community

- [x] **6. Admin approve**: `src/app/api/admin/catering/[id]/route.ts`
  - Market name: `${company_name} Private Event` (FT) or `${company_name} Pop-Up Market` (FM)
  - `is_private: true` added to market insert
  - Added `sendNotification` import
  - Added `sendEventFeedbackNotifications()` function — triggered when status → 'completed'
  - Queries unique buyer_user_ids from order_items, sends `event_feedback_request` to each

- [x] **7. Browse filter**: `src/app/[vertical]/markets/page.tsx`
  - Added `.or('is_private.eq.false,is_private.is.null')` to events query
  - Private events hidden from public browse, still accessible by direct URL

- [x] **8. Navigation**:
  - `src/components/layout/Header.tsx`: Both "Corporate Catering" occurrences → `term(vertical, 'event_feature_name')` (term already imported)
  - `src/components/shared/Footer.tsx`: Added `vertical` prop, uses `term()` for label, dynamic href
  - `src/components/admin/AdminNav.tsx`: "Catering" label → `term(vertical!, 'event_feature_name')`

- [x] **9. Admin page labels**: `src/app/[vertical]/admin/catering/page.tsx`
  - "Corporate Catering" h1 → `term(vertical, 'event_feature_name')`
  - "Trucks Requested" → `term(vertical, 'event_vendor_unit')s Requested`
  - Empty state text → vertical-aware
  - Added `term` import

- [x] **10. Notification messages**: `src/lib/notifications/types.ts`
  - `catering_request_received`: title + message now vertical-aware (FM: "Pop-Up Market Request")
  - `catering_vendor_invited`: title + message now vertical-aware (FM: "vendors" not "food trucks")
  - `catering_vendor_responded`: title updated to "Event Invite"
  - NEW: `event_feedback_request` type added (audience: buyer, links to orders page)

- [x] **11. Vendor detail page**: `src/app/[vertical]/vendor/catering/[marketId]/page.tsx`
  - "Catering Event" badge → `term(vertical, 'event_feature_name')`
  - "trucks" in headcount → `term(vertical, 'event_vendor_unit')s`
  - Added `term` import

- [x] **12. Share button**: `src/app/[vertical]/markets/[id]/page.tsx`
  - Added `ShareButton` import
  - Renders compact share button for events (all events, including private — they're meant to be shared by URL)
  - Share text includes event date

### COMPLETED (Item 13)
- [x] **13. Repeat event API**: `src/app/api/admin/catering/[id]/repeat/route.ts` — NEW FILE
  - POST endpoint, admin auth + rate limiting
  - Copies company info, address, preferences, headcount, vendor_count from original
  - New dates from request body, status = 'new' (admin reviews before approving)
  - Admin notes: "Repeated from request {original.id}"

### NOT YET DONE (Item 13 UI + Item 14 already done via code)
- [ ] **13b. Repeat event UI**: Admin catering page needs "Repeat Event" button + inline date form
  - Button should show on approved/completed requests
  - Inline form: event_date (required), event_end_date, start_time, end_time
  - On submit → POST to `/api/admin/catering/${id}/repeat` → refresh list

- [x] **14. Post-event feedback**: DONE — trigger added to admin catering PATCH route (item 6 above)

## Files Modified (All Uncommitted)

### NEW FILES (3)
1. `supabase/migrations/20260308_072_add_markets_is_private.sql`
2. `src/app/api/admin/catering/[id]/repeat/route.ts`
3. `apps/web/.claude/current_task.md` (this file)

### MODIFIED FILES (14)
1. `src/lib/vertical/types.ts` — 9 new TerminologyKey entries
2. `src/lib/vertical/configs/food-trucks.ts` — FT event terminology values
3. `src/lib/vertical/configs/farmers-market.ts` — FM event terminology values
4. `src/app/api/catering-requests/route.ts` — accept vertical, vertical-aware email
5. `src/components/catering/CateringRequestForm.tsx` — send vertical, use term()
6. `src/app/[vertical]/catering/page.tsx` — vertical-aware hero/copy/steps/props
7. `src/app/api/admin/catering/[id]/route.ts` — market name, is_private, feedback notif
8. `src/app/[vertical]/markets/page.tsx` — filter private events from browse
9. `src/components/layout/Header.tsx` — term() for nav label
10. `src/components/shared/Footer.tsx` — accept vertical prop, term() for label
11. `src/components/admin/AdminNav.tsx` — term() for nav label
12. `src/app/[vertical]/admin/catering/page.tsx` — vertical-aware labels
13. `src/lib/notifications/types.ts` — vertical-aware messages + event_feedback_request
14. `src/app/[vertical]/vendor/catering/[marketId]/page.tsx` — vertical-aware labels
15. `src/app/[vertical]/markets/[id]/page.tsx` — share button for events

## What Still Needs to Be Done

1. **Repeat event UI** (Item 13b) — "Repeat Event" button + inline date form on admin catering page
2. **Type check** — `npx tsc --noEmit` — not yet run on these changes
3. **Lint** — `npm run lint` — not yet run
4. **Commit** — all changes uncommitted
5. **Migration 072** — needs to be applied to Dev, Staging, Prod
6. **Schema snapshot** — needs update after migration applied
7. **Push to staging** — after commit

## Key Decisions Made
- **Extend not fork**: Same `catering_requests` table, same routes, vertical-aware UI via `term()`
- **`is_private` default false**: Existing markets stay public. Catering/popup events set `is_private: true` on creation
- **Repeat event creates status='new'**: Admin reviews before approving (may want different vendors/headcount)
- **Post-event feedback triggered on status→completed**: Simpler than cron, admin explicitly closes event
- **Footer accepts optional `vertical` prop**: Renders correctly with or without it
- **FM pop-ups: no time slot language**: "Browse & Buy" model, not meal pickup windows
- **Private events still accessible by direct URL**: Hidden from browse, but shareable

## Previous Session Work (Session 52, 2026-03-07) — COMPLETE
- Settlement report API + page committed as `885eb54`, pushed to staging
- Corporate catering Phase 1 (items 1-10) all committed
- Migrations 070+071 applied to all 3 environments
- See plan file for full Phase 1/1.5 documentation
