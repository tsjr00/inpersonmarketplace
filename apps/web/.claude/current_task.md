# Current Task: Session 52 — Corporate Catering Phase 1 Build

Started: 2026-03-07

## Session Summary So Far
- [x] Share menu overflow fix (`63c1ffb`) — PUSHED TO PROD
- [x] Help search widget + help page search (`d96e0ac`) — pushed to staging
- [x] Migration 069: 6 stale help articles (`6ffed30`) — pushed to staging
- [x] Migration 069 applied, schema/log updated (`c7607e3`) — pushed to staging
- [x] Schedule bug RESOLVED: migrations 039/040/047/066/067 applied to prod manually
- [x] Documentation commit (`327deae`) — pushed to staging
- [x] Corporate catering plan approved — persistent guide at `apps/web/.claude/corporate_catering_plan.md`

## Git State
- Branch: main, 5 commits ahead of origin/main
- Staging synced with main

## Corporate Catering Phase 1 — Implementation Tracker

**Full plan:** `apps/web/.claude/corporate_catering_plan.md`

### Build Order (smallest first to avoid mid-task cutoff)

- [ ] **1. Migration file** — `catering_requests` table + new columns on `markets` and `market_vendors`
- [ ] **2. Notification types** — Add 3 types to `src/lib/notifications/types.ts`
- [ ] **3. Public catering request API** — `src/app/api/catering-requests/route.ts` (follows vendor-leads pattern)
- [ ] **4. Public catering page** — `src/app/[vertical]/catering/page.tsx` (form + marketing)
- [ ] **5. Admin catering API routes** — GET list + PATCH update/approve + POST invite
- [ ] **6. Admin catering page** — `src/app/[vertical]/admin/catering/page.tsx` (biggest piece)
- [ ] **7. Vendor respond API** — `src/app/api/vendor/catering/[marketId]/respond/route.ts`
- [ ] **8. Vendor catering detail page** — `src/app/[vertical]/vendor/catering/[marketId]/page.tsx`
- [ ] **9. Modified files** — Dashboard card, AdminNav, market badges, header nav
- [ ] **10. Type check + commit**

### Key Patterns to Follow
- **Public form API:** `src/app/api/vendor-leads/route.ts` — service client, rate-limited, no auth
- **Admin API:** `src/app/api/admin/markets/route.ts` — admin role check, service client
- **Support page form:** `src/app/[vertical]/support/page.tsx` — public form with categories
- **Notification types:** `src/lib/notifications/types.ts` — union type + NOTIFICATION_REGISTRY
- **Admin nav:** `src/components/admin/AdminNav.tsx` — nav items array

### Database Schema (Migration)
```sql
-- New table
catering_requests (id, vertical_id, status, company_name, contact_name, contact_email,
  contact_phone, event_date, event_end_date, event_start_time, event_end_time,
  headcount, address, city, state, zip, cuisine_preferences, dietary_notes,
  budget_notes, vendor_count, setup_instructions, additional_notes,
  market_id FK→markets, admin_notes, created_at, updated_at)

-- New columns
markets: + catering_request_id UUID FK→catering_requests, + headcount INTEGER
market_vendors: + response_status TEXT, + response_notes TEXT, + invited_at TIMESTAMPTZ
```

### Notification Types to Add
- `catering_request_received` (admin, standard urgency)
- `catering_vendor_invited` (vendor, standard urgency)
- `catering_vendor_responded` (admin, standard urgency)
- Template data: companyName, headcount, eventDate, address (add to NotificationTemplateData)

### Files to Create
1. `supabase/migrations/20260307_070_corporate_catering.sql`
2. `src/app/api/catering-requests/route.ts`
3. `src/app/[vertical]/catering/page.tsx`
4. `src/app/api/admin/catering/route.ts`
5. `src/app/api/admin/catering/[id]/route.ts`
6. `src/app/api/admin/catering/[id]/invite/route.ts`
7. `src/app/[vertical]/admin/catering/page.tsx`
8. `src/app/api/vendor/catering/[marketId]/respond/route.ts`
9. `src/app/[vertical]/vendor/catering/[marketId]/page.tsx`

### Files to Modify
1. `src/lib/notifications/types.ts` — 3 new types
2. `src/app/[vertical]/dashboard/page.tsx` — catering invitation card
3. `src/components/admin/AdminNav.tsx` — "Catering" nav item
4. `src/app/[vertical]/markets/[id]/page.tsx` — headcount badge
5. Header/layout nav — "Catering" public link
