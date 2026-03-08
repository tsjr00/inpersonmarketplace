# Current Task: Session 52 — Help Search Widget, Share Fix, Article Audit, Schedule Bug

Started: 2026-03-07

## All Commits This Session (4 on main, 3 ahead of origin/main)
1. `63c1ffb` — Fix share menu overflowing right edge of screen (right:0 instead of left:0) — PUSHED TO PROD
2. `d96e0ac` — Add searchable help widget to dashboard + help page search — pushed to staging
3. `6ffed30` — Migration 069: Fix 6 stale help articles (payment methods, fees, tips, min order, FM/FT plan pricing) — pushed to staging
4. `c7607e3` — Migration 069 applied: move to applied/, update schema snapshot + log — NOT pushed yet

## What's Fully Complete
- [x] Share menu fix: dropdown anchors right instead of left (affects vendor profile + listing detail)
- [x] Help search widget: `src/components/help/HelpSearchWidget.tsx` — dashboard card with inline search, dropdown results, links to Help/Setup/Support
- [x] Help article list: `src/components/help/HelpArticleList.tsx` — searchable article view for help page with ?q= and ?article= params
- [x] Dashboard: all 3 Help & FAQ static link cards replaced with HelpSearchWidget (shopper line 577, approved vendor line 843, pending vendor line 993)
- [x] Help page: accepts ?q= and ?article= search params, uses HelpArticleList client component
- [x] Migration 069: Updated 6 stale knowledge_articles — payment methods (added Venmo/CashApp/PayPal/Cash), service fees (6.5%+$0.15), tips (displaySubtotal), min order ($10 FM/$5 FT), FM plans (added pricing), FT plans (Pro $30→$25 fix)
- [x] Migration 069 applied to all 3 envs, moved to applied/, schema snapshot + migration log updated

## RESOLVED — Vendor Profile Weekly Schedule Missing on Prod

### Root Cause
Migrations 039 (`add_event_market_type`) and 040 (`event_availability_function`) were **never applied to prod** despite being logged as applied. Migration 039 adds `event_start_date` and `event_end_date` columns to the `markets` table. The profile page query (line 218-235) selects these columns via PostgREST nested join. PostgREST returns an error when selecting nonexistent columns, but the code doesn't check for errors (`const { data } = ...`), so `data` is `null`, the schedule-building logic is entirely skipped, and `PickupScheduleGrid` never renders.

### What Was Applied to Prod (2026-03-07)
1. **Migration 039** — `event_start_date`, `event_end_date`, `event_url` columns + event market_type CHECK constraint + event dates index
2. **Migration 040** — Updated `get_available_pickup_dates()` function with event support
3. **Migration 047** — `vendor_quality_scan_log` + `vendor_quality_findings` tables + RLS
4. **Migration 066** — `check_vendor_schedule_conflict()` trigger on vendor_market_schedules
5. **Migration 067** — `get_listings_accepting_status()` batch availability function

### How It Was Found
- Schedule showed on staging but NOT prod → same code, different DB state
- All data verified correct via SQL editor (admin role) — listings, listing_markets, markets, schedules all present
- RLS policies compared between staging and prod — identical
- Checked `information_schema.columns` for `event_start_date` and `event_end_date` on prod → only `expires_at` existed, the other two were missing
- Confirmed: PostgREST fails silently when asked to select nonexistent columns through nested joins

### Lesson Learned
- Migration log is NOT reliable for prod status — it only has Dev/Staging columns
- "Applied to all 3 envs" notes were wrong for 5 migrations (039, 040, 047, 066, 067)
- Need a Prod column in migration log OR a verification script to check prod schema

## Git State
- Branch: main, 3 commits ahead of origin/main
- Staging is synced with main
- No uncommitted changes (migration log update not committed yet)
- Session 51 commits (875ebd8 and earlier) already pushed to prod

## Key Files This Session
- `src/components/marketing/ShareButton.tsx` — share menu anchor fix (right:0)
- `src/components/help/HelpSearchWidget.tsx` — NEW dashboard search card
- `src/components/help/HelpArticleList.tsx` — NEW help page searchable list
- `src/app/[vertical]/dashboard/page.tsx` — 3 Help cards → HelpSearchWidget
- `src/app/[vertical]/help/page.tsx` — accepts ?q= and ?article= params
- `supabase/migrations/applied/20260307_069_update_stale_help_articles.sql` — content fixes
- `supabase/migrations/MIGRATION_LOG.md` — corrected prod status for 039/040/047/066/067
